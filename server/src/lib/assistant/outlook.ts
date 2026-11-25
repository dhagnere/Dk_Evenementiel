import { executer, insererUn, requeteUne } from '../../db.js';

/**
 * Réglages et suivi de la lecture d'Outlook Web (méthode principale de mise à jour des dossiers).
 *
 * La lecture elle-même tourne dans le Chrome du chef de service (tâche planifiée horaire, ou à sa demande).
 * L'application garde : la demande de lancement faite depuis l'onglet, le dossier Outlook où ranger les mails
 * traités, la date de départ du rattrapage et son avancement, et le bilan de chaque passage.
 */

export interface ReglagesOutlook {
  /** Dossier Outlook où déplacer les mails déposés (vide = les laisser dans la boîte de réception). */
  deplacerVers: string;
  /** Passages automatiques aux heures de bureau ; faux = lecture seulement à la demande. */
  automatique: boolean;
  /** Ranger dans un sous-dossier par événement (DKEVENTS/La Féerique 2026…), mêmes noms que dans OneDrive. */
  sousDossiers: boolean;
  /** Rattrapage : traiter aussi les mails reçus depuis cette date (AAAA-MM-JJ), vide = nouveaux mails seulement. */
  rattrapageDepuis: string;
  /** Plus ancienne date déjà atteinte par le rattrapage. */
  rattrapageAtteint: string | null;
  rattrapageTermine: boolean;
  /** Lancement demandé depuis l'onglet, pris en charge au passage suivant. */
  demandeLe: string | null;
  demandePar: string;
}

const DEFAUT: ReglagesOutlook = {
  deplacerVers: 'DKEVENTS',
  automatique: true,
  sousDossiers: true,
  rattrapageDepuis: '2026-01-01',
  rattrapageAtteint: null,
  rattrapageTermine: false,
  demandeLe: null,
  demandePar: '',
};

export async function lireReglagesOutlook(): Promise<ReglagesOutlook> {
  const l = await requeteUne<{ valeur: Partial<ReglagesOutlook> }>("SELECT valeur FROM assistant_config WHERE cle = 'outlook'");
  return { ...DEFAUT, ...(l?.valeur ?? {}) };
}

async function ecrire(r: ReglagesOutlook, par: string): Promise<void> {
  await executer(
    `INSERT INTO assistant_config (cle, valeur, par) VALUES ('outlook', $1, $2)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, par = EXCLUDED.par, updated_at = now()`,
    [JSON.stringify(r), par]
  );
}

export async function modifierReglagesOutlook(
  v: { deplacerVers?: string; automatique?: boolean; sousDossiers?: boolean; rattrapageDepuis?: string },
  par: string
): Promise<ReglagesOutlook> {
  const r = await lireReglagesOutlook();
  if (v.deplacerVers !== undefined) r.deplacerVers = v.deplacerVers.trim().replace(/\/+$/, '');
  if (v.sousDossiers !== undefined) r.sousDossiers = v.sousDossiers;
  if (v.automatique !== undefined) r.automatique = v.automatique;
  if (v.rattrapageDepuis !== undefined && v.rattrapageDepuis !== r.rattrapageDepuis) {
    r.rattrapageDepuis = v.rattrapageDepuis;
    // Nouvelle date de départ : le rattrapage reprend là où il en est, ou il est déjà terminé si la lecture
    // est déjà remontée avant cette date.
    r.rattrapageTermine = !!v.rattrapageDepuis && !!r.rattrapageAtteint && r.rattrapageAtteint <= v.rattrapageDepuis;
  }
  await ecrire(r, par);
  return r;
}

export async function demanderLecture(par: string): Promise<ReglagesOutlook> {
  const r = await lireReglagesOutlook();
  r.demandeLe = new Date().toISOString();
  r.demandePar = par;
  await ecrire(r, par);
  return r;
}

export interface BilanPassage {
  examinees: number;
  deposees: number;
  dossiersCrees: number;
  pieces: number;
  deplaces: number;
  ignores: number;
  debut?: string;
  rattrapageAtteint?: string | null;
  rattrapageTermine?: boolean;
  remarque?: string;
}

/** Bilan d'un passage : historique, demande soldée, avancement du rattrapage. */
export async function enregistrerPassage(b: BilanPassage, par: string): Promise<void> {
  const r = await lireReglagesOutlook();
  r.demandeLe = null;
  if (b.rattrapageAtteint && (!r.rattrapageAtteint || b.rattrapageAtteint < r.rattrapageAtteint)) r.rattrapageAtteint = b.rattrapageAtteint;
  if (b.rattrapageTermine) r.rattrapageTermine = true;
  await ecrire(r, par);
  await insererUn('assistant_releves', {
    debut: b.debut ? new Date(b.debut) : new Date(),
    fin: new Date(),
    lus: b.examinees,
    nouveaux: b.deposees,
    dossiersCrees: b.dossiersCrees,
    pieces: b.pieces,
    deplaces: b.deplaces,
    ignores: b.ignores,
    erreur: (b.remarque ?? '').slice(0, 1000),
    par: `${par} · lecture Outlook`,
  });
}

/**
 * Heure du prochain passage de lecture : la tâche planifiée tourne toutes les heures à hh:07, de 7 h à 19 h
 * (heure de Paris). Hors heures de bureau et le week-end, elle ne lit que si un lancement a été demandé.
 */
export function prochainPassageOutlook(maintenant = new Date()): string {
  const h = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }).format(maintenant));
  const m = Number(new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', minute: '2-digit' }).format(maintenant));
  let enMinutes: number;
  if (h < 7) enMinutes = (7 - h) * 60 + (7 - m);
  else if (h >= 19 && (h > 19 || m >= 7)) enMinutes = (24 - h + 7) * 60 + (7 - m);
  else enMinutes = m < 7 ? 7 - m : 67 - m;
  const t = new Date(maintenant.getTime() + enMinutes * 60_000);
  t.setSeconds(0, 0);
  return t.toISOString();
}
