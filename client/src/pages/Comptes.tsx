import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Grid, Input, Popconfirm, Space, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Compte, ProfilAcces } from '../types';
import { genererMotDePasse } from '../lib/generatePassword';
import { formatDate } from '../lib/formatDate';
import { EditeurDroits, PROFIL_PAR_DEFAUT, ResumeDroits, useDirections } from '../components/EditeurDroits';

const { Text } = Typography;
const { useBreakpoint } = Grid;

type Edition = { mode: 'creation' } | { mode: 'droits'; compte: Compte };

export default function Comptes() {
  const { session, refresh } = useAuth();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const directions = useDirections();
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [message, setMessage] = useState<{ type: 'info' | 'erreur'; texte: string } | null>(null);
  const [recherche, setRecherche] = useState('');

  const [edition, setEdition] = useState<Edition | null>(null);
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [profil, setProfil] = useState<ProfilAcces>(PROFIL_PAR_DEFAUT);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    const data = await api.get<{ comptes: Compte[] }>('/comptes');
    setComptes(data.comptes);
  };

  useEffect(() => {
    charger();
  }, []);

  const ouvrirCreation = () => {
    setNom('');
    setEmail('');
    setProfil(PROFIL_PAR_DEFAUT);
    setEdition({ mode: 'creation' });
  };

  const ouvrirDroits = (compte: Compte) => {
    setProfil({ superAdmin: compte.superAdmin, directionId: compte.directionId, droits: compte.droits });
    setEdition({ mode: 'droits', compte });
  };

  const informer = (res: { ok: boolean; message: string }, texteSucces?: string) =>
    setMessage(res.ok ? { type: 'info', texte: texteSucces ?? res.message } : { type: 'erreur', texte: res.message });

  const enregistrer = async () => {
    if (!edition) return;
    setEnvoi(true);
    try {
      if (edition.mode === 'creation') {
        const motDePasseTemporaire = genererMotDePasse();
        const res = await api.post<{ ok: boolean; message: string }>('/comptes', { nom, email, ...profil, motDePasseTemporaire });
        informer(res, `Compte créé pour ${email}. Mot de passe temporaire à transmettre : ${motDePasseTemporaire}`);
        if (res.ok) setEdition(null);
      } else {
        const res = await api.put<{ ok: boolean; message: string }>(`/comptes/${edition.compte._id}/droits`, profil);
        informer(res, `Droits de ${edition.compte.nom} mis à jour.`);
        if (res.ok) setEdition(null);
        // Ses propres droits ont pu changer : la session affichée est rechargée.
        if (res.ok && edition.compte._id === session?.userId) await refresh();
      }
      charger();
    } catch (err) {
      setMessage({ type: 'erreur', texte: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setEnvoi(false);
    }
  };

  const toggleStatut = async (compte: Compte) => {
    const nouveauStatut = compte.statut === 'Suspendu' ? 'Actif' : 'Suspendu';
    informer(await api.post<{ ok: boolean; message: string }>(`/comptes/${compte._id}/statut`, { statut: nouveauStatut }));
    charger();
  };

  const reinitialiser = async (compte: Compte) => {
    const motDePasseTemporaire = genererMotDePasse();
    const res = await api.post<{ ok: boolean; message: string }>(`/comptes/${compte._id}/reinitialiser-mot-de-passe`, {
      nouveauMotDePasseTemporaire: motDePasseTemporaire,
    });
    informer(res, `Mot de passe réinitialisé pour ${compte.email} : ${motDePasseTemporaire}`);
    charger();
  };

  const supprimer = async (compte: Compte) => {
    informer(await api.delete<{ ok: boolean; message: string }>(`/comptes/${compte._id}`), `Compte supprimé : ${compte.email}`);
    charger();
  };

  const badgeColor = (statut: string) => (statut === 'Suspendu' ? 'red' : statut === 'Actif' ? 'green' : 'orange');

  const filtre = recherche.trim().toLowerCase();
  const comptesAffiches = filtre
    ? comptes.filter((c) => [c.nom, c.email, c.direction ?? ''].some((v) => v.toLowerCase().includes(filtre)))
    : comptes;

  const columns: TableColumnsType<Compte> = [
    { title: 'Nom', dataIndex: 'nom', key: 'nom', width: 170, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 210, ellipsis: true },
    { title: 'Droits', key: 'droits', width: 280, render: (_, c) => <ResumeDroits profil={c} /> },
    { title: 'Direction', key: 'direction', width: 170, render: (_, c) => c.direction ?? <Text type="secondary">—</Text> },
    { title: 'Statut', key: 'statut', width: 110, render: (_, c) => <Tag color={badgeColor(c.statut)}>{c.statut}</Tag> },
    { title: 'Dernière connexion', key: 'derniereConnexion', width: 140, render: (_, c) => formatDate(c.derniereConnexion) },
    {
      title: 'Actions',
      key: 'actions',
      width: 340,
      render: (_, c) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" type="primary" ghost onClick={() => ouvrirDroits(c)}>
            Droits
          </Button>
          {c._id !== session?.userId && (
            <Button size="small" onClick={() => toggleStatut(c)}>
              {c.statut === 'Suspendu' ? 'Activer' : 'Suspendre'}
            </Button>
          )}
          <Button size="small" onClick={() => reinitialiser(c)}>
            Réinitialiser le mot de passe
          </Button>
          {c._id !== session?.userId && (
            <Popconfirm
              title="Supprimer ce compte ?"
              description="Cette action est définitive."
              okText="Supprimer"
              okButtonProps={{ danger: true }}
              cancelText="Annuler"
              onConfirm={() => supprimer(c)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} aria-label={`Supprimer le compte de ${c.nom}`} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  const creationValide = nom.trim() !== '' && /\S+@\S+\.\S+/.test(email);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card
        title="Comptes et droits"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={ouvrirCreation}>
            Créer un compte
          </Button>
        }
      >
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          Chaque compte reçoit un niveau par module : lecture, contribution, validation ou administration. Chaque niveau
          inclut les précédents. Un super-administrateur a accès à tout.
        </Text>
        {message && (
          <Text
            style={{
              display: 'block',
              marginBottom: 12,
              fontSize: 13,
              padding: '6px 12px',
              borderRadius: 6,
              background: message.type === 'erreur' ? '#fff1f0' : '#e6f4ff',
              color: message.type === 'erreur' ? '#cf1322' : '#0958d9',
            }}
          >
            {message.texte}
          </Text>
        )}
        <Input.Search
          placeholder="Rechercher par nom, email ou direction"
          allowClear
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 12 }}
        />
        <Table
          rowKey="_id"
          size="small"
          bordered
          columns={columns}
          dataSource={comptesAffiches}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>

      <Drawer
        title={edition?.mode === 'droits' ? `Droits de ${edition.compte.nom}` : 'Créer un compte'}
        open={edition !== null}
        onClose={() => setEdition(null)}
        width={mobile ? '100%' : 520}
        extra={
          <Space>
            <Button onClick={() => setEdition(null)}>Annuler</Button>
            <Button type="primary" loading={envoi} disabled={edition?.mode === 'creation' && !creationValide} onClick={enregistrer}>
              Enregistrer
            </Button>
          </Space>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {edition?.mode === 'creation' && (
            <>
              <label>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Nom</div>
                <Input value={nom} onChange={(e) => setNom(e.target.value)} />
              </label>
              <label>
                <div style={{ fontSize: 12, color: '#595959', marginBottom: 4 }}>Email</div>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </>
          )}
          {edition?.mode === 'droits' && <Text type="secondary">{edition.compte.email}</Text>}
          <EditeurDroits valeur={profil} onChange={setProfil} directions={directions} />
        </div>
      </Drawer>
    </div>
  );
}
