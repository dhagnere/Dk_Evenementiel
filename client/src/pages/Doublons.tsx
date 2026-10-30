import { useEffect, useState } from 'react';
import { Button, Popconfirm, Radio, Typography } from 'antd';
import { api } from '../api';
import { estValide, type Evenement } from '../types';
import { formatDate } from '../lib/formatDate';
import { formatTitreEvenement } from '../lib/formatTitre';
import { ValidationBadge } from '../components/ValidationBadge';

const { Title, Text } = Typography;

/** Sélectionne par défaut l'exemplaire à conserver : celui déjà validé s'il n'y en a qu'un, sinon le plus récemment créé. */
function meilleureCandidate(groupe: Evenement[]): string {
  const validees = groupe.filter(estValide);
  if (validees.length === 1) return validees[0]._id;
  const parDate = [...groupe].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
  return parDate[0]._id;
}

export default function Doublons() {
  const [groupes, setGroupes] = useState<Evenement[][]>([]);
  const [chargement, setChargement] = useState(true);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [fusionEnCours, setFusionEnCours] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = async () => {
    setChargement(true);
    try {
      const data = await api.get<{ doublons: Evenement[][] }>('/evenements/doublons');
      setGroupes(data.doublons);
      const initial: Record<number, string> = {};
      data.doublons.forEach((groupe, index) => {
        initial[index] = meilleureCandidate(groupe);
      });
      setSelection(initial);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const fusionner = async (index: number) => {
    const groupe = groupes[index];
    const aConserver = selection[index];
    const idsASupprimer = groupe.filter((e) => e._id !== aConserver).map((e) => e._id);
    setFusionEnCours(index);
    setMessage(null);
    try {
      await api.post('/evenements/doublons/fusionner', { idsASupprimer });
      setMessage(`Doublon fusionné : ${idsASupprimer.length} exemplaire(s) supprimé(s).`);
      await charger();
    } finally {
      setFusionEnCours(null);
    }
  };

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        Doublons
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Événements présents plusieurs fois en base pour le même jour (même nom, à la casse et aux accents
        près) — le plus souvent issus d'imports successifs. Choisissez l'exemplaire à conserver pour chaque
        groupe ; les autres seront supprimés (une sauvegarde de sécurité est créée automatiquement avant).
      </Text>

      {message && (
        <Text
          style={{
            display: 'block',
            marginBottom: 16,
            fontSize: 13,
            background: '#e6f4ff',
            color: '#0958d9',
            padding: '8px 12px',
            borderRadius: 6,
          }}
        >
          {message}
        </Text>
      )}

      {!chargement && groupes.length === 0 && <Text type="secondary">Aucun doublon détecté.</Text>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groupes.map((groupe, index) => (
          <div key={groupe.map((e) => e._id).join(',')} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 12 }}>
              {formatTitreEvenement(groupe[0].nom)}
            </Text>
            <Radio.Group
              value={selection[index]}
              onChange={(e) => setSelection((s) => ({ ...s, [index]: e.target.value }))}
              style={{ width: '100%' }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {groupe.map((e) => (
                  <label
                    key={e._id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      cursor: 'pointer',
                      flexWrap: 'wrap',
                    }}
                  >
                    <Radio value={e._id} />
                    <ValidationBadge evenement={e} />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {formatDate(e.dateDeDebut ?? e.dateClef)}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {[e.quartier, e.lieu].filter(Boolean).join(' · ') || '—'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      Statut : {e.statut}
                    </Text>
                  </label>
                ))}
              </div>
            </Radio.Group>
            <Popconfirm
              title="Fusionner ce groupe de doublons ?"
              description="Les exemplaires non sélectionnés ci-dessus seront supprimés définitivement."
              okText="Fusionner"
              okButtonProps={{ danger: true, loading: fusionEnCours === index }}
              cancelText="Annuler"
              onConfirm={() => fusionner(index)}
            >
              <Button danger size="small" style={{ marginTop: 12 }} loading={fusionEnCours === index}>
                Fusionner ce groupe
              </Button>
            </Popconfirm>
          </div>
        ))}
      </div>
    </div>
  );
}
