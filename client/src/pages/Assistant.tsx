import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, DatePicker, Drawer, InputNumber, Popconfirm, Popover, Select, Space, Typography, Upload, message } from 'antd';
import { CheckOutlined, InboxOutlined, PlusOutlined, SyncOutlined } from '@ant-design/icons';
import dayjs, { type Dayjs } from 'dayjs';
import { api } from '../api';
import { lancer } from '../lib/actionStock';

const { Paragraph, Text } = Typography;

// --- Données renvoyées par /api/assistant/index ---------------------------------------------------

interface Echeance {
  date?: string | null;
  libelle?: string;
}
interface PieceJointe {
  nom?: string;
  type?: string;
  taille?: string;
  emplacement?: string;
  fichierId?: string;
  /** Rangée dans OneDrive : lien vers le fichier, ou true. */
  onedrive?: string | boolean;
}
interface LigneBudget {
  type?: string;
  reference?: string;
  fournisseur?: string;
  montant_ttc?: number | null;
  statut_lecture?: string;
}
interface Fiche {
  id: string;
  evenement: string;
  branche: string;
  titre: string;
  demandeur?: string;
  contacts?: string[];
  statut: string;
  priorite: string;
  echeances?: Echeance[];
  resume?: string;
  actions?: string[];
  vigilance?: string[];
  pieces_jointes?: PieceJointe[];
  budget?: LigneBudget[];
  mails?: number[];
  brouillon?: string | null;
  /** Date de la dernière analyse complète. */
  analyse?: string;
  /** Consignes écrites au-dessus des mails (mise à jour automatique). */
  remarques?: string[];
  origine?: string;
  dernier_mail?: string;
}
interface Corrections {
  statut?: string;
  note?: string;
  maj?: string;
  par?: string;
}
interface Dossier {
  code: string;
  /** 'index' : fiche de l'assistant ; 'releve' : dossier ouvert par la mise à jour automatique (M001…). */
  source: string;
  donnees: Fiche;
  converties: Record<string, { tacheId: string; projetId: string }>;
  corrections: Corrections;
}
interface Evenement {
  code: string;
  nom: string;
  dateJour: string | null;
  lieu: string;
  projetId: string | null;
  projetTitre: string | null;
  proposition: { projetId: string; titre: string } | null;
  /** Dossier OneDrive des pièces jointes (Mes fichiers → Assistant → …) ; vide = nom court de l'événement. */
  dossierOnedrive: string;
}
interface Mail {
  _id: string;
  numero: number;
  date: string;
  expediteur: string;
  objet: string;
  dossierCode: string;
  source: 'index' | 'releve';
  sens: string;
  destinataires: string;
  consigne: string;
  piecesJointes: { nom: string; type: string; taille: number; fichierId?: string; onedrive?: { chemin: string; lien?: string } }[];
  classement: string;
}
interface Releve {
  _id: string;
  debut: string;
  fin: string | null;
  lus: number;
  nouveaux: number;
  doublons: number;
  dossiersCrees: number;
  ignores: number;
  analyses: number;
  pieces?: number;
  deplaces?: number;
  erreur: string;
  par: string;
}
interface EtatReleve {
  /** Dernière lecture d'Outlook déposée dans l'application. */
  derniereLectureOutlook: string | null;
  /** Réglages de la lecture d'Outlook et lancement demandé. */
  outlook: ReglagesOutlook;
  prochainPassage: string;
  derniers: Releve[];
}
interface Prestataire {
  nom: string;
  domaine: string;
  donnees: { contacts?: string[]; evenements?: string[]; documents?: string[]; dossiers?: string[] };
}
interface Index {
  dernierImport: { genereLe: string; periode: string; par: string; createdAt: string; compte: Record<string, number> } | null;
  releve: EtatReleve;
  branches: string[];
  joursAvantAlerte: number;
  evenements: Evenement[];
  dossiers: Dossier[];
  mails: Mail[];
  prestataires: Prestataire[];
  projets: { _id: string; titre: string; dateJour: string }[];
}

// --- Règles d'affichage reprises de l'application d'origine ----------------------------------------

const STATUTS = [
  'À traiter',
  'En attente de réponse',
  'En attente de validation',
  'En cours',
  'Rendez-vous fixé',
  'Bon de commande émis',
  'Bon de commande transmis au fournisseur',
  'Répondu',
  'Validé',
  'Validé – consultation lancée',
  'Pour information',
  'Clos',
];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const aujourdhui = () => dayjs().startOf('day');
const jours = (date: string) => dayjs(date.slice(0, 10)).diff(aujourdhui(), 'day');
const fdate = (s?: string | null) => (s ? dayjs(s.slice(0, 10)).format('DD/MM/YYYY') : '—');
const classeStatut = (s: string) =>
  /traiter/.test(s) ? 'st-todo' : /attente/i.test(s) ? 'st-wait' : /information/.test(s) ? 'st-info' : /Clos|Répondu|Validé/.test(s) ? 'st-done' : 'st-run';
const statutOuvert = (s: string) => !/Clos|information/.test(s);
const euros = (v?: number | null) => (v === null || v === undefined ? '—' : v.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }).replace(/\u202f/g, '\u00a0'));
const statutDe = (d: Dossier) => d.corrections.statut ?? d.donnees.statut;
const SANS_EVENEMENT = '';
const MOTIFS: Record<string, string> = {
  consigne: 'classé par votre consigne',
  fil: 'même conversation',
  expediteur: 'expéditeur connu du dossier',
  evenement: "événement cité dans le mail",
  nouveau: 'nouveau dossier, à classer',
  analyse: "classé par l'analyse",
  manuel: 'déplacé à la main',
};
const recent = (f: Fiche) => !!f.dernier_mail && dayjs().diff(dayjs(f.dernier_mail.replace(' ', 'T')), 'hour') < 48;
const ko = (o: number) => (o >= 1_048_576 ? `${(o / 1_048_576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const prochaineEcheance = (f: Fiche) =>
  (f.echeances ?? []).filter((e) => e.date && jours(e.date) >= 0).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))[0];
const delai = (date: string) => {
  const n = jours(date);
  return n < 0 ? `J+${-n}` : `J-${n}`;
};

type Vue = 'dossiers' | 'echeances' | 'budget' | 'mails' | 'annuaire' | 'projets';
const ONGLETS: [Vue, string][] = [
  ['dossiers', 'Dossiers'],
  ['echeances', 'Échéances'],
  ['budget', 'Suivi budgétaire'],
  ['mails', 'Registre des mails'],
  ['annuaire', 'Annuaire prestataires'],
  ['projets', 'Rattachement aux projets'],
];

/**
 * Onglet Assistant (super-administrateur). Reprend la présentation de l'application d'origine de l'assistant
 * de messagerie, avec en plus le lien aux projets : rattachement, création, échéances et actions versées au
 * rétroplanning. Les statuts corrigés et les notes sont enregistrés sur le serveur.
 */
export default function Assistant() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<Index | null>(null);
  const [vue, setVue] = useState<Vue>('dossiers');
  const [q, setQ] = useState('');
  const [fMois, setFMois] = useState('');
  const [fEv, setFEv] = useState('');
  const [fBr, setFBr] = useState('');
  const [fSt, setFSt] = useState('');
  const [fVig, setFVig] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [miseAJour, setMiseAJour] = useState(false);
  const [releveEnCours, setReleveEnCours] = useState(false);

  const charger = () => api.get<Index>('/assistant/index').then(setIndex);
  const [parametres, setParametres] = useSearchParams();
  useEffect(() => {
    // Lien depuis l'accueil ou une fiche projet : /admin/assistant?dossier=D12
    const d = parametres.get('dossier');
    if (d) {
      setOuvert(d);
      parametres.delete('dossier');
      setParametres(parametres, { replace: true });
    }
    charger();
  }, []);

  const mailParNumero = useMemo(() => new Map((index?.mails ?? []).map((m) => [m.numero, m])), [index]);
  const branches = useMemo(
    () => [...new Set([...(index?.branches ?? []), ...(index?.dossiers ?? []).map((d) => d.donnees.branche)].filter(Boolean))],
    [index]
  );
  const mois = useMemo(
    () => [...new Set((index?.mails ?? []).map((m) => m.date.slice(0, 7)).filter((k) => /^\d{4}-\d{2}$/.test(k)))].sort().reverse(),
    [index]
  );

  const filtres = useMemo(() => {
    if (!index) return [];
    const r = q.trim().toLowerCase();
    return index.dossiers.filter((d) => {
      const f = d.donnees;
      return (
        (!fMois || (f.mails ?? []).some((n) => mailParNumero.get(n)?.date.slice(0, 7) === fMois)) &&
        (!fEv || f.evenement === fEv) &&
        (!fBr || f.branche === fBr) &&
        (!fSt || statutDe(d) === fSt) &&
        (!fVig || (f.vigilance ?? []).length > 0) &&
        (!r || JSON.stringify(f).toLowerCase().includes(r) || (d.corrections.note ?? '').toLowerCase().includes(r))
      );
    });
  }, [index, q, fMois, fEv, fBr, fSt, fVig, mailParNumero]);

  if (!index) return <div style={{ padding: 24, color: '#5f6b73' }}>Chargement…</div>;

  const ev = (code: string) => index.evenements.find((e) => e.code === code);
  const dernier = index.dernierImport;
  const releve = index.releve;
  const o = releve.outlook;
  // Fraîcheur : dernière lecture d'Outlook, sinon dernier import d'index.
  const reference = releve.derniereLectureOutlook ?? dernier?.createdAt;
  const age = reference ? aujourdhui().diff(dayjs(reference).startOf('day'), 'day') : null;
  const releverMaintenant = async () => {
    setReleveEnCours(true);
    try {
      if (await lancer(api.post('/assistant/outlook/demande', {}))) await charger();
    } finally {
      setReleveEnCours(false);
    }
  };
  const ouverts = index.dossiers.filter((d) => statutOuvert(statutDe(d)));
  const aTraiter = index.dossiers.filter((d) => /traiter/.test(statutDe(d)));
  const semaine = index.dossiers.flatMap((d) => (d.donnees.echeances ?? []).filter((e) => e.date && jours(e.date) >= 0 && jours(e.date) <= 7));
  const vigilance = index.dossiers.filter((d) => (d.donnees.vigilance ?? []).length > 0);
  const kpi = (k: 'all' | 'todo' | 'week' | 'vig') => {
    setFSt(k === 'todo' ? 'À traiter' : '');
    setFVig(k === 'vig');
    setVue(k === 'week' ? 'echeances' : 'dossiers');
  };
  const dossierOuvert = index.dossiers.find((d) => d.code === ouvert) ?? null;
  const nbCorrections = index.dossiers.filter((d) => d.corrections.statut || d.corrections.note).length;
  const sansProjet = index.evenements.filter((e) => !e.projetId).length;

  const exporterCorrections = () => {
    window.location.href = '/api/assistant/corrections/export';
  };

  return (
    <div className="asst">
      <style>{CSS}</style>
      <header>
        <div>
          <h1>Service événementiel – Gestion des dossiers</h1>
          <div className="sub">
            {releve.derniereLectureOutlook
              ? `Dernière mise à jour le ${dayjs(releve.derniereLectureOutlook).format('DD/MM/YYYY à HH:mm')}`
              : dernier
                ? `${dernier.periode} · dernière mise à jour le ${dayjs(dernier.createdAt).format('DD/MM/YYYY à HH:mm')}`
                : 'Aucune mise à jour pour l’instant'}
            {o.demandeLe ? ` · mise à jour demandée, démarre vers ${dayjs(releve.prochainPassage).format('HH:mm')}` : ''}{' '}
            · <button className="lien clair" onClick={() => setMiseAJour(true)}>état et réglages</button>
          </div>
        </div>
        <div className="kpis">
          <div className="kpi" onClick={() => kpi('all')}>
            <b>{ouverts.length}</b>
            <span>dossiers ouverts</span>
          </div>
          <div className="kpi alert" onClick={() => kpi('todo')}>
            <b>{aTraiter.length}</b>
            <span>à traiter</span>
          </div>
          <div className="kpi" onClick={() => kpi('week')}>
            <b>{semaine.length}</b>
            <span>échéances à 7 jours</span>
          </div>
          <div className="kpi" onClick={() => kpi('vig')}>
            <b>{vigilance.length}</b>
            <span>points de vigilance</span>
          </div>
          <button className="maj" onClick={releverMaintenant} disabled={releveEnCours || !!o.demandeLe}>
            <SyncOutlined spin={releveEnCours || !!o.demandeLe} /> {o.demandeLe ? 'Mise à jour demandée' : "Mettre à jour l'assistant"}
          </button>
        </div>
      </header>
      {age !== null && age > index.joursAvantAlerte && (
        <div className="stale">
          Dernière mise à jour il y a {age} jours : les dossiers ne sont peut-être plus à jour. Vérifiez que le poste du chef de service est allumé, avec
          Chrome ouvert, ou cliquez sur « Mettre à jour l'assistant ».
        </div>
      )}
      <nav>
        {ONGLETS.map(([v, l]) => (
          <button key={v} className={vue === v ? 'on' : ''} onClick={() => setVue(v)}>
            {l}
            {v === 'projets' && sansProjet ? ` (${sansProjet})` : ''}
          </button>
        ))}
      </nav>
      {vue !== 'projets' && (
        <div className="filters">
          <input type="search" placeholder="Rechercher (titre, contact, mot-clé…)" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={fMois} onChange={(e) => setFMois(e.target.value)}>
            <option value="">Tous les mois</option>
            {mois.map((k) => (
              <option key={k} value={k}>
                {MOIS[Number(k.slice(5, 7)) - 1]} {k.slice(0, 4)}
              </option>
            ))}
          </select>
          <select value={fEv} onChange={(e) => setFEv(e.target.value)}>
            <option value="">Tous les événements</option>
            {index.evenements.map((e) => (
              <option key={e.code} value={e.code}>
                {e.nom}
              </option>
            ))}
          </select>
          <select value={fBr} onChange={(e) => setFBr(e.target.value)}>
            <option value="">Toutes les branches</option>
            {branches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select value={fSt} onChange={(e) => setFSt(e.target.value)}>
            <option value="">Tous les statuts</option>
            {STATUTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="row muted">
            <input type="checkbox" checked={fVig} onChange={(e) => setFVig(e.target.checked)} /> Avec point de vigilance
          </label>
          <span style={{ marginLeft: 'auto' }} />
          <button className="btn" onClick={exporterCorrections} title="Vos statuts et notes, dans un fichier à transmettre à l'assistant">
            Exporter mes corrections{nbCorrections ? ` (${nbCorrections})` : ''}
          </button>
        </div>
      )}
      <main>
        {vue === 'dossiers' && <VueDossiers dossiers={filtres} index={index} ouvrir={setOuvert} />}
        {vue === 'echeances' && <VueEcheances dossiers={filtres} ev={ev} ouvrir={setOuvert} />}
        {vue === 'budget' && <VueBudget dossiers={filtres} ev={ev} ouvrir={setOuvert} />}
        {vue === 'mails' && <VueMails dossiers={filtres} mails={index.mails} ev={ev} ouvrir={setOuvert} recharger={charger} />}
        {vue === 'annuaire' && <VueAnnuaire dossiers={filtres} prestataires={index.prestataires} q={q} ev={ev} ouvrir={setOuvert} />}
        {vue === 'projets' && <VueProjets index={index} recharger={charger} ouvrirProjet={(id) => navigate(`/projets/${id}`)} />}
      </main>
      <footer>
        {index.dossiers.length} dossiers, {index.mails.length} mails au registre. Une consigne écrite au-dessus d'un mail (« #feerique
        #logistique », « #D12 », « #urgent ») force son classement. Statuts et notes sont enregistrés dans l'application.
      </footer>
      <FicheDossier
        dossier={dossierOuvert}
        evenement={dossierOuvert ? ev(dossierOuvert.donnees.evenement) : undefined}
        mails={(dossierOuvert?.donnees.mails ?? []).map((n) => mailParNumero.get(n)).filter((m): m is Mail => !!m)}
        index={index}
        fermer={() => setOuvert(null)}
        recharger={charger}
        ouvrirProjet={(id) => navigate(`/projets/${id}`)}
      />
      <PanneauMiseAJour
        ouvert={miseAJour}
        fermer={() => setMiseAJour(false)}
        releve={releve}
        relever={releverMaintenant}
        releveEnCours={releveEnCours}
        dernier={dernier}
        nbCorrections={nbCorrections}
        exporter={exporterCorrections}
        apres={() => {
          setMiseAJour(false);
          charger();
        }}
      />
    </div>
  );
}

// --- Vues ----------------------------------------------------------------------------------------

function Carte({ d, ouvrir }: { d: Dossier; ouvrir: (c: string) => void }) {
  const f = d.donnees;
  const s = statutDe(d);
  const n = prochaineEcheance(f);
  const nbMails = (f.mails ?? []).length;
  const nbTaches = Object.keys(d.converties).length;
  return (
    <div className={`card p-${f.priorite}`} onClick={() => ouvrir(d.code)}>
      <div className="meta">
        <span className="tag">{f.branche || 'Branche à préciser'}</span>
        <span className={`tag st ${classeStatut(s)}`}>{s}</span>
        <span>
          {d.code} · {nbMails} mail{nbMails > 1 ? 's' : ''}
        </span>
        {nbTaches > 0 && <span className="tag st-done">{nbTaches} au rétroplanning</span>}
        {recent(f) && <span className="tag neuf">nouveau mail</span>}
      </div>
      <h3>{f.titre}</h3>
      <div className="meta">{f.demandeur}</div>
      {n?.date && (
        <div className="next">
          <b>{fdate(n.date)}</b> ({delai(n.date)}) – {n.libelle}
        </div>
      )}
      {(f.vigilance ?? []).length > 0 && <div className="warn">⚠ {f.vigilance![0]}</div>}
      {d.corrections.note && <div className="note-carte">✎ {d.corrections.note}</div>}
      {!d.corrections.note && (f.remarques ?? []).length > 0 && <div className="note-carte">✎ {f.remarques![f.remarques!.length - 1]}</div>}
    </div>
  );
}

function VueDossiers({ dossiers, index, ouvrir }: { dossiers: Dossier[]; index: Index; ouvrir: (c: string) => void }) {
  if (!dossiers.length) return <div className="empty">Aucun dossier ne correspond aux filtres.</div>;
  const parEv = new Map<string, Dossier[]>();
  dossiers.forEach((d) => parEv.set(d.donnees.evenement, [...(parEv.get(d.donnees.evenement) ?? []), d]));
  // Événements à venir d'abord (du plus proche au plus lointain), puis sans date, puis passés.
  const rang = (e: Evenement) => (!e.dateJour ? 1 : jours(e.dateJour) >= 0 ? 0 : 2);
  const tries = [...index.evenements].sort((a, b) => rang(a) - rang(b) || (rang(a) === 2 ? -1 : 1) * (a.dateJour ?? '').localeCompare(b.dateJour ?? ''));
  const ordre = [
    SANS_EVENEMENT,
    ...tries.map((e) => e.code),
    ...[...parEv.keys()].filter((k) => k !== SANS_EVENEMENT && !index.evenements.some((e) => e.code === k)),
  ];
  return (
    <>
      {ordre
        .filter((code) => parEv.has(code))
        .map((code) => {
          const e = index.evenements.find((x) => x.code === code);
          const items = parEv.get(code)!.sort((a, b) => (a.donnees.priorite === 'Haute' ? 0 : 1) - (b.donnees.priorite === 'Haute' ? 0 : 1));
          return (
            <div key={code}>
              <div className={`group${code === SANS_EVENEMENT ? ' a-classer' : ''}`}>
                <h2>{code === SANS_EVENEMENT ? 'À classer – sans événement' : (e?.nom ?? code)}</h2>
                <small>
                  {e?.dateJour ? fdate(e.dateJour) : ''}
                  {e?.lieu ? ` · ${e.lieu}` : ''} · {items.length} dossier{items.length > 1 ? 's' : ''}
                  {e?.projetTitre ? ` · projet : ${e.projetTitre}` : ''}
                </small>
              </div>
              <div className="grid">
                {items.map((d) => (
                  <Carte key={d.code} d={d} ouvrir={ouvrir} />
                ))}
              </div>
            </div>
          );
        })}
    </>
  );
}

function VueEcheances({ dossiers, ev, ouvrir }: { dossiers: Dossier[]; ev: (c: string) => Evenement | undefined; ouvrir: (c: string) => void }) {
  const lignes = dossiers
    .flatMap((d) => (d.donnees.echeances ?? []).filter((e) => e.date).map((e) => ({ ...e, d })))
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  if (!lignes.length) return <div className="empty">Aucune échéance.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Délai</th>
          <th>Échéance</th>
          <th>Dossier</th>
          <th>Événement</th>
          <th>Statut</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((r, i) => {
          const n = jours(r.date!);
          const s = statutDe(r.d);
          return (
            <tr key={i} className={`click ${n < 0 ? 'late' : n <= 7 ? 'soon' : ''}`} onClick={() => ouvrir(r.d.code)}>
              <td>{fdate(r.date)}</td>
              <td>{n < 0 ? 'passée' : n === 0 ? "aujourd'hui" : `J-${n}`}</td>
              <td>{r.libelle}</td>
              <td>{r.d.donnees.titre}</td>
              <td>{ev(r.d.donnees.evenement)?.nom ?? r.d.donnees.evenement}</td>
              <td>
                <span className={`tag ${classeStatut(s)}`}>{s}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

type LigneBudgetDossier = LigneBudget & { d: Dossier };

function VueBudget({ dossiers, ev, ouvrir }: { dossiers: Dossier[]; ev: (c: string) => Evenement | undefined; ouvrir: (c: string) => void }) {
  const lignes: LigneBudgetDossier[] = dossiers.flatMap((d) => (d.donnees.budget ?? []).map((b) => ({ ...b, d })));
  const lus = lignes.filter((r) => typeof r.montant_ttc === 'number');
  const somme = (arr: LigneBudgetDossier[]) => arr.reduce((a, r) => a + (r.montant_ttc ?? 0), 0);
  const grouper = (cle: (r: LigneBudgetDossier) => string): [string, LigneBudgetDossier[]][] => {
    const m = new Map<string, LigneBudgetDossier[]>();
    lignes.forEach((r) => m.set(cle(r), [...(m.get(cle(r)) ?? []), r]));
    return [...m.entries()];
  };
  const tableauCumul = (titre: string, colonne: string, entrees: [string, LigneBudgetDossier[]][]) => (
    <>
      <h3 className="h3">{titre}</h3>
      <table>
        <thead>
          <tr>
            <th>{colonne}</th>
            <th>Documents</th>
            <th>Montant lu (TTC)</th>
          </tr>
        </thead>
        <tbody>
          {entrees.length ? (
            entrees.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v.length}</td>
                <td>{euros(somme(v))}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="empty">
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
  return (
    <>
      <div className="note">
        Le cumul ne compte que les montants effectivement lus. {lignes.length - lus.length} document(s) sur {lignes.length} restent à lire
        (pièce jointe non encore consultée ou montant absent du mail).
      </div>
      <div className="totals">
        <div className="tot">
          <b>{euros(somme(lus))}</b>Total lu (TTC)
        </div>
        <div className="tot">
          <b>{lignes.length}</b>documents financiers détectés
        </div>
        <div className="tot">
          <b>{lignes.filter((r) => /commande/i.test(r.type ?? '')).length}</b>bon(s) de commande
        </div>
      </div>
      {tableauCumul('Cumul par événement', 'Événement', grouper((r) => ev(r.d.donnees.evenement)?.nom ?? r.d.donnees.evenement))}
      {tableauCumul('Cumul par branche', 'Branche', grouper((r) => r.d.donnees.branche))}
      <h3 className="h3">Détail des documents</h3>
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Référence</th>
            <th>Fournisseur</th>
            <th>Dossier</th>
            <th>Montant TTC</th>
            <th>Lecture</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((r, i) => (
            <tr key={i} className="click" onClick={() => ouvrir(r.d.code)}>
              <td>{r.type}</td>
              <td>{r.reference}</td>
              <td>{r.fournisseur}</td>
              <td>{r.d.donnees.titre}</td>
              <td>{euros(r.montant_ttc)}</td>
              <td>{r.statut_lecture}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function VueMails({
  dossiers,
  mails,
  ev,
  ouvrir,
  recharger,
}: {
  dossiers: Dossier[];
  mails: Mail[];
  ev: (c: string) => Evenement | undefined;
  ouvrir: (c: string) => void;
  recharger: () => Promise<unknown>;
}) {
  const [choisis, setChoisis] = useState<Set<string>>(new Set());
  const parCode = new Map(dossiers.map((d) => [d.code, d]));
  const lignes = mails.filter((m) => parCode.has(m.dossierCode)).sort((a, b) => b.date.localeCompare(a.date));
  if (!lignes.length) return <div className="empty">Aucun mail.</div>;
  const basculer = (id: string) =>
    setChoisis((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const tous = lignes.every((m) => choisis.has(m._id));
  const supprimer = async () => {
    if (await lancer(api.post('/assistant/mails/supprimer', { ids: [...choisis] }))) {
      setChoisis(new Set());
      recharger();
    }
  };
  return (
    <>
      <div className="row" style={{ margin: '4px 0 10px', minHeight: 32 }}>
        {choisis.size > 0 ? (
          <>
            <span>{choisis.size} mail{choisis.size > 1 ? 's' : ''} sélectionné{choisis.size > 1 ? 's' : ''}</span>
            <Popconfirm
              title="Supprimer ces mails du registre ?"
              description="Ils ne reviendront pas, même transférés à nouveau. Un dossier ouvert automatiquement qui n'a plus de mail est retiré."
              okText="Supprimer"
              cancelText="Annuler"
              okButtonProps={{ danger: true }}
              onConfirm={supprimer}
            >
              <Button danger size="small">
                Supprimer la sélection
              </Button>
            </Popconfirm>
            <button className="lien" onClick={() => setChoisis(new Set())}>
              annuler la sélection
            </button>
          </>
        ) : (
          <span className="muted petit">Cochez des mails pour les supprimer du registre.</span>
        )}
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ width: 28 }}>
              <input
                type="checkbox"
                aria-label="Tout sélectionner"
                checked={tous}
                onChange={() => setChoisis(tous ? new Set() : new Set(lignes.map((m) => m._id)))}
              />
            </th>
            <th>Date</th>
            <th></th>
            <th>Expéditeur</th>
            <th>Objet</th>
            <th>Dossier</th>
            <th>Événement</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((m) => {
            const d = parCode.get(m.dossierCode)!;
            return (
              <tr key={m._id ?? m.numero} className={`click${choisis.has(m._id) ? ' choisi' : ''}`} onClick={() => ouvrir(d.code)}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label="Sélectionner" checked={choisis.has(m._id)} onChange={() => basculer(m._id)} />
                </td>
                <td>
                  {fdate(m.date)} {m.date.slice(11, 16)}
                </td>
                <td title={m.sens === 'envoyé' ? 'Envoyé par le service' : m.sens === 'reçu' ? 'Reçu' : ''}>
                  {m.sens === 'envoyé' ? '↗' : m.sens === 'reçu' ? '↘' : ''}
                </td>
                <td>{m.expediteur}</td>
                <td>{m.objet}</td>
                <td>{d.code}</td>
                <td>{ev(d.donnees.evenement)?.nom ?? d.donnees.evenement}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

function VueAnnuaire({
  dossiers,
  prestataires,
  q,
  ev,
  ouvrir,
}: {
  dossiers: Dossier[];
  prestataires: Prestataire[];
  q: string;
  ev: (c: string) => Evenement | undefined;
  ouvrir: (c: string) => void;
}) {
  const codes = new Set(dossiers.map((d) => d.code));
  const r = q.trim().toLowerCase();
  const lignes = prestataires.filter(
    (p) =>
      (!r || JSON.stringify(p).toLowerCase().includes(r)) &&
      (!(p.donnees.dossiers ?? []).length || (p.donnees.dossiers ?? []).some((x) => codes.has(x)))
  );
  if (!lignes.length) return <div className="empty">Aucun prestataire ne correspond.</div>;
  return (
    <table>
      <thead>
        <tr>
          <th>Prestataire</th>
          <th>Domaine</th>
          <th>Contacts</th>
          <th>Événements</th>
          <th>Documents</th>
          <th>Dossiers</th>
        </tr>
      </thead>
      <tbody>
        {lignes.map((p) => (
          <tr key={p.nom}>
            <td>
              <b>{p.nom}</b>
            </td>
            <td>{p.domaine}</td>
            <td>{(p.donnees.contacts ?? []).join(', ')}</td>
            <td>{(p.donnees.evenements ?? []).map((e) => ev(e)?.nom ?? e).join(' ; ')}</td>
            <td>{(p.donnees.documents ?? []).join(' ; ')}</td>
            <td>
              {(p.donnees.dossiers ?? []).map((x) => (
                <a
                  key={x}
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    ouvrir(x);
                  }}
                  style={{ marginRight: 6 }}
                >
                  {x}
                </a>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VueProjets({ index, recharger, ouvrirProjet }: { index: Index; recharger: () => void; ouvrirProjet: (id: string) => void }) {
  const rattacher = async (code: string, projetId: string | null) => {
    if (await lancer(api.put(`/assistant/evenements/${code}/projet`, { projetId }))) recharger();
  };
  const nbDossiers = (code: string) => index.dossiers.filter((d) => d.donnees.evenement === code).length;
  return (
    <>
      <div className="note">
        Rattachez chaque événement de l'assistant à son projet. Le lien est conservé d'une mise à jour à l'autre. Les dossiers rattachés
        peuvent alors verser leurs échéances et actions au rétroplanning du projet.
      </div>
      <table>
        <thead>
          <tr>
            <th>Événement</th>
            <th>Date</th>
            <th>Dossiers</th>
            <th>Projet</th>
            <th title="OneDrive : Mes fichiers → Assistant → … ; Outlook : sous-dossier du dossier de rangement">Dossier OneDrive et Outlook</th>
          </tr>
        </thead>
        <tbody>
          {index.evenements.map((e) => (
            <tr key={e.code}>
              <td>
                <b>{e.nom}</b>
                <div className="muted">{e.lieu || 'Lieu à préciser'}</div>
              </td>
              <td>{fdate(e.dateJour)}</td>
              <td>{nbDossiers(e.code)}</td>
              <td>
                {e.projetId ? (
                  <Space wrap>
                    <a
                      href="#"
                      onClick={(x) => {
                        x.preventDefault();
                        ouvrirProjet(e.projetId!);
                      }}
                    >
                      {e.projetTitre}
                    </a>
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
                      style={{ width: 220 }}
                      optionFilterProp="label"
                      onChange={(v: string) => rattacher(e.code, v)}
                      options={index.projets.map((p) => ({ value: p._id, label: `${p.titre} (${fdate(p.dateJour)})` }))}
                    />
                    <CreerProjet evenement={e} apres={recharger} />
                  </Space>
                )}
              </td>
              <td>
                <input
                  className="champ-od"
                  defaultValue={e.dossierOnedrive}
                  placeholder={e.nom.split(/\s+[–—-]\s+/)[0]}
                  onBlur={async (x) => {
                    const v = x.target.value.trim();
                    if (v !== (e.dossierOnedrive ?? '')) {
                      if (await lancer(api.put(`/assistant/evenements/${e.code}/onedrive`, { dossier: v }))) recharger();
                    }
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function CreerProjet({ evenement, apres }: { evenement: Evenement; apres: () => void }) {
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

// --- Fiche d'un dossier ----------------------------------------------------------------------------

function FicheDossier({
  dossier,
  evenement,
  mails,
  index,
  fermer,
  recharger,
  ouvrirProjet,
}: {
  dossier: Dossier | null;
  evenement?: Evenement;
  mails: Mail[];
  index: Index;
  fermer: () => void;
  recharger: () => Promise<unknown>;
  ouvrirProjet: (id: string) => void;
}) {
  const [note, setNote] = useState('');
  useEffect(() => setNote(dossier?.corrections.note ?? ''), [dossier?.code]);
  if (!dossier) return null;
  const f = dossier.donnees;
  const s = statutDe(dossier);

  const corriger = async (corps: { statut?: string | null; note?: string }) => {
    const res = await api.put<{ ok: boolean; message: string }>(`/assistant/dossiers/${dossier.code}/correction`, corps);
    if (!res.ok) message.error(res.message);
    await recharger();
  };
  const reclasser = async (corps: { evenement?: string; branche?: string; priorite?: string }) => {
    if (await lancer(api.put(`/assistant/dossiers/${dossier.code}/classement`, corps))) recharger();
  };
  const versTache = async (type: 'echeance' | 'action', i: number) => {
    if (await lancer(api.post(`/assistant/dossiers/${dossier.code}/tache`, { type, index: i }))) recharger();
  };
  const boutonTache = (type: 'echeance' | 'action', i: number) =>
    dossier.converties[`${type}:${i}`] ? (
      <span className="tag st-done">
        <CheckOutlined /> au rétroplanning
      </span>
    ) : evenement?.projetId ? (
      <button className="lien" onClick={() => versTache(type, i)}>
        + en faire une tâche
      </button>
    ) : null;
  const liste = (items: string[]) =>
    items.length ? (
      <ul>
        {items.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
    ) : (
      <span className="muted">—</span>
    );

  return (
    <Drawer open width={640} onClose={fermer} closable={false} styles={{ body: { padding: 0 } }}>
      <div className="asst fiche">
        <style>{CSS}</style>
        <button className="close" aria-label="Fermer" onClick={fermer}>
          ×
        </button>
        <div className="meta">
          <span className="tag">{f.branche || 'Branche à préciser'}</span>
          <span>{dossier.code}</span>
          <span>Priorité {f.priorite.toLowerCase()}</span>
          {dossier.source === 'releve' && <span>· ouvert automatiquement</span>}
        </div>
        <h2>{f.titre}</h2>
        <div className="meta">
          {evenement?.nom ?? (f.evenement || 'Sans événement')}
          {evenement?.dateJour ? ` · ${fdate(evenement.dateJour)}` : ''}
        </div>
        <h4>Classement</h4>
        <div className="row classement">
          <select value={f.evenement} onChange={(e) => reclasser({ evenement: e.target.value })} aria-label="Événement">
            <option value="">— sans événement —</option>
            {index.evenements.map((e) => (
              <option key={e.code} value={e.code}>
                {e.nom}
              </option>
            ))}
          </select>
          <select value={f.branche} onChange={(e) => reclasser({ branche: e.target.value })} aria-label="Branche">
            <option value="">— branche —</option>
            {[...new Set([...index.branches, f.branche].filter(Boolean))].map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <select value={f.priorite} onChange={(e) => reclasser({ priorite: e.target.value })} aria-label="Priorité">
            {['Haute', 'Normale', 'Basse'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </div>
        {dossier.source === 'index' && (
          <div className="muted petit">Fiche de l'assistant : un nouvel import d'index réécrira ce classement.</div>
        )}
        <h4>Projet</h4>
        {evenement?.projetId ? (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              ouvrirProjet(evenement.projetId!);
            }}
          >
            {evenement.projetTitre}
          </a>
        ) : (
          <span className="muted">Événement non rattaché : voir l'onglet « Rattachement aux projets ».</span>
        )}
        <h4>Statut</h4>
        <div className="row">
          <select value={s} onChange={(e) => corriger({ statut: e.target.value })}>
            {[...new Set([...STATUTS, s])].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          {dossier.corrections.statut && (
            <>
              <span className="tag">modifié par vous (assistant : {f.statut})</span>
              <button className="lien" onClick={() => corriger({ statut: null })}>
                annuler
              </button>
            </>
          )}
        </div>
        <h4>Demandeur</h4>
        <div>{f.demandeur || '—'}</div>
        <h4>Contacts</h4>
        {liste(f.contacts ?? [])}
        <h4>
          Résumé
        </h4>
        <div>{f.resume || '—'}</div>
        {f.analyse && <div className="muted petit">Analysé le {dayjs(f.analyse).format('DD/MM/YYYY à HH:mm')}</div>}
        <h4>Échéances</h4>
        {(f.echeances ?? []).length ? (
          <ul>
            {(f.echeances ?? []).map((e, i) => (
              <li key={i}>
                {fdate(e.date)} – {e.libelle} {boutonTache('echeance', i)}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">—</span>
        )}
        <h4>Actions à mener</h4>
        {(f.actions ?? []).length ? (
          <ul>
            {(f.actions ?? []).map((a, i) => (
              <li key={i}>
                {a} {boutonTache('action', i)}
              </li>
            ))}
          </ul>
        ) : (
          <span className="muted">—</span>
        )}
        {(f.vigilance ?? []).length > 0 && (
          <>
            <h4 style={{ color: 'var(--amber)' }}>Points de vigilance</h4>
            {liste(f.vigilance ?? [])}
          </>
        )}
        <h4>Pièces jointes</h4>
        {(f.pieces_jointes ?? []).length ? (
          (f.pieces_jointes ?? []).map((p, i) => (
            <div className="pj" key={i}>
              <div>
                {p.fichierId ? (
                  <a href={`/api/assistant/fichiers/${p.fichierId}`} target="_blank" rel="noreferrer">
                    {p.nom}
                  </a>
                ) : (
                  p.nom
                )}
              </div>
              <span>
                {p.type} · {p.taille}
                <br />
                {p.emplacement?.startsWith('OneDrive') ? (
                  typeof p.onedrive === 'string' ? (
                    <a href={p.onedrive} target="_blank" rel="noreferrer">
                      {p.emplacement}
                    </a>
                  ) : (
                    p.emplacement
                  )
                ) : p.fichierId ? (
                  'cliquez pour ouvrir'
                ) : (
                  p.emplacement || 'à récupérer'
                )}
              </span>
            </div>
          ))
        ) : (
          <span className="muted">Aucune</span>
        )}
        {(f.budget ?? []).length > 0 && (
          <>
            <h4>Suivi budgétaire</h4>
            {liste(
              (f.budget ?? []).map(
                (b) =>
                  `${b.type ?? ''} ${b.reference ?? ''} – ${b.fournisseur ?? ''} : ${
                    b.montant_ttc == null ? 'montant à lire' : `${euros(b.montant_ttc)} TTC`
                  } (${b.statut_lecture ?? ''})`
              )
            )}
          </>
        )}
        {f.brouillon && (
          <>
            <h4>Brouillon de réponse</h4>
            <Paragraph copyable={{ text: f.brouillon, tooltips: ['Copier le brouillon', 'Copié'] }} style={{ margin: 0 }}>
              <pre className="draft">{f.brouillon}</pre>
            </Paragraph>
          </>
        )}
        {(f.remarques ?? []).length > 0 && (
          <>
            <h4>Vos consignes</h4>
            {liste(f.remarques ?? [])}
          </>
        )}
        <h4>Mails du dossier</h4>
        <MailsDuDossier mails={mails} dossier={dossier} index={index} recharger={recharger} />
        <h4>Mes notes</h4>
        <textarea
          placeholder="Notes personnelles, enregistrées dans l'application"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (dossier.corrections.note ?? '') && corriger({ note })}
        />
      </div>
    </Drawer>
  );
}

function MailsDuDossier({ mails, dossier, index, recharger }: { mails: Mail[]; dossier: Dossier; index: Index; recharger: () => Promise<unknown> }) {
  const [deplie, setDeplie] = useState<string | null>(null);
  const [corps, setCorps] = useState<Record<string, string>>({});
  if (!mails.length) return <span className="muted">—</span>;
  const tries = [...mails].sort((a, b) => b.date.localeCompare(a.date));
  const lire = async (m: Mail) => {
    if (deplie === m._id) return setDeplie(null);
    setDeplie(m._id);
    if (corps[m._id] === undefined) {
      const r = await api.get<{ mail: { corps: string } }>(`/assistant/mails/${m._id}`);
      setCorps((c) => ({ ...c, [m._id]: r.mail.corps || '(texte vide)' }));
    }
  };
  const deplacer = async (m: Mail, cible: string) => {
    if (await lancer(api.put(`/assistant/mails/${m._id}/dossier`, { dossier: cible }))) recharger();
  };
  return (
    <div className="mails">
      {tries.map((m) => (
        <div key={m._id ?? m.numero} className={`mail ${m.sens === 'envoyé' ? 'envoye' : ''}`}>
          <div className="entete" onClick={() => m.source === 'releve' && lire(m)} style={{ cursor: m.source === 'releve' ? 'pointer' : 'default' }}>
            <span className="sens">{m.sens === 'envoyé' ? '↗' : '↘'}</span>
            <span className="quand">
              {fdate(m.date)} {m.date.slice(11, 16)}
            </span>
            <b>{m.expediteur}</b>
            <span className="objet">{m.objet}</span>
          </div>
          {m.source === 'releve' && (
            <div className="details">
              {m.piecesJointes.length > 0 && (
                <span>
                  📎{' '}
                  {m.piecesJointes.map((p, i) => (
                    <span key={i}>
                      {i > 0 && ', '}
                      {p.fichierId ? (
                        <a href={`/api/assistant/fichiers/${p.fichierId}`} target="_blank" rel="noreferrer">
                          {p.nom}
                        </a>
                      ) : (
                        p.nom
                      )}{' '}
                      ({ko(p.taille)}){p.onedrive && <span title={`OneDrive › ${p.onedrive.chemin}`}> ☁</span>}
                    </span>
                  ))}
                </span>
              )}
              <span className="muted">{MOTIFS[m.classement] ?? m.classement}</span>
              <Popconfirm
                title="Supprimer ce mail du registre ?"
                description="Il ne reviendra pas, même transféré à nouveau."
                okText="Supprimer"
                cancelText="Annuler"
                okButtonProps={{ danger: true }}
                onConfirm={async () => {
                  if (await lancer(api.post('/assistant/mails/supprimer', { ids: [m._id] }))) recharger();
                }}
              >
                <button className="lien danger">supprimer</button>
              </Popconfirm>
              <select
                value=""
                onChange={(e) => e.target.value && deplacer(m, e.target.value)}
                aria-label="Déplacer le mail"
                className="deplacer"
              >
                <option value="">déplacer vers…</option>
                <option value="nouveau">un nouveau dossier</option>
                {index.dossiers
                  .filter((d) => d.code !== dossier.code && statutOuvert(statutDe(d)))
                  .map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} – {d.donnees.titre.slice(0, 60)}
                    </option>
                  ))}
              </select>
            </div>
          )}
          {deplie === m._id && (
            <div className="corps">
              {m.destinataires && <div className="muted">À : {m.destinataires}</div>}
              <pre>{corps[m._id] ?? 'Chargement…'}</pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Mise à jour ---------------------------------------------------------------------------------

interface ReglagesOutlook {
  deplacerVers: string;
  automatique: boolean;
  sousDossiers: boolean;
  rattrapageDepuis: string;
  rattrapageAtteint: string | null;
  rattrapageTermine: boolean;
  demandeLe: string | null;
  demandePar: string;
}

/** Avancement du rattrapage, en pourcentage de la période à reprendre (de la date de départ à aujourd'hui). */
function avancementRattrapage(o: ReglagesOutlook): number | null {
  if (!o.rattrapageDepuis) return null;
  if (o.rattrapageTermine) return 100;
  if (!o.rattrapageAtteint) return 0;
  const total = aujourdhui().diff(dayjs(o.rattrapageDepuis), 'day');
  const fait = aujourdhui().diff(dayjs(o.rattrapageAtteint), 'day');
  return total > 0 ? Math.max(0, Math.min(99, Math.round((fait / total) * 100))) : 100;
}

function ReglagesLecture({ o, apres }: { o: ReglagesOutlook; apres: () => void }) {
  const [dossier, setDossier] = useState(o.deplacerVers);
  const [deplacer, setDeplacer] = useState(!!o.deplacerVers);
  const [parEvenement, setParEvenement] = useState(o.sousDossiers);
  const [auto, setAuto] = useState(o.automatique);
  const [depuis, setDepuis] = useState(o.rattrapageDepuis);
  const [envoi, setEnvoi] = useState(false);
  const modifie = (deplacer ? dossier.trim() : '') !== o.deplacerVers || parEvenement !== o.sousDossiers || auto !== o.automatique || depuis !== o.rattrapageDepuis;
  const enregistrer = async () => {
    setEnvoi(true);
    try {
      if (await lancer(api.put('/assistant/outlook/reglages', { deplacerVers: deplacer ? dossier.trim() : '', sousDossiers: parEvenement, automatique: auto, rattrapageDepuis: depuis }))) apres();
    } finally {
      setEnvoi(false);
    }
  };
  return (
    <div className="reglages">
      <Text strong>Réglages de la lecture</Text>
      <label>
        Passages
        <select value={auto ? 'auto' : 'demande'} onChange={(e) => setAuto(e.target.value === 'auto')}>
          <option value="auto">automatiques, toutes les heures en semaine de 8 h à 18 h, et à la demande</option>
          <option value="demande">à la demande seulement (bouton « Lancer maintenant »)</option>
        </select>
      </label>
      <label className="case">
        <input type="checkbox" checked={deplacer} onChange={(e) => setDeplacer(e.target.checked)} /> Une fois traité, déplacer le mail de la boîte de
        réception vers le dossier Outlook :
      </label>
      <input type="text" value={dossier} disabled={!deplacer} onChange={(e) => setDossier(e.target.value)} placeholder="DKEVENTS" />
      <label className="case">
        <input type="checkbox" checked={parEvenement} disabled={!deplacer} onChange={(e) => setParEvenement(e.target.checked)} /> Dans un sous-dossier par
        événement, aux mêmes noms que dans OneDrive ({dossier.trim() || 'DKEVENTS'} → La Féerique 2026…). Les mails sans événement vont dans « Fonctionnement
        du service ».
      </label>
      <label>
        Reprendre aussi les mails reçus depuis le
        <input type="date" value={depuis} onChange={(e) => setDepuis(e.target.value)} />
      </label>
      <div className="muted petit" style={{ marginTop: 4 }}>
        Laissez la date vide pour ne lire que les nouveaux mails. Changer la date relance le rattrapage à partir de celle-ci.
      </div>
      <Space style={{ marginTop: 10 }}>
        <Button type="primary" loading={envoi} disabled={!modifie || (deplacer && !dossier.trim())} onClick={enregistrer}>
          Enregistrer
        </Button>
      </Space>
    </div>
  );
}

function PanneauMiseAJour({
  ouvert,
  fermer,
  releve,
  relever,
  releveEnCours,
  dernier,
  nbCorrections,
  exporter,
  apres,
}: {
  ouvert: boolean;
  fermer: () => void;
  releve: EtatReleve;
  relever: () => void;
  releveEnCours: boolean;
  dernier: Index['dernierImport'];
  nbCorrections: number;
  exporter: () => void;
  apres: () => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const [ancien, setAncien] = useState(false);
  const [aRanger, setARanger] = useState<{ racine: string; pieces: { dossierOneDrive: string }[] } | null>(null);
  useEffect(() => {
    if (ouvert)
      api.get<{ racine: string; pieces: { dossierOneDrive: string }[] }>('/assistant/pieces/a-ranger').then(setARanger).catch(() => setARanger(null));
  }, [ouvert]);
  const o = releve.outlook;
  const avancement = avancementRattrapage(o);

  const importer = async (fichier: File) => {
    setEnvoi(true);
    try {
      const texte = await fichier.text();
      // donnees.js (« window.DONNEES = {…} ») est accepté comme donnees.json.
      const json = JSON.parse(texte.replace(/^﻿/, '').replace(/^\s*window\.DONNEES\s*=\s*/, '').replace(/;\s*$/, ''));
      if (await lancer(api.post('/assistant/import', json))) apres();
    } catch {
      message.error("Fichier illisible : déposez le donnees.json produit par l'assistant");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <Drawer open={ouvert} onClose={fermer} width={620} title="Mise à jour des dossiers">
      <div className="asst panneau">
      <style>{CSS}</style>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Paragraph style={{ marginBottom: 8 }}>
            {o.automatique ? 'Les mails du service sont lus dans Outlook toutes les heures en semaine, de 8 h à 18 h, et à votre demande' : 'Les mails du service sont lus dans Outlook à votre demande'} : chaque conversation rejoint son dossier, ses pièces
            jointes sont rangées dans OneDrive et les montants alimentent le suivi budgétaire.
            {o.deplacerVers
              ? ` Les mails traités sont ensuite déplacés vers le dossier Outlook « ${o.deplacerVers} »${o.sousDossiers ? ', dans le sous-dossier de leur événement' : ''}.`
              : ''}
          </Paragraph>
          <Space wrap>
            <Button type="primary" icon={<SyncOutlined spin={releveEnCours} />} onClick={relever} disabled={releveEnCours || !!o.demandeLe}>
              {o.demandeLe ? 'Lecture demandée' : 'Lancer maintenant'}
            </Button>
            <Text type="secondary">
              {o.demandeLe
                ? `Demandée à ${dayjs(o.demandeLe).format('HH:mm')}, démarre vers ${dayjs(releve.prochainPassage).format('HH:mm')}`
                : o.automatique
                  ? `Prochain passage vers ${dayjs(releve.prochainPassage).format(dayjs(releve.prochainPassage).isSame(dayjs(), 'day') ? 'HH:mm' : 'ddd DD/MM à HH:mm')}`
                  : 'Lecture à la demande : démarre dans l’heure qui suit le clic'}
            </Text>
          </Space>
          <div className="muted petit" style={{ marginTop: 8 }}>
            {releve.derniereLectureOutlook
              ? `Dernière lecture le ${dayjs(releve.derniereLectureOutlook).format('DD/MM/YYYY à HH:mm')}.`
              : 'Aucune lecture pour l’instant.'}{' '}
            La lecture a besoin du poste du chef de service allumé, avec Chrome ouvert.
          </div>
        </div>

        {avancement !== null && (
          <div>
            <Text strong>Reprise des mails depuis le {fdate(o.rattrapageDepuis)}</Text>
            <div className="jauge" title={`${avancement} %`}>
              <span style={{ width: `${avancement}%` }} />
            </div>
            <div className="muted petit">
              {o.rattrapageTermine
                ? 'Terminée : tous les mails de la période ont été lus.'
                : o.rattrapageAtteint
                  ? `${avancement} % : mails lus jusqu'au ${fdate(o.rattrapageAtteint)} en remontant le temps. Chaque passage traite une trentaine de conversations après les nouveaux mails.`
                  : 'Pas encore commencée : elle démarre au prochain passage, après les nouveaux mails.'}
            </div>
          </div>
        )}

        <ReglagesLecture key={`${o.deplacerVers}|${o.sousDossiers}|${o.automatique}|${o.rattrapageDepuis}`} o={o} apres={apres} />

        {aRanger && (
          <div>
            <Text strong>Pièces jointes dans OneDrive</Text>
            <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
              {aRanger.pieces.length === 0
                ? `Toutes les pièces jointes sont rangées (${aRanger.racine.replace('/', ' → ')}).`
                : `${aRanger.pieces.length} pièce${aRanger.pieces.length > 1 ? 's' : ''} jointe${aRanger.pieces.length > 1 ? 's' : ''} encore à ranger dans OneDrive (${aRanger.racine.replace('/', ' → ')}), dans ${[...new Set(aRanger.pieces.map((p) => p.dossierOneDrive))].join(', ')}.`}
            </Paragraph>
          </div>
        )}

        <div>
          <Text strong>Consignes de classement</Text>
          <ul className="aide">
            <li>
              Au-dessus d'un mail transféré, écrivez <code>#feerique #logistique</code> (événement, branche), <code>#D12</code> (dossier précis) ou{' '}
              <code>#urgent</code> (priorité haute). Le reste du texte devient une remarque dans la fiche.
            </li>
            <li>Sans consigne, le mail rejoint sa conversation, le dossier de son expéditeur ou l'événement qu'il cite ; sinon il part « à classer ».</li>
            <li>Les mails sans rapport avec le service (lettres d'information, invitations extérieures) restent dans la boîte de réception, marqués « DK traité ».</li>
          </ul>
        </div>

        {releve.derniers.length > 0 && (
          <div>
            <Text strong>Derniers passages</Text>
            <table className="releves">
              <thead>
                <tr>
                  <th>Quand</th>
                  <th>Lus</th>
                  <th>Ajoutés</th>
                  <th>Dossiers créés</th>
                  <th>Pièces</th>
                  <th>Déplacés</th>
                  <th>Remarque</th>
                </tr>
              </thead>
              <tbody>
                {releve.derniers.map((r) => (
                  <tr key={r._id}>
                    <td>{dayjs(r.debut).format('DD/MM HH:mm')}</td>
                    <td>{r.lus}</td>
                    <td>{r.nouveaux}</td>
                    <td>{r.dossiersCrees}</td>
                    <td>{r.pieces ?? 0}</td>
                    <td>{r.deplaces ?? 0}</td>
                    <td>{r.erreur || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div>
          <button className="lien-gris" onClick={() => setAncien(!ancien)}>
            {ancien ? '▾' : '▸'} Importer un index de l'assistant (ancien mode)
          </button>
          {ancien && (
            <div style={{ marginTop: 8 }}>
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
                <p className="ant-upload-text">Déposez ici donnees.json</p>
                <p className="ant-upload-hint">
                  Remplace les fiches de l'assistant (D01…). Les dossiers et mails lus dans Outlook, les rattachements, tâches, statuts corrigés et
                  notes sont conservés.
                </p>
              </Upload.Dragger>
              {nbCorrections > 0 && (
                <Button style={{ marginTop: 8 }} onClick={exporter}>
                  Télécharger mes corrections ({nbCorrections} dossier{nbCorrections > 1 ? 's' : ''})
                </Button>
              )}
              {dernier && (
                <div className="muted petit" style={{ marginTop: 8 }}>
                  Dernier import le {dayjs(dernier.createdAt).format('DD/MM/YYYY à HH:mm')} par {dernier.par} : {dernier.compte.dossiers} dossiers,{' '}
                  {dernier.compte.mails} mails.
                </div>
              )}
            </div>
          )}
        </div>
      </Space>
      </div>
    </Drawer>
  );
}

// --- Styles repris de l'application d'origine de l'assistant ---------------------------------------

const CSS = `
.asst{--bg:#f4f5f2;--panel:#fff;--ink:#1d2a33;--muted:#5f6b73;--line:#dde1dc;--navy:#16324f;--sea:#1f6f8b;--sand:#e9e2d0;
  --red:#b3392f;--amber:#b7791f;--green:#2f7d4f;--grey:#7a838a;background:var(--bg);color:var(--ink);font-size:14px;line-height:1.45;
  border-radius:8px;overflow:hidden}
.asst header{background:var(--navy);color:#fff;padding:14px 24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap}
.asst header h1{font-size:18px;margin:0;font-weight:600;color:#fff}
.asst header .sub{font-size:12px;opacity:.75}
.asst .kpis{display:flex;gap:10px;margin-left:auto;flex-wrap:wrap;align-items:stretch}
.asst .kpi{background:rgba(255,255,255,.1);border-radius:6px;padding:6px 12px;min-width:92px;cursor:pointer}
.asst .kpi b{display:block;font-size:20px;line-height:1.1}
.asst .kpi span{font-size:11px;opacity:.85}
.asst .kpi.alert b{color:#ffb4a8}
.asst .maj{border:1px solid rgba(255,255,255,.6);background:#fff;color:var(--navy);border-radius:6px;padding:6px 14px;font:inherit;font-weight:600;cursor:pointer}
.asst .maj:hover{background:#e9f2f6}
.asst .stale .btn.petit{padding:2px 10px;font-size:12px;margin-left:6px;border-color:#8a2a21;color:#8a2a21}
.asst .stale.err{background:#fde8e5;color:#8a2a21;border-bottom-color:#f2c2bb}
.asst .lien.clair{color:#cfe3ec;font-size:12px;padding:0;text-decoration:underline}
.asst .lien-gris{border:0;background:none;color:var(--muted);cursor:pointer;font:inherit;padding:0}
.asst .tag.neuf{background:#dff0e6;color:var(--green);font-weight:600}
.asst .group.a-classer h2{color:var(--amber)}
.asst .petit{font-size:12px}
.asst .classement select{max-width:260px}
.asst .mails{display:flex;flex-direction:column;gap:6px}
.asst .mail{border:1px solid var(--line);border-radius:5px;padding:6px 8px;background:#fff}
.asst .mail.envoye{background:#f5f8fa}
.asst .mail .entete{display:flex;gap:8px;flex-wrap:wrap;align-items:baseline;font-size:13px}
.asst .mail .sens{color:var(--sea);font-weight:700}
.asst .mail .quand{color:var(--muted);font-size:12px}
.asst .mail .objet{color:var(--ink)}
.asst .mail .details{display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-size:12px;margin-top:3px}
.asst .mail .deplacer{font-size:12px;padding:2px 4px;max-width:220px}
.asst .mail .corps pre{white-space:pre-wrap;font:inherit;font-size:13px;background:#fafaf8;border-radius:4px;padding:8px;margin:6px 0 0;max-height:320px;overflow:auto}
.asst .stale{background:#fff1d6;color:#7a4b00;padding:8px 24px;font-size:13px;border-bottom:1px solid #efdca8}
.asst nav{display:flex;gap:2px;padding:0 24px;background:var(--panel);border-bottom:1px solid var(--line);overflow-x:auto}
.asst nav button{border:0;background:none;padding:12px 16px;font:inherit;color:var(--muted);cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
.asst nav button.on{color:var(--navy);border-bottom-color:var(--sea);font-weight:600}
.asst .filters{display:flex;gap:10px;padding:14px 24px;flex-wrap:wrap;align-items:center}
.asst select,.asst input[type=search],.asst textarea{font:inherit;border:1px solid var(--line);border-radius:5px;padding:7px 9px;background:#fff;color:var(--ink)}
.asst input[type=search]{min-width:240px}
.asst .btn{border:1px solid var(--sea);color:var(--sea);background:#fff;border-radius:5px;padding:7px 12px;font:inherit;cursor:pointer}
.asst .lien{border:0;background:none;color:var(--sea);cursor:pointer;font:inherit;font-size:12px;padding:0 4px}
.asst main{padding:0 24px 30px}
.asst .group{margin:18px 0 6px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.asst .group h2{font-size:15px;margin:0;color:var(--navy)}
.asst .group small{color:var(--muted)}
.asst .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.asst .card{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--grey);border-radius:6px;padding:12px 14px;cursor:pointer;transition:box-shadow .15s}
.asst .card:hover{box-shadow:0 2px 10px rgba(0,0,0,.08)}
.asst .card.p-Haute{border-left-color:var(--red)}
.asst .card.p-Normale{border-left-color:var(--sea)}
.asst .card h3{font-size:14px;margin:4px 0 6px;font-weight:600}
.asst .meta{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--muted)}
.asst .tag{display:inline-block;font-size:11px;padding:2px 7px;border-radius:10px;background:var(--sand);color:var(--ink)}
.asst .st{font-weight:600}
.asst .st-todo{background:#f6d9d5;color:var(--red)}
.asst .st-wait{background:#f6e8cf;color:var(--amber)}
.asst .st-run{background:#d6e9ef;color:var(--sea)}
.asst .st-done{background:#d9ecdf;color:var(--green)}
.asst .st-info{background:#e6e8ea;color:var(--grey)}
.asst .next{font-size:12px;margin-top:8px}
.asst .next b{color:var(--navy)}
.asst .warn{font-size:12px;color:var(--amber);margin-top:4px}
.asst .note-carte{font-size:12px;color:var(--sea);margin-top:4px;font-style:italic}
.asst table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-top:14px}
.asst th,.asst td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.asst th{background:#eef0ec;font-size:12px;color:var(--muted);font-weight:600}
.asst tr.click{cursor:pointer}
.asst tr.click:hover td{background:#f8f9f6}
.asst .late td:first-child{color:var(--red);font-weight:600}
.asst .soon td:first-child{color:var(--amber);font-weight:600}
.asst .empty{color:var(--muted);padding:30px;text-align:center}
.asst .muted{color:var(--muted)}
.asst .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.asst .totals{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin:14px 0}
.asst .tot{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:12px}
.asst .tot b{font-size:20px;display:block;color:var(--navy)}
.asst .note{background:#fff8e6;border:1px solid #efdca8;border-radius:6px;padding:10px 12px;font-size:13px;margin:12px 0}
.asst .h3{font-size:14px;color:var(--navy);margin:18px 0 0}
.asst footer{color:var(--muted);font-size:12px;padding:0 24px 20px}
.asst.fiche{background:var(--panel);padding:22px 26px;border-radius:0;position:relative;min-height:100%}
.asst.fiche h2{margin:6px 0 4px;font-size:18px;color:var(--navy)}
.asst.fiche h4{margin:18px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:.6px;color:var(--muted)}
.asst.fiche ul{margin:0;padding-left:18px}
.asst.fiche li{margin:2px 0}
.asst .close{position:absolute;top:14px;right:16px;border:0;background:none;font-size:22px;cursor:pointer;color:var(--muted)}
.asst pre.draft{white-space:pre-wrap;background:#f6f7f4;border:1px solid var(--line);border-radius:5px;padding:10px;font-size:13px;line-height:1.5;margin:0;font-family:inherit}
.asst textarea{width:100%;min-height:70px}
.asst.panneau{background:none;overflow:visible}
.asst .reglages{background:#f6f7f4;border:1px solid var(--line);border-radius:6px;padding:12px 14px}
.asst .reglages label{display:block;margin-top:8px;font-size:13px;color:var(--muted)}
.asst .reglages input,.asst .reglages select{display:block;width:100%;margin-top:3px;font:inherit;border:1px solid var(--line);border-radius:5px;padding:7px 9px;background:#fff;color:var(--ink)}
.asst .lien.danger{color:var(--red)}
.asst .reglages label.case{display:flex;gap:8px;align-items:flex-start;color:var(--ink)}
.asst .reglages label.case input{display:inline-block;width:auto;margin-top:3px}
.asst .jauge{height:8px;background:var(--line);border-radius:4px;overflow:hidden;margin:6px 0 4px}
.asst .jauge span{display:block;height:100%;background:var(--sea)}
.asst tr.choisi td{background:#eef5f8}
.asst input.champ-od{font:inherit;font-size:12px;border:1px solid var(--line);border-radius:4px;padding:3px 6px;width:180px}
.asst ul.aide{margin:6px 0 0;padding-left:18px}
.asst ul.aide li{margin-bottom:4px}
.asst ul.aide code{background:var(--sand);border-radius:3px;padding:0 4px}
.asst table.releves{margin-top:6px;font-size:12px}
.asst .pj{display:flex;justify-content:space-between;gap:10px;padding:5px 0;border-bottom:1px dashed var(--line);font-size:13px}
.asst .pj span{color:var(--muted);text-align:right}
`;
