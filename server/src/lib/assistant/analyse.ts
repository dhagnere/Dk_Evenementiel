import { z } from 'zod';
import { BRANCHES, type Classement, type ContexteClassement } from './classement.js';
import { lireConfiguration } from './configuration.js';
import type { MailOrigine, PieceJointe } from './transferts.js';
import { formatParis } from './texte.js';

/**
 * Analyse complète d'un ou plusieurs mails par un service d'analyse de texte, facultative : elle lit les
 * mails et leurs pièces jointes (PDF, y compris scannés, et images), rédige le résumé du dossier, les
 * actions, les points de vigilance, les échéances, le suivi budgétaire et un brouillon de réponse, et
 * propose le classement.
 *
 * Active dès qu'une clé est enregistrée (onglet Assistant → état et réglages, ou ANALYSE_API_CLE). Sans
 * clé, le classement se fait par règles. En cas d'échec (réseau, quota, réponse illisible), les règles
 * prennent le relais et l'erreur est notée dans l'historique des mises à jour.
 *
 * Données envoyées au service : le texte des mails, leurs pièces jointes lisibles et la liste des dossiers
 * en cours (codes, titres, événements). Traitement de données personnelles de tiers : registre RGPD.
 */

const URL_PAR_DEFAUT = 'https://api.anthropic.com/v1/messages';
const MODELE_PAR_DEFAUT = 'claude-sonnet-5-5';

/** Pièces jointes envoyées à l'analyse : au plus 4, 8 Mo chacune, 16 Mo en tout. */
const PIECES_MAX = 4;
const TAILLE_PIECE_MAX = 8 * 1024 * 1024;
const TAILLE_TOTALE_MAX = 16 * 1024 * 1024;
const IMAGES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export async function analyseActive(): Promise<boolean> {
  return !!(await lireConfiguration()).cleAnalyse;
}

const schemaReponse = z.object({
  dossier: z.string().nullable().optional(),
  evenement: z.string().nullable().optional(),
  branche: z.string().nullable().optional(),
  titre: z.string().max(300).nullable().optional(),
  resume: z.string().max(4000).nullable().optional(),
  priorite: z.enum(['Haute', 'Normale', 'Basse']).nullable().optional(),
  statut: z.string().max(80).nullable().optional(),
  echeances: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), libelle: z.string().max(300) }))
    .max(15)
    .nullable()
    .optional(),
  actions: z.array(z.string().max(400)).max(15).nullable().optional(),
  vigilance: z.array(z.string().max(400)).max(10).nullable().optional(),
  budget: z
    .array(
      z.object({
        type: z.string().max(60).nullable().optional(),
        reference: z.string().max(120).nullable().optional(),
        fournisseur: z.string().max(200).nullable().optional(),
        montant_ttc: z.number().nullable().optional(),
      })
    )
    .max(15)
    .nullable()
    .optional(),
  brouillon: z.string().max(4000).nullable().optional(),
});
export type ResultatAnalyse = z.infer<typeof schemaReponse>;

export interface DossierPourAnalyse {
  code: string;
  titre: string;
  evenementCode: string;
  branche: string;
  statut: string;
  resume: string;
}

const CONSIGNES = `Tu aides le chef du service événementiel d'une collectivité (Communauté urbaine et Ville de Dunkerque) à suivre son courrier.
On te donne un ou plusieurs mails d'une même conversation, leurs pièces jointes éventuelles, la liste des événements et des dossiers en cours.
Lis tout, y compris les pièces jointes (devis, bons de commande, conventions, dossiers de sécurité, scans).
Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec ces clés :
- "dossier" : code d'un dossier existant si le mail le concerne clairement, sinon null (un nouveau dossier sera ouvert) ;
- "evenement" : code d'un événement de la liste, ou null ;
- "branche" : une de ${BRANCHES.map((b) => `"${b}"`).join(', ')}, ou null ;
- "titre" : titre court et parlant du dossier ;
- "resume" : résumé factuel du dossier à jour, en intégrant le résumé existant s'il y en a un (5 phrases au plus) ;
- "priorite" : "Haute", "Normale" ou "Basse" ;
- "statut" : un de "À traiter", "En attente de réponse", "En attente de validation", "En cours", "Répondu", "Pour information", "Clos" ;
- "echeances" : [{"date": "AAAA-MM-JJ", "libelle": "…"}] dates à tenir, citées dans les mails ou les pièces jointes ;
- "actions" : actions concrètes à mener par le service ;
- "vigilance" : points de vigilance (délai court, pièce manquante, contradiction, risque) ;
- "budget" : [{"type": "Devis|Bon de commande|Facture|…", "reference": "…", "fournisseur": "…", "montant_ttc": nombre ou null}] pour chaque document financier ;
- "brouillon" : proposition de réponse courte au dernier mail reçu, au nom du chef de service, ou null si aucune réponse n'est attendue.
Écris en français, sans formules creuses. N'invente aucune information absente des mails et des pièces jointes.`;

export interface EntreeAnalyse {
  mails: MailOrigine[];
  consigne: string;
  pieces?: PieceJointe[];
}

/** Erreur du service d'analyse, au message neutre. */
export class AnalyseImpossible extends Error {}

/** Blocs de pièces jointes lisibles par le service (PDF et images), dans les limites de taille. */
function blocsPieces(pieces: PieceJointe[]): unknown[] {
  const blocs: unknown[] = [];
  let total = 0;
  for (const p of pieces) {
    if (!p.contenu || blocs.length >= PIECES_MAX) continue;
    const type = p.type.toLowerCase();
    const estPdf = type === 'application/pdf' || /\.pdf$/i.test(p.nom);
    const estImage = IMAGES.includes(type);
    if (!estPdf && !estImage) continue;
    if (p.contenu.length > TAILLE_PIECE_MAX || total + p.contenu.length > TAILLE_TOTALE_MAX) continue;
    total += p.contenu.length;
    const source = { type: 'base64', media_type: estPdf ? 'application/pdf' : type, data: p.contenu.toString('base64') };
    blocs.push(estPdf ? { type: 'document', source, title: p.nom } : { type: 'image', source });
  }
  return blocs;
}

/** Analyse des mails. Renvoie null sans clé ; lève AnalyseImpossible si le service répond mal. */
export async function analyser(
  entree: EntreeAnalyse,
  proposition: Classement,
  ctx: ContexteClassement,
  dossiers: DossierPourAnalyse[]
): Promise<ResultatAnalyse | null> {
  const config = await lireConfiguration();
  if (!config.cleAnalyse) return null;

  const ouverts = dossiers.filter((d) => !/^clos/i.test(d.statut) || d.code === proposition.dossier).slice(0, 150);
  const evenements = ctx.evenements.map((e) => `${e.code} | ${e.nom} | ${e.dateJour ?? 'date inconnue'}`).join('\n');
  const listeDossiers = ouverts
    .map(
      (d) =>
        `${d.code} | ${d.titre} | événement ${d.evenementCode || '—'} | ${d.branche || '—'}${d.code === proposition.dossier ? ` | résumé actuel : ${d.resume.slice(0, 800)}` : ''}`
    )
    .join('\n');
  const mails = entree.mails
    .map(
      (m, i) =>
        `--- Mail ${i + 1} (${m.sens}) ---\nDe : ${m.expediteurNom} ${m.expediteurAdresse ? `<${m.expediteurAdresse}>` : ''}\nDate : ${m.date ? formatParis(m.date) : 'inconnue'}\nÀ : ${m.destinataires}\nObjet : ${m.objet}\nPièces jointes : ${m.piecesJointes.map((p) => p.nom).join(', ') || 'aucune'}\n\n${m.corps.slice(0, 6000)}`
    )
    .join('\n\n');
  const texte = `Date du jour : ${formatParis(new Date())}
Classement proposé par les règles : dossier ${proposition.dossier ?? 'nouveau'}, événement ${proposition.evenement || '—'}, branche ${proposition.branche || '—'}.
${entree.consigne ? `Consigne du chef de service : ${entree.consigne}\n` : ''}
Événements :
${evenements || '(aucun)'}

Dossiers en cours :
${listeDossiers || '(aucun)'}

${mails}`;
  const pieces = blocsPieces(entree.pieces ?? entree.mails.flatMap((m) => m.piecesJointes));

  let reponse: Response;
  try {
    reponse = await fetch(process.env.ANALYSE_API_URL || URL_PAR_DEFAUT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.cleAnalyse, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: config.modeleAnalyse || MODELE_PAR_DEFAUT,
        max_tokens: 3000,
        system: CONSIGNES,
        messages: [{ role: 'user', content: [...pieces, { type: 'text', text: texte }] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (e) {
    console.error("[assistant] Service d'analyse injoignable :", (e as Error).message);
    throw new AnalyseImpossible("Service d'analyse injoignable pour le moment");
  }
  if (!reponse.ok) {
    console.error("[assistant] Service d'analyse :", reponse.status, (await reponse.text().catch(() => '')).slice(0, 300));
    throw new AnalyseImpossible(
      reponse.status === 401 || reponse.status === 403
        ? "Clé du service d'analyse refusée : vérifiez-la dans « état et réglages »"
        : reponse.status === 429
          ? "Service d'analyse saturé ou crédit épuisé : nouvel essai à la prochaine mise à jour"
          : `Service d'analyse en erreur (${reponse.status})`
    );
  }
  const corps = (await reponse.json()) as { content?: { type: string; text?: string }[] };
  const sortie = corps.content?.find((c) => c.type === 'text')?.text ?? '';
  const debut = sortie.indexOf('{');
  const fin = sortie.lastIndexOf('}');
  if (debut < 0 || fin < debut) throw new AnalyseImpossible("Réponse du service d'analyse illisible");
  let lu;
  try {
    lu = schemaReponse.safeParse(JSON.parse(sortie.slice(debut, fin + 1)));
  } catch {
    throw new AnalyseImpossible("Réponse du service d'analyse illisible");
  }
  if (!lu.success) throw new AnalyseImpossible("Réponse du service d'analyse au mauvais format");
  const r = lu.data;
  // On ne garde que des références connues.
  if (r.dossier && !dossiers.some((d) => d.code === r.dossier)) r.dossier = null;
  if (r.evenement && !ctx.evenements.some((e) => e.code === r.evenement)) r.evenement = null;
  if (r.branche && !BRANCHES.includes(r.branche)) r.branche = null;
  return r;
}

/** Essaie une clé avant de l'enregistrer (appel minimal). */
export async function testerCleAnalyse(cle: string, modele: string): Promise<void> {
  let reponse: Response;
  try {
    reponse = await fetch(process.env.ANALYSE_API_URL || URL_PAR_DEFAUT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: modele || MODELE_PAR_DEFAUT, max_tokens: 5, messages: [{ role: 'user', content: 'Réponds OK.' }] }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new AnalyseImpossible("Service d'analyse injoignable pour le moment");
  }
  if (reponse.status === 401 || reponse.status === 403) throw new AnalyseImpossible('Clé refusée par le service d’analyse');
  if (reponse.status === 404 || reponse.status === 400) throw new AnalyseImpossible('Modèle inconnu du service d’analyse : laissez le champ vide');
  if (!reponse.ok && reponse.status !== 429) throw new AnalyseImpossible(`Service d'analyse en erreur (${reponse.status})`);
}

/** Fusionne une analyse dans la fiche d'un dossier (nouveau ou existant). */
export function appliquerAnalyse(donnees: Record<string, unknown>, a: ResultatAnalyse, nouveau: boolean): void {
  const liste = <T>(cle: string) => (Array.isArray(donnees[cle]) ? (donnees[cle] as T[]) : []);
  const uniques = (l: string[]) => [...new Set(l.map((s) => s.trim()).filter(Boolean))];
  if (a.resume) donnees.resume = a.resume;
  if (a.titre && nouveau) donnees.titre = a.titre;
  if (a.priorite && nouveau) donnees.priorite = a.priorite;
  if (a.actions) donnees.actions = uniques([...liste<string>('actions'), ...a.actions]);
  if (a.vigilance) donnees.vigilance = uniques([...liste<string>('vigilance'), ...a.vigilance]);
  if (a.echeances) {
    const ech = liste<{ date?: string; libelle?: string; source?: string }>('echeances').filter((e) => e.source !== 'mail' || !nouveau);
    for (const e of a.echeances) if (!ech.some((x) => x.date === e.date)) ech.push({ ...e, source: 'analyse' });
    donnees.echeances = ech.sort((x, y) => (x.date ?? '').localeCompare(y.date ?? ''));
  }
  if (a.budget) {
    const b = liste<Record<string, unknown>>('budget');
    for (const l of a.budget) {
      const deja = b.some((x) => (l.reference && x.reference === l.reference) || (x.fournisseur === l.fournisseur && x.montant_ttc === l.montant_ttc));
      if (!deja) b.push({ ...l, statut_lecture: l.montant_ttc == null ? 'montant non trouvé' : 'lu par l’analyse' });
    }
    donnees.budget = b;
  }
  if (a.brouillon !== undefined) donnees.brouillon = a.brouillon;
  donnees.analyse = new Date().toISOString();
}
