import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, Checkbox, Grid, Input, Modal, Popconfirm, Select, Switch, Table, Typography, type TableColumnsType } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import type { Evenement } from '../types';
import { ValidationBadge } from '../components/ValidationBadge';
import { COULEUR_DATE_CLEF } from '../lib/validationColors';
import { ImportExportEvenements } from '../components/ImportExportEvenements';
import { FicheEvenement } from '../components/FicheEvenement';
import { regrouperParEvenement } from '../lib/regrouperEvenements';
import { formatDuree } from '../lib/formatDuree';
import { formatTitreEvenement } from '../lib/formatTitre';
import { exporterListePdf } from '../lib/pdf';

const { Text } = Typography;
const { useBreakpoint } = Grid;

const MOIS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Début (lundi) de la semaine contenant `date`. */
function debutSemaine(date: Date): Date {
  const jour = (date.getDay() + 6) % 7; // 0 = lundi
  const d = new Date(date);
  d.setDate(d.getDate() - jour);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fin (dimanche) de la semaine dont `debut` est le lundi. */
function finSemaine(debut: Date): Date {
  const d = new Date(debut);
  d.setDate(d.getDate() + 6);
  return d;
}

/** Ex. "Semaine du 01 janvier au 07 janvier 2026 inclus". */
function formatSemaine(debut: Date, fin: Date): string {
  const jour = (d: Date) => String(d.getDate()).padStart(2, '0');
  const anneeDebut = debut.getFullYear() !== fin.getFullYear() ? ` ${debut.getFullYear()}` : '';
  return `Semaine du ${jour(debut)} ${MOIS_FR[debut.getMonth()]}${anneeDebut} au ${jour(fin)} ${MOIS_FR[fin.getMonth()]} ${fin.getFullYear()} inclus`;
}

type LigneListe =
  | { type: 'entete'; key: string; label: string }
  | { type: 'evenement'; key: string; evenement: Evenement };

/**
 * Regroupe les événements par semaine (lundi à dimanche) de leur dateDeDebut (dateClef en repli),
 * du plus ancien au plus récent, avec une ligne d'en-tête avant chaque semaine. Les événements sans
 * aucune date sont placés dans un dernier groupe « Sans date planifiée ».
 */
function regrouperParSemaine(evenements: Evenement[]): LigneListe[] {
  const avecDate = evenements.filter((e) => e.dateDeDebut || e.dateClef);
  const sansDate = evenements.filter((e) => !e.dateDeDebut && !e.dateClef);

  const trie = [...avecDate].sort((a, b) => {
    const da = new Date((a.dateDeDebut ?? a.dateClef)!).getTime();
    const db = new Date((b.dateDeDebut ?? b.dateClef)!).getTime();
    return da - db;
  });

  const lignes: LigneListe[] = [];
  let cleSemaineCourante: string | null = null;
  for (const e of trie) {
    const debut = debutSemaine(new Date((e.dateDeDebut ?? e.dateClef)!));
    const cle = debut.toISOString();
    if (cle !== cleSemaineCourante) {
      cleSemaineCourante = cle;
      lignes.push({ type: 'entete', key: `entete-${cle}`, label: formatSemaine(debut, finSemaine(debut)) });
    }
    lignes.push({ type: 'evenement', key: e._id, evenement: e });
  }

  if (sansDate.length > 0) {
    lignes.push({ type: 'entete', key: 'entete-sans-date', label: 'Sans date planifiée' });
    for (const e of sansDate) lignes.push({ type: 'evenement', key: e._id, evenement: e });
  }

  return lignes;
}

export default function Liste() {
  const { estAdministrateur } = useAuth();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [recherche, setRecherche] = useState('');
  const [quartier, setQuartier] = useState('ALL');
  const [statut, setStatut] = useState('ALL');
  const [nature, setNature] = useState('ALL');
  const [avecEvenementsArchives, setAvecEvenementsArchives] = useState(false);
  const [evenementOuvertId, setEvenementOuvertId] = useState<string | null>(null);
  const [options, setOptions] = useState<{
    quartiers: { label: string }[];
    natures: { label: string }[];
    statuts: { label: string }[];
  }>({
    quartiers: [],
    natures: [],
    statuts: [],
  });

  const charger = async () => {
    setChargement(true);
    try {
      const params = new URLSearchParams();
      if (recherche) params.set('searchTerm', recherche);
      if (quartier !== 'ALL') params.set('quartier', quartier);
      if (statut !== 'ALL') params.set('statut', statut);
      if (nature !== 'ALL') params.set('nature', nature);
      if (avecEvenementsArchives) params.set('avecEvenementsArchives', 'true');
      const data = await api.get<{ items: Evenement[] }>(`/evenements?${params.toString()}`);
      setEvenements(data.items);
    } finally {
      setChargement(false);
    }
  };

  useEffect(() => {
    api
      .get<{ quartiers: { label: string }[]; natures: { label: string }[]; statuts: { label: string }[] }>(
        '/evenements/options-filtres'
      )
      .then(setOptions);
  }, []);

  useEffect(() => {
    const t = setTimeout(charger, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recherche, quartier, statut, nature, avecEvenementsArchives]);

  const toggleValidation = async (id: string, champ: 'validationTechnique' | 'validationPolitique', valeur: boolean) => {
    await api.post(`/evenements/${id}/validations`, { [champ]: valeur });
    charger();
  };

  const marquerDateClef = async (id: string) => {
    await api.post(`/evenements/${id}/valider`, { viaPastilleDateClef: true });
    charger();
  };

  const validerUnClic = async (id: string) => {
    await api.post(`/evenements/${id}/valider`, {});
    charger();
  };

  const supprimer = async (id: string) => {
    await api.delete(`/evenements/${id}`);
    setEvenementOuvertId(null);
    charger();
  };

  const changerDates = async (id: string, dateDeDebut: string, dateDeFin: string | null) => {
    await api.post(`/evenements/${id}/dates`, { dateDeDebut, dateDeFin });
    setEvenementOuvertId(null);
    charger();
  };

  const evenementsGroupes = useMemo(() => regrouperParEvenement(evenements), [evenements]);
  const total = evenementsGroupes.length;
  const lignes = useMemo(() => regrouperParSemaine(evenementsGroupes), [evenementsGroupes]);

  /** Colonnes « normales », appliquées uniquement aux lignes de type événement. */
  const colonnesEvenement: { title: string; key: string; width?: number; render: (e: Evenement) => ReactNode }[] = [
    {
      title: 'Nom',
      key: 'nom',
      width: 220,
      render: (e) => (
        <div>
          <Text strong>{formatTitreEvenement(e.nom)}</Text>
          {formatDuree(e) && <div style={{ fontSize: 12, color: '#8c8c8c' }}>{formatDuree(e)}</div>}
        </div>
      ),
    },
    { title: 'Quartier', key: 'quartier', width: 150, render: (e) => e.quartier },
    { title: 'Nature', key: 'nature', width: 130, render: (e) => e.nature },
    { title: 'Validation', key: 'validation', width: 130, render: (e) => <ValidationBadge evenement={e} /> },
    ...(estAdministrateur
      ? [
          {
            title: 'Actions',
            key: 'actions',
            width: 260,
            render: (e: Evenement) => (
              // stopPropagation : ces contrôles ne doivent pas aussi déclencher l'ouverture de la
              // fiche détaillée au clic sur la ligne (voir onRow du Table plus bas).
              <div
                onClick={(ev) => ev.stopPropagation()}
                style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}
              >
                <Checkbox
                  checked={e.validationTechnique}
                  onChange={(ev) => toggleValidation(e._id, 'validationTechnique', ev.target.checked)}
                >
                  Tech.
                </Checkbox>
                <Checkbox
                  checked={e.validationPolitique}
                  onChange={(ev) => toggleValidation(e._id, 'validationPolitique', ev.target.checked)}
                >
                  Pol.
                </Checkbox>
                <Button
                  size="small"
                  type={e.validParDateClef ? 'primary' : 'default'}
                  style={
                    e.validParDateClef
                      ? { background: COULEUR_DATE_CLEF, borderColor: COULEUR_DATE_CLEF }
                      : { color: COULEUR_DATE_CLEF, borderColor: COULEUR_DATE_CLEF }
                  }
                  onClick={() => marquerDateClef(e._id)}
                >
                  Date Clef
                </Button>
                <Popconfirm
                  title="Supprimer cet événement ?"
                  description="Cette action est définitive."
                  okText="Supprimer"
                  okButtonProps={{ danger: true }}
                  cancelText="Annuler"
                  onConfirm={() => supprimer(e._id)}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </div>
            ),
          },
        ]
      : []),
  ];

  /**
   * Les colonnes réelles de la Table : sur une ligne d'en-tête de semaine, la première colonne
   * fusionne toute la largeur (colSpan) pour afficher le libellé de la semaine, les autres colonnes
   * sont fusionnées dedans (colSpan: 0), technique standard d'antd pour des lignes de séparation.
   */
  const columns: TableColumnsType<LigneListe> = colonnesEvenement.map((col, index) => ({
    title: col.title,
    key: col.key,
    width: col.width,
    onCell: (ligne: LigneListe) => {
      if (ligne.type !== 'entete') return {};
      return index === 0 ? { colSpan: colonnesEvenement.length, style: { background: '#e6f4ff' } } : { colSpan: 0 };
    },
    render: (_: unknown, ligne: LigneListe) => {
      if (ligne.type === 'entete') {
        return index === 0 ? (
          <Text strong style={{ fontSize: 13, color: '#1958d9' }}>
            {ligne.label}
          </Text>
        ) : null;
      }
      return col.render(ligne.evenement);
    },
  }));

  const evenementOuvert = evenementOuvertId
    ? (evenementsGroupes.find((e) => e._id === evenementOuvertId) ?? null)
    : null;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ minWidth: mobile ? '100%' : 220, flex: 1 }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Recherche</div>
          <Input placeholder="Nom de l'événement…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
        </div>
        <div style={{ minWidth: mobile ? '100%' : 200, flex: mobile ? '1 0 100%' : undefined }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Quartier</div>
          <Select
            value={quartier}
            onChange={setQuartier}
            style={{ width: '100%' }}
            options={[{ value: 'ALL', label: 'Tous' }, ...options.quartiers.map((q) => ({ value: q.label, label: q.label }))]}
          />
        </div>
        <div style={{ minWidth: mobile ? '100%' : 200, flex: mobile ? '1 0 100%' : undefined }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Statut</div>
          <Select
            value={statut}
            onChange={setStatut}
            style={{ width: '100%' }}
            options={[
              { value: 'ALL', label: 'Tous' },
              { value: 'Validée', label: 'Validée' },
              ...options.statuts.map((s) => ({ value: s.label, label: s.label })),
            ]}
          />
        </div>
        <div style={{ minWidth: mobile ? '100%' : 200, flex: mobile ? '1 0 100%' : undefined }}>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>Nature</div>
          <Select
            value={nature}
            onChange={setNature}
            style={{ width: '100%' }}
            options={[{ value: 'ALL', label: 'Toutes' }, ...options.natures.map((n) => ({ value: n.label, label: n.label }))]}
          />
        </div>
        <Switch
          checked={avecEvenementsArchives}
          onChange={setAvecEvenementsArchives}
          checkedChildren={mobile ? 'Archivés visibles' : 'Événements archivés visibles'}
          unCheckedChildren={mobile ? 'Archivés masqués' : 'Événements archivés masqués'}
        />
        <div style={{ marginLeft: mobile ? 0 : 'auto', width: mobile ? '100%' : undefined }}>
          <ImportExportEvenements onImported={charger} onExporterPdf={() => exporterListePdf(lignes)} />
        </div>
      </div>

      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        {total} événement(s)
      </Text>

      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={lignes}
        loading={chargement}
        pagination={false}
        bordered
        scroll={{ x: mobile ? 'max-content' : undefined }}
        locale={{ emptyText: 'Aucun événement' }}
        onRow={(ligne) =>
          ligne.type === 'evenement'
            ? { onClick: () => setEvenementOuvertId(ligne.evenement._id), style: { cursor: 'pointer' } }
            : {}
        }
      />

      <Modal
        open={!!evenementOuvert}
        onCancel={() => setEvenementOuvertId(null)}
        footer={null}
        width={mobile ? '94%' : 720}
        title={null}
      >
        {evenementOuvert && (
          <FicheEvenement
            evenement={evenementOuvert}
            estAdministrateur={estAdministrateur}
            onToggleValidation={toggleValidation}
            onValider={validerUnClic}
            onSupprimer={supprimer}
            onChangerDates={changerDates}
          />
        )}
      </Modal>
    </div>
  );
}
