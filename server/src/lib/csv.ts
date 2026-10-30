import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

/** Colonnes du CSV des événements (correspondance directe avec le modèle Event). */
export const EVENT_CSV_COLUMNS = [
  'eventId',
  'dateClef',
  'nom',
  'dateDeDebut',
  'dateDeFin',
  'lieu',
  'quartier',
  'pilote',
  'directionPilote',
  'organisateur',
  'nature',
  'niveau',
  'type',
  'statut',
  'tardive',
  'reprog',
  'validationTechnique',
  'validationPolitique',
  'validParDateClef',
  'statutDimport',
] as const;

/** Colonnes du CSV des utilisateurs. motDePasseInitial n'est utilisé qu'à l'import (jamais réexporté). */
export const USER_CSV_COLUMNS = ['nom', 'email', 'role', 'statut', 'motDePasseInitial', 'derniereConnexion'] as const;

/**
 * Parse une date au format JJ/MM/AAAA, avec une heure optionnelle (JJ/MM/AAAA HH:mm[:ss]) telle que
 * produite par certains exports Excel. Le format DD/MM (jour avant mois) est toujours prioritaire :
 * on ne laisse jamais l'interprétation américaine (MM/DD) du constructeur Date natif s'appliquer.
 */
export function parseDateFr(value: string | undefined | null): Date | null {
  if (!value || !value.trim()) return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!match) {
    // Tolère aussi le format ISO (AAAA-MM-JJ) au cas où.
    const iso = new Date(value.trim());
    return Number.isNaN(iso.getTime()) ? null : iso;
  }
  const [, jour, mois, annee, heure, minute, seconde] = match;
  const date = new Date(
    Number(annee),
    Number(mois) - 1,
    Number(jour),
    heure ? Number(heure) : 0,
    minute ? Number(minute) : 0,
    seconde ? Number(seconde) : 0
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Formate une date au format JJ/MM/AAAA pour l'export CSV. */
export function formatDateFr(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const jour = String(date.getDate()).padStart(2, '0');
  const mois = String(date.getMonth() + 1).padStart(2, '0');
  return `${jour}/${mois}/${date.getFullYear()}`;
}

export function parseBoolFr(value: string | undefined | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v === 'oui' || v === 'true' || v === '1' || v === 'vrai';
}

export function formatBoolFr(value: boolean | undefined | null): string {
  return value ? 'Oui' : 'Non';
}

/** Devine le séparateur (« , » ou « ; ») d'après la première ligne : les exports Excel français utilisent « ; ». */
function detecterDelimiteur(content: string): ',' | ';' {
  const premiereLigne = content.split(/\r?\n/, 1)[0] ?? '';
  const nbPointVirgule = (premiereLigne.match(/;/g) ?? []).length;
  const nbVirgule = (premiereLigne.match(/,/g) ?? []).length;
  return nbPointVirgule > nbVirgule ? ';' : ',';
}

/** Normalise un nom de colonne pour la comparaison : minuscules, sans accents, sans espaces superflus. */
function normaliserEntete(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '');
}

/**
 * Alias reconnus pour les en-têtes de colonnes d'un export « brut » (celui du logiciel source de la
 * ville, en français), en plus de nos propres noms de colonnes internes (EVENT_CSV_COLUMNS, utilisés
 * pour ré-importer un fichier déjà exporté par l'application).
 */
const ALIAS_COLONNES_EVENEMENT: Record<string, keyof EventCsvRow> = {
  'date de debut': 'dateDeDebut',
  'date de fin': 'dateDeFin',
  nom: 'nom',
  "nom de l'evenement": 'nom',
  type: 'type',
  tardive: 'tardive',
  pilote: 'pilote',
  'direction pilote': 'directionPilote',
  'organisateur principal': 'organisateur',
  organisateur: 'organisateur',
  statut: 'statut',
  lieu: 'lieu',
  quartier: 'quartier',
  nature: 'nature',
  niveau: 'niveau',
  reprog: 'reprog',
  eventid: 'eventId',
  dateclef: 'dateClef',
  datededebut: 'dateDeDebut',
  datedefin: 'dateDeFin',
  directionpilote: 'directionPilote',
  validationtechnique: 'validationTechnique',
  validationpolitique: 'validationPolitique',
  validpardateclef: 'validParDateClef',
  statutdimport: 'statutDimport',
};

/** Ré-applique les alias de colonnes connus sur chaque ligne parsée, pour accepter un export brut. */
function appliquerAliasColonnes(record: Record<string, string>): Record<string, string> {
  const converti: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(record)) {
    const cible = ALIAS_COLONNES_EVENEMENT[normaliserEntete(cle)];
    if (cible && converti[cible] === undefined) converti[cible] = valeur;
  }
  return { ...record, ...converti };
}

export interface EventCsvRow {
  eventId: string;
  dateClef: Date | null;
  nom: string;
  dateDeDebut: Date | null;
  dateDeFin: Date | null;
  lieu: string;
  quartier: string;
  pilote: string;
  directionPilote: string;
  organisateur: string;
  nature: string;
  niveau: string;
  type: string;
  statut: string;
  tardive: string;
  reprog: string;
  validationTechnique: boolean;
  validationPolitique: boolean;
  validParDateClef: boolean;
  statutDimport: string;
}

/**
 * Parse le contenu d'un CSV d'événements en lignes typées. Une ligne sans nom est ignorée.
 *
 * Accepte aussi bien un fichier ré-importé depuis « Exporter CSV » (nos propres colonnes internes,
 * séparées par des virgules) qu'un export « brut » du logiciel source de la ville (colonnes en
 * français comme « Date de début » ou « Organisateur principal », séparées par des points-virgules,
 * comme le produisent par défaut les tableurs en français) : le séparateur est deviné automatiquement
 * et les en-têtes connus sont traduits vers nos colonnes internes. Les colonnes non reconnues (par
 * exemple une colonne « Évaluée » propre au logiciel source) sont simplement ignorées.
 */
export function parseEventsCsv(content: string): { rows: EventCsvRow[]; errors: string[] } {
  const records: Record<string, string>[] = parse<Record<string, string>>(content, {
    columns: true,
    delimiter: detecterDelimiteur(content),
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_quotes: true,
    relax_column_count: true,
  }).map(appliquerAliasColonnes);

  const rows: EventCsvRow[] = [];
  const errors: string[] = [];

  records.forEach((record, index) => {
    const nom = record.nom?.trim();
    if (!nom) {
      errors.push(`Ligne ${index + 2} ignorée : nom manquant`);
      return;
    }
    rows.push({
      eventId: record.eventId?.trim() ?? '',
      dateClef: parseDateFr(record.dateClef),
      nom,
      dateDeDebut: parseDateFr(record.dateDeDebut),
      dateDeFin: parseDateFr(record.dateDeFin),
      lieu: record.lieu?.trim() ?? '',
      quartier: record.quartier?.trim() ?? '',
      pilote: record.pilote?.trim() ?? '',
      directionPilote: record.directionPilote?.trim() ?? '',
      organisateur: record.organisateur?.trim() ?? '',
      nature: record.nature?.trim() ?? '',
      niveau: record.niveau?.trim() ?? '',
      type: record.type?.trim() ?? '',
      statut: record.statut?.trim() || 'Brouillon',
      tardive: record.tardive?.trim() || 'Non',
      reprog: record.reprog?.trim() || 'Non',
      validationTechnique: parseBoolFr(record.validationTechnique),
      validationPolitique: parseBoolFr(record.validationPolitique),
      validParDateClef: parseBoolFr(record.validParDateClef),
      statutDimport: record.statutDimport?.trim() ?? '',
    });
  });

  return { rows, errors };
}

export function stringifyEventsCsv(
  events: Array<{
    eventId?: string | null;
    dateClef?: Date | string | null;
    nom: string;
    dateDeDebut?: Date | string | null;
    dateDeFin?: Date | string | null;
    lieu?: string | null;
    quartier?: string | null;
    pilote?: string | null;
    directionPilote?: string | null;
    organisateur?: string | null;
    nature?: string | null;
    niveau?: string | null;
    type?: string | null;
    statut?: string | null;
    tardive?: string | null;
    reprog?: string | null;
    validationTechnique?: boolean | null;
    validationPolitique?: boolean | null;
    validParDateClef?: boolean | null;
    statutDimport?: string | null;
  }>
): string {
  const rows = events.map((e) => ({
    eventId: e.eventId ?? '',
    dateClef: formatDateFr(e.dateClef ?? null),
    nom: e.nom,
    dateDeDebut: formatDateFr(e.dateDeDebut ?? null),
    dateDeFin: formatDateFr(e.dateDeFin ?? null),
    lieu: e.lieu ?? '',
    quartier: e.quartier ?? '',
    pilote: e.pilote ?? '',
    directionPilote: e.directionPilote ?? '',
    organisateur: e.organisateur ?? '',
    nature: e.nature ?? '',
    niveau: e.niveau ?? '',
    type: e.type ?? '',
    statut: e.statut ?? '',
    tardive: e.tardive ?? '',
    reprog: e.reprog ?? '',
    validationTechnique: formatBoolFr(e.validationTechnique),
    validationPolitique: formatBoolFr(e.validationPolitique),
    validParDateClef: formatBoolFr(e.validParDateClef),
    statutDimport: e.statutDimport ?? '',
  }));

  return stringify(rows, { header: true, columns: [...EVENT_CSV_COLUMNS] });
}

export interface UserCsvRow {
  nom: string;
  email: string;
  role: string;
  statut: string;
  motDePasseInitial: string;
  derniereConnexion: Date | null;
}

export function parseUsersCsv(content: string): { rows: UserCsvRow[]; errors: string[] } {
  const records: Record<string, string>[] = parse<Record<string, string>>(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  const rows: UserCsvRow[] = [];
  const errors: string[] = [];

  records.forEach((record, index) => {
    const email = record.email?.trim().toLowerCase();
    if (!email) {
      errors.push(`Ligne ${index + 2} ignorée : email manquant`);
      return;
    }
    rows.push({
      nom: record.nom?.trim() ?? email,
      email,
      role: record.role?.trim() === 'Administrateur' ? 'Administrateur' : 'Consultant',
      statut: record.statut?.trim() || 'Actif',
      motDePasseInitial: record.motDePasseInitial?.trim() ?? '',
      derniereConnexion: parseDateFr(record.derniereConnexion),
    });
  });

  return { rows, errors };
}

export function stringifyUsersCsv(
  users: Array<{ nom: string; email: string; role: string; statut: string; derniereConnexion?: Date | string | null }>
): string {
  const rows = users.map((u) => ({
    nom: u.nom,
    email: u.email,
    role: u.role,
    statut: u.statut,
    motDePasseInitial: '',
    derniereConnexion: formatDateFr(u.derniereConnexion ?? null),
  }));
  return stringify(rows, { header: true, columns: [...USER_CSV_COLUMNS] });
}
