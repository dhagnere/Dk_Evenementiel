import type { MailOrigine } from './transferts.js';
import { mots, normaliser, objetDeFil } from './texte.js';

/**
 * Classement par règles d'un mail relevé, sans service d'analyse. Dans l'ordre :
 * 1. la consigne : #D12 (dossier), #feerique26 (événement), #protocole (branche) ;
 * 2. le fil : même objet (sans RE/TR) qu'un mail déjà classé ;
 * 3. l'expéditeur : adresse citée dans un seul dossier ouvert ;
 * 4. l'événement : nom d'un événement cité dans l'objet ou le texte ;
 * 5. sinon, un nouveau dossier « à classer ».
 * Les règles 4 et 5 ouvrent un nouveau dossier.
 */

export const BRANCHES = ['Protocole', 'Animation', 'Logistique', 'Affichage', 'KIOSC', 'VSL', 'Pilotage du service'];
const BRANCHE_PAR_MOT: Record<string, string> = {
  protocole: 'Protocole',
  animation: 'Animation',
  logistique: 'Logistique',
  affichage: 'Affichage',
  kiosc: 'KIOSC',
  vsl: 'VSL',
  pilotage: 'Pilotage du service',
};

export interface DossierConnu {
  code: string;
  evenementCode: string;
  branche: string;
  statut: string;
  /** Contacts et demandeur, en minuscules : sert au rapprochement par adresse. */
  contacts: string;
}
export interface EvenementConnu {
  code: string;
  nom: string;
  dateJour: string | null;
}
export interface ContexteClassement {
  dossiers: DossierConnu[];
  evenements: EvenementConnu[];
  /** Objet de fil → dossier : les mails déjà classés, enrichi au fil du relevé. */
  fils: Map<string, string>;
  /** Adresses du service : jamais prises pour un contact extérieur. */
  adressesService: Set<string>;
}

export type MotifClassement = 'consigne' | 'fil' | 'expediteur' | 'evenement' | 'nouveau' | 'analyse' | 'manuel';
export interface Classement {
  /** Dossier existant, ou null pour en ouvrir un. */
  dossier: string | null;
  evenement: string;
  branche: string;
  motif: MotifClassement;
}

export interface ConsigneLue {
  dossier: string | null;
  evenement: string | null;
  branche: string | null;
  /** #urgent ou #prio : priorité haute. */
  priorite: 'Haute' | null;
  /** Texte libre de la consigne, hashtags retirés : remarque à porter dans la fiche. */
  remarque: string;
}

/** Lit les hashtags de la consigne d'un transfert. */
export function lireConsigne(consigne: string, hashtags: string[], ctx: ContexteClassement): ConsigneLue {
  let dossier: string | null = null;
  let evenement: string | null = null;
  let branche: string | null = null;
  let priorite: 'Haute' | null = null;
  for (const h of hashtags) {
    const n = normaliser(h).replace(/\s/g, '');
    if (['urgent', 'prio', 'priorite', 'priorit'].includes(n)) {
      priorite = 'Haute';
      continue;
    }
    const d = ctx.dossiers.find((x) => x.code.toLowerCase() === n);
    if (d) {
      dossier = d.code;
      continue;
    }
    if (BRANCHE_PAR_MOT[n]) {
      branche = BRANCHE_PAR_MOT[n];
      continue;
    }
    const e = trouverEvenementParMot(n, ctx.evenements);
    if (e) evenement = e;
  }
  const remarque = consigne
    .replace(/#[\p{L}\p{N}_-]{2,40}/gu, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
  return { dossier, evenement, branche, priorite, remarque };
}

/** #FEERIQUE26 (code exact) ou #feerique (mot propre au nom d'un seul événement, le plus proche s'il y en a plusieurs). */
function trouverEvenementParMot(mot: string, evenements: EvenementConnu[]): string | null {
  const exact = evenements.find((e) => normaliser(e.code).replace(/\s/g, '') === mot);
  if (exact) return exact.code;
  if (mot.length < 4) return null;
  const candidats = evenements.filter((e) => mots(e.nom).has(mot) || normaliser(e.code).replace(/\s/g, '').startsWith(mot));
  if (candidats.length === 0) return null;
  return plusProche(candidats).code;
}

/**
 * Parmi plusieurs événements : avec une date de référence (celle du mail), l'édition la plus proche de cette date ;
 * sinon celui à venir le plus proche (à défaut le plus récent).
 */
function plusProche(evenements: EvenementConnu[], reference?: Date | null): EvenementConnu {
  if (reference && !Number.isNaN(reference.getTime())) {
    const t = reference.getTime();
    const dates = evenements.filter((e) => e.dateJour);
    if (dates.length) return [...dates].sort((a, b) => Math.abs(Date.parse(a.dateJour!) - t) - Math.abs(Date.parse(b.dateJour!) - t))[0];
  }
  const jour = new Date().toISOString().slice(0, 10);
  const avenir = evenements.filter((e) => e.dateJour && e.dateJour >= jour).sort((a, b) => a.dateJour!.localeCompare(b.dateJour!));
  if (avenir.length) return avenir[0];
  return [...evenements].sort((a, b) => (b.dateJour ?? '').localeCompare(a.dateJour ?? ''))[0];
}

/** Nom court d'un événement, sans l'année ni la description : « Dunkerque Fête la Mer 2026 – … » → « dunkerque fete la mer ». */
const PETITS_MOTS = /\b(de|du|des|la|le|les|d|l|dunkerque)\b/g;
function nomCite(nom: string): string {
  return compacter(nom.split(/\s+[–—-]\s+/)[0]).replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim();
}
/** Texte normalisé sans petits mots : « Fête de la Mer » et « Dunkerque fête la mer » donnent tous deux « fete mer ». */
function compacter(texte: string): string {
  return normaliser(texte).replace(/[.@]/g, ' ').replace(PETITS_MOTS, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Événement cité dans un texte.
 * 1. Son nom court cité tel quel (« Dunkerque fête la mer », « feu d'artifice ») : le plus long l'emporte.
 * 2. Sinon, tous ses mots propres (au moins deux s'il en a plusieurs).
 * Entre deux éditions d'un même événement, la plus proche de la date du mail.
 */
export function evenementCite(texte: string, evenements: EvenementConnu[], reference?: Date | null): string | null {
  const brut = ` ${compacter(texte)} `;
  let phrases: { e: EvenementConnu; score: number }[] = [];
  for (const e of evenements) {
    const n = nomCite(e.nom);
    if (n.length < 6 || !brut.includes(` ${n} `)) continue;
    if (!phrases.length || n.length > phrases[0].score) phrases = [{ e, score: n.length }];
    else if (n.length === phrases[0].score) phrases.push({ e, score: n.length });
  }
  // L'année citée dans l'objet (« Fête de la Mer 2027 ») désigne l'édition, avant toute question de date.
  const annees = new Set((texte.split('\n')[0].match(/\b20\d{2}\b/g) ?? []));
  const parAnnee = (liste: EvenementConnu[]) => {
    const ok = liste.filter((e) => (e.nom.match(/\b20\d{2}\b/g) ?? []).some((a) => annees.has(a)));
    return ok.length ? ok : liste;
  };
  if (phrases.length) return plusProche(parAnnee(phrases.map((x) => x.e)), reference).code;

  const t = mots(texte);
  let meilleurs: { e: EvenementConnu; score: number }[] = [];
  for (const e of evenements) {
    const m = [...mots(e.nom)].filter((x) => x.length >= 4);
    if (m.length === 0) continue;
    const communs = m.filter((x) => t.has(x)).length;
    const requis = Math.min(2, m.length);
    if (communs < requis) continue;
    const score = communs / m.length;
    if (!meilleurs.length || score > meilleurs[0].score) meilleurs = [{ e, score }];
    else if (score === meilleurs[0].score) meilleurs.push({ e, score });
  }
  if (!meilleurs.length) return null;
  return plusProche(parAnnee(meilleurs.map((x) => x.e)), reference).code;
}

const ouvert = (d: DossierConnu) => !/^clos/i.test(d.statut);

/** Classe un mail d'origine. `consigne` : hashtags du transfert qui le contient. */
export function classer(mail: MailOrigine, consigne: ConsigneLue, ctx: ContexteClassement): Classement {
  if (consigne.dossier) {
    const d = ctx.dossiers.find((x) => x.code === consigne.dossier)!;
    return { dossier: d.code, evenement: d.evenementCode, branche: d.branche, motif: 'consigne' };
  }

  const fil = objetDeFil(mail.objet);
  // Un objet vide ou générique ne relie pas deux conversations entre elles.
  const parFil = fil.length >= 4 && !/^(aucun objet|sans objet|pas d objet)$/.test(fil) ? ctx.fils.get(fil) : undefined;
  const dFil = parFil ? ctx.dossiers.find((x) => x.code === parFil) : undefined;

  if (consigne.evenement || consigne.branche) {
    if (dFil && (!consigne.evenement || dFil.evenementCode === consigne.evenement) && (!consigne.branche || dFil.branche === consigne.branche)) {
      return { dossier: dFil.code, evenement: dFil.evenementCode, branche: dFil.branche, motif: 'fil' };
    }
    return { dossier: null, evenement: consigne.evenement ?? dFil?.evenementCode ?? '', branche: consigne.branche ?? '', motif: 'consigne' };
  }
  if (dFil) return { dossier: dFil.code, evenement: dFil.evenementCode, branche: dFil.branche, motif: 'fil' };

  const adresse = mail.expediteurAdresse;
  if (mail.sens === 'reçu' && adresse && !ctx.adressesService.has(adresse)) {
    const chez = ctx.dossiers.filter((d) => ouvert(d) && d.contacts.includes(adresse));
    if (chez.length === 1) return { dossier: chez[0].code, evenement: chez[0].evenementCode, branche: chez[0].branche, motif: 'expediteur' };
  }

  const ev = evenementCite(`${mail.objet}\n${mail.corps.slice(0, 4000)}`, ctx.evenements, mail.date);
  if (ev) return { dossier: null, evenement: ev, branche: '', motif: 'evenement' };
  return { dossier: null, evenement: '', branche: '', motif: 'nouveau' };
}

/** Texte de contacts d'un dossier, pour le rapprochement par adresse. */
export function contactsDe(donnees: Record<string, unknown>): string {
  const morceaux: string[] = [];
  const ajouter = (v: unknown) => {
    if (typeof v === 'string') morceaux.push(v);
    else if (Array.isArray(v)) v.forEach(ajouter);
    else if (v && typeof v === 'object') Object.values(v).forEach(ajouter);
  };
  ajouter(donnees.contacts);
  ajouter(donnees.demandeur);
  return morceaux.join(' ').toLowerCase();
}
