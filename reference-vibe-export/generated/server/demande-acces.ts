import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';
import { envoyerEmailDemandeAdmin } from './monday-email';

/**
 * Stockage en mémoire des tokens d'approbation
 */
const tokensApprobation = new Map<string, { demandeId: string; expireLe: number }>();

/**
 * Génère un token sécurisé pour l'approbation
 */
function genererTokenApprobation(): string {
  const buffer = new Uint8Array(32);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Récupérer l'email de l'administrateur principal
 */
async function getAdminEmail(): Promise<string | null> {
  try {
    const board = new ComptesUtilisateursCalendrierEvenementsBoard();
    const result = await board.items()
      .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte'])
      .execute();

    const admin = (result.items || []).find(
      item => !item.name?.includes('TEST') &&
              !item.name?.startsWith('[DEMANDE]') &&
              item.rleTexte === 'Administrateur' &&
              item.statutTexte === 'Actif'
    );

    return admin?.identifiantTexte || null;
  } catch (error) {
    console.error('Erreur récupération email admin:', error);
    return null;
  }
}

// Exporter les tokens pour que approbation-auto.ts puisse y accéder
export { tokensApprobation };

/**
 * Crée une demande d'accès dans le board des comptes utilisateurs
 * Les demandes sont identifiées par le préfixe "[DEMANDE]" dans le nom
 */
export const creerDemandeAcces = createServerFn({ method: 'POST' })
  .validator(z.object({
    nomPrenom: z.string(),
    email: z.string(),
    organisation: z.string(),
    profil: z.enum(['Consultant', 'Administrateur']),
    motif: z.string(),
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const dateAujourdhui = new Date().toISOString().split('T')[0];
      
      // Créer une entrée avec le préfixe [DEMANDE] pour la distinguer des vrais comptes
      // Utiliser les colonnes texte pour stocker les informations
      const item = await board.item().create({
        name: `[DEMANDE] ${data.nomPrenom}`,
        identifiantTexte: data.email.toLowerCase(),
        rleTexte: data.profil,
        statutTexte: 'En attente', // Statut de la demande
        empreinteMotDePasse: data.motif, // Réutiliser pour stocker le motif
        sel: data.organisation, // Réutiliser pour stocker l'organisation
        dernireConnexionTexte: dateAujourdhui // Date de la demande
      }).execute();
      
      // Log dans la console serveur pour notification
      console.log('=== NOUVELLE DEMANDE D\'ACCÈS ===');
      console.log(`Nom: ${data.nomPrenom}`);
      console.log(`Email: ${data.email}`);
      console.log(`Organisation: ${data.organisation}`);
      console.log(`Profil demandé: ${data.profil}`);
      console.log(`Motif: ${data.motif}`);
      console.log(`Date: ${dateAujourdhui}`);
      console.log(`Item ID: ${item.id}`);
      console.log('================================');
      
      // Générer le token d'approbation
      const token = genererTokenApprobation();
      const expireLe = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 jours
      tokensApprobation.set(token, { demandeId: item.id, expireLe });

      // Construire le lien d'approbation (chemin relatif)
      const lienApprobation = `/approve/${token}`;

      // Récupérer l'email de l'admin et envoyer la notification
      const adminEmail = await getAdminEmail();
      
      if (adminEmail) {
        // Envoyer l'email à l'admin
        await envoyerEmailDemandeAdmin({
          data: {
            adminEmail,
            nomDemandeur: data.nomPrenom,
            emailDemandeur: data.email,
            profil: data.profil,
            organisation: data.organisation,
            motif: data.motif,
            demandeId: item.id,
            lienApprobation
          }
        }).catch(err => console.error('Erreur envoi email admin:', err));

        console.log(`📧 Email préparé pour l'admin: ${adminEmail}`);
        console.log(`🔗 Lien d'approbation: ${lienApprobation}`);
      } else {
        console.warn('⚠️ Aucun admin trouvé pour recevoir la notification');
      }
      
      return { 
        success: true, 
        itemId: item.id,
        debugInfo: {
          lienApprobation,
          adminEmail: adminEmail || 'Non trouvé'
        }
      };
    } catch (error) {
      console.error('Erreur lors de la création de la demande d\'accès:', error);
      throw new Error(error instanceof Error ? error.message : 'Erreur lors de la création de la demande');
    }
  });

/**
 * Récupère toutes les demandes d'accès en attente
 * (éléments avec [DEMANDE] dans le nom)
 */
export const getDemandesAcces = createServerFn({ method: 'GET' })
  .validator(z.object({
    statut: z.enum(['En attente', 'Approuvée', 'Rejetée']).optional()
  }).optional())
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      const result = await board.items()
        .withColumns(['identifiantTexte', 'rleTexte', 'statutTexte', 'empreinteMotDePasse', 'sel', 'dernireConnexionTexte'])
        .execute();
      
      // Filtrer uniquement les demandes (items avec [DEMANDE] dans le nom)
      let demandes = (result.items || [])
        .filter(item => item.name?.includes('[DEMANDE]'))
        .map(item => ({
          id: item.id,
          nomPrenom: item.name?.replace('[DEMANDE] ', '') || '',
          email: item.identifiantTexte || '',
          organisation: item.sel || '', // Organisation stockée dans 'sel'
          profil: item.rleTexte as 'Consultant' | 'Administrateur',
          motif: item.empreinteMotDePasse || '', // Motif stocké dans 'empreinteMotDePasse'
          statut: item.statutTexte as 'En attente' | 'Approuvée' | 'Rejetée',
          dateCreation: item.dernireConnexionTexte || ''
        }));
      
      // Filtrer par statut si demandé
      if (data?.statut) {
        demandes = demandes.filter(d => d.statut === data.statut);
      }
      
      return {
        demandes: demandes.sort((a, b) => 
          new Date(b.dateCreation).getTime() - new Date(a.dateCreation).getTime()
        )
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des demandes:', error);
      return { demandes: [] };
    }
  });

/**
 * Approuve une demande d'accès et crée le compte utilisateur
 */
export const approuverDemandeAcces = createServerFn({ method: 'POST' })
  .validator(z.object({
    demandeId: z.string(),
    motDePasseTemporaire: z.string().min(10)
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      // Récupérer la demande
      const demande = await board.item(data.demandeId)
        .withColumns(['identifiantTexte', 'rleTexte', 'sel'])
        .execute();
      
      if (!demande || !demande.name?.includes('[DEMANDE]')) {
        throw new Error('Demande introuvable');
      }
      
      // Marquer la demande comme approuvée
      await board.item(data.demandeId).update({
        statutTexte: 'Approuvée'
      }).execute();
      
      // Note: La création du compte utilisateur réel devrait être faite
      // via la fonction creerCompte de auth.ts avec le mot de passe temporaire
      
      console.log(`Demande ${data.demandeId} approuvée pour ${demande.identifiantTexte}`);
      
      return { success: true };
    } catch (error) {
      console.error('Erreur lors de l\'approbation:', error);
      throw new Error(error instanceof Error ? error.message : 'Erreur lors de l\'approbation');
    }
  });

/**
 * Rejette une demande d'accès
 */
export const rejeterDemandeAcces = createServerFn({ method: 'POST' })
  .validator(z.object({
    demandeId: z.string(),
    motif: z.string().optional()
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      
      await board.item(data.demandeId).update({
        statutTexte: 'Rejetée'
      }).execute();
      
      console.log(`Demande ${data.demandeId} rejetée. Motif: ${data.motif || 'Non spécifié'}`);
      
      return { success: true };
    } catch (error) {
      console.error('Erreur lors du rejet:', error);
      throw new Error(error instanceof Error ? error.message : 'Erreur lors du rejet');
    }
  });
