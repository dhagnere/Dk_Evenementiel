import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Button, Card, Image, Input, Typography } from 'antd';
import { api, ApiError } from '../api';
import { useAuth } from '../context/AuthContext';
import { LOGO_DUNKERQUE_CUD } from '../logos';

const { Title, Text } = Typography;

/** Statut d'un compte qui travaille encore avec le mot de passe temporaire remis par un administrateur. */
export const STATUT_MOT_DE_PASSE_A_DEFINIR = 'Mot de passe à définir';

/**
 * Changement du mot de passe. Imposé tant que le compte est « Mot de passe à définir » :
 * le serveur refuse alors toute autre action. Accessible ensuite depuis l'en-tête.
 */
export default function MotDePasse() {
  const { session, loading, refresh, deconnexion } = useAuth();
  const navigate = useNavigate();
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  if (loading) return null;
  if (!session) return <Navigate to="/connexion" replace />;

  const impose = session.statut === STATUT_MOT_DE_PASSE_A_DEFINIR;

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (nouveau.length < 10) {
      setMessage('Le nouveau mot de passe doit compter au moins 10 caractères.');
      return;
    }
    if (nouveau !== confirmation) {
      setMessage('Les deux saisies du nouveau mot de passe ne sont pas identiques.');
      return;
    }
    if (nouveau === ancien) {
      setMessage('Le nouveau mot de passe doit être différent du mot de passe actuel.');
      return;
    }
    setEnvoi(true);
    try {
      const res = await api.post<{ ok: boolean; message: string }>('/auth/changer-mot-de-passe', {
        ancienMotDePasse: ancien,
        nouveauMotDePasse: nouveau,
      });
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setMessage(err instanceof ApiError ? err.message : 'Changement impossible pour le moment, réessayez.');
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
            {impose ? 'Choisissez votre mot de passe' : 'Changer mon mot de passe'}
          </Title>
          {impose && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
              Vous êtes connecté avec un mot de passe temporaire. Remplacez-le pour accéder à l'application.
            </Text>
          )}
          {message && (
            <Text
              style={{ display: 'block', marginBottom: 12, fontSize: 13, background: '#fffbe6', color: '#874d00', padding: '6px 12px', borderRadius: 6 }}
            >
              {message}
            </Text>
          )}
          <form onSubmit={soumettre} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Input.Password
              placeholder={impose ? 'Mot de passe temporaire' : 'Mot de passe actuel'}
              value={ancien}
              onChange={(e) => setAncien(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Input.Password
              placeholder="Nouveau mot de passe (10 caractères min.)"
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
            <Input.Password
              placeholder="Confirmez le nouveau mot de passe"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="new-password"
              required
            />
            <Button type="primary" htmlType="submit" loading={envoi} block>
              Enregistrer
            </Button>
            {impose ? (
              <Button type="link" onClick={() => deconnexion()}>
                Me déconnecter
              </Button>
            ) : (
              <Button type="link" onClick={() => navigate(-1)}>
                Annuler
              </Button>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
