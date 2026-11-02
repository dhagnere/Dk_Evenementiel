import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Empty, Progress, Space, Table, Tag, Typography } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ConflitMateriel, IndicateursProjet } from '../../types';
import { COULEURS_NIVEAU, METEO, aujourdhui, formatCourt, formatLong, libelleRole, useReferentiels } from '../../lib/projets';
import { NouveauProjet } from './ListeProjets';

const { Text, Title } = Typography;

interface Donnees {
  actifs: IndicateursProjet[];
  echeances: { _id: string; libelle: string; porte: string; bloquante: boolean; echeance: string; projetId: string; titre: string }[];
  calendrier: { _id: string; titre: string; niveau: number; dateJour: string }[];
  conflits: ConflitMateriel[];
  demandesAInstruire: number | null;
}

const COULEURS_NIVEAU_HEX: Record<number, string> = { 1: '#13a8a8', 2: '#1c5da8', 3: '#722ed1', 4: '#c41d7f' };

function Indicateur({ valeur, libelle, alerte }: { valeur: number; libelle: string; alerte?: boolean }) {
  return (
    <Card style={{ borderLeft: `4px solid ${alerte ? '#be3327' : '#2c7a4b'}` }}>
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{valeur}</div>
      <Text type="secondary">{libelle}</Text>
    </Card>
  );
}

/** Pilotage : échéances proches, portefeuille, conflits de matériel et calendrier des 12 mois. */
export default function TableauDeBordProjets() {
  const { peut } = useAuth();
  const navigate = useNavigate();
  const ref = useReferentiels();
  const [d, setD] = useState<Donnees | null>(null);
  const [creation, setCreation] = useState(false);

  useEffect(() => {
    api.get<Donnees>('/projets/tableau-de-bord').then(setD);
  }, []);

  if (!d || !ref) return null;
  const jour = aujourdhui();
  const enRetard = d.actifs.reduce((n, p) => n + p.tachesEnRetard, 0);

  const mois = Array.from({ length: 12 }, (_, i) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() + i);
    const cle = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    return { cle, libelle: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), projets: d.calendrier.filter((p) => p.dateJour.startsWith(cle)) };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <Text type="secondary">Pilotage · {formatLong(jour)}</Text>
          <Title level={3} style={{ margin: 0 }}>
            Projets événementiels
          </Title>
        </div>
        {peut('projets', 'administration') && (
          <Button type="primary" onClick={() => setCreation(true)}>
            Nouveau projet
          </Button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Indicateur valeur={d.actifs.filter((p) => p.statut === 'preparation').length} libelle="projets en préparation" />
        <Indicateur valeur={enRetard} libelle="tâches en retard sur le rétroplanning" alerte={enRetard > 0} />
        {d.demandesAInstruire !== null && <Indicateur valeur={d.demandesAInstruire} libelle="demandes à instruire" alerte={d.demandesAInstruire > 0} />}
        <Indicateur valeur={d.conflits.length} libelle="conflits de matériel" alerte={d.conflits.length > 0} />
      </div>

      {d.conflits.length > 0 && (
        <Card title="Conflits de matériel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {d.conflits.map((c) => (
              <Alert
                key={`${c.projetId}${c.articleId}`}
                type="error"
                showIcon
                message={`${c.nom} : ${c.demande} ${c.unite} demandés pour ${c.total} en stock autour du ${formatLong(c.dateJour)} (${[c.titre, ...c.concurrents].join(', ')}).`}
              />
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, alignItems: 'start' }}>
        <Card title="Échéances des 14 prochains jours" extra={<Text type="secondary">retards inclus</Text>}>
          {d.echeances.length === 0 ? (
            <Empty description="Aucune échéance dans les 14 jours" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              rowKey="_id"
              size="small"
              pagination={false}
              dataSource={d.echeances.slice(0, 15)}
              onRow={(e) => ({ onClick: () => navigate(`/projets/${e.projetId}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Échéance', key: 'e', width: 90, render: (_, e) => (e.echeance < jour ? <Tag color="red">{formatCourt(e.echeance)}</Tag> : formatCourt(e.echeance)) },
                { title: 'Tâche', dataIndex: 'libelle' },
                { title: 'Projet', dataIndex: 'titre' },
                { title: 'Porte (P)', key: 'p', render: (_, e) => libelleRole(ref.referentiel, e.porte) },
              ]}
            />
          )}
        </Card>
        <Card title="Portefeuille">
          {d.actifs.length === 0 ? (
            <Empty description="Aucun projet en préparation" image={Empty.PRESENTED_IMAGE_SIMPLE} />
          ) : (
            <Table
              rowKey="_id"
              size="small"
              pagination={false}
              dataSource={d.actifs}
              onRow={(p) => ({ onClick: () => navigate(`/projets/${p._id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: 'Date', key: 'd', width: 80, render: (_, p) => formatCourt(p.dateJour) },
                {
                  title: 'Projet',
                  key: 't',
                  render: (_, p) => (
                    <Space size={4}>
                      <Tag color={COULEURS_NIVEAU[p.niveau]} style={{ fontSize: 11 }}>
                        N{p.niveau}
                      </Tag>
                      <Text strong>{p.titre}</Text>
                    </Space>
                  ),
                },
                {
                  title: 'Avancement',
                  key: 'a',
                  width: 170,
                  render: (_, p) => (
                    <div>
                      <Progress percent={p.totalTaches ? Math.round((p.tachesFaites * 100) / p.totalTaches) : 0} size="small" />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {p.tachesFaites}/{p.totalTaches}
                        {p.tachesEnRetard > 0 && <Text type="danger"> · {p.tachesEnRetard} en retard</Text>}
                      </Text>
                    </div>
                  ),
                },
                {
                  title: 'Prochain jalon',
                  key: 'j',
                  width: 190,
                  render: (_, p) => (
                    <div>
                      {p.prochainJalon ? `${p.prochainJalon.code} ${p.prochainJalon.libelle} · ${formatCourt(p.prochainJalon.date)}` : '—'}
                      {p.meteo && (
                        <div>
                          <Tag color={METEO[p.meteo].tag} style={{ fontSize: 11 }}>
                            {METEO[p.meteo].libelle}
                          </Tag>
                          {(p.bloquants ?? 0) > 0 && <Text type="danger" style={{ fontSize: 12 }}>{p.bloquants} bloquante(s)</Text>}
                        </div>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>

      <Card title="Calendrier des 12 prochains mois">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
          {mois.map((m) => (
            <div key={m.cle} style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: 10, minHeight: 80 }}>
              <Text strong style={{ textTransform: 'capitalize' }}>
                {m.libelle}
              </Text>
              {m.projets.length === 0 && <div style={{ color: '#bfbfbf', fontSize: 12 }}>—</div>}
              {m.projets.map((p) => (
                <button
                  key={p._id}
                  onClick={() => navigate(`/projets/${p._id}`)}
                  title={p.titre}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    marginTop: 4,
                    padding: '3px 6px',
                    border: 'none',
                    borderLeft: `3px solid ${COULEURS_NIVEAU_HEX[p.niveau]}`,
                    background: '#f5f5f5',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 12,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <b>{Number(p.dateJour.slice(8, 10))}</b> {p.titre}
                </button>
              ))}
            </div>
          ))}
        </div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          Repères de couleur par niveau : turquoise N1 proximité · bleu N2 ville · violet N3 grand public · magenta N4 majeur.
        </Text>
      </Card>

      <NouveauProjet ouvert={creation} onFerme={() => setCreation(false)} />
    </div>
  );
}
