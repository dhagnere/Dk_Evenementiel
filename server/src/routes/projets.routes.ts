import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { clauseSet, executer, insererUn, requete, requeteUne, transaction, type NomTable } from '../db.js';
import { peut, requireModule } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { queryString } from '../lib/queryString.js';
import { envoyerEmail } from '../lib/email.js';
import { config } from '../config.js';
import { enregistrerFichier, stockageActif } from '../lib/stockage.js';
import type { Niveau } from '../lib/droits.js';
import {
  CODES_TYPES,
  DELAI_INSCRIPTION_JOURS,
  JALONS,
  TYPES,
  conflitsMateriel,
  ecrireModeles,
  genererDepuisModeles,
  indicateursProjets,
  lireModeles,
  schemaModeles,
} from '../lib/projets.js';

export const projetsRouter = Router();

const lecture = requireModule('projets', 'lecture');
const contribution = requireModule('projets', 'contribution');
const validation = requireModule('projets', 'validation');
const administration = requireModule('projets', 'administration');

class ErreurMetier extends Error {}

function traiter(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      if (err instanceof ErreurMetier) res.json({ ok: false, message: err.message });
      else next(err);
    });
  };
}

function invalide(res: Response, message = 'Données invalides'): void {
  res.status(400).json({ ok: false, message });
}

const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const texte = (max = 300) => z.string().trim().max(max);
const PIECES = [
  ['devis', 'Devis signé'],
  ['assurance', "Attestation d'assurance"],
  ['urssaf', 'Attestation URSSAF / Kbis'],
  ['conformite', 'Certificats de conformité'],
] as const;

/** Le projet existe-t-il ? Sinon 404. */
async function projetExiste(id: string, res: Response): Promise<boolean> {
  if (await requeteUne('SELECT 1 FROM projets WHERE id = $1', [id])) return true;
  res.status(404).json({ ok: false, message: 'Projet introuvable' });
  return false;
}

// --- Référentiels et modèles ---------------------------------------------------------------------

projetsRouter.get(
  '/referentiels',
  lecture,
  traiter(async (_req, res) => {
    const modeles = await lireModeles();
    res.json({
      jalons: JALONS,
      types: Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [k, v.libelle])),
      branches: modeles.branches,
      budgetPostes: modeles.budgetPostes,
      pieces: PIECES.map(([code, libelle]) => ({ code, libelle })),
      delaiInscriptionJours: DELAI_INSCRIPTION_JOURS,
      stockageActif: stockageActif(),
    });
  })
);

projetsRouter.get(
  '/modeles',
  administration,
  traiter(async (_req, res) => {
    res.json({ modeles: await lireModeles() });
  })
);

projetsRouter.put(
  '/modeles',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaModeles.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    await ecrireModeles(parsed.data);
    await consigner(identiteDeRequete(req), 'projets_modeles', '', {
      taches: parsed.data.taches.length,
      demarches: parsed.data.reglementaire.length,
    });
    res.json({ ok: true, message: 'Modèles enregistrés. Ils s’appliquent aux nouveaux projets.' });
  })
);

// --- Matériel logistique -------------------------------------------------------------------------

/** Catalogue du matériel, avec le pic d'utilisation sur les projets à venir. */
projetsRouter.get(
  '/materiel',
  lecture,
  traiter(async (_req, res) => {
    const articles = await requete(
      `WITH res AS (
         SELECT m.article_id, m.quantite, p.date_jour - 1 AS debut, COALESCE(p.date_fin, p.date_jour) + 1 AS fin
           FROM projet_materiel m JOIN projets p ON p.id = m.projet_id
          WHERE m.quantite > 0 AND p.statut <> 'annule' AND COALESCE(p.date_fin, p.date_jour) >= CURRENT_DATE
       ), pics AS (
         SELECT a.article_id, max((SELECT sum(b.quantite) FROM res b WHERE b.article_id = a.article_id AND b.debut <= a.fin AND a.debut <= b.fin)) AS pic
           FROM res a GROUP BY a.article_id
       )
       SELECT art.*, COALESCE(pics.pic, 0) AS pic FROM materiel_articles art LEFT JOIN pics ON pics.article_id = art.id
        ORDER BY art.actif DESC, art.code NULLS LAST, art.nom`
    );
    res.json({ articles });
  })
);

const schemaArticle = z.object({
  nom: texte(200).min(1),
  unite: texte(20).min(1),
  total: z.number().int().min(0).max(1_000_000),
  actif: z.boolean().default(true),
});

projetsRouter.post(
  '/materiel',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaArticle.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    await insererUn('materiel_articles', parsed.data);
    await consigner(identiteDeRequete(req), 'projets_creation_materiel', parsed.data.nom);
    res.json({ ok: true, message: 'Article ajouté' });
  })
);

projetsRouter.put(
  '/materiel/:id',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaArticle.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { texte: set, params } = clauseSet('materiel_articles', parsed.data, 2);
    if ((await executer(`UPDATE materiel_articles SET ${set} WHERE id = $1`, [req.params.id, ...params])) === 0) {
      return void res.status(404).json({ ok: false, message: 'Article introuvable' });
    }
    res.json({ ok: true, message: 'Article mis à jour' });
  })
);

// --- Tableau de bord -----------------------------------------------------------------------------

projetsRouter.get(
  '/tableau-de-bord',
  lecture,
  traiter(async (req, res) => {
    const actifs = await indicateursProjets(
      "p.statut IN ('preparation', 'realise') AND COALESCE(p.date_fin, p.date_jour) >= CURRENT_DATE - 7"
    );
    const echeances = await requete(
      `SELECT t.id, t.libelle, t.branche, p.date_jour + t.decalage AS echeance, p.id AS projet_id, p.titre
         FROM projet_taches t JOIN projets p ON p.id = t.projet_id
        WHERE NOT t.fait AND p.statut IN ('preparation', 'realise')
          AND COALESCE(p.date_fin, p.date_jour) >= CURRENT_DATE - 7
          AND p.date_jour + t.decalage <= CURRENT_DATE + 14
        ORDER BY echeance, p.titre LIMIT 50`
    );
    const calendrier = await requete(
      `SELECT id, titre, type, date_jour FROM projets
        WHERE statut <> 'annule' AND date_jour >= date_trunc('month', CURRENT_DATE)
          AND date_jour < date_trunc('month', CURRENT_DATE) + interval '12 months'
        ORDER BY date_jour`
    );
    const [{ demandes }] = await requete<{ demandes: number }>(
      "SELECT count(*) AS demandes FROM projet_demandes WHERE statut IN ('nouvelle', 'instruction')"
    );
    res.json({
      actifs,
      echeances,
      calendrier,
      conflits: await conflitsMateriel(),
      demandesAInstruire: peut(req.session, 'projets', 'validation') ? demandes : null,
    });
  })
);

// --- Projets -------------------------------------------------------------------------------------

projetsRouter.get(
  '/',
  lecture,
  traiter(async (req, res) => {
    const filtre = queryString(req.query.filtre) ?? 'actifs';
    const condition =
      filtre === 'tous' ? 'TRUE' : filtre === 'archives' ? "p.statut IN ('cloture', 'annule')" : "p.statut IN ('preparation', 'realise')";
    res.json({ projets: await indicateursProjets(condition) });
  })
);

const schemaInfos = z.object({
  titre: texte(300).min(1),
  type: z.enum(CODES_TYPES),
  dateJour: jour,
  dateFin: jour.nullable().default(null),
  lieu: texte().default(''),
  jauge: z.number().int().min(0).max(10_000_000).nullable().default(null),
  referent: texte().default(''),
  demandeur: texte().default(''),
  description: texte(5000).default(''),
});

/** Crée un projet et génère son rétroplanning depuis les modèles de son type. */
async function creerProjet(donnees: z.infer<typeof schemaInfos> & { inscritLe?: string; demandeId?: string }) {
  if (donnees.dateFin && donnees.dateFin < donnees.dateJour) throw new ErreurMetier('La date de fin précède le jour J');
  return transaction(async (client) => {
    const projet = await insererUn<{ _id: string; titre: string }>('projets', donnees, client);
    await genererDepuisModeles(projet._id, donnees.type, client);
    return projet;
  });
}

projetsRouter.post(
  '/',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaInfos.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const projet = await creerProjet(parsed.data);
    await consigner(identiteDeRequete(req), 'projets_creation', projet.titre);
    res.json({ ok: true, message: 'Projet créé, rétroplanning généré', projet });
  })
);

/** Fiche complète d'un projet. */
projetsRouter.get(
  '/:id',
  lecture,
  traiter(async (req, res) => {
    const projet = await requeteUne('SELECT * FROM projets WHERE id = $1', [req.params.id]);
    if (!projet) return void res.status(404).json({ ok: false, message: 'Projet introuvable' });
    const [taches, demarches, prestataires, budget, materiel, conflits] = await Promise.all([
      requete('SELECT * FROM projet_taches WHERE projet_id = $1 ORDER BY decalage, created_at', [req.params.id]),
      requete('SELECT * FROM projet_demarches WHERE projet_id = $1 ORDER BY decalage, created_at', [req.params.id]),
      requete('SELECT * FROM projet_prestataires WHERE projet_id = $1 ORDER BY created_at', [req.params.id]),
      requete('SELECT * FROM projet_budget WHERE projet_id = $1 ORDER BY created_at', [req.params.id]),
      requete(
        `SELECT m.article_id, m.quantite, a.code, a.nom, a.unite, a.total FROM projet_materiel m
           JOIN materiel_articles a ON a.id = m.article_id WHERE m.projet_id = $1 ORDER BY a.code NULLS LAST, a.nom`,
        [req.params.id]
      ),
      conflitsMateriel(req.params.id),
    ]);
    res.json({ projet, taches, demarches, prestataires, budget, materiel, conflits });
  })
);

// Champs modifiables d'un projet et niveau requis pour chacun.
const CHAMPS_PROJET: Record<string, { niveau: Niveau; schema: z.ZodTypeAny }> = {
  titre: { niveau: 'administration', schema: texte(300).min(1) },
  type: { niveau: 'administration', schema: z.enum(CODES_TYPES) },
  dateJour: { niveau: 'administration', schema: jour },
  dateFin: { niveau: 'administration', schema: jour.nullable() },
  lieu: { niveau: 'administration', schema: texte() },
  jauge: { niveau: 'administration', schema: z.number().int().min(0).max(10_000_000).nullable() },
  referent: { niveau: 'administration', schema: texte() },
  demandeur: { niveau: 'administration', schema: texte() },
  description: { niveau: 'administration', schema: texte(5000) },
  montage: { niveau: 'contribution', schema: texte(40) },
  ouverture: { niveau: 'contribution', schema: texte(40) },
  fermeture: { niveau: 'contribution', schema: texte(40) },
  demontage: { niveau: 'contribution', schema: texte(40) },
  implantation: { niveau: 'contribution', schema: texte(5000) },
  statut: { niveau: 'validation', schema: z.enum(['preparation', 'realise', 'cloture', 'annule']) },
  bilan: {
    niveau: 'validation',
    schema: z.object({
      frequentation: z.number().int().min(0).nullable().optional(),
      forts: texte(5000).optional(),
      ameliorer: texte(5000).optional(),
      incidents: texte(5000).optional(),
    }),
  },
};

/** Mise à jour partielle : chaque champ exige son propre niveau (logistique, bilan, informations). */
projetsRouter.put(
  '/:id',
  lecture,
  traiter(async (req, res) => {
    if (!req.body || typeof req.body !== 'object') return invalide(res);
    const champs: Record<string, unknown> = {};
    for (const [cle, valeur] of Object.entries(req.body)) {
      const def = CHAMPS_PROJET[cle];
      if (!def) return invalide(res, `Champ inconnu : ${cle}`);
      if (!peut(req.session, 'projets', def.niveau)) {
        return void res.status(403).json({ ok: false, message: 'Action non autorisée avec vos droits sur ce module' });
      }
      const lu = def.schema.safeParse(valeur);
      if (!lu.success) return invalide(res);
      champs[cle] = lu.data;
    }
    if (Object.keys(champs).length === 0) return invalide(res);
    const avant = await requeteUne<{ titre: string; dateJour: string; dateFin: string | null; statut: string }>(
      'SELECT titre, date_jour, date_fin, statut FROM projets WHERE id = $1',
      [req.params.id]
    );
    if (!avant) return void res.status(404).json({ ok: false, message: 'Projet introuvable' });
    const dateJour = (champs.dateJour as string | undefined) ?? avant.dateJour;
    const dateFin = 'dateFin' in champs ? (champs.dateFin as string | null) : avant.dateFin;
    if (dateFin && dateFin < dateJour) throw new ErreurMetier('La date de fin précède le jour J');
    if (champs.bilan) {
      const actuel = await requeteUne<{ bilan: object }>('SELECT bilan FROM projets WHERE id = $1', [req.params.id]);
      champs.bilan = { ...actuel!.bilan, ...(champs.bilan as object) };
    }
    const { texte: set, params } = clauseSet('projets', champs, 2);
    await executer(`UPDATE projets SET ${set} WHERE id = $1`, [req.params.id, ...params]);
    if (champs.dateJour || champs.statut) {
      await consigner(identiteDeRequete(req), 'projets_modification', avant.titre, {
        avant: { dateJour: avant.dateJour, statut: avant.statut },
        apres: { dateJour: champs.dateJour, statut: champs.statut },
      });
    }
    res.json({ ok: true, message: champs.dateJour ? 'Date modifiée : toutes les échéances sont recalculées.' : 'Enregistré' });
  })
);

projetsRouter.delete(
  '/:id',
  administration,
  traiter(async (req, res) => {
    const supprime = await requeteUne<{ titre: string }>('DELETE FROM projets WHERE id = $1 RETURNING titre', [req.params.id]);
    if (!supprime) return void res.status(404).json({ ok: false, message: 'Projet introuvable' });
    await consigner(identiteDeRequete(req), 'projets_suppression', supprime.titre);
    res.json({ ok: true, message: 'Projet supprimé' });
  })
);

// --- Lignes d'un projet : tâches, démarches, prestataires, budget --------------------------------

/**
 * Déclare les routes POST / PUT / DELETE d'une liste rattachée à un projet. Les champs passent par
 * la liste blanche de la table (voir db.ts) après validation par le schéma.
 */
function lignesDeProjet(
  chemin: string,
  table: NomTable,
  niveau: Niveau,
  creation: z.ZodObject<z.ZodRawShape>,
  modification: z.ZodObject<z.ZodRawShape>,
  avantEcriture?: (req: Request, champs: Record<string, unknown>) => void
) {
  const garde = requireModule('projets', niveau);
  projetsRouter.post(
    `/:id/${chemin}`,
    garde,
    traiter(async (req, res) => {
      const parsed = creation.safeParse(req.body);
      if (!parsed.success) return invalide(res);
      if (!(await projetExiste(req.params.id, res))) return;
      const ligne = await insererUn(table, { ...parsed.data, projetId: req.params.id });
      res.json({ ok: true, message: 'Ajouté', ligne });
    })
  );
  projetsRouter.put(
    `/:id/${chemin}/:ligne`,
    garde,
    traiter(async (req, res) => {
      const parsed = modification.partial().safeParse(req.body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) return invalide(res);
      const champs: Record<string, unknown> = { ...parsed.data };
      avantEcriture?.(req, champs);
      const { texte: set, params } = clauseSet(table, champs, 3);
      const n = await executer(`UPDATE ${table} SET ${set} WHERE id = $1 AND projet_id = $2`, [req.params.ligne, req.params.id, ...params]);
      if (n === 0) return void res.status(404).json({ ok: false, message: 'Ligne introuvable' });
      res.json({ ok: true, message: 'Enregistré' });
    })
  );
  projetsRouter.delete(
    `/:id/${chemin}/:ligne`,
    garde,
    traiter(async (req, res) => {
      const n = await executer(`DELETE FROM ${table} WHERE id = $1 AND projet_id = $2`, [req.params.ligne, req.params.id]);
      if (n === 0) return void res.status(404).json({ ok: false, message: 'Ligne introuvable' });
      res.json({ ok: true, message: 'Supprimé' });
    })
  );
}

const schemaTache = z.object({
  decalage: z.number().int().min(-730).max(365),
  branche: texte(150),
  libelle: texte(300).min(1),
  fait: z.boolean(),
});
lignesDeProjet('taches', 'projet_taches', 'contribution', schemaTache.omit({ fait: true }), schemaTache, (req, champs) => {
  // Trace de qui a soldé la tâche et quand.
  if (champs.fait === true) Object.assign(champs, { faitPar: req.session!.nom, faitLe: new Date() });
  if (champs.fait === false) Object.assign(champs, { faitPar: '', faitLe: null });
});

const schemaDemarche = z.object({
  decalage: z.number().int().min(-730).max(365),
  libelle: texte(300).min(1),
  statut: z.enum(['a_faire', 'depose', 'obtenu', 'na']),
  note: texte(1000),
});
lignesDeProjet('demarches', 'projet_demarches', 'contribution', schemaDemarche.pick({ decalage: true, libelle: true }), schemaDemarche);

const schemaPrestataire = z.object({
  nom: texte(200).min(1),
  prestation: texte(),
  contact: texte(),
  arrivee: texte(40),
  depart: texte(40),
  montant: z.number().min(0).max(100_000_000).nullable(),
  lien: z.union([z.literal(''), z.string().trim().url().max(1000)]),
  pieces: z.object(Object.fromEntries(PIECES.map(([code]) => [code, z.boolean().optional()]))),
});
lignesDeProjet('prestataires', 'projet_prestataires', 'contribution', schemaPrestataire.pick({ nom: true, prestation: true }), schemaPrestataire);

const schemaBudget = z.object({
  poste: texte(200).min(1),
  prevu: z.number().min(-100_000_000).max(100_000_000),
  realise: z.number().min(-100_000_000).max(100_000_000),
});
lignesDeProjet('budget', 'projet_budget', 'validation', schemaBudget.pick({ poste: true }), schemaBudget);

// --- Matériel réservé ----------------------------------------------------------------------------

/** Réserve une quantité d'un article (0 retire la réservation). */
projetsRouter.put(
  '/:id/materiel',
  contribution,
  traiter(async (req, res) => {
    const parsed = z
      .object({ articleId: z.string().min(1), quantite: z.number().int().min(0).max(1_000_000) })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    if (!(await projetExiste(req.params.id, res))) return;
    await reserver(req.params.id, [parsed.data]);
    res.json({ ok: true, message: 'Réservation enregistrée' });
  })
);

/** Reporte dans la réservation les quantités comptées sur le plan d'implantation (par code d'article). */
projetsRouter.post(
  '/:id/materiel/depuis-plan',
  contribution,
  traiter(async (req, res) => {
    const parsed = z.record(z.string(), z.number().int().min(0).max(1_000_000)).safeParse(req.body?.quantites);
    if (!parsed.success) return invalide(res);
    if (!(await projetExiste(req.params.id, res))) return;
    const articles = await requete<{ _id: string; code: string }>('SELECT id, code FROM materiel_articles WHERE code = ANY($1)', [
      Object.keys(parsed.data),
    ]);
    await reserver(
      req.params.id,
      articles.map((a) => ({ articleId: a._id, quantite: parsed.data[a.code] }))
    );
    res.json({ ok: true, message: 'Réservation mise à jour d’après le plan' });
  })
);

async function reserver(projetId: string, lignes: { articleId: string; quantite: number }[]) {
  await transaction(async (client) => {
    for (const l of lignes) {
      if (l.quantite === 0) {
        await executer('DELETE FROM projet_materiel WHERE projet_id = $1 AND article_id = $2', [projetId, l.articleId], client);
      } else {
        await executer(
          `INSERT INTO projet_materiel (projet_id, article_id, quantite) VALUES ($1, $2, $3)
           ON CONFLICT (projet_id, article_id) DO UPDATE SET quantite = EXCLUDED.quantite`,
          [projetId, l.articleId, l.quantite],
          client
        );
      }
    }
  });
}

// --- Plan d'implantation -------------------------------------------------------------------------

projetsRouter.get(
  '/:id/plans',
  lecture,
  traiter(async (req, res) => {
    const plans = await requete<{ _id: string; libelle: string | null; document: object; auteurNom: string; createdAt: Date }>(
      'SELECT * FROM projet_plans WHERE projet_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({
      courant: plans.find((p) => p.libelle === null)?.document ?? null,
      versions: plans
        .filter((p) => p.libelle !== null)
        .map((p) => ({ ...p.document, _id: p._id, label: p.libelle, creeLe: p.createdAt.toISOString().slice(0, 10), auteur: p.auteurNom })),
    });
  })
);

const schemaPlan = z.object({
  bounds: z.object({ w: z.number().positive().max(100_000), h: z.number().positive().max(100_000) }),
  items: z.array(z.record(z.string(), z.unknown())).max(20_000),
  bg: z.record(z.string(), z.unknown()).nullable(),
  densite: z.number().min(0).max(10),
});

projetsRouter.put(
  '/:id/plans/courant',
  contribution,
  traiter(async (req, res) => {
    const parsed = schemaPlan.passthrough().safeParse(req.body);
    if (!parsed.success) return invalide(res);
    if (!(await projetExiste(req.params.id, res))) return;
    await executer(
      `INSERT INTO projet_plans (projet_id, libelle, document, auteur_nom) VALUES ($1, NULL, $2, $3)
       ON CONFLICT (projet_id) WHERE libelle IS NULL DO UPDATE SET document = EXCLUDED.document, auteur_nom = EXCLUDED.auteur_nom`,
      [req.params.id, JSON.stringify(parsed.data), req.session!.nom]
    );
    res.json({ ok: true });
  })
);

/** Fige une version du plan (à chaque réunion jalon). */
projetsRouter.post(
  '/:id/plans/versions',
  contribution,
  traiter(async (req, res) => {
    const parsed = schemaPlan.passthrough().extend({ label: texte(200).min(1) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    if (!(await projetExiste(req.params.id, res))) return;
    const { label, ...document } = parsed.data;
    delete (document as Record<string, unknown>).creeLe;
    await insererUn('projet_plans', { projetId: req.params.id, libelle: label, document, auteurNom: req.session!.nom });
    res.json({ ok: true, message: 'Version figée' });
  })
);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const TYPES_FICHIERS = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

/** Dépôt d'un fichier du projet (fond de plan, pièce) sur le stockage S3. */
projetsRouter.post(
  '/:id/fichiers',
  contribution,
  upload.single('fichier'),
  traiter(async (req, res) => {
    if (!stockageActif()) throw new ErreurMetier('Stockage des fichiers non configuré : contactez un super-administrateur');
    if (!req.file) return invalide(res, 'Aucun fichier reçu');
    if (!TYPES_FICHIERS.includes(req.file.mimetype)) throw new ErreurMetier('Format non pris en charge : PDF, PNG, JPEG ou WebP');
    if (!(await projetExiste(req.params.id, res))) return;
    const fichier = await enregistrerFichier({
      contenu: req.file.buffer,
      nomOrigine: req.file.originalname,
      typeMime: req.file.mimetype,
      module: 'projets',
      rattachement: req.params.id,
      deposePar: req.session!.userId,
    });
    res.json({ ok: true, id: fichier._id, url: `/api/fichiers/${fichier._id}` });
  })
);

// --- Demandes d'événement ------------------------------------------------------------------------

const schemaDemande = z.object({
  intitule: texte(300).min(1),
  structure: texte(300).min(1),
  contact: texte(300).min(1),
  dateSouhaitee: jour,
  lieu: texte().default(''),
  type: z.enum(CODES_TYPES),
  jauge: z.number().int().min(0).max(10_000_000).nullable().default(null),
  besoins: z.array(texte(100)).max(20).default([]),
  description: texte(5000).default(''),
});

function lienApp(chemin: string) {
  return `${config.appUrl.replace(/\/$/, '')}${chemin}`;
}

async function notifier(to: string[], sujet: string, lignes: string[], chemin: string) {
  if (to.length === 0) return;
  const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await envoyerEmail({
    to,
    subject: sujet,
    text: [...lignes, '', lienApp(chemin)].join('\n'),
    html: `${lignes.map((l) => `<p>${echapper(l)}</p>`).join('')}<p><a href="${lienApp(chemin)}">Ouvrir DK Événementiel</a></p>`,
  }).catch((err) => console.error('[projets] Échec de notification :', err));
}

/** Dépôt d'une demande d'événement : ouvert à tout compte ayant accès au module. */
projetsRouter.post(
  '/demandes',
  lecture,
  traiter(async (req, res) => {
    const parsed = schemaDemande.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const demande = await insererUn<{ _id: string; intitule: string; dateSouhaitee: string }>('projet_demandes', {
      ...parsed.data,
      demandeurId: req.session!.userId,
      demandeurNom: req.session!.nom,
    });
    await consigner(identiteDeRequete(req), 'projets_demande', demande.intitule);
    const valideurs = await requete<{ email: string }>(
      `SELECT DISTINCT u.email FROM utilisateurs u JOIN droits_modules d ON d.utilisateur_id = u.id
        WHERE d.module = 'projets' AND d.niveau IN ('validation', 'administration') AND u.statut = 'Actif'`
    );
    const destinataires = valideurs.length
      ? valideurs.map((v) => v.email)
      : (await requete<{ email: string }>("SELECT email FROM utilisateurs WHERE super_admin AND statut = 'Actif'")).map((a) => a.email);
    void notifier(
      destinataires,
      `Nouvelle demande d'événement — ${demande.intitule}`,
      [`${req.session!.nom} (${parsed.data.structure}) demande « ${demande.intitule} » pour le ${parsed.data.dateSouhaitee.split('-').reverse().join('/')}.`],
      '/projets/demandes'
    );
    res.json({ ok: true, message: 'Demande envoyée. Vous pouvez suivre son instruction ci-dessous.' });
  })
);

projetsRouter.get(
  '/demandes/miennes',
  lecture,
  traiter(async (req, res) => {
    const demandes = await requete(
      `SELECT d.*, p.titre AS projet_titre,
              (SELECT round(100.0 * count(*) FILTER (WHERE t.fait) / NULLIF(count(*), 0)) FROM projet_taches t WHERE t.projet_id = d.projet_id) AS avancement
         FROM projet_demandes d LEFT JOIN projets p ON p.id = d.projet_id
        WHERE d.demandeur_id = $1 ORDER BY d.created_at DESC`,
      [req.session!.userId]
    );
    res.json({ demandes });
  })
);

projetsRouter.get(
  '/demandes/toutes',
  validation,
  traiter(async (_req, res) => {
    res.json({ demandes: await requete('SELECT * FROM projet_demandes ORDER BY created_at DESC LIMIT 500') });
  })
);

async function demandeEnCours(id: string) {
  const demande = await requeteUne<{
    _id: string;
    intitule: string;
    statut: string;
    demandeurId: string | null;
    demandeurNom: string;
    structure: string;
    dateSouhaitee: string;
    lieu: string;
    type: (typeof CODES_TYPES)[number];
    jauge: number | null;
    description: string;
    besoins: string[];
    createdAt: Date;
  }>('SELECT * FROM projet_demandes WHERE id = $1', [id]);
  if (!demande) throw new ErreurMetier('Demande introuvable');
  if (demande.statut !== 'nouvelle' && demande.statut !== 'instruction') throw new ErreurMetier('Demande déjà traitée');
  return demande;
}

async function notifierDemandeur(demandeurId: string | null, sujet: string, message: string) {
  if (!demandeurId) return;
  const compte = await requeteUne<{ email: string }>("SELECT email FROM utilisateurs WHERE id = $1 AND statut <> 'Suspendu'", [demandeurId]);
  if (compte) void notifier([compte.email], sujet, [message], '/projets/deposer');
}

projetsRouter.post(
  '/demandes/:id/instruction',
  validation,
  traiter(async (req, res) => {
    const demande = await demandeEnCours(req.params.id);
    await executer("UPDATE projet_demandes SET statut = 'instruction' WHERE id = $1", [demande._id]);
    res.json({ ok: true, message: 'Demande passée en instruction' });
  })
);

/** Acceptation : crée le projet et son rétroplanning ; l'inscription date du dépôt de la demande. */
projetsRouter.post(
  '/demandes/:id/accepter',
  validation,
  traiter(async (req, res) => {
    const reponse = z.string().trim().max(2000).default('').parse(req.body?.reponse ?? '');
    const demande = await demandeEnCours(req.params.id);
    const besoins = demande.besoins.length ? `\nBesoins identifiés : ${demande.besoins.join(', ')}.` : '';
    const projet = await creerProjet({
      titre: demande.intitule,
      type: demande.type,
      dateJour: demande.dateSouhaitee,
      dateFin: null,
      lieu: demande.lieu,
      jauge: demande.jauge,
      referent: '',
      demandeur: `${demande.demandeurNom} (${demande.structure})`,
      description: `${demande.description}${besoins}`.trim(),
      inscritLe: demande.createdAt.toISOString().slice(0, 10),
      demandeId: demande._id,
    });
    await executer("UPDATE projet_demandes SET statut = 'acceptee', reponse = $2, projet_id = $3 WHERE id = $1", [
      demande._id,
      reponse,
      projet._id,
    ]);
    await consigner(identiteDeRequete(req), 'projets_acceptation_demande', demande.intitule);
    await notifierDemandeur(demande.demandeurId, `Demande acceptée — ${demande.intitule}`, `Votre demande « ${demande.intitule} » est acceptée.${reponse ? ` ${reponse}` : ''}`);
    res.json({ ok: true, message: 'Projet créé avec son rétroplanning', projetId: projet._id });
  })
);

projetsRouter.post(
  '/demandes/:id/refuser',
  validation,
  traiter(async (req, res) => {
    const reponse = z.string().trim().min(1).max(2000).safeParse(req.body?.reponse);
    if (!reponse.success) throw new ErreurMetier('Indiquez le motif du refus');
    const demande = await demandeEnCours(req.params.id);
    await executer("UPDATE projet_demandes SET statut = 'refusee', reponse = $2 WHERE id = $1", [demande._id, reponse.data]);
    await consigner(identiteDeRequete(req), 'projets_refus_demande', demande.intitule);
    await notifierDemandeur(demande.demandeurId, `Demande refusée — ${demande.intitule}`, `Votre demande « ${demande.intitule} » n'est pas retenue. ${reponse.data}`);
    res.json({ ok: true, message: 'Demande refusée' });
  })
);
