import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Card, Col, DatePicker, Grid, Modal, Row, Select, Switch, Typography } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { estBrouillon, estValide, type Evenement } from '../types';
import { COULEUR_BROUILLON, COULEUR_DATE_CLEF, COULEUR_NON_VALIDE, COULEUR_VALIDE } from '../lib/validationColors';
import { ImportExportEvenements } from '../components/ImportExportEvenements';
import { FicheEvenement } from '../components/FicheEvenement';
import { formatTitreEvenement } from '../lib/formatTitre';
import { majusculeInitiale } from '../lib/formatDate';
import { exporterFicheJourPdf } from '../lib/pdf';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const MAX_LIGNES_VISIBLES = 4;
const COULEUR_BORDURE = '#bfbfbf';

function debutSemaine(date: Date): Date {
  const jour = (date.getDay() + 6) % 7; // 0 = lundi
  const d = new Date(date);
  d.setDate(d.getDate() - jour);
  d.setHours(0, 0, 0, 0);
  return d;
}

function memeJour(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function couleurValidation(e: Evenement): string {
  if (estBrouillon(e)) return COULEUR_BROUILLON;
  if (e.validParDateClef) return COULEUR_DATE_CLEF;
  return estValide(e) ? COULEUR_VALIDE : COULEUR_NON_VALIDE;
}

/** Petite pastille de couleur placée devant le texte pour indiquer la validation. */
function Pastille({ couleur }: { couleur: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        flexShrink: 0,
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: couleur,
      }}
    />
  );
}

/** Groupe de contrôles encadré (boîte), utilisé pour la navigation et les actions. */
function Boite({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        border: `1px solid ${COULEUR_BORDURE}`,
        borderRadius: 8,
        padding: '8px 12px',
        background: '#fff',
      }}
    >
      {children}
    </div>
  );
}

type OptionsFiltres = {
  quartiers: { label: string }[];
  statuts: { label: string }[];
  types: { label: string }[];
};

/** Menu déroulant de filtre avec une petite étiquette au-dessus, utilisé dans la barre du calendrier. */
function FiltreSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div style={{ minWidth: 170 }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 2 }}>{label}</div>
      <Select value={value} onChange={onChange} style={{ width: '100%' }} options={options} />
    </div>
  );
}

export default function Calendrier() {
  const { estAdministrateur } = useAuth();
  const breakpoint = useBreakpoint();
  const mobile = !breakpoint.sm;
  const tablette = !breakpoint.md;
  const [mois, setMois] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [evenements, setEvenements] = useState<Evenement[]>([]);
  const [jourSelectionne, setJourSelectionne] = useState<Date | null>(null);
  const [genererPdfEnCours, setGenererPdfEnCours] = useState(false);
  const [stats, setStats] = useState<{
    total: number;
    validated: number;
    pending: number;
    anneeActuelle: number;
    anneeEnCours: number;
    anneePlancherTotal: number;
  } | null>(null);
  const [quartier, setQuartier] = useState('ALL');
  const [statut, setStatut] = useState('ALL');
  const [type, setType] = useState('ALL');
  const [avecEvenementsPasses, setAvecEvenementsPasses] = useState(false);
  const [avecEvenementsArchives, setAvecEvenementsArchives] = useState(false);
  const [options, setOptions] = useState<OptionsFiltres>({ quartiers: [], statuts: [], types: [] });

  const charger = async () => {
    const params = new URLSearchParams();
    if (quartier !== 'ALL') params.set('quartier', quartier);
    if (statut !== 'ALL') params.set('statut', statut);
    if (type !== 'ALL') params.set('type', type);
    if (avecEvenementsPasses) params.set('avecEvenementsPasses', 'true');
    if (avecEvenementsArchives) params.set('avecEvenementsArchives', 'true');
    const data = await api.get<{ items: Evenement[] }>(`/evenements?${params.toString()}`);
    setEvenements(data.items);
    const s = await api.get<{
      total: number;
      validated: number;
      pending: number;
      anneeActuelle: number;
      anneeEnCours: number;
      anneePlancherTotal: number;
    }>('/evenements/stats');
    setStats(s);
  };

  useEffect(() => {
    api.get<OptionsFiltres>('/evenements/options-filtres').then(setOptions);
  }, []);

  useEffect(() => {
    charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quartier, statut, type, avecEvenementsPasses, avecEvenementsArchives]);

  const jours = useMemo(() => {
    const premier = new Date(mois.getFullYear(), mois.getMonth(), 1);
    const debut = debutSemaine(premier);
    const cases: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(debut);
      d.setDate(d.getDate() + i);
      cases.push(d);
    }
    return cases;
  }, [mois]);

  const evenementsDuJour = (jour: Date) =>
    evenements.filter((e) => {
      // Cas normal : la ligne représente précisément ce jour (dateClef).
      if (e.dateClef) return memeJour(new Date(e.dateClef), jour);
      // Repli pour un événement sans dateClef (ex: import brut sans cette colonne, ou événement créé
      // manuellement) : chevauchement de plage, en comparant uniquement les jours calendaires (minuit
      // à minuit) pour éviter tout décalage d'heure qui exclurait à tort le jour de l'événement.
      if (!e.dateDeDebut) return false;
      const debut = new Date(e.dateDeDebut);
      const fin = e.dateDeFin ? new Date(e.dateDeFin) : debut;
      const jourMinuit = new Date(jour.getFullYear(), jour.getMonth(), jour.getDate());
      const debutMinuit = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate());
      const finMinuit = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
      return jourMinuit >= debutMinuit && jourMinuit <= finMinuit;
    });

  const validerUnClic = async (id: string) => {
    await api.post(`/evenements/${id}/valider`, {});
    charger();
  };

  const toggleValidation = async (id: string, champ: 'validationTechnique' | 'validationPolitique', valeur: boolean) => {
    await api.post(`/evenements/${id}/validations`, { [champ]: valeur });
    charger();
  };

  const supprimer = async (id: string) => {
    await api.delete(`/evenements/${id}`);
    charger();
  };

  const changerDates = async (id: string, dateDeDebut: string, dateDeFin: string | null) => {
    await api.post(`/evenements/${id}/dates`, { dateDeDebut, dateDeFin });
    charger();
  };

  const evenementsJourOuvert = jourSelectionne ? evenementsDuJour(jourSelectionne) : [];

  const telechargerFichePdf = async () => {
    if (!jourSelectionne) return;
    setGenererPdfEnCours(true);
    try {
      await exporterFicheJourPdf(jourSelectionne, evenementsJourOuvert);
    } finally {
      setGenererPdfEnCours(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <Boite>
          <Button onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() - 1, 1))}>←</Button>
          <Title level={4} style={{ width: 170, textAlign: 'center', margin: 0 }}>
            {MOIS[mois.getMonth()]} {mois.getFullYear()}
          </Title>
          <Button onClick={() => setMois(new Date(mois.getFullYear(), mois.getMonth() + 1, 1))}>→</Button>
          <DatePicker
            picker="month"
            value={dayjs(mois)}
            onChange={(date) => date && setMois(date.toDate())}
            allowClear={false}
            format="MMMM YYYY"
          />
        </Boite>
        <Boite>
          <Switch
            checked={avecEvenementsArchives}
            onChange={setAvecEvenementsArchives}
            checkedChildren={mobile ? 'Archivés visibles' : 'Événements archivés visibles'}
            unCheckedChildren={mobile ? 'Archivés masqués' : 'Événements archivés masqués'}
          />
          <ImportExportEvenements onImported={charger} />
        </Boite>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Boite>
          <FiltreSelect
            label="Type"
            value={type}
            onChange={setType}
            options={[{ value: 'ALL', label: 'Tous' }, ...options.types.map((t) => ({ value: t.label, label: t.label }))]}
          />
          <FiltreSelect
            label="Quartier"
            value={quartier}
            onChange={setQuartier}
            options={[{ value: 'ALL', label: 'Tous' }, ...options.quartiers.map((q) => ({ value: q.label, label: q.label }))]}
          />
          <FiltreSelect
            label="Statut"
            value={statut}
            onChange={setStatut}
            options={[
              { value: 'ALL', label: 'Tous' },
              { value: 'Validée', label: 'Validée' },
              ...options.statuts.map((s) => ({ value: s.label, label: s.label })),
            ]}
          />
          <Button
            type={avecEvenementsPasses ? 'primary' : 'default'}
            onClick={() => setAvecEvenementsPasses((v) => !v)}
          >
            {mobile
              ? avecEvenementsPasses
                ? 'Masquer le passé'
                : 'Afficher le passé'
              : avecEvenementsPasses
                ? 'Masquer les événements passés'
                : 'Afficher les événements passés'}
          </Button>
        </Boite>
      </div>

      {stats && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} md={6}>
            <Card size="small" style={{ textAlign: 'center', borderColor: COULEUR_BORDURE }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.total}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Total des manifestations depuis {stats.anneePlancherTotal}
              </Text>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" style={{ textAlign: 'center', borderColor: COULEUR_BORDURE }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: COULEUR_VALIDE }}>{stats.validated}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Validés
              </Text>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" style={{ textAlign: 'center', borderColor: COULEUR_BORDURE }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: '#d46b08' }}>{stats.pending}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                En attente
              </Text>
            </Card>
          </Col>
          <Col xs={12} md={6}>
            <Card size="small" style={{ textAlign: 'center', borderColor: COULEUR_BORDURE }}>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{stats.anneeEnCours}</div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                Manifestations en {stats.anneeActuelle}
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 12, color: '#595959', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 12 }}>
          Légende :
        </Text>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pastille couleur={COULEUR_VALIDE} />
          Validée
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pastille couleur={COULEUR_NON_VALIDE} />
          Non validée
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pastille couleur={COULEUR_DATE_CLEF} />
          Date Clef
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Pastille couleur={COULEUR_BROUILLON} />
          Brouillon
        </span>
      </div>

      <div style={{ border: `2px solid ${COULEUR_BORDURE}`, borderRadius: 8, overflow: 'hidden', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', background: '#fafafa' }}>
          {JOURS.map((j) => (
            <div
              key={j}
              style={{
                textAlign: 'center',
                padding: mobile ? '6px 0' : '10px 0',
                fontSize: mobile ? 11 : 13,
                fontWeight: 600,
                color: '#262626',
                borderBottom: `2px solid ${COULEUR_BORDURE}`,
              }}
            >
              {mobile ? j.slice(0, 1) : j}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {jours.map((jour, idx) => {
            const evts = evenementsDuJour(jour);
            const maxLignes = mobile ? 0 : tablette ? 2 : MAX_LIGNES_VISIBLES;
            const surplus = evts.length - maxLignes;
            const horsMois = jour.getMonth() !== mois.getMonth();
            const estAujourdhui = memeJour(jour, new Date());
            return (
              <button
                key={jour.toISOString()}
                onClick={() => setJourSelectionne(jour)}
                style={{
                  minHeight: mobile ? 52 : tablette ? 96 : 140,
                  minWidth: 0,
                  width: '100%',
                  overflow: 'hidden',
                  background: horsMois ? '#fafafa' : '#fff',
                  border: 'none',
                  borderRight: idx % 7 !== 6 ? `1px solid ${COULEUR_BORDURE}` : 'none',
                  borderBottom: `1px solid ${COULEUR_BORDURE}`,
                  textAlign: 'left',
                  padding: mobile ? 4 : 8,
                  cursor: 'pointer',
                  color: horsMois ? '#bfbfbf' : '#141414',
                }}
              >
                <span
                  style={{
                    fontSize: mobile ? 11 : 13,
                    fontWeight: estAujourdhui ? 700 : 500,
                    borderRadius: 999,
                    padding: estAujourdhui ? (mobile ? '1px 6px' : '2px 8px') : undefined,
                    background: estAujourdhui ? '#1d4ed8' : undefined,
                    color: estAujourdhui ? '#fff' : undefined,
                  }}
                >
                  {jour.getDate()}
                </span>
                {mobile ? (
                  evts.length > 0 && (
                    <div style={{ marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                      {evts.slice(0, 6).map((e) => (
                        <Pastille key={e._id} couleur={couleurValidation(e)} />
                      ))}
                      {evts.length > 6 && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#595959' }}>+{evts.length - 6}</span>
                      )}
                    </div>
                  )
                ) : (
                  <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    {evts.slice(0, maxLignes).map((e) => (
                      <div
                        key={e._id}
                        title={formatTitreEvenement(e.nom)}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', minWidth: 0 }}
                      >
                        <Pastille couleur={couleurValidation(e)} />
                        <span
                          style={{
                            overflow: 'hidden',
                            whiteSpace: 'nowrap',
                            textOverflow: 'ellipsis',
                            fontSize: 11,
                            lineHeight: 1.4,
                            color: '#262626',
                            flex: 1,
                            minWidth: 0,
                          }}
                        >
                          {formatTitreEvenement(e.nom)}
                        </span>
                      </div>
                    ))}
                    {surplus > 0 && (
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#595959' }}>
                        +{surplus} événement{surplus > 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Modal
        open={!!jourSelectionne}
        onCancel={() => setJourSelectionne(null)}
        footer={[
          <Button key="pdf" icon={<FilePdfOutlined />} loading={genererPdfEnCours} onClick={telechargerFichePdf}>
            Télécharger en PDF
          </Button>,
        ]}
        width={mobile ? '94%' : tablette ? '90%' : 720}
        title={
          jourSelectionne
            ? majusculeInitiale(
                jourSelectionne.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              )
            : ''
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '65vh', overflowY: 'auto' }}>
          {evenementsJourOuvert.length === 0 && <Text type="secondary">Aucun événement ce jour.</Text>}
          {evenementsJourOuvert.map((e) => (
            <FicheEvenement
              key={e._id}
              evenement={e}
              estAdministrateur={estAdministrateur}
              onToggleValidation={toggleValidation}
              onValider={validerUnClic}
              onSupprimer={supprimer}
              onChangerDates={changerDates}
            />
          ))}
        </div>
      </Modal>
    </div>
  );
}
