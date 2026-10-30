import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';
import { logAuditEvent } from './audit';
import { envoyerEmailApprobation } from './email-service';

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
 * Génère un hash PBKDF2 avec sel aléatoire
 */
async function genererHash(motDePasse: string): Promise<{ hash: string; sel: string }> {
  const sel = genererSel();
  const hash = await hasherMotDePasse(motDePasse, sel);
  return { hash, sel };
}

/**
 * Récupérer toutes les demandes d'accès en attente
 */
export const getDemandesEnAttente = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'empreinteMotDePasse', 'sel', 'dernireConnexionTexte'])
        .execute();

      // Filtrer uniquement les demandes (préfixe [DEMANDE]) en attente
      const demandes = (result.items || [])
        .filter(item => 
          item.name?.startsWith('[DEMANDE]') && 
          item.statutTexte === 'En attente'
        )
        .map(item => ({
          id: item.id,
          nom: item.name?.replace('[DEMANDE] ', '') || '',
          email: item.identifiantTexte || '',
          profil: item.rleTexte || '',
          motif: item.empreinteMotDePasse || '', // Stocké temporairement ici
          organisation: item.sel || '', // Stocké temporairement ici
          dateDemande: item.dernireConnexionTexte || '',
        }));

      return { demandes };
    } catch (error) {
      console.error('Erreur récupération demandes:', error);
      return { demandes: [] };
    }
  });

/**
 * Récupérer tous les comptes utilisateurs actifs
 */
export const getComptesUtilisateurs = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'dernireConnexionTexte'])
        .execute();

      // Filtrer uniquement les vrais comptes (sans préfixe [DEMANDE] et sans TEST)
      const comptes = (result.items || [])
        .filter(item => 
          !item.name?.startsWith('[DEMANDE]') && 
          !item.name?.includes('TEST')
        )
        .map(item => ({
          id: item.id,
          nom: item.name || '',
          email: item.identifiantTexte || '',
          role: item.rleTexte || '',
          statut: item.statutTexte || '',
          derniereConnexion: item.dernireConnexionTexte || '',
        }));

      return { comptes };
    } catch (error) {
      console.error('Erreur récupération comptes:', error);
      return { comptes: [] };
    }
  });

/**
 * Approuver une demande d'accès et créer le compte utilisateur
 */
export const approuverDemande = createServerFn({ method: 'POST' })
  .validator(z.object({
    demandeId: z.string(),
    motDePasseTemporaire: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      console.log('========================================');
      console.log('🔄 DÉBUT APPROBATION DEMANDE');
      console.log('Demande ID:', data.demandeId);
      console.log('Mot de passe temporaire reçu:', data.motDePasseTemporaire);
      console.log('========================================');

      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      // Récupérer la demande
      const demande = await board.item(data.demandeId)
        .withColumns(['identifiantTexte', 'rleTexte', 'empreinteMotDePasse', 'sel', 'statutTexte'])
        .execute();

      console.log('📋 Demande récupérée:', {
        id: demande?.id,
        name: demande?.name,
        email: demande?.identifiantTexte,
        role: demande?.rleTexte,
        statut: demande?.statutTexte,
        motif: demande?.empreinteMotDePasse,
        organisation: demande?.sel
      });

      if (!demande || !demande.identifiantTexte || !demande.rleTexte) {
        throw new Error('Demande introuvable ou données manquantes');
      }

      // Vérifier que c'est bien une demande (pas un compte existant)
      if (!demande.name?.startsWith('[DEMANDE]')) {
        throw new Error('Cet item n\'est pas une demande d\'accès');
      }

      const email = demande.identifiantTexte;
      const role = demande.rleTexte;
      const nom = demande.name?.replace('[DEMANDE] ', '') || '';

      console.log('👤 Informations extraites:', { nom, email, role });

      // Vérifier si un compte existe déjà avec cet email
      const result = await board.items()
        .withColumns(['identifiantTexte'])
        .execute();
      
      const compteExistant = (result.items || []).find(
        item => !item.name?.startsWith('[DEMANDE]') && 
                item.identifiantTexte?.toLowerCase() === email.toLowerCase()
      );

      if (compteExistant) {
        console.log('❌ Un compte existe déjà pour cet email');
        
        // Archiver quand même la demande puisque le compte existe
        try {
          await board.item(data.demandeId).archive().execute();
          console.log('✅ Demande archivée (compte déjà existant)');
        } catch (archErr) {
          console.error('Erreur archivage demande:', archErr);
        }
        
        return {
          ok: false,
          message: 'Un compte existe déjà avec cette adresse email'
        };
      }

      // Générer le hash et le sel pour le mot de passe temporaire
      console.log('🔐 Génération du hash...');
      const { hash, sel } = await genererHash(data.motDePasseTemporaire);
      console.log('✅ Hash généré - Longueur:', hash.length, '- Sel longueur:', sel.length);

      // Créer le compte utilisateur
      console.log('📝 Création du compte utilisateur...');
      const nouveauCompte = await board.item().create({
        name: nom,
        identifiantTexte: email,
        rleTexte: role,
        statutTexte: 'Actif',
        empreinteMotDePasse: hash,
        sel: sel,
        dernireConnexionTexte: ''
      }).execute();
      console.log('✅ Compte utilisateur créé - ID:', nouveauCompte.id);

      // Supprimer la demande (ou la marquer comme approuvée puis l'archiver)
      console.log('🗑️ Archivage de la demande...');
      await board.item(data.demandeId).archive().execute();
      console.log('✅ Demande archivée');

      // Logger l'événement
      await logAuditEvent({
        data: {
          eventType: 'CREATION_COMPTE',
          userIdentifier: email,
          success: true,
          details: { role, par: 'Approbation demande' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      console.log(`✅ Compte créé pour ${email} (${role}) avec mot de passe temporaire`);

      // Envoyer l'email d'approbation
      console.log('📧 Envoi de l\'email d\'approbation...');
      const emailResult = await envoyerEmailApprobation({
        data: {
          email,
          nom,
          motDePasseTemporaire: data.motDePasseTemporaire,
          role
        }
      }).catch(err => {
        console.error('Erreur envoi email approbation:', err);
        return { ok: false };
      });

      if (emailResult?.ok) {
        console.log('✅ Email d\'approbation envoyé avec succès');
      } else {
        console.warn('⚠️ Email non envoyé, mais compte créé');
      }

      console.log('========================================');
      console.log('✅ APPROBATION TERMINÉE AVEC SUCCÈS');
      console.log('========================================');

      return { 
        ok: true, 
        message: 'Compte créé avec succès. L\'utilisateur recevra ses identifiants par e-mail.',
        email,
        motDePasseTemporaire: data.motDePasseTemporaire,
        emailEnvoye: emailResult?.ok || false
      };
    } catch (error) {
      console.error('========================================');
      console.error('❌ ERREUR APPROBATION DEMANDE');
      console.error('Error:', error);
      console.error('========================================');
      return { 
        ok: false, 
        message: error instanceof Error ? error.message : 'Erreur lors de la création du compte'
      };
    }
  });

/**
 * Rejeter une demande d'accès
 */
export const rejeterDemande = createServerFn({ method: 'POST' })
  .validator(z.object({
    demandeId: z.string(),
    motifRejet: z.string().optional()
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      // Marquer la demande comme rejetée
      await board.item(data.demandeId).update({
        statutTexte: 'Rejetée',
        dernireConnexionTexte: data.motifRejet || 'Rejetée par l\'administrateur'
      }).execute();

      console.log(`❌ Demande ${data.demandeId} rejetée`);

      return { 
        ok: true, 
        message: 'Demande rejetée'
      };
    } catch (error) {
      console.error('Erreur rejet demande:', error);
      return { 
        ok: false, 
        message: 'Erreur lors du rejet'
      };
    }
  });

/**
 * Créer un compte utilisateur manuellement (par l'admin)
 */
export const creerCompteManuel = createServerFn({ method: 'POST' })
  .validator(z.object({
    nom: z.string(),
    email: z.string().email(),
    role: z.enum(['Administrateur', 'Consultant']),
    motDePasseTemporaire: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      // Normaliser l'email
      const emailNorm = data.email.trim().toLowerCase();
      
      // Vérifier si un compte existe déjà
      const existing = await board.items()
        .withColumns(['identifiantTexte'])
        .execute();
      
      const dejaExistant = (existing.items || []).some(
        item => !item.name?.includes('TEST') && 
                !item.name?.startsWith('[DEMANDE]') &&
                item.identifiantTexte?.toLowerCase() === emailNorm
      );
      
      if (dejaExistant) {
        return { ok: false, message: 'Un compte existe déjà avec cette adresse e-mail' };
      }

      // Générer le hash et le sel
      const { hash, sel } = await genererHash(data.motDePasseTemporaire);

      // Créer le compte
      await board.item().create({
        name: data.nom,
        identifiantTexte: emailNorm,
        rleTexte: data.role,
        statutTexte: 'Mot de passe à définir',
        empreinteMotDePasse: hash,
        sel: sel,
        dernireConnexionTexte: ''
      }).execute();

      // Logger l'événement
      await logAuditEvent({
        data: {
          eventType: 'CREATION_COMPTE',
          userIdentifier: emailNorm,
          success: true,
          details: { role: data.role, par: 'Création manuelle' }
        }
      }).catch(err => console.error('Audit log failed:', err));

      console.log(`✅ Compte créé manuellement pour ${emailNorm} (${data.role})`);

      return { 
        ok: true, 
        message: 'Compte créé avec succès',
        email: emailNorm,
        motDePasseTemporaire: data.motDePasseTemporaire
      };
    } catch (error) {
      console.error('Erreur création compte manuel:', error);
      return { 
        ok: false, 
        message: error instanceof Error ? error.message : 'Erreur lors de la création'
      };
    }
  });

/**
 * Suspendre ou activer un compte utilisateur
 */
export const toggleStatutCompte = createServerFn({ method: 'POST' })
  .validator(z.object({
    compteId: z.string(),
    nouveauStatut: z.enum(['Actif', 'Suspendu'])
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      await board.item(data.compteId).update({
        statutTexte: data.nouveauStatut
      }).execute();

      // Logger l'événement
      await logAuditEvent({
        data: {
          eventType: 'COMPTE_SUSPENDU',
          userIdentifier: data.compteId,
          success: true,
          details: { nouveauStatut: data.nouveauStatut }
        }
      }).catch(err => console.error('Audit log failed:', err));

      return { 
        ok: true, 
        message: `Compte ${data.nouveauStatut === 'Suspendu' ? 'suspendu' : 'activé'}`
      };
    } catch (error) {
      console.error('Erreur toggle statut:', error);
      return { 
        ok: false, 
        message: 'Erreur lors de la modification du statut'
      };
    }
  });
