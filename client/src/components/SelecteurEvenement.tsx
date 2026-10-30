import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { api } from '../api';
import type { ResumeEvenementCalendrier } from '../types';
import { formatLong } from '../lib/projets';

/** Recherche d'un événement du calendrier (séries regroupées) pour le rattacher à un projet ou une demande. */
export function SelecteurEvenement({
  valeur,
  libelleInitial,
  onChange,
  style,
}: {
  valeur: string | null;
  libelleInitial?: string;
  onChange: (id: string | null, evenement: ResumeEvenementCalendrier | null) => void;
  style?: React.CSSProperties;
}) {
  const [recherche, setRecherche] = useState('');
  const [options, setOptions] = useState<ResumeEvenementCalendrier[]>([]);

  useEffect(() => {
    const minuterie = setTimeout(() => {
      api
        .get<{ evenements: ResumeEvenementCalendrier[] }>(`/liaisons/evenements?recherche=${encodeURIComponent(recherche)}`)
        .then((d) => setOptions(d.evenements))
        .catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(minuterie);
  }, [recherche]);

  const libelle = (e: ResumeEvenementCalendrier) =>
    `${e.nom} — ${formatLong(e.dateDeDebut)}${e.dateDeFin ? ` → ${formatLong(e.dateDeFin)}` : ''}${e.lieu ? ` · ${e.lieu}` : ''}`;
  const choix = options.map((e) => ({ value: e._id, label: libelle(e) }));
  if (valeur && !options.some((e) => e._id === valeur)) choix.unshift({ value: valeur, label: libelleInitial ?? 'Événement sélectionné' });

  return (
    <Select
      showSearch
      allowClear
      filterOption={false}
      placeholder="Rechercher un événement du calendrier"
      value={valeur ?? undefined}
      onSearch={setRecherche}
      onChange={(id?: string) => onChange(id ?? null, options.find((e) => e._id === id) ?? null)}
      options={choix}
      style={{ width: '100%', ...style }}
      notFoundContent="Aucun événement trouvé"
      aria-label="Événement du calendrier"
    />
  );
}
