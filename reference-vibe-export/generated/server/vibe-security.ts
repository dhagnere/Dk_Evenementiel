/**
 * Middleware de sécurité pour protéger les endpoints du framework Vibe
 * 
 * PROTECTION SERVEUR :
 * - Bloque les requêtes d'édition de code en mode consultation
 * - Empêche l'accès aux endpoints Vibe pour les consultants
 * - Log toutes les tentatives d'accès non autorisées
 */

import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Vérifie si l'utilisateur a les permissions d'accès au framework Vibe
 * 
 * En mode consultation (consultant/viewer), cette fonction bloque
 * toute tentative d'accès aux fonctionnalités d'édition du framework.
 */
export const verifierAccesVibe = createServerFn({ method: 'POST' })
  .validator(z.object({
    action: z.string(),
    estLectureSeule: z.boolean(),
  }))
  .handler(async ({ data }) => {
    console.log(`[SECURITE VIBE] Vérification d'accès pour action "${data.action}"`);

    if (data.estLectureSeule) {
      console.warn(`🚫 [SECURITE VIBE] Tentative d'accès bloquée : "${data.action}" en mode consultation`);
      throw new Error('Accès non autorisé : cette action nécessite des permissions d\'administrateur');
    }

    console.log(`✅ [SECURITE VIBE] Accès autorisé pour action "${data.action}"`);
    return { success: true };
  });

/**
 * Log les tentatives d'accès au framework Vibe
 * Permet de détecter les tentatives de contournement
 */
export const logTentativeAccesVibe = createServerFn({ method: 'POST' })
  .validator(z.object({
    action: z.string(),
    estLectureSeule: z.boolean(),
    timestamp: z.number(),
  }))
  .handler(async ({ data }) => {
    const date = new Date(data.timestamp).toISOString();
    
    if (data.estLectureSeule) {
      console.warn(`🚨 [ALERTE SECURITE] Tentative d'accès non autorisée au framework Vibe`);
      console.warn(`   Action : ${data.action}`);
      console.warn(`   Date   : ${date}`);
      console.warn(`   Mode   : Consultation (lecture seule)`);
      
      // En production, vous pourriez :
      // - Envoyer une notification par email
      // - Logger dans un système de monitoring
      // - Bloquer temporairement l'utilisateur
    }

    return { logged: true };
  });
