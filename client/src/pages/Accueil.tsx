import { useNavigate } from 'react-router-dom';
import { Alert, Card, Tag, Typography } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { ICONES_MODULES, ICONE_MODULE_PAR_DEFAUT, SECTIONS } from '../lib/navigation';
import { LIBELLES_NIVEAUX } from '../lib/droits';

const { Title, Text, Paragraph } = Typography;

function Tuile({
  icone,
  titre,
  description,
  etiquette,
  onClick,
}: {
  icone: React.ReactNode;
  titre: string;
  description: string;
  etiquette: React.ReactNode;
  onClick?: () => void;
}) {
  const contenu = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 28, color: onClick ? '#1d4ed8' : '#bfbfbf' }} aria-hidden="true">
          {icone}
        </span>
        {etiquette}
      </div>
      <Text strong style={{ fontSize: 17 }}>
        {titre}
      </Text>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {description}
      </Text>
    </div>
  );
  return onClick ? (
    <Card hoverable styles={{ body: { height: '100%' } }} style={{ height: '100%' }}>
      <button
        onClick={onClick}
        style={{ all: 'unset', display: 'block', width: '100%', height: '100%', cursor: 'pointer' }}
        aria-label={`Ouvrir ${titre}`}
      >
        {contenu}
      </button>
    </Card>
  ) : (
    <Card style={{ height: '100%', background: '#fafafa' }} styles={{ body: { height: '100%' } }}>
      {contenu}
    </Card>
  );
}

export default function Accueil() {
  const { session, modules, peut, estSuperAdmin } = useAuth();
  const navigate = useNavigate();
  if (!session) return null;

  const racine = (code: string) => SECTIONS.find((s) => s.code === code)?.racine;
  const aucunAcces = !estSuperAdmin && !modules.some((m) => m.disponible && peut(m.code, 'lecture'));

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <Title level={3} style={{ marginTop: 0, marginBottom: 4 }}>
          Bonjour {session.nom}
        </Title>
        <Text type="secondary">
          {estSuperAdmin
            ? 'Vous avez accès à tous les modules et à l’administration de l’application.'
            : 'Voici les modules auxquels vous avez accès.'}
        </Text>
      </div>

      {aucunAcces && (
        <Alert
          type="info"
          showIcon
          message="Aucun module ne vous est encore ouvert"
          description="Votre compte est actif, mais aucun droit ne lui est attribué. Contactez un super-administrateur."
        />
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
        {modules.map((m) => {
          const accessible = peut(m.code, 'lecture');
          const chemin = racine(m.code);
          const niveau = estSuperAdmin ? null : session.droits[m.code];
          const etiquette = !m.disponible ? (
            <Tag>Bientôt disponible</Tag>
          ) : !accessible ? (
            <Tag>Pas d’accès</Tag>
          ) : estSuperAdmin ? (
            <Tag color="gold">Accès complet</Tag>
          ) : niveau ? (
            <Tag color="blue">{LIBELLES_NIVEAUX[niveau]}</Tag>
          ) : null;
          return (
            <Tuile
              key={m.code}
              icone={ICONES_MODULES[m.code] ?? ICONE_MODULE_PAR_DEFAUT}
              titre={m.libelle}
              description={m.description}
              etiquette={etiquette}
              onClick={m.disponible && accessible && chemin ? () => navigate(chemin) : undefined}
            />
          );
        })}
        {estSuperAdmin && (
          <Tuile
            icone={<SettingOutlined />}
            titre="Administration"
            description="Comptes et droits, demandes d’accès, directions, sauvegardes, journal, RGPD et état du système."
            etiquette={<Tag color="gold">Super-administrateur</Tag>}
            onClick={() => navigate('/admin/comptes')}
          />
        )}
      </div>

      <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 0 }}>
        Les modules « bientôt disponibles » seront ouverts au fil des prochaines versions. Les droits qui y sont
        attribués dès maintenant s’appliqueront à leur ouverture.
      </Paragraph>
    </div>
  );
}
