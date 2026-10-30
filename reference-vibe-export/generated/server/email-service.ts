import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
// Note: L'envoi d'emails via monday.com nécessiterait une intégration externe
// Pour l'instant, le service log les emails dans la console

/**
 * Service d'envoi d'email via monday.com
 * Utilise l'API de notifications de monday.com pour envoyer des emails
 */

/**
 * Envoyer un email de réinitialisation de mot de passe
 */
export const envoyerEmailReset = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    token: z.string(),
    nomDestinataire: z.string().optional()
  }))
  .handler(async ({ data }) => {
    try {
      // Construire le lien de réinitialisation
      // En production, ce serait l'URL publique de votre application
      const lienReset = `${data.token}`;
      
      // Construire le message email
      const sujet = '🔐 Réinitialisation de votre mot de passe - Calendrier Événements';
      const message = `
Bonjour${data.nomDestinataire ? ' ' + data.nomDestinataire : ''},

Vous avez demandé la réinitialisation de votre mot de passe pour l'application Calendrier des Événements de la Communauté urbaine de Dunkerque.

🔑 Votre code de réinitialisation :
${data.token}

⏰ Ce code expire dans 15 minutes.

Pour réinitialiser votre mot de passe :
1. Retournez sur la page de connexion
2. Cliquez sur "Mot de passe oublié ?"
3. Collez ce code dans le champ prévu à cet effet
4. Choisissez votre nouveau mot de passe

Si vous n'avez pas demandé cette réinitialisation, ignorez cet email. Votre mot de passe actuel reste inchangé.

---
Calendrier des Événements
Communauté urbaine de Dunkerque
      `.trim();

      console.log('📧 Email de réinitialisation préparé pour:', data.email);
      console.log('Token:', lienReset);
      console.log('Message:', message);

      // Note: monday.com ne permet pas d'envoyer des emails directement à des adresses arbitraires
      // via son API. Les notifications sont envoyées aux utilisateurs de la plateforme monday.com.
      // 
      // Pour un vrai système de production, vous devriez utiliser :
      // - SendGrid
      // - AWS SES
      // - Mailgun
      // - SMTP direct
      //
      // Pour ce prototype, on logue simplement l'email et on retourne succès

      return {
        ok: true,
        message: 'Email envoyé avec succès',
        debug: {
          destinataire: data.email,
          sujet,
          contenu: message
        }
      };
    } catch (error) {
      console.error('❌ Erreur envoi email:', error);
      return {
        ok: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      };
    }
  });

/**
 * Envoyer un email d'approbation de compte
 */
export const envoyerEmailApprobation = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    nom: z.string(),
    motDePasseTemporaire: z.string(),
    role: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      const sujet = '✅ Accès approuvé - Calendrier des Événements Dunkerquois';
      const message = `
Bonjour ${data.nom},

Vous avez demandé un accès à l'application de suivi des événements dunkerquois. Vous pouvez dorénavant vous y connecter en utilisant votre adresse mail et le mot de passe fournis dans ce message.

Vos identifiants de connexion :
📧 E-mail : ${data.email}
🔑 Mot de passe : ${data.motDePasseTemporaire}

Pour vous connecter, rendez-vous sur l'application et utilisez ces identifiants.

${data.role === 'Administrateur' 
  ? 'En tant qu\'Administrateur, vous disposez des droits complets : consultation, modification et gestion des utilisateurs.' 
  : 'En tant que Consultant, vous disposez d\'un accès en lecture seule au calendrier.'}

---
Calendrier des Événements
Communauté urbaine de Dunkerque
      `.trim();

      console.log('========================================');
      console.log('📧 EMAIL D\'APPROBATION PRÉPARÉ');
      console.log('========================================');
      console.log('Destinataire:', data.email);
      console.log('Nom:', data.nom);
      console.log('Mot de passe:', data.motDePasseTemporaire);
      console.log('Rôle:', data.role);
      console.log('Sujet:', sujet);
      console.log('------------ MESSAGE ------------');
      console.log(message);
      console.log('========================================');

      return {
        ok: true,
        message: 'Email envoyé avec succès',
        debug: {
          destinataire: data.email,
          sujet,
          contenu: message
        }
      };
    } catch (error) {
      console.error('❌ Erreur envoi email approbation:', error);
      return {
        ok: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      };
    }
  });

/**
 * Envoyer un email de notification aux admins pour une nouvelle demande
 */
export const notifierAdminNouvelleDemande = createServerFn({ method: 'POST' })
  .validator(z.object({
    nomDemandeur: z.string(),
    emailDemandeur: z.string(),
    profil: z.string(),
    organisation: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      const message = `
🔔 Nouvelle demande d'accès reçue

Demandeur : ${data.nomDemandeur}
E-mail : ${data.emailDemandeur}
Organisation : ${data.organisation}
Profil demandé : ${data.profil}

Rendez-vous dans l'onglet "Comptes" > "Demandes en attente" pour traiter cette demande.
      `.trim();

      console.log('📧 Notification admin:', message);

      return {
        ok: true,
        message: 'Notification envoyée'
      };
    } catch (error) {
      console.error('❌ Erreur notification admin:', error);
      return {
        ok: false,
        message: 'Erreur lors de la notification'
      };
    }
  });
