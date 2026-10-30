import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs, { type Dayjs } from 'dayjs';
import { Button, Card, DatePicker, Drawer, Grid, Input, InputNumber, Progress, Segmented, Select, Space, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { IndicateursProjet, TypeProjet } from '../../types';
import { STATUTS_PROJET, ecart, formatLong, useReferentiels } from '../../lib/projets';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>{libelle}</div>
      {children}
    </label>
  );
}

/** Création d'un projet : le rétroplanning est généré à partir des modèles du type choisi. */
export function NouveauProjet({ ouvert, onFerme }: { ouvert: boolean; onFerme: () => void }) {
  const navigate = useNavigate();
  const ref = useReferentiels();
  const mobile = !Grid.useBreakpoint().md;
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeProjet>('festif');
  const [dates, setDates] = useState<[Dayjs | null, Dayjs | null]>([null, null]);
  const [lieu, setLieu] = useState('');
  const [jauge, setJauge] = useState<number | null>(null);
  const [referent, setReferent] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const creer = async () => {
    setEnvoi(true);
    try {
      const res = await api.post<{ ok: boolean; message: string; projet?: { _id: string } }>('/projets', {
        titre,
        type,
        dateJour: dates[0]?.format('YYYY-MM-DD'),
        dateFin: dates[1] && !dates[1].isSame(dates[0], 'day') ? dates[1].format('YYYY-MM-DD') : null,
        lieu,
        jauge,
        referent,
      });
      if (await lancer(Promise.resolve(res))) {
        onFerme();
        if (res.projet) navigate(`/projets/${res.projet._id}`);
      }
    } finally {
      setEnvoi(false);
    }
  };

  const delai = dates[0] ? dates[0].diff(dayjs().startOf('day'), 'day') : null;

  return (
    <Drawer
      title="Nouveau projet"
      open={ouvert}
      onClose={onFerme}
      width={mobile ? '100%' : 480}
      extra={
        <Space>
          <Button onClick={onFerme}>Annuler</Button>
          <Button type="primary" loading={envoi} disabled={!titre.trim() || !dates[0]} onClick={creer}>
            Créer et générer le rétroplanning
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Champ libelle="Intitulé">
          <Input value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Ex. Fête de la musique, quartier de Malo" />
        </Champ>
        <Champ libelle="Type">
          <Select value={type} onChange={setType} options={Object.entries(ref?.types ?? {}).map(([value, label]) => ({ value, label }))} style={{ width: '100%' }} />
        </Champ>
        <Champ libelle="Jour J (et fin si plusieurs jours)">
          <DatePicker.RangePicker
            format="DD/MM/YYYY"
            allowEmpty={[false, true]}
            value={dates}
            onChange={(v) => setDates([v?.[0] ?? null, v?.[1] ?? null])}
            style={{ width: '100%' }}
          />
        </Champ>
        {delai !== null && ref && delai < ref.delaiInscriptionJours && (
          <Text type="warning">
            Jour J dans {delai} jours : l'échéance des 6 mois n'est pas tenue. Les tâches antérieures apparaîtront en retard.
          </Text>
        )}
        <Champ libelle="Lieu">
          <Input value={lieu} onChange={(e) => setLieu(e.target.value)} />
        </Champ>
        <Champ libelle="Jauge prévisionnelle">
          <InputNumber min={0} value={jauge} onChange={(v) => setJauge(v === null ? null : Number(v))} style={{ width: '100%' }} />
        </Champ>
        <Champ libelle="Référent du service">
          <Input value={referent} onChange={(e) => setReferent(e.target.value)} />
        </Champ>
      </div>
    </Drawer>
  );
}

export default function ListeProjets() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const ref = useReferentiels();
  const [filtre, setFiltre] = useState<'actifs' | 'archives' | 'tous'>('actifs');
  const [projets, setProjets] = useState<IndicateursProjet[]>([]);
  const [creation, setCreation] = useState(false);

  useEffect(() => {
    api.get<{ projets: IndicateursProjet[] }>(`/projets?filtre=${filtre}`).then((d) => setProjets(d.projets));
  }, [filtre]);

  const colonnes: TableColumnsType<IndicateursProjet> = [
    { title: 'Date', key: 'date', width: 120, render: (_, p) => formatLong(p.dateJour) },
    {
      title: 'Projet',
      key: 'titre',
      render: (_, p) => (
        <div>
          <Text strong>{p.titre}</Text>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{ref?.types[p.type]}</div>
        </div>
      ),
    },
    { title: 'Lieu', dataIndex: 'lieu', render: (v: string) => v || '—' },
    { title: 'Jauge', key: 'jauge', width: 90, align: 'right', render: (_, p) => (p.jauge ? p.jauge.toLocaleString('fr-FR') : '—') },
    { title: 'Statut', key: 'statut', width: 130, render: (_, p) => <Tag color={STATUTS_PROJET[p.statut].couleur}>{STATUTS_PROJET[p.statut].libelle}</Tag> },
    {
      title: 'Avancement',
      key: 'avancement',
      width: 150,
      render: (_, p) => <Progress percent={p.totalTaches ? Math.round((p.tachesFaites * 100) / p.totalTaches) : 0} size="small" />,
    },
    {
      title: 'Alertes',
      key: 'alertes',
      render: (_, p) => (
        <Space size={4} wrap>
          {p.tachesEnRetard > 0 && <Tag color="red">{p.tachesEnRetard} tâche(s)</Tag>}
          {p.demarchesEnRetard > 0 && <Tag color="orange">{p.demarchesEnRetard} réglementaire</Tag>}
          {ref && ecart(p.dateJour, p.inscritLe) < ref.delaiInscriptionJours && <Tag color="red">Hors délai</Tag>}
        </Space>
      ),
    },
  ];

  return (
    <Card
      title="Projets"
      extra={
        <Space>
          <Segmented
            value={filtre}
            onChange={(v) => setFiltre(v as typeof filtre)}
            options={[
              { value: 'actifs', label: 'En cours' },
              { value: 'archives', label: 'Clôturés et annulés' },
              { value: 'tous', label: 'Tous' },
            ]}
          />
          {peut('projets', 'administration') && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreation(true)}>
              Nouveau projet
            </Button>
          )}
        </Space>
      }
    >
      <Table
        rowKey="_id"
        size="small"
        columns={colonnes}
        dataSource={projets}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        scroll={{ x: 'max-content' }}
        onRow={(p) => ({ onClick: () => navigate(`/projets/${p._id}`), style: { cursor: 'pointer' } })}
        locale={{ emptyText: 'Aucun projet dans cette sélection' }}
      />
      <NouveauProjet ouvert={creation} onFerme={() => setCreation(false)} />
    </Card>
  );
}
