import { executer, inserer, pool, requete, requeteUne, type Executant } from '../db.js';

import {
  REFERENTIEL_DEFAUT,
  controlerReferentiel,
  schemaReferentiel,
  type Referentiel,
  type TacheType,
} from './referentielProjets.js';

/**
 * Règles du module Projets événementiels.
 *
 * - Un squelette unique de jalons (T-180 → J+7), réglé par trois curseurs : le niveau (N1 à N4, tiré
 *   de la jauge et relevé par les critères de risque), les jalons actifs à ce niveau et leur valideur,
 *   les modules activés par les caractéristiques de l'événement (voir referentielProjets.ts).
 * - Chaque tâche se date à J + décalage ; changer la date d'un projet décale toutes ses échéances.
 *   Les tâches d'un jalon inactif se rattachent au jalon actif suivant.
 * - Une tâche bloquante est « infaisable » quand le temps restant avant J est inférieur à son délai
 *   incompressible : l'outil dit, dès la saisie, ce qui n'est plus faisable.
 * - Date de non-retour d'un module : J moins son délai de non-retour (imposé, ou plus long délai
 *   incompressible de ses tâches bloquantes).
 * - Un projet inscrit moins de 180 jours avant sa date ne tient pas l'échéance des 6 mois.
 * - Le matériel réservé est bloqué du jour J − 1 au jour de fin + 1 (montage, démontage) : au-delà
 *   du stock total sur une période qui se chevauche, il y a conflit.
 */

/** Anciens types d'événement : conservés pour l'affichage des projets créés avant les niveaux. */
export const TYPES = {
  festif: { libelle: 'Grand événement festif ou culturel', lettre: 'f' },
  protocolaire: { libelle: 'Événement protocolaire', lettre: 'p' },
  quartier: { libelle: 'Petit événement en mairie de quartier', lettre: 'q' },
} as const;
export type TypeProjet = keyof typeof TYPES;
export const CODES_TYPES = Object.keys(TYPES) as [TypeProjet, ...TypeProjet[]];

/** Thèmes du matériel logistique, dans l'ordre d'affichage des listes. */
export const THEMES_MATERIEL = [
  'Barriérage et délimitation',
  'Sécurité et secours',
  'Structures et abris',
  'Scène, podium et tribunes',
  'Sonorisation et vidéo',
  'Éclairage',
  'Énergie et électricité',
  'Mobilier',
  'Protocole et cérémonie',
  'Accueil, signalétique et billetterie',
  'Exposition et stands',
  'Restauration et buvette',
  'Hygiène, propreté et environnement',
  'Voirie, circulation et stationnement',
  'Sols et protection',
  'Climat et confort',
  'Animation, sport et jeux',
  'Nautique et plage',
  'Accessibilité',
  'Transport et manutention',
  'Communication et poste de commandement',
  'Divers',
];

/** Délai minimal entre l'inscription d'un projet et son jour J. */
export const DELAI_INSCRIPTION_JOURS = 180;

export { schemaReferentiel, controlerReferentiel, type Referentiel };

// --- Référentiel -----------------------------------------------------------------------------------

/** Référentiel en vigueur ; créé avec les valeurs par défaut au premier usage. */
export async function lireReferentiel(executant: Executant = pool): Promise<Referentiel> {
  const ligne = await requeteUne<{ valeur: unknown }>("SELECT valeur FROM parametres WHERE cle = 'projets_referentiel'", [], executant);
  if (ligne) return schemaReferentiel.parse(ligne.valeur);
  // Reprise des postes budgétaires des anciens modèles s'ils existent.
  const anciens = await requeteUne<{ valeur: { budgetPostes?: string[] } }>("SELECT valeur FROM parametres WHERE cle = 'projets_modeles'", [], executant);
  const referentiel = { ...REFERENTIEL_DEFAUT, budgetPostes: anciens?.valeur.budgetPostes ?? REFERENTIEL_DEFAUT.budgetPostes };
  await ecrireReferentiel(referentiel, executant);
  return referentiel;
}

export async function ecrireReferentiel(referentiel: Referentiel, executant: Executant = pool): Promise<void> {
  await executer(
    `INSERT INTO parametres (cle, valeur) VALUES ('projets_referentiel', $1)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [JSON.stringify(referentiel)],
    executant
  );
}

// --- Les trois curseurs ----------------------------------------------------------------------------

export interface CalculNiveau {
  niveau: number;
  base: number;
  majorations: string[];
  multiSites: boolean;
}

/** Niveau = min(4, niveau de jauge + nombre de majorations) ; multi-sites : N4. */
export function calculerNiveau(ref: Referentiel, jauge: number | null, criteres: string[]): CalculNiveau {
  const [n2, n3, n4] = ref.seuilsJauge;
  const j = jauge ?? 0;
  const base = j >= n4 ? 4 : j >= n3 ? 3 : j >= n2 ? 2 : 1;
  const coches = ref.criteres.filter((c) => criteres.includes(c.code));
  const majorations = coches.filter((c) => c.majoration).map((c) => c.libelle);
  const multiSites = coches.some((c) => c.niveauMax);
  return { niveau: multiSites ? 4 : Math.min(4, base + majorations.length), base, majorations, multiSites };
}

/** Modules actifs : le socle, puis ceux qu'activent les critères cochés. */
export function modulesActifs(ref: Referentiel, criteres: string[]): string[] {
  const actifs = new Set(['socle']);
  for (const c of ref.criteres) if (criteres.includes(c.code)) c.modules.forEach((m) => actifs.add(m));
  return ref.modules.map((m) => m.code).filter((m) => actifs.has(m));
}

export function tachesApplicables(ref: Referentiel, niveau: number, modules: string[]): TacheType[] {
  return ref.taches.filter((t) => modules.includes(t.module) && t.niveauMin <= niveau);
}

export function jalonsActifs(ref: Referentiel, niveau: number) {
  const regle = ref.niveaux.find((n) => n.niveau === niveau)!;
  return ref.jalons
    .filter((j) => regle.jalons.some((a) => a.code === j.code))
    .map((j) => ({ ...j, valideur: regle.jalons.find((a) => a.code === j.code)!.valideur }))
    .sort((a, b) => a.offset - b.offset);
}

/** Jalon actif de rattachement : le jalon d'origine s'il est actif, sinon le jalon actif suivant. */
export function jalonDeRattachement(ref: Referentiel, niveau: number, jalon: string): string {
  const actifs = jalonsActifs(ref, niveau);
  const origine = ref.jalons.find((j) => j.code === jalon)?.offset ?? Infinity;
  return (actifs.find((a) => a.offset >= origine) ?? actifs[actifs.length - 1]).code;
}

/** Qui tient un rôle à ce niveau : en dessous du niveau où il devient distinct, le pilote. */
export function roleTenu(ref: Referentiel, niveau: number, role: string): string {
  const r = ref.roles.find((x) => x.code === role);
  return r && r.niveauMin > niveau ? 'pilote' : role;
}

/** Délai de non-retour d'un module (jours avant J), ou null s'il n'en a pas. */
export function delaiNonRetour(ref: Referentiel, module: string, niveau: number): number | null {
  const m = ref.modules.find((x) => x.code === module);
  if (m?.nonRetourJours != null) return m.nonRetourJours;
  const delais = tachesApplicables(ref, niveau, [module])
    .filter((t) => t.bloquante && t.incompressibleJours != null)
    .map((t) => t.incompressibleJours!);
  return delais.length ? Math.max(...delais) : null;
}

// --- Dates -----------------------------------------------------------------------------------------

export function decaler(jour: string, jours: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, j + jours)).toISOString().slice(0, 10);
}

export function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const ecartJours = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

// --- Génération et synchronisation ------------------------------------------------------------------

/**
 * Aligne le rétroplanning d'un projet sur son niveau et ses modules : enregistre le niveau, ajoute les
 * tâches types devenues applicables, retire celles qui ne le sont plus si elles ne sont pas faites.
 * Les tâches ajoutées à la main et les tâches faites ne sont jamais retirées.
 */
export async function synchroniserProjet(projetId: string, executant: Executant) {
  const ref = await lireReferentiel(executant);
  const projet = await requeteUne<{ jauge: number | null; criteres: string[] }>('SELECT jauge, criteres FROM projets WHERE id = $1', [projetId], executant);
  if (!projet) throw new Error('Projet introuvable');
  const { niveau } = calculerNiveau(ref, projet.jauge, projet.criteres);
  const applicables = tachesApplicables(ref, niveau, modulesActifs(ref, projet.criteres));
  const codes = new Set(applicables.map((t) => t.code));
  const existantes = await requete<{ _id: string; code: string | null; fait: boolean }>(
    'SELECT id, code, fait FROM projet_taches WHERE projet_id = $1',
    [projetId],
    executant
  );
  const presents = new Set(existantes.map((t) => t.code).filter(Boolean));
  const aAjouter = applicables.filter((t) => !presents.has(t.code));
  const aRetirer = existantes.filter((t) => t.code && !t.fait && !codes.has(t.code)).map((t) => t._id);
  await executer('UPDATE projets SET niveau = $2 WHERE id = $1', [projetId, niveau], executant);
  if (aAjouter.length) {
    await inserer(
      'projet_taches',
      aAjouter.map((t) => ({
        projetId,
        code: t.code,
        libelle: t.libelle,
        module: t.module,
        jalon: t.jalon,
        decalage: t.offset,
        porte: t.porte,
        faitRole: t.fait,
        valideRole: t.valide,
        informe: t.informe,
        livrable: t.livrable,
        bloquante: t.bloquante,
        incompressibleJours: t.incompressibleJours,
      })),
      executant
    );
  }
  if (aRetirer.length) await executer('DELETE FROM projet_taches WHERE id = ANY($1)', [aRetirer], executant);
  return { niveau, ajoutees: aAjouter.length, retirees: aRetirer.length };
}

/** Rétroplanning et premières lignes de budget d'un projet neuf. */
export async function genererProjet(projetId: string, executant: Executant): Promise<void> {
  await synchroniserProjet(projetId, executant);
  const ref = await lireReferentiel(executant);
  const budget = ref.budgetPostes.slice(0, 3).map((poste) => ({ projetId, poste }));
  if (budget.length) await inserer('projet_budget', budget, executant);
}

// --- Pilotage ----------------------------------------------------------------------------------------

export interface TacheProjet {
  _id: string;
  code: string | null;
  libelle: string;
  module: string;
  jalon: string;
  decalage: number;
  porte: string;
  faitRole: string;
  valideRole: string;
  informe: string[];
  livrable: string;
  bloquante: boolean;
  incompressibleJours: number | null;
  fait: boolean;
  faitPar: string;
  relanceLe: Date | null;
}

export interface Personne {
  utilisateurId?: string | null;
  nom: string;
}

export type Meteo = 'vert' | 'orange' | 'rouge';

/**
 * Vue de pilotage d'un projet : où en est-on (prochain jalon et sa météo), qu'est-ce qui bloque
 * (tâches bloquantes en retard ou infaisables, triées par urgence), qui doit agir (le « P »).
 */
export function pilotage(
  ref: Referentiel,
  projet: { dateJour: string; jauge: number | null; criteres: string[]; roles: Record<string, Personne> },
  taches: TacheProjet[],
  franchis: { code: string; decidePar: string; commentaire: string; createdAt: Date }[],
  jour = aujourdhui()
) {
  const calcul = calculerNiveau(ref, projet.jauge, projet.criteres);
  const { niveau } = calcul;
  const modules = modulesActifs(ref, projet.criteres);
  const restant = ecartJours(projet.dateJour, jour);
  const libelleRole = (code: string) => ref.roles.find((r) => r.code === code)?.libelle ?? code;
  const personne = (code: string) => {
    const tenu = roleTenu(ref, niveau, code);
    return projet.roles[tenu]?.nom || null;
  };

  const enrichies = taches.map((t) => {
    const echeance = decaler(projet.dateJour, t.decalage);
    const enRetard = !t.fait && echeance < jour;
    const infaisable = t.bloquante && !t.fait && t.incompressibleJours != null && restant < t.incompressibleJours;
    return {
      ...t,
      jalonActif: jalonDeRattachement(ref, niveau, t.jalon),
      echeance,
      enRetard,
      infaisable,
      porteTenu: roleTenu(ref, niveau, t.porte),
      portePar: personne(t.porte),
    };
  });

  const actifs = jalonsActifs(ref, niveau);
  const jalons = actifs.map((j) => {
    const lot = enrichies.filter((t) => t.jalonActif === j.code);
    const franchi = franchis.find((f) => f.code === j.code) ?? null;
    const date = decaler(projet.dateJour, j.offset);
    const bloquantsOuverts = lot.filter((t) => t.bloquante && !t.fait);
    const rouge = !franchi && (date < jour || lot.some((t) => t.bloquante && !t.fait && (t.enRetard || t.infaisable)));
    const orange = !franchi && (lot.some((t) => t.enRetard) || (ecartJours(date, jour) <= 14 && lot.some((t) => !t.fait)));
    return {
      ...j,
      date,
      valideurTenu: roleTenu(ref, niveau, j.valideur),
      valideurNom: personne(j.valideur),
      franchi,
      total: lot.length,
      faites: lot.filter((t) => t.fait).length,
      bloquantsOuverts: bloquantsOuverts.length,
      meteo: (franchi ? 'vert' : rouge ? 'rouge' : orange ? 'orange' : 'vert') as Meteo,
    };
  });
  const prochain = jalons.find((j) => !j.franchi) ?? null;

  const bloquants = enrichies
    .filter((t) => t.bloquante && !t.fait && (t.enRetard || t.infaisable))
    .sort((a, b) => a.echeance.localeCompare(b.echeance));

  const nonRetour = modules
    .map((m) => {
      const delai = delaiNonRetour(ref, m, niveau);
      if (delai == null) return null;
      const date = decaler(projet.dateJour, -delai);
      const ouvertes = enrichies.filter((t) => t.module === m && t.bloquante && !t.fait).length;
      return { module: m, libelle: ref.modules.find((x) => x.code === m)?.libelle ?? m, delai, date, depassee: date < jour && ouvertes > 0, ouvertes };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    ...calcul,
    niveauLibelle: ref.niveaux.find((n) => n.niveau === niveau)?.libelle ?? '',
    modules: modules.map((m) => ({ code: m, libelle: ref.modules.find((x) => x.code === m)?.libelle ?? m })),
    jalons,
    prochain,
    meteo: prochain?.meteo ?? ('vert' as Meteo),
    bloquants,
    infaisables: enrichies.filter((t) => t.infaisable).length,
    nonRetour,
    taches: enrichies,
    roles: ref.roles.map((r) => ({
      ...r,
      tenuPar: roleTenu(ref, niveau, r.code),
      utile: r.code === 'pilote' || enrichies.some((t) => [t.porte, t.faitRole, t.valideRole].includes(r.code)) || actifs.some((j) => j.valideur === r.code),
      libelleRole: libelleRole(r.code),
    })),
  };
}

/** Ce que donnerait un projet : pour le dépôt d'une demande ou la création, avant tout enregistrement. */
export function simuler(ref: Referentiel, dateJour: string, jauge: number | null, criteres: string[], jour = aujourdhui()) {
  const calcul = calculerNiveau(ref, jauge, criteres);
  const modules = modulesActifs(ref, criteres);
  const restant = ecartJours(dateJour, jour);
  const applicables = tachesApplicables(ref, calcul.niveau, modules);
  return {
    ...calcul,
    niveauLibelle: ref.niveaux.find((n) => n.niveau === calcul.niveau)?.libelle ?? '',
    restant,
    modules: modules.map((m) => ({ code: m, libelle: ref.modules.find((x) => x.code === m)?.libelle ?? m })),
    jalons: jalonsActifs(ref, calcul.niveau).map((j) => ({ code: j.code, libelle: j.libelle, date: decaler(dateJour, j.offset), passe: decaler(dateJour, j.offset) < jour })),
    nonRetour: modules
      .map((m) => {
        const delai = delaiNonRetour(ref, m, calcul.niveau);
        if (delai == null) return null;
        const date = decaler(dateJour, -delai);
        return { module: m, libelle: ref.modules.find((x) => x.code === m)?.libelle ?? m, delai, date, depassee: date < jour };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
    infaisables: applicables
      .filter((t) => t.bloquante && t.incompressibleJours != null && restant < t.incompressibleJours)
      .map((t) => ({ code: t.code, libelle: t.libelle, module: t.module, incompressibleJours: t.incompressibleJours! })),
    nombreTaches: applicables.length,
  };
}

/** Indicateurs de tous les projets (avancement, retards, prochaine échéance), calculés en SQL. */
export async function indicateursProjets(filtre = 'TRUE', params: unknown[] = []) {
  return requete<{
    _id: string;
    titre: string;
    type: TypeProjet | null;
    niveau: number;
    criteres: string[];
    dateJour: string;
    dateFin: string | null;
    lieu: string;
    jauge: number | null;
    statut: string;
    inscritLe: string;
    totalTaches: number;
    tachesFaites: number;
    tachesEnRetard: number;
    demarchesEnRetard: number;
  }>(
    `SELECT p.id, p.titre, p.type, p.niveau, p.criteres, p.date_jour, p.date_fin, p.lieu, p.jauge, p.statut, p.inscrit_le,
            (SELECT count(*) FROM projet_taches t WHERE t.projet_id = p.id) AS total_taches,
            (SELECT count(*) FROM projet_taches t WHERE t.projet_id = p.id AND t.fait) AS taches_faites,
            (SELECT count(*) FROM projet_taches t WHERE t.projet_id = p.id AND NOT t.fait
                AND p.date_jour + t.decalage < CURRENT_DATE) AS taches_en_retard,
            (SELECT count(*) FROM projet_demarches d WHERE d.projet_id = p.id AND d.statut IN ('a_faire', 'depose')
                AND p.date_jour + d.decalage < CURRENT_DATE) AS demarches_en_retard
       FROM projets p WHERE ${filtre} ORDER BY p.date_jour`,
    params
  );
}

/**
 * Conflits de matériel : pour chaque projet actif à venir et chaque article réservé, somme des
 * quantités réservées par les projets dont la période bloquée chevauche la sienne.
 */
export async function conflitsMateriel(projetId?: string) {
  return requete<{ projetId: string; titre: string; dateJour: string; articleId: string; nom: string; unite: string; total: number; demande: number; concurrents: string[] }>(
    `WITH res AS (
       SELECT m.projet_id, m.article_id, m.quantite, p.titre, p.date_jour,
              p.date_jour - 1 AS debut, COALESCE(p.date_fin, p.date_jour) + 1 AS fin
         FROM projet_materiel m JOIN projets p ON p.id = m.projet_id
        WHERE m.quantite > 0 AND p.statut <> 'annule' AND COALESCE(p.date_fin, p.date_jour) >= CURRENT_DATE - 7
     )
     SELECT a.projet_id, a.titre, a.date_jour, a.article_id, art.nom, art.unite, art.total,
            sum(b.quantite) AS demande,
            array_remove(array_agg(DISTINCT CASE WHEN b.projet_id <> a.projet_id THEN b.titre END), NULL) AS concurrents
       FROM res a
       JOIN res b ON b.article_id = a.article_id AND b.debut <= a.fin AND a.debut <= b.fin
       JOIN materiel_articles art ON art.id = a.article_id
      ${projetId ? 'WHERE a.projet_id = $1' : ''}
      GROUP BY a.projet_id, a.titre, a.date_jour, a.article_id, art.nom, art.unite, art.total
     HAVING sum(b.quantite) > art.total
      ORDER BY a.date_jour`,
    projetId ? [projetId] : []
  );
}
