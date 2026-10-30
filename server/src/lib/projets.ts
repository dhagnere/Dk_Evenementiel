import { z } from 'zod';
import { executer, inserer, pool, requete, requeteUne, type Executant } from '../db.js';

/**
 * Règles du module Projets événementiels (reprises de l'artefact « Balise événementielle ») :
 *
 * - le rétroplanning se compte en jours par rapport au jour J, de T-180 (six mois avant, échéance
 *   réglementaire) à J+7 (bilan) ; changer la date d'un projet décale toutes ses échéances ;
 * - à la création, les tâches et démarches sont tirées des modèles selon le type d'événement ;
 * - une tâche non faite dont l'échéance est passée est « en retard » ; une démarche ni obtenue ni
 *   sans objet, aussi ;
 * - un projet inscrit moins de 180 jours avant sa date ne tient pas l'échéance des 6 mois ;
 * - le matériel réservé est bloqué du jour J − 1 au jour de fin + 1 (montage, démontage) : au-delà
 *   du stock total sur une période qui se chevauche, il y a conflit.
 */

export const JALONS = [
  { c: 'T-180', o: -180, l: 'Lancement et cadrage', s: 'Échéance réglementaire des 6 mois' },
  { c: 'T-120', o: -120, l: 'Programme et budget', s: 'Arbitrages et consultations' },
  { c: 'T-90', o: -90, l: 'Dossiers réglementaires', s: 'Dépôts et implantation' },
  { c: 'T-60', o: -60, l: 'Réunion jalon 1', s: 'Coordination inter-branches', reunion: true },
  { c: 'T-30', o: -30, l: 'Réunion jalon 2', s: 'Sécurité et logistique', reunion: true },
  { c: 'T-15', o: -15, l: 'Réunion jalon 3', s: 'Calage final', reunion: true },
  { c: 'T-7', o: -7, l: 'Réunion jalon 4', s: 'Brief des équipes', reunion: true },
  { c: 'J', o: 0, l: 'Jour J', s: 'Montage, exploitation, démontage' },
  { c: 'J+7', o: 7, l: 'Réunion jalon 5', s: 'Bilan', reunion: true },
];

export const TYPES = {
  festif: { libelle: 'Grand événement festif ou culturel', lettre: 'f' },
  protocolaire: { libelle: 'Événement protocolaire', lettre: 'p' },
  quartier: { libelle: 'Petit événement en mairie de quartier', lettre: 'q' },
} as const;
export type TypeProjet = keyof typeof TYPES;
export const CODES_TYPES = Object.keys(TYPES) as [TypeProjet, ...TypeProjet[]];

/** Délai minimal entre l'inscription d'un projet et son jour J. */
export const DELAI_INSCRIPTION_JOURS = 180;

const ligneModele = z.object({
  o: z.number().int().min(-730).max(365),
  l: z.string().trim().min(1).max(300),
  t: z.string().regex(/^[fpq]{0,3}$/),
});

export const schemaModeles = z.object({
  branches: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
  taches: z.array(ligneModele.extend({ b: z.string().trim().min(1).max(100) })).max(300),
  reglementaire: z.array(ligneModele).max(100),
  budgetPostes: z.array(z.string().trim().min(1).max(100)).max(50),
});
export type Modeles = z.infer<typeof schemaModeles>;

export async function lireModeles(executant: Executant = pool): Promise<Modeles> {
  const ligne = await requeteUne<{ valeur: unknown }>("SELECT valeur FROM parametres WHERE cle = 'projets_modeles'", [], executant);
  return schemaModeles.parse(ligne?.valeur);
}

export async function ecrireModeles(modeles: Modeles): Promise<void> {
  await executer(
    `INSERT INTO parametres (cle, valeur) VALUES ('projets_modeles', $1)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [JSON.stringify(modeles)]
  );
}

/** Génère le rétroplanning, les démarches et les premières lignes de budget d'un projet neuf. */
export async function genererDepuisModeles(projetId: string, type: TypeProjet, executant: Executant): Promise<void> {
  const modeles = await lireModeles(executant);
  const lettre = TYPES[type].lettre;
  const taches = modeles.taches
    .filter((t) => t.t.includes(lettre))
    .map((t) => ({ projetId, decalage: t.o, branche: t.b, libelle: t.l }));
  const demarches = modeles.reglementaire
    .filter((r) => r.t.includes(lettre))
    .map((r) => ({ projetId, decalage: r.o, libelle: r.l }));
  const budget = modeles.budgetPostes.slice(0, 3).map((poste) => ({ projetId, poste }));
  if (taches.length) await inserer('projet_taches', taches, executant);
  if (demarches.length) await inserer('projet_demarches', demarches, executant);
  if (budget.length) await inserer('projet_budget', budget, executant);
}

/** Indicateurs de tous les projets (avancement, retards, prochaine échéance), calculés en SQL. */
export async function indicateursProjets(filtre = 'TRUE', params: unknown[] = []) {
  return requete<{
    _id: string;
    titre: string;
    type: TypeProjet;
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
    `SELECT p.id, p.titre, p.type, p.date_jour, p.date_fin, p.lieu, p.jauge, p.statut, p.inscrit_le,
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
