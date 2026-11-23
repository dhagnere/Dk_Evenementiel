import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../config.js';
import { requete } from '../db.js';

let transporter: Transporter | null | undefined;

/** Construit (une seule fois) le transporteur SMTP, ou null si aucun SMTP n'est configuré. */
function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  if (!config.smtp.host || !config.smtp.user || !config.smtp.pass) {
    transporter = null;
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  return transporter;
}

interface EmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Message contenant un secret (mot de passe) : son contenu n'est jamais écrit dans le journal. */
  confidentiel?: boolean;
}

/**
 * Envoie un email. Si aucun SMTP n'est configuré (développement local sans identifiants),
 * le message est simplement affiché dans les logs au lieu d'échouer.
 */
export async function envoyerEmail(options: EmailOptions): Promise<boolean> {
  const destinataires = Array.isArray(options.to) ? options.to.join(', ') : options.to;
  const t = getTransporter();

  if (!t) {
    console.log(`[email] SMTP non configuré — email NON envoyé à ${destinataires}`);
    console.log(`[email] Sujet : ${options.subject}`);
    if (!options.confidentiel) console.log(`[email] ${options.text}`);
    return false;
  }

  try {
    await t.sendMail({ from: config.emailFrom, to: options.to, subject: options.subject, html: options.html, text: options.text });
    console.log(`[email] Envoyé à ${destinataires} : ${options.subject}`);
    return true;
  } catch (error) {
    console.error(`[email] Échec de l'envoi à ${destinataires} :`, error);
    return false;
  }
}

/** Emails à notifier : adresse dédiée si configurée, sinon tous les super-administrateurs actifs. */
async function destinatairesAdministrateurs(): Promise<string[]> {
  if (config.adminNotificationEmail) return [config.adminNotificationEmail];
  const admins = await requete<{ email: string }>(
    "SELECT email FROM utilisateurs WHERE super_admin AND statut <> 'Suspendu'"
  );
  return admins.map((a) => a.email).filter((email) => !!email);
}

function echapperHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Notifie les super-administrateurs qu'une nouvelle demande d'accès vient d'être déposée. */
export async function notifierNouvelleDemandeAcces(demande: {
  nom: string;
  email: string;
  organisation?: string;
  motif?: string;
}): Promise<void> {
  const destinataires = await destinatairesAdministrateurs();
  if (destinataires.length === 0) {
    console.warn(`[email] Aucun super-administrateur actif à notifier pour la demande de ${demande.email}`);
    return;
  }

  const lienDemandes = `${config.appUrl.replace(/\/$/, '')}/admin/demandes`;
  const subject = `Nouvelle demande d'accès — ${demande.nom}`;

  const lignesTexte = [
    "Une nouvelle demande d'accès a été déposée sur DK Événementiel.",
    '',
    `Nom : ${demande.nom}`,
    `Email : ${demande.email}`,
    demande.organisation ? `Organisation : ${demande.organisation}` : null,
    demande.motif ? `Motif : ${demande.motif}` : null,
    '',
    `Traiter la demande : ${lienDemandes}`,
  ].filter((ligne): ligne is string => ligne !== null);

  const html = `
    <p>Une nouvelle demande d'accès a été déposée sur <strong>DK Événementiel</strong>.</p>
    <ul>
      <li><strong>Nom</strong> : ${echapperHtml(demande.nom)}</li>
      <li><strong>Email</strong> : ${echapperHtml(demande.email)}</li>
      ${demande.organisation ? `<li><strong>Organisation</strong> : ${echapperHtml(demande.organisation)}</li>` : ''}
      ${demande.motif ? `<li><strong>Motif</strong> : ${echapperHtml(demande.motif)}</li>` : ''}
    </ul>
    <p><a href="${lienDemandes}">Traiter la demande</a></p>
  `;

  await envoyerEmail({ to: destinataires, subject, html, text: lignesTexte.join('\n') });
}

/**
 * Transmet à la personne le mot de passe temporaire de son compte (création, approbation d'une demande
 * d'accès, réinitialisation). Le mot de passe ne figure jamais dans le journal du serveur.
 * Retourne false si le courriel n'a pas pu partir : l'administrateur le transmet alors lui-même.
 */
export async function envoyerMotDePasseTemporaire(destinataire: { email: string; nom: string }, motDePasse: string): Promise<boolean> {
  const lien = `${config.appUrl.replace(/\/$/, '')}/connexion`;
  return envoyerEmail({
    to: destinataire.email,
    subject: 'Votre accès à DK Événementiel',
    confidentiel: true,
    text:
      `Bonjour ${destinataire.nom},\n\n` +
      `Un compte DK Événementiel vous a été ouvert, ou son mot de passe vient d'être réinitialisé.\n` +
      `Identifiant : ${destinataire.email}\nMot de passe temporaire : ${motDePasse}\n\n` +
      `Connectez-vous sur ${lien} : vous serez invité à choisir votre propre mot de passe.\n`,
    html:
      `<p>Bonjour ${echapperHtml(destinataire.nom)},</p>` +
      `<p>Un compte DK Événementiel vous a été ouvert, ou son mot de passe vient d'être réinitialisé.</p>` +
      `<p>Identifiant : <strong>${echapperHtml(destinataire.email)}</strong><br>Mot de passe temporaire : <strong>${echapperHtml(motDePasse)}</strong></p>` +
      `<p>Connectez-vous sur <a href="${echapperHtml(lien)}">${echapperHtml(lien)}</a> : vous serez invité à choisir votre propre mot de passe.</p>`,
  });
}

/** Message rendu à l'administrateur selon que le mot de passe temporaire est parti par courriel ou non. */
export function messageTransmission(envoye: boolean): string {
  return envoye
    ? 'Mot de passe temporaire envoyé par courriel.'
    : "Le courriel n'a pas pu partir : transmettez vous-même le mot de passe temporaire.";
}
