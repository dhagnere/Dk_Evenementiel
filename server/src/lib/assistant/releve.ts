import type pg from 'pg';
import { executer, insererUn, pool, requete, requeteUne, transaction } from '../../db.js';
import { enregistrerFichier, stockageActif } from '../stockage.js';
import { connecter, ConnexionImpossible, empreinteIdentifiants, estConfiguree, lireConfiguration, masquer } from './configuration.js';
import { analyseActive, analyser, type DossierPourAnalyse, type ResultatAnalyse } from './analyse.js';
import { classer, contactsDe, lireConsigne, type Classement, type ContexteClassement } from './classement.js';
import { detecterEcheances } from './echeances.js';
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
const sansContenu = (p: PieceJointe) => ({ nom: p.nom, type: p.type, taille: p.taille, ...(p.fichierId ? { fichierId: p.fichierId } : {}) });

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
  boite = ''
): Promise<void> {
  // Mails déjà au registre (transférés deux fois) : ignorés.
  const vus = new Set<string>();
  const nouveaux: { m: MailOrigine; empreinte: string }[] = [];
  for (const m of t.mails) {
    const empreinte = empreinteDe(m);
    if (vus.has(empreinte) || (await requeteUne('SELECT 1 FROM assistant_mails WHERE empreinte = $1', [empreinte]))) {
      bilan.doublons++;
      continue;
    }
    vus.add(empreinte);
    nouveaux.push({ m, empreinte });
  }
  if (nouveaux.length === 0) return;

  const consigne = lireConsigne(t.consigne, t.hashtags, ctx);
  let classement = classerTransfert(t, nouveaux.map((n) => n.m), ctx);

  let analyse: ResultatAnalyse | null = null;
  if (analyseActive()) {
    try {
      const pourAnalyse: DossierPourAnalyse[] = dossiers.map((d) => ({
        code: d.code,
        titre: d.titre,
        evenementCode: d.evenementCode,
        branche: d.branche,
        statut: d.statut,
        resume: typeof d.donnees.resume === 'string' ? d.donnees.resume : '',
      }));
      analyse = await analyser({ ...t, mails: nouveaux.map((n) => n.m) }, classement, ctx, pourAnalyse);
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
      emplacement: p.fichierId ? 'Téléchargeable' : "Messagerie de l'assistant",
      ...(p.fichierId ? { fichierId: p.fichierId } : {}),
    }))
  );

  await transaction(async (client) => {
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
        resume: analyse?.resume || dernier.corps.replace(/\s+/g, ' ').slice(0, 500),
        actions: analyse?.actions ?? [],
        vigilance: analyse?.vigilance ?? [],
        pieces_jointes: pieces,
        mails: [] as number[],
        remarques: consigne.remarque ? [consigne.remarque] : [],
        origine: 'releve',
        classement: classement.motif,
      };
      await insererUn(
        'assistant_dossiers',
        {
          code,
          evenementCode: classement.evenement,
          branche: classement.branche,
          titre,
          statut: 'À traiter',
          priorite: donnees.priorite,
          donnees,
          source: 'releve',
        },
        client
      );
      const nouveau: DossierEnBase = {
        code,
        evenementCode: classement.evenement,
        branche: classement.branche,
        titre,
        statut: 'À traiter',
        priorite: donnees.priorite,
        source: 'releve',
        donnees,
      };
      dossiers.push(nouveau);
      ctx.dossiers.push({ code, evenementCode: classement.evenement, branche: classement.branche, statut: 'À traiter', contacts: contactsDe(donnees) });
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
    if (!d) return;
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
      if (analyse) {
        donnees.actions = sansDoublons([...liste<string>('actions'), ...(analyse.actions ?? [])]);
        donnees.vigilance = sansDoublons([...liste<string>('vigilance'), ...(analyse.vigilance ?? [])]);
        if (analyse.resume) donnees.resume = analyse.resume;
      }
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
  });
}

/** Décode et enregistre un message brut (utilisé par la mise à jour, et par les tests). */
export async function traiterMessage(source: Buffer | string, lien = '', bilan?: BilanReleve): Promise<BilanReleve> {
  const b = bilan ?? { lus: 0, nouveaux: 0, doublons: 0, dossiersCrees: 0, analyses: 0, erreur: '' };
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
  const bilan: BilanReleve = { lus: 0, nouveaux: 0, doublons: 0, dossiersCrees: 0, analyses: 0, erreur: '' };
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
              await enregistrer(t, lien, ctx, dossiers, bilan, c.adresse);
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
  const derniers = await requete('SELECT * FROM assistant_releves ORDER BY debut DESC LIMIT 10');
  const dernier = derniers[0] as { debut?: Date } | undefined;
  const configure = estConfiguree(c) && !c.illisible;
  const prochain = configure && c.minutes > 0 && dernier?.debut ? new Date(new Date(dernier.debut).getTime() + c.minutes * 60_000) : null;
  return {
    configure,
    origine: c.origine,
    suspendue: !!identifiantsRefuses && identifiantsRefuses === empreinteIdentifiants(c),
    illisible: c.illisible,
    adresseMasquee: masquer(c.adresse),
    minutes: c.minutes,
    adressesService: c.adressesService,
    analyse: analyseActive(),
    stockage: stockageActif(),
    derniers,
    prochain,
  };
}
