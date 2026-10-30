import { useEffect, useState } from 'react';
import { Button, Card, Select, Typography } from 'antd';
import { api } from '../api';
import type { DemandeAcces } from '../types';
import { genererMotDePasse } from '../lib/generatePassword';

const { Text } = Typography;

export default function Demandes() {
  const [demandes, setDemandes] = useState<DemandeAcces[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [roleParDemande, setRoleParDemande] = useState<Record<string, 'Administrateur' | 'Consultant'>>({});

  const charger = async () => {
    const data = await api.get<{ demandes: DemandeAcces[] }>('/demandes-acces');
    setDemandes(data.demandes);
  };

  useEffect(() => {
    charger();
  }, []);

  const roleDe = (id: string) => roleParDemande[id] ?? 'Consultant';

  const approuver = async (demande: DemandeAcces) => {
    const motDePasseTemporaire = genererMotDePasse();
    const res = await api.post<{ ok: boolean; message: string }>(`/demandes-acces/${demande._id}/approuver`, {
      role: roleDe(demande._id),
      motDePasseTemporaire,
    });
    if (res.ok) {
      setMessage(`Compte créé pour ${demande.email} (${roleDe(demande._id)}). Mot de passe temporaire : ${motDePasseTemporaire}`);
    } else {
      setMessage(res.message);
    }
    charger();
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
                  <Select
                    value={roleDe(d._id)}
                    onChange={(v) => setRoleParDemande((r) => ({ ...r, [d._id]: v as 'Administrateur' | 'Consultant' }))}
                    style={{ width: 160 }}
                    options={[
                      { value: 'Consultant', label: 'Consultant' },
                      { value: 'Administrateur', label: 'Administrateur' },
                    ]}
                  />
                  <Button type="primary" size="small" onClick={() => approuver(d)}>
                    Approuver
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
    </div>
  );
}
