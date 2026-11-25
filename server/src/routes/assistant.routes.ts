import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { executer, insererUn, requete, requeteUne, transaction } from '../db.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { aujourdhui } from '../lib/projets.js';
import { creerProjet, ErreurMetier, jalonDuDecalage, schemaInfos } from './projets.routes.js';
import { mots } from '../lib/assistant/texte.js';
import { BRANCHES } from '../lib/assistant/classement.js';
import { analyserDossier, contexteDepot, deposerConversation, etatReleve, relever, ReleveImpossible } from '../lib/assistant/releve.js';
import { AnalyseImpossible, schemaReponse, testerCleAnalyse } from '../lib/assistant/analyse.js';
import {
  ConnexionImpossible,
  enregistrerCleAnalyse,
  enregistrerConfiguration,
  listeAdresses,
  lireConfiguration,
  motDePasseEnregistre,
  supprimerConfiguration,
  testerConnexion,
} from '../lib/assistant/configuration.js';
import { lireObjet, stockageActif, supprimerFichier } from '../lib/stockage.js';

/**
 * Onglet Assistant, réservé aux super-administrateurs.
 *
 * Le serveur relève lui-même la boîte Gmail du service, où le chef de service transfère les mails utiles
 * (lib/assistant/releve.ts) : chaque mail rejoint le registre et un dossier, existant ou nouveau. L'ancien
 * mode reste possible : import d'un index complet (`donnees.json`) produit par l'assistant de messagerie.
 * L'onglet relie ensuite dossiers et projets : rattachement d'un événement à un projet (ou création du
 * projet), transformation d'une échéance ou d'une action en tâche du rétroplanning.
 */
export const assistantRouter = Router();
assistantRouter.use(requireSuperAdmin);

function traiter(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      if (err instanceof ErreurMetier) res.json({ ok: false, message: err.message });
      else next(err);
    });
  };
}
const invalide = (res: Response, message = 'Données invalides') => void res.status(400).json({ ok: false, message });

/** Au-delà de ce délai sans import, l'onglet signale que les dossiers ne sont peut-être plus à jour. */
export const JOURS_AVANT_ALERTE = 7;

/** Branche de l'assistant → rôle qui porte la tâche dans le rétroplanning. */
const ROLE_PAR_BRANCHE: Record<string, string> = {
  Protocole: 'ref_protocole',
  Animation: 'ref_animation',
  Logistique: 'ref_logistique',
  Affichage: 'ref_affichage',
  KIOSC: 'ref_kiosc',
  VSL: 'ref_vsl',
  'Pilotage du service': 'chef_service',
};
export const roleDeBranche = (branche: string) => ROLE_PAR_BRANCHE[branche] ?? 'pilote';

// --- Format de l'index produit par l'assistant ---------------------------------------------------
// Souple à dessein : l'assistant enrichit ses fiches au fil des versions (historique, budget…). Seuls les
// champs qui servent aux liens sont exigés ; le reste de chaque fiche est conservé tel quel.

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/)
  .transform((v) => v.slice(0, 10))
  .nullable()
  .optional();
const libre = z.string().nullable().optional().transform((v) => v ?? '');

const schemaIndex = z.object({
  genere_le: libre,
  periode: libre,
  branches: z.array(z.string()).optional(),
  evenements: z.array(z.object({ id: z.string().min(1).max(60), nom: libre, date, lieu: libre }).passthrough()).max(2000),
  dossiers: z
    .array(
      z
        .object({
          id: z.string().min(1).max(60),
          evenement: libre,
          branche: libre,
          titre: libre,
          statut: libre,
          priorite: libre,
          echeances: z.array(z.object({ date: date, libelle: libre }).passthrough()).optional().default([]),
          actions: z.array(z.string()).optional().default([]),
        })
        .passthrough()
    )
    .max(20000),
  mails: z
    .array(z.object({ n: z.number().int().optional(), date: libre, de: libre, objet: libre, dossier: libre }).passthrough())
    .max(200000)
    .optional()
    .default([]),
  prestataires: z.array(z.object({ nom: z.string().min(1).max(300), domaine: libre }).passthrough()).max(5000).optional().default([]),
});
export type IndexAssistant = z.infer<typeof schemaIndex>;

interface LigneDossier {
  code: string;
  evenementCode: string;
  branche: string;
  titre: string;
  statut: string;
  priorite: string;
  donnees: Record<string, unknown> & { echeances?: { date?: string | null; libelle?: string }[]; actions?: string[] };
  converties: Record<string, { tacheId: string; projetId: string; le: string }>;
  corrections: { statut?: string; note?: string; maj?: string; par?: string };
}

/** Remplace l'index par celui fourni, en conservant rattachements et tâches déjà créées. */
export async function importerIndex(index: IndexAssistant, par: string) {
  const codesEv = new Set(index.evenements.map((e) => e.id));
  const codesDos = new Set(index.dossiers.map((d) => d.id));
  if (codesEv.size !== index.evenements.length) throw new ErreurMetier("L'index contient deux événements de même identifiant");
  if (codesDos.size !== index.dossiers.length) throw new ErreurMetier("L'index contient deux dossiers de même identifiant");

  return transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['assistant-import']);
    const avant = await requete<{ code: string; projetId: string | null }>('SELECT code, projet_id FROM assistant_evenements', [], client);
    const retires = avant.filter((e) => !codesEv.has(e.code));
    const rattachementsPerdus = retires.filter((e) => e.projetId).length;

    for (const e of index.evenements) {
      await executer(
        `INSERT INTO assistant_evenements (code, nom, date_jour, lieu) VALUES ($1, $2, $3, $4)
         ON CONFLICT (code) DO UPDATE SET nom = EXCLUDED.nom, date_jour = EXCLUDED.date_jour, lieu = EXCLUDED.lieu, updated_at = now()`,
        [e.id, e.nom, e.date ?? null, e.lieu],
        client
      );
    }
    if (retires.length > 0) {
      await executer('DELETE FROM assistant_evenements WHERE code = ANY($1)', [retires.map((e) => e.code)], client);
    }

    for (const d of index.dossiers) {
      await executer(
        `INSERT INTO assistant_dossiers (code, evenement_code, branche, titre, statut, priorite, donnees) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (code) DO UPDATE SET source = 'index', evenement_code = EXCLUDED.evenement_code, branche = EXCLUDED.branche, titre = EXCLUDED.titre,
           statut = EXCLUDED.statut, priorite = EXCLUDED.priorite, donnees = EXCLUDED.donnees, updated_at = now()`,
        [d.id, d.evenement, d.branche, d.titre, d.statut, d.priorite, JSON.stringify(d)],
        client
      );
    }
    // Les dossiers ouverts par le relevé Gmail (M001…) ne viennent pas de l'index : ils restent.
    const dossiersRetires = await executer("DELETE FROM assistant_dossiers WHERE source = 'index' AND NOT (code = ANY($1))", [[...codesDos]], client);
    // Un statut corrigé que l'assistant a repris dans son nouvel index n'est plus une correction.
    await executer(
      "UPDATE assistant_dossiers SET corrections = corrections - 'statut' WHERE corrections->>'statut' = statut",
      [],
      client
    );

    await executer("DELETE FROM assistant_mails WHERE source = 'index'", [], client);
    for (let i = 0; i < index.mails.length; i += 500) {
      const lot = index.mails.slice(i, i + 500);
      const valeurs: unknown[] = [];
      const lignes = lot.map((m, j) => {
        valeurs.push(m.n ?? i + j + 1, m.date, m.de, m.objet, m.dossier);
        const b = j * 5;
        return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5})`;
      });
      await executer(`INSERT INTO assistant_mails (numero, date, expediteur, objet, dossier_code) VALUES ${lignes.join(', ')}`, valeurs, client);
    }

    // Les mails de la mise à jour automatique restent : on les raccroche aux fiches que l'index vient de réécrire.
    await executer(
      `UPDATE assistant_mails SET dossier_code = '' WHERE source = 'releve' AND dossier_code <> ''
          AND dossier_code NOT IN (SELECT code FROM assistant_dossiers)`,
      [],
      client
    );
    await executer(
      `UPDATE assistant_dossiers d SET donnees = jsonb_set(d.donnees, '{mails}', coalesce(d.donnees->'mails', '[]'::jsonb) || r.numeros)
         FROM (SELECT dossier_code, jsonb_agg(numero ORDER BY numero) AS numeros FROM assistant_mails
                WHERE source = 'releve' GROUP BY dossier_code) r
        WHERE r.dossier_code = d.code AND d.source = 'index'`,
      [],
      client
    );

    await executer('DELETE FROM assistant_prestataires', [], client);
    const vus = new Set<string>();
    for (const p of index.prestataires) {
      if (vus.has(p.nom)) continue;
      vus.add(p.nom);
      await executer('INSERT INTO assistant_prestataires (nom, domaine, donnees) VALUES ($1, $2, $3)', [p.nom, p.domaine, JSON.stringify(p)], client);
    }

    const compte = {
      evenements: index.evenements.length,
      dossiers: index.dossiers.length,
      mails: index.mails.length,
      prestataires: vus.size,
      evenementsRetires: retires.length,
      rattachementsPerdus,
      dossiersRetires,
    };
    await insererUn('assistant_imports', { genereLe: index.genere_le, periode: index.periode, compte, par }, client);
    return compte;
  });
}

// --- Import ---------------------------------------------------------------------------------------

assistantRouter.post(
  '/import',
  traiter(async (req, res) => {
    const parsed = schemaIndex.safeParse(req.body);
    if (!parsed.success) {
      const premier = parsed.error.issues[0];
      return invalide(res, `Ce fichier n'est pas un index de l'assistant (${premier.path.join('.') || 'racine'} : ${premier.message})`);
    }
    const compte = await importerIndex(parsed.data, req.session!.nom);
    await consigner(identiteDeRequete(req), 'assistant_import', parsed.data.periode, compte);
    const pertes = compte.rattachementsPerdus
      ? ` Attention : ${compte.rattachementsPerdus} événement(s) rattaché(s) à un projet ne figurent plus dans l'index.`
      : '';
    res.json({
      ok: true,
      message: `Index importé : ${compte.evenements} événements, ${compte.dossiers} dossiers, ${compte.mails} mails, ${compte.prestataires} prestataires.${pertes}`,
      compte,
    });
  })
);

// --- Synthèse -------------------------------------------------------------------------------------

assistantRouter.get(
  '/synthese',
  traiter(async (_req, res) => {
    const dernier = await requeteUne<{ genereLe: string; periode: string; compte: Record<string, number>; par: string; createdAt: Date }>(
      'SELECT * FROM assistant_imports ORDER BY created_at DESC LIMIT 1'
    );
    const joursDepuis = dernier ? Math.floor((Date.now() - new Date(dernier.createdAt).getTime()) / 86_400_000) : null;
    const dossiers = await requete<LigneDossier>('SELECT * FROM assistant_dossiers');
    const evenements = await requete<{ code: string; projetId: string | null }>('SELECT code, projet_id FROM assistant_evenements');
    const projetDe = new Map(evenements.map((e) => [e.code, e.projetId]));

    const jour = aujourdhui();
    const limite = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const echeances = dossiers
      .flatMap((d) =>
        (d.donnees.echeances ?? []).map((e, i) => ({
          dossier: d.code,
          titre: d.titre,
          branche: d.branche,
          evenement: d.evenementCode,
          date: (e.date ?? '').slice(0, 10),
          libelle: e.libelle ?? '',
          convertie: !!d.converties[`echeance:${i}`],
        }))
      )
      .filter((e) => e.date && e.date <= limite && !['Clos'].includes(dossiers.find((d) => d.code === e.dossier)!.statut))
      .sort((a, b) => a.date.localeCompare(b.date));

    const parStatut: Record<string, number> = {};
    for (const d of dossiers) parStatut[d.statut || 'Sans statut'] = (parStatut[d.statut || 'Sans statut'] ?? 0) + 1;
    res.json({
      dernierImport: dernier,
      joursDepuis,
      alerte: joursDepuis === null || joursDepuis > JOURS_AVANT_ALERTE,
      joursAvantAlerte: JOURS_AVANT_ALERTE,
      dossiers: dossiers.length,
      aTraiter: dossiers.filter((d) => d.statut === 'À traiter').length,
      prioriteHaute: dossiers.filter((d) => d.priorite === 'Haute' && d.statut !== 'Clos').length,
      parStatut,
      evenementsSansProjet: evenements.filter((e) => !e.projetId).length,
      echeancesEnRetard: echeances.filter((e) => e.date < jour).length,
      echeances: echeances.map((e) => ({ ...e, enRetard: e.date < jour, avecProjet: !!projetDe.get(e.evenement) })),
    });
  })
);

// --- Dossiers -------------------------------------------------------------------------------------

assistantRouter.get(
  '/dossiers',
  traiter(async (_req, res) => {
    const dossiers = await requete<LigneDossier & { updatedAt: Date }>(
      `SELECT d.*, (SELECT count(*) FROM assistant_mails m WHERE m.dossier_code = d.code) AS nombre_mails
         FROM assistant_dossiers d ORDER BY d.code`
    );
    const evenements = await requete<{ code: string; nom: string; projetId: string | null }>('SELECT code, nom, projet_id FROM assistant_evenements');
    const ev = new Map(evenements.map((e) => [e.code, e]));
    res.json({
      dossiers: dossiers.map((d) => ({
        ...d,
        evenementNom: ev.get(d.evenementCode)?.nom ?? d.evenementCode,
        projetId: ev.get(d.evenementCode)?.projetId ?? null,
      })),
    });
  })
);

assistantRouter.get(
  '/dossiers/:code/mails',
  traiter(async (req, res) => {
    const mails = await requete('SELECT * FROM assistant_mails WHERE dossier_code = $1 ORDER BY date DESC, numero', [req.params.code]);
    res.json({ mails });
  })
);

/**
 * Transforme une échéance ou une action d'un dossier en tâche du rétroplanning du projet rattaché.
 * L'échéance garde sa date ; une action sans date tombe à la date du jour (ou au jour J s'il est passé).
 * La tâche est portée par le rôle de la branche du dossier.
 */
assistantRouter.post(
  '/dossiers/:code/tache',
  traiter(async (req, res) => {
    const parsed = z.object({ type: z.enum(['echeance', 'action']), index: z.number().int().min(0) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { type, index } = parsed.data;
    const cle = `${type}:${index}`;

    const resultat = await transaction(async (client) => {
      const d = await requeteUne<LigneDossier>('SELECT * FROM assistant_dossiers WHERE code = $1 FOR UPDATE', [req.params.code], client);
      if (!d) throw new ErreurMetier('Dossier introuvable');
      if (d.converties[cle]) throw new ErreurMetier('Cette ligne est déjà une tâche du rétroplanning');
      const ev = await requeteUne<{ projetId: string | null }>('SELECT projet_id FROM assistant_evenements WHERE code = $1', [d.evenementCode], client);
      if (!ev?.projetId) throw new ErreurMetier("Rattachez d'abord l'événement de ce dossier à un projet");
      const projet = await requeteUne<{ _id: string; titre: string; dateJour: string }>('SELECT id, titre, date_jour FROM projets WHERE id = $1', [ev.projetId], client);
      if (!projet) throw new ErreurMetier('Le projet rattaché a été supprimé');

      let libelle: string;
      let echeance: string;
      if (type === 'echeance') {
        const e = (d.donnees.echeances ?? [])[index];
        if (!e) throw new ErreurMetier('Échéance introuvable');
        libelle = e.libelle ?? '';
        echeance = (e.date ?? '').slice(0, 10) || aujourdhui();
      } else {
        const a = (d.donnees.actions ?? [])[index];
        if (!a) throw new ErreurMetier('Action introuvable');
        libelle = a;
        echeance = aujourdhui() < projet.dateJour ? aujourdhui() : projet.dateJour;
      }
      const decalage = Math.round((Date.parse(echeance) - Date.parse(projet.dateJour)) / 86_400_000);
      if (decalage < -730 || decalage > 365) throw new ErreurMetier("L'échéance est trop éloignée du jour J du projet");
      const tache = await insererUn<{ _id: string }>(
        'projet_taches',
        {
          projetId: projet._id,
          decalage,
          libelle: `${libelle.slice(0, 280)} (${d.code})`,
          porte: roleDeBranche(d.branche),
          branche: d.branche,
          livrable: '',
          jalon: await jalonDuDecalage(decalage),
        },
        client
      );
      const converties = { ...d.converties, [cle]: { tacheId: tache._id, projetId: projet._id, le: new Date().toISOString() } };
      await executer('UPDATE assistant_dossiers SET converties = $2, updated_at = now() WHERE code = $1', [d.code, JSON.stringify(converties)], client);
      return { projet, libelle };
    });
    await consigner(identiteDeRequete(req), 'assistant_tache', resultat.projet.titre, { dossier: req.params.code, cle });
    res.json({ ok: true, message: `Tâche ajoutée au rétroplanning de « ${resultat.projet.titre} »`, projetId: resultat.projet._id });
  })
);

// --- Événements et projets ------------------------------------------------------------------------

/** Projet le plus proche d'un événement de l'assistant : mots communs du titre, bonifiés par une date proche. */
export function proposerProjet(
  ev: { nom: string; dateJour: string | null },
  projets: { _id: string; titre: string; dateJour: string }[]
): { projetId: string; titre: string; score: number } | null {
  const a = mots(ev.nom);
  let meilleur: { projetId: string; titre: string; score: number } | null = null;
  for (const p of projets) {
    const b = mots(p.titre);
    const communs = [...a].filter((m) => b.has(m)).length;
    if (communs === 0) continue;
    let score = communs / Math.max(1, Math.min(a.size, b.size));
    if (ev.dateJour) {
      const ecart = Math.abs(Date.parse(ev.dateJour) - Date.parse(p.dateJour)) / 86_400_000;
      score += ecart <= 3 ? 0.5 : ecart <= 31 ? 0.2 : ecart > 200 ? -0.5 : 0;
    }
    if (score >= 0.75 && (!meilleur || score > meilleur.score)) meilleur = { projetId: p._id, titre: p.titre, score: Math.round(score * 100) / 100 };
  }
  return meilleur;
}

assistantRouter.get(
  '/evenements',
  traiter(async (_req, res) => {
    const evenements = await requete<{ code: string; nom: string; dateJour: string | null; lieu: string; projetId: string | null }>(
      `SELECT e.*, p.titre AS projet_titre, p.date_jour AS projet_date,
              (SELECT count(*) FROM assistant_dossiers d WHERE d.evenement_code = e.code) AS nombre_dossiers
         FROM assistant_evenements e LEFT JOIN projets p ON p.id = e.projet_id
        ORDER BY e.date_jour NULLS LAST, e.nom`
    );
    const projets = await requete<{ _id: string; titre: string; dateJour: string }>("SELECT id, titre, date_jour FROM projets WHERE statut <> 'annule'");
    res.json({
      evenements: evenements.map((e) => ({ ...e, proposition: e.projetId ? null : proposerProjet(e, projets) })),
      projets: projets.sort((a, b) => a.dateJour.localeCompare(b.dateJour)),
    });
  })
);

assistantRouter.put(
  '/evenements/:code/projet',
  traiter(async (req, res) => {
    const parsed = z.object({ projetId: z.string().min(1).nullable() }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { projetId } = parsed.data;
    if (projetId && !(await requeteUne('SELECT 1 FROM projets WHERE id = $1', [projetId]))) throw new ErreurMetier('Projet introuvable');
    const n = await executer('UPDATE assistant_evenements SET projet_id = $2, updated_at = now() WHERE code = $1', [req.params.code, projetId]);
    if (n === 0) return void res.status(404).json({ ok: false, message: 'Événement introuvable' });
    await consigner(identiteDeRequete(req), 'assistant_rattachement', req.params.code, { projetId });
    res.json({ ok: true, message: projetId ? 'Événement rattaché au projet' : 'Rattachement retiré' });
  })
);

/** Crée le projet d'un événement de l'assistant, puis l'y rattache. */
assistantRouter.post(
  '/evenements/:code/creer-projet',
  traiter(async (req, res) => {
    const ev = await requeteUne<{ code: string; nom: string; dateJour: string | null; lieu: string; projetId: string | null }>(
      'SELECT * FROM assistant_evenements WHERE code = $1',
      [req.params.code]
    );
    if (!ev) return void res.status(404).json({ ok: false, message: 'Événement introuvable' });
    if (ev.projetId) throw new ErreurMetier('Cet événement est déjà rattaché à un projet');
    const parsed = schemaInfos.safeParse({
      titre: ev.nom,
      lieu: ev.lieu,
      ...req.body,
      dateJour: req.body?.dateJour ?? ev.dateJour ?? undefined,
    });
    if (!parsed.success) {
      const manqueDate = parsed.error.issues.some((i) => i.path[0] === 'dateJour');
      return invalide(res, manqueDate ? "L'assistant ne connaît pas la date de cet événement : indiquez le jour J" : 'Données invalides');
    }
    const projet = await creerProjet({ ...parsed.data, description: parsed.data.description || `Créé depuis l'assistant de messagerie (${ev.code}).` });
    await executer('UPDATE assistant_evenements SET projet_id = $2, updated_at = now() WHERE code = $1', [ev.code, projet._id]);
    await consigner(identiteDeRequete(req), 'projets_creation', projet.titre, { depuis: 'assistant', evenement: ev.code });
    const niveau = (await requeteUne<{ niveau: number }>('SELECT niveau FROM projets WHERE id = $1', [projet._id]))!.niveau;
    res.json({ ok: true, message: `Projet « ${projet.titre} » créé au niveau N${niveau} et rattaché`, projetId: projet._id });
  })
);

// --- Vue complète et corrections -------------------------------------------------------------------

/** Tout ce que l'onglet affiche, en un appel : l'index, ses liens aux projets et les corrections. */
assistantRouter.get(
  '/index',
  traiter(async (_req, res) => {
    const [dernier, evenements, dossiers, mails, prestataires, projets] = await Promise.all([
      requeteUne('SELECT * FROM assistant_imports ORDER BY created_at DESC LIMIT 1'),
      requete<{ code: string; nom: string; dateJour: string | null; lieu: string; projetId: string | null }>(
        `SELECT e.*, p.titre AS projet_titre FROM assistant_evenements e LEFT JOIN projets p ON p.id = e.projet_id
          ORDER BY e.date_jour NULLS LAST, e.nom`
      ),
      requete<LigneDossier>('SELECT code, source, donnees, converties, corrections FROM assistant_dossiers ORDER BY code'),
      requete(
        `SELECT id, numero, date, expediteur, objet, dossier_code, source, sens, destinataires, consigne, pieces_jointes, classement
           FROM assistant_mails ORDER BY date, numero`
      ),
      requete('SELECT nom, domaine, donnees FROM assistant_prestataires ORDER BY nom'),
      requete<{ _id: string; titre: string; dateJour: string }>("SELECT id, titre, date_jour FROM projets WHERE statut <> 'annule' ORDER BY date_jour"),
    ]);
    res.json({
      dernierImport: dernier,
      releve: await etatReleve(),
      branches: BRANCHES,
      joursAvantAlerte: JOURS_AVANT_ALERTE,
      evenements: evenements.map((e) => ({ ...e, proposition: e.projetId ? null : proposerProjet(e, projets) })),
      dossiers,
      mails,
      prestataires,
      projets,
    });
  })
);

/** Corrige le statut d'un dossier ou y note un commentaire. Conservé d'un import à l'autre. */
assistantRouter.put(
  '/dossiers/:code/correction',
  traiter(async (req, res) => {
    const parsed = z
      .object({ statut: z.string().trim().max(120).nullable().optional(), note: z.string().max(5000).optional() })
      .refine((v) => v.statut !== undefined || v.note !== undefined)
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const d = await requeteUne<LigneDossier>('SELECT code, statut, corrections FROM assistant_dossiers WHERE code = $1', [req.params.code]);
    if (!d) return void res.status(404).json({ ok: false, message: 'Dossier introuvable' });
    const c = { ...d.corrections };
    if (parsed.data.statut !== undefined) {
      if (parsed.data.statut === null || parsed.data.statut === d.statut) delete c.statut;
      else c.statut = parsed.data.statut;
    }
    if (parsed.data.note !== undefined) {
      if (parsed.data.note.trim() === '') delete c.note;
      else c.note = parsed.data.note;
    }
    const vide = c.statut === undefined && c.note === undefined;
    const corrections = vide ? {} : { ...c, maj: new Date().toISOString(), par: req.session!.nom };
    await executer('UPDATE assistant_dossiers SET corrections = $2, updated_at = now() WHERE code = $1', [d.code, JSON.stringify(corrections)]);
    res.json({ ok: true, message: 'Enregistré', corrections });
  })
);

/** Corrections à transmettre à l'assistant pour sa prochaine mise à jour (même format que l'application d'origine). */
assistantRouter.get(
  '/corrections/export',
  traiter(async (req, res) => {
    const lignes = await requete<{ code: string; corrections: Record<string, unknown> }>(
      "SELECT code, corrections FROM assistant_dossiers WHERE corrections <> '{}'::jsonb ORDER BY code"
    );
    const corrections = Object.fromEntries(lignes.map((l) => [l.code, l.corrections]));
    const jour = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="corrections_dossiers_${jour}.json"`);
    res.json({ exporte_le: new Date().toISOString(), corrections });
    void consigner(identiteDeRequete(req), 'assistant_export_corrections', `${lignes.length} dossier(s)`);
  })
);

// --- Prestataires ---------------------------------------------------------------------------------

assistantRouter.get(
  '/prestataires',
  traiter(async (_req, res) => {
    const prestataires = await requete('SELECT * FROM assistant_prestataires ORDER BY nom');
    res.json({ prestataires });
  })
);

// --- Relevé de la boîte Gmail ---------------------------------------------------------------------

assistantRouter.get(
  '/releve',
  traiter(async (_req, res) => {
    res.json(await etatReleve());
  })
);

/** Relève la boîte tout de suite (bouton « Mettre à jour l'assistant »). */
assistantRouter.post(
  '/releve',
  traiter(async (req, res) => {
    try {
      const bilan = await relever(req.session!.nom);
      await consigner(identiteDeRequete(req), 'assistant_releve', `${bilan.nouveaux} mail(s)`, bilan);
      if (bilan.erreur && bilan.lus === 0) return void res.json({ ok: false, message: bilan.erreur, bilan });
      const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
      const message =
        bilan.lus === 0
          ? 'Aucun nouveau mail'
          : `${pluriel(bilan.nouveaux, 'mail')} ajouté${bilan.nouveaux > 1 ? 's' : ''} au registre` +
            (bilan.dossiersCrees ? `, ${pluriel(bilan.dossiersCrees, 'dossier')} ouvert${bilan.dossiersCrees > 1 ? 's' : ''}` : '') +
            (bilan.doublons ? `, ${pluriel(bilan.doublons, 'doublon')} ignoré${bilan.doublons > 1 ? 's' : ''}` : '') +
            (bilan.erreur ? `. Attention : ${bilan.erreur}` : '');
      res.json({ ok: true, message, bilan });
    } catch (e) {
      if (e instanceof ReleveImpossible) return void res.json({ ok: false, message: e.message });
      throw e;
    }
  })
);

/** Un mail relevé, avec son texte complet. */
assistantRouter.get(
  '/mails/:id',
  traiter(async (req, res) => {
    const mail = await requeteUne(
      `SELECT id, numero, date, expediteur, objet, dossier_code, source, sens, destinataires, consigne, pieces_jointes, classement, corps
         FROM assistant_mails WHERE id = $1`,
      [req.params.id]
    );
    if (!mail) return void res.status(404).json({ ok: false, message: 'Mail introuvable' });
    res.json({ mail });
  })
);

/** Déplace un mail vers un autre dossier, ou vers un nouveau dossier. */
assistantRouter.put(
  '/mails/:id/dossier',
  traiter(async (req, res) => {
    const parsed = z.object({ dossier: z.string().min(1).max(60) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const resultat = await transaction(async (client) => {
      const mail = await requeteUne<{ _id: string; numero: number; objet: string; dossierCode: string; expediteur: string; sens: string }>(
        'SELECT * FROM assistant_mails WHERE id = $1 FOR UPDATE',
        [req.params.id],
        client
      );
      if (!mail) throw new ErreurMetier('Mail introuvable');
      let cible = parsed.data.dossier;
      if (cible === mail.dossierCode) throw new ErreurMetier('Le mail est déjà dans ce dossier');
      if (cible === 'nouveau') {
        const r = await requeteUne<{ n: number }>(
          "SELECT coalesce(max(substring(code from 2)::int), 0) + 1 AS n FROM assistant_dossiers WHERE code ~ '^M[0-9]+$'",
          [],
          client
        );
        cible = `M${String(r!.n).padStart(3, '0')}`;
        const titre = mail.objet.replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, '').slice(0, 300) || 'Sans objet';
        const donnees = {
          id: cible, evenement: '', branche: '', titre, demandeur: mail.sens === 'reçu' ? mail.expediteur : '', contacts: [],
          statut: 'À traiter', priorite: 'Normale', echeances: [], resume: '', actions: [], vigilance: [], pieces_jointes: [],
          mails: [], remarques: [], origine: 'releve', classement: 'manuel',
        };
        await insererUn('assistant_dossiers', { code: cible, titre, statut: 'À traiter', priorite: 'Normale', donnees, source: 'releve' }, client);
      } else if (!(await requeteUne('SELECT 1 FROM assistant_dossiers WHERE code = $1', [cible], client))) {
        throw new ErreurMetier('Dossier introuvable');
      }
      // Retire le numéro du dossier d'origine, l'ajoute au dossier cible.
      await executer(
        `UPDATE assistant_dossiers SET donnees = jsonb_set(donnees, '{mails}',
           coalesce((SELECT jsonb_agg(x) FROM jsonb_array_elements(coalesce(donnees->'mails', '[]'::jsonb)) x WHERE x <> to_jsonb($2::int)), '[]'::jsonb)),
           updated_at = now() WHERE code = $1`,
        [mail.dossierCode, mail.numero],
        client
      );
      await executer(
        `UPDATE assistant_dossiers SET donnees = jsonb_set(donnees, '{mails}', coalesce(donnees->'mails', '[]'::jsonb) || to_jsonb($2::int)),
           updated_at = now() WHERE code = $1`,
        [cible, mail.numero],
        client
      );
      await executer("UPDATE assistant_mails SET dossier_code = $2, classement = 'manuel', updated_at = now() WHERE id = $1", [mail._id, cible], client);
      return { de: mail.dossierCode, vers: cible };
    });
    await consigner(identiteDeRequete(req), 'assistant_mail_deplace', req.params.id, resultat);
    res.json({ ok: true, message: `Mail déplacé vers le dossier ${resultat.vers}`, dossier: resultat.vers });
  })
);

/** Reclasse un dossier : événement, branche, titre (dossiers du relevé surtout ; un import d'index réécrit les siens). */
assistantRouter.put(
  '/dossiers/:code/classement',
  traiter(async (req, res) => {
    const parsed = z
      .object({
        evenement: z.string().max(60).optional(),
        branche: z.string().max(60).optional(),
        titre: z.string().trim().min(1).max(300).optional(),
        priorite: z.enum(['Haute', 'Normale', 'Basse']).optional(),
      })
      .refine((v) => Object.keys(v).length > 0)
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { evenement, branche, titre, priorite } = parsed.data;
    if (evenement && !(await requeteUne('SELECT 1 FROM assistant_evenements WHERE code = $1', [evenement]))) throw new ErreurMetier('Événement inconnu');
    if (branche && !BRANCHES.includes(branche)) throw new ErreurMetier('Branche inconnue');
    const d = await requeteUne<LigneDossier>('SELECT * FROM assistant_dossiers WHERE code = $1', [req.params.code]);
    if (!d) return void res.status(404).json({ ok: false, message: 'Dossier introuvable' });
    const donnees = { ...d.donnees };
    const maj: Record<string, string> = {};
    if (evenement !== undefined) maj.evenement_code = donnees.evenement = evenement;
    if (branche !== undefined) maj.branche = donnees.branche = branche;
    if (titre !== undefined) maj.titre = donnees.titre = titre;
    if (priorite !== undefined) maj.priorite = donnees.priorite = priorite;
    const colonnes = Object.keys(maj);
    await executer(
      `UPDATE assistant_dossiers SET ${colonnes.map((c, i) => `${c} = $${i + 2}`).join(', ')}, donnees = $${colonnes.length + 2}, updated_at = now() WHERE code = $1`,
      [d.code, ...colonnes.map((c) => maj[c]), JSON.stringify(donnees)]
    );
    await consigner(identiteDeRequete(req), 'assistant_reclassement', d.code, parsed.data);
    res.json({ ok: true, message: 'Dossier reclassé' });
  })
);

// --- Réglages de la messagerie de l'assistant -------------------------------------------------------

const schemaConfiguration = z.object({
  adresse: z.string().trim().email().max(200),
  motDePasse: z.string().max(200).optional(),
  minutes: z.number().int().min(0).max(1440),
  adressesService: z.string().max(2000).optional().default(''),
});

/**
 * Enregistre les réglages saisis à l'écran, après un essai de connexion. Le mot de passe n'est jamais
 * renvoyé ; laissé vide, l'ancien est conservé.
 */
assistantRouter.put(
  '/configuration',
  traiter(async (req, res) => {
    const parsed = schemaConfiguration.safeParse(req.body);
    if (!parsed.success) return invalide(res, 'Adresse ou fréquence invalide');
    const { adresse, minutes } = parsed.data;
    const motDePasse = (parsed.data.motDePasse ?? '').replace(/\s+/g, '');
    const actuelle = await lireConfiguration();
    const memeAdresse = actuelle.origine === 'ecran' && actuelle.adresse === adresse.toLowerCase();
    const pourEssai = motDePasse || (memeAdresse ? await motDePasseEnregistre() : '');
    if (!pourEssai) return invalide(res, 'Indiquez le mot de passe');
    try {
      await testerConnexion({ adresse, motDePasse: pourEssai });
    } catch (e) {
      if (e instanceof ConnexionImpossible) return void res.json({ ok: false, message: e.message });
      throw e;
    }
    const adressesService = listeAdresses(parsed.data.adressesService);
    await enregistrerConfiguration({ adresse, motDePasse: motDePasse || undefined, minutes, adressesService }, req.session!.nom);
    await consigner(identiteDeRequete(req), 'assistant_configuration', 'messagerie', { minutes, adressesService: adressesService.length });
    res.json({ ok: true, message: 'Connexion réussie, réglages enregistrés' });
  })
);

assistantRouter.delete(
  '/configuration',
  traiter(async (req, res) => {
    await supprimerConfiguration();
    await consigner(identiteDeRequete(req), 'assistant_configuration', 'messagerie', { supprimee: true });
    res.json({ ok: true, message: 'Réglages supprimés' });
  })
);

/** Pièce jointe copiée par la mise à jour automatique. */
assistantRouter.get(
  '/fichiers/:id',
  traiter(async (req, res) => {
    const f = await requeteUne<{ cleStockage: string; typeMime: string; nomOrigine: string }>(
      "SELECT * FROM fichiers WHERE id = $1 AND module = 'assistant'",
      [req.params.id]
    );
    if (!f) return void res.status(404).json({ ok: false, message: 'Fichier introuvable' });
    if (!stockageActif()) return void res.status(503).json({ ok: false, message: 'Stockage des fichiers non configuré' });
    const flux = await lireObjet(f.cleStockage);
    res.setHeader('Content-Type', f.typeMime);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.nomOrigine)}`);
    await new Promise<void>((ok, ko) => flux.on('error', ko).on('end', () => ok()).pipe(res));
  })
);

// --- Suppression de mails du registre ---------------------------------------------------------------

/**
 * Supprime des mails du registre. Leur empreinte est gardée : transférés à nouveau, ils ne reviennent
 * pas. Les pièces jointes copiées sont effacées ; un dossier ouvert automatiquement qui n'a plus aucun
 * mail (et aucune tâche au rétroplanning) est supprimé avec eux.
 */
assistantRouter.post(
  '/mails/supprimer',
  traiter(async (req, res) => {
    const parsed = z.object({ ids: z.array(z.string().min(1).max(60)).min(1).max(500) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const fichiersAEffacer: string[] = [];
    const bilan = await transaction(async (client) => {
      const mails = await requete<{
        _id: string;
        numero: number;
        objet: string;
        dossierCode: string;
        empreinte: string | null;
        piecesJointes: { fichierId?: string }[];
      }>('SELECT id, numero, objet, dossier_code, empreinte, pieces_jointes FROM assistant_mails WHERE id = ANY($1) FOR UPDATE', [parsed.data.ids], client);
      const parDossier = new Map<string, { numeros: number[]; fichiers: string[] }>();
      for (const m of mails) {
        const f = (m.piecesJointes ?? []).map((p) => p.fichierId).filter((x): x is string => !!x);
        fichiersAEffacer.push(...f);
        const e = parDossier.get(m.dossierCode) ?? { numeros: [], fichiers: [] };
        e.numeros.push(m.numero);
        e.fichiers.push(...f);
        parDossier.set(m.dossierCode, e);
        if (m.empreinte) {
          await executer(
            'INSERT INTO assistant_mails_supprimes (empreinte, objet, par) VALUES ($1, $2, $3) ON CONFLICT (empreinte) DO NOTHING',
            [m.empreinte, m.objet.slice(0, 300), req.session!.nom],
            client
          );
        }
      }
      await executer('DELETE FROM assistant_mails WHERE id = ANY($1)', [mails.map((m) => m._id)], client);
      const dossiersSupprimes: string[] = [];
      for (const [code, { numeros, fichiers }] of parDossier) {
        const d = await requeteUne<LigneDossier & { source: string }>('SELECT * FROM assistant_dossiers WHERE code = $1 FOR UPDATE', [code], client);
        if (!d) continue;
        const donnees = { ...d.donnees } as Record<string, unknown>;
        const restants = (Array.isArray(donnees.mails) ? (donnees.mails as number[]) : []).filter((n) => !numeros.includes(n));
        donnees.mails = restants;
        if (Array.isArray(donnees.pieces_jointes)) {
          donnees.pieces_jointes = (donnees.pieces_jointes as { fichierId?: string }[]).filter((p) => !p.fichierId || !fichiers.includes(p.fichierId));
        }
        if (d.source === 'releve' && restants.length === 0 && Object.keys(d.converties).length === 0) {
          await executer('DELETE FROM assistant_dossiers WHERE code = $1', [code], client);
          dossiersSupprimes.push(code);
        } else {
          await executer('UPDATE assistant_dossiers SET donnees = $2, updated_at = now() WHERE code = $1', [code, JSON.stringify(donnees)], client);
        }
      }
      return { mails: mails.length, dossiersSupprimes };
    });
    for (const id of fichiersAEffacer) await supprimerFichier(id).catch(() => undefined);
    await consigner(identiteDeRequete(req), 'assistant_mails_supprimes', `${bilan.mails} mail(s)`, bilan);
    const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
    res.json({
      ok: true,
      message:
        `${pluriel(bilan.mails, 'mail')} supprimé${bilan.mails > 1 ? 's' : ''}` +
        (bilan.dossiersSupprimes.length ? `, ${pluriel(bilan.dossiersSupprimes.length, 'dossier')} vide${bilan.dossiersSupprimes.length > 1 ? 's' : ''} retiré${bilan.dossiersSupprimes.length > 1 ? 's' : ''}` : ''),
      ...bilan,
    });
  })
);

// --- Analyse complète ------------------------------------------------------------------------------

/** Enregistre la clé du service d'analyse (essayée d'abord), ou la retire. */
assistantRouter.put(
  '/configuration/analyse',
  traiter(async (req, res) => {
    const parsed = z
      .object({ cle: z.string().trim().max(300).nullable(), modele: z.string().trim().max(100).optional().default('') })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { cle, modele } = parsed.data;
    if (cle) {
      try {
        await testerCleAnalyse(cle, modele);
      } catch (e) {
        if (e instanceof AnalyseImpossible) return void res.json({ ok: false, message: e.message });
        throw e;
      }
    }
    await enregistrerCleAnalyse(cle || null, modele, req.session!.nom);
    await consigner(identiteDeRequete(req), 'assistant_configuration', 'analyse', { active: !!cle });
    res.json({ ok: true, message: cle ? 'Clé acceptée : analyse complète activée' : 'Analyse complète désactivée' });
  })
);

/** Analyse (ou réanalyse) un dossier. */
assistantRouter.post(
  '/dossiers/:code/analyser',
  traiter(async (req, res) => {
    try {
      await analyserDossier(req.params.code);
    } catch (e) {
      if (e instanceof AnalyseImpossible) return void res.json({ ok: false, message: e.message });
      throw e;
    }
    await consigner(identiteDeRequete(req), 'assistant_analyse', req.params.code);
    res.json({ ok: true, message: 'Dossier analysé' });
  })
);

/** Analyse les dossiers ouverts automatiquement qui ne l'ont pas encore été (20 au plus par appel). */
assistantRouter.post(
  '/analyser-dossiers',
  traiter(async (req, res) => {
    const codes = await requete<{ code: string }>(
      "SELECT code FROM assistant_dossiers WHERE source = 'releve' AND NOT (donnees ? 'analyse') AND statut !~* '^clos' ORDER BY code LIMIT 20"
    );
    let faits = 0;
    let erreur = '';
    for (const { code } of codes) {
      try {
        await analyserDossier(code);
        faits++;
      } catch (e) {
        erreur = (e as Error).message;
        if (/refusée|non activée|saturé/.test(erreur)) break;
      }
    }
    await consigner(identiteDeRequete(req), 'assistant_analyse', `${faits} dossier(s)`);
    const reste = await requeteUne<{ n: number }>(
      "SELECT count(*) AS n FROM assistant_dossiers WHERE source = 'releve' AND NOT (donnees ? 'analyse') AND statut !~* '^clos'"
    );
    res.json({
      ok: faits > 0 || !erreur,
      message: `${faits} dossier(s) analysé(s)${reste?.n ? `, ${reste.n} restant(s)` : ''}${erreur ? `. ${erreur}` : ''}`,
    });
  })
);

// --- Liens avec l'accueil et la fiche projet --------------------------------------------------------

type DossierResume = { code: string; titre: string; statut: string; priorite: string; branche: string; evenementCode: string; donnees: Record<string, unknown>; corrections: { statut?: string } };
const prochaineDe = (d: DossierResume, jour: string) =>
  ((Array.isArray(d.donnees.echeances) ? d.donnees.echeances : []) as { date?: string; libelle?: string }[])
    .filter((e) => e.date && e.date.slice(0, 10) >= jour)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0] ?? null;

/** Encart de l'accueil : courrier du service en un coup d'œil. */
assistantRouter.get(
  '/accueil',
  traiter(async (_req, res) => {
    const jour = aujourdhui();
    const dans7 = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const [etat, dossiers, recents, nouveaux] = await Promise.all([
      etatReleve(),
      requete<DossierResume>('SELECT code, titre, statut, priorite, branche, evenement_code, donnees, corrections FROM assistant_dossiers'),
      requete("SELECT date, sens, expediteur, objet, dossier_code FROM assistant_mails WHERE source = 'releve' ORDER BY date_envoi DESC NULLS LAST LIMIT 5"),
      requeteUne<{ n: number }>("SELECT count(*) AS n FROM assistant_mails WHERE source = 'releve' AND created_at > now() - interval '24 hours'"),
    ]);
    const statut = (d: DossierResume) => d.corrections?.statut ?? d.statut;
    const ouverts = dossiers.filter((d) => !/^clos|information/i.test(statut(d)));
    const echeances = dossiers
      .flatMap((d) =>
        ((Array.isArray(d.donnees.echeances) ? d.donnees.echeances : []) as { date?: string; libelle?: string }[])
          .filter((e) => e.date && e.date.slice(0, 10) >= jour && e.date.slice(0, 10) <= dans7)
          .map((e) => ({ date: e.date!.slice(0, 10), libelle: e.libelle ?? '', code: d.code, titre: d.titre }))
      )
      .filter((e) => ouverts.some((d) => d.code === e.code))
      .sort((a, b) => a.date.localeCompare(b.date));
    const dernier = (etat.derniers[0] ?? null) as { debut?: Date; erreur?: string } | null;
    res.json({
      configure: etat.configure,
      derniereMaj: dernier?.debut ?? null,
      erreur: dernier?.erreur ?? '',
      nouveauxMails: nouveaux?.n ?? 0,
      ouverts: ouverts.length,
      aTraiter: ouverts.filter((d) => /traiter/i.test(statut(d))).length,
      haute: ouverts.filter((d) => d.priorite === 'Haute').length,
      echeances: echeances.slice(0, 6),
      nombreEcheances: echeances.length,
      recents,
    });
  })
);

/** Dossiers et mails rattachés à un projet (par l'événement de l'assistant relié au projet). */
assistantRouter.get(
  '/projet/:id',
  traiter(async (req, res) => {
    const jour = aujourdhui();
    const dossiers = await requete<DossierResume & { nombreMails: number }>(
      `SELECT d.code, d.titre, d.statut, d.priorite, d.branche, d.evenement_code, d.donnees, d.corrections,
              (SELECT count(*) FROM assistant_mails m WHERE m.dossier_code = d.code) AS nombre_mails
         FROM assistant_dossiers d JOIN assistant_evenements e ON e.code = d.evenement_code
        WHERE e.projet_id = $1 ORDER BY d.code`,
      [req.params.id]
    );
    const mails = await requete(
      `SELECT m.date, m.sens, m.expediteur, m.objet, m.dossier_code FROM assistant_mails m
         JOIN assistant_dossiers d ON d.code = m.dossier_code JOIN assistant_evenements e ON e.code = d.evenement_code
        WHERE e.projet_id = $1 ORDER BY m.date DESC LIMIT 20`,
      [req.params.id]
    );
    res.json({
      dossiers: dossiers.map((d) => ({
        code: d.code,
        titre: d.titre,
        statut: d.corrections?.statut ?? d.statut,
        priorite: d.priorite,
        branche: d.branche,
        nombreMails: d.nombreMails,
        prochaine: prochaineDe(d, jour),
        vigilance: ((Array.isArray(d.donnees.vigilance) ? d.donnees.vigilance : []) as string[])[0] ?? null,
      })),
      mails,
    });
  })
);

// --- Rangement des pièces jointes dans OneDrive -----------------------------------------------------
//
// Le rangement lui-même se fait dans le navigateur du chef de service (Outlook Web → « Enregistrer sur
// OneDrive » → Mes fichiers → Assistant → dossier de l'événement), comme le faisait l'assistant de bureau.
// L'application fournit la liste de ce qui attend et note l'emplacement de chaque pièce rangée.

const DOSSIER_SANS_EVENEMENT = 'Fonctionnement du service';
/** « La Féerique 2026 – Marché de Noël et château du Père Noël » → « La Féerique 2026 ». */
const nomCourt = (nom: string) => nom.split(/\s+[–—-]\s+/)[0].replace(/[\\/:*?"<>|#%]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

interface PieceEnBase {
  nom: string;
  type: string;
  taille: number;
  fichierId?: string;
  onedrive?: { chemin: string; lien?: string; le: string };
}

/** Pièces jointes des mails arrivés automatiquement, pas encore rangées dans OneDrive. */
assistantRouter.get(
  '/pieces/a-ranger',
  traiter(async (_req, res) => {
    const lignes = await requete<{
      _id: string; numero: number; date: string; expediteur: string; objet: string; dossierCode: string; piecesJointes: PieceEnBase[];
      titre: string | null; evenementCode: string | null; evenementNom: string | null; dossierOnedrive: string | null;
    }>(
      `SELECT m.id, m.numero, m.date, m.expediteur, m.objet, m.dossier_code, m.pieces_jointes,
              d.titre, d.evenement_code, e.nom AS evenement_nom, e.dossier_onedrive
         FROM assistant_mails m
         LEFT JOIN assistant_dossiers d ON d.code = m.dossier_code
         LEFT JOIN assistant_evenements e ON e.code = d.evenement_code
        WHERE m.source = 'releve' AND jsonb_array_length(m.pieces_jointes) > 0
        ORDER BY m.date`
    );
    const pieces = lignes.flatMap((l) =>
      (l.piecesJointes ?? [])
        .filter((p) => !p.onedrive && !/\.(vcf|p7s)$|^winmail\.dat$/i.test(p.nom))
        .map((p) => ({
          mailId: l._id,
          date: l.date,
          expediteur: l.expediteur,
          objet: l.objet,
          nom: p.nom,
          taille: p.taille,
          dossier: l.dossierCode,
          titreDossier: l.titre ?? '',
          evenement: l.evenementCode ?? '',
          dossierOneDrive: l.dossierOnedrive || (l.evenementNom ? nomCourt(l.evenementNom) : DOSSIER_SANS_EVENEMENT),
        }))
    );
    res.json({ racine: 'Mes fichiers/Assistant', pieces });
  })
);

/** Note qu'une pièce jointe a été rangée dans OneDrive. */
assistantRouter.post(
  '/pieces/rangement',
  traiter(async (req, res) => {
    const parsed = z
      .object({
        mailId: z.string().min(1).max(60),
        nom: z.string().min(1).max(300),
        chemin: z.string().trim().min(1).max(500),
        lien: z.string().url().max(2000).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { mailId, nom, chemin, lien } = parsed.data;
    const fait = await transaction(async (client) => {
      const m = await requeteUne<{ dossierCode: string; piecesJointes: PieceEnBase[] }>(
        'SELECT dossier_code, pieces_jointes FROM assistant_mails WHERE id = $1 FOR UPDATE',
        [mailId],
        client
      );
      if (!m) throw new ErreurMetier('Mail introuvable');
      const pj = (m.piecesJointes ?? []).find((p) => p.nom === nom);
      if (!pj) throw new ErreurMetier('Pièce jointe introuvable dans ce mail');
      pj.onedrive = { chemin, ...(lien ? { lien } : {}), le: new Date().toISOString() };
      await executer('UPDATE assistant_mails SET pieces_jointes = $2, updated_at = now() WHERE id = $1', [mailId, JSON.stringify(m.piecesJointes)], client);
      // Fiche du dossier : l'emplacement affiché devient OneDrive.
      const d = await requeteUne<{ donnees: Record<string, unknown> }>('SELECT donnees FROM assistant_dossiers WHERE code = $1 FOR UPDATE', [m.dossierCode], client);
      if (d && Array.isArray(d.donnees.pieces_jointes)) {
        const liste = d.donnees.pieces_jointes as Record<string, unknown>[];
        const cible = liste.find((p) => p.nom === nom && (!pj.fichierId || p.fichierId === pj.fichierId) && !p.onedrive) ?? liste.find((p) => p.nom === nom);
        if (cible) {
          cible.emplacement = `OneDrive › ${chemin.replace(/\//g, ' › ')}`;
          cible.onedrive = lien ?? true;
          await executer('UPDATE assistant_dossiers SET donnees = $2, updated_at = now() WHERE code = $1', [m.dossierCode, JSON.stringify(d.donnees)], client);
        }
      }
      return true;
    });
    if (fait) await consigner(identiteDeRequete(req), 'assistant_piece_rangee', nom, { chemin });
    res.json({ ok: true, message: 'Pièce jointe notée comme rangée' });
  })
);

/** Nom du dossier OneDrive d'un événement (sous Mes fichiers → Assistant). */
assistantRouter.put(
  '/evenements/:code/onedrive',
  traiter(async (req, res) => {
    const parsed = z.object({ dossier: z.string().trim().max(120) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const n = await executer('UPDATE assistant_evenements SET dossier_onedrive = $2, updated_at = now() WHERE code = $1', [req.params.code, parsed.data.dossier]);
    if (!n) return void res.status(404).json({ ok: false, message: 'Événement introuvable' });
    res.json({ ok: true, message: 'Dossier OneDrive enregistré' });
  })
);

// --- Lecture d'Outlook Web (méthode principale) ---------------------------------------------------

assistantRouter.get(
  '/outlook/contexte',
  traiter(async (_req, res) => {
    res.json(await contexteDepot());
  })
);

const schemaPieceDeposee = z.object({
  nom: z.string().min(1).max(300),
  type: z.string().max(120).optional(),
  taille: z.number().int().min(0).optional(),
  onedrive: z.object({ chemin: z.string().min(1).max(500), lien: z.string().url().max(2000).optional() }).optional(),
});
const schemaConversation = z.object({
  consigne: z.string().max(2000).optional(),
  mails: z
    .array(
      z.object({
        expediteurNom: z.string().min(1).max(200),
        expediteurAdresse: z.string().max(200).optional(),
        destinataires: z.string().max(2000).optional(),
        date: z.string().min(10).max(40),
        objet: z.string().max(500),
        corps: z.string().max(40_000),
        sens: z.enum(['reçu', 'envoyé']),
        piecesJointes: z.array(schemaPieceDeposee).max(30).optional(),
      })
    )
    .min(1)
    .max(40),
  analyse: schemaReponse,
});

/** Dépose des conversations lues et comprises dans Outlook Web ; rien n'est remplacé. */
assistantRouter.post(
  '/outlook/depot',
  traiter(async (req, res) => {
    const parsed = z.object({ conversations: z.array(schemaConversation).min(1).max(50) }).safeParse(req.body);
    if (!parsed.success) return invalide(res, `Dépôt invalide : ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}`);
    const resultats: { objet: string; dossier: string | null; nouveaux: number; doublons: number }[] = [];
    for (const c of parsed.data.conversations) {
      const r = await deposerConversation(c, req.session!.nom);
      resultats.push({ objet: c.mails[c.mails.length - 1].objet, dossier: r.dossier, nouveaux: r.bilan.nouveaux, doublons: r.bilan.doublons });
    }
    const nouveaux = resultats.reduce((n, r) => n + r.nouveaux, 0);
    await consigner(identiteDeRequete(req), 'assistant_releve', `${nouveaux} mail(s) lus dans Outlook`, { conversations: resultats.length });
    res.json({ ok: true, message: `${nouveaux} mail(s) ajouté(s) au registre`, resultats });
  })
);
