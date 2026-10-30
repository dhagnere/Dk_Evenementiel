import { useEffect, useState } from 'react';
import { Alert, Button, Card, Descriptions, Input, InputNumber, Popconfirm, Typography } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { api } from '../api';

const { Text, Paragraph } = Typography;

interface Conservation {
  journalJours: number;
  demandesAccesTraiteesJours: number;
  comptesInactifsSuspensionJours: number;
  comptesSuspendusSuppressionJours: number;
}

interface BilanPurge {
  journal: number;
  demandesAcces: number;
  comptesSuspendus: number;
  comptesSupprimes: number;
}

const REGLES: { cle: keyof Conservation; libelle: string; aide: string }[] = [
  { cle: 'journalJours', libelle: 'Journal d’audit', aide: 'Les entrées plus anciennes sont supprimées.' },
  {
    cle: 'demandesAccesTraiteesJours',
    libelle: 'Demandes d’accès traitées',
    aide: 'Délai après approbation ou rejet. Les demandes en attente sont conservées.',
  },
  {
    cle: 'comptesInactifsSuspensionJours',
    libelle: 'Suspension des comptes inactifs',
    aide: 'Délai depuis la dernière connexion. Les super-administrateurs ne sont jamais suspendus automatiquement.',
  },
  {
    cle: 'comptesSuspendusSuppressionJours',
    libelle: 'Suppression des comptes suspendus',
    aide: 'Délai depuis la dernière connexion, pour un compte déjà suspendu.',
  },
];

function Message({ message }: { message: { type: 'success' | 'error'; texte: string } | null }) {
  return message ? <Alert type={message.type} showIcon message={message.texte} style={{ marginBottom: 12 }} /> : null;
}

function telechargerJson(nomFichier: string, donnees: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: 'application/json' }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}

export default function Rgpd() {
  const [conservation, setConservation] = useState<Conservation | null>(null);
  const [dernierePurge, setDernierePurge] = useState<{ date: string; bilan: BilanPurge } | null>(null);
  const [messageConservation, setMessageConservation] = useState<{ type: 'success' | 'error'; texte: string } | null>(null);

  const [email, setEmail] = useState('');
  const [messagePersonne, setMessagePersonne] = useState<{ type: 'success' | 'error'; texte: string } | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = async () => {
    const data = await api.get<{ conservation: Conservation; dernierePurge: { date: string; bilan: BilanPurge } | null }>(
      '/rgpd/conservation'
    );
    setConservation(data.conservation);
    setDernierePurge(data.dernierePurge);
  };

  useEffect(() => {
    charger();
  }, []);

  const enregistrer = async () => {
    if (!conservation) return;
    const res = await api.put<{ ok: boolean; message: string }>('/rgpd/conservation', conservation);
    setMessageConservation({ type: res.ok ? 'success' : 'error', texte: res.message });
  };

  const purgerMaintenant = async () => {
    const res = await api.post<{ ok: boolean; bilan: BilanPurge }>('/rgpd/purger');
    const b = res.bilan;
    setMessageConservation({
      type: 'success',
      texte: `Purge effectuée : ${b.journal} entrée(s) de journal, ${b.demandesAcces} demande(s) d’accès, ${b.comptesSuspendus} compte(s) suspendu(s), ${b.comptesSupprimes} compte(s) supprimé(s).`,
    });
    charger();
  };

  const emailValide = /\S+@\S+\.\S+/.test(email.trim());

  const exporter = async () => {
    setEnCours(true);
    try {
      const res = await api.post<{ ok: boolean; donnees: unknown }>('/rgpd/personne/export', { email: email.trim() });
      telechargerJson(`donnees-${email.trim().toLowerCase()}.json`, res.donnees);
      setMessagePersonne({ type: 'success', texte: 'Export téléchargé. La consultation est inscrite au journal.' });
    } catch (err) {
      setMessagePersonne({ type: 'error', texte: err instanceof Error ? err.message : 'Erreur inconnue' });
    } finally {
      setEnCours(false);
    }
  };

  const effacer = async () => {
    setEnCours(true);
    try {
      const res = await api.post<{
        ok: boolean;
        message?: string;
        bilan?: { compte: number; demandesAcces: number; journalAnonymise: number; sauvegardesNettoyees: number; evenementsPilotes: number };
      }>('/rgpd/personne/effacer', { email: email.trim(), confirmation: true });
      if (!res.ok || !res.bilan) {
        setMessagePersonne({ type: 'error', texte: res.message ?? 'Effacement impossible' });
        return;
      }
      const b = res.bilan;
      setMessagePersonne({
        type: 'success',
        texte:
          `Effacement effectué : ${b.compte} compte, ${b.demandesAcces} demande(s) d’accès, ${b.journalAnonymise} entrée(s) de journal anonymisée(s), ${b.sauvegardesNettoyees} sauvegarde(s) nettoyée(s).` +
          (b.evenementsPilotes > 0
            ? ` ${b.evenementsPilotes} événement(s) du calendrier la citent comme pilote : à revoir manuellement.`
            : ''),
      });
      setEmail('');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>
      <Card title="Durées de conservation">
        <Paragraph type="secondary">
          Les données personnelles sont purgées automatiquement chaque jour selon ces durées, exprimées en jours. 0
          désactive la règle. Valeurs par défaut à valider avec le délégué à la protection des données.
        </Paragraph>
        <Message message={messageConservation} />
        {conservation && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {REGLES.map((r) => (
              <label key={r.cle} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ flex: '1 1 320px' }}>
                  <Text strong>{r.libelle}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {r.aide}
                  </Text>
                </span>
                <InputNumber
                  min={0}
                  max={3650}
                  value={conservation[r.cle]}
                  onChange={(v) => setConservation({ ...conservation, [r.cle]: Number(v ?? 0) })}
                  addonAfter="jours"
                  style={{ width: 160 }}
                />
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button type="primary" onClick={enregistrer}>
                Enregistrer
              </Button>
              <Popconfirm
                title="Appliquer les durées maintenant ?"
                description="Les données au-delà des durées seront supprimées."
                okText="Purger"
                cancelText="Annuler"
                onConfirm={purgerMaintenant}
              >
                <Button>Purger maintenant</Button>
              </Popconfirm>
            </div>
            {dernierePurge && (
              <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                <Descriptions.Item label="Dernière purge">
                  {new Date(dernierePurge.date).toLocaleString('fr-FR')} — {dernierePurge.bilan.journal} journal,{' '}
                  {dernierePurge.bilan.demandesAcces} demande(s), {dernierePurge.bilan.comptesSuspendus} suspension(s),{' '}
                  {dernierePurge.bilan.comptesSupprimes} suppression(s)
                </Descriptions.Item>
              </Descriptions>
            )}
          </div>
        )}
      </Card>

      <Card title="Droits des personnes">
        <Paragraph type="secondary">
          Pour répondre à une demande d’accès (article 15) ou d’effacement (article 17), indiquez l’adresse électronique de la
          personne. L’export rassemble son compte, ses droits, ses demandes d’accès, ses traces au journal et les événements
          dont elle est pilote.
        </Paragraph>
        <Message message={messagePersonne} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input
            type="email"
            placeholder="adresse@exemple.fr"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ maxWidth: 320 }}
            aria-label="Adresse électronique de la personne"
          />
          <Button icon={<DownloadOutlined />} disabled={!emailValide} loading={enCours} onClick={exporter}>
            Exporter ses données
          </Button>
          <Popconfirm
            title="Effacer définitivement ?"
            description="Compte et demandes supprimés, journal anonymisé, sauvegardes nettoyées. Irréversible."
            okText="Effacer"
            okButtonProps={{ danger: true }}
            cancelText="Annuler"
            onConfirm={effacer}
            disabled={!emailValide}
          >
            <Button danger disabled={!emailValide} loading={enCours}>
              Effacer ses données
            </Button>
          </Popconfirm>
        </div>
      </Card>
    </div>
  );
}
