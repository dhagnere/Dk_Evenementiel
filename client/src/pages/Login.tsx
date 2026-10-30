import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Button, Card, Image, Input, Typography } from 'antd';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LOGO_DUNKERQUE_CUD } from '../logos';

const { Title, Text, Link } = Typography;

export default function Login() {
  const { session, connexion } = useAuth();
  const [adminExiste, setAdminExiste] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [vue, setVue] = useState<'connexion' | 'demande'>('connexion');

  // Formulaire connexion
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');

  // Formulaire création admin initial
  const [nom, setNom] = useState('');
  const [emailAdmin, setEmailAdmin] = useState('');
  const [motDePasseAdmin, setMotDePasseAdmin] = useState('');

  // Formulaire de demande d'accès (utilisateur sans compte)
  const [nomDemande, setNomDemande] = useState('');
  const [emailDemande, setEmailDemande] = useState('');
  const [organisationDemande, setOrganisationDemande] = useState('');
  const [motifDemande, setMotifDemande] = useState('');

  useEffect(() => {
    api
      .get<{ existe: boolean; nombreComptes: number }>('/auth/existe-administrateur')
      .then((r) => setAdminExiste(r.existe))
      .catch(() => setMessage('Impossible de contacter le serveur. Réessayez dans un instant.'));
  }, []);

  if (session) return <Navigate to="/" replace />;

  const soumettreConnexion = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    try {
      const res = await connexion(email, motDePasse);
      if (!res.ok) setMessage(res.message);
    } finally {
      setEnvoi(false);
    }
  };

  const soumettreDemandeAcces = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/demandes-acces', {
        nom: nomDemande,
        email: emailDemande,
        organisation: organisationDemande || undefined,
        motif: motifDemande || undefined,
      });
      setMessage(res.message);
      if (res.ok) {
        setNomDemande('');
        setEmailDemande('');
        setOrganisationDemande('');
        setMotifDemande('');
        setVue('connexion');
      }
    } finally {
      setEnvoi(false);
    }
  };

  const soumettreCreationAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setEnvoi(true);
    setMessage(null);
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/auth/initialiser-administrateur', {
        nom,
        email: emailAdmin,
        motDePasse: motDePasseAdmin,
      });
      if (res.ok) {
        setAdminExiste(true);
        setMessage('Compte créé, vous pouvez vous connecter.');
      } else {
        setMessage(res.message);
      }
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', padding: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Image src={LOGO_DUNKERQUE_CUD} alt="Dunkerque / Communauté urbaine" height={48} preview={false} />
        </div>
        <Card>
          <Title level={4} style={{ marginTop: 0 }}>
            {adminExiste === false
              ? 'Créer le compte administrateur'
              : vue === 'demande'
                ? 'Demander un accès'
                : 'Connexion — Calendrier Dunkerque'}
          </Title>

          {message && (
            <Text
              style={{ display: 'block', marginBottom: 12, fontSize: 13, background: '#fffbe6', color: '#874d00', padding: '6px 12px', borderRadius: 6 }}
            >
              {message}
            </Text>
          )}

          {adminExiste === null && <Text type="secondary">Chargement…</Text>}

          {adminExiste === false && (
            <form onSubmit={soumettreCreationAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Input placeholder="Nom complet" value={nom} onChange={(e) => setNom(e.target.value)} required />
              <Input
                type="email"
                placeholder="Email"
                value={emailAdmin}
                onChange={(e) => setEmailAdmin(e.target.value)}
                required
              />
              <Input.Password
                placeholder="Mot de passe (10 caractères min.)"
                value={motDePasseAdmin}
                onChange={(e) => setMotDePasseAdmin(e.target.value)}
                minLength={10}
                required
              />
              <Button type="primary" htmlType="submit" block loading={envoi}>
                Créer le compte administrateur
              </Button>
            </form>
          )}

          {adminExiste === true && vue === 'connexion' && (
            <>
              <form onSubmit={soumettreConnexion} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input.Password
                  placeholder="Mot de passe"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  required
                />
                <Button type="primary" htmlType="submit" block loading={envoi}>
                  Se connecter
                </Button>
              </form>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <Link
                  onClick={() => {
                    setMessage(null);
                    setVue('demande');
                  }}
                >
                  Pas encore de compte ? Demander un accès
                </Link>
              </div>
            </>
          )}

          {adminExiste === true && vue === 'demande' && (
            <>
              <form onSubmit={soumettreDemandeAcces} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <Input
                  placeholder="Nom complet"
                  value={nomDemande}
                  onChange={(e) => setNomDemande(e.target.value)}
                  required
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={emailDemande}
                  onChange={(e) => setEmailDemande(e.target.value)}
                  required
                />
                <Input
                  placeholder="Organisation (optionnel)"
                  value={organisationDemande}
                  onChange={(e) => setOrganisationDemande(e.target.value)}
                />
                <Input
                  placeholder="Motif de la demande (optionnel)"
                  value={motifDemande}
                  onChange={(e) => setMotifDemande(e.target.value)}
                />
                <Button type="primary" htmlType="submit" block loading={envoi}>
                  Envoyer la demande
                </Button>
              </form>
              <div style={{ marginTop: 12, textAlign: 'center' }}>
                <Typography.Text
                  type="secondary"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setMessage(null);
                    setVue('connexion');
                  }}
                >
                  ← Retour à la connexion
                </Typography.Text>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
