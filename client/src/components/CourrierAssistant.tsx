import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Empty, Table, Tag, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { api } from '../api';

const { Text } = Typography;

/**
 * Le courrier du service (onglet Assistant, super-administrateur) relié au reste de l'application :
 * encart de l'accueil et onglet « Courrier » de la fiche projet. Un clic ouvre la fiche du dossier.
 */

interface MailCourt {
  date: string;
  sens: string;
  expediteur: string;
  objet: string;
  dossierCode: string;
}
interface Accueil {
  configure: boolean;
  derniereMaj: string | null;
  erreur: string;
  nouveauxMails: number;
  ouverts: number;
  aTraiter: number;
  haute: number;
  echeances: { date: string; libelle: string; code: string; titre: string }[];
  nombreEcheances: number;
  recents: MailCourt[];
}

const fdate = (s: string) => dayjs(s.slice(0, 10)).format('DD/MM');
const versDossier = (code: string) => `/admin/assistant?dossier=${encodeURIComponent(code)}`;

function Chiffre({ valeur, libelle, alerte, onClick }: { valeur: number; libelle: string; alerte?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        border: '1px solid #f0f0f0',
        borderLeft: `4px solid ${alerte && valeur > 0 ? '#be3327' : valeur > 0 ? '#1d4ed8' : '#d9d9d9'}`,
        borderRadius: 8,
        background: '#fff',
        padding: '8px 12px',
        cursor: 'pointer',
        minWidth: 130,
      }}
    >
      <div style={{ fontSize: 24, fontWeight: 700, color: valeur > 0 ? '#14263d' : '#bfbfbf' }}>{valeur}</div>
      <div style={{ fontSize: 13 }}>{libelle}</div>
    </button>
  );
}

export function EncartCourrierAccueil() {
  const navigate = useNavigate();
  const [a, setA] = useState<Accueil | null>(null);
  useEffect(() => {
    api.get<Accueil>('/assistant/accueil').then(setA).catch(() => setA(null));
  }, []);
  if (!a) return null;
  const ouvrir = () => navigate('/admin/assistant');
  return (
    <Card
      title={
        <span>
          <MailOutlined /> Courrier du service
        </span>
      }
      extra={
        <span>
          {a.derniereMaj && <Text type="secondary" style={{ marginRight: 12, fontSize: 12 }}>mis à jour le {dayjs(a.derniereMaj).format('DD/MM à HH:mm')}</Text>}
          <Button onClick={ouvrir}>Ouvrir les dossiers</Button>
        </span>
      }
    >
      {a.erreur && <Alert type="error" showIcon style={{ marginBottom: 12 }} message={`Dernière mise à jour : ${a.erreur}`} />}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <Chiffre valeur={a.nouveauxMails} libelle="mails reçus en 24 h" onClick={ouvrir} />
        <Chiffre valeur={a.aTraiter} libelle="dossiers à traiter" alerte onClick={ouvrir} />
        <Chiffre valeur={a.haute} libelle="en priorité haute" alerte onClick={ouvrir} />
        <Chiffre valeur={a.nombreEcheances} libelle="échéances à 7 jours" onClick={ouvrir} />
        <Chiffre valeur={a.ouverts} libelle="dossiers ouverts" onClick={ouvrir} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16 }}>
        <div>
          <Text strong>Échéances de la semaine</Text>
          {a.echeances.length === 0 ? (
            <div><Text type="secondary">Aucune</Text></div>
          ) : (
            a.echeances.map((e, i) => (
              <div key={i} className="ligne-courrier" onClick={() => navigate(versDossier(e.code))} style={{ cursor: 'pointer', padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
                <Text strong>{fdate(e.date)}</Text> – {e.libelle} <Text type="secondary">({e.titre})</Text>
              </div>
            ))
          )}
        </div>
        <div>
          <Text strong>Derniers mails</Text>
          {a.recents.length === 0 ? (
            <div><Text type="secondary">Aucun</Text></div>
          ) : (
            a.recents.map((m, i) => (
              <div key={i} onClick={() => navigate(versDossier(m.dossierCode))} style={{ cursor: 'pointer', padding: '4px 0', borderBottom: '1px dashed #f0f0f0' }}>
                <Text type="secondary">{fdate(m.date)} {m.date.slice(11, 16)}</Text> {m.sens === 'envoyé' ? '↗' : '↘'} <Text strong>{m.expediteur}</Text> : {m.objet}
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

interface CourrierDuProjet {
  dossiers: {
    code: string;
    titre: string;
    statut: string;
    priorite: string;
    branche: string;
    nombreMails: number;
    prochaine: { date?: string; libelle?: string } | null;
    vigilance: string | null;
  }[];
  mails: MailCourt[];
}

export function CourrierProjet({ projetId }: { projetId: string }) {
  const navigate = useNavigate();
  const [c, setC] = useState<CourrierDuProjet | null>(null);
  useEffect(() => {
    api.get<CourrierDuProjet>(`/assistant/projet/${projetId}`).then(setC).catch(() => setC({ dossiers: [], mails: [] }));
  }, [projetId]);
  if (!c) return null;
  if (!c.dossiers.length) {
    return (
      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="Aucun dossier de courrier rattaché : reliez l'événement à ce projet dans Administration → Assistant → Rattachement aux projets."
        />
      </Card>
    );
  }
  return (
    <>
      <Card title={`Dossiers (${c.dossiers.length})`} style={{ marginBottom: 16 }}>
        <Table
          rowKey="code"
          size="small"
          pagination={false}
          dataSource={c.dossiers}
          onRow={(d) => ({ onClick: () => navigate(versDossier(d.code)), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Dossier', key: 't', render: (_, d) => (<><Text strong>{d.titre}</Text>{d.vigilance && <div style={{ color: '#b7791f', fontSize: 12 }}>⚠ {d.vigilance}</div>}</>) },
            { title: 'Branche', dataIndex: 'branche', width: 140, render: (v: string) => v || '—' },
            { title: 'Statut', key: 's', width: 170, render: (_, d) => <Tag color={/traiter/i.test(d.statut) ? 'red' : /clos/i.test(d.statut) ? 'default' : 'blue'}>{d.statut}</Tag> },
            { title: 'Prochaine échéance', key: 'e', width: 260, render: (_, d) => (d.prochaine?.date ? `${fdate(d.prochaine.date)} – ${d.prochaine.libelle ?? ''}` : '—') },
            { title: 'Mails', dataIndex: 'nombreMails', width: 70, align: 'right' },
          ]}
        />
      </Card>
      <Card title="Derniers mails">
        <Table
          rowKey={(m) => `${m.date}-${m.objet}`}
          size="small"
          pagination={false}
          dataSource={c.mails}
          onRow={(m) => ({ onClick: () => navigate(versDossier(m.dossierCode)), style: { cursor: 'pointer' } })}
          columns={[
            { title: 'Date', key: 'd', width: 130, render: (_, m) => `${dayjs(m.date.slice(0, 10)).format('DD/MM/YYYY')} ${m.date.slice(11, 16)}` },
            { title: '', key: 's', width: 30, render: (_, m) => (m.sens === 'envoyé' ? '↗' : '↘') },
            { title: 'Expéditeur', dataIndex: 'expediteur', width: 220 },
            { title: 'Objet', dataIndex: 'objet', ellipsis: true },
          ]}
        />
      </Card>
    </>
  );
}
