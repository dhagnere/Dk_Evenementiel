import { useState, type ReactNode } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Button, Divider, Drawer, Grid, Image, Layout, Space, Tag, Typography } from 'antd';
import { HomeOutlined, MenuOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { LOGO_DUNKERQUE_CUD } from '../logos';
import { SECTIONS, sectionDuChemin, type SectionNavigation } from '../lib/navigation';

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
      aria-current={actif ? 'page' : undefined}
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
  const { session, loading, estSuperAdmin, peut, deconnexion } = useAuth();
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

  // Sections visibles : modules accessibles au moins en lecture, administration pour les super-administrateurs.
  const pagesVisibles = (section: SectionNavigation) =>
    section.code === 'admin' ? section.pages : section.pages.filter((p) => peut(section.code, p.niveau ?? 'lecture'));
  const sections = SECTIONS.filter((s) => (s.code === 'admin' ? estSuperAdmin : peut(s.code, 'lecture')));
  const sectionCourante = sectionDuChemin(location.pathname);
  const pagesCourantes = sectionCourante ? pagesVisibles(sectionCourante) : [];

  const allerA = (chemin: string) => {
    navigate(chemin);
    setMenuOuvert(false);
  };

  const profil = estSuperAdmin ? (
    <Tag color="gold">Super-administrateur</Tag>
  ) : session.direction ? (
    <Tag>{session.direction}</Tag>
  ) : null;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          height: 'auto',
          lineHeight: 'normal',
          padding: mobile ? '10px 12px' : '10px 24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', rowGap: 8 }}>
          <Space size={mobile ? 'small' : 'large'} align="center" wrap>
            <button
              onClick={() => allerA('/')}
              aria-label="Accueil"
              style={{ display: 'flex', alignItems: 'center', gap: 12, border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}
            >
              <Image src={LOGO_DUNKERQUE_CUD} alt="Dunkerque / Communauté urbaine" height={mobile ? 28 : 36} preview={false} />
              <Text strong style={{ fontSize: mobile ? 15 : 18, whiteSpace: 'nowrap' }}>
                DK Événementiel
              </Text>
            </button>
            {!mobile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                <NavItem actif={location.pathname === '/'} icone={<HomeOutlined />} label="Accueil" onClick={() => allerA('/')} />
                {sections.map((s) => (
                  <NavItem
                    key={s.code}
                    actif={sectionCourante?.code === s.code}
                    icone={s.icone}
                    label={s.libelle}
                    onClick={() => allerA(s.racine)}
                  />
                ))}
              </div>
            )}
          </Space>
          {mobile ? (
            <Button icon={<MenuOutlined />} onClick={() => setMenuOuvert(true)} aria-label="Menu" />
          ) : (
            <Space style={{ flexShrink: 0, whiteSpace: 'nowrap' }} align="center">
              {profil}
              <Text type="secondary">{session.nom}</Text>
              <Button onClick={() => deconnexion()}>Déconnexion</Button>
            </Space>
          )}
        </div>
        {!mobile && pagesCourantes.length > 1 && (
          <nav
            aria-label={`Pages ${sectionCourante?.libelle ?? ''}`}
            style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 10, paddingTop: 8, borderTop: '1px solid #f5f5f5' }}
          >
            {pagesCourantes.map((p) => (
              <NavItem
                key={p.chemin}
                actif={location.pathname === p.chemin}
                icone={p.icone}
                label={p.libelle}
                onClick={() => allerA(p.chemin)}
              />
            ))}
          </nav>
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
          <NavItem bloc actif={location.pathname === '/'} icone={<HomeOutlined />} label="Accueil" onClick={() => allerA('/')} />
          {sections.map((s) => (
            <div key={s.code} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Text type="secondary" style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '12px 0 4px 14px' }}>
                {s.libelle}
              </Text>
              {pagesVisibles(s).map((p) => (
                <NavItem
                  key={p.chemin}
                  bloc
                  actif={location.pathname === p.chemin}
                  icone={p.icone}
                  label={p.libelle}
                  onClick={() => allerA(p.chemin)}
                />
              ))}
            </div>
          ))}
        </div>
        <Divider />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          {profil}
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
