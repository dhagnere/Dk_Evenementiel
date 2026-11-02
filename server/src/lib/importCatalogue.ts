import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { z } from 'zod';
import { insererUn, pool, requete, transaction, type Executant } from '../db.js';
import { detecterDelimiteur, parseBoolFr } from './csv.js';
import { creerMouvement, ecrireParametresStock, lireParametresStock, schemaTauxTva, type Article } from './stock.js';

/**
 * Reprise d'un catalogue d'articles dans le module Stock, depuis un CSV (écran d'import du
 * catalogue, réservé aux super-administrateurs) ou un JSON (script import-catalogue).
 *
 * Toujours en deux temps : l'analyse contrôle tout le fichier sans rien écrire ; l'application
 * n'est possible que si l'analyse ne relève aucune anomalie, et se fait en une seule transaction.
 * Une référence déjà au catalogue est laissée telle quelle : réimporter ne crée pas de doublon.
 *
 * Colonne « prix » : prix d'achat unitaire TTC, qui fixe aussi le PMP de départ. Colonne « pmp » (facultative,
 * remplie par l'export) : PMP à reprendre tel quel, pour transférer un catalogue d'une base à l'autre.
 * Colonne « tva » : taux en % (20, 10, 5,5, 2,1 ou 0), 20 si vide.
 */

export const ligneArticle = z.object({
  reference: z.string().trim().min(1).max(30),
  libelle: z.string().trim().min(1).max(200),
  famille: z.string().trim().min(1).max(100),
  categorie: z.enum(['Goodies', 'Protocole']),
  emplacement: z.string().trim().min(1).max(100),
  stockInitial: z.number().int().min(0),
  prix: z.number().min(0).nullable(),
  pmp: z.number().min(0).nullable().default(null),
  tauxTva: schemaTauxTva.default(20),
  seuil: z.number().int().min(0).default(0),
  fournisseur: z.string().trim().max(200).default(''),
  delaiJours: z.number().int().min(0).max(365).default(0),
  actif: z.boolean().default(true),
  historique: z.string().trim().max(300).default(''),
});
export type LigneArticle = z.infer<typeof ligneArticle>;

export interface Anomalie {
  ligne: number;
  reference: string;
  message: string;
}

export interface Analyse {
  articles: (LigneArticle & { ligne: number })[];
  anomalies: Anomalie[];
  ecartes: { ligne: number; reference: string }[];
  existants: string[];
  aCreer: number;
  valeur: number;
  protocole: number;
  retires: number;
  aValoriser: number;
  emplacementsInconnus: string[];
}

// --- Lecture du CSV ------------------------------------------------------------------------------

/** Colonnes du modèle d'import et de l'export du catalogue. */
export const COLONNES_CATALOGUE = [
  'reference',
  'libelle',
  'famille',
  'categorie',
  'emplacement',
  'stock',
  'prix',
  'pmp',
  'tva',
  'seuil',
  'actif',
  'fournisseur',
  'delai',
  'historique',
] as const;

const normaliser = (nom: string) =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** En-têtes reconnus : colonnes du modèle, et colonnes du classeur de propositions de reprise. */
const ALIAS: Record<string, string> = {
  reference: 'reference',
  'code article': 'reference',
  libelle: 'libelle',
  'libelle propose': 'libelle',
  'libelle article': 'libelle',
  famille: 'famille',
  categorie: 'categorie',
  emplacement: 'emplacement',
  stock: 'stock',
  'stock a reprendre': 'stock',
  'quantite en stock': 'stock',
  prix: 'prix',
  'prix unitaire': 'prix',
  'prix d achat': 'prix',
  'prix achat': 'prix',
  'prix d achat ttc': 'prix',
  pmp: 'pmp',
  tva: 'tva',
  'taux de tva': 'tva',
  'taux tva': 'tva',
  'prix moyen pondere': 'pmp',
  seuil: 'seuil',
  'seuil d alerte': 'seuil',
  actif: 'actif',
  fournisseur: 'fournisseur',
  delai: 'delai',
  'delai reappro': 'delai',
  historique: 'historique',
  'achats': 'achats',
  'sorties': 'sorties',
  decision: 'decision',
};

/** Texte d'un fichier : UTF-8, ou Windows-1252 (« CSV séparateur point-virgule » d'Excel). */
export function decoderFichier(contenu: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(contenu).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(contenu);
  }
}

/** Nombre écrit à la française ou non : « 1 234,50 », « 1234.5 », « 2,65 € ». Vide → null. */
function nombre(valeur: string | undefined): number | null {
  const propre = (valeur ?? '').replace(/[€\s  ]/g, '').replace(',', '.');
  if (propre === '') return null;
  const n = Number(propre);
  return Number.isFinite(n) ? n : NaN;
}

function categorie(valeur: string | undefined): string {
  const v = normaliser(valeur ?? '');
  if (v.startsWith('proto') || v === 'cadeau protocolaire') return 'Protocole';
  if (v.startsWith('good') || v === '') return 'Goodies';
  return valeur ?? '';
}

/** Lit un CSV de catalogue. Les lignes « Écarter » du classeur de reprise sont mises de côté. */
export function lireCsvCatalogue(texte: string): { lignes: { ligne: number; brut: Record<string, unknown> }[]; ecartes: { ligne: number; reference: string }[]; erreurs: Anomalie[] } {
  const enregistrements = parse<Record<string, string>>(texte, {
    columns: (entetes: string[]) => entetes.map((e) => ALIAS[normaliser(e)] ?? `ignore:${e}`),
    delimiter: detecterDelimiteur(texte),
    skip_empty_lines: true,
    trim: true,
    relax_quotes: true,
    relax_column_count: true,
  });
  const lignes: { ligne: number; brut: Record<string, unknown> }[] = [];
  const ecartes: { ligne: number; reference: string }[] = [];
  const erreurs: Anomalie[] = [];
  enregistrements.forEach((r, i) => {
    const ligne = i + 2;
    if (!Object.entries(r).some(([cle, v]) => !cle.startsWith('ignore:') && v)) return;
    if (normaliser(r.decision ?? '').startsWith('ecart')) {
      ecartes.push({ ligne, reference: r.reference ?? '' });
      return;
    }
    const stock = nombre(r.stock);
    const prix = nombre(r.prix);
    const pmp = nombre(r.pmp);
    const tva = nombre((r.tva ?? '').replace('%', ''));
    const seuil = nombre(r.seuil);
    const delai = nombre(r.delai);
    for (const [champ, v] of [['stock', stock], ['prix', prix], ['pmp', pmp], ['TVA', tva], ['seuil', seuil], ['délai', delai]] as const) {
      if (Number.isNaN(v)) erreurs.push({ ligne, reference: r.reference ?? '', message: `${champ} illisible` });
    }
    const historique =
      r.historique || (r.achats || r.sorties ? `achats cumulés ${r.achats || 0}, sorties cumulées ${r.sorties || 0}` : '');
    lignes.push({
      ligne,
      brut: {
        reference: r.reference,
        libelle: r.libelle,
        famille: r.famille,
        categorie: categorie(r.categorie),
        emplacement: r.emplacement,
        stockInitial: stock ?? 0,
        prix: prix === 0 ? null : prix,
        pmp: pmp === 0 ? null : pmp,
        tauxTva: tva ?? undefined,
        seuil: seuil ?? 0,
        fournisseur: r.fournisseur ?? '',
        delaiJours: delai ?? 0,
        actif: r.actif === undefined || r.actif === '' ? true : parseBoolFr(r.actif),
        historique,
      },
    });
  });
  return { lignes, ecartes, erreurs };
}

/** Valorisation de départ : le PMP du fichier (export d'une autre base), sinon le prix d'achat. */
export const valorisation = (a: LigneArticle): number | null => a.pmp ?? a.prix;

// --- Analyse et application -----------------------------------------------------------------------

/** Contrôle complet, sans écriture. Avec ajouterEmplacements, un emplacement inconnu n'est pas une anomalie. */
export async function analyserCatalogue(
  lignes: { ligne: number; brut: Record<string, unknown> }[],
  options: { emplacements?: string[]; emplacementProtocole?: string; ajouterEmplacements?: boolean; ecartes?: { ligne: number; reference: string }[]; erreurs?: Anomalie[] },
  executant: Executant = pool
): Promise<Analyse> {
  const parametres = await lireParametresStock(executant);
  const emplacements = options.emplacements ?? parametres.emplacements;
  const emplacementProtocole = options.emplacementProtocole ?? parametres.emplacementProtocole;
  const anomalies: Anomalie[] = [...(options.erreurs ?? [])];
  const articles: Analyse['articles'] = [];
  const vues = new Map<string, number>();
  const inconnus = new Set<string>();

  for (const { ligne, brut } of lignes) {
    const lu = ligneArticle.safeParse(brut);
    if (!lu.success) {
      const nomChamp = (c: string) => (c === 'tauxTva' ? 'TVA (20, 10, 5,5, 2,1 ou 0)' : c);
      const champs = [...new Set(lu.error.issues.map((e) => nomChamp(String(e.path[0]))))];
      anomalies.push({ ligne, reference: String(brut.reference ?? ''), message: `à compléter ou corriger : ${champs.join(', ')}` });
      continue;
    }
    const a = lu.data;
    if (vues.has(a.reference)) anomalies.push({ ligne, reference: a.reference, message: `référence déjà présente ligne ${vues.get(a.reference)}` });
    vues.set(a.reference, ligne);
    if (!emplacements.includes(a.emplacement)) {
      if (options.ajouterEmplacements) inconnus.add(a.emplacement);
      else anomalies.push({ ligne, reference: a.reference, message: `emplacement « ${a.emplacement} » absent de la liste (Stock → Paramètres)` });
    }
    if (a.categorie === 'Protocole' && a.emplacement !== emplacementProtocole) {
      anomalies.push({
        ligne,
        reference: a.reference,
        message: `un cadeau protocolaire se range en « ${emplacementProtocole} » (emplacement protocole défini dans Stock → Paramètres)`,
      });
    }
    articles.push({ ...a, ligne });
  }

  const existants = (
    await requete<{ reference: string }>('SELECT reference FROM stock_articles WHERE reference = ANY($1)', [[...vues.keys()]], executant)
  ).map((r) => r.reference);
  const aCreer = articles.filter((a) => !existants.includes(a.reference));
  return {
    articles,
    anomalies,
    ecartes: options.ecartes ?? [],
    existants,
    aCreer: aCreer.length,
    valeur: Math.round(aCreer.reduce((t, a) => t + a.stockInitial * (valorisation(a) ?? 0), 0) * 100) / 100,
    protocole: aCreer.filter((a) => a.categorie === 'Protocole').length,
    retires: aCreer.filter((a) => !a.actif).length,
    aValoriser: aCreer.filter((a) => valorisation(a) === null).length,
    emplacementsInconnus: [...inconnus],
  };
}

/** Écrit les articles nouveaux (et, s'il y a lieu, les emplacements ajoutés), en une transaction. */
export async function appliquerCatalogue(
  analyse: Analyse,
  options: { source: string; emplacements?: string[]; emplacementProtocole?: string; auteurId: string | null; auteurNom: string }
): Promise<number> {
  if (analyse.anomalies.length) throw new Error('Le fichier comporte des anomalies : import refusé');
  return transaction(async (client) => {
    const parametres = await lireParametresStock(client);
    const emplacements = [...(options.emplacements ?? parametres.emplacements), ...analyse.emplacementsInconnus];
    const emplacementProtocole = options.emplacementProtocole ?? parametres.emplacementProtocole;
    if (options.emplacements || options.emplacementProtocole || analyse.emplacementsInconnus.length) {
      await ecrireParametresStock({ ...parametres, emplacements: [...new Set(emplacements)], emplacementProtocole }, client);
    }
    let crees = 0;
    for (const a of analyse.articles) {
      if (analyse.existants.includes(a.reference)) continue;
      const article = await insererUn<{ _id: string }>(
        'stock_articles',
        {
          reference: a.reference,
          libelle: a.libelle,
          famille: a.famille,
          categorie: a.categorie,
          emplacement: a.emplacement,
          fournisseur: a.fournisseur,
          delaiJours: a.delaiJours,
          stockPhysique: a.stockInitial,
          seuil: a.seuil,
          pmp: valorisation(a) ?? 0,
          prixAchat: a.prix,
          tauxTva: a.tauxTva,
          aValoriser: valorisation(a) === null,
          actif: a.actif,
        },
        client
      );
      await creerMouvement(
        {
          type: 'Création',
          articleId: article._id,
          quantite: a.stockInitial,
          valeur: a.stockInitial * (valorisation(a) ?? 0),
          detail: [options.source, a.historique].filter(Boolean).join(' — '),
          statut: 'Appliqué',
          auteurId: options.auteurId,
          auteurNom: options.auteurNom,
        },
        client
      );
      crees++;
    }
    return crees;
  });
}

// --- Modèle et export ------------------------------------------------------------------------------

const cellulesCsv = (lignes: Record<string, unknown>[]) =>
  `﻿${stringify(lignes, { header: true, columns: [...COLONNES_CATALOGUE], delimiter: ';' })}`;

/** Modèle à remplir, avec deux lignes d'exemple. */
export function modeleCatalogue(): string {
  return cellulesCsv([
    { reference: 'G-001', libelle: 'Stylo bille corps liège', famille: 'Papeterie', categorie: 'Goodies', emplacement: 'Armoire A1', stock: 250, prix: '0,45', pmp: '', tva: 20, seuil: 50, actif: 'Oui', fournisseur: '', delai: 15, historique: '' },
    { reference: 'P-101', libelle: 'Médaille de la Ville (coffret)', famille: 'Médailles', categorie: 'Protocole', emplacement: 'Coffre', stock: 12, prix: '', pmp: '', tva: 20, seuil: 5, actif: 'Oui', fournisseur: '', delai: 30, historique: '' },
  ]);
}

/** Catalogue actuel, au format du modèle (réimportable). */
export function exporterCatalogue(articles: Article[]): string {
  return cellulesCsv(
    articles.map((a) => ({
      reference: a.reference,
      libelle: a.libelle,
      famille: a.famille,
      categorie: a.categorie,
      emplacement: a.emplacement,
      stock: a.stockPhysique,
      prix: a.prixAchat === null ? '' : String(a.prixAchat).replace('.', ','),
      pmp: a.aValoriser ? '' : String(a.pmp).replace('.', ','),
      tva: String(a.tauxTva).replace('.', ','),
      seuil: a.seuil,
      actif: a.actif ? 'Oui' : 'Non',
      fournisseur: a.fournisseur,
      delai: a.delaiJours,
      historique: '',
    }))
  );
}
