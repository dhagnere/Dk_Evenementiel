import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Service d'envoi d'emails via l'API monday.com
 * Utilise les updates de board pour créer des notifications email
 */

/**
 * Envoyer un email à l'administrateur pour notifier d'une nouvelle demande d'accès
 * avec un lien d'approbation direct
 */
export const envoyerEmailDemandeAdmin = createServerFn({ method: 'POST' })
  .validator(z.object({
    adminEmail: z.string().email(),
    nomDemandeur: z.string(),
    emailDemandeur: z.string().email(),
    profil: z.enum(['Consultant', 'Administrateur']),
    organisation: z.string(),
    motif: z.string(),
    demandeId: z.string(),
    lienApprobation: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      // Construire le message d'email pour l'admin
      const sujet = `🔔 Nouvelle demande d'accès - ${data.nomDemandeur}`;
      
      const message = `Bonjour,

Une nouvelle demande d'accès à l'application Calendrier des Événements a été soumise.

📋 INFORMATIONS DU DEMANDEUR
━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Nom : ${data.nomDemandeur}
📧 Email : ${data.emailDemandeur}
🏢 Organisation : ${data.organisation}
🔐 Profil demandé : ${data.profil}

💬 Motif de la demande :
${data.motif}

✅ APPROUVER LA DEMANDE
━━━━━━━━━━━━━━━━━━━━━━━━━
Cliquez sur le lien ci-dessous pour approuver automatiquement cette demande :

${data.lienApprobation}

Un compte sera créé automatiquement et le demandeur recevra ses identifiants par email.

⚠️ Ce lien est à usage unique et expire après utilisation.

────────────────────────────
Calendrier des Événements
Communauté urbaine de Dunkerque`;

      // Log pour debug
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 EMAIL À ENVOYER À L\'ADMINISTRATEUR');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`À: ${data.adminEmail}`);
      console.log(`Sujet: ${sujet}`);
      console.log('─────────────────────────────────────');
      console.log(message);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // TODO: Intégration avec service d'email externe (SendGrid, AWS SES, etc.)
      // Pour l'instant, on retourne les informations pour affichage
      
      return {
        ok: true,
        message: 'Email préparé (à envoyer via service externe)',
        emailData: {
          to: data.adminEmail,
          subject: sujet,
          body: message
        }
      };
    } catch (error) {
      console.error('Erreur préparation email admin:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  });

/**
 * Envoyer un email au demandeur avec ses identifiants après approbation
 */
export const envoyerEmailApprobationClient = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    nom: z.string(),
    motDePasse: z.string(),
    role: z.enum(['Consultant', 'Administrateur'])
  }))
  .handler(async ({ data }) => {
    try {
      const sujet = '✅ Votre accès à l\'application Calendrier des Événements';
      
      const message = `Bonjour ${data.nom},

Vous avez demandé un accès à l'application de suivi des événements dunkerquois. Vous pouvez dorénavant vous y connecter en utilisant votre adresse mail et le mot de passe fournis dans ce message.

🔐 VOS IDENTIFIANTS
━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Email : ${data.email}
🔑 Mot de passe : ${data.motDePasse}
👤 Profil : ${data.role}

🌐 ACCÉDER À L'APPLICATION
━━━━━━━━━━━━━━━━━━━━━━━━━
Rendez-vous sur l'application et connectez-vous avec vos identifiants.

⚠️ IMPORTANT
━━━━━━━━━━━━━━━━━━━━━━━━━
Pour des raisons de sécurité, nous vous recommandons de changer ce mot de passe lors de votre première connexion.

${data.role === 'Consultant' 
  ? '📖 En tant que Consultant, vous disposez d\'un accès en lecture seule pour consulter le calendrier des événements.'
  : '✏️ En tant qu\'Administrateur, vous pouvez modifier les événements et gérer les utilisateurs.'}

Si vous n'avez pas demandé cet accès, veuillez contacter immédiatement un administrateur.

────────────────────────────
Calendrier des Événements
Communauté urbaine de Dunkerque`;

      // Log pour debug
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('📧 EMAIL À ENVOYER AU CLIENT');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`À: ${data.email}`);
      console.log(`Sujet: ${sujet}`);
      console.log('─────────────────────────────────────');
      console.log(message);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

      // TODO: Intégration avec service d'email externe
      
      return {
        ok: true,
        message: 'Email préparé (à envoyer via service externe)',
        emailData: {
          to: data.email,
          subject: sujet,
          body: message
        }
      };
    } catch (error) {
      console.error('Erreur préparation email client:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Erreur inconnue'
      };
    }
  });
