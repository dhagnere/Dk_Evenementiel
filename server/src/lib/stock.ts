import { z } from 'zod';
import { executer, insererUn, pool, requete, requeteUne, type Executant } from '../db.js';
import { config } from '../config.js';
import { envoyerEmail } from './email.js';

/**
 * Règles de gestion du module Stock & Protocole (reprises de la maquette maquettes/stock-goodies) :
 *
 * - disponible = stock physique - stock réservé ; une demande réserve sa quantité dès son dépôt ;
 * - circuit d'une demande : cadeau protocolaire → avis du Protocole puis validation du Cabinet ;
 *   goodies → validation automatique jusqu'au seuil (150 € par défaut), chef de service au-delà ;
 * - une demande à moins de 10 jours du besoin est « tardive » et doit être motivée ;
 * - un ajustement de plus de 50 € ou portant sur un cadeau protocolaire passe par une validation ;
 * - une réception met à jour le stock et le prix moyen pondéré (PMP), et signale les écarts ;
 * - personne ne valide sa propre demande ni son propre ajustement (sauf super-administrateur).
 */

export const schemaParametresStock = z.object({
  seuilValidationAutomatique: z.number().min(0).max(100000),
  seuilValidationAjustement: z.number().min(0).max(100000),
  delaiDemandeTardiveJours: z.number().int().min(0).max(365),
  relanceDeportJours: z.number().int().min(1).max(365),
  emplacements: z.array(z.string().trim().min(1).max(100)).min(1).max(100),
  emplacementProtocole: z.string().trim().min(1).max(100),
});
export type ParametresStock = z.infer<typeof schemaParametresStock>;

const PARAMETRES_PAR_DEFAUT: ParametresStock = {
  seuilValidationAutomatique: 150,
  seuilValidationAjustement: 50,
  delaiDemandeTardiveJours: 10,
  relanceDeportJours: 30,
  emplacements: ['Central · A1', 'Central · A2', 'Central · B1', 'Central · B2', 'Central · B3', 'Central · Coffre'],
  emplacementProtocole: 'Central · Coffre',
};

export async function lireParametresStock(executant: Executant = pool): Promise<ParametresStock> {
  const ligne = await requeteUne<{ valeur: unknown }>("SELECT valeur FROM parametres WHERE cle = 'stock'", [], executant);
  const lu = schemaParametresStock.safeParse({ ...PARAMETRES_PAR_DEFAUT, ...(ligne?.valeur as object) });
  return lu.success ? lu.data : PARAMETRES_PAR_DEFAUT;
}

export async function ecrireParametresStock(parametres: ParametresStock, executant: Executant = pool): Promise<void> {
  await executer(
    `INSERT INTO parametres (cle, valeur) VALUES ('stock', $1)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [JSON.stringify(parametres)],
    executant
  );
}

export interface Article {
  _id: string;
  reference: string;
  libelle: string;
  famille: string;
  categorie: 'Goodies' | 'Protocole';
  emplacement: string;
  fournisseur: string;
  delaiJours: number;
  stockPhysique: number;
  stockReserve: number;
  seuil: number;
  pmp: number;
  prixAchat: number | null;
  aValoriser: boolean;
  actif: boolean;
}

export interface Demande {
  _id: string;
  numero: string;
  directionId: string | null;
  directionNom: string;
  evenement: string;
  articleId: string;
  quantite: number;
  dateBesoin: string;
  motifTardif: string;
  beneficiaire: string;
  occasion: string;
  elu: string;
  valeur: number;
  circuit: 'automatique' | 'chef de service' | 'protocole';
  statut: string;
  motifRefus: string;
  demandeurId: string | null;
  demandeurNom: string;
  historique: EtapeHistorique[];
  prixUnitaireLivre: number | null;
  valeurLivree: number | null;
  remiseLe: Date | null;
  createdAt: Date;
}

export interface EtapeHistorique {
  date: string;
  action: string;
  par: string;
  motif?: string;
}

export const STATUTS_EN_ATTENTE = ['En attente chef de service', 'En attente Protocole', 'En attente Cabinet'];

export const arrondi = (montant: number) => Math.round(montant * 100) / 100;

/** Verrouille un article pour la durée de la transaction (évite deux réservations concurrentes). */
export async function verrouillerArticle(id: string, executant: Executant): Promise<Article | null> {
  return requeteUne<Article>('SELECT * FROM stock_articles WHERE id = $1 FOR UPDATE', [id], executant);
}

async function prochainNumero(sequence: 'stock_demandes_numero' | 'stock_mouvements_numero', executant: Executant): Promise<number> {
  const ligne = await requeteUne<{ n: number }>(`SELECT nextval('${sequence}') AS n`, [], executant);
  return ligne!.n;
}

export async function numeroDemande(executant: Executant): Promise<string> {
  const n = await prochainNumero('stock_demandes_numero', executant);
  return `D-${new Date().getFullYear()}-${String(n).padStart(4, '0')}`;
}

export interface NouveauMouvement {
  type: string;
  articleId: string;
  quantite: number;
  valeur?: number;
  detail?: string;
  motif?: string;
  statut: string;
  demandeId?: string;
  receptionId?: string;
  depotId?: string;
  auteurId: string | null;
  auteurNom: string;
}

export async function creerMouvement(m: NouveauMouvement, executant: Executant) {
  const n = await prochainNumero('stock_mouvements_numero', executant);
  return insererUn<{ _id: string; numero: string }>(
    'stock_mouvements',
    { ...m, valeur: arrondi(m.valeur ?? 0), numero: `M-${String(n).padStart(4, '0')}` },
    executant
  );
}

/** Applique une variation au stock physique d'un article (refus si le stock réservé serait entamé). */
export async function varierStockPhysique(articleId: string, variation: number, executant: Executant): Promise<void> {
  const modifies = await executer(
    `UPDATE stock_articles SET stock_physique = stock_physique + $2
      WHERE id = $1 AND stock_physique + $2 >= stock_reserve`,
    [articleId, variation],
    executant
  );
  if (modifies === 0) throw new ErreurMetier('Stock insuffisant : le stock réservé serait entamé');
}

/** Erreur prévue par les règles de gestion, renvoyée telle quelle à l'utilisateur. */
export class ErreurMetier extends Error {}

/** Circuit de validation d'une demande, selon la catégorie et la valeur. */
export function circuitDemande(article: Article, valeur: number, parametres: ParametresStock) {
  if (article.categorie === 'Protocole') return { circuit: 'protocole' as const, statut: 'En attente Protocole' };
  return valeur <= parametres.seuilValidationAutomatique
    ? { circuit: 'automatique' as const, statut: 'Validée auto' }
    : { circuit: 'chef de service' as const, statut: 'En attente chef de service' };
}

/** Nombre de jours entre aujourd'hui et une date AAAA-MM-JJ (négatif si passée). */
export function joursAvant(dateIso: string): number {
  const aujourdhui = new Date();
  const debut = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const [a, m, j] = dateIso.split('-').map(Number);
  return Math.round((Date.UTC(a, m - 1, j) - debut) / 86_400_000);
}

/** Nouveau PMP après une entrée : moyenne pondérée de l'existant (sauf article à valoriser) et de l'entrée. */
export function nouveauPmp(article: Pick<Article, 'stockPhysique' | 'pmp' | 'aValoriser'>, quantite: number, prix: number): number {
  const base = article.aValoriser ? 0 : article.stockPhysique;
  const total = base + quantite;
  if (total <= 0) return article.pmp;
  return Math.round(((base * (article.aValoriser ? 0 : article.pmp) + quantite * prix) / total) * 10000) / 10000;
}

/** Référence suivante d'une catégorie : G-001, G-002… pour les goodies, P-101… pour le protocole. */
export async function prochaineReference(categorie: 'Goodies' | 'Protocole', executant: Executant): Promise<string> {
  const prefixe = categorie === 'Protocole' ? 'P-' : 'G-';
  const plancher = categorie === 'Protocole' ? 100 : 0;
  const ligne = await requeteUne<{ max: number | null }>(
    `SELECT max(substring(reference FROM 3)::int) AS max FROM stock_articles
      WHERE reference ~ $1`,
    [`^${prefixe}[0-9]+$`],
    executant
  );
  return `${prefixe}${String(Math.max(ligne?.max ?? 0, plancher) + 1).padStart(3, '0')}`;
}

// --- Notifications -------------------------------------------------------------------------------

function lien(chemin: string): string {
  return `${config.appUrl.replace(/\/$/, '')}${chemin}`;
}

/** Adresses des comptes ayant au moins le niveau validation sur le module, à défaut des super-administrateurs. */
async function adressesValideurs(): Promise<string[]> {
  const valideurs = await requete<{ email: string }>(
    `SELECT DISTINCT u.email FROM utilisateurs u JOIN droits_modules d ON d.utilisateur_id = u.id
      WHERE d.module = 'stock' AND d.niveau IN ('validation', 'administration') AND u.statut = 'Actif'`
  );
  if (valideurs.length > 0) return valideurs.map((v) => v.email);
  const admins = await requete<{ email: string }>("SELECT email FROM utilisateurs WHERE super_admin AND statut = 'Actif'");
  return admins.map((a) => a.email);
}

async function envoyer(to: string[], sujet: string, lignes: string[], chemin: string): Promise<void> {
  if (to.length === 0) return;
  const url = lien(chemin);
  const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  await envoyerEmail({
    to,
    subject: sujet,
    text: [...lignes, '', url].join('\n'),
    html: `${lignes.map((l) => `<p>${echapper(l)}</p>`).join('')}<p><a href="${url}">Ouvrir DK Événementiel</a></p>`,
  });
}

/** Notifications best-effort : un échec d'envoi n'annule jamais l'opération. */
export function notifier(promesse: Promise<void>): void {
  promesse.catch((err) => console.error('[stock] Échec de notification :', err));
}

export async function notifierDemandeAValider(demande: Demande, article: Article): Promise<void> {
  await envoyer(
    await adressesValideurs(),
    `Demande ${demande.numero} à valider — ${demande.statut.replace('En attente ', '')}`,
    [
      `${demande.directionNom} demande ${demande.quantite} × ${article.libelle} pour « ${demande.evenement} ».`,
      `Besoin le ${demande.dateBesoin.split('-').reverse().join('/')}. Statut : ${demande.statut}.`,
    ],
    '/stock/validations'
  );
}

export async function notifierDemandeur(demande: Demande, message: string): Promise<void> {
  if (!demande.demandeurId) return;
  const compte = await requeteUne<{ email: string }>("SELECT email FROM utilisateurs WHERE id = $1 AND statut <> 'Suspendu'", [
    demande.demandeurId,
  ]);
  if (!compte) return;
  await envoyer([compte.email], `Demande ${demande.numero} : ${demande.statut}`, [message], '/stock/demandes');
}

export async function notifierRelanceDepot(email: string, direction: string, jours: number | null): Promise<void> {
  await envoyer(
    [email],
    `Stock déporté ${direction} : déclaration attendue`,
    [
      jours === null
        ? `Aucune déclaration n'a encore été faite pour le stock déporté de ${direction}.`
        : `Aucune déclaration n'a été faite depuis ${jours} jours pour le stock déporté de ${direction}.`,
      'Merci de déclarer les sorties et retours de goodies depuis l’écran « Mon stock déporté ».',
    ],
    '/stock/mon-depot'
  );
}
