import { useEffect, useState } from 'react';
import { Alert, Button, Card, Empty, Input, Segmented, Typography } from 'antd';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../../api';
import type { DepotStock, LigneDepot } from '../../types';
import { formatEuro, formatJour } from '../../lib/formatStock';
import { lancer } from '../../lib/actionStock';

const { Text, Title } = Typography;

/**
 * Écran du référent d'un stock déporté, pensé pour le téléphone : déclarer ce qui a été distribué
 * lors d'un événement (sortie) ou rapporté non distribué (retour).
 */
export default function MonDepot() {
  const [depot, setDepot] = useState<DepotStock | null | undefined>(undefined);
  const [lignes, setLignes] = useState<LigneDepot[]>([]);
  const [type, setType] = useState<'sortie' | 'retour'>('sortie');
  const [evenement, setEvenement] = useState('');
  const [quantites, setQuantites] = useState<Record<string, number>>({});
  const [envoi, setEnvoi] = useState(false);

  const charger = () =>
    api.get<{ depot: DepotStock | null; lignes: LigneDepot[] }>('/stock/depots/mien').then((d) => {
      setDepot(d.depot);
      setLignes(d.lignes);
    });

  useEffect(() => {
    charger();
  }, []);

  if (depot === undefined) return null;
  if (depot === null) {
    return (
      <Card>
        <Empty description="Vous n'êtes référent d'aucun stock déporté. Le service Événementiel désigne les référents." />
      </Card>
    );
  }

  // Une sortie ne peut porter que sur ce que détient le stock déporté ; un retour, sur les articles qui y sont passés.
  const changer = (l: LigneDepot, delta: number) => {
    const actuelle = quantites[l.articleId] ?? 0;
    const max = type === 'sortie' ? l.quantite : 99999;
    const pas = l.quantite >= 100 ? 10 : 1;
    setQuantites({ ...quantites, [l.articleId]: Math.max(0, Math.min(max, actuelle + delta * pas)) });
  };

  const total = Object.values(quantites).reduce((t, q) => t + q, 0);
  const declarer = async () => {
    setEnvoi(true);
    const ok = await lancer(
      api.post(`/stock/depots/${depot._id}/declaration`, {
        type,
        evenement,
        lignes: Object.entries(quantites)
          .filter(([, q]) => q > 0)
          .map(([articleId, quantite]) => ({ articleId, quantite })),
      })
    );
    setEnvoi(false);
    if (ok) {
      setQuantites({});
      setEvenement('');
      charger();
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <Title level={4} style={{ margin: 0 }}>
          Stock déporté
        </Title>
        <Text type="secondary">
          {depot.direction} · {formatEuro(depot.valeur)} · dernière déclaration : {depot.derniereDeclaration ? formatJour(depot.derniereDeclaration) : 'aucune'}
        </Text>
      </div>
      <Segmented
        block
        size="large"
        value={type}
        onChange={(v) => {
          setType(v as 'sortie' | 'retour');
          setQuantites({});
        }}
        options={[
          { value: 'sortie', label: 'Sortie' },
          { value: 'retour', label: 'Retour' },
        ]}
      />
      <Input size="large" placeholder="Événement" value={evenement} onChange={(e) => setEvenement(e.target.value)} aria-label="Événement" />
      <Text strong>{type === 'sortie' ? "Quantités distribuées lors de l'événement" : 'Quantités non distribuées, rapportées au stock déporté'}</Text>
      {lignes.length === 0 && <Alert type="info" showIcon message="Votre stock déporté est vide pour l'instant." />}
      {lignes.map((l) => (
        <Card key={l.articleId} size="small" styles={{ body: { display: 'flex', alignItems: 'center', gap: 12 } }}>
          <div style={{ flex: 1 }}>
            <Text strong>{l.libelle}</Text>
            <div style={{ fontSize: 12, color: '#595959' }}>
              {l.reference} · en stock : {l.quantite}
            </div>
          </div>
          <Button shape="circle" size="large" icon={<MinusOutlined />} aria-label={`Diminuer ${l.libelle}`} onClick={() => changer(l, -1)} />
          <Text strong style={{ minWidth: 32, textAlign: 'center', fontSize: 17 }}>
            {quantites[l.articleId] ?? 0}
          </Text>
          <Button shape="circle" size="large" type="primary" icon={<PlusOutlined />} aria-label={`Augmenter ${l.libelle}`} onClick={() => changer(l, 1)} />
        </Card>
      ))}
      <Text type="secondary">{total} article(s) sélectionné(s)</Text>
      <Button type="primary" size="large" block disabled={total === 0 || !evenement.trim()} loading={envoi} onClick={declarer}>
        {type === 'sortie' ? 'Déclarer la sortie' : 'Déclarer le retour'}
      </Button>
    </div>
  );
}
