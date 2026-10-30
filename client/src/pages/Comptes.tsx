import { useEffect, useState } from 'react';
import { Button, Card, Grid, Input, Popconfirm, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Compte } from '../types';
import { genererMotDePasse } from '../lib/generatePassword';
import { formatDate } from '../lib/formatDate';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export default function Comptes() {
  const { session } = useAuth();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'Administrateur' | 'Consultant'>('Consultant');
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    const data = await api.get<{ comptes: Compte[] }>('/comptes');
    setComptes(data.comptes);
  };

  useEffect(() => {
    charger();
  }, []);

  const creerCompte = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    try {
      const motDePasseTemporaire = genererMotDePasse();
      const res = await api.post<{ ok: boolean; message: string }>('/comptes', {
        nom,
        email,
        role,
        motDePasseTemporaire,
      });
      if (res.ok) {
        setMessage(`Compte créé pour ${email}. Mot de passe temporaire : ${motDePasseTemporaire}`);
        setNom('');
        setEmail('');
        setRole('Consultant');
        charger();
      } else {
        setMessage(res.message);
      }
    } finally {
      setEnvoi(false);
    }
  };

  const toggleStatut = async (compte: Compte) => {
    const nouveauStatut = compte.statut === 'Suspendu' ? 'Actif' : 'Suspendu';
    await api.post(`/comptes/${compte._id}/statut`, { statut: nouveauStatut });
    charger();
  };

  const reinitialiser = async (compte: Compte) => {
    const motDePasseTemporaire = genererMotDePasse();
    await api.post(`/comptes/${compte._id}/reinitialiser-mot-de-passe`, {
      nouveauMotDePasseTemporaire: motDePasseTemporaire,
    });
    setMessage(`Mot de passe réinitialisé pour ${compte.email} : ${motDePasseTemporaire}`);
    charger();
  };

  const supprimer = async (compte: Compte) => {
    await api.delete(`/comptes/${compte._id}`);
    setMessage(`Compte supprimé : ${compte.email}`);
    charger();
  };

  const badgeColor = (statut: string) => (statut === 'Suspendu' ? 'red' : statut === 'Actif' ? 'green' : 'orange');

  const columns: TableColumnsType<Compte> = [
    { title: 'Nom', dataIndex: 'nom', key: 'nom', width: 160, render: (v: string) => <Text strong>{v}</Text> },
    { title: 'Email', dataIndex: 'email', key: 'email', width: 200, ellipsis: true },
    { title: 'Rôle', dataIndex: 'role', key: 'role', width: 130 },
    { title: 'Statut', key: 'statut', width: 100, render: (_, c) => <Tag color={badgeColor(c.statut)}>{c.statut}</Tag> },
    { title: 'Dernière connexion', key: 'derniereConnexion', width: 140, render: (_, c) => formatDate(c.derniereConnexion) },
    {
      title: 'Actions',
      key: 'actions',
      width: 300,
      render: (_, c) => (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => toggleStatut(c)}>
            {c.statut === 'Suspendu' ? 'Activer' : 'Suspendre'}
          </Button>
          <Button size="small" onClick={() => reinitialiser(c)}>
            Réinitialiser mot de passe
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
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <Card title="Créer un compte">
        {message && (
          <Text
            style={{ display: 'block', marginBottom: 12, fontSize: 13, background: '#e6f4ff', color: '#0958d9', padding: '6px 12px', borderRadius: 6 }}
          >
            {message}
          </Text>
        )}
        <form
          onSubmit={creerCompte}
          style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}
        >
          <div style={{ minWidth: mobile ? '100%' : 180, flex: 1 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Nom</div>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>
          <div style={{ minWidth: mobile ? '100%' : 220, flex: 1 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Email</div>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div style={{ minWidth: mobile ? '100%' : 180 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Rôle</div>
            <Select
              value={role}
              onChange={(v) => setRole(v as 'Administrateur' | 'Consultant')}
              style={{ width: '100%' }}
              options={[
                { value: 'Consultant', label: 'Consultant' },
                { value: 'Administrateur', label: 'Administrateur' },
              ]}
            />
          </div>
          <Button type="primary" htmlType="submit" loading={envoi} block={mobile}>
            Créer
          </Button>
        </form>
      </Card>

      <Table
        rowKey="_id"
        size="small"
        bordered
        columns={columns}
        dataSource={comptes}
        pagination={false}
        scroll={{ x: mobile ? 'max-content' : undefined }}
      />
    </div>
  );
}
