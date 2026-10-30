import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';
import { logAuditEvent } from './audit';
import { envoyerEmailApprobationClient } from './monday-email';
import { tokensApprobation } from './demande-acces';

/**
 * Fonctions de cryptographie (PBKDF2-SHA256)
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

function genererSel(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

async function genererHash(motDePasse: string): Promise<{ hash: string; sel: string }> {
  const sel = genererSel();
  const hash = await hasherMotDePasse(motDePasse, sel);
  return { hash, sel };
}

/**
 * Génère un mot de passe temporaire sécurisé
 */
function genererMotDePasseTemporaire(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map(x => charset[x % charset.length])
    .join('');
}

/**
 * Approuver une demande via le token (appelé quand l'admin clique sur le lien)
 */
export const approuverViaToken = createServerFn({ method: 'POST' })
  .validator(z.object({
    token: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      // Vérifier le token
      const tokenData = tokensApprobation.get(data.token);
      
      if (!tokenData) {
        return {
          ok: false,
          message: 'Lien d\'approbation invalide ou déjà utilisé'
        };
      }

      if (tokenData.expireLe < Date.now()) {
        tokensApprobation.delete(data.token);
        return {
          ok: false,
          message: 'Ce lien d\'approbation a expiré'
        };
      }

      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      // Récupérer la demande
      const demande = await board.item(tokenData.demandeId)
        .withColumns(['identifiantTexte', 'rleTexte', 'empreinteMotDePasse', 'sel', 'statutTexte'])
        .execute();

      if (!demande || !demande.identifiantTexte || !demande.rleTexte) {
        return {
          ok: false,
          message: 'Demande introuvable ou données manquantes'
        };
      }

      // Vérifier que la demande n'a pas déjà été traitée
      if (demande.statutTexte !== 'En attente') {
        return {
          ok: false,
          message: 'Cette demande a déjà été traitée'
        };
      }

      const email = demande.identifiantTexte;
      const role = demande.rleTexte as 'Consultant' | 'Administrateur';
      const nom = demande.name?.replace('[DEMANDE] ', '') || '';

      // Générer un mot de passe temporaire lisible
      const motDePasseTemporaire = genererMotDePasseTemporaire();
      
      // Crypter le mot de passe pour le board
      const { hash, sel } = await genererHash(motDePasseTemporaire);

      // Créer le compte utilisateur
      await board.item().create({
        name: nom,
        identifiantTexte: email,
        rleTexte: role,
        statutTexte: 'Actif',
        empreinteMotDePasse: hash,
        sel: sel,
        dernireConnexionTexte: ''
      }).execute();

      // Marquer la demande comme approuvée
      await board.item(tokenData.demandeId).update({
        statutTexte: 'Approuvée'
      }).execute();

      // Invalider le token (usage unique)
      tokensApprobation.delete(data.token);

      // Logger l'événement
      await logAuditEvent({
        data: {
          eventType: 'CREATION_COMPTE',
          userIdentifier: email,
          success: true,
          details: { role, par: 'Approbation automatique via token' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      console.log(`✅ Compte créé automatiquement pour ${email} (${role})`);

      // Envoyer l'email au client avec ses identifiants
      const emailResult = await envoyerEmailApprobationClient({
        data: {
          email,
          nom,
          motDePasse: motDePasseTemporaire,
          role
        }
      });

      console.log('📧 Email client préparé:', emailResult?.ok ? 'OK' : 'Échec');

      return {
        ok: true,
        message: 'Compte créé avec succès. L\'utilisateur a reçu ses identifiants par email.',
        compte: {
          nom,
          email,
          role
        }
      };
    } catch (error) {
      console.error('Erreur approbation via token:', error);
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Erreur lors de l\'approbation'
      };
    }
  });

/**
 * Vérifier la validité d'un token d'approbation
 */
export const verifierTokenApprobation = createServerFn({ method: 'GET' })
  .validator(z.object({
    token: z.string()
  }))
  .handler(async ({ data }) => {
    const tokenData = tokensApprobation.get(data.token);
    
    if (!tokenData) {
      return { valide: false, raison: 'Token invalide ou déjà utilisé' };
    }

    if (tokenData.expireLe < Date.now()) {
      tokensApprobation.delete(data.token);
      return { valide: false, raison: 'Token expiré' };
    }

    // Récupérer les infos de la demande
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const demande = await board.item(tokenData.demandeId)
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'empreinteMotDePasse', 'sel'])
        .execute();

      if (!demande) {
        return { valide: false, raison: 'Demande introuvable' };
      }

      return {
        valide: true,
        demande: {
          nom: demande.name?.replace('[DEMANDE] ', '') || '',
          email: demande.identifiantTexte || '',
          role: demande.rleTexte || '',
          organisation: demande.sel || '',
          motif: demande.empreinteMotDePasse || '',
          statut: demande.statutTexte || ''
        }
      };
    } catch (error) {
      console.error('Erreur vérification token:', error);
      return { valide: false, raison: 'Erreur lors de la vérification' };
    }
  });
