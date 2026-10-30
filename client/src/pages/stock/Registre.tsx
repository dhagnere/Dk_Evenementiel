import { useEffect, useState } from 'react';
import { Button, Card, Input, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { api } from '../../api';
import { formatEuro, formatJour } from '../../lib/formatStock';

const { Text } = Typography;

interface LigneRegistre {
  _id: string;
  dateRemise: string;
  beneficiaire: string;
  organisme: string;
  occasion: string;
  elu: string;
  reference: string;
  libelle: string;
  quantite: number;
  valeur: number;
  anonymise: boolean;
}

/** Registre des cadeaux protocolaires remis. Chaque consultation est tracée au journal. */
export default function Registre() {
  const [registre, setRegistre] = useState<LigneRegistre[]>([]);
  const [recherche, setRecherche] = useState('');

  const charger = (texte: string) =>
    api.get<{ registre: LigneRegistre[] }>(`/stock/registre${texte ? `?recherche=${encodeURIComponent(texte)}` : ''}`).then((d) => setRegistre(d.registre));

  useEffect(() => {
    charger('');
  }, []);

  const colonnes: TableColumnsType<LigneRegistre> = [
    { title: 'Date', key: 'date', width: 110, render: (_, r) => formatJour(r.dateRemise) },
    {
      title: 'Bénéficiaire',
      key: 'beneficiaire',
      render: (_, r) => (r.anonymise ? <Tag>Anonymisé</Tag> : <Text strong>{r.beneficiaire}</Text>),
    },
    { title: 'Organisme', dataIndex: 'organisme' },
    { title: 'Occasion', dataIndex: 'occasion' },
    { title: 'Cadeau', key: 'cadeau', render: (_, r) => `${r.reference} · ${r.libelle}` },
    { title: 'Qté', dataIndex: 'quantite', width: 60, align: 'right' },
    { title: 'Valeur', key: 'valeur', width: 100, align: 'right', render: (_, r) => formatEuro(r.valeur) },
    { title: 'Élu remettant', dataIndex: 'elu' },
  ];

  const total = registre.reduce((t, r) => t + r.valeur, 0);

  return (
    <Card
      title="Registre des cadeaux protocolaires"
      extra={
        <Button icon={<DownloadOutlined />} href="/api/stock/registre/export">
          Exporter (CSV)
        </Button>
      }
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
        Alimenté à chaque validation du Cabinet. Les noms des bénéficiaires sont anonymisés après la durée de conservation fixée
        dans Administration → RGPD. Consultations et exports sont inscrits au journal.
      </Text>
      <Input.Search
        placeholder="Bénéficiaire ou organisme"
        allowClear
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        onSearch={(v) => charger(v.trim())}
        style={{ maxWidth: 320, marginBottom: 12 }}
      />
      <Table rowKey="_id" size="small" columns={colonnes} dataSource={registre} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 'max-content' }} />
      <Text strong style={{ display: 'block', marginTop: 12 }}>
        Valeur totale affichée : {formatEuro(total)}
      </Text>
    </Card>
  );
}
