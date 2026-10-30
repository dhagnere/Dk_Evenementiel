import { Router } from 'express';
import { z } from 'zod';
import { executer, inserer, requete, requeteUne, transaction, type Executant } from '../db.js';
import type { Evenement } from '../modeles.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { LIMITES_CUD, geocoderPlusieursAdresses } from '../lib/geocodage.js';
import { motifRechercheInsensibleAccents } from '../lib/rechercheAccents.js';
import { cleIdentite } from '../lib/identiteEvenement.js';
import { creerSauvegarde } from '../lib/backup.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { queryString } from '../lib/queryString.js';
import { VALID_NATURES, VALID_NIVEAUX, VALID_OUI_NON, VALID_QUARTIERS, VALID_TYPES } from '../lib/reference-data.js';

export const eventsRouter = Router();

/** Nombre d'adresses distinctes géocodées par appel à POST /evenements/geocoder (voir plus bas). */
const LOT_GEOCODAGE = 10;

/** Année à partir de laquelle les événements sont chargés par défaut (voir GET /evenements). */
const ANNEE_PLANCHER_PAR_DEFAUT = 2024;

/** Date de référence pour savoir si un événement est terminé : dateDeFin, sinon dateDeDebut, sinon dateClef. */
const DATE_FIN_EFFECTIVE = 'COALESCE(date_de_fin, date_de_debut, date_clef)';

/** Date de référence d'un événement pour le tri et le comptage par année : dateDeDebut, sinon dateClef. */
const DATE_REFERENCE = 'COALESCE(date_de_debut, date_clef)';

/**
 * Liste des événements, avec filtres optionnels (quartier, statut, nature, type, recherche).
 *
 * Par souci de rapidité, seuls les événements entre le 1er janvier ANNEE_PLANCHER_PAR_DEFAUT et le
 * 31 décembre de l'année suivant l'année en cours sont renvoyés par défaut. Passer
 * `avecEvenementsPasses=true` retire cette borne basse pour inclure aussi tout l'historique
 * antérieur. Un événement sans aucune date (ni dateDeDebut ni dateClef) est toujours renvoyé, quel
 * que soit ce paramètre.
 *
 * Tout événement déjà terminé (date de fin passée) est automatiquement validé et considéré
 * « archivé » : plus besoin de déclencher cela manuellement. Par défaut ces événements archivés sont
 * masqués ; passer `avecEvenementsArchives=true` les inclut à nouveau (déclencheur côté client).
 */
eventsRouter.get('/', async (req, res) => {
  // Chaque valeur passe par queryString() : le parseur de requête d'Express transforme
  // ?quartier[x]= ou ?quartier=a&quartier=b en objet ou en tableau, alors qu'on attend un texte
  // simple — cette route est publique, sans authentification. Les valeurs ne sont ensuite jamais
  // concaténées au SQL : elles passent toutes en paramètres ($1, $2…).
  const quartier = queryString(req.query.quartier);
  const statut = queryString(req.query.statut);
  const nature = queryString(req.query.nature);
  const type = queryString(req.query.type);
  const searchTerm = queryString(req.query.searchTerm);
  const avecEvenementsPasses = queryString(req.query.avecEvenementsPasses);
  const avecEvenementsArchives = queryString(req.query.avecEvenementsArchives);

  const maintenant = new Date();

  // Valide et archive automatiquement tout événement dont la date de fin est déjà passée.
  await executer(
    `UPDATE evenements SET statut = 'Validée', validation_technique = true, validation_politique = true
      WHERE ${DATE_FIN_EFFECTIVE} < $1 AND (NOT validation_technique OR NOT validation_politique)`,
    [maintenant]
  );

  const conditions: string[] = [];
  const params: unknown[] = [];
  const parametre = (valeur: unknown) => {
    params.push(valeur);
    return `$${params.length}`;
  };

  if (quartier && quartier !== 'ALL') conditions.push(`quartier = ${parametre(quartier)}`);
  if (nature && nature !== 'ALL') conditions.push(`nature = ${parametre(nature)}`);
  if (type && type !== 'ALL') conditions.push(`type = ${parametre(type)}`);
  if (searchTerm && searchTerm.trim().length > 0) {
    // Insensible à la casse ET aux accents (« evenement » retrouve aussi bien « Événement »).
    conditions.push(`nom ~* ${parametre(motifRechercheInsensibleAccents(searchTerm.trim()))}`);
  }

  if (statut === 'Validée') {
    conditions.push('validation_technique AND validation_politique');
  } else if (statut && statut !== 'ALL') {
    conditions.push(`statut = ${parametre(statut)}`);
  }

  const anneeActuelle = maintenant.getFullYear();
  const finPeriode = new Date(anneeActuelle + 2, 0, 1); // borne haute exclusive : fin de l'année en cours + 1 an
  const bornesDate = [`${DATE_REFERENCE} < ${parametre(finPeriode)}`];
  if (avecEvenementsPasses !== 'true') {
    bornesDate.push(`${DATE_REFERENCE} >= ${parametre(new Date(ANNEE_PLANCHER_PAR_DEFAUT, 0, 1))}`);
  }
  conditions.push(`(${DATE_REFERENCE} IS NULL OR (${bornesDate.join(' AND ')}))`);

  if (avecEvenementsArchives !== 'true') {
    conditions.push(`(${DATE_FIN_EFFECTIVE} IS NULL OR ${DATE_FIN_EFFECTIVE} >= ${parametre(maintenant)})`);
  }

  // Trie par proximité avec aujourd'hui décroissante : l'événement dont la dateDeDebut (ou dateClef
  // en repli) est la plus proche de la date du jour arrive en premier, puis on s'éloigne
  // progressivement (dans le passé comme dans le futur) vers l'événement le plus lointain. Les
  // événements sans aucune date sont placés en dernier.
  const items = await requete<Evenement>(
    `SELECT * FROM evenements
      WHERE ${conditions.join(' AND ')}
      ORDER BY ${DATE_REFERENCE} IS NULL,
               abs(extract(epoch FROM ${DATE_REFERENCE} - ${parametre(maintenant)})),
               nom`,
    params
  );
  res.json({ items });
});

/**
 * Nombre d'événements par valeur d'une colonne (valeurs vides écartées). `colonne` vient toujours du
 * code, jamais de la requête HTTP : elle peut donc être insérée telle quelle dans le SQL.
 */
function compterPar(colonne: 'quartier' | 'nature' | 'statut' | 'type'): Promise<{ label: string; count: number }[]> {
  return requete(
    `SELECT ${colonne} AS label, count(*) AS count FROM evenements WHERE ${colonne} <> '' GROUP BY ${colonne}`
  );
}

/** Options disponibles pour les filtres (quartiers/natures/statuts/types avec comptage). */
eventsRouter.get('/options-filtres', async (_req, res) => {
  const [quartiers, natures, statuts, types] = await Promise.all([
    compterPar('quartier'),
    compterPar('nature'),
    compterPar('statut'),
    compterPar('type'),
  ]);
  res.json({ quartiers, natures, statuts, types });
});

/** Valeurs de référence (listes fermées) pour les champs à choix de la Fiche de renseignement. */
eventsRouter.get('/valeurs-reference', requireAuth, (_req, res) => {
  res.json({ quartiers: VALID_QUARTIERS, natures: VALID_NATURES, niveaux: VALID_NIVEAUX, types: VALID_TYPES });
});

const schemaFicheRenseignement = z.object({
  nom: z.string().min(1),
  dateDeDebut: z.string().min(1),
  dateDeFin: z.string().nullable().optional(),
  lieu: z.string().optional(),
  quartier: z.string().optional(),
  pilote: z.string().optional(),
  directionPilote: z.string().optional(),
  organisateur: z.string().optional(),
  nature: z.string().optional(),
  niveau: z.string().optional(),
  type: z.string().optional(),
  tardive: z.enum(VALID_OUI_NON).optional(),
  reprog: z.enum(VALID_OUI_NON).optional(),
});

/**
 * Crée un nouvel événement depuis la « Fiche de renseignement » (formulaire de saisie manuelle,
 * ouvert à tout compte connecté — administrateur ou consultant, comme le Calendrier ou la Liste).
 * Un événement de plusieurs jours crée une ligne par jour occupé (même convention que le report de
 * date, voir POST /:id/dates plus bas). L'événement créé entre dans le circuit d'arbitrage habituel
 * (statut « À valider », non validé) : rien ne le distingue ensuite d'un événement importé par CSV.
 */
eventsRouter.post('/', requireAuth, async (req, res) => {
  const parsed = schemaFicheRenseignement.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const nouveauDebut = parseJourCivil(parsed.data.dateDeDebut);
  const nouveauFin = parsed.data.dateDeFin ? parseJourCivil(parsed.data.dateDeFin) : nouveauDebut;
  if (!nouveauDebut || !nouveauFin || nouveauFin < nouveauDebut) {
    res.status(400).json({ ok: false, message: 'Dates invalides' });
    return;
  }
  const nombreJours = Math.round((nouveauFin.getTime() - nouveauDebut.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  if (nombreJours > MAX_JOURS_REPORT) {
    res.status(400).json({ ok: false, message: `La période ne peut pas dépasser ${MAX_JOURS_REPORT} jours` });
    return;
  }
  const memeJour = nombreJours === 1;

  const gabarit = {
    nom: parsed.data.nom.trim(),
    lieu: parsed.data.lieu?.trim() ?? '',
    quartier: parsed.data.quartier ?? '',
    pilote: parsed.data.pilote?.trim() ?? '',
    directionPilote: parsed.data.directionPilote?.trim() ?? '',
    organisateur: parsed.data.organisateur?.trim() ?? '',
    nature: parsed.data.nature ?? '',
    niveau: parsed.data.niveau ?? '',
    type: parsed.data.type ?? '',
    tardive: parsed.data.tardive ?? 'Non',
    reprog: parsed.data.reprog ?? 'Non',
    statut: 'À valider',
    validationTechnique: false,
    validationPolitique: false,
  };

  const nouvellesLignes: Record<string, unknown>[] = [];
  for (
    const d = new Date(nouveauDebut.getFullYear(), nouveauDebut.getMonth(), nouveauDebut.getDate());
    d <= nouveauFin && nouvellesLignes.length < MAX_JOURS_REPORT;
    d.setDate(d.getDate() + 1)
  ) {
    nouvellesLignes.push({ ...gabarit, dateClef: new Date(d), dateDeDebut: nouveauDebut, dateDeFin: memeJour ? null : nouveauFin });
  }

  // Empêche de créer un doublon d'un événement déjà en base le(s) même(s) jour(s) — même logique
  // d'identité que l'import CSV et la détection de doublons (nom normalisé + lieu + jour).
  const existants = await requete<Evenement>('SELECT event_id, nom, lieu, date_clef, date_de_debut FROM evenements');
  const clesExistantes = new Set(existants.map(cleIdentite));
  const doublon = nouvellesLignes.some((ligne) => clesExistantes.has(cleIdentite(ligne as Parameters<typeof cleIdentite>[0])));
  if (doublon) {
    res.status(409).json({ ok: false, message: 'Un événement du même nom existe déjà à cette date' });
    return;
  }

  const crees = await inserer<Evenement>('evenements', nouvellesLignes);
  await consigner(identiteDeRequete(req), 'creation_evenement', gabarit.nom, {
    dateDeDebut: nouveauDebut,
    dateDeFin: memeJour ? null : nouveauFin,
  });
  res.json({ ok: true, items: crees });
});

/**
 * Détecte les doublons déjà présents en base (par ex. créés par des imports antérieurs à la
 * normalisation du nom dans cleIdentite) : regroupe tous les événements par la même clé d'identité
 * que l'import (eventId, sinon nom normalisé + jour), et ne renvoie que les groupes de 2 lignes ou
 * plus. Réservé aux administrateurs, qui décident lesquelles conserver.
 */
eventsRouter.get('/doublons', requireAdmin, async (_req, res) => {
  const evenements = await requete<Evenement>('SELECT * FROM evenements ORDER BY nom');
  const groupes = new Map<string, Evenement[]>();
  for (const e of evenements) {
    const cle = cleIdentite(e);
    const liste = groupes.get(cle);
    if (liste) liste.push(e);
    else groupes.set(cle, [e]);
  }
  const doublons = [...groupes.values()].filter((liste) => liste.length > 1);
  res.json({ doublons });
});

/**
 * Fusionne un groupe de doublons : supprime les lignes indiquées (les autres membres du groupe sont
 * conservés tels quels). Une sauvegarde de sécurité de l'état actuel est créée juste avant, pour
 * pouvoir annuler la fusion si le mauvais exemplaire a été supprimé par erreur.
 */
eventsRouter.post('/doublons/fusionner', requireAdmin, async (req, res) => {
  const schema = z.object({ idsASupprimer: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  await creerSauvegarde('avant-fusion-doublons');
  await executer('DELETE FROM evenements WHERE id = ANY($1)', [parsed.data.idsASupprimer]);
  await consigner(identiteDeRequete(req), 'fusion_doublons', `${parsed.data.idsASupprimer.length} exemplaire(s) supprimé(s)`, {
    idsASupprimer: parsed.data.idsASupprimer,
  });
  res.json({ ok: true, supprimes: parsed.data.idsASupprimer.length });
});

/** Année à partir de laquelle porte le KPI "Total des manifestations" (voir GET /evenements/stats). */
const ANNEE_PLANCHER_TOTAL_KPI = 2015;

/** Statistiques KPI (total depuis 2015, validés, en attente, année en cours). */
eventsRouter.get('/stats', async (_req, res) => {
  const anneeActuelle = new Date().getFullYear();
  const debutAnneeActuelle = new Date(anneeActuelle, 0, 1);
  const debutAnneeSuivante = new Date(anneeActuelle + 1, 0, 1);
  const debutPlancherTotal = new Date(ANNEE_PLANCHER_TOTAL_KPI, 0, 1);

  const [[{ total, validated, anneeEnCours }], byStatut, byNature] = await Promise.all([
    requete<{ total: number; validated: number; anneeEnCours: number }>(
      `SELECT count(*) FILTER (WHERE ${DATE_REFERENCE} >= $1) AS total,
              count(*) FILTER (WHERE ${DATE_REFERENCE} >= $1 AND validation_technique AND validation_politique) AS validated,
              count(*) FILTER (WHERE ${DATE_REFERENCE} >= $2 AND ${DATE_REFERENCE} < $3) AS annee_en_cours
         FROM evenements`,
      [debutPlancherTotal, debutAnneeActuelle, debutAnneeSuivante]
    ),
    compterPar('statut'),
    compterPar('nature'),
  ]);

  res.json({
    total,
    validated,
    pending: total - validated,
    anneeActuelle,
    anneeEnCours,
    anneePlancherTotal: ANNEE_PLANCHER_TOTAL_KPI,
    byStatut,
    byNature,
  });
});

/** Condition SQL correspondant à « pas encore géocodé » (ni réussi, ni abandonné). */
const NON_GEOCODE = "statut_geocodage NOT IN ('ok', 'echec')";

/**
 * Géocode un lot d'événements en attente, pour la page Carte. La recherche est bornée au territoire
 * de la Communauté urbaine de Dunkerque (voir geocodage.ts) pour éviter qu'un nom de salle ambigu
 * (ex. « Salle des fêtes » sans indication de ville) ne soit localisé sur une commune homonyme
 * ailleurs en France.
 *
 * Nominatim (le service de géocodage gratuit utilisé) impose 1 requête par seconde : un seul appel
 * ne traite donc qu'un nombre limité d'adresses distinctes (LOT_GEOCODAGE) pour rester dans le délai
 * d'une requête HTTP. Le client rappelle cette route en boucle jusqu'à ce que `restants` soit à 0.
 * Les adresses partagées par plusieurs événements (un même lieu) ne sont géocodées qu'une fois.
 */
eventsRouter.post('/geocoder', requireAdmin, async (_req, res) => {
  try {
    // Événements déjà géocodés lors d'exécutions précédentes (avant la contrainte géographique
    // ci-dessus) dont les coordonnées tombent hors de la CUD : à reprendre avec la recherche bornée.
    const remis = await executer(
      `UPDATE evenements SET statut_geocodage = 'attente', latitude = NULL, longitude = NULL
        WHERE statut_geocodage = 'ok'
          AND (latitude < $1 OR latitude > $2 OR longitude < $3 OR longitude > $4)`,
      [LIMITES_CUD.latMin, LIMITES_CUD.latMax, LIMITES_CUD.lonMin, LIMITES_CUD.lonMax]
    );
    if (remis > 0) {
      console.log(`[geocodage] ${remis} événement(s) hors de la CUD remis en attente pour re-géocodage`);
    }

    // Un événement sans lieu du tout ne pourra jamais être géocodé : on l'écarte tout de suite.
    await executer(`UPDATE evenements SET statut_geocodage = 'echec' WHERE ${NON_GEOCODE} AND btrim(lieu) = ''`);

    const enAttente = await requete<{ lieu: string }>(`SELECT DISTINCT btrim(lieu) AS lieu FROM evenements WHERE ${NON_GEOCODE}`);
    const toutesAdressesDistinctes = enAttente.map((e) => e.lieu);
    const adressesDistinctes = toutesAdressesDistinctes.slice(0, LOT_GEOCODAGE);

    let geocodes = 0;
    let echecs = 0;

    if (adressesDistinctes.length > 0) {
      const resultats = await geocoderPlusieursAdresses(adressesDistinctes);
      for (const [adresse, coords] of resultats) {
        if (coords) {
          await executer(
            `UPDATE evenements SET latitude = $2, longitude = $3, statut_geocodage = 'ok'
              WHERE btrim(lieu) = $1 AND ${NON_GEOCODE}`,
            [adresse, coords.latitude, coords.longitude]
          );
          geocodes++;
        } else {
          await executer(`UPDATE evenements SET statut_geocodage = 'echec' WHERE btrim(lieu) = $1 AND ${NON_GEOCODE}`, [adresse]);
          echecs++;
        }
      }
    }

    const [{ restants }] = await requete<{ restants: number }>(`SELECT count(*) AS restants FROM evenements WHERE ${NON_GEOCODE}`);
    // Toutes les adresses de `adressesDistinctes` ont été résolues (ok ou échec) ci-dessus : le nombre
    // d'adresses distinctes encore à traiter est simplement le total moins celles de ce lot.
    const adressesRestantes = Math.max(0, toutesAdressesDistinctes.length - adressesDistinctes.length);
    console.log(`[geocodage] ${geocodes} adresse(s) géocodée(s), ${echecs} échec(s), ${restants} événement(s) restant(s)`);
    res.json({ ok: true, geocodes, echecs, restants, adressesRestantes });
  } catch (err) {
    console.error('[geocodage] Échec :', err);
    res.status(500).json({
      ok: false,
      message: `Échec du géocodage : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    });
  }
});

/**
 * Supprime un événement. La Liste n'affichant plus qu'une seule ligne par événement sur plusieurs
 * jours, supprimer cette ligne doit retirer tous les jours de la série (même nom/dateDeDebut/dateDeFin,
 * mais dateClef différente de celui ciblé). Un doublon strict (même jour, dateClef identique, produit
 * par un import répété) n'est en revanche jamais supprimé automatiquement : seul le document ciblé
 * l'est, l'autre reste en base — il doit toujours en rester un.
 */
eventsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const cible = await lireEvenement(req.params.id);
  if (!cible) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }
  const serie = filtreSerie(cible);
  await executer(
    `DELETE FROM evenements WHERE (${serie.condition} AND date_clef IS DISTINCT FROM $4) OR id = $5`,
    [...serie.params, cible.dateClef, cible._id]
  );
  await consigner(identiteDeRequete(req), 'suppression_evenement', cible.nom);
  res.json({ ok: true });
});

eventsRouter.get('/:id', async (req, res) => {
  const item = await lireEvenement(req.params.id);
  if (!item) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }
  res.json(item);
});

/** Met à jour le statut d'un événement. */
eventsRouter.post('/:id/statut', requireAdmin, async (req, res) => {
  const schema = z.object({ statut: z.enum(['Validée', 'Annulée', 'À valider', 'Brouillon']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const updated = await requeteUne<Evenement>('UPDATE evenements SET statut = $2 WHERE id = $1 RETURNING *', [
    req.params.id,
    parsed.data.statut,
  ]);
  if (!updated) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }
  await consigner(identiteDeRequete(req), 'changement_statut_evenement', updated.nom, { statut: parsed.data.statut });
  res.json({ ok: true, item: updated });
});

/**
 * Filtre identifiant tous les jours d'un même événement multi-jours : même nom et mêmes
 * dateDeDebut/dateDeFin (seule dateClef diffère d'une ligne à l'autre pour un tel événement).
 */
function filtreSerie(e: { nom: string; dateDeDebut?: Date | null; dateDeFin?: Date | null }) {
  return {
    // Paramètres $1 à $3 ; IS NOT DISTINCT FROM fait correspondre NULL avec NULL (ce que « = » ne fait pas).
    condition: 'nom = $1 AND date_de_debut IS NOT DISTINCT FROM $2 AND date_de_fin IS NOT DISTINCT FROM $3',
    params: [e.nom, e.dateDeDebut ?? null, e.dateDeFin ?? null],
  };
}

function lireEvenement(id: string, executant?: Executant): Promise<Evenement | null> {
  return requeteUne<Evenement>('SELECT * FROM evenements WHERE id = $1', [id], executant);
}

/**
 * Met à jour les validations (technique / politique). Un événement sur plusieurs jours ayant une
 * ligne par jour (dateClef), la validation d'un seul jour est répercutée sur toute la série pour que
 * tous les jours affichent le même état.
 */
eventsRouter.post('/:id/validations', requireAdmin, async (req, res) => {
  const schema = z.object({ validationTechnique: z.boolean().optional(), validationPolitique: z.boolean().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const cible = await lireEvenement(req.params.id);
  if (!cible) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }
  const serie = filtreSerie(cible);
  const { validationTechnique, validationPolitique } = parsed.data;
  // COALESCE($n, colonne) : une validation non transmise garde sa valeur actuelle.
  await executer(
    `UPDATE evenements SET validation_technique = COALESCE($4, validation_technique),
                           validation_politique = COALESCE($5, validation_politique)
      WHERE ${serie.condition}`,
    [...serie.params, validationTechnique ?? null, validationPolitique ?? null]
  );
  const updated = await lireEvenement(req.params.id);
  await consigner(identiteDeRequete(req), 'changement_validation', cible.nom, parsed.data);
  res.json({ ok: true, item: updated });
});

/** Nombre maximal de jours acceptés pour la plage d'un report de date (garde-fou). */
const MAX_JOURS_REPORT = 366;

/**
 * Parse une date « civile » au format AAAA-MM-JJ (sans heure ni fuseau), telle qu'envoyée par le
 * sélecteur de dates du client. Construite à partir des composants année/mois/jour directement (et
 * non via `new Date(chaîneISO)`), pour ne dépendre d'aucune conversion de fuseau horaire : le jour
 * choisi par l'utilisateur est toujours le jour stocké, quel que soit son fuseau horaire ou celui du
 * serveur (contrairement à une date-heure complète, qui encoderait le fuseau du navigateur et serait
 * mal réinterprétée par un serveur dans un fuseau différent).
 */
function parseJourCivil(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, annee, mois, jour] = match;
  const date = new Date(Number(annee), Number(mois) - 1, Number(jour));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Change les dates d'un événement (report). Un événement sur plusieurs jours ayant une ligne par
 * jour (dateClef), reporter la date recrée l'intégralité de la série sur les nouveaux jours : toutes
 * les lignes de l'ancienne série (voir filtreSerie) sont supprimées puis remplacées par une ligne par
 * jour de la nouvelle plage, en conservant tous les autres champs (lieu, quartier, validations,
 * etc.) tels qu'ils étaient. Les identifiants des nouvelles lignes sont donc différents de ceux de
 * l'ancienne série.
 */
eventsRouter.post('/:id/dates', requireAdmin, async (req, res) => {
  const schema = z.object({ dateDeDebut: z.string().min(1), dateDeFin: z.string().nullable() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const cible = await lireEvenement(req.params.id);
  if (!cible) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }

  const nouveauDebut = parseJourCivil(parsed.data.dateDeDebut);
  const nouveauFin = parsed.data.dateDeFin ? parseJourCivil(parsed.data.dateDeFin) : nouveauDebut;
  if (!nouveauDebut || !nouveauFin || nouveauFin < nouveauDebut) {
    res.status(400).json({ ok: false, message: 'Dates invalides' });
    return;
  }

  const memeJour =
    nouveauDebut.getFullYear() === nouveauFin.getFullYear() &&
    nouveauDebut.getMonth() === nouveauFin.getMonth() &&
    nouveauDebut.getDate() === nouveauFin.getDate();

  const { _id, dateClef, dateDeDebut, dateDeFin, createdAt, updatedAt, ...gabarit } = cible;

  const nouvellesLignes: Record<string, unknown>[] = [];
  for (
    const d = new Date(nouveauDebut.getFullYear(), nouveauDebut.getMonth(), nouveauDebut.getDate());
    d <= nouveauFin && nouvellesLignes.length < MAX_JOURS_REPORT;
    d.setDate(d.getDate() + 1)
  ) {
    nouvellesLignes.push({
      ...gabarit,
      dateClef: new Date(d),
      dateDeDebut: nouveauDebut,
      dateDeFin: memeJour ? null : nouveauFin,
    });
  }

  // Suppression de l'ancienne série et création de la nouvelle vont ensemble : jamais l'une sans l'autre.
  const serie = filtreSerie(cible);
  const crees = await transaction(async (client) => {
    await executer(`DELETE FROM evenements WHERE ${serie.condition}`, serie.params, client);
    return inserer<Evenement>('evenements', nouvellesLignes, client);
  });
  await consigner(identiteDeRequete(req), 'report_date_evenement', cible.nom, {
    ancien: { dateDeDebut: cible.dateDeDebut, dateDeFin: cible.dateDeFin },
    nouveau: { dateDeDebut: nouveauDebut, dateDeFin: memeJour ? null : nouveauFin },
  });
  res.json({ ok: true, items: crees });
});

/**
 * Valide un événement en un clic : statut "Validée" + les deux validations cochées. Répercuté sur
 * toute la série (voir filtreSerie) pour qu'un événement sur plusieurs jours soit validé d'un bloc.
 */
eventsRouter.post('/:id/valider', requireAdmin, async (req, res) => {
  const viaPastilleDateClef = z.boolean().optional().parse(req.body?.viaPastilleDateClef);
  const cible = await lireEvenement(req.params.id);
  if (!cible) {
    res.status(404).json({ ok: false, message: 'Événement introuvable' });
    return;
  }
  const serie = filtreSerie(cible);
  await executer(
    `UPDATE evenements SET statut = 'Validée', validation_technique = true, validation_politique = true,
                           valid_par_date_clef = $4
      WHERE ${serie.condition}`,
    [...serie.params, viaPastilleDateClef ?? false]
  );
  const updated = await lireEvenement(req.params.id);
  await consigner(
    identiteDeRequete(req),
    viaPastilleDateClef ? 'marquage_date_clef' : 'validation_evenement',
    cible.nom
  );
  res.json({ ok: true, item: updated });
});
