import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Card, Progress, Table, Tag, Typography } from 'antd';
import { api } from '../api';
import type { SyntheseAccueil } from '../types';
import { formatLong } from '../lib/projets';
import { SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { ICONES_MODULES, ICONE_MODULE_PAR_DEFAUT, SECTIONS } from '../lib/navigation';
import { LIBELLES_NIVEAUX } from '../lib/droits';

const { Title, Text } = Typography;

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
  const [synthese, setSynthese] = useState<SyntheseAccueil | null>(null);

  useEffect(() => {
    api.get<SyntheseAccueil>('/liaisons/synthese').then(setSynthese).catch(() => setSynthese(null));
  }, []);

  if (!session) return null;
  const MODULES_LIBELLES: Record<string, string> = { calendrier: 'Calendrier', stock: 'Stock & Protocole', projets: 'Projets' };

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

      {synthese && synthese.aTraiter.length > 0 && (
        <Card title="À traiter">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {synthese.aTraiter.map((x) => (
              <button
                key={x.libelle}
                onClick={() => navigate(x.chemin)}
                style={{
                  textAlign: 'left',
                  border: '1px solid #f0f0f0',
                  borderLeft: `4px solid ${x.alerte ? '#be3327' : x.nombre > 0 ? '#1d4ed8' : '#d9d9d9'}`,
                  borderRadius: 8,
                  background: '#fff',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontSize: 26, fontWeight: 700, color: x.nombre > 0 ? '#14263d' : '#bfbfbf' }}>{x.nombre}</div>
                <div style={{ fontSize: 13 }}>{x.libelle}</div>
                <div style={{ fontSize: 11, color: '#8c8c8c' }}>{MODULES_LIBELLES[x.module]}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {synthese && synthese.prochains.length > 0 && (
        <Card title="Les 30 prochains jours">
          <Table
            rowKey={(e) => e._id ?? e.projet?._id ?? e.nom}
            size="small"
            pagination={{ pageSize: 15, hideOnSinglePage: true }}
            dataSource={synthese.prochains}
            tableLayout="fixed"
            onRow={(e) => ({
              onClick: () => navigate(e._id ? `/evenement/${e._id}` : `/projets/${e.projet?._id}`),
              style: { cursor: 'pointer' },
            })}
            columns={[
              { title: 'Date', key: 'd', width: 120, render: (_, e) => formatLong(e.dateDeDebut) },
              { title: 'Manifestation', key: 'n', ellipsis: true, render: (_, e) => <Text strong>{e.nom}</Text> },
              { title: 'Lieu', dataIndex: 'lieu', width: 240, ellipsis: true, render: (v: string) => v || '—' },
              ...(synthese.prochains.some((e) => e.valide !== undefined)
                ? [{ title: 'Calendrier', key: 'v', width: 110, render: (_: unknown, e: SyntheseAccueil['prochains'][number]) => <Tag color={e.valide ? 'green' : 'orange'}>{e.valide ? 'Validé' : 'À valider'}</Tag> }]
                : []),
              ...(synthese.prochains.some((e) => e.projet !== undefined)
                ? [
                    {
                      title: 'Projet',
                      key: 'p',
                      width: 170,
                      render: (_: unknown, e: SyntheseAccueil['prochains'][number]) =>
                        e.projet ? (
                          <div>
                            <Progress percent={e.projet.totalTaches ? Math.round((e.projet.tachesFaites * 100) / e.projet.totalTaches) : 0} size="small" />
                            {e.projet.tachesEnRetard > 0 && <Text type="danger" style={{ fontSize: 12 }}>{e.projet.tachesEnRetard} en retard</Text>}
                          </div>
                        ) : (
                          <Text type="secondary">—</Text>
                        ),
                    },
                  ]
                : []),
              ...(synthese.prochains.some((e) => e.goodies !== undefined)
                ? [{ title: 'Goodies', key: 'g', width: 90, align: 'right' as const, render: (_: unknown, e: SyntheseAccueil['prochains'][number]) => e.goodies || '—' }]
                : []),
            ]}
          />
        </Card>
      )}

    </div>
  );
}
