import { useEffect, useState } from 'react';
import { Button, Card, Input, InputNumber, Space, Switch, Table, Tag, Typography } from 'antd';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';
import type { ArticleMateriel } from '../../types';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

/** Matériel logistique prêté aux projets : stock total et pic d'utilisation sur les projets à venir. */
export default function Materiel() {
  const { peut } = useAuth();
  const administrateur = peut('projets', 'administration');
  const [articles, setArticles] = useState<ArticleMateriel[]>([]);
  const [nouveau, setNouveau] = useState({ nom: '', unite: 'u.', total: 0 });

  const charger = () => api.get<{ articles: ArticleMateriel[] }>('/projets/materiel').then((d) => setArticles(d.articles));
  useEffect(() => {
    charger();
  }, []);

  const modifier = async (a: ArticleMateriel, champs: Partial<ArticleMateriel>) => {
    const { nom, unite, total, actif } = { ...a, ...champs };
    if (await lancer(api.put(`/projets/materiel/${a._id}`, { nom, unite, total, actif }))) charger();
  };

  return (
    <Card title="Matériel logistique">
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Une réservation bloque le matériel du jour J − 1 au lendemain de la fin, pour le montage et le démontage. Le pic indique la
        plus forte mobilisation simultanée sur les projets à venir. Les articles marqués d'un code alimentent le plan d'implantation.
      </Text>
      <Table
        rowKey="_id"
        size="small"
        pagination={false}
        dataSource={articles}
        scroll={{ x: 'max-content' }}
        columns={[
          { title: 'Code plan', dataIndex: 'code', width: 90, render: (v: string | null) => (v ? <Text code>{v}</Text> : '—') },
          {
            title: 'Article',
            key: 'nom',
            render: (_, a) =>
              administrateur ? (
                <Input defaultValue={a.nom} onBlur={(e) => e.target.value.trim() && e.target.value !== a.nom && modifier(a, { nom: e.target.value })} aria-label="Article" />
              ) : (
                <Text strong>{a.nom}</Text>
              ),
          },
          {
            title: 'Unité',
            key: 'u',
            width: 100,
            render: (_, a) =>
              administrateur ? <Input defaultValue={a.unite} onBlur={(e) => e.target.value.trim() && e.target.value !== a.unite && modifier(a, { unite: e.target.value })} aria-label="Unité" /> : a.unite,
          },
          {
            title: 'Stock total',
            key: 't',
            width: 120,
            align: 'right',
            render: (_, a) =>
              administrateur ? (
                <InputNumber min={0} defaultValue={a.total} onBlur={(e) => Number(e.target.value) !== a.total && modifier(a, { total: Number(e.target.value) || 0 })} aria-label="Stock total" />
              ) : (
                a.total
              ),
          },
          { title: 'Pic à venir', key: 'p', width: 110, align: 'right', render: (_, a) => (a.pic > a.total ? <Tag color="red">{a.pic}</Tag> : a.pic) },
          {
            title: 'Actif',
            key: 'a',
            width: 80,
            render: (_, a) => <Switch checked={a.actif} disabled={!administrateur} onChange={(actif) => modifier(a, { actif })} aria-label={`Actif : ${a.nom}`} />,
          },
        ]}
      />
      {administrateur && (
        <Space style={{ marginTop: 12 }} wrap>
          <Input placeholder="Nouvel article" value={nouveau.nom} onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })} style={{ width: 240 }} />
          <Input placeholder="Unité" value={nouveau.unite} onChange={(e) => setNouveau({ ...nouveau, unite: e.target.value })} style={{ width: 90 }} />
          <InputNumber min={0} value={nouveau.total} onChange={(v) => setNouveau({ ...nouveau, total: Number(v ?? 0) })} aria-label="Stock" />
          <Button
            disabled={!nouveau.nom.trim()}
            onClick={async () => {
              if (await lancer(api.post('/projets/materiel', nouveau))) {
                setNouveau({ nom: '', unite: 'u.', total: 0 });
                charger();
              }
            }}
          >
            Ajouter
          </Button>
        </Space>
      )}
    </Card>
  );
}
