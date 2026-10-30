import { useEffect, useState } from 'react';
import { Button, Card, Drawer, Grid, Space, Typography } from 'antd';
import { api } from '../api';
import type { DemandeAcces, ProfilAcces } from '../types';
import { genererMotDePasse } from '../lib/generatePassword';
import { EditeurDroits, PROFIL_PAR_DEFAUT, useDirections } from '../components/EditeurDroits';

const { Text } = Typography;
const { useBreakpoint } = Grid;

export default function Demandes() {
  const [demandes, setDemandes] = useState<DemandeAcces[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const mobile = !useBreakpoint().sm;
  const directions = useDirections();
  // Demande en cours d'approbation et profil d'accès choisi pour le futur compte.
  const [enApprobation, setEnApprobation] = useState<DemandeAcces | null>(null);
  const [profil, setProfil] = useState<ProfilAcces>(PROFIL_PAR_DEFAUT);
  const [envoi, setEnvoi] = useState(false);

  const charger = async () => {
    const data = await api.get<{ demandes: DemandeAcces[] }>('/demandes-acces');
    setDemandes(data.demandes);
  };

  useEffect(() => {
    charger();
  }, []);

  const ouvrirApprobation = (demande: DemandeAcces) => {
    setProfil(PROFIL_PAR_DEFAUT);
    setEnApprobation(demande);
  };

  const approuver = async () => {
    if (!enApprobation) return;
    const demande = enApprobation;
    setEnvoi(true);
    try {
      const motDePasseTemporaire = genererMotDePasse();
      const res = await api.post<{ ok: boolean; message: string }>(`/demandes-acces/${demande._id}/approuver`, {
        ...profil,
        motDePasseTemporaire,
      });
      setMessage(res.ok ? `Compte créé pour ${demande.email}. Mot de passe temporaire à transmettre : ${motDePasseTemporaire}` : res.message);
      setEnApprobation(null);
      charger();
    } finally {
      setEnvoi(false);
    }
  };

  const rejeter = async (demande: DemandeAcces) => {
    await api.post(`/demandes-acces/${demande._id}/rejeter`, {});
    setMessage(`Demande de ${demande.email} rejetée`);
    charger();
  };

  return (
    <div>
      <Card title="Demandes d'accès en attente">
        {message && (
          <Text
            style={{ display: 'block', marginBottom: 12, fontSize: 13, background: '#e6f4ff', color: '#0958d9', padding: '6px 12px', borderRadius: 6 }}
          >
            {message}
          </Text>
        )}

        {demandes.length === 0 && <Text type="secondary">Aucune demande en attente.</Text>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {demandes.map((d) => (
            <div key={d._id} style={{ border: '1px solid #f0f0f0', borderRadius: 6, padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <Text strong>
                    {d.nom} <Text type="secondary">— {d.email}</Text>
                  </Text>
                  {d.organisation && (
                    <div style={{ fontSize: 12, color: '#8c8c8c' }}>Organisation : {d.organisation}</div>
                  )}
                  {d.motif && (
                    <div style={{ marginTop: 4, fontSize: 13, color: '#595959' }}>« {d.motif} »</div>
                  )}
                  <div style={{ marginTop: 4, fontSize: 12, color: '#bfbfbf' }}>
                    Demandé le {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Button type="primary" size="small" onClick={() => ouvrirApprobation(d)}>
                    Approuver…
                  </Button>
                  <Button danger size="small" onClick={() => rejeter(d)}>
                    Rejeter
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Drawer
        title={enApprobation ? `Accès de ${enApprobation.nom}` : ''}
        open={enApprobation !== null}
        onClose={() => setEnApprobation(null)}
        width={mobile ? '100%' : 520}
        extra={
          <Space>
            <Button onClick={() => setEnApprobation(null)}>Annuler</Button>
            <Button type="primary" loading={envoi} onClick={approuver}>
              Créer le compte
            </Button>
          </Space>
        }
      >
        {enApprobation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Text type="secondary">
              {enApprobation.email}
              {enApprobation.organisation ? ` · ${enApprobation.organisation}` : ''}
            </Text>
            <EditeurDroits valeur={profil} onChange={setProfil} directions={directions} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
