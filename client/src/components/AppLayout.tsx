import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Divider, Drawer, Grid, Image, Layout, Space, Tag, Typography } from 'antd';
import {
  CalendarOutlined,
  CloudUploadOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  MenuOutlined,
  SolutionOutlined,
  TeamOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { LOGO_DUNKERQUE_CUD } from '../logos';

const { Header, Content } = Layout;
const { Text } = Typography;
const { useBreakpoint } = Grid;

function NavItem({
  actif,
  icone,
  label,
  onClick,
  bloc,
}: {
  actif: boolean;
  icone: ReactNode;
  label: string;
  onClick: () => void;
  bloc?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        border: 'none',
        cursor: 'pointer',
        borderRadius: bloc ? 8 : 999,
        padding: bloc ? '10px 14px' : '8px 16px',
        width: bloc ? '100%' : undefined,
        fontSize: bloc ? 15 : 14,
        fontWeight: 600,
        background: actif ? '#e6f4ff' : 'transparent',
        color: actif ? '#1958d9' : '#4b5563',
      }}
    >
      {icone}
      {label}
    </button>
  );
}

export function AppLayout() {
  const { session, loading, estAdministrateur, deconnexion } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.md;
  const [menuOuvert, setMenuOuvert] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#8c8c8c' }}>
        Chargement…
      </div>
    );
  }
  if (!session) return <Navigate to="/connexion" replace />;

  const items = [
    { key: '/', label: 'Calendrier', icone: <CalendarOutlined /> },
    { key: '/liste', label: 'Liste', icone: <UnorderedListOutlined /> },
    { key: '/carte', label: 'Carte', icone: <EnvironmentOutlined /> },
    { key: '/conflits', label: 'Conflits', icone: <WarningOutlined /> },
    { key: '/fiche-renseignement', label: 'Fiche de renseignement', icone: <SolutionOutlined /> },
    ...(estAdministrateur
      ? [
          { key: '/comptes', label: 'Comptes', icone: <TeamOutlined /> },
          { key: '/demandes', label: "Demandes d'accès", icone: <UserAddOutlined /> },
          { key: '/sauvegardes', label: 'Sauvegardes', icone: <CloudUploadOutlined /> },
          { key: '/doublons', label: 'Doublons', icone: <CopyOutlined /> },
          { key: '/journal', label: 'Journal', icone: <FileTextOutlined /> },
        ]
      : []),
  ];

  const allerA = (chemin: string) => {
    navigate(chemin);
    setMenuOuvert(false);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          rowGap: 8,
          height: 'auto',
          lineHeight: 'normal',
          padding: mobile ? '10px 12px' : '10px 24px',
        }}
      >
        <Space size={mobile ? 'small' : 'large'} align="center" wrap>
          <Image src={LOGO_DUNKERQUE_CUD} alt="Dunkerque / Communauté urbaine" height={mobile ? 28 : 36} preview={false} />
          <Text strong style={{ fontSize: mobile ? 15 : 18, whiteSpace: 'nowrap' }}>
            Calendrier Événements
          </Text>
          {!mobile && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              {items.map((item) => (
                <NavItem
                  key={item.key}
                  actif={location.pathname === item.key}
                  icone={item.icone}
                  label={item.label}
                  onClick={() => allerA(item.key)}
                />
              ))}
            </div>
          )}
        </Space>
        {mobile ? (
          <Button icon={<MenuOutlined />} onClick={() => setMenuOuvert(true)} aria-label="Menu" />
        ) : (
          <Space style={{ flexShrink: 0, whiteSpace: 'nowrap' }} align="center">
            {!estAdministrateur && <Tag color="blue">Consultation seule</Tag>}
            <Text type="secondary">{session.nom}</Text>
            <Button onClick={() => deconnexion()}>Déconnexion</Button>
          </Space>
        )}
      </Header>

      <Drawer
        title="Menu"
        placement="right"
        open={menuOuvert}
        onClose={() => setMenuOuvert(false)}
        width={Math.min(300, typeof window !== 'undefined' ? window.innerWidth - 32 : 300)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((item) => (
            <NavItem
              key={item.key}
              bloc
              actif={location.pathname === item.key}
              icone={item.icone}
              label={item.label}
              onClick={() => allerA(item.key)}
            />
          ))}
        </div>
        <Divider />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!estAdministrateur && (
            <Tag color="blue" style={{ width: 'fit-content' }}>
              Consultation seule
            </Tag>
          )}
          <Text type="secondary">{session.nom}</Text>
          <Button block onClick={() => deconnexion()}>
            Déconnexion
          </Button>
        </div>
      </Drawer>

      <Content style={{ width: '100%', padding: mobile ? '12px' : '24px 32px' }}>
        <Outlet />
      </Content>
    </Layout>
  );
}
