import { useEffect, useState } from 'react';
import { Grid, Select, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { api } from '../api';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

interface EntreeJournal {
  _id: string;
  utilisateurNom: string;
  utilisateurEmail: string;
  action: string;
  cible: string;
  details: unknown;
  createdAt: string;
}

const LIBELLES_ACTION: Record<string, { libelle: string; couleur?: string }> = {
  connexion: { libelle: 'Connexion', couleur: 'blue' },
  deconnexion: { libelle: 'Déconnexion', couleur: 'blue' },
  changement_mot_de_passe: { libelle: 'Changement de mot de passe' },
  creation_compte: { libelle: 'Création de compte', couleur: 'green' },
  suspension_compte: { libelle: 'Suspension de compte', couleur: 'orange' },
  activation_compte: { libelle: 'Activation de compte', couleur: 'green' },
  reinitialisation_mot_de_passe: { libelle: 'Réinitialisation de mot de passe' },
  suppression_compte: { libelle: 'Suppression de compte', couleur: 'red' },
  changement_statut_evenement: { libelle: 'Changement de statut' },
  changement_validation: { libelle: 'Changement de validation' },
  report_date_evenement: { libelle: 'Report de date' },
  validation_evenement: { libelle: 'Validation en un clic', couleur: 'green' },
  marquage_date_clef: { libelle: 'Marquage Date Clef', couleur: 'blue' },
  suppression_evenement: { libelle: "Suppression d'événement", couleur: 'red' },
  fusion_doublons: { libelle: 'Fusion de doublons', couleur: 'orange' },
  import_evenements: { libelle: "Import d'événements", couleur: 'purple' },
  creation_evenement: { libelle: "Création d'événement (fiche de renseignement)", couleur: 'blue' },
  import_utilisateurs: { libelle: "Import d'utilisateurs", couleur: 'purple' },
  approbation_demande_acces: { libelle: "Approbation de demande d'accès", couleur: 'green' },
  rejet_demande_acces: { libelle: "Rejet de demande d'accès", couleur: 'red' },
  creation_sauvegarde_manuelle: { libelle: 'Sauvegarde manuelle' },
  synchronisation_github: { libelle: 'Synchronisation GitHub', couleur: 'cyan' },
  restauration_sauvegarde: { libelle: 'Restauration de sauvegarde', couleur: 'red' },
};

function libelleAction(action: string): { libelle: string; couleur?: string } {
  return LIBELLES_ACTION[action] ?? { libelle: action };
}

/** Formate une date ISO en "JJ/MM/AAAA à HH:MM" (locale fr-FR), ou "—" si absente/invalide. */
function formatDateHeure(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('fr-FR')} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

export default function Journal() {
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const [entrees, setEntrees] = useState<EntreeJournal[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [chargement, setChargement] = useState(true);
  const [utilisateur, setUtilisateur] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [utilisateurs, setUtilisateurs] = useState<{ email: string; nom: string }[]>([]);

  const LIMITE = 50;

  const charger = async (pageVoulue: number) => {
    setChargement(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(pageVoulue));
      params.set('limit', String(LIMITE));
      if (utilisateur !== 'ALL') params.set('utilisateur', utilisateur);
      if (action !== 'ALL') params.set('action', action);
      const data = await api.get<{ items: EntreeJournal[]; total: number }>(`/journal?${params.toString()}`);
      setEntrees(data.items);
      setTotal(data.total);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    api.get<{ utilisateurs: { email: string; nom: string }[] }>('/journal/utilisateurs').then((data) => setUtilisateurs(data.utilisateurs));
  }, []);

  useEffect(() => {
    setPage(1);
    charger(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [utilisateur, action]);

  const columns: TableColumnsType<EntreeJournal> = [
    { title: 'Date', key: 'date', width: 170, render: (_, e) => formatDateHeure(e.createdAt) },
    {
      title: 'Compte',
      key: 'compte',
      width: 220,
      render: (_, e) => (
        <div>
          <div style={{ fontWeight: 600 }}>{e.utilisateurNom || '—'}</div>
          <div style={{ fontSize: 12, color: '#8c8c8c' }}>{e.utilisateurEmail || '—'}</div>
        </div>
      ),
    },
    {
      title: 'Action',
      key: 'action',
      width: 220,
      render: (_, e) => {
        const { libelle, couleur } = libelleAction(e.action);
        return <Tag color={couleur}>{libelle}</Tag>;
      },
    },
    { title: 'Cible', key: 'cible', render: (_, e) => e.cible || '—' },
  ];

  return (
    <div>
      <Title level={3} style={{ marginTop: 0 }}>
        Journal
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
        Historique des actions effectuées par chaque compte (connexions, validations, imports,
        suppressions, sauvegardes…), le plus récent en premier.
      </Text>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: mobile ? '100%' : 240, flex: mobile ? undefined : 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Compte</div>
          <Select
            value={utilisateur}
            onChange={setUtilisateur}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            options={[
              { value: 'ALL', label: 'Tous' },
              ...utilisateurs.map((u) => ({ value: u.email, label: u.nom ? `${u.nom} (${u.email})` : u.email })),
            ]}
          />
        </div>
        <div style={{ minWidth: mobile ? '100%' : 240, flex: mobile ? undefined : 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Action</div>
          <Select
            value={action}
            onChange={setAction}
            style={{ width: '100%' }}
            showSearch
            optionFilterProp="label"
            options={[
              { value: 'ALL', label: 'Toutes' },
              ...Object.entries(LIBELLES_ACTION).map(([valeur, { libelle }]) => ({ value: valeur, label: libelle })),
            ]}
          />
        </div>
      </div>

      <Table
        rowKey="_id"
        size="small"
        bordered
        loading={chargement}
        columns={columns}
        dataSource={entrees}
        scroll={{ x: mobile ? 'max-content' : undefined }}
        pagination={{
          current: page,
          pageSize: LIMITE,
          total,
          showSizeChanger: false,
          onChange: (p) => {
            setPage(p);
            charger(p);
          },
        }}
      />
    </div>
  );
}
