import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';
import { logAuditEvent } from './audit';

/**
 * Dérivation PBKDF2-SHA256 pour hacher un mot de passe
 * @param motDePasse - mot de passe en clair
 * @param sel - sel cryptographique en hexadécimal
 * @returns empreinte en hexadécimal
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
 * Génère un sel cryptographique aléatoire
 * @returns sel en hexadécimal (32 octets)
 */
function genererSel(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Normalisation pour comparaison insensible à la casse et aux accents
 */
function normaliser(str: string | null): string {
  if (!str) return '';
  return str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Vérifie si au moins un administrateur actif existe
 */
export const existeAdministrateur = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte'])
        .execute();
      
      // Filtrer uniquement les demandes (garder tous les comptes réels)
      const comptesReels = result.items.filter((item: any) => {
        const estDemande = item.name?.startsWith('[DEMANDE]');
        return !estDemande;
      });
      
      const nombreComptes = comptesReels.length;
      
      const adminActif = comptesReels.some((item: any) => {
        const roleNorm = normaliser(item.rleTexte);
        const statutNorm = normaliser(item.statutTexte);
        return roleNorm === 'administrateur' && statutNorm === 'actif';
      });
      
      // Log de vérification (événement système)
      await logAuditEvent({
        data: {
          eventType: 'VERIFICATION_ADMIN',
          userIdentifier: 'SYSTEM',
          success: true,
          details: { nombreComptes, adminTrouve: adminActif }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return {
        existe: adminActif,
        nombreComptes
      };
    } catch (error) {
      // Log d'échec
      await logAuditEvent({
        data: {
          eventType: 'VERIFICATION_ADMIN',
          userIdentifier: 'SYSTEM',
          success: false,
          details: { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      throw new Error(
        error instanceof Error 
          ? `Erreur lors de la lecture du board : ${error.message}`
          : 'Impossible de lire la base des comptes utilisateurs'
      );
    }
  });

/**
 * Initialise le tout premier compte administrateur
 */
export const initialiserAdministrateur = createServerFn({ method: 'POST' })
  .validator(z.object({
    nom: z.string().min(1),
    email: z.string().email(),
    motDePasse: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      // Vérifier qu'aucun admin n'existe déjà
      const etat = await existeAdministrateur();
      if (etat.existe) {
        return { ok: false, message: 'Un administrateur existe déjà' };
      }

      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const sel = genererSel();
      const empreinte = await hasherMotDePasse(data.motDePasse, sel);

      const emailLower = data.email.toLowerCase();
      const aujourdHui = new Date().toISOString().split('T')[0]; // AAAA-MM-JJ

      await board.item().create({
        name: data.nom,
        identifiantTexte: emailLower,
        rleTexte: 'Administrateur',
        statutTexte: 'Actif',
        empreinteMotDePasse: empreinte,
        sel: sel,
        dernireConnexionTexte: aujourdHui
      }).execute();

      // Log de création du compte admin initial
      await logAuditEvent({
        data: {
          eventType: 'INITIALISATION_ADMIN',
          userIdentifier: emailLower,
          success: true,
          details: { nom: data.nom }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return { ok: true, message: 'Compte administrateur créé avec succès' };
    } catch (error) {
      console.error('Erreur initialisation admin:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
      
      // Log d'échec de création
      await logAuditEvent({
        data: {
          eventType: 'INITIALISATION_ADMIN',
          userIdentifier: data.email.toLowerCase(),
          success: false,
          details: { error: errorMsg, nom: data.nom }
        }
      }).catch(err => console.error('Audit log failed:', err));
      
      return { 
        ok: false, 
        message: `Échec de création : ${errorMsg}` 
      };
    }
  });

/**
 * Authentifie un utilisateur
 */
export const connexion = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    motDePasse: z.string().min(1)
  }))
  .handler(async ({ data }) => {
    try {
      console.log('========================================');
      console.log('🔍 DÉBUT TENTATIVE DE CONNEXION');
      console.log('Email recherché:', data.email);
      console.log('Mot de passe reçu (longueur):', data.motDePasse.length, 'caractères');
      console.log('Mot de passe reçu (prévisualisation):', data.motDePasse.substring(0, 4) + '***');
      console.log('========================================');

            const board = new ComptesUtilisateursCalendrierEvenementsBoard();
            const emailNorm = data.email.toLowerCase();

      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'empreinteMotDePasse', 'sel'])
        .execute();

      console.log('📋 Nombre total d\'items récupérés:', result.items?.length || 0);

      // Filtrer uniquement les demandes (garder tous les comptes réels)
      const comptesReels = result.items.filter((item: any) => {
        const estDemande = item.name?.startsWith('[DEMANDE]');
        return !estDemande;
      });

      console.log('📋 Nombre de comptes réels (sans TEST ni DEMANDE):', comptesReels.length);
      console.log('📋 Liste des comptes:', comptesReels.map(c => ({
        name: c.name,
        email: c.identifiantTexte,
        role: c.rleTexte,
        statut: c.statutTexte,
        hasHash: !!c.empreinteMotDePasse,
        hasSalt: !!c.sel
      })));

      const compte = comptesReels.find((item: any) => 
        item.identifiantTexte?.toLowerCase() === emailNorm
      );

      if (!compte) {
        console.log('❌ Compte non trouvé pour:', emailNorm);
        
        await logAuditEvent({
          data: {
            eventType: 'CONNEXION_ECHOUEE',
            userIdentifier: emailNorm,
            success: false,
            details: { raison: 'Utilisateur inexistant' }
          }
        }).catch(err => console.error('Audit log failed:', err));

        return { ok: false, message: 'Identifiant ou mot de passe incorrect' };
      }

      console.log('✅ Compte trouvé:', {
        name: compte.name,
        email: compte.identifiantTexte,
        role: compte.rleTexte,
        statut: compte.statutTexte,
        hasHash: !!compte.empreinteMotDePasse,
        hasSalt: !!compte.sel,
        hashLength: compte.empreinteMotDePasse?.length,
        saltLength: compte.sel?.length
      });

      const statutNorm = normaliser(compte.statutTexte);
      if (statutNorm === 'suspendu') {
        console.log('❌ Compte suspendu');
        
        await logAuditEvent({
          data: {
            eventType: 'CONNEXION_ECHOUEE',
            userIdentifier: emailNorm,
            success: false,
            details: { raison: 'Compte suspendu' }
          }
        }).catch(err => console.error('Audit log failed:', err));

        return { ok: false, message: 'Identifiant ou mot de passe incorrect' };
      }

      if (!compte.empreinteMotDePasse || !compte.sel) {
        console.log('❌ Hash ou sel manquant');
        return { ok: false, message: 'Identifiant ou mot de passe incorrect' };
      }

      console.log('🔐 Calcul du hash avec le mot de passe fourni...');
      console.log('Sel utilisé (premiers 20 chars):', compte.sel.substring(0, 20));
      
      const empreinteCalculee = await hasherMotDePasse(data.motDePasse, compte.sel);
      
      console.log('Hash stocké (premiers 20 chars):', compte.empreinteMotDePasse.substring(0, 20));
      console.log('Hash calculé (premiers 20 chars):', empreinteCalculee.substring(0, 20));
      console.log('Hashes correspondent:', empreinteCalculee === compte.empreinteMotDePasse);
      
      if (empreinteCalculee !== compte.empreinteMotDePasse) {
        console.log('❌ Mot de passe incorrect');
        
        await logAuditEvent({
          data: {
            eventType: 'CONNEXION_ECHOUEE',
            userIdentifier: emailNorm,
            success: false,
            details: { raison: 'Mot de passe incorrect' }
          }
        }).catch(err => console.error('Audit log failed:', err));

        return { 
          ok: false, 
          message: 'Identifiant ou mot de passe incorrect',
          debug: {
            motDePasseLength: data.motDePasse.length,
            selLength: compte.sel.length,
            hashStockePreview: compte.empreinteMotDePasse.substring(0, 30),
            hashCalculePreview: empreinteCalculee.substring(0, 30),
            selPreview: compte.sel.substring(0, 30)
          }
        };
      }

      console.log('✅ Mot de passe correct !');

      // Mise à jour de la dernière connexion
      const aujourdHui = new Date().toISOString().split('T')[0];
      await board.item(compte.id).update({
        dernireConnexionTexte: aujourdHui
      }).execute();

      const roleNorm = normaliser(compte.rleTexte);
      const role = roleNorm === 'administrateur' ? 'Administrateur' : 'Consultant';

      await logAuditEvent({
        data: {
          eventType: 'CONNEXION_REUSSIE',
          userIdentifier: emailNorm,
          success: true,
          details: { nom: compte.name, role: role }
        }
      }).catch(err => console.error('Audit log failed:', err));

      console.log('========================================');
      console.log('✅ CONNEXION RÉUSSIE');
      console.log('========================================');

      return {
        ok: true,
        message: 'Connexion réussie',
        session: {
          email: compte.identifiantTexte || emailNorm,
          nom: compte.name,
          role: role as 'Administrateur' | 'Consultant',
          expireLe: Date.now() + 8 * 60 * 60 * 1000
        }
      };
    } catch (error) {
      console.error('========================================');
      console.error('❌ ERREUR LORS DE LA CONNEXION');
      console.error('Error:', error);
      console.error('========================================');
      
      await logAuditEvent({
        data: {
          eventType: 'CONNEXION_ECHOUEE',
          userIdentifier: data.email.toLowerCase(),
          success: false,
          details: { raison: 'Erreur système', error: error instanceof Error ? error.message : 'Unknown' }
        }
      }).catch(err => console.error('Audit log failed:', err));
      
      return { ok: false, message: 'Identifiant ou mot de passe incorrect' };
    }
  });

/**
 * Crée un nouveau compte utilisateur
 */
export const creerCompte = createServerFn({ method: 'POST' })
  .validator(z.object({
    nom: z.string().min(1),
    email: z.string().email(),
    role: z.enum(['Administrateur', 'Consultant']),
    motDePasseTemporaire: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const emailLower = data.email.toLowerCase();
      const sel = genererSel();
      const empreinte = await hasherMotDePasse(data.motDePasseTemporaire, sel);

      await board.item().create({
        name: data.nom,
        identifiantTexte: emailLower,
        rleTexte: data.role,
        statutTexte: 'Mot de passe a definir',
        empreinteMotDePasse: empreinte,
        sel: sel,
        dernireConnexionTexte: '-'
      }).execute();

      // Log de création de compte
      await logAuditEvent({
        data: {
          eventType: 'CREATION_COMPTE',
          userIdentifier: emailLower,
          success: true,
          details: { nom: data.nom, role: data.role }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return { ok: true, message: 'Compte créé avec succès' };
    } catch (error) {
      console.error('Erreur création compte:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
      
      // Log d'échec de création de compte
      await logAuditEvent({
        data: {
          eventType: 'CREATION_COMPTE',
          userIdentifier: data.email.toLowerCase(),
          success: false,
          details: { error: errorMsg, nom: data.nom, role: data.role }
        }
      }).catch(err => console.error('Audit log failed:', err));
      
      return { 
        ok: false, 
        message: `Échec de création du compte : ${errorMsg}` 
      };
    }
  });

/**
 * Change le mot de passe d'un utilisateur
 */
export const changerMotDePasse = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    ancienMotDePasse: z.string().min(1),
    nouveauMotDePasse: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const emailNorm = data.email.toLowerCase();

      const result = await board.items()
        .withColumns(['identifiantTexte', 'empreinteMotDePasse', 'sel', 'statutTexte'])
        .execute();

      // Filtrer uniquement les demandes (garder tous les comptes réels)
      const comptesReels = result.items.filter((item: any) => {
        const estDemande = item.name?.startsWith('[DEMANDE]');
        return !estDemande;
      });

      const compte = comptesReels.find((item: any) => 
        item.identifiantTexte?.toLowerCase() === emailNorm
      );

      if (!compte || !compte.empreinteMotDePasse || !compte.sel) {
        return { ok: false, message: 'Compte introuvable' };
      }

      const empreinteAncien = await hasherMotDePasse(data.ancienMotDePasse, compte.sel);
      if (empreinteAncien !== compte.empreinteMotDePasse) {
        return { ok: false, message: 'Ancien mot de passe incorrect' };
      }

      const nouveauSel = genererSel();
      const nouvelleEmpreinte = await hasherMotDePasse(data.nouveauMotDePasse, nouveauSel);

      await board.item(compte.id).update({
        empreinteMotDePasse: nouvelleEmpreinte,
        sel: nouveauSel,
        statutTexte: 'Actif'
      }).execute();

      // Log de changement de mot de passe
      await logAuditEvent({
        data: {
          eventType: 'CHANGEMENT_MOT_DE_PASSE',
          userIdentifier: emailNorm,
          success: true,
          details: { statutAvant: compte.statutTexte, statutApres: 'Actif' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return { ok: true, message: 'Mot de passe changé avec succès' };
    } catch (error) {
      console.error('Erreur changement mot de passe:', error);
      const errorMsg = error instanceof Error ? error.message : 'Erreur inconnue';
      
      // Log d'échec de changement de mot de passe
      await logAuditEvent({
        data: {
          eventType: 'CHANGEMENT_MOT_DE_PASSE',
          userIdentifier: data.email.toLowerCase(),
          success: false,
          details: { error: errorMsg }
        }
      }).catch(err => console.error('Audit log failed:', err));
      
      return { 
        ok: false, 
        message: `Échec du changement de mot de passe : ${errorMsg}` 
      };
    }
  });

/**
 * Liste tous les comptes (sans empreintes ni sels)
 */
export const listerComptes = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'dernireConnexionTexte'])
        .execute();

      // Filtrer uniquement les demandes (garder tous les comptes réels)
      const comptesReels = result.items.filter((item: any) => {
        const estDemande = item.name?.startsWith('[DEMANDE]');
        return !estDemande;
      });

      return comptesReels.map((item: any) => ({
        id: item.id,
        nom: item.name,
        email: item.identifiantTexte || '',
        role: item.rleTexte || '',
        statut: item.statutTexte || '',
        derniereConnexion: item.dernireConnexionTexte || null
      }));
    } catch (error) {
      console.error('Erreur liste comptes:', error);
      throw new Error(
        error instanceof Error 
          ? error.message 
          : 'Erreur lors de la récupération des comptes'
      );
    }
  });
