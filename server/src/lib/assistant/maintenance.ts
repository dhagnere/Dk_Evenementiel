import { executer, requete, requeteUne } from '../../db.js';
import { lireConfiguration } from './configuration.js';
import { sansSignature } from './transferts.js';

/**
 * Remise au propre, une seule fois, des mails déjà enregistrés avant le retrait des signatures :
 * corps et consignes sans signature ni liens de mise en forme, remarques nettoyées, échéances tirées
 * d'une ligne d'en-tête (« Envoyé : … ») retirées.
 */
const CLE = 'nettoyage-signatures-1';
const EN_TETE = /^\s*(envoy[ée]|date|sent|de|from|objet|subject)\s*:/i;

const nomsDesAdresses = (adresses: string[]) =>
  adresses.map((a) => a.split('@')[0].replace(/[._-]+/g, ' ')).filter((n) => n.split(' ').length >= 2);

const propre = (texte: string, noms: string[]) => {
  const l = sansSignature(texte.split('\n'), noms);
  while (l.length && !l[l.length - 1].trim()) l.pop();
  while (l.length && !l[0].trim()) l.shift();
  return l.join('\n').replace(/\n{3,}/g, '\n\n');
};

export async function nettoyerAnciensMails(): Promise<void> {
  if (await requeteUne("SELECT 1 FROM assistant_config WHERE cle = $1", [CLE])) return;
  const c = await lireConfiguration();
  const nomsService = nomsDesAdresses(c.adressesService);

  const mails = await requete<{ _id: string; expediteur: string; corps: string; consigne: string }>(
    "SELECT id, expediteur, corps, consigne FROM assistant_mails WHERE source = 'releve'"
  );
  for (const m of mails) {
    const corps = propre(m.corps, [m.expediteur, ...nomsService]);
    const consigne = propre(m.consigne, nomsService);
    if (corps !== m.corps || consigne !== m.consigne) {
      await executer('UPDATE assistant_mails SET corps = $2, consigne = $3 WHERE id = $1', [m._id, corps, consigne]);
    }
  }

  const dossiers = await requete<{ code: string; source: string; donnees: Record<string, unknown> }>(
    "SELECT code, source, donnees FROM assistant_dossiers WHERE donnees ? 'remarques' OR source = 'releve' OR donnees::text ~ 'Envoy'"
  );
  for (const d of dossiers) {
    const donnees = { ...d.donnees };
    let change = false;
    if (Array.isArray(donnees.remarques)) {
      const r = (donnees.remarques as string[]).map((x) => propre(x, nomsService)).filter(Boolean);
      if (JSON.stringify(r) !== JSON.stringify(donnees.remarques)) {
        donnees.remarques = [...new Set(r)];
        change = true;
      }
    }
    if (Array.isArray(donnees.echeances)) {
      const e = (donnees.echeances as { libelle?: string; source?: string }[]).filter((x) => !(x.source === 'mail' && EN_TETE.test(x.libelle ?? '')));
      if (e.length !== (donnees.echeances as unknown[]).length) {
        donnees.echeances = e;
        change = true;
      }
    }
    if (d.source === 'releve' && typeof donnees.resume === 'string' && donnees.origine === 'releve' && !donnees.analyse) {
      const r = propre(donnees.resume, nomsService).replace(/\s+/g, ' ').trim();
      if (r !== donnees.resume) {
        donnees.resume = r;
        change = true;
      }
    }
    if (change) await executer('UPDATE assistant_dossiers SET donnees = $2 WHERE code = $1', [d.code, JSON.stringify(donnees)]);
  }
  await executer("INSERT INTO assistant_config (cle, valeur, par) VALUES ($1, '{}'::jsonb, 'maintenance') ON CONFLICT DO NOTHING", [CLE]);
  if (mails.length) console.log(`[assistant] ${mails.length} mail(s) remis au propre (signatures retirées)`);
}
