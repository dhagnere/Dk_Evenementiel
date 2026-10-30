import { useEffect, useState } from 'react';
import { Button, Card, DatePicker, Input, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { api, ApiError } from '../api';

const { RangePicker } = DatePicker;
const { Title, Text } = Typography;

const OUI_NON = ['Oui', 'Non'];

interface ValeursReference {
  quartiers: string[];
  natures: string[];
  niveaux: string[];
  types: string[];
}

/**
 * Formulaire de saisie manuelle d'un nouvel événement, ouvert à tout compte connecté (à la
 * différence de l'import CSV, réservé aux administrateurs). L'événement créé entre dans le circuit
 * d'arbitrage habituel (statut « À valider ») : un administrateur le valide ensuite normalement,
 * depuis le Calendrier, la Liste ou les Conflits.
 */
export default function FicheRenseignement() {
  const [valeurs, setValeurs] = useState<ValeursReference>({ quartiers: [], natures: [], niveaux: [], types: [] });
  const [envoi, setEnvoi] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nom, setNom] = useState('');
  const [plage, setPlage] = useState<[Dayjs, Dayjs] | null>([dayjs(), dayjs()]);
  const [lieu, setLieu] = useState('');
  const [quartier, setQuartier] = useState<string | undefined>(undefined);
  const [nature, setNature] = useState<string | undefined>(undefined);
  const [niveau, setNiveau] = useState<string | undefined>(undefined);
  const [type, setType] = useState<string | undefined>(undefined);
  const [organisateur, setOrganisateur] = useState('');
  const [pilote, setPilote] = useState('');
  const [directionPilote, setDirectionPilote] = useState('');
  const [tardive, setTardive] = useState('Non');
  const [reprog, setReprog] = useState('Non');

  useEffect(() => {
    api.get<ValeursReference>('/evenements/valeurs-reference').then(setValeurs);
  }, []);

  const reinitialiser = () => {
    setNom('');
    setPlage([dayjs(), dayjs()]);
    setLieu('');
    setQuartier(undefined);
    setNature(undefined);
    setNiveau(undefined);
    setType(undefined);
    setOrganisateur('');
    setPilote('');
    setDirectionPilote('');
    setTardive('Non');
    setReprog('Non');
  };

  const soumettre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plage) return;
    setEnvoi(true);
    setMessage(null);
    setErreur(null);
    try {
      await api.post('/evenements', {
        nom,
        dateDeDebut: plage[0].format('YYYY-MM-DD'),
        dateDeFin: plage[1].isSame(plage[0], 'day') ? null : plage[1].format('YYYY-MM-DD'),
        lieu: lieu || undefined,
        quartier,
        nature,
        niveau,
        type,
        organisateur: organisateur || undefined,
        pilote: pilote || undefined,
        directionPilote: directionPilote || undefined,
        tardive,
        reprog,
      });
      setMessage(`« ${nom} » a bien été créé et attend maintenant sa validation.`);
      reinitialiser();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : 'Impossible de contacter le serveur. Réessayez dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <Title level={3} style={{ marginTop: 0 }}>
        Fiche de renseignement
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Renseignez ici une nouvelle manifestation à ajouter au calendrier. Une fois créée, elle
        apparaît avec le statut « À valider », comme n'importe quel événement importé — un
        administrateur la valide ensuite normalement depuis le Calendrier, la Liste ou les Conflits.
      </Text>

      {message && (
        <Text
          style={{ display: 'block', marginBottom: 16, fontSize: 13, background: '#f6ffed', color: '#237804', padding: '8px 12px', borderRadius: 6 }}
        >
          {message}
        </Text>
      )}
      {erreur && (
        <Text
          style={{ display: 'block', marginBottom: 16, fontSize: 13, background: '#fff1f0', color: '#cf1322', padding: '8px 12px', borderRadius: 6 }}
        >
          {erreur}
        </Text>
      )}

      <Card>
        <form onSubmit={soumettre} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Nom de l'événement *</div>
            <Input value={nom} onChange={(e) => setNom(e.target.value)} required />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Période *</div>
            <RangePicker
              style={{ width: '100%' }}
              format="DD/MM/YYYY"
              value={plage}
              onChange={(valeurs) => setPlage(valeurs as [Dayjs, Dayjs] | null)}
              allowClear={false}
            />
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Lieu</div>
            <Input value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Adresse ou nom de salle" />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Quartier</div>
              <Select
                allowClear
                value={quartier}
                onChange={setQuartier}
                style={{ width: '100%' }}
                options={valeurs.quartiers.map((q) => ({ value: q, label: q }))}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Nature</div>
              <Select
                allowClear
                value={nature}
                onChange={setNature}
                style={{ width: '100%' }}
                options={valeurs.natures.map((n) => ({ value: n, label: n }))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Niveau</div>
              <Select
                allowClear
                value={niveau}
                onChange={setNiveau}
                style={{ width: '100%' }}
                options={valeurs.niveaux.map((n) => ({ value: n, label: n }))}
              />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Type</div>
              <Select
                allowClear
                value={type}
                onChange={setType}
                style={{ width: '100%' }}
                options={valeurs.types.map((t) => ({ value: t, label: t }))}
              />
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Organisateur</div>
            <Input value={organisateur} onChange={(e) => setOrganisateur(e.target.value)} />
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Pilote</div>
              <Input value={pilote} onChange={(e) => setPilote(e.target.value)} />
            </div>
            <div style={{ flex: '1 1 200px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Direction pilote</div>
              <Input value={directionPilote} onChange={(e) => setDirectionPilote(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Tardive</div>
              <Select value={tardive} onChange={setTardive} style={{ width: '100%' }} options={OUI_NON.map((v) => ({ value: v, label: v }))} />
            </div>
            <div style={{ flex: '1 1 160px' }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Reprogrammation</div>
              <Select value={reprog} onChange={setReprog} style={{ width: '100%' }} options={OUI_NON.map((v) => ({ value: v, label: v }))} />
            </div>
          </div>

          <Button type="primary" htmlType="submit" loading={envoi} disabled={!nom || !plage} style={{ alignSelf: 'flex-start' }}>
            Créer l'événement
          </Button>
        </form>
      </Card>
    </div>
  );
}
