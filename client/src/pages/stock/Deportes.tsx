import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Empty, Grid, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { useDirections } from '../../components/EditeurDroits';
import type { DepotStock, LigneDepot } from '../../types';
import { formatEuro, formatJour } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

interface Referent {
  _id: string;
  nom: string;
  email: string;
}

/** Stocks confiés aux directions : référents, contenu, relances et réintégrations. */
export default function Deportes() {
  const mobile = !Grid.useBreakpoint().md;
  const directions = useDirections();
  const [depots, setDepots] = useState<DepotStock[]>([]);
  const [delaiRelance, setDelaiRelance] = useState(30);
  const [referents, setReferents] = useState<Referent[]>([]);
  const [creation, setCreation] = useState<{ directionId: string | null; referentId: string | null } | null>(null);
  const [detail, setDetail] = useState<{ depot: DepotStock; lignes: LigneDepot[] } | null>(null);
  const [reintegration, setReintegration] = useState<Record<string, number>>({});

  const charger = () =>
    api.get<{ depots: DepotStock[]; relanceDeportJours: number }>('/stock/depots').then((d) => {
      setDepots(d.depots);
      setDelaiRelance(d.relanceDeportJours);
    });

  useEffect(() => {
    charger();
    api.get<{ comptes: Referent[] }>('/stock/referents-possibles').then((d) => setReferents(d.comptes));
  }, []);

  const ouvrir = async (depot: DepotStock) => {
    const d = await api.get<{ depot: DepotStock; lignes: LigneDepot[] }>(`/stock/depots/${depot._id}`);
    setReintegration({});
    setDetail(d);
  };

  const modifier = async (depot: DepotStock, champs: { referentId?: string | null; actif?: boolean }) => {
    if (await lancer(api.put(`/stock/depots/${depot._id}`, { referentId: depot.referentId, actif: depot.actif, ...champs }))) {
      await charger();
      if (detail) ouvrir({ ...depot, ...champs });
    }
  };

  const enRetard = (p: DepotStock) => {
    const depuis = new Date(p.derniereDeclaration ?? p.createdAt).getTime();
    return Date.now() - depuis > delaiRelance * 86_400_000;
  };

  const sansDepot = directions.filter((d) => d.actif && !depots.some((p) => p.directionId === d._id));

  return (
    <Card
      title="Stocks déportés"
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreation({ directionId: null, referentId: null })}>
          Nouveau stock déporté
        </Button>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Les goodies remis à une direction dotée d'un stock déporté y sont versés. Le référent déclare ensuite les sorties et retours.
        Relance conseillée après {delaiRelance} jours sans déclaration. Les cadeaux protocolaires restent au local central.
      </Text>
      {depots.length === 0 ? (
        <Empty description="Aucun stock déporté" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {depots.map((p) => (
            <Card
              key={p._id}
              size="small"
              title={p.direction}
              extra={
                !p.actif ? <Tag>Inactif</Tag> : enRetard(p) ? <Tag color={p.derniereRelance ? 'blue' : 'red'}>{p.derniereRelance ? 'Relancé' : 'À relancer'}</Tag> : <Tag color="green">À jour</Tag>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Text>Référent : {p.referent ?? <Text type="secondary">non désigné</Text>}</Text>
                <Text>
                  {p.nombreArticles} article(s) · {formatEuro(p.valeur)}
                </Text>
                <Text type="secondary">Dernière déclaration : {p.derniereDeclaration ? formatJour(p.derniereDeclaration) : 'aucune'}</Text>
                <Space wrap style={{ marginTop: 6 }}>
                  <Button size="small" onClick={() => ouvrir(p)}>
                    Détail
                  </Button>
                  {p.actif && enRetard(p) && p.referent && (
                    <Button size="small" danger onClick={async () => (await lancer(api.post(`/stock/depots/${p._id}/relance`))) && charger()}>
                      Relancer le référent
                    </Button>
                  )}
                </Space>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        title="Nouveau stock déporté"
        open={creation !== null}
        onCancel={() => setCreation(null)}
        okText="Créer"
        cancelText="Annuler"
        okButtonProps={{ disabled: !creation?.directionId }}
        onOk={async () => {
          if (creation && (await lancer(api.post('/stock/depots', creation)))) {
            setCreation(null);
            charger();
          }
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Select
            placeholder="Direction"
            value={creation?.directionId ?? undefined}
            onChange={(directionId) => creation && setCreation({ ...creation, directionId })}
            options={sansDepot.map((d) => ({ value: d._id, label: d.nom }))}
            showSearch
            optionFilterProp="label"
          />
          <Select
            placeholder="Référent (facultatif)"
            allowClear
            value={creation?.referentId ?? undefined}
            onChange={(referentId) => creation && setCreation({ ...creation, referentId: referentId ?? null })}
            options={referents.map((r) => ({ value: r._id, label: `${r.nom} (${r.email})` }))}
            showSearch
            optionFilterProp="label"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            Seuls les comptes ayant au moins le niveau Contribution sur le module peuvent être référents.
          </Text>
        </div>
      </Modal>

      <Drawer title={detail ? `Stock déporté — ${detail.depot.direction}` : ''} open={detail !== null} onClose={() => setDetail(null)} width={mobile ? '100%' : 560}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Référent</div>
              <Select
                allowClear
                placeholder="Aucun référent"
                value={detail.depot.referentId ?? undefined}
                onChange={(referentId) => modifier(detail.depot, { referentId: referentId ?? null })}
                options={referents.map((r) => ({ value: r._id, label: `${r.nom} (${r.email})` }))}
                style={{ width: '100%' }}
                showSearch
                optionFilterProp="label"
              />
            </div>
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Switch checked={detail.depot.actif} onChange={(actif) => modifier(detail.depot, { actif })} />
              Stock déporté actif
            </label>
            <Table
              rowKey="articleId"
              size="small"
              pagination={false}
              dataSource={detail.lignes.filter((l) => l.quantite > 0)}
              locale={{ emptyText: 'Stock vide' }}
              columns={[
                { title: 'Article', key: 'a', render: (_, l) => `${l.reference} · ${l.libelle}` },
                { title: 'Quantité', dataIndex: 'quantite', align: 'right' },
                {
                  title: 'À réintégrer',
                  key: 'r',
                  render: (_, l) => (
                    <InputNumber
                      min={0}
                      max={l.quantite}
                      value={reintegration[l.articleId] ?? 0}
                      onChange={(v) => setReintegration({ ...reintegration, [l.articleId]: Number(v ?? 0) })}
                      aria-label={`Quantité de ${l.libelle} à réintégrer`}
                    />
                  ),
                },
              ]}
            />
            <div>
              <Button
                disabled={!Object.values(reintegration).some((q) => q > 0)}
                onClick={async () => {
                  const lignes = Object.entries(reintegration)
                    .filter(([, q]) => q > 0)
                    .map(([articleId, quantite]) => ({ articleId, quantite }));
                  if (await lancer(api.post(`/stock/depots/${detail.depot._id}/reintegration`, { lignes }))) {
                    await charger();
                    ouvrir(detail.depot);
                  }
                }}
              >
                Réintégrer au stock central
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </Card>
  );
}
