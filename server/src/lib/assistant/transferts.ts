import { createHash } from 'node:crypto';
import { simpleParser, type AddressObject, type Attachment, type ParsedMail } from 'mailparser';
import { formatParis, lireAdresse, lireDateEnTete, normaliser, objetDeFil } from './texte.js';

/**
 * Décodage des mails transférés à la main vers la boîte Gmail du service.
 *
 * Le transfert n'est qu'un moyen de transport : l'adresse qui transfère (messagerie professionnelle du chef
 * de service, ou la boîte Gmail elle-même) n'est jamais retenue comme expéditeur. Le vrai expéditeur, la
 * date d'envoi, les destinataires et l'objet sont lus :
 * - dans les mails joints au transfert (.eml), qui gardent leurs en-têtes complets ;
 * - à défaut, dans les blocs d'en-tête recopiés par le transfert (« De : … Envoyé : … À : … Objet : … »),
 *   un bloc par message quand c'est une conversation entière qui a été transférée.
 * Le texte écrit au-dessus du transfert est une consigne : ses hashtags forcent le classement.
 */

export interface PieceJointe {
  nom: string;
  type: string;
  taille: number;
  /** Contenu, pour la copie dans le stockage de l'application ; jamais écrit en base. */
  contenu?: Buffer;
  /** Fichier copié dans le stockage de l'application. */
  fichierId?: string;
  /** Déjà rangée dans OneDrive (lecture d'Outlook Web). */
  onedrive?: { chemin: string; lien?: string };
}

export interface MailOrigine {
  expediteurNom: string;
  expediteurAdresse: string;
  destinataires: string;
  date: Date | null;
  objet: string;
  corps: string;
  piecesJointes: PieceJointe[];
  sens: 'reçu' | 'envoyé';
  /** D'où viennent les en-têtes : mail joint, bloc recopié, réponse citée, ou le message lui-même. */
  mode: 'piece-jointe' | 'en-tete' | 'citation' | 'direct';
}

export interface Transfert {
  /** Texte écrit au-dessus du transfert, signature retirée. */
  consigne: string;
  hashtags: string[];
  /** Mails d'origine, du plus ancien au plus récent. */
  mails: MailOrigine[];
  enveloppe: { nom: string; adresse: string; date: Date | null; objet: string };
  /** Un transfert dont on n'a pas retrouvé les en-têtes d'origine. */
  nonDecode: boolean;
}

const LONGUEUR_CORPS = 20_000;

// Séparateurs posés par Outlook, Gmail ou Apple Mail avant le message transféré.
const SEPARATEUR =
  /^\s*(_{8,}|-{2,}\s*(message d'origine|original message|forwarded message|message transf[ée]r[ée])\s*-{2,}|d[ée]but du message r[ée]exp[ée]di[ée]\s*:|begin forwarded message\s*:|-{8,})\s*$/i;
const CHAMP = /^\s*\*?\s*(de|from|exp[ée]diteur|envoy[ée](?: le)?|date|sent|[àa]|to|destinataire|cc|objet|subject)\s*\*?\s*:\s*(.*)$/i;
const CITATION = /^\s*(?:le|on)\s+(.+?)\s+(.+?)\s+(?:a [ée]crit|wrote)\s*:\s*$/i;
const FIN_SIGNATURE = /^\s*(cordialement|bien cordialement|bien [àa] vous|bonne (journ[ée]e|soir[ée]e)|merci( d'avance| par avance)?[ ,.!]*$|--\s*$|envoy[ée] (de|depuis) mon)/i;

const sansCitation = (ligne: string) => ligne.replace(/^(\s*>)+\s?/, '');

type Champ = 'de' | 'date' | 'a' | 'cc' | 'objet';
function typeDeChamp(nom: string): Champ {
  const n = normaliser(nom);
  if (['de', 'from', 'expediteur'].includes(n)) return 'de';
  if (['envoye', 'envoye le', 'date', 'sent'].includes(n)) return 'date';
  if (n === 'cc') return 'cc';
  if (['objet', 'subject'].includes(n)) return 'objet';
  return 'a';
}

interface Bloc {
  debut: number;
  fin: number; // ligne de l'objet (incluse)
  champs: Partial<Record<Champ, string>>;
  mode: 'en-tete' | 'citation';
}

/** Repère les blocs d'en-tête recopiés dans le texte d'un transfert. */
function reperesBlocs(lignes: string[]): Bloc[] {
  const blocs: Bloc[] = [];
  for (let i = 0; i < lignes.length; i++) {
    const l = sansCitation(lignes[i]);
    const c = l.match(CHAMP);
    if (c && typeDeChamp(c[1]) === 'de') {
      const champs: Partial<Record<Champ, string>> = { de: c[2].trim() };
      let j = i + 1;
      let fin = -1;
      let dernierChamp = i;
      let dernierType: Champ = 'de';
      for (; j < Math.min(lignes.length, i + 20); j++) {
        const lj = sansCitation(lignes[j]);
        if (!lj.trim()) {
          if (champs.objet !== undefined) break;
          continue;
        }
        const cj = lj.match(CHAMP);
        if (!cj) {
          // Suite d'un champ renvoyée à la ligne : longue liste de destinataires, adresse coupée…
          if (champs.objet === undefined && (dernierType === 'de' || dernierType === 'a' || dernierType === 'cc')) {
            champs[dernierType] += ' ' + lj.trim();
            continue;
          }
          break;
        }
        const t = typeDeChamp(cj[1]);
        if (t === 'de') break;
        if (champs[t] === undefined) champs[t] = cj[2].trim();
        dernierType = t;
        dernierChamp = j;
        if (t === 'objet') fin = j;
      }
      // Les champs placés après l'objet (« Date: », « To: » d'un mail joint) font partie de l'en-tête.
      if (fin >= 0) fin = dernierChamp;
      if (champs.date !== undefined && fin >= 0) {
        blocs.push({ debut: i, fin, champs, mode: 'en-tete' });
        i = fin;
      }
      continue;
    }
    const q = l.match(CITATION);
    if (q && lireDateEnTete(q[1] + ' ' + q[2])) {
      // « Le mar. 24 nov. 2026 à 10:12, Olivier MENARD <…> a écrit : »
      const texte = `${q[1]} ${q[2]}`;
      const virgule = texte.lastIndexOf(',');
      const de = virgule > 0 ? texte.slice(virgule + 1) : q[2];
      const date = virgule > 0 ? texte.slice(0, virgule) : q[1];
      blocs.push({ debut: i, fin: i, champs: { de: de.trim(), date: date.trim() }, mode: 'citation' });
    }
  }
  return blocs;
}

// Restes de mise en forme d'Outlook en texte brut : « site<https://…> », images de signature « [cid:…] ».
const LIEN_ENTRE_CHEVRONS = /<(?:https?:\/\/|mailto:)[^>\s]*>/gi;
const IMAGE_INTEGREE = /\[cid:[^\]]*\]/gi;
// Lignes qui ouvrent une signature ou un pied de message.
const MARQUEUR_SIGNATURE =
  /letsignit|t[ée]l[ée]chargez mes coordonn[ée]es|^\s*(t[ée]l|tel|mob|mobile|portable|fixe|standard|ligne directe)\s*[.:]|^\s*(www\.|https?:\/\/)\S+\s*(\/\s*(www\.|https?:\/\/)\S+\s*)*$|^\s*-- ?$|pensez [àa] l.environnement|ce (message|courriel|mail) (et (toutes )?ses pi[èe]ces jointes|est confidentiel)|^\s*(afin de contribuer|avertissement|disclaimer)\b/i;

/** Retire les liens entre chevrons et les images intégrées, garde le texte lisible. */
export function nettoyerLigne(l: string): string {
  return l.replace(LIEN_ENTRE_CHEVRONS, '').replace(IMAGE_INTEGREE, '').replace(/[ \t]+$/g, '');
}

/** Ligne qui commence par un nom donné (dans un ordre ou l'autre : « David HAGNERE », « HAGNERE David »). */
function ligneDeNom(ligne: string, noms: string[]): boolean {
  const l = normaliser(ligne);
  if (!l || l.length > 90) return false;
  const motsLigne = new Set(l.split(' ').slice(0, 4));
  return noms.some((n) => {
    const m = normaliser(n).split(' ').filter((x) => x.length > 1 && !x.includes('@'));
    // La ligne doit être surtout le nom (« David HAGNERE », « David HAGNERE | Chef de service »), pas une phrase.
    return m.length >= 2 && m.every((x) => motsLigne.has(x)) && l.split(' ').length <= m.length + 4 && !/[.!?]\s*$/.test(ligne);
  });
}

/**
 * Coupe un texte à sa signature : formule de politesse, nom de l'auteur seul sur sa ligne, coordonnées,
 * liens de signature ou mention de confidentialité. Tout ce qui suit est retiré.
 */
export function sansSignature(lignes: string[], noms: string[]): string[] {
  const garde: string[] = [];
  const propres = lignes.map((b) => nettoyerLigne(sansCitation(b)));
  for (let i = 0; i < propres.length; i++) {
    const l = propres[i];
    if (FIN_SIGNATURE.test(l) || MARQUEUR_SIGNATURE.test(l) || ligneDeNom(l, noms)) break;
    // Signatures en tableau d'Outlook : prénom et nom sur deux lignes (« David » puis « HAGNERE »).
    if (l.trim() && l.trim().split(/\s+/).length === 1) {
      const suivante = propres.slice(i + 1, i + 4).find((x) => x.trim());
      if (suivante && ligneDeNom(`${l.trim()} ${suivante.trim()}`, noms)) break;
    }
    garde.push(l);
  }
  return garde;
}

/** Texte d'un segment, sans séparateurs, signature ni lignes vides en bord. */
function nettoyer(lignes: string[], noms: string[] = []): string {
  const garde = sansSignature(lignes, noms).filter((l) => !SEPARATEUR.test(l));
  while (garde.length && !garde[0].trim()) garde.shift();
  while (garde.length && !garde[garde.length - 1].trim()) garde.pop();
  return garde.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, LONGUEUR_CORPS);
}

/** Consigne : texte au-dessus du transfert, sans la signature de celui qui transfère. */
function lireConsigne(lignes: string[], noms: string[]): string {
  return nettoyer(lignes, noms).slice(0, 2000);
}

const texteAdresses = (a: AddressObject | AddressObject[] | undefined) =>
  (Array.isArray(a) ? a : a ? [a] : [])
    .flatMap((x) => x.value)
    .map((v) => (v.name && v.address ? `${v.name} <${v.address}>` : v.address || v.name))
    .join(', ');

const premiereAdresse = (a: AddressObject | AddressObject[] | undefined) => {
  const v = (Array.isArray(a) ? a[0] : a)?.value?.[0];
  return { nom: v?.name || v?.address || '', adresse: (v?.address ?? '').toLowerCase() };
};

const estMailJoint = (p: Attachment) => p.contentType === 'message/rfc822' || /\.eml$/i.test(p.filename ?? '');
// Logos de signature et images collées dans le corps : pas des pièces jointes utiles.
// Cartes de visite (.vcf), signatures électroniques et enveloppes Outlook (winmail.dat) : pas des pièces utiles non plus.
const estDecor = (p: Attachment) =>
  p.related ||
  (p.contentDisposition === 'inline' && p.contentType.startsWith('image/')) ||
  /^text\/(x-)?vcard$|pkcs7-signature|ms-tnef/i.test(p.contentType) ||
  /\.(vcf|p7s)$|^winmail\.dat$/i.test(p.filename ?? '');
const versPieceJointe = (p: Attachment): PieceJointe => ({ nom: p.filename || 'sans nom', type: p.contentType, taille: p.size, contenu: p.content });

/**
 * Décode un message de la boîte Gmail. `adressesService` : adresses du service et du chef de service ;
 * un mail d'origine qui en part est classé « envoyé ».
 */
export async function decoderTransfert(source: Buffer | string, adressesService: string[]): Promise<Transfert> {
  const parsed: ParsedMail = await simpleParser(source);
  const env = premiereAdresse(parsed.from);
  const enveloppe = { nom: env.nom, adresse: env.adresse, date: parsed.date ?? null, objet: parsed.subject ?? '' };
  const service = new Set(adressesService.map((a) => a.toLowerCase()).filter(Boolean));
  if (env.adresse) service.add(env.adresse);
  const nomEnveloppe = normaliser(env.nom);
  const sensDe = (nom: string, adresse: string): 'reçu' | 'envoyé' =>
    (adresse && service.has(adresse)) || (!adresse && nomEnveloppe && normaliser(nom) === nomEnveloppe) ? 'envoyé' : 'reçu';

  const texte = (parsed.text ?? '').replace(/\r\n/g, '\n');
  const lignes = texte.split('\n');
  const blocs = reperesBlocs(lignes);
  const joints = parsed.attachments.filter(estMailJoint);
  const autres = parsed.attachments.filter((p) => !estMailJoint(p) && !estDecor(p)).map(versPieceJointe);

  const mails: MailOrigine[] = [];

  // 1. Mails joints : en-têtes complets.
  for (const j of joints) {
    try {
      const sous = await simpleParser(j.content);
      const de = premiereAdresse(sous.from);
      mails.push({
        expediteurNom: de.nom,
        expediteurAdresse: de.adresse,
        destinataires: [texteAdresses(sous.to), texteAdresses(sous.cc)].filter(Boolean).join(' ; '),
        date: sous.date ?? null,
        objet: sous.subject ?? '',
        corps: nettoyer((sous.text ?? '').replace(/\r\n/g, '\n').split('\n'), [de.nom]),
        piecesJointes: sous.attachments.filter((p) => !estDecor(p)).map(versPieceJointe),
        sens: sensDe(de.nom, de.adresse),
        mode: 'piece-jointe',
      });
    } catch {
      autres.push(versPieceJointe(j));
    }
  }

  // 2. Blocs d'en-tête recopiés dans le texte.
  let objetPrecedent = '';
  blocs.forEach((b, k) => {
    const finSegment = k + 1 < blocs.length ? blocs[k + 1].debut : lignes.length;
    const de = lireAdresse(b.champs.de ?? '');
    const objet = b.champs.objet ?? objetPrecedent;
    objetPrecedent = objet;
    mails.push({
      expediteurNom: de.nom,
      expediteurAdresse: de.adresse,
      destinataires: [b.champs.a, b.champs.cc].filter(Boolean).join(' ; '),
      date: lireDateEnTete(b.champs.date ?? ''),
      objet,
      corps: nettoyer(lignes.slice(b.fin + 1, finSegment), [de.nom]),
      piecesJointes: [],
      sens: sensDe(de.nom, de.adresse),
      mode: b.mode,
    });
  });

  const premierBloc = blocs.length ? blocs[0].debut : lignes.length;
  const decode = mails.length > 0;
  // Noms de celui qui transfère : celui de l'expéditeur, et ceux tirés des adresses du service (« david.hagnere@… »).
  const nomsService = [env.nom, ...adressesService.map((a) => a.split('@')[0].replace(/[._-]+/g, ' '))];
  const consigne = decode ? lireConsigne(lignes.slice(0, premierBloc), nomsService) : '';

  // 3. Rien de recopié : le message lui-même (mail arrivé directement, ou transfert dont l'en-tête a été effacé).
  if (!decode) {
    mails.push({
      expediteurNom: env.nom,
      expediteurAdresse: env.adresse,
      destinataires: [texteAdresses(parsed.to), texteAdresses(parsed.cc)].filter(Boolean).join(' ; '),
      date: enveloppe.date,
      objet: enveloppe.objet,
      corps: nettoyer(lignes, [env.nom]),
      piecesJointes: [],
      sens: adressesService.map((a) => a.toLowerCase()).includes(env.adresse) ? 'envoyé' : 'reçu',
      mode: 'direct',
    });
  }

  // Les pièces jointes du transfert accompagnent le message transféré le plus récent.
  const recipiendaire = mails.find((m) => m.mode === 'en-tete') ?? mails[mails.length - 1];
  recipiendaire.piecesJointes.push(...autres);

  // Une réponse citée sans objet prend celui du message qui la cite.
  for (const m of mails) if (!m.objet) m.objet = objetDeFilBrut(enveloppe.objet);

  mails.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0));
  const hashtags = [...consigne.matchAll(/#([\p{L}\p{N}_-]{2,40})/gu)].map((h) => h[1]);
  const nonDecode = !decode && /^\s*(tr|fw|fwd|wg)\s*:/i.test(enveloppe.objet);
  return { consigne, hashtags, mails, enveloppe, nonDecode };
}

/** Objet du transfert sans ses préfixes, en gardant la casse. */
function objetDeFilBrut(objet: string): string {
  let s = objet;
  for (let i = 0; i < 10; i++) {
    const avant = s;
    s = s.replace(/^\s*(re|tr|fw|fwd|wg|aw)\s*:\s*/i, '');
    if (s === avant) break;
  }
  return s.trim();
}

/** Identifie un mail d'origine : le même mail transféré deux fois (ou par deux voies) n'est compté qu'une fois. */
export function empreinteDe(m: MailOrigine): string {
  const qui = m.expediteurAdresse || normaliser(m.expediteurNom);
  const quand = m.date ? formatParis(m.date) : '';
  return createHash('sha1').update(`${qui}|${quand}|${objetDeFil(m.objet)}`).digest('hex');
}
