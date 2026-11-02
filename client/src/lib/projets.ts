import { useEffect, useState } from 'react';
import { api } from '../api';
import type { Meteo, ReferentielRetroplanning, ReferentielsProjets, SimulationProjet, StatutProjet } from '../types';

/** Jour J + décalage (en jours), au format AAAA-MM-JJ. */
export function decaler(jour: string, jours: number): string {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  return d.toISOString().slice(0, 10);
}

export const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Écart en jours entre deux dates AAAA-MM-JJ (a − b). */
export function ecart(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/** Code d'échéance : T-30, J, J+7. */
export const codeEcheance = (o: number) => (o === 0 ? 'J' : o < 0 ? `T${o}` : `J+${o}`);

export const METEO: Record<Meteo, { libelle: string; couleur: string; tag: string }> = {
  vert: { libelle: 'Dans les temps', couleur: '#2c7a4b', tag: 'green' },
  orange: { libelle: 'À surveiller', couleur: '#d48806', tag: 'orange' },
  rouge: { libelle: 'En difficulté', couleur: '#be3327', tag: 'red' },
};

export const COULEURS_NIVEAU: Record<number, string> = { 1: 'cyan', 2: 'blue', 3: 'purple', 4: 'magenta' };

export const libelleRole = (ref: ReferentielRetroplanning, code: string) => ref.roles.find((r) => r.code === code)?.libelle ?? code;
export const libelleModule = (ref: ReferentielRetroplanning, code: string) => ref.modules.find((m) => m.code === code)?.libelle ?? code;

/** Simulation (niveau, modules, non-retour, tâches infaisables) recalculée à chaque changement de saisie. */
export function useSimulation(dateJour: string | null, jauge: number | null, criteres: string[]): SimulationProjet | null {
  const [simulation, setSimulation] = useState<SimulationProjet | null>(null);
  const cle = JSON.stringify([dateJour, jauge, criteres]);
  useEffect(() => {
    if (!dateJour) {
      setSimulation(null);
      return;
    }
    let annule = false;
    const minuterie = setTimeout(() => {
      api
        .post<{ simulation: SimulationProjet }>('/projets/simulation', { dateJour, jauge, criteres })
        .then((d) => !annule && setSimulation(d.simulation))
        .catch(() => !annule && setSimulation(null));
    }, 250);
    return () => {
      annule = true;
      clearTimeout(minuterie);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);
  return simulation;
}

export const formatCourt = (jour: string | null | undefined) =>
  jour ? new Date(`${jour.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : '—';
export const formatLong = (jour: string | null | undefined) =>
  jour ? new Date(`${jour.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export const STATUTS_PROJET: Record<StatutProjet, { libelle: string; couleur: string }> = {
  preparation: { libelle: 'En préparation', couleur: 'blue' },
  realise: { libelle: 'Réalisé', couleur: 'green' },
  cloture: { libelle: 'Clôturé', couleur: 'default' },
  annule: { libelle: 'Annulé', couleur: 'red' },
};

export const STATUTS_DEMARCHE = {
  a_faire: { libelle: 'À faire', couleur: 'orange' },
  depose: { libelle: 'Déposé', couleur: 'blue' },
  obtenu: { libelle: 'Obtenu', couleur: 'green' },
  na: { libelle: 'Non concerné', couleur: 'default' },
} as const;

export const STATUTS_DEMANDE = {
  nouvelle: { libelle: 'Nouvelle', couleur: 'gold' },
  instruction: { libelle: 'En instruction', couleur: 'blue' },
  acceptee: { libelle: 'Acceptée', couleur: 'green' },
  refusee: { libelle: 'Refusée', couleur: 'red' },
} as const;

export const BESOINS = [
  'Matériel (tables, barrières…)',
  'Sonorisation',
  'Affichage',
  'Animation',
];

let cache: Promise<ReferentielsProjets> | null = null;

/** Référentiels du module (squelette, niveaux, modules, rôles…), chargés une fois par session. */
export function useReferentiels(): ReferentielsProjets | null {
  const [ref, setRef] = useState<ReferentielsProjets | null>(null);
  useEffect(() => {
    cache ??= api.get<ReferentielsProjets>('/projets/referentiels');
    cache.then(setRef).catch(() => {
      cache = null;
    });
  }, []);
  return ref;
}

/** À appeler après une modification du référentiel. */
export function oublierReferentiels() {
  cache = null;
}
