import { useEffect, useState } from 'react';
import { Alert, Select, Switch, Tag, Typography } from 'antd';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { NIVEAUX, type Direction, type Niveau, type ProfilAcces } from '../types';
import { LIBELLES_NIVEAUX } from '../lib/droits';

const { Text } = Typography;

/** Directions actives, chargées une fois pour les listes de choix. */
export function useDirections(): Direction[] {
  const [directions, setDirections] = useState<Direction[]>([]);
  useEffect(() => {
    api.get<{ directions: Direction[] }>('/directions').then((d) => setDirections(d.directions));
  }, []);
  return directions;
}

export const PROFIL_PAR_DEFAUT: ProfilAcces = { superAdmin: false, directionId: null, droits: { calendrier: 'lecture' } };

/**
 * Saisie du profil d'accès d'un compte : super-administrateur, direction de rattachement et niveau
 * par module. Sert à la création d'un compte, à l'approbation d'une demande et à la modification.
 */
export function EditeurDroits({
  valeur,
  onChange,
  directions,
}: {
  valeur: ProfilAcces;
  onChange: (profil: ProfilAcces) => void;
  directions: Direction[];
}) {
  const { modules } = useAuth();
  const choixDirections = directions.filter((d) => d.actif || d._id === valeur.directionId);

  const changerNiveau = (module: string, niveau: Niveau | 'aucun') => {
    const droits = { ...valeur.droits };
    if (niveau === 'aucun') delete droits[module];
    else droits[module] = niveau;
    onChange({ ...valeur, droits });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
        <Switch checked={valeur.superAdmin} onChange={(superAdmin) => onChange({ ...valeur, superAdmin })} />
        <span>
          <Text strong>Super-administrateur</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Accès complet à tous les modules et à l’administration (comptes, sauvegardes, journal, RGPD).
          </Text>
        </span>
      </label>

      <div>
        <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Direction de rattachement</div>
        <Select
          allowClear
          placeholder="Aucune direction"
          value={valeur.directionId ?? undefined}
          onChange={(directionId) => onChange({ ...valeur, directionId: directionId ?? null })}
          options={choixDirections.map((d) => ({ value: d._id, label: d.actif ? d.nom : `${d.nom} (désactivée)` }))}
          style={{ width: '100%' }}
          showSearch
          optionFilterProp="label"
          aria-label="Direction de rattachement"
        />
      </div>

      {valeur.superAdmin ? (
        <Alert type="info" showIcon message="Un super-administrateur a tous les droits : les niveaux par module ne s’appliquent pas." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {modules.map((m) => {
            const niveau = valeur.droits[m.code];
            return (
              <div key={m.code} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span>
                    <Text strong>{m.libelle}</Text> {!m.disponible && <Tag style={{ marginLeft: 6 }}>Bientôt disponible</Tag>}
                  </span>
                  <Select<Niveau | 'aucun'>
                    value={niveau ?? 'aucun'}
                    onChange={(v) => changerNiveau(m.code, v)}
                    style={{ width: 180 }}
                    aria-label={`Niveau sur le module ${m.libelle}`}
                    options={[
                      { value: 'aucun', label: 'Aucun accès' },
                      ...NIVEAUX.map((n) => ({ value: n, label: LIBELLES_NIVEAUX[n] })),
                    ]}
                  />
                </div>
                {niveau && (
                  <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12, color: '#595959' }}>
                    {NIVEAUX.slice(0, NIVEAUX.indexOf(niveau) + 1).map((n) => (
                      <li key={n}>{m.niveaux[n]}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Résumé compact d'un profil pour les tableaux. */
export function ResumeDroits({ profil }: { profil: ProfilAcces }) {
  const { modules } = useAuth();
  if (profil.superAdmin) return <Tag color="gold">Super-administrateur</Tag>;
  const entrees = modules.filter((m) => profil.droits[m.code]);
  if (entrees.length === 0) return <Text type="secondary">Aucun accès</Text>;
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {entrees.map((m) => (
        <Tag key={m.code} color="blue">
          {m.libelle} : {LIBELLES_NIVEAUX[profil.droits[m.code]!]}
        </Tag>
      ))}
    </div>
  );
}
