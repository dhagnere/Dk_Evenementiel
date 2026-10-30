import { useEffect, useState } from 'react';
import { Button, Grid, Popconfirm, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { DownloadOutlined, SaveOutlined } from '@ant-design/icons';
import { api } from '../api';
import type { Sauvegarde } from '../types';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const LIBELLES_TYPE: Record<Sauvegarde['type'], { libelle: string; couleur: string }> = {
  quotidienne: { libelle: 'Quotidienne', couleur: 'blue' },
  manuelle: { libelle: 'Manuelle', couleur: 'purple' },
  'avant-import-evenements': { libelle: 'Avant import événements', couleur: 'orange' },
  'avant-import-utilisateurs': { libelle: 'Avant import utilisateurs', couleur: 'orange' },
  'avant-restauration': { libelle: 'Avant restauration', couleur: 'red' },
  'avant-fusion-doublons': { libelle: 'Avant fusion de doublons', couleur: 'orange' },
};

/** Formate une date ISO en "JJ/MM/AAAA à HH:MM" (locale fr-FR), ou "—" si absente/invalide. */
function formatDateHeure(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Sauvegardes() {
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const [sauvegardes, setSauvegardes] = useState<Sauvegarde[]>([]);
  const [chargement, setChargement] = useState(true);
  const [creation, setCreation] = useState(false);
  const [restaurationEnCoursId, setRestaurationEnCoursId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const charger = async () => {
    setChargement(true);
    try {
      const data = await api.get<{ sauvegardes: Sauvegarde[] }>('/sauvegardes');
      setSauvegardes(data.sauvegardes);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    charger();
  }, []);

  const creerSauvegarde = async () => {
    setCreation(true);
    setMessage(null);
    try {
      await api.post('/sauvegardes');
      setMessage('Sauvegarde créée.');
      charger();
    } finally {
      setCreation(false);
    }
  };

  const telecharger = (s: Sauvegarde) => {
    window.open(`/api/sauvegardes/${s._id}/export`, '_blank');
  };

  const restaurer = async (s: Sauvegarde) => {
    setRestaurationEnCoursId(s._id);
    setMessage(null);
    try {
      await api.post(`/sauvegardes/${s._id}/restaurer`);
      setMessage(
        `Restauration effectuée depuis la sauvegarde du ${formatDateHeure(s.createdAt)} (${s.nombreEvenements} événements, ${s.nombreUtilisateurs} utilisateurs). Une sauvegarde de l'état précédent a été créée automatiquement.`
      );
      charger();
    } finally {
      setRestaurationEnCoursId(null);
    }
  };

  const columns: TableColumnsType<Sauvegarde> = [
    { title: 'Date', key: 'date', width: 180, render: (_, s) => formatDateHeure(s.createdAt) },
    {
      title: 'Type',
      key: 'type',
      width: 190,
      render: (_, s) => <Tag color={LIBELLES_TYPE[s.type].couleur}>{LIBELLES_TYPE[s.type].libelle}</Tag>,
    },
    { title: 'Événements', dataIndex: 'nombreEvenements', key: 'nombreEvenements', width: 110 },
    { title: 'Utilisateurs', dataIndex: 'nombreUtilisateurs', key: 'nombreUtilisateurs', width: 110 },
    {
      title: 'Actions',
      key: 'actions',
      width: 260,
      render: (_, s) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => telecharger(s)}>
            Télécharger
          </Button>
          <Popconfirm
            title="Restaurer cette sauvegarde ?"
            description={
              <div style={{ maxWidth: 280 }}>
                Tous les événements et utilisateurs actuels seront remplacés par ceux de cette sauvegarde du{' '}
                {formatDateHeure(s.createdAt)}. Cette action est immédiate (l'état actuel sera cependant
                automatiquement sauvegardé juste avant, pour pouvoir l'annuler si besoin).
              </div>
            }
            okText="Restaurer"
            okButtonProps={{ danger: true, loading: restaurationEnCoursId === s._id }}
            cancelText="Annuler"
            onConfirm={() => restaurer(s)}
          >
            <Button size="small" danger loading={restaurationEnCoursId === s._id}>
              Restaurer
            </Button>
          </Popconfirm>
        </div>
      ),
    },
  ];

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        Sauvegardes
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Une sauvegarde des événements et utilisateurs est créée automatiquement chaque jour, ainsi qu'avant
        chaque import de fichier CSV. En cas de problème (import raté, données corrompues…), restaurez une
        sauvegarde antérieure pour revenir en arrière.
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

      <Button
        type="primary"
        icon={<SaveOutlined />}
        loading={creation}
        onClick={creerSauvegarde}
        block={mobile}
        style={{ marginBottom: 16 }}
      >
        Créer une sauvegarde maintenant
      </Button>

      <Table
        rowKey="_id"
        size="small"
        bordered
        loading={chargement}
        columns={columns}
        dataSource={sauvegardes}
        pagination={false}
        scroll={{ x: mobile ? 'max-content' : undefined }}
      />
    </div>
  );
}
