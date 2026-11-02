import { requete, requeteUne, pool, type Executant } from '../db.js';
import { lireReferentiel } from './projets.js';

/**
 * Formation des pilotes : quatre étapes avant toute autonomie.
 * Une étape est acquise quand le pilote a mené un projet du niveau et du mode voulus jusqu'au bilan
 * (dernier jalon du squelette franchi). Un pilote déclaré autonome n'a plus de restriction.
 */

export type ModeFormation = 'binome' | 'seul' | 'copilote';

export const ETAPES = [
  { code: 'n1_binome', niveau: 1, mode: 'binome', libelle: 'Un N1 en binôme' },
  { code: 'n1_seul', niveau: 1, mode: 'seul', libelle: 'Un N1 seul' },
  { code: 'n2_binome', niveau: 2, mode: 'binome', libelle: 'Un N2 en binôme' },
  { code: 'n3_copilote', niveau: 3, mode: 'copilote', libelle: 'Un N3 en copilote' },
] as const satisfies readonly { code: string; niveau: number; mode: ModeFormation; libelle: string }[];

export const MODES: Record<ModeFormation, string> = { binome: 'En binôme', seul: 'Seul', copilote: 'En copilote' };

interface ProjetPilote {
  _id: string;
  titre: string;
  dateJour: string;
  niveau: number;
  statut: string;
  formationMode: ModeFormation | null;
  formateur: { nom: string } | null;
  bilanFranchi: boolean;
}

export interface Progression {
  utilisateurId: string;
  nom: string;
  autonome: boolean;
  autonomeLe: string | null;
  decidePar: string;
  notes: string;
  etapes: {
    code: string;
    libelle: string;
    niveau: number;
    mode: ModeFormation;
    acquise: boolean;
    projets: (ProjetPilote & { valide: boolean })[];
  }[];
  // Étape suivante à mener ; null si toutes sont acquises ou si le pilote est autonome.
  prochaine: string | null;
  projets: ProjetPilote[];
}

/** Projets pilotés et progression d'un ou plusieurs comptes. */
export async function progressions(utilisateurIds: string[] | null, executant: Executant = pool): Promise<Progression[]> {
  const ref = await lireReferentiel(executant);
  const bilan = ref.jalons[ref.jalons.length - 1].code;
  const projets = await requete<ProjetPilote & { piloteId: string }>(
    `SELECT p.id, p.titre, p.date_jour, p.niveau, p.statut, p.formation_mode, p.formateur, p.roles->'pilote'->>'utilisateurId' AS pilote_id,
            EXISTS (SELECT 1 FROM projet_jalons j WHERE j.projet_id = p.id AND j.code = $1) AS bilan_franchi
       FROM projets p
      WHERE p.statut <> 'annule' AND p.roles->'pilote'->>'utilisateurId' IS NOT NULL
        AND ($2::text[] IS NULL OR p.roles->'pilote'->>'utilisateurId' = ANY($2))
      ORDER BY p.date_jour`,
    [bilan, utilisateurIds],
    executant
  );
  const ids = utilisateurIds ?? [...new Set(projets.map((p) => p.piloteId))];
  const comptes = await requete<{ _id: string; nom: string; autonome: boolean | null; autonomeLe: string | null; decidePar: string | null; notes: string | null }>(
    `SELECT u.id, u.nom, f.autonome, f.autonome_le, f.decide_par, f.notes FROM utilisateurs u
       LEFT JOIN pilotes_formation f ON f.utilisateur_id = u.id WHERE u.id = ANY($1) OR f.utilisateur_id IS NOT NULL ORDER BY u.nom`,
    [ids],
    executant
  );
  return comptes
    .filter((c) => utilisateurIds === null || utilisateurIds.includes(c._id))
    .map((c) => {
      const siens = projets.filter((p) => p.piloteId === c._id).map(({ piloteId: _p, ...p }) => p);
      const etapes = ETAPES.map((e) => {
        const lies = siens.filter((p) => p.formationMode === e.mode && p.niveau >= e.niveau);
        const lot = lies.map((p) => ({ ...p, valide: p.bilanFranchi }));
        return { ...e, acquise: lot.some((p) => p.valide), projets: lot };
      });
      const autonome = !!c.autonome;
      return {
        utilisateurId: c._id,
        nom: c.nom,
        autonome,
        autonomeLe: c.autonomeLe,
        decidePar: c.decidePar ?? '',
        notes: c.notes ?? '',
        etapes,
        prochaine: autonome ? null : (etapes.find((e) => !e.acquise)?.code ?? null),
        projets: siens,
      };
    });
}

const minuscule = (texte: string) => texte.charAt(0).toLowerCase() + texte.slice(1);

/**
 * Le pilote peut-il mener ce projet dans ce mode ? Avertissement seulement : la décision reste au
 * chef de service.
 */
export function avisPilotage(p: Progression | null, niveau: number, mode: ModeFormation | null, formateur: boolean): string | null {
  if (!p || p.autonome) return null;
  const acquises = new Set(p.etapes.filter((e) => e.acquise).map((e) => e.code));
  if (acquises.size === ETAPES.length) return null; // Parcours terminé : reste à le déclarer autonome.
  const prochaine = ETAPES.find((e) => !acquises.has(e.code))!;
  if (!mode) return `${p.nom} est en formation (prochaine étape : ${minuscule(prochaine.libelle)}) : précisez le mode d'accompagnement.`;
  if (mode === 'seul') {
    if (niveau === 1 && acquises.has('n1_binome')) return null;
    return `${p.nom} n'est pas encore autonome sur un N${niveau} : prochaine étape, ${minuscule(prochaine.libelle)}.`;
  }
  if (!formateur) return `Désignez le formateur qui accompagne ${p.nom}.`;
  if (niveau > prochaine.niveau) return `N${niveau} au-delà de l'étape en cours de ${p.nom} (${minuscule(prochaine.libelle)}).`;
  return null;
}

export async function progressionDe(utilisateurId: string | null | undefined, executant: Executant = pool): Promise<Progression | null> {
  if (!utilisateurId) return null;
  if (!(await requeteUne('SELECT 1 FROM utilisateurs WHERE id = $1', [utilisateurId], executant))) return null;
  return (await progressions([utilisateurId], executant))[0] ?? null;
}
