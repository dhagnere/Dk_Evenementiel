import type pg from 'pg';
import { executer, insererUn, pool, requete, requeteUne, transaction } from '../../db.js';
import { enregistrerFichier, lireObjet, stockageActif } from '../stockage.js';
import { connecter, ConnexionImpossible, empreinteIdentifiants, estConfiguree, lireConfiguration, masquer } from './configuration.js';
import { AnalyseImpossible, analyseActive, analyser, appliquerAnalyse, type DossierPourAnalyse, type ResultatAnalyse } from './analyse.js';
import { classer, contactsDe, lireConsigne, type Classement, type ContexteClassement } from './classement.js';
import { detecterEcheances } from './echeances.js';
import { nettoyerAnciensMails } from './maintenance.js';
import { lancementImmediatConfigure, lireReglagesOutlook, prochainPassageOutlook } from './outlook.js';
import { formatParis, objetDeFil } from './texte.js';
import { decoderTransfert, empreinteDe, type MailOrigine, type PieceJointe, type Transfert } from './transferts.js';

/**
 * Mise à jour automatique des dossiers : lecture des nouveaux mails de la messagerie de l'assistant, toutes
 * les N minutes (réglage à l'écran ou ASSISTANT_RELEVE_MINUTES, 15 par défaut) et à la demande depuis
 * l'onglet. La messagerie est lue sans rien y modifier ; le serveur retient le dernier message lu (UID).
 * Réglages : voir configuration.ts. Les pièces jointes sont copiées dans le stockage de l'application
 * quand il est configuré (S3), pour être téléchargées depuis la fiche du dossier.
 */

/** Au plus autant de messages par relevé : le reste attend le relevé suivant. */
const MESSAGES_PAR_RELEVE = 200;
/** Les numéros des mails relevés commencent ici, pour ne jamais croiser ceux d'un index importé. */
const PREMIER_NUMERO = 100_000;
/** Au-delà, une pièce jointe n'est pas copiée (elle reste citée dans la fiche). */
const TAILLE_MAX_PIECE = 25 * 1024 * 1024;

export class ReleveImpossible extends Error {}

export interface BilanReleve {
  lus: number;
  nouveaux: number;
  doublons: number;
  dossiersCrees: number;
  analyses: number;
  /** Messages ignorés : envoyés directement à la messagerie de l'assistant, pas transférés par le service. */
  ignores: number;
  erreur: string;
}

interface DossierEnBase {
  code: string;
  evenementCode: string;
  branche: string;
  titre: string;
  statut: string;
  priorite: string;
  source: string;
  donnees: Record<string, unknown>;
}

async function chargerContexte(adressesService: string[]): Promise<{ ctx: ContexteClassement; dossiers: DossierEnBase[] }> {
  const [dossiers, evenements, fils] = await Promise.all([
    requete<DossierEnBase>('SELECT code, evenement_code, branche, titre, statut, priorite, source, donnees FROM assistant_dossiers'),
    requete<{ code: string; nom: string; dateJour: string | null }>('SELECT code, nom, date_jour FROM assistant_evenements'),
    requete<{ objet: string; dossierCode: string }>("SELECT objet, dossier_code FROM assistant_mails WHERE dossier_code <> '' ORDER BY numero"),
  ]);
  const ctx: ContexteClassement = {
    dossiers: dossiers.map((d) => ({ code: d.code, evenementCode: d.evenementCode, branche: d.branche, statut: d.statut, contacts: contactsDe(d.donnees) })),
    evenements,
    fils: new Map(),
    adressesService: new Set(adressesService),
  };
  for (const f of fils) {
    const cle = objetDeFil(f.objet);
    if (cle.length >= 4) ctx.fils.set(cle, f.dossierCode);
  }
  return { ctx, dossiers };
}

/** Classement d'un transfert : le mail le plus parlant décide pour toute la conversation. */
function classerTransfert(t: Transfert, nouveaux: MailOrigine[], ctx: ContexteClassement): Classement {
  const consigne = lireConsigne(t.consigne, t.hashtags, ctx);
  const propositions = [...nouveaux].reverse().map((m) => classer(m, consigne, ctx));
  const rang: Record<string, number> = { consigne: 0, fil: 1, expediteur: 2, evenement: 3, nouveau: 4 };
  return propositions.sort((a, b) => rang[a.motif] - rang[b.motif])[0];
}

const taille = (o: number) => (o >= 1_048_576 ? `${(o / 1_048_576).toFixed(1).replace('.', ',')} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);
const sansDoublons = (liste: string[]) => [...new Set(liste.map((s) => s.trim()).filter(Boolean))];

/** Retire l'adresse de la messagerie de l'assistant des destinataires : elle n'a pas à apparaître à l'écran. */
function masquerBoite(destinataires: string, boite: string): string {
  if (!boite) return destinataires;
  return destinataires
    .split(/\s*[;,]\s*/)
    .filter((d) => d && !d.toLowerCase().includes(boite))
    .join(', ');
}

/** Copie les pièces jointes dans le stockage de l'application (si configuré). Une erreur n'arrête pas la mise à jour. */
async function copierPieces(pieces: PieceJointe[], bilan: BilanReleve): Promise<string[]> {
  const ids: string[] = [];
  if (!stockageActif()) return ids;
  for (const p of pieces) {
    if (!p.contenu || p.contenu.length === 0 || p.contenu.length > TAILLE_MAX_PIECE) continue;
    try {
      const f = await enregistrerFichier({
        contenu: p.contenu,
        nomOrigine: p.nom,
        typeMime: p.type || 'application/octet-stream',
        module: 'assistant',
        rattachement: '',
        deposePar: null,
      });
      p.fichierId = f._id;
      ids.push(f._id);
    } catch (e) {
      console.error('[assistant] Pièce jointe non copiée :', (e as Error).message);
      bilan.erreur = bilan.erreur || "Une pièce jointe n'a pas pu être copiée";
    }
  }
  return ids;
}
const sansContenu = (p: PieceJointe) => ({
  nom: p.nom,
  type: p.type,
  taille: p.taille,
  ...(p.fichierId ? { fichierId: p.fichierId } : {}),
  ...(p.onedrive ? { onedrive: { ...p.onedrive, le: new Date().toISOString() } } : {}),
});

/** Prochain code de dossier ouvert par le relevé : M001, M002… */
async function prochainCode(client: pg.PoolClient): Promise<string> {
  const r = await requeteUne<{ n: number }>(
    "SELECT coalesce(max(substring(code from 2)::int), 0) + 1 AS n FROM assistant_dossiers WHERE code ~ '^M[0-9]+$'",
    [],
    client
  );
  return `M${String(r!.n).padStart(3, '0')}`;
}

/** Enregistre un transfert décodé : mails au registre, dossier existant enrichi ou nouveau dossier. */
async function enregistrer(
  t: Transfert,
  lien: string,
  ctx: ContexteClassement,
  dossiers: DossierEnBase[],
  bilan: BilanReleve,
  boite = '',
  /** Analyse déjà faite (mails lus dans Outlook Web) : utilisée telle quelle, sans appeler le service. */
  fournie?: ResultatAnalyse | null
): Promise<string | null> {
  // Mails déjà au registre (transférés deux fois) : ignorés.
  const vus = new Set<string>();
  const nouveaux: { m: MailOrigine; empreinte: string }[] = [];
  for (const m of t.mails) {
    const empreinte = empreinteDe(m);
    const dejaDansIndex =
      !!m.date &&
      (await requete<{ objet: string }>("SELECT objet FROM assistant_mails WHERE source = 'index' AND date = $1", [formatParis(m.date)])).some(
        (x) => objetDeFil(x.objet) === objetDeFil(m.objet)
      );
    if (
      vus.has(empreinte) ||
      dejaDansIndex ||
      (await requeteUne(
        'SELECT 1 FROM assistant_mails WHERE empreinte = $1 UNION ALL SELECT 1 FROM assistant_mails_supprimes WHERE empreinte = $1',
        [empreinte]
      ))
    ) {
      bilan.doublons++;
      continue;
    }
    vus.add(empreinte);
    nouveaux.push({ m, empreinte });
  }
  if (nouveaux.length === 0) return null;

  const consigne = lireConsigne(t.consigne, t.hashtags, ctx);
  let classement = classerTransfert(t, nouveaux.map((n) => n.m), ctx);

  let analyse: ResultatAnalyse | null = null;
  if (fournie) {
    analyse = fournie;
    bilan.analyses++;
    if (!consigne.dossier && !consigne.evenement && !consigne.branche) {
      const d = fournie.dossier ? dossiers.find((x) => x.code === fournie.dossier) : undefined;
      if (d) classement = { dossier: d.code, evenement: d.evenementCode, branche: d.branche, motif: 'analyse' };
      else if (fournie.dossier === null || fournie.evenement || fournie.branche) {
        // Pas de dossier existant désigné : on garde un rattachement par la conversation s'il existe, sinon nouveau dossier.
        if (classement.motif !== 'fil')
          classement = { dossier: null, evenement: fournie.evenement ?? classement.evenement, branche: fournie.branche ?? classement.branche, motif: 'analyse' };
      }
    }
  } else if (await analyseActive()) {
    try {
      const pourAnalyse: DossierPourAnalyse[] = dossiers.map((d) => ({
        code: d.code,
        titre: d.titre,
        evenementCode: d.evenementCode,
        branche: d.branche,
        statut: d.statut,
        resume: typeof d.donnees.resume === 'string' ? d.donnees.resume : '',
      }));
      analyse = await analyser({ mails: nouveaux.map((n) => n.m), consigne: t.consigne }, classement, ctx, pourAnalyse);
      if (analyse) {
        bilan.analyses++;
        // La consigne du chef de service l'emporte toujours sur l'analyse.
        if (!consigne.dossier && !consigne.evenement && !consigne.branche) {
          const d = analyse.dossier ? dossiers.find((x) => x.code === analyse!.dossier) : undefined;
          classement = d
            ? { dossier: d.code, evenement: d.evenementCode, branche: d.branche, motif: 'analyse' }
            : { dossier: null, evenement: analyse.evenement ?? classement.evenement, branche: analyse.branche ?? classement.branche, motif: 'analyse' };
        }
      }
    } catch (e) {
      bilan.erreur = bilan.erreur || (e as Error).message;
    }
  }

  const recents = nouveaux.map((n) => n.m);
  const dernier = recents[recents.length - 1];
  const premierRecu = recents.find((m) => m.sens === 'reçu') ?? recents[0];
  const echeancesRegles = recents.flatMap((m) => detecterEcheances(`${m.objet}\n${m.corps}`, m.date ?? new Date()));
  const echeances = analyse?.echeances?.length ? analyse.echeances.map((e) => ({ ...e, source: 'analyse' })) : echeancesRegles;
  const contacts = sansDoublons(
    recents
      .filter((m) => m.sens === 'reçu')
      .map((m) => (m.expediteurAdresse && m.expediteurNom !== m.expediteurAdresse ? `${m.expediteurNom} – ${m.expediteurAdresse}` : m.expediteurNom || m.expediteurAdresse))
  );
  const fichiers = await copierPieces(recents.flatMap((m) => m.piecesJointes), bilan);
  const pieces = recents.flatMap((m) =>
    m.piecesJointes.map((p) => ({
      nom: p.nom,
      taille: taille(p.taille),
      type: p.type,
      emplacement: p.onedrive ? `OneDrive › ${p.onedrive.chemin.replace(/\//g, ' › ')}` : p.fichierId ? 'Téléchargeable' : "Messagerie de l'assistant",
      ...(p.fichierId ? { fichierId: p.fichierId } : {}),
      ...(p.onedrive ? { onedrive: p.onedrive.lien ?? true } : {}),
    }))
  );

  return await transaction(async (client) => {
    let code = classement.dossier;
    if (!code) {
      code = await prochainCode(client);
      const titre = (analyse?.titre || dernier.objet.replace(/^\s*((re|tr|fw|fwd)\s*:\s*)+/i, '') || 'Sans objet').slice(0, 300);
      const donnees = {
        id: code,
        evenement: classement.evenement,
        branche: classement.branche,
        titre,
        demandeur: premierRecu.sens === 'reçu' ? premierRecu.expediteurNom : '',
        contacts,
        statut: 'À traiter',
        priorite: consigne.priorite ?? analyse?.priorite ?? 'Normale',
        echeances,
        resume: dernier.corps.replace(/\s+/g, ' ').slice(0, 500),
        actions: [] as string[],
        vigilance: [] as string[],
        pieces_jointes: pieces,
        mails: [] as number[],
        remarques: consigne.remarque ? [consigne.remarque] : [],
        origine: 'releve',
        classement: classement.motif,
      } as Record<string, unknown>;
      if (analyse) {
        appliquerAnalyse(donnees, analyse, true);
        if (consigne.priorite) donnees.priorite = consigne.priorite;
        if (analyse.statut) donnees.statut = analyse.statut;
      }
      await insererUn(
        'assistant_dossiers',
        {
          code,
          evenementCode: classement.evenement,
          branche: classement.branche,
          titre: String(donnees.titre),
          statut: String(donnees.statut),
          priorite: String(donnees.priorite),
          donnees,
          source: 'releve',
        },
        client
      );
      const nouveau: DossierEnBase = {
        code,
        evenementCode: classement.evenement,
        branche: classement.branche,
        titre: String(donnees.titre),
        statut: String(donnees.statut),
        priorite: String(donnees.priorite),
        source: 'releve',
        donnees,
      };
      dossiers.push(nouveau);
      ctx.dossiers.push({ code, evenementCode: classement.evenement, branche: classement.branche, statut: String(donnees.statut), contacts: contactsDe(donnees) });
      bilan.dossiersCrees++;
    }

    // Mails au registre.
    const numeros: number[] = [];
    for (const { m, empreinte } of nouveaux) {
      const r = await requeteUne<{ n: number }>('SELECT greatest(coalesce(max(numero), 0), $1) + 1 AS n FROM assistant_mails', [PREMIER_NUMERO], client);
      const numero = r!.n;
      await insererUn(
        'assistant_mails',
        {
          numero,
          date: m.date ? formatParis(m.date) : '',
          expediteur: m.expediteurNom || m.expediteurAdresse,
          objet: m.objet.slice(0, 500),
          dossierCode: code,
          source: 'releve',
          empreinte,
          sens: m.sens,
          destinataires: masquerBoite(m.destinataires, boite).slice(0, 2000),
          dateEnvoi: m.date,
          corps: m.corps,
          consigne: t.consigne,
          piecesJointes: m.piecesJointes.map(sansContenu),
          lien,
          classement: classement.motif,
        },
        client
      );
      numeros.push(numero);
      const fil = objetDeFil(m.objet);
      if (fil.length >= 4) ctx.fils.set(fil, code);
      bilan.nouveaux++;
    }

    // Dossier enrichi (verrouillé : un import ou une correction peut tourner en même temps).
    const d = await requeteUne<DossierEnBase>('SELECT code, statut, source, donnees FROM assistant_dossiers WHERE code = $1 FOR UPDATE', [code], client);
    if (!d) return code;
    const donnees = { ...d.donnees } as Record<string, unknown>;
    const liste = <T>(cle: string) => (Array.isArray(donnees[cle]) ? (donnees[cle] as T[]) : []);
    donnees.mails = [...liste<number>('mails'), ...numeros];
    if (classement.dossier) {
      // Dossier existant : on ajoute sans rien retirer.
      const ech = liste<{ date?: string; libelle?: string }>('echeances');
      for (const e of echeances) if (!ech.some((x) => x.date === e.date && x.libelle === e.libelle)) ech.push(e);
      donnees.echeances = ech;
      donnees.contacts = sansDoublons([...liste<string>('contacts'), ...contacts]);
      donnees.pieces_jointes = [...liste<unknown>('pieces_jointes'), ...pieces];
      if (analyse) appliquerAnalyse(donnees, analyse, false);
      if (consigne.remarque) donnees.remarques = sansDoublons([...liste<string>('remarques'), consigne.remarque]);
    }
    donnees.dernier_mail = dernier.date ? formatParis(dernier.date) : formatParis(new Date());
    const passerEnHaute = classement.dossier && consigne.priorite === 'Haute';
    if (passerEnHaute) donnees.priorite = 'Haute';
    // Un dossier clos qui reçoit un nouveau mail est rouvert.
    const rouvrir = /^clos/i.test(d.statut) && recents.some((m) => m.sens === 'reçu');
    if (rouvrir) donnees.statut = 'À traiter';
    await executer(
      `UPDATE assistant_dossiers SET donnees = $2, statut = CASE WHEN $3 THEN 'À traiter' ELSE statut END,
         priorite = CASE WHEN $4 THEN 'Haute' ELSE priorite END, updated_at = now() WHERE code = $1`,
      [code, JSON.stringify(donnees), rouvrir, !!passerEnHaute],
      client
    );
    const enMemoire = dossiers.find((x) => x.code === code);
    if (enMemoire) {
      enMemoire.donnees = donnees;
      if (rouvrir) enMemoire.statut = 'À traiter';
    }
    if (fichiers.length) await executer('UPDATE fichiers SET rattachement = $2 WHERE id = ANY($1)', [fichiers, code], client);
    const ctxD = ctx.dossiers.find((x) => x.code === code);
    if (ctxD) {
      ctxD.contacts = contactsDe(donnees);
      if (rouvrir) ctxD.statut = 'À traiter';
    }
    return code;
  });
}

/** Décode et enregistre un message brut (utilisé par la mise à jour, et par les tests). */
export async function traiterMessage(source: Buffer | string, lien = '', bilan?: BilanReleve): Promise<BilanReleve> {
  const b = bilan ?? { lus: 0, nouveaux: 0, doublons: 0, dossiersCrees: 0, analyses: 0, ignores: 0, erreur: '' };
  const c = await lireConfiguration();
  const service = [...c.adressesService, c.adresse].filter(Boolean);
  const { ctx, dossiers } = await chargerContexte(service);
  const t = await decoderTransfert(source, service);
  await enregistrer(t, lien, ctx, dossiers, b, c.adresse);
  return b;
}

let enCours = false;
/** Identifiants refusés au dernier essai (empreinte), tant qu'ils n'ont pas changé. */
let identifiantsRefuses: string | null = null;

/** Lit les nouveaux messages de la boîte Gmail. Un seul relevé à la fois, même avec plusieurs conteneurs. */
export async function relever(par: string): Promise<BilanReleve> {
  const c = await lireConfiguration();
  if (c.illisible) throw new ReleveImpossible('Réglages de la messagerie à ressaisir (état et réglages)');
  if (!estConfiguree(c)) throw new ReleveImpossible("La messagerie de l'assistant n'est pas encore configurée (état et réglages)");
  if (enCours) throw new ReleveImpossible('Une mise à jour est déjà en cours');
  enCours = true;
  const verrou = await pool.connect();
  const bilan: BilanReleve = { lus: 0, nouveaux: 0, doublons: 0, dossiersCrees: 0, analyses: 0, ignores: 0, erreur: '' };
  const debut = new Date();
  let verrouPris = false;
  try {
    verrouPris = (await verrou.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', ['assistant-releve'])).rows[0].ok;
    if (!verrouPris) throw new ReleveImpossible('Une mise à jour est déjà en cours');

    const service = [...c.adressesService, c.adresse];
    const { ctx, dossiers } = await chargerContexte(service);
    const etat = await requeteUne<{ uidValidity: string; dernierUid: number }>("SELECT * FROM assistant_releve_etat WHERE cle = 'gmail'");

    let imap;
    try {
      imap = await connecter(c);
      identifiantsRefuses = null;
    } catch (e) {
      // Identifiants refusés : la mise à jour automatique se suspend jusqu'à leur modification, pour ne pas
      // faire bloquer le compte par des tentatives répétées. Le bouton de l'onglet réessaie quand même.
      if (/refusée|exige|bloquée/.test((e as Error).message)) identifiantsRefuses = empreinteIdentifiants(c);
      throw new ReleveImpossible((e as ConnexionImpossible).message);
    }
    try {
      const boite = await imap.getMailboxLock(c.dossier);
      try {
        const mb = imap.mailbox;
        const uidValidity = mb ? String(mb.uidValidity) : '';
        const depuis = etat && etat.uidValidity === uidValidity ? Number(etat.dernierUid) : 0;
        const trouves = await imap.search({ uid: `${depuis + 1}:*` }, { uid: true });
        const uids = (trouves || []).filter((u) => u > depuis).sort((a, b) => a - b).slice(0, MESSAGES_PAR_RELEVE);
        for (const uid of uids) {
          const msg = await imap.fetchOne(String(uid), { source: true }, { uid: true });
          if (msg && msg.source) {
            bilan.lus++;
            const lien = '';
            try {
              const t = await decoderTransfert(msg.source, service);
              // Seuls les messages transférés par le service comptent : alertes de sécurité, lettres
              // d'information ou courriers envoyés directement à la messagerie de l'assistant sont ignorés.
              if (c.adressesService.length && !c.adressesService.includes(t.enveloppe.adresse)) bilan.ignores++;
              else await enregistrer(t, lien, ctx, dossiers, bilan, c.adresse);
            } catch (e) {
              console.error(`[assistant] Message ${uid} illisible :`, (e as Error).message);
              bilan.erreur = bilan.erreur || "Un message n'a pas pu être lu";
            }
          }
          await executer(
            `INSERT INTO assistant_releve_etat (cle, uid_validity, dernier_uid) VALUES ('gmail', $1, $2)
             ON CONFLICT (cle) DO UPDATE SET uid_validity = EXCLUDED.uid_validity, dernier_uid = EXCLUDED.dernier_uid, updated_at = now()`,
            [uidValidity, uid]
          );
        }
        if (uids.length === 0 && (!etat || etat.uidValidity !== uidValidity)) {
          await executer(
            `INSERT INTO assistant_releve_etat (cle, uid_validity, dernier_uid) VALUES ('gmail', $1, 0)
             ON CONFLICT (cle) DO UPDATE SET uid_validity = EXCLUDED.uid_validity, dernier_uid = 0, updated_at = now()`,
            [uidValidity]
          );
        }
      } finally {
        boite.release();
      }
    } finally {
      await imap.logout().catch(() => undefined);
    }
  } catch (e) {
    if (e instanceof ReleveImpossible) {
      bilan.erreur = e.message;
      if (/déjà en cours/.test(e.message)) throw e;
    } else {
      console.error('[assistant] Mise à jour interrompue :', (e as Error).message);
      bilan.erreur = 'Mise à jour interrompue, nouvel essai à la prochaine mise à jour';
    }
  } finally {
    if (verrouPris) await verrou.query('SELECT pg_advisory_unlock(hashtext($1))', ['assistant-releve']).catch(() => undefined);
    verrou.release();
    enCours = false;
    if (!(bilan.erreur && /déjà en cours/.test(bilan.erreur))) {
      await insererUn('assistant_releves', { debut, fin: new Date(), ...bilan, par }).catch(() => undefined);
    }
  }
  return bilan;
}

let minuteur: NodeJS.Timeout | null = null;

/**
 * Mise à jour automatique : chaque minute, le serveur regarde si l'intervalle réglé est écoulé depuis la
 * dernière mise à jour. Un réglage modifié à l'écran est donc pris en compte sans redémarrage.
 */
export function demarrerReleveAutomatique(): void {
  if (minuteur) return;
  void nettoyerAnciensMails().catch((e) => console.error('[assistant] Nettoyage des anciens mails :', (e as Error).message));
  // Depuis la bascule sur Outlook Web, le relevé de la messagerie de secours ne tourne plus tout seul.
  if (process.env.ASSISTANT_RELEVE_SECOURS !== 'oui') return;
  const tour = async () => {
    try {
      const c = await lireConfiguration();
      if (!estConfiguree(c) || c.illisible || c.minutes === 0 || enCours) return;
      if (identifiantsRefuses && identifiantsRefuses === empreinteIdentifiants(c)) return;
      const d = await requeteUne<{ debut: Date | null }>('SELECT max(debut) AS debut FROM assistant_releves');
      if (d?.debut && Date.now() - new Date(d.debut).getTime() < c.minutes * 60_000 - 5_000) return;
      await relever('mise à jour automatique');
    } catch {
      // déjà noté dans l'historique
    }
  };
  minuteur = setInterval(() => void tour(), 60_000);
}

/** Pour l'onglet : réglages (sans secret, adresse masquée) et dernières mises à jour. */
export async function etatReleve() {
  const c = await lireConfiguration();
  // Historique : les passages de lecture d'Outlook (le relevé de secours n'y figure que s'il est réactivé).
  const derniers = await requete(
    process.env.ASSISTANT_RELEVE_SECOURS === 'oui'
      ? 'SELECT * FROM assistant_releves ORDER BY debut DESC LIMIT 12'
      : "SELECT * FROM assistant_releves WHERE par LIKE '%lecture Outlook%' ORDER BY debut DESC LIMIT 12"
  );
  const dernier = derniers[0] as { debut?: Date } | undefined;
  const configure = estConfiguree(c) && !c.illisible;
  const prochain = configure && c.minutes > 0 && dernier?.debut ? new Date(new Date(dernier.debut).getTime() + c.minutes * 60_000) : null;
  return {
    configure,
    /** Dernier dépôt venu de la lecture d'Outlook Web (méthode principale). */
    derniereLectureOutlook:
      ((derniers as { par?: string; debut?: Date }[]).find((r) => r.par?.includes('lecture Outlook'))?.debut ??
        (await requeteUne<{ d: Date | null }>("SELECT max(debut) AS d FROM assistant_releves WHERE par LIKE '%lecture Outlook%'"))?.d) ||
      null,
    outlook: await lireReglagesOutlook(),
    lancementImmediat: lancementImmediatConfigure(),
    prochainPassage: prochainPassageOutlook(),
    origine: c.origine,
    suspendue: !!identifiantsRefuses && identifiantsRefuses === empreinteIdentifiants(c),
    illisible: c.illisible,
    adresseMasquee: masquer(c.adresse),
    minutes: c.minutes,
    adressesService: c.adressesService,
    analyse: !!c.cleAnalyse,
    origineAnalyse: c.origineAnalyse,
    stockage: stockageActif(),
    derniers,
    prochain,
  };
}

// --- Analyse d'un dossier déjà enregistré ----------------------------------------------------------

async function contenuFichier(id: string): Promise<Buffer | undefined> {
  const f = await requeteUne<{ cleStockage: string; taille: number }>("SELECT cle_stockage, taille FROM fichiers WHERE id = $1 AND module = 'assistant'", [id]);
  if (!f || f.taille > 8 * 1024 * 1024 || !stockageActif()) return undefined;
  const morceaux: Buffer[] = [];
  for await (const m of await lireObjet(f.cleStockage)) morceaux.push(Buffer.from(m));
  return Buffer.concat(morceaux);
}

/**
 * (Ré)analyse un dossier à partir de ses mails enregistrés et de ses pièces jointes copiées : résumé,
 * actions, vigilance, échéances, budget, brouillon. Événement et branche ne sont remplis que s'ils manquent.
 */
export async function analyserDossier(code: string): Promise<void> {
  const c = await lireConfiguration();
  if (!c.cleAnalyse) throw new AnalyseImpossible("Analyse non activée : enregistrez la clé du service dans « état et réglages »");
  const service = [...c.adressesService, c.adresse].filter(Boolean);
  const { ctx, dossiers } = await chargerContexte(service);
  const d = dossiers.find((x) => x.code === code);
  if (!d) throw new AnalyseImpossible('Dossier introuvable');
  const lignes = await requete<{
    expediteur: string; destinataires: string; dateEnvoi: Date | null; date: string; objet: string; corps: string; sens: string;
    piecesJointes: { nom: string; type: string; taille: number; fichierId?: string }[];
  }>("SELECT * FROM assistant_mails WHERE dossier_code = $1 AND source = 'releve' ORDER BY date_envoi NULLS FIRST, numero", [code]);
  if (!lignes.length) throw new AnalyseImpossible("Ce dossier n'a pas de mail arrivé par la mise à jour automatique à analyser");
  const pieces: PieceJointe[] = [];
  for (const l of lignes) for (const p of l.piecesJointes ?? []) {
    if (p.fichierId && pieces.length < 4) pieces.push({ ...p, contenu: await contenuFichier(p.fichierId).catch(() => undefined) });
  }
  const mails: MailOrigine[] = lignes.slice(-12).map((l) => ({
    expediteurNom: l.expediteur,
    expediteurAdresse: '',
    destinataires: l.destinataires,
    date: l.dateEnvoi ? new Date(l.dateEnvoi) : null,
    objet: l.objet,
    corps: l.corps,
    piecesJointes: (l.piecesJointes ?? []).map((p) => ({ nom: p.nom, type: p.type, taille: p.taille })),
    sens: l.sens === 'envoyé' ? 'envoyé' : 'reçu',
    mode: 'en-tete',
  }));
  const pourAnalyse: DossierPourAnalyse[] = dossiers.map((x) => ({
    code: x.code, titre: x.titre, evenementCode: x.evenementCode, branche: x.branche, statut: x.statut,
    resume: typeof x.donnees.resume === 'string' ? x.donnees.resume : '',
  }));
  const a = await analyser({ mails, consigne: '', pieces }, { dossier: code, evenement: d.evenementCode, branche: d.branche, motif: 'analyse' }, ctx, pourAnalyse);
  if (!a) return;
  await transaction(async (client) => {
    const actuel = await requeteUne<DossierEnBase>('SELECT code, evenement_code, branche, donnees, source FROM assistant_dossiers WHERE code = $1 FOR UPDATE', [code], client);
    if (!actuel) return;
    const donnees = { ...actuel.donnees };
    appliquerAnalyse(donnees, a, actuel.source === 'releve' && !donnees.analyse);
    const evenement = actuel.evenementCode || a.evenement || '';
    const branche = actuel.branche || a.branche || '';
    donnees.evenement = evenement;
    donnees.branche = branche;
    await executer(
      'UPDATE assistant_dossiers SET donnees = $2, evenement_code = $3, branche = $4, titre = $5, priorite = $6, updated_at = now() WHERE code = $1',
      [code, JSON.stringify(donnees), evenement, branche, String(donnees.titre ?? ''), String(donnees.priorite ?? 'Normale')],
      client
    );
  });
}

// --- Dépôt de conversations lues dans Outlook Web ---------------------------------------------------
//
// Méthode principale depuis novembre 2026 : le Chrome du chef de service lit Outlook Web (comme l'assistant
// de bureau), comprend chaque conversation et ses pièces jointes, range celles-ci dans OneDrive, puis dépose
// ici le résultat. Aucun transfert, aucune clé payante. Le relevé de la messagerie de l'assistant reste
// possible en secours ; le dédoublonnage par empreinte évite les doubles.

export interface ConversationDeposee {
  consigne?: string;
  mails: {
    expediteurNom: string;
    expediteurAdresse?: string;
    destinataires?: string;
    date: string; // ISO 8601
    objet: string;
    corps: string;
    sens: 'reçu' | 'envoyé';
    piecesJointes?: { nom: string; type?: string; taille?: number; onedrive?: { chemin: string; lien?: string } }[];
  }[];
  analyse: ResultatAnalyse;
}

export async function deposerConversation(c: ConversationDeposee, par: string): Promise<{ dossier: string | null; bilan: BilanReleve }> {
  const bilan: BilanReleve = { lus: c.mails.length, nouveaux: 0, doublons: 0, dossiersCrees: 0, analyses: 0, ignores: 0, erreur: '' };
  const conf = await lireConfiguration();
  const service = [...conf.adressesService, conf.adresse].filter(Boolean);
  const { ctx, dossiers } = await chargerContexte(service);
  const t: Transfert = {
    consigne: c.consigne ?? '',
    hashtags: [...(c.consigne ?? '').matchAll(/#([\p{L}\p{N}_-]{2,40})/gu)].map((h) => h[1]),
    enveloppe: { nom: '', adresse: '', date: null, objet: c.mails[c.mails.length - 1]?.objet ?? '' },
    nonDecode: false,
    mails: c.mails
      .map((m) => ({
        expediteurNom: m.expediteurNom,
        expediteurAdresse: (m.expediteurAdresse ?? '').toLowerCase(),
        destinataires: m.destinataires ?? '',
        date: Number.isNaN(Date.parse(m.date)) ? null : new Date(m.date),
        objet: m.objet,
        corps: m.corps.slice(0, 20_000),
        piecesJointes: (m.piecesJointes ?? []).map((p) => ({ nom: p.nom, type: p.type ?? '', taille: p.taille ?? 0, onedrive: p.onedrive })),
        sens: m.sens,
        mode: 'direct' as const,
      }))
      .sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0)),
  };
  void par;
  const code = await enregistrer(t, '', ctx, dossiers, bilan, conf.adresse, c.analyse);
  return { dossier: code, bilan };
}

/** Ce dont la lecture d'Outlook a besoin : événements, dossiers ouverts, dossiers OneDrive, dernier passage. */
export async function contexteDepot() {
  const conf = await lireConfiguration();
  const evenements = await requete<{ code: string; nom: string; dateJour: string | null; dossierOnedrive: string }>(
    'SELECT code, nom, date_jour, dossier_onedrive FROM assistant_evenements ORDER BY date_jour NULLS LAST'
  );
  const dossiers = await requete<{ code: string; titre: string; evenementCode: string; branche: string; statut: string; donnees: Record<string, unknown> }>(
    "SELECT code, titre, evenement_code, branche, statut, donnees FROM assistant_dossiers WHERE statut !~* '^clos' ORDER BY code"
  );
  const dernier = await requeteUne<{ d: Date | null }>("SELECT max(date_envoi) AS d FROM assistant_mails WHERE source = 'releve'");
  const reglages = await lireReglagesOutlook();
  const sansEvenement = 'Fonctionnement du service';
  // Dossier Outlook de rangement : sous-dossier par événement (mêmes noms que dans OneDrive), si demandé.
  const versOutlook = (nom: string) => (!reglages.deplacerVers ? '' : reglages.sousDossiers ? `${reglages.deplacerVers}/${nom}` : reglages.deplacerVers);
  return {
    reglages,
    dossierOutlookSansEvenement: versOutlook(sansEvenement),
    adressesService: conf.adressesService,
    dernierMail: dernier?.d ?? null,
    branches: ['Protocole', 'Animation', 'Logistique', 'Affichage', 'KIOSC', 'VSL', 'Pilotage du service'],
    racineOneDrive: 'Mes fichiers/Assistant',
    dossierSansEvenement: sansEvenement,
    evenements: evenements.map((e) => {
      // « Fonctionnement du service (hors événement) » de l'index rejoint le dossier commun sans événement.
      const court = e.nom.split(/\s+[–—-]\s+/)[0].trim();
      const dossierOnedrive = e.dossierOnedrive || (/^fonctionnement du service/i.test(court) ? sansEvenement : court);
      return { ...e, dossierOnedrive, dossierOutlook: versOutlook(dossierOnedrive) };
    }),
    dossiers: dossiers.map((d) => ({
      code: d.code,
      titre: d.titre,
      evenement: d.evenementCode,
      branche: d.branche,
      statut: d.statut,
      resume: typeof d.donnees.resume === 'string' ? d.donnees.resume.slice(0, 300) : '',
    })),
  };
}
