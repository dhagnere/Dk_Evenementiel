import { useEffect, useState } from 'react';
import { Alert, Button, Card, Checkbox, Input, InputNumber, Popconfirm, Select, Space, Table, Tabs, Typography } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { codeEcheance, jalonDe, oublierReferentiels, useReferentiels } from '../../lib/projets';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

interface LigneModele {
  o: number;
  l: string;
  t: string;
  b?: string;
}

interface Modeles {
  branches: string[];
  taches: LigneModele[];
  reglementaire: LigneModele[];
  budgetPostes: string[];
}

const TYPES = [
  { lettre: 'f', libelle: 'Festif' },
  { lettre: 'p', libelle: 'Protocole' },
  { lettre: 'q', libelle: 'Quartier' },
];

/** Modèles de rétroplanning : ils s'appliquent aux projets créés ensuite. */
export default function Modeles() {
  const ref = useReferentiels();
  const [m, setM] = useState<Modeles | null>(null);
  const [modifie, setModifie] = useState(false);

  useEffect(() => {
    api.get<{ modeles: Modeles }>('/projets/modeles').then((d) => setM(d.modeles));
  }, []);

  if (!m || !ref) return null;

  const changer = (suivant: Modeles) => {
    setM(suivant);
    setModifie(true);
  };
  const majLigne = (liste: 'taches' | 'reglementaire', i: number, champs: Partial<LigneModele>) =>
    changer({ ...m, [liste]: m[liste].map((l, j) => (j === i ? { ...l, ...champs } : l)) });

  const tableau = (liste: 'taches' | 'reglementaire') => {
    const lignes = m[liste].map((l, i) => ({ ...l, i })).sort((a, b) => a.o - b.o);
    return (
      <>
        <Table
          rowKey="i"
          size="small"
          pagination={false}
          dataSource={lignes}
          scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Jalon', key: 'j', width: 70, render: (_, l) => <Text code>{jalonDe(ref.jalons, l.o).c}</Text> },
            {
              title: 'J ±',
              key: 'o',
              width: 100,
              render: (_, l) => <InputNumber size="small" value={l.o} onChange={(v) => majLigne(liste, l.i, { o: Number(v ?? 0) })} aria-label={`Décalage (${codeEcheance(l.o)})`} />,
            },
            { title: 'Libellé', key: 'l', render: (_, l) => <Input size="small" value={l.l} onChange={(e) => majLigne(liste, l.i, { l: e.target.value })} aria-label="Libellé" /> },
            ...(liste === 'taches'
              ? [
                  {
                    title: 'Responsable',
                    key: 'b',
                    width: 180,
                    render: (_: unknown, l: (typeof lignes)[number]) => (
                      <Select size="small" value={l.b} onChange={(b) => majLigne(liste, l.i, { b })} options={m.branches.map((b) => ({ value: b, label: b }))} style={{ width: 170 }} />
                    ),
                  },
                ]
              : []),
            {
              title: "S'applique à",
              key: 't',
              width: 260,
              render: (_, l) => (
                <Checkbox.Group
                  value={l.t.split('')}
                  onChange={(v) => majLigne(liste, l.i, { t: TYPES.map((x) => x.lettre).filter((x) => (v as string[]).includes(x)).join('') })}
                  options={TYPES.map((x) => ({ value: x.lettre, label: x.libelle }))}
                />
              ),
            },
            {
              title: '',
              key: 'x',
              width: 50,
              render: (_, l) => <Button size="small" type="text" icon={<DeleteOutlined />} aria-label="Supprimer la ligne" onClick={() => changer({ ...m, [liste]: m[liste].filter((_, j) => j !== l.i) })} />,
            },
          ]}
        />
        <Button
          style={{ marginTop: 12 }}
          onClick={() =>
            changer({
              ...m,
              [liste]: [...m[liste], liste === 'taches' ? { o: -30, b: m.branches[0], l: 'Nouvelle tâche', t: 'fpq' } : { o: -30, l: 'Nouvelle démarche', t: 'fpq' }],
            })
          }
        >
          Ajouter une ligne
        </Button>
      </>
    );
  };

  const enregistrer = async () => {
    if (await lancer(api.put('/projets/modeles', m))) {
      setModifie(false);
      oublierReferentiels();
    }
  };

  return (
    <Card
      title="Modèles de rétroplanning"
      extra={
        <Space>
          {modifie && <Text type="warning">Modifications non enregistrées</Text>}
          <Popconfirm title="Enregistrer les modèles ?" description="Ils s'appliqueront aux nouveaux projets uniquement." okText="Enregistrer" cancelText="Annuler" onConfirm={enregistrer}>
            <Button type="primary" disabled={!modifie}>
              Enregistrer
            </Button>
          </Popconfirm>
        </Space>
      }
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message="Les modèles s'appliquent aux nouveaux projets. Le décalage est exprimé en jours par rapport au jour J (−180 = six mois avant). Un projet déjà créé conserve son propre rétroplanning."
      />
      <Tabs
        items={[
          { key: 'taches', label: 'Tâches', children: tableau('taches') },
          { key: 'reglementaire', label: 'Démarches réglementaires', children: tableau('reglementaire') },
          {
            key: 'listes',
            label: 'Branches et postes budgétaires',
            children: (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <label>
                  <Text strong>Branches et responsables (une par ligne)</Text>
                  <Input.TextArea
                    rows={9}
                    value={m.branches.join('\n')}
                    onChange={(e) => changer({ ...m, branches: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                  />
                </label>
                <label>
                  <Text strong>Postes budgétaires (un par ligne)</Text>
                  <Input.TextArea
                    rows={9}
                    value={m.budgetPostes.join('\n')}
                    onChange={(e) => changer({ ...m, budgetPostes: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
                  />
                </label>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
}
