import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Popover,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
  type TableColumnsType,
} from 'antd';
import { CheckOutlined, InboxOutlined, LinkOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api';
import { lancer } from '../lib/actionStock';

const { Text, Paragraph, Title } = Typography;

// --- Types renvoyés par /api/assistant -----------------------------------------------------------

interface Echeance {
  date?: string | null;
  libelle?: string;
}
interface FicheDossier {
  id: string;
  demandeur?: string;
  contacts?: string[];
  resume?: string;
  actions?: string[];
  echeances?: Echeance[];
  vigilance?: string[] | string;
  pieces_jointes?: unknown[];
  budget?: unknown;
  brouillon?: string;
  historique?: unknown[];
  [cle: string]: unknown;
}
interface Dossier {
  code: string;
  evenementCode: string;
  evenementNom: string;
  projetId: string | null;
  branche: string;
  titre: string;
  statut: string;
  priorite: string;
  nombreMails: number;
  donnees: FicheDossier;
  converties: Record<string, { tacheId: string; projetId: string; le: string }>;
}
interface Synthese {
  dernierImport: { genereLe: string; periode: string; par: string; createdAt: string; compte: Record<string, number> } | null;
  joursDepuis: number | null;
  alerte: boolean;
  joursAvantAlerte: number;
  dossiers: number;
  aTraiter: number;
  prioriteHaute: number;
  parStatut: Record<string, number>;
  evenementsSansProjet: number;
  echeancesEnRetard: number;
  echeances: {
    dossier: string;
    titre: string;
    branche: string;
    evenement: string;
    date: string;
    libelle: string;
    convertie: boolean;
    enRetard: boolean;
    avecProjet: boolean;
  }[];
}
interface EvenementAssistant {
  code: string;
  nom: string;
  dateJour: string | null;
  lieu: string;
  projetId: string | null;
  projetTitre: string | null;
  projetDate: string | null;
  nombreDossiers: number;
  proposition: { projetId: string; titre: string; score: number } | null;
}
interface Prestataire {
  nom: string;
  domaine: string;
  donnees: { contacts?: string[]; evenements?: string[]; documents?: string[]; dossiers?: string[]; [cle: string]: unknown };
}
interface Mail {
  _id: string;
  numero: number;
  date: string;
  expediteur: string;
  objet: string;
}

const COULEUR_PRIORITE: Record<string, string> = { Haute: 'red', Normale: 'blue', Basse: 'default' };
const couleurStatut = (s: string) =>
  s === 'À traiter' ? 'orange' : s === 'Clos' ? 'default' : s.startsWith('En attente') ? 'gold' : s === 'Pour information' ? 'cyan' : 'green';
const formatJour = (j?: string | null) => (j ? dayjs(j).format('DD/MM/YYYY') : '—');
const enListe = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : texteDe(x))) : typeof v === 'string' && v ? [v] : [];
/** Rend lisible un élément libre de la fiche (pièce jointe, ligne d'historique, ligne de budget…). */
function texteDe(x: unknown): string {
  if (x === null || x === undefined) return '';
  if (typeof x !== 'object') return String(x);
  const o = x as Record<string, unknown>;
  const euros = (v: unknown) => (typeof v === 'number' ? `${v.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € TTC` : v);
  const champs: [string, (v: unknown) => unknown][] = [
    ['date', (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? formatJour(v) : v)],
    ['type', (v) => v],
    ['libelle', (v) => v],
    ['nom', (v) => v],
    ['titre', (v) => v],
    ['reference', (v) => v],
    ['fournisseur', (v) => v],
    ['de', (v) => v],
    ['objet', (v) => v],
    ['resume', (v) => v],
    ['montant', euros],
    ['montant_ttc', euros],
    ['taille', (v) => (v === '—' ? null : v)],
    ['emplacement', (v) => v],
    ['statut_lecture', (v) => v],
    ['lien', (v) => v],
  ];
  const morceaux = champs
    .map(([k, f]) => (o[k] === undefined || o[k] === null || o[k] === '' ? null : f(o[k])))
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map(String);
  return morceaux.length ? morceaux.join(' · ') : JSON.stringify(o);
}

// --- Page ----------------------------------------------------------------------------------------

/**
 * Onglet Assistant (super-administrateur) : dossiers produits par l'assistant de messagerie du service,
 * reliés aux projets. L'assistant lit Outlook et dépose ici son index à chaque mise à jour.
 */
export default function Assistant() {
  const [onglet, setOnglet] = useState('synthese');
  const [synthese, setSynthese] = useState<Synthese | null>(null);
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [evenements, setEvenements] = useState<EvenementAssistant[]>([]);
  const [projets, setProjets] = useState<{ _id: string; titre: string; dateJour: string }[]>([]);
  const [prestataires, setPrestataires] = useState<Prestataire[]>([]);
  const [ouvert, setOuvert] = useState<string | null>(null);

  const charger = async () => {
    const [s, d, e, p] = await Promise.all([
      api.get<Synthese>('/assistant/synthese'),
      api.get<{ dossiers: Dossier[] }>('/assistant/dossiers'),
      api.get<{ evenements: EvenementAssistant[]; projets: { _id: string; titre: string; dateJour: string }[] }>('/assistant/evenements'),
      api.get<{ prestataires: Prestataire[] }>('/assistant/prestataires'),
    ]);
    setSynthese(s);
    setDossiers(d.dossiers);
    setEvenements(e.evenements);
    setProjets(e.projets);
    setPrestataires(p.prestataires);
  };
  useEffect(() => {
    charger();
  }, []);

  const dossierOuvert = dossiers.find((d) => d.code === ouvert) ?? null;
  const vide = synthese !== null && !synthese.dernierImport;

  return (
    <Card
      title="Assistant de messagerie"
      extra={
        synthese?.dernierImport && (
          <Text type="secondary">
            Mise à jour du {dayjs(synthese.dernierImport.createdAt).format('DD/MM/YYYY à HH:mm')} · {synthese.dernierImport.periode}
          </Text>
        )
      }
    >
      {synthese?.alerte && !vide && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={`Dernière mise à jour il y a ${synthese.joursDepuis} jours : les dossiers ne sont peut-être plus à jour.`}
          description="Demandez à l'assistant « mets à jour l'assistant », puis déposez le nouvel index dans l'onglet Import."
        />
      )}
      {vide && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="Aucun index importé"
          description="Déposez le fichier donnees.json de l'assistant dans l'onglet Import pour commencer."
        />
      )}
      <Tabs
        activeKey={vide ? 'import' : onglet}
        onChange={setOnglet}
        items={[
          { key: 'synthese', label: 'Synthèse', disabled: vide, children: synthese && <OngletSynthese s={synthese} ouvrir={setOuvert} /> },
          {
            key: 'dossiers',
            label: `Dossiers${dossiers.length ? ` (${dossiers.length})` : ''}`,
            disabled: vide,
            children: <OngletDossiers dossiers={dossiers} evenements={evenements} ouvrir={setOuvert} />,
          },
          {
            key: 'evenements',
            label: `Événements et projets${synthese?.evenementsSansProjet ? ` (${synthese.evenementsSansProjet} à rattacher)` : ''}`,
            disabled: vide,
            children: <OngletEvenements evenements={evenements} projets={projets} recharger={charger} />,
          },
          { key: 'prestataires', label: 'Annuaire des prestataires', disabled: vide, children: <OngletPrestataires prestataires={prestataires} /> },
          { key: 'import', label: 'Import', children: <OngletImport apres={charger} dernier={synthese?.dernierImport ?? null} /> },
        ]}
      />
      <FicheDossierDrawer dossier={dossierOuvert} fermer={() => setOuvert(null)} recharger={charger} />
    </Card>
  );
}

// --- Synthèse ------------------------------------------------------------------------------------

function OngletSynthese({ s, ouvrir }: { s: Synthese; ouvrir: (code: string) => void }) {
  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Statistic title="Dossiers" value={s.dossiers} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="À traiter" value={s.aTraiter} valueStyle={s.aTraiter ? { color: '#d46b08' } : undefined} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Priorité haute ouverte" value={s.prioriteHaute} valueStyle={s.prioriteHaute ? { color: '#cf1322' } : undefined} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title="Événements sans projet" value={s.evenementsSansProjet} />
        </Col>
      </Row>
      <div>
        <Title level={5}>Échéances des 14 prochains jours{s.echeancesEnRetard ? `, dont ${s.echeancesEnRetard} dépassée(s)` : ''}</Title>
        {s.echeances.length === 0 ? (
          <Empty description="Aucune échéance proche" />
        ) : (
          <Table
            size="small"
            rowKey={(e) => `${e.dossier}-${e.date}-${e.libelle}`}
            pagination={false}
            dataSource={s.echeances}
            onRow={(e) => ({ onClick: () => ouvrir(e.dossier), style: { cursor: 'pointer' } })}
            columns={[
              { title: 'Date', dataIndex: 'date', width: 110, render: (d: string, e) => <Text type={e.enRetard ? 'danger' : undefined}>{formatJour(d)}</Text> },
              { title: 'Échéance', dataIndex: 'libelle' },
              { title: 'Dossier', dataIndex: 'titre', render: (t: string, e) => `${e.dossier} · ${t}` },
              { title: 'Branche', dataIndex: 'branche', width: 150 },
              {
                title: 'Rétroplanning',
                width: 130,
                render: (_: unknown, e) => (e.convertie ? <Tag color="green">Tâche créée</Tag> : e.avecProjet ? <Tag>À reporter</Tag> : <Tag>Sans projet</Tag>),
              },
            ]}
          />
        )}
      </div>
      <div>
        <Title level={5}>Dossiers par statut</Title>
        <Space wrap>
          {Object.entries(s.parStatut)
            .sort((a, b) => b[1] - a[1])
            .map(([statut, n]) => (
              <Tag key={statut} color={couleurStatut(statut)}>
                {statut} : {n}
              </Tag>
            ))}
        </Space>
      </div>
    </Space>
  );
}

// --- Dossiers ------------------------------------------------------------------------------------

function OngletDossiers({ dossiers, evenements, ouvrir }: { dossiers: Dossier[]; evenements: EvenementAssistant[]; ouvrir: (c: string) => void }) {
  const [recherche, setRecherche] = useState('');
  const [evenement, setEvenement] = useState<string | undefined>();
  const [branche, setBranche] = useState<string | undefined>();
  const [statut, setStatut] = useState<string | undefined>();
  const branches = useMemo(() => [...new Set(dossiers.map((d) => d.branche).filter(Boolean))].sort(), [dossiers]);
  const statuts = useMemo(() => [...new Set(dossiers.map((d) => d.statut).filter(Boolean))].sort(), [dossiers]);
  const r = recherche.trim().toLowerCase();
  const affiches = dossiers.filter(
    (d) =>
      (!evenement || d.evenementCode === evenement) &&
      (!branche || d.branche === branche) &&
      (!statut || d.statut === statut) &&
      (!r || `${d.code} ${d.titre} ${d.donnees.demandeur ?? ''} ${d.donnees.resume ?? ''}`.toLowerCase().includes(r))
  );
  const colonnes: TableColumnsType<Dossier> = [
    { title: 'N°', dataIndex: 'code', width: 70 },
    { title: 'Dossier', dataIndex: 'titre', render: (t: string, d) => <Space direction="vertical" size={0}><Text strong>{t}</Text><Text type="secondary">{d.donnees.demandeur}</Text></Space> },
    { title: 'Événement', dataIndex: 'evenementNom', responsive: ['md'] },
    { title: 'Branche', dataIndex: 'branche', width: 140, responsive: ['lg'] },
    { title: 'Priorité', dataIndex: 'priorite', width: 90, render: (p: string) => <Tag color={COULEUR_PRIORITE[p]}>{p}</Tag> },
    { title: 'Statut', dataIndex: 'statut', width: 170, render: (s: string) => <Tag color={couleurStatut(s)}>{s}</Tag> },
    { title: 'Mails', dataIndex: 'nombreMails', width: 70, align: 'right', responsive: ['lg'] },
  ];
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Space wrap>
        <Input.Search placeholder="Rechercher un dossier, un demandeur…" allowClear onChange={(e) => setRecherche(e.target.value)} style={{ width: 280 }} />
        <Select allowClear placeholder="Événement" style={{ width: 260 }} value={evenement} onChange={setEvenement} options={evenements.map((e) => ({ value: e.code, label: e.nom }))} />
        <Select allowClear placeholder="Branche" style={{ width: 180 }} value={branche} onChange={setBranche} options={branches.map((b) => ({ value: b, label: b }))} />
        <Select allowClear placeholder="Statut" style={{ width: 200 }} value={statut} onChange={setStatut} options={statuts.map((s) => ({ value: s, label: s }))} />
      </Space>
      <Table
        size="small"
        rowKey="code"
        dataSource={affiches}
        columns={colonnes}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        onRow={(d) => ({ onClick: () => ouvrir(d.code), style: { cursor: 'pointer' } })}
      />
    </Space>
  );
}

function FicheDossierDrawer({ dossier, fermer, recharger }: { dossier: Dossier | null; fermer: () => void; recharger: () => void }) {
  const navigate = useNavigate();
  const [mails, setMails] = useState<Mail[]>([]);
  useEffect(() => {
    setMails([]);
    if (dossier) api.get<{ mails: Mail[] }>(`/assistant/dossiers/${dossier.code}/mails`).then((r) => setMails(r.mails));
  }, [dossier?.code]);
  if (!dossier) return null;
  const f = dossier.donnees;

  const versTache = async (type: 'echeance' | 'action', index: number) => {
    if (await lancer(api.post(`/assistant/dossiers/${dossier.code}/tache`, { type, index }))) recharger();
  };
  const boutonTache = (type: 'echeance' | 'action', index: number) =>
    dossier.converties[`${type}:${index}`] ? (
      <Tag icon={<CheckOutlined />} color="green">
        Dans le rétroplanning
      </Tag>
    ) : dossier.projetId ? (
      <Button size="small" icon={<PlusOutlined />} onClick={() => versTache(type, index)}>
        En faire une tâche
      </Button>
    ) : null;

  return (
    <Drawer open width={720} onClose={fermer} title={`${dossier.code} · ${dossier.titre}`}>
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Space wrap>
          <Tag color={couleurStatut(dossier.statut)}>{dossier.statut}</Tag>
          <Tag color={COULEUR_PRIORITE[dossier.priorite]}>Priorité {dossier.priorite.toLowerCase()}</Tag>
          <Tag>{dossier.branche}</Tag>
          {dossier.projetId ? (
            <Button size="small" icon={<LinkOutlined />} onClick={() => navigate(`/projets/${dossier.projetId}`)}>
              Ouvrir le projet
            </Button>
          ) : (
            <Text type="secondary">Événement non rattaché à un projet : les tâches ne peuvent pas encore être créées.</Text>
          )}
        </Space>
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="Événement">{dossier.evenementNom}</Descriptions.Item>
          {f.demandeur && <Descriptions.Item label="Demandeur">{f.demandeur}</Descriptions.Item>}
          {enListe(f.contacts).length > 0 && <Descriptions.Item label="Contacts">{enListe(f.contacts).map((c) => <div key={c}>{c}</div>)}</Descriptions.Item>}
        </Descriptions>
        {f.resume && (
          <div>
            <Title level={5}>Résumé</Title>
            <Paragraph>{f.resume}</Paragraph>
          </div>
        )}
        {(f.echeances ?? []).length > 0 && (
          <div>
            <Title level={5}>Échéances</Title>
            {(f.echeances ?? []).map((e, i) => (
              <Row key={i} gutter={8} align="middle" style={{ marginBottom: 6 }} wrap={false}>
                <Col flex="100px"><Text strong>{formatJour(e.date)}</Text></Col>
                <Col flex="auto">{e.libelle}</Col>
                <Col>{boutonTache('echeance', i)}</Col>
              </Row>
            ))}
          </div>
        )}
        {enListe(f.actions).length > 0 && (
          <div>
            <Title level={5}>Actions</Title>
            {enListe(f.actions).map((a, i) => (
              <Row key={i} gutter={8} align="middle" style={{ marginBottom: 6 }} wrap={false}>
                <Col flex="auto">{a}</Col>
                <Col>{boutonTache('action', i)}</Col>
              </Row>
            ))}
          </div>
        )}
        {enListe(f.vigilance).length > 0 && (
          <Alert type="warning" showIcon message="Points de vigilance" description={<ul style={{ margin: 0, paddingLeft: 18 }}>{enListe(f.vigilance).map((v) => <li key={v}>{v}</li>)}</ul>} />
        )}
        {enListe(f.pieces_jointes).length > 0 && (
          <div>
            <Title level={5}>Pièces jointes</Title>
            <ul style={{ paddingLeft: 18 }}>{enListe(f.pieces_jointes).map((p, i) => <li key={i}>{p}</li>)}</ul>
          </div>
        )}
        {f.budget !== undefined && f.budget !== null && enListe(Array.isArray(f.budget) ? f.budget : [f.budget]).filter(Boolean).length > 0 && (
          <div>
            <Title level={5}>Budget</Title>
            <ul style={{ paddingLeft: 18 }}>{enListe(Array.isArray(f.budget) ? f.budget : [f.budget]).map((b, i) => <li key={i}>{b}</li>)}</ul>
          </div>
        )}
        {f.brouillon && (
          <div>
            <Title level={5}>Brouillon de réponse</Title>
            <Paragraph copyable style={{ whiteSpace: 'pre-wrap', background: '#fafafa', padding: 12, borderRadius: 6 }}>
              {f.brouillon}
            </Paragraph>
          </div>
        )}
        {enListe(f.historique).length > 0 && (
          <div>
            <Title level={5}>Historique</Title>
            <ul style={{ paddingLeft: 18 }}>{enListe(f.historique).map((h, i) => <li key={i}>{h}</li>)}</ul>
          </div>
        )}
        <div>
          <Title level={5}>Mails du dossier ({mails.length})</Title>
          <Table
            size="small"
            rowKey="_id"
            pagination={false}
            dataSource={mails}
            columns={[
              { title: 'Date', dataIndex: 'date', width: 110, render: (d: string) => formatJour(d) },
              { title: 'Expéditeur', dataIndex: 'expediteur', width: 200 },
              { title: 'Objet', dataIndex: 'objet' },
            ]}
          />
        </div>
      </Space>
    </Drawer>
  );
}

// --- Événements et projets -----------------------------------------------------------------------

function OngletEvenements({
  evenements,
  projets,
  recharger,
}: {
  evenements: EvenementAssistant[];
  projets: { _id: string; titre: string; dateJour: string }[];
  recharger: () => void;
}) {
  const navigate = useNavigate();
  const rattacher = async (code: string, projetId: string | null) => {
    if (await lancer(api.put(`/assistant/evenements/${code}/projet`, { projetId }))) recharger();
  };
  const colonnes: TableColumnsType<EvenementAssistant> = [
    { title: 'Événement', dataIndex: 'nom', render: (n: string, e) => <Space direction="vertical" size={0}><Text strong>{n}</Text><Text type="secondary">{e.lieu || 'Lieu à préciser'}</Text></Space> },
    { title: 'Date', dataIndex: 'dateJour', width: 110, render: (d: string | null) => formatJour(d) },
    { title: 'Dossiers', dataIndex: 'nombreDossiers', width: 90, align: 'right' },
    {
      title: 'Projet',
      width: 420,
      render: (_: unknown, e) =>
        e.projetId ? (
          <Space wrap>
            <Button type="link" style={{ padding: 0 }} onClick={() => navigate(`/projets/${e.projetId}`)}>
              {e.projetTitre}
            </Button>
            <Button size="small" type="text" onClick={() => rattacher(e.code, null)}>
              Détacher
            </Button>
          </Space>
        ) : (
          <Space wrap>
            {e.proposition && (
              <Button size="small" type="primary" ghost onClick={() => rattacher(e.code, e.proposition!.projetId)}>
                Rattacher à « {e.proposition.titre} »
              </Button>
            )}
            <Select
              size="small"
              showSearch
              placeholder="Choisir un projet"
              style={{ width: 200 }}
              optionFilterProp="label"
              onChange={(v: string) => rattacher(e.code, v)}
              options={projets.map((p) => ({ value: p._id, label: `${p.titre} (${formatJour(p.dateJour)})` }))}
            />
            <CreerProjet evenement={e} apres={recharger} />
          </Space>
        ),
    },
  ];
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Text type="secondary">
        Rattachez chaque événement de l'assistant à son projet. Le lien est conservé d'une mise à jour à l'autre. Les dossiers rattachés
        peuvent alors verser leurs échéances et actions au rétroplanning.
      </Text>
      <Table size="small" rowKey="code" dataSource={evenements} columns={colonnes} pagination={false} />
    </Space>
  );
}

function CreerProjet({ evenement, apres }: { evenement: EvenementAssistant; apres: () => void }) {
  const [ouvert, setOuvert] = useState(false);
  const [jour, setJour] = useState<Dayjs | null>(evenement.dateJour ? dayjs(evenement.dateJour) : null);
  const [jauge, setJauge] = useState<number | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const creer = async () => {
    setEnvoi(true);
    const ok = await lancer(
      api.post(`/assistant/evenements/${evenement.code}/creer-projet`, { dateJour: jour?.format('YYYY-MM-DD'), jauge: jauge ?? null })
    );
    setEnvoi(false);
    if (ok) {
      setOuvert(false);
      apres();
    }
  };
  return (
    <Popover
      open={ouvert}
      onOpenChange={setOuvert}
      trigger="click"
      title={`Créer le projet « ${evenement.nom} »`}
      content={
        <Space direction="vertical" style={{ width: 280 }}>
          <Text type="secondary">Le rétroplanning est généré d'après la jauge. Le niveau pourra être affiné dans la fiche du projet.</Text>
          <DatePicker value={jour} onChange={setJour} format="DD/MM/YYYY" placeholder="Jour J" style={{ width: '100%' }} />
          <InputNumber value={jauge} onChange={(v) => setJauge(v)} min={0} placeholder="Jauge prévisionnelle (facultatif)" style={{ width: '100%' }} />
          <Button type="primary" block loading={envoi} disabled={!jour} onClick={creer}>
            Créer et rattacher
          </Button>
        </Space>
      }
    >
      <Button size="small" icon={<PlusOutlined />}>
        Créer le projet
      </Button>
    </Popover>
  );
}

// --- Prestataires --------------------------------------------------------------------------------

function OngletPrestataires({ prestataires }: { prestataires: Prestataire[] }) {
  const [recherche, setRecherche] = useState('');
  const r = recherche.trim().toLowerCase();
  const affiches = prestataires.filter((p) => !r || `${p.nom} ${p.domaine} ${enListe(p.donnees.contacts).join(' ')}`.toLowerCase().includes(r));
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Input.Search placeholder="Rechercher un prestataire, un domaine, un contact…" allowClear onChange={(e) => setRecherche(e.target.value)} style={{ width: 320 }} />
      <Table
        size="small"
        rowKey="nom"
        dataSource={affiches}
        pagination={{ pageSize: 25, hideOnSinglePage: true }}
        columns={[
          { title: 'Prestataire', dataIndex: 'nom', render: (n: string, p) => <Space direction="vertical" size={0}><Text strong>{n}</Text><Text type="secondary">{p.domaine}</Text></Space> },
          { title: 'Contacts', render: (_: unknown, p) => enListe(p.donnees.contacts).map((c) => <div key={c}>{c}</div>) },
          { title: 'Devis et commandes', render: (_: unknown, p) => enListe(p.donnees.documents).map((c) => <div key={c}>{c}</div>), responsive: ['md'] },
          { title: 'Dossiers', width: 120, render: (_: unknown, p) => enListe(p.donnees.dossiers).join(', ') },
        ]}
      />
    </Space>
  );
}

// --- Import --------------------------------------------------------------------------------------

function OngletImport({ apres, dernier }: { apres: () => void; dernier: Synthese['dernierImport'] }) {
  const [envoi, setEnvoi] = useState(false);
  const importer = async (fichier: File) => {
    setEnvoi(true);
    try {
      const texte = await fichier.text();
      // donnees.js (« window.DONNEES = {…} ») est accepté comme donnees.json.
      const json = JSON.parse(texte.replace(/^﻿/, '').replace(/^\s*window\.DONNEES\s*=\s*/, '').replace(/;\s*$/, ''));
      if (await lancer(api.post('/assistant/import', json))) apres();
    } catch {
      await lancer(Promise.resolve({ ok: false, message: "Fichier illisible : déposez le donnees.json produit par l'assistant" }));
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', maxWidth: 640 }}>
      <Upload.Dragger
        accept=".json,.js"
        multiple={false}
        showUploadList={false}
        disabled={envoi}
        beforeUpload={(f) => {
          importer(f);
          return false;
        }}
      >
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">Déposez ici le fichier donnees.json de l'assistant</p>
        <p className="ant-upload-hint">Dossier Documents\Evenementiel_Assistant\99_Index. Le nouvel index remplace le précédent.</p>
      </Upload.Dragger>
      <Paragraph type="secondary" style={{ margin: 0 }}>
        Les rattachements aux projets et les tâches déjà créées sont conservés d'un import à l'autre. Un dossier que l'assistant a retiré ou
        fusionné disparaît de l'onglet ; ses tâches restent dans le rétroplanning.
      </Paragraph>
      {dernier && (
        <Descriptions size="small" column={1} bordered title="Dernier import">
          <Descriptions.Item label="Importé le">{dayjs(dernier.createdAt).format('DD/MM/YYYY à HH:mm')} par {dernier.par}</Descriptions.Item>
          <Descriptions.Item label="Produit par l'assistant le">{dernier.genereLe ? dayjs(dernier.genereLe).format('DD/MM/YYYY à HH:mm') : '—'}</Descriptions.Item>
          <Descriptions.Item label="Période">{dernier.periode || '—'}</Descriptions.Item>
          <Descriptions.Item label="Contenu">
            {dernier.compte.evenements} événements, {dernier.compte.dossiers} dossiers, {dernier.compte.mails} mails, {dernier.compte.prestataires} prestataires
          </Descriptions.Item>
        </Descriptions>
      )}
    </Space>
  );
}
