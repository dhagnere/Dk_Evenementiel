import { z } from 'zod';
import { BRANCHES, type Classement, type ContexteClassement } from './classement.js';
import type { Transfert } from './transferts.js';
import { formatParis } from './texte.js';

/**
 * Analyse complète d'un transfert par un service d'analyse de texte, facultative.
 *
 * Elle ne s'active que si la variable ANALYSE_API_CLE est renseignée (avec, au besoin, ANALYSE_MODELE et
 * ANALYSE_API_URL). Sans clé, le relevé se contente des règles de classement. En cas d'échec (réseau, quota,
 * réponse illisible), le mail est classé par les règles et l'erreur est notée dans l'historique du relevé.
 *
 * Données envoyées au service : le texte des mails du transfert et la liste des dossiers ouverts (codes,
 * titres, événements). C'est un traitement de données personnelles de tiers, à inscrire au registre RGPD.
 */

export const analyseActive = () => !!process.env.ANALYSE_API_CLE;

const URL_PAR_DEFAUT = 'https://api.anthropic.com/v1/messages';
const MODELE_PAR_DEFAUT = 'claude-sonnet-5-5';

const schemaReponse = z.object({
  dossier: z.string().nullable().optional(),
  evenement: z.string().nullable().optional(),
  branche: z.string().nullable().optional(),
  titre: z.string().max(300).nullable().optional(),
  resume: z.string().max(4000).nullable().optional(),
  priorite: z.enum(['Haute', 'Normale', 'Basse']).nullable().optional(),
  echeances: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), libelle: z.string().max(300) }))
    .max(15)
    .nullable()
    .optional(),
  actions: z.array(z.string().max(400)).max(15).nullable().optional(),
  vigilance: z.array(z.string().max(400)).max(10).nullable().optional(),
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
On te donne un ou plusieurs mails d'une même conversation, la liste des événements et des dossiers en cours.
Réponds UNIQUEMENT par un objet JSON, sans texte autour, avec ces clés :
- "dossier" : code d'un dossier existant si le mail le concerne clairement, sinon null (un nouveau dossier sera ouvert) ;
- "evenement" : code d'un événement de la liste, ou null ;
- "branche" : une de ${BRANCHES.map((b) => `"${b}"`).join(', ')}, ou null ;
- "titre" : titre court du dossier (pour un nouveau dossier) ;
- "resume" : résumé factuel du dossier à jour, en intégrant le résumé existant s'il y en a un (5 phrases au plus) ;
- "priorite" : "Haute", "Normale" ou "Basse" ;
- "echeances" : [{"date": "AAAA-MM-JJ", "libelle": "…"}] dates à tenir citées dans les mails ;
- "actions" : actions concrètes à mener par le service ;
- "vigilance" : points de vigilance (délai court, pièce manquante, contradiction, risque).
Écris en français, sans formules creuses. N'invente aucune information absente des mails.`;

/** Analyse un transfert. Renvoie null sans clé ; lève une erreur si le service répond mal. */
export async function analyser(
  t: Transfert,
  proposition: Classement,
  ctx: ContexteClassement,
  dossiers: DossierPourAnalyse[]
): Promise<ResultatAnalyse | null> {
  const cle = process.env.ANALYSE_API_CLE;
  if (!cle) return null;

  const ouverts = dossiers.filter((d) => !/^clos/i.test(d.statut)).slice(0, 150);
  const evenements = ctx.evenements.map((e) => `${e.code} | ${e.nom} | ${e.dateJour ?? 'date inconnue'}`).join('\n');
  const listeDossiers = ouverts
    .map((d) => `${d.code} | ${d.titre} | événement ${d.evenementCode || '—'} | ${d.branche || '—'}${d.code === proposition.dossier ? ` | résumé : ${d.resume.slice(0, 600)}` : ''}`)
    .join('\n');
  const mails = t.mails
    .map(
      (m, i) =>
        `--- Mail ${i + 1} (${m.sens}) ---\nDe : ${m.expediteurNom} ${m.expediteurAdresse ? `<${m.expediteurAdresse}>` : ''}\nDate : ${m.date ? formatParis(m.date) : 'inconnue'}\nÀ : ${m.destinataires}\nObjet : ${m.objet}\nPièces jointes : ${m.piecesJointes.map((p) => p.nom).join(', ') || 'aucune'}\n\n${m.corps.slice(0, 6000)}`
    )
    .join('\n\n');
  const contenu = `Date du jour : ${formatParis(new Date())}
Classement proposé par les règles : dossier ${proposition.dossier ?? 'nouveau'}, événement ${proposition.evenement || '—'}, branche ${proposition.branche || '—'}.
${t.consigne ? `Consigne du chef de service : ${t.consigne}\n` : ''}
Événements :
${evenements || '(aucun)'}

Dossiers en cours :
${listeDossiers || '(aucun)'}

${mails}`;

  const reponse = await fetch(process.env.ANALYSE_API_URL || URL_PAR_DEFAUT, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cle, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.ANALYSE_MODELE || MODELE_PAR_DEFAUT,
      max_tokens: 2000,
      system: CONSIGNES,
      messages: [{ role: 'user', content: contenu }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!reponse.ok) throw new Error(`service d'analyse : réponse ${reponse.status}`);
  const corps = (await reponse.json()) as { content?: { type: string; text?: string }[] };
  const texte = corps.content?.find((c) => c.type === 'text')?.text ?? '';
  const debut = texte.indexOf('{');
  const fin = texte.lastIndexOf('}');
  if (debut < 0 || fin < debut) throw new Error("service d'analyse : réponse sans JSON");
  const lu = schemaReponse.safeParse(JSON.parse(texte.slice(debut, fin + 1)));
  if (!lu.success) throw new Error("service d'analyse : réponse au mauvais format");
  const r = lu.data;
  // On ne garde que des références connues.
  if (r.dossier && !dossiers.some((d) => d.code === r.dossier)) r.dossier = null;
  if (r.evenement && !ctx.evenements.some((e) => e.code === r.evenement)) r.evenement = null;
  if (r.branche && !BRANCHES.includes(r.branche)) r.branche = null;
  return r;
}
