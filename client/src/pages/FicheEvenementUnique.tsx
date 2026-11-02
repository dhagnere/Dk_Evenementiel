import { ValidationSerieBadge } from '../components/ValidationBadge';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Alert, Button, Card, Descriptions, Empty, Progress, Select, Space, Table, Tag, Typography } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { FicheEvenementUnique as Fiche, TypeProjet } from '../types';
import { STATUTS_PROJET, formatLong, useReferentiels } from '../lib/projets';
import { couleurStatut, formatEuro, formatJour } from '../lib/formatStock';
import { lancer } from '../lib/actionStock';

const { Text, Title } = Typography;

/**
 * Fiche événement unique : la manifestation telle qu'inscrite au calendrier, son projet de
 * préparation et ses demandes de goodies, chacun selon les droits du compte.
 */
export default function FicheEvenementUnique() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { peut } = useAuth();
  const ref = useReferentiels();
  const [fiche, setFiche] = useState<Fiche | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [type, setType] = useState<TypeProjet>('festif');

  const charger = () =>
    api
      .get<Fiche>(`/liaisons/evenement/${id}`)
      .then(setFiche)
      .catch((err: Error) => setErreur(err.message));

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (erreur) return <Alert type="error" showIcon message={erreur} />;
  if (!fiche) return null;
  const e = fiche.evenement;

  const creerProjet = async () => {
    const res = await api.post<{ ok: boolean; message: string; projetId?: string }>(`/liaisons/evenement/${e._id}/projet`, { type });
    if ((await lancer(Promise.resolve(res))) && res.projetId) navigate(`/projets/${res.projetId}`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ padding: 0 }} onClick={() => navigate(-1)}>
          Retour
        </Button>
        <Text type="secondary" style={{ display: 'block' }}>
          Fiche événement
        </Text>
        <Title level={3} style={{ margin: 0 }}>
          {e.nom}
        </Title>
      </div>

      <Card title="Au calendrier">
        <Descriptions size="small" column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="Dates">
            {formatLong(e.dateDeDebut)}
            {e.dateDeFin ? ` → ${formatLong(e.dateDeFin)}` : ''}
          </Descriptions.Item>
          <Descriptions.Item label="Validation">
            <ValidationSerieBadge valide={e.valide} dateClef={e.dateClef} statut={e.statut} />
          </Descriptions.Item>
          <Descriptions.Item label="Lieu">{e.lieu || '—'}</Descriptions.Item>
          <Descriptions.Item label="Quartier">{e.quartier || '—'}</Descriptions.Item>
          <Descriptions.Item label="Pilote">{[e.pilote, e.directionPilote].filter(Boolean).join(' — ') || '—'}</Descriptions.Item>
          <Descriptions.Item label="Nature">{e.nature || '—'}</Descriptions.Item>
          <Descriptions.Item label="Inscrit le">{formatLong(e.inscritLe)}</Descriptions.Item>
        </Descriptions>
        {peut('calendrier', 'lecture') && (
          <Button style={{ marginTop: 8 }} onClick={() => navigate('/calendrier/liste')}>
            Voir dans la liste du calendrier
          </Button>
        )}
      </Card>

      {fiche.projets !== null && (
        <Card title="Projet de préparation">
          {fiche.projets.length === 0 ? (
            <Space direction="vertical">
              <Text type="secondary">Aucun projet n'est rattaché à cet événement.</Text>
              {peut('projets', 'administration') && (
                <Space wrap>
                  <Select value={type} onChange={setType} options={Object.entries(ref?.types ?? {}).map(([value, label]) => ({ value, label }))} style={{ width: 300 }} />
                  <Button type="primary" onClick={creerProjet}>
                    Créer le projet et son rétroplanning
                  </Button>
                </Space>
              )}
            </Space>
          ) : (
            fiche.projets.map((p) => (
              <div key={p._id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <Text strong>{p.titre}</Text>
                <Tag color={STATUTS_PROJET[p.statut].couleur}>{STATUTS_PROJET[p.statut].libelle}</Tag>
                <Progress percent={p.totalTaches ? Math.round((p.tachesFaites * 100) / p.totalTaches) : 0} size="small" style={{ width: 160 }} />
                {p.tachesEnRetard > 0 && <Tag color="red">{p.tachesEnRetard} tâche(s) en retard</Tag>}
                <Button onClick={() => navigate(`/projets/${p._id}`)}>Ouvrir le projet</Button>
              </div>
            ))
          )}
        </Card>
      )}

      {fiche.demandesStock !== null && (
        <Card
          title="Goodies et cadeaux"
          extra={
            <Button onClick={() => navigate(`/stock/demandes?evenement=${e._id}`)}>Demander des goodies pour cet événement</Button>
          }
        >
          {fiche.demandesStock.length === 0 ? (
            <Empty description="Aucune demande rattachée" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              rowKey="_id"
              size="small"
              pagination={false}
              dataSource={fiche.demandesStock}
              columns={[
                { title: 'N°', dataIndex: 'numero' },
                { title: 'Direction', dataIndex: 'directionNom' },
                { title: 'Article', key: 'a', render: (_, d) => `${d.reference} · ${d.libelle}` },
                { title: 'Qté', dataIndex: 'quantite', align: 'right' },
                { title: 'Valeur', key: 'v', align: 'right', render: (_, d) => formatEuro(d.valeur) },
                { title: 'Besoin', key: 'b', render: (_, d) => formatJour(d.dateBesoin) },
                { title: 'Statut', key: 's', render: (_, d) => <Tag color={couleurStatut(d.statut)}>{d.statut}</Tag> },
              ]}
            />
          )}
        </Card>
      )}
    </div>
  );
}
