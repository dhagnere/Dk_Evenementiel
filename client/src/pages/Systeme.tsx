import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Tag } from 'antd';
import { api } from '../api';

interface Etat {
  environnement: string;
  stockage: { actif: boolean; bucket: string | null; endpoint: string | null; prefixe: string };
  email: { actif: boolean; expediteur: string };
  synchronisationGithub: { active: boolean; depot: string };
}

const statut = (actif: boolean, oui = 'Configuré', non = 'Non configuré') => <Tag color={actif ? 'green' : 'default'}>{actif ? oui : non}</Tag>;

/** État des services externes du déploiement (stockage, courriel, synchronisation GitHub). */
export default function Systeme() {
  const [etat, setEtat] = useState<Etat | null>(null);
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    api.get<Etat>('/systeme/etat').then(setEtat);
  }, []);

  const testerStockage = async () => {
    setEnCours(true);
    try {
      setTest(await api.post<{ ok: boolean; message: string }>('/systeme/test-stockage'));
    } finally {
      setEnCours(false);
    }
  };

  if (!etat) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <Card title="Environnement">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Mode">{etat.environnement}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="Stockage des fichiers (S3)"
        extra={
          <Button onClick={testerStockage} loading={enCours} disabled={!etat.stockage.actif}>
            Tester
          </Button>
        }
      >
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="État">{statut(etat.stockage.actif)}</Descriptions.Item>
          <Descriptions.Item label="Bucket">{etat.stockage.bucket ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Point d’accès">{etat.stockage.endpoint ?? '—'}</Descriptions.Item>
          <Descriptions.Item label="Préfixe">{etat.stockage.prefixe || '—'}</Descriptions.Item>
        </Descriptions>
        {!etat.stockage.actif && (
          <Alert
            type="info"
            showIcon
            style={{ marginTop: 12 }}
            message="Renseignez S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (et S3_ENDPOINT, S3_REGION) dans les variables d’environnement de l’application."
          />
        )}
        {test && <Alert type={test.ok ? 'success' : 'error'} showIcon style={{ marginTop: 12 }} message={test.message} />}
      </Card>

      <Card title="Courriel">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="Envoi">{statut(etat.email.actif, 'Actif', 'Inactif : courriels affichés dans les journaux')}</Descriptions.Item>
          <Descriptions.Item label="Expéditeur">{etat.email.expediteur}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Synchronisation GitHub du calendrier">
        <Descriptions size="small" column={1}>
          <Descriptions.Item label="État">{statut(etat.synchronisationGithub.active, 'Active', 'Inactive')}</Descriptions.Item>
          <Descriptions.Item label="Dépôt">{etat.synchronisationGithub.depot}</Descriptions.Item>
        </Descriptions>
      </Card>
    </div>
  );
}
