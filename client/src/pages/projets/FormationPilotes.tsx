import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Drawer, Empty, Grid, Input, Popconfirm, Select, Space, Steps, Table, Tag, Typography } from 'antd';
import { api } from '../../api';
import { lancer } from '../../lib/actionStock';
import { COULEURS_NIVEAU, STATUTS_PROJET, formatLong } from '../../lib/projets';
import type { ProgressionPilote } from '../../types';

const { Text, Paragraph } = Typography;

/**
 * Formation des pilotes : un N1 en binôme, un N1 seul, un N2 en binôme, un N3 en copilote avant
 * toute autonomie. Une étape est acquise quand le projet correspondant a franchi son bilan.
 */
export default function FormationPilotes() {
  const navigate = useNavigate();
  const mobile = !Grid.useBreakpoint().md;
  const [pilotes, setPilotes] = useState<ProgressionPilote[]>([]);
  const [intervenants, setIntervenants] = useState<{ _id: string; nom: string }[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [ajout, setAjout] = useState<string | null>(null);

  const charger = () => api.get<{ pilotes: ProgressionPilote[] }>('/projets/formation').then((d) => setPilotes(d.pilotes));
  useEffect(() => {
    charger();
    api.get<{ intervenants: { _id: string; nom: string }[] }>('/projets/intervenants').then((d) => setIntervenants(d.intervenants));
  }, []);

  const pilote = pilotes.find((p) => p.utilisateurId === ouvert) ?? null;
  const maj = async (id: string, donnees: { autonome?: boolean; notes?: string }) => {
    if (await lancer(api.put(`/projets/formation/${id}`, donnees))) await charger();
  };
  const etat = (p: ProgressionPilote) => {
    if (p.autonome) return <Tag color="green">Autonome</Tag>;
    const faites = p.etapes.filter((e) => e.acquise).length;
    if (faites === p.etapes.length) return <Tag color="gold">Parcours terminé : à déclarer autonome</Tag>;
    return <Tag color="blue">En formation · {faites}/{p.etapes.length}</Tag>;
  };

  return (
    <Card
      title="Formation des pilotes"
      extra={
        <Space wrap>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Ajouter un agent au suivi"
            value={ajout ?? undefined}
            onChange={setAjout}
            options={intervenants.filter((i) => !pilotes.some((p) => p.utilisateurId === i._id)).map((i) => ({ value: i._id, label: i.nom }))}
            style={{ width: 240 }}
          />
          <Button
            disabled={!ajout}
            onClick={async () => {
              await maj(ajout!, { notes: '' });
              setAjout(null);
            }}
          >
            Ajouter
          </Button>
        </Space>
      }
    >
      <Paragraph type="secondary">
        Parcours avant toute autonomie : un N1 en binôme avec vous, un N1 seul, un N2 en binôme, un N3 en copilote. Une étape est
        acquise quand le pilote a mené le projet jusqu'au bilan (dernier jalon franchi). Le mode d'accompagnement et le formateur se
        renseignent dans l'onglet Équipe de chaque projet. Un agent déjà expérimenté peut être déclaré autonome directement.
      </Paragraph>
      <Table
        rowKey="utilisateurId"
        size="small"
        dataSource={pilotes}
        pagination={false}
        locale={{ emptyText: <Empty description="Aucun pilote suivi : désignez un pilote sur un projet, ou ajoutez un agent." /> }}
        onRow={(p) => ({
          onClick: () => {
            setOuvert(p.utilisateurId);
            setNotes(p.notes);
          },
          style: { cursor: 'pointer' },
        })}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Pilote', dataIndex: 'nom', render: (v: string) => <Text strong>{v}</Text> },
          { title: 'État', key: 'e', render: (_, p) => etat(p) },
          {
            title: 'Étapes',
            key: 's',
            render: (_, p) => (
              <Space size={4} wrap>
                {p.etapes.map((e) => {
                  const enCours = e.projets.some((x) => !x.valide);
                  return (
                    <Tag key={e.code} color={e.acquise ? 'green' : enCours ? 'blue' : undefined}>
                      {e.acquise ? '✓ ' : enCours ? '… ' : ''}
                      {e.libelle}
                    </Tag>
                  );
                })}
              </Space>
            ),
          },
          { title: 'Projets pilotés', key: 'n', align: 'right', render: (_, p) => p.projets.length },
        ]}
      />

      <Drawer title={pilote?.nom} open={!!pilote} onClose={() => setOuvert(null)} width={mobile ? '100%' : 640}>
        {pilote && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>{etat(pilote)}</div>
            {pilote.autonome ? (
              <Alert
                type="success"
                showIcon
                message={`Autonome depuis le ${formatLong(pilote.autonomeLe)}${pilote.decidePar ? `, décision de ${pilote.decidePar}` : ''}.`}
                action={
                  <Popconfirm title="Remettre ce pilote en formation ?" okText="Confirmer" cancelText="Annuler" onConfirm={() => maj(pilote.utilisateurId, { autonome: false })}>
                    <Button size="small">Retirer l'autonomie</Button>
                  </Popconfirm>
                }
              />
            ) : (
              <>
                <Steps
                  direction="vertical"
                  size="small"
                  current={pilote.etapes.findIndex((e) => !e.acquise)}
                  items={pilote.etapes.map((e) => ({
                    title: e.libelle,
                    status: e.acquise ? 'finish' : e.code === pilote.prochaine ? 'process' : 'wait',
                    description: e.projets.length ? (
                      <Space direction="vertical" size={2}>
                        {e.projets.map((x) => (
                          <a key={x._id} onClick={() => navigate(`/projets/${x._id}?onglet=equipe`)}>
                            {x.titre} · {formatLong(x.dateJour)} · N{x.niveau}
                            {x.formateur?.nom && ` · avec ${x.formateur.nom}`} · {x.valide ? 'bilan franchi' : 'en cours'}
                          </a>
                        ))}
                      </Space>
                    ) : (
                      <Text type="secondary">Aucun projet pour cette étape.</Text>
                    ),
                  }))}
                />
                <Popconfirm
                  title={`Déclarer ${pilote.nom} autonome ?`}
                  description={
                    pilote.etapes.every((e) => e.acquise)
                      ? 'Les quatre étapes sont acquises.'
                      : 'Toutes les étapes ne sont pas acquises : à réserver à un agent déjà expérimenté.'
                  }
                  okText="Déclarer autonome"
                  cancelText="Annuler"
                  onConfirm={() => maj(pilote.utilisateurId, { autonome: true })}
                >
                  <Button type="primary">Déclarer autonome</Button>
                </Popconfirm>
              </>
            )}
            <Card size="small" title="Projets pilotés">
              {pilote.projets.length === 0 ? (
                <Text type="secondary">Aucun.</Text>
              ) : (
                pilote.projets.map((x) => (
                  <div key={x._id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
                    <Tag color={COULEURS_NIVEAU[x.niveau]}>N{x.niveau}</Tag>
                    <a onClick={() => navigate(`/projets/${x._id}`)}>{x.titre}</a>
                    <Text type="secondary">{formatLong(x.dateJour)}</Text>
                    <Tag>{x.formationMode === 'binome' ? 'En binôme' : x.formationMode === 'copilote' ? 'En copilote' : x.formationMode === 'seul' ? 'Seul' : 'Mode non précisé'}</Tag>
                    <Tag color={STATUTS_PROJET[x.statut as keyof typeof STATUTS_PROJET]?.couleur}>{STATUTS_PROJET[x.statut as keyof typeof STATUTS_PROJET]?.libelle}</Tag>
                  </div>
                ))
              )}
            </Card>
            <div>
              <Text strong>Notes de suivi</Text>
              <Input.TextArea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Points de suivi, axes de progrès, prochain projet envisagé…" style={{ marginTop: 6 }} />
              <Button style={{ marginTop: 8 }} disabled={notes === pilote.notes} onClick={() => maj(pilote.utilisateurId, { notes })}>
                Enregistrer les notes
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
