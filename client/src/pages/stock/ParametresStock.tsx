import { useEffect, useState } from 'react';
import { Button, Card, InputNumber, Select, Typography } from 'antd';
import { api } from '../../api';
import type { ParametresStock as Parametres } from '../../types';
import { lancer } from '../../lib/actionStock';

const { Text } = Typography;

const NUMERIQUES: { cle: keyof Parametres; libelle: string; aide: string; unite: string }[] = [
  {
    cle: 'seuilValidationAutomatique',
    libelle: 'Seuil de validation automatique',
    aide: 'Une demande de goodies jusqu’à ce montant est validée sans intervention ; au-delà, par le chef de service.',
    unite: '€',
  },
  {
    cle: 'seuilValidationAjustement',
    libelle: 'Seuil de validation des ajustements',
    aide: 'Un ajustement d’inventaire au-delà de ce montant doit être validé.',
    unite: '€',
  },
  {
    cle: 'delaiDemandeTardiveJours',
    libelle: 'Délai d’une demande tardive',
    aide: 'Une demande à moins de ce délai du besoin doit être motivée.',
    unite: 'jours',
  },
  {
    cle: 'relanceDeportJours',
    libelle: 'Relance des stocks déportés',
    aide: 'Un stock déporté sans déclaration depuis ce délai est signalé à relancer.',
    unite: 'jours',
  },
];

export default function ParametresStock() {
  const [p, setP] = useState<Parametres | null>(null);

  useEffect(() => {
    api.get<{ parametres: Parametres }>('/stock/parametres').then((d) => setP(d.parametres));
  }, []);

  if (!p) return null;

  return (
    <Card title="Paramètres du module" style={{ maxWidth: 820 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {NUMERIQUES.map((n) => (
          <label key={n.cle} style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ flex: '1 1 320px' }}>
              <Text strong>{n.libelle}</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {n.aide}
              </Text>
            </span>
            <InputNumber min={0} value={p[n.cle] as number} onChange={(v) => setP({ ...p, [n.cle]: Number(v ?? 0) })} addonAfter={n.unite} style={{ width: 170 }} />
          </label>
        ))}
        <label>
          <Text strong>Emplacements du local</Text>
          <Select
            mode="tags"
            value={p.emplacements}
            onChange={(emplacements) => setP({ ...p, emplacements })}
            style={{ width: '100%', marginTop: 4 }}
            tokenSeparators={[';']}
          />
        </label>
        <label>
          <Text strong>Emplacement obligatoire des cadeaux protocolaires</Text>
          <Select
            value={p.emplacementProtocole}
            onChange={(emplacementProtocole) => setP({ ...p, emplacementProtocole })}
            options={p.emplacements.map((e) => ({ value: e, label: e }))}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
        <div>
          <Button type="primary" onClick={() => lancer(api.put('/stock/parametres', p))}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Card>
  );
}
