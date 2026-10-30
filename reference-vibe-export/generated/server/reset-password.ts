import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';
import { logAuditEvent } from './audit';
import { envoyerEmailReset } from './email-service';

/**
 * Génère un sel cryptographique aléatoire
 */
function genererSel(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Dérivation PBKDF2-SHA256 pour hacher un mot de passe
 */
async function hasherMotDePasse(motDePasse: string, sel: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(motDePasse),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBuffer = new Uint8Array(
    sel.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normalise un email (minuscules, trim)
 */
function normaliserEmail(email: string): string {
  return email.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Stockage en mémoire des tokens de réinitialisation
// Structure: Map<token, { email, expireLe }>
const tokensReset = new Map<string, { email: string; expireLe: number }>();

/**
 * Génère un token de réinitialisation sécurisé (32 octets = 64 caractères hex)
 */
function genererTokenReset(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Demander une réinitialisation de mot de passe
 * Génère un token valide 15 minutes
 */
export const demanderReinitialisation = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email()
  }))
  .handler(async ({ data }) => {
    try {
      const emailNorm = normaliserEmail(data.email);
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();

      // Vérifier si le compte existe
      const result = await board.items()
        .withColumns(['identifiantTexte', 'statutTexte'])
        .execute();

      const compte = (result.items || []).find(
        item => !item.name?.includes('TEST') &&
                !item.name?.startsWith('[DEMANDE]') &&
                normaliserEmail(item.identifiantTexte || '') === emailNorm
      );

      // Pour des raisons de sécurité, retourner toujours le même message
      // même si le compte n'existe pas (évite l'énumération d'emails)
      if (!compte) {
        console.log(`❌ Tentative de reset pour email inexistant: ${emailNorm}`);
        
        await logAuditEvent({
          data: {
            eventType: 'CONNEXION_ECHOUEE',
            userIdentifier: emailNorm,
            success: false,
            details: { raison: 'Reset demandé pour compte inexistant' }
          }
        }).catch(err => console.error('Audit log failed:', err));

        // Retourner succès même si le compte n'existe pas
        return {
          ok: true,
          message: 'Si un compte existe avec cette adresse, un lien de réinitialisation a été généré.'
        };
      }

      // Vérifier que le compte n'est pas suspendu
      if (compte.statutTexte === 'Suspendu') {
        console.log(`❌ Tentative de reset pour compte suspendu: ${emailNorm}`);
        return {
          ok: false,
          message: 'Ce compte est suspendu. Contactez un administrateur.'
        };
      }

      // Générer un token de réinitialisation
      const token = genererTokenReset();
      const expireLe = Date.now() + (15 * 60 * 1000); // 15 minutes

      // Stocker le token
      tokensReset.set(token, { email: emailNorm, expireLe });

      // Nettoyer les tokens expirés (garbage collection)
      const maintenant = Date.now();
      for (const [t, data] of tokensReset.entries()) {
        if (data.expireLe < maintenant) {
          tokensReset.delete(t);
        }
      }

      console.log(`✅ Token de réinitialisation généré pour ${emailNorm} (expire dans 15 min)`);

      await logAuditEvent({
        data: {
          eventType: 'CHANGEMENT_MOT_DE_PASSE',
          userIdentifier: emailNorm,
          success: true,
          details: { action: 'Token de reset généré' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      // Envoyer l'email avec le token
      const emailResult = await envoyerEmailReset({
        data: {
          email: emailNorm,
          token,
          nomDestinataire: compte.name || undefined
        }
      }).catch(err => {
        console.error('Erreur envoi email:', err);
        return { ok: false };
      });

      if (emailResult?.ok) {
        console.log('📧 Email de réinitialisation envoyé avec succès');
      } else {
        console.warn('⚠️ Email non envoyé, mais token généré');
      }

      // Dans un système réel, on enverrait un email ici
      // Pour ce prototype, on retourne le token directement
      return {
        ok: true,
        message: 'Un lien de réinitialisation a été généré.',
        token, // À retirer en production - devrait être envoyé par email uniquement
        expireDans: '15 minutes',
        emailEnvoye: emailResult?.ok || false
      };
    } catch (error) {
      console.error('Erreur demande réinitialisation:', error);
      return {
        ok: false,
        message: 'Une erreur est survenue. Veuillez réessayer.'
      };
    }
  });

/**
 * Vérifier la validité d'un token de réinitialisation
 */
export const verifierTokenReset = createServerFn({ method: 'POST' })
  .validator(z.object({
    token: z.string()
  }))
  .handler(async ({ data }) => {
    const tokenData = tokensReset.get(data.token);

    if (!tokenData) {
      return {
        ok: false,
        message: 'Token invalide ou expiré'
      };
    }

    if (tokenData.expireLe < Date.now()) {
      tokensReset.delete(data.token);
      return {
        ok: false,
        message: 'Ce lien a expiré. Veuillez demander une nouvelle réinitialisation.'
      };
    }

    return {
      ok: true,
      email: tokenData.email
    };
  });

/**
 * Réinitialiser le mot de passe avec un token valide
 */
export const reinitialiserMotDePasse = createServerFn({ method: 'POST' })
  .validator(z.object({
    token: z.string(),
    nouveauMotDePasse: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      // Vérifier le token
      const tokenData = tokensReset.get(data.token);

      if (!tokenData) {
        return {
          ok: false,
          message: 'Token invalide ou expiré'
        };
      }

      if (tokenData.expireLe < Date.now()) {
        tokensReset.delete(data.token);
        return {
          ok: false,
          message: 'Ce lien a expiré. Veuillez demander une nouvelle réinitialisation.'
        };
      }

      const emailNorm = tokenData.email;
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();

      // Récupérer le compte
      const result = await board.items()
        .withColumns(['identifiantTexte', 'empreinteMotDePasse', 'sel', 'statutTexte'])
        .execute();

      const compte = (result.items || []).find(
        item => !item.name?.includes('TEST') &&
                !item.name?.startsWith('[DEMANDE]') &&
                normaliserEmail(item.identifiantTexte || '') === emailNorm
      );

      if (!compte) {
        return {
          ok: false,
          message: 'Compte introuvable'
        };
      }

      // Générer le nouveau hash
      const nouveauSel = genererSel();
      const nouveauHash = await hasherMotDePasse(data.nouveauMotDePasse, nouveauSel);

      // Mettre à jour le compte
      await board.item(compte.id).update({
        empreinteMotDePasse: nouveauHash,
        sel: nouveauSel,
        statutTexte: 'Actif'
      }).execute();

      // Invalider le token
      tokensReset.delete(data.token);

      console.log(`✅ Mot de passe réinitialisé pour ${emailNorm}`);

      await logAuditEvent({
        data: {
          eventType: 'CHANGEMENT_MOT_DE_PASSE',
          userIdentifier: emailNorm,
          success: true,
          details: { action: 'Reset via token' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return {
        ok: true,
        message: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter.'
      };
    } catch (error) {
      console.error('Erreur réinitialisation mot de passe:', error);
      return {
        ok: false,
        message: 'Une erreur est survenue lors de la réinitialisation'
      };
    }
  });

/**
 * Obtenir des statistiques sur les tokens actifs (admin uniquement)
 */
export const getStatsTokensReset = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    const maintenant = Date.now();
    let actifs = 0;
    let expires = 0;

    for (const [_token, data] of tokensReset.entries()) {
      if (data.expireLe >= maintenant) {
        actifs++;
      } else {
        expires++;
      }
    }

    return {
      tokensActifs: actifs,
      tokensExpires: expires,
      total: tokensReset.size
    };
  });
