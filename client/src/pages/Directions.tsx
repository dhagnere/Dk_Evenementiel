import { useEffect, useState } from 'react';
import { Button, Card, Input, Switch, Table, Typography, type TableColumnsType } from 'antd';
import { api } from '../api';
import type { Direction } from '../types';

const { Text } = Typography;

/** Référentiel des directions, auxquelles les comptes sont rattachés. */
export default function Directions() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [nouvelle, setNouvelle] = useState('');
  const [renommage, setRenommage] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ type: 'info' | 'erreur'; texte: string } | null>(null);

  const charger = async () => {
    const data = await api.get<{ directions: Direction[] }>('/directions');
    setDirections(data.directions);
  };

  useEffect(() => {
    charger();
  }, []);

  const afficher = (res: { ok: boolean; message: string }) =>
    setMessage({ type: res.ok ? 'info' : 'erreur', texte: res.message });

  const creer = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post<{ ok: boolean; message: string }>('/directions', { nom: nouvelle });
    afficher(res);
    if (res.ok) setNouvelle('');
    charger();
  };

  const modifier = async (d: Direction, champs: Partial<Pick<Direction, 'nom' | 'actif'>>) => {
    afficher(await api.put<{ ok: boolean; message: string }>(`/directions/${d._id}`, { nom: d.nom, actif: d.actif, ...champs }));
    setRenommage((r) => {
      const { [d._id]: _retire, ...reste } = r;
      return reste;
    });
    charger();
  };

  const columns: TableColumnsType<Direction> = [
    {
      title: 'Nom',
      key: 'nom',
      render: (_, d) =>
        renommage[d._id] !== undefined ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Input
              value={renommage[d._id]}
              onChange={(e) => setRenommage((r) => ({ ...r, [d._id]: e.target.value }))}
              aria-label={`Nouveau nom de ${d.nom}`}
            />
            <Button type="primary" onClick={() => modifier(d, { nom: renommage[d._id] })} disabled={!renommage[d._id].trim()}>
              Enregistrer
            </Button>
          </div>
        ) : (
          <Text strong={d.actif} type={d.actif ? undefined : 'secondary'}>
            {d.nom}
          </Text>
        ),
    },
    { title: 'Comptes rattachés', dataIndex: 'nombreComptes', key: 'nombreComptes', width: 160 },
    {
      title: 'Active',
      key: 'actif',
      width: 100,
      render: (_, d) => <Switch checked={d.actif} onChange={(actif) => modifier(d, { actif })} aria-label={`Activer ${d.nom}`} />,
    },
    {
      title: '',
      key: 'actions',
      width: 120,
      render: (_, d) =>
        renommage[d._id] === undefined && (
          <Button size="small" onClick={() => setRenommage((r) => ({ ...r, [d._id]: d.nom }))}>
            Renommer
          </Button>
        ),
    },
  ];

  return (
    <Card title="Directions">
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Les directions délimitent le périmètre des comptes (demandes, stocks déportés). Une direction désactivée n’est plus
        proposée, mais les comptes qui y sont rattachés le restent.
      </Text>
      {message && (
        <Text
          style={{
            display: 'block',
            marginBottom: 12,
            fontSize: 13,
            padding: '6px 12px',
            borderRadius: 6,
            background: message.type === 'erreur' ? '#fff1f0' : '#e6f4ff',
            color: message.type === 'erreur' ? '#cf1322' : '#0958d9',
          }}
        >
          {message.texte}
        </Text>
      )}
      <form onSubmit={creer} style={{ display: 'flex', gap: 8, marginBottom: 16, maxWidth: 520 }}>
        <Input placeholder="Nom de la direction" value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} aria-label="Nom de la direction" />
        <Button type="primary" htmlType="submit" disabled={!nouvelle.trim()}>
          Ajouter
        </Button>
      </form>
      <Table rowKey="_id" size="small" bordered columns={columns} dataSource={directions} pagination={false} scroll={{ x: 'max-content' }} />
    </Card>
  );
}
