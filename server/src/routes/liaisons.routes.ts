import { Router, type Request } from 'express';
import { z } from 'zod';
import { requete, requeteUne, transaction } from '../db.js';
import type { Evenement } from '../modeles.js';
import { peut, requireAuth, requireModule } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { queryString } from '../lib/queryString.js';
import { motifRechercheInsensibleAccents } from '../lib/rechercheAccents.js';
import { genererProjet, indicateursProjets, conflitsMateriel } from '../lib/projets.js';
import { STATUTS_EN_ATTENTE } from '../lib/stock.js';
import { cleDeLigne, conditionLienSerie, jourCivil, lignesSerie, resoudre, resumeSerie, type ResumeEvenement } from '../lib/liaisons.js';

export const liaisonsRouter = Router();

liaisonsRouter.use(requireAuth);

/** Un compte qui n'a accès à aucun des modules concernés n'a rien à faire des liaisons. */
const accesUnModule = (req: Request) =>
  peut(req.session, 'calendrier', 'lecture') || peut(req.session, 'stock', 'contribution') || peut(req.session, 'projets', 'lecture');

/**
 * Recherche d'événements du calendrier (séries regroupées), pour les listes de choix : rattacher
 * un projet ou une demande de goodies. Par défaut, les événements à venir ou récents.
 */
liaisonsRouter.get('/evenements', async (req, res, next) => {
  try {
    if (!accesUnModule(req)) {
      res.status(403).json({ ok: false, message: 'Action non autorisée' });
      return;
    }
    const recherche = queryString(req.query.recherche)?.trim() ?? '';
    const params: unknown[] = [];
    let filtre = 'COALESCE(date_de_fin, date_de_debut, date_clef) >= CURRENT_DATE - 30';
    if (recherche) {
      params.push(motifRechercheInsensibleAccents(recherche));
      filtre += ` AND (nom ~* $1 OR lieu ~* $1)`;
    }
    const evenements = await requete(
      `SELECT min(id) AS id, nom, date_de_debut, date_de_fin, min(lieu) AS lieu, min(statut) AS statut, count(*) AS nombre_jours
         FROM evenements WHERE ${filtre}
        GROUP BY nom, date_de_debut, date_de_fin
        ORDER BY date_de_debut NULLS LAST LIMIT 30`,
      params
    );
    res.json({ evenements });
  } catch (err) {
    next(err);
  }
});

/** Projets et demandes de goodies liés à une série du calendrier, selon les droits du compte. */
async function liesA(req: Request, serie: ResumeEvenement, ids: string[]) {
  const lien = conditionLienSerie(serie, ids, 'p');
  const projets = peut(req.session, 'projets', 'lecture')
    ? await indicateursProjets(lien.texte, lien.params)
    : null;
  let demandesStock = null;
  if (peut(req.session, 'stock', 'contribution')) {
    const lienDemande = conditionLienSerie(serie, ids, 'd');
    const projetIds = (projets ?? (await requete<{ _id: string }>(`SELECT p.id FROM projets p WHERE ${lien.texte}`, lien.params))).map((p) => p._id);
    const params = [...lienDemande.params, projetIds];
    let filtre = `(${lienDemande.texte} OR d.projet_id = ANY($5))`;
    if (!peut(req.session, 'stock', 'validation')) {
      params.push(req.session!.directionId, req.session!.userId);
      filtre += ` AND (d.direction_id = $6 OR d.demandeur_id = $7)`;
    }
    demandesStock = await requete(
      `SELECT d.id, d.numero, d.direction_nom, d.quantite, d.statut, d.date_besoin, d.valeur, a.reference, a.libelle
         FROM stock_demandes d JOIN stock_articles a ON a.id = d.article_id
        WHERE ${filtre} ORDER BY d.created_at`,
      params
    );
  }
  return { projets, demandesStock };
}

/** Fiche événement unique : l'événement du calendrier, son projet et ses demandes de goodies. */
liaisonsRouter.get('/evenement/:id', async (req, res, next) => {
  try {
    if (!accesUnModule(req)) {
      res.status(403).json({ ok: false, message: 'Action non autorisée' });
      return;
    }
    const lignes = await lignesSerie(req.params.id);
    const serie = await resumeSerie(req.params.id);
    if (!serie) {
      res.status(404).json({ ok: false, message: 'Événement introuvable dans le calendrier' });
      return;
    }
    res.json({ evenement: serie, ...(await liesA(req, serie, lignes.map((l) => l._id))) });
  } catch (err) {
    next(err);
  }
});

/** Crée le projet d'un événement du calendrier ; l'inscription au calendrier fait foi pour l'échéance des 6 mois. */
liaisonsRouter.post('/evenement/:id/projet', requireModule('projets', 'administration'), async (req, res, next) => {
  try {
    // Jauge et caractéristiques facultatives : elles fixent le niveau et les modules, modifiables ensuite.
    const options = z
      .object({ jauge: z.number().int().min(0).max(10_000_000).nullable().default(null), criteres: z.array(z.string().max(40)).max(40).default([]) })
      .safeParse(req.body ?? {});
    if (!options.success) {
      res.status(400).json({ ok: false, message: 'Données invalides' });
      return;
    }
    const lignes = await lignesSerie(req.params.id);
    const serie = await resumeSerie(req.params.id);
    if (!serie) {
      res.status(404).json({ ok: false, message: 'Événement introuvable dans le calendrier' });
      return;
    }
    const lien = conditionLienSerie(serie, lignes.map((l) => l._id));
    if (await requeteUne(`SELECT 1 FROM projets WHERE ${lien.texte}`, lien.params)) {
      res.json({ ok: false, message: 'Cet événement a déjà un projet' });
      return;
    }
    const debut = jourCivil(serie.dateDeDebut);
    if (!debut) {
      res.json({ ok: false, message: "L'événement n'a pas de date" });
      return;
    }
    const fin = jourCivil(serie.dateDeFin);
    const projet = await transaction(async (client) => {
      const [cree] = await requete<{ _id: string; titre: string }>(
        `INSERT INTO projets (titre, jauge, date_jour, date_fin, lieu, demandeur, inscrit_le, evenement_id, evenement_nom, evenement_debut, evenement_fin, criteres)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, titre`,
        [
          serie.nom,
          options.data.jauge,
          debut,
          fin && fin !== debut ? fin : null,
          serie.lieu,
          [serie.pilote, serie.directionPilote].filter(Boolean).join(' — '),
          jourCivil(serie.inscritLe),
          serie._id,
          serie.nom,
          serie.dateDeDebut,
          serie.dateDeFin,
          JSON.stringify(options.data.criteres),
        ],
        client
      );
      await genererProjet(cree._id, client);
      return cree;
    });
    await consigner(identiteDeRequete(req), 'projets_creation_depuis_calendrier', projet.titre);
    res.json({ ok: true, message: 'Projet créé et relié au calendrier', projetId: projet._id });
  } catch (err) {
    next(err);
  }
});

/** Relie un projet à un événement du calendrier, ou le détache (evenementId null). */
liaisonsRouter.put('/projet/:id/evenement', requireModule('projets', 'administration'), async (req, res, next) => {
  try {
    const parsed = z.object({ evenementId: z.string().min(1).nullable() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides' });
      return;
    }
    let cle: ReturnType<typeof cleDeLigne> = { evenementId: null, evenementNom: null, evenementDebut: null, evenementFin: null };
    if (parsed.data.evenementId) {
      const ligne = await requeteUne<Evenement>('SELECT * FROM evenements WHERE id = $1', [parsed.data.evenementId]);
      if (!ligne) {
        res.json({ ok: false, message: 'Événement introuvable dans le calendrier' });
        return;
      }
      cle = cleDeLigne(ligne);
    }
    const projet = await requeteUne<{ titre: string }>(
      `UPDATE projets SET evenement_id = $2, evenement_nom = $3, evenement_debut = $4, evenement_fin = $5 WHERE id = $1 RETURNING titre`,
      [req.params.id, cle.evenementId, cle.evenementNom, cle.evenementDebut, cle.evenementFin]
    );
    if (!projet) {
      res.status(404).json({ ok: false, message: 'Projet introuvable' });
      return;
    }
    await consigner(identiteDeRequete(req), 'projets_liaison_calendrier', projet.titre, { evenement: cle.evenementNom });
    res.json({ ok: true, message: cle.evenementId ? 'Projet relié au calendrier' : 'Projet détaché du calendrier' });
  } catch (err) {
    next(err);
  }
});

/** Résumé de l'événement du calendrier lié à un projet (null si aucun ; supprime si disparu). */
export async function evenementDuProjet(projet: { evenementId: string | null; evenementNom: string | null; evenementDebut: Date | null; evenementFin: Date | null }) {
  if (!projet.evenementId && !projet.evenementNom) return null;
  const serie = await resoudre(projet);
  return serie ? { ...serie, supprime: false } : { supprime: true, nom: projet.evenementNom };
}

// --- Synthèse transversale de l'accueil ----------------------------------------------------------

/**
 * Ce qui demande une action dans chaque module, selon les droits du compte, et les manifestations
 * des 30 prochains jours avec leur projet et leurs demandes de goodies.
 */
liaisonsRouter.get('/synthese', async (req, res, next) => {
  try {
    const s = req.session!;
    const aTraiter: { module: string; libelle: string; nombre: number; chemin: string; alerte?: boolean }[] = [];

    if (peut(s, 'calendrier', 'validation')) {
      const [{ n }] = await requete<{ n: number }>(
        `SELECT count(DISTINCT (nom, date_de_debut, date_de_fin)) AS n FROM evenements
          WHERE NOT (validation_technique AND validation_politique) AND statut <> 'Brouillon'
            AND COALESCE(date_de_fin, date_de_debut, date_clef) >= CURRENT_DATE`
      );
      aTraiter.push({ module: 'calendrier', libelle: 'événements à venir non validés', nombre: n, chemin: '/calendrier/liste' });
    }
    if (peut(s, 'stock', 'validation')) {
      const [{ demandes, mouvements, remises }] = await requete<{ demandes: number; mouvements: number; remises: number }>(
        `SELECT (SELECT count(*) FROM stock_demandes WHERE statut = ANY($1)) AS demandes,
                (SELECT count(*) FROM stock_mouvements WHERE statut IN ('À valider', 'À traiter')) AS mouvements,
                (SELECT count(*) FROM stock_demandes WHERE statut IN ('Validée', 'Validée auto')) AS remises`,
        [STATUTS_EN_ATTENTE]
      );
      aTraiter.push({ module: 'stock', libelle: 'demandes de goodies à valider', nombre: demandes, chemin: '/stock/validations', alerte: demandes > 0 });
      aTraiter.push({ module: 'stock', libelle: 'remises à préparer', nombre: remises, chemin: '/stock/validations' });
      aTraiter.push({ module: 'stock', libelle: 'ajustements et anomalies', nombre: mouvements, chemin: '/stock/validations', alerte: mouvements > 0 });
    } else if (peut(s, 'stock', 'contribution')) {
      const [{ n }] = await requete<{ n: number }>(
        'SELECT count(*) AS n FROM stock_demandes WHERE statut = ANY($1) AND (direction_id = $2 OR demandeur_id = $3)',
        [STATUTS_EN_ATTENTE, s.directionId, s.userId]
      );
      aTraiter.push({ module: 'stock', libelle: 'demandes de ma direction en attente', nombre: n, chemin: '/stock/demandes' });
    }
    if (peut(s, 'stock', 'lecture')) {
      const [{ n }] = await requete<{ n: number }>(
        `SELECT count(*) AS n FROM stock_articles WHERE actif AND stock_physique - stock_reserve <= seuil AND ($1 OR categorie = 'Goodies')`,
        [peut(s, 'stock', 'validation')]
      );
      aTraiter.push({ module: 'stock', libelle: 'articles sous le seuil', nombre: n, chemin: '/stock/catalogue', alerte: n > 0 });
    }
    if (peut(s, 'projets', 'lecture')) {
      const actifs = await indicateursProjets("p.statut IN ('preparation', 'realise') AND COALESCE(p.date_fin, p.date_jour) >= CURRENT_DATE - 7");
      const retard = actifs.reduce((n, p) => n + p.tachesEnRetard, 0);
      aTraiter.push({ module: 'projets', libelle: 'tâches de projet en retard', nombre: retard, chemin: '/projets', alerte: retard > 0 });
      const conflits = await conflitsMateriel();
      aTraiter.push({ module: 'projets', libelle: 'conflits de matériel', nombre: conflits.length, chemin: '/projets', alerte: conflits.length > 0 });
    }
    if (peut(s, 'projets', 'validation')) {
      const [{ n }] = await requete<{ n: number }>("SELECT count(*) AS n FROM projet_demandes WHERE statut IN ('nouvelle', 'instruction')");
      aTraiter.push({ module: 'projets', libelle: "demandes d'événement à instruire", nombre: n, chemin: '/projets/demandes', alerte: n > 0 });
    }

    // Manifestations des 30 prochains jours : depuis le calendrier si le compte y a accès, sinon depuis les projets.
    let prochains: unknown[] = [];
    if (peut(s, 'calendrier', 'lecture')) {
      const series = await requete<{ _id: string; nom: string; dateDeDebut: Date | null; dateDeFin: Date | null; lieu: string; statut: string; valide: boolean; dateClef: boolean }>(
        `SELECT min(id) AS id, nom, date_de_debut, date_de_fin, min(lieu) AS lieu, min(statut) AS statut,
                bool_and(validation_technique AND validation_politique) AS valide, bool_or(valid_par_date_clef) AS date_clef
           FROM evenements
          WHERE date_de_debut >= CURRENT_DATE AND date_de_debut < CURRENT_DATE + 30 AND statut <> 'Brouillon'
          GROUP BY nom, date_de_debut, date_de_fin ORDER BY date_de_debut LIMIT 60`
      );
      const voitProjets = peut(s, 'projets', 'lecture');
      const voitStock = peut(s, 'stock', 'validation');
      prochains = await Promise.all(
        series.map(async (e) => {
          const ids = (await requete<{ _id: string }>(
            'SELECT id FROM evenements WHERE nom = $1 AND date_de_debut IS NOT DISTINCT FROM $2 AND date_de_fin IS NOT DISTINCT FROM $3',
            [e.nom, e.dateDeDebut, e.dateDeFin]
          )).map((l) => l._id);
          const lien = conditionLienSerie({ nom: e.nom, dateDeDebut: e.dateDeDebut, dateDeFin: e.dateDeFin } as ResumeEvenement, ids, 'p');
          const projet = voitProjets ? (await indicateursProjets(lien.texte, lien.params))[0] ?? null : undefined;
          let goodies: number | undefined;
          if (voitStock) {
            const lienD = conditionLienSerie({ nom: e.nom, dateDeDebut: e.dateDeDebut, dateDeFin: e.dateDeFin } as ResumeEvenement, ids, 'd');
            const [{ n }] = await requete<{ n: number }>(
              `SELECT count(*) AS n FROM stock_demandes d WHERE (${lienD.texte} OR d.projet_id = $5) AND d.statut NOT IN ('Refusée', 'Annulée')`,
              [...lienD.params, projet?._id ?? null]
            );
            goodies = n;
          }
          return { ...e, projet, goodies };
        })
      );
    } else if (peut(s, 'projets', 'lecture')) {
      prochains = (await indicateursProjets("p.statut <> 'annule' AND p.date_jour >= CURRENT_DATE AND p.date_jour < CURRENT_DATE + 30")).map((p) => ({
        _id: null,
        nom: p.titre,
        dateDeDebut: p.dateJour,
        dateDeFin: p.dateFin,
        lieu: p.lieu,
        projet: p,
      }));
    }

    res.json({ aTraiter, prochains });
  } catch (err) {
    next(err);
  }
});

/** Pour la fiche projet : demandes de goodies rattachées au projet ou à son événement. */
export async function demandesStockDuProjet(
  req: Request,
  projet: { _id: string; evenementId: string | null; evenementNom: string | null; evenementDebut: Date | null; evenementFin: Date | null }
) {
  if (!peut(req.session, 'stock', 'contribution')) return null;
  const serie = await evenementDuProjet(projet);
  const params: unknown[] = [projet._id];
  let filtre = 'd.projet_id = $1';
  if (serie && !serie.supprime) {
    const ids = (await lignesSerie((serie as ResumeEvenement)._id)).map((l) => l._id);
    params.push(ids, (serie as ResumeEvenement).nom, (serie as ResumeEvenement).dateDeDebut, (serie as ResumeEvenement).dateDeFin);
    filtre += ` OR d.evenement_id = ANY($2) OR (d.evenement_nom = $3 AND d.evenement_debut IS NOT DISTINCT FROM $4 AND d.evenement_fin IS NOT DISTINCT FROM $5)`;
  }
  let droits = '';
  if (!peut(req.session, 'stock', 'validation')) {
    params.push(req.session!.directionId, req.session!.userId);
    droits = ` AND (d.direction_id = $${params.length - 1} OR d.demandeur_id = $${params.length})`;
  }
  return requete(
    `SELECT d.id, d.numero, d.direction_nom, d.quantite, d.statut, d.date_besoin, d.valeur, a.reference, a.libelle
       FROM stock_demandes d JOIN stock_articles a ON a.id = d.article_id
      WHERE (${filtre})${droits} ORDER BY d.created_at`,
    params
  );
}

