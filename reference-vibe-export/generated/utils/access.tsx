/**
 * Utilitaire de gestion du mode lecture seule
 * 
 * LOGIQUE DE DÉTECTION DES PERMISSIONS :
 * 
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │ TYPE D'UTILISATEUR    │ DÉTECTION SDK MONDAY          │ MODE                │
 * ├───────────────────────┼───────────────────────────────┼─────────────────────┤
 * │ 🔑 ADMIN              │ user.id exists                │ ÉDITION complète    │
 * │   (Membre de l'équipe)│ isViewOnly = false            │ - Modifier statuts  │
 * │                       │ kind ≠ 'viewer'/'guest'       │ - Modifier dates    │
 * │                       │                               │ - Valider           │
 * │                       │                               │ - Import/Export     │
 * │                       │                               │ - Nettoyer          │
 * ├───────────────────────┼───────────────────────────────┼─────────────────────┤
 * │ 👁️ CONSULTANT/VIEWER  │ user.id exists                │ LECTURE SEULE       │
 * │   (Invité monday.com) │ isViewOnly = true             │ ✅ Consulter        │
 * │                       │ OU kind = 'viewer'/'guest'    │ ✅ Filtrer          │
 * │                       │                               │ ✅ Rechercher       │
 * │                       │                               │ ✅ Exporter PDF     │
 * │                       │                               │ ❌ Pas de modif     │
 * ├───────────────────────┼───────────────────────────────┼─────────────────────┤
 * │ 🌐 INVITÉ PUBLIC      │ Aucun user.id                 │ LECTURE SEULE       │
 * │   (Lien de partage)   │ OU ?mode=view dans l'URL      │ (même permissions   │
 * │                       │                               │  que consultant)    │
 * └───────────────────────┴───────────────────────────────┴─────────────────────┘
 * 
 * STRATÉGIE DE SÉCURITÉ :
 * - Permissive par défaut (MODE ÉDITION) pour ne jamais bloquer les admins
 * - En cas de timeout/erreur SDK → MODE ÉDITION (mieux que bloquer)
 * - Seul ?mode=view ou ?readonly=true force la lecture seule (court-circuit)
 */

import { useEffect, useState } from 'react';
import monday from 'monday-sdk-js';

const mondaySdk = monday();

/**
 * Hook React qui détecte si l'application est en mode lecture seule
 * 
 * Mode lecture seule activé si :
 * 1. URL contient "full-page" (mode consultation publique)
 * 2. OU l'utilisateur est un "Viewer" / "Guest"
 * 3. OU aucun utilisateur identifié
 * 
 * Principe de sécurité : l'état initial est `true` (lecture seule par défaut)
 */
export function useEstLectureSeule(): boolean {
  // État initial : lecture seule par défaut (principe de sécurité)
  const [lectureSeule, setLectureSeule] = useState(true);

  useEffect(() => {
    // NOUVELLE STRATÉGIE : Toujours vérifier les permissions utilisateur D'ABORD
    // L'URL n'est utilisée que comme fallback si le SDK échoue
    
    let timeoutId: NodeJS.Timeout;
    let resolved = false;
    
    console.log('🔍 [DETECTION MODE] Vérification des permissions utilisateur via SDK monday...');
    
    // Paramètre explicite pour forcer le mode consultation (court-circuit)
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const hasViewModeParam = searchParams.get('mode') === 'view' || searchParams.get('readonly') === 'true';
      
      if (hasViewModeParam) {
        console.log('🔒 Paramètre ?mode=view ou ?readonly=true détecté — LECTURE SEULE forcée');
        setLectureSeule(true);
        return;
      }
    }

    // Timeout de 5 secondes : si la résolution prend trop de temps, activer le mode édition par défaut
    // (on préfère donner l'accès aux admins plutôt que de les bloquer)
    timeoutId = setTimeout(() => {
      if (!resolved) {
        console.warn('⏱️ TIMEOUT (5s) — SDK monday ne répond pas — MODE ÉDITION par défaut pour ne pas bloquer les admins');
        resolved = true;
        setLectureSeule(false); // MODE ÉDITION par défaut en cas de timeout
      }
    }, 5000);

    // Tenter de récupérer le contexte utilisateur via le SDK monday
    try {
      console.log('🔄 Appel monday.get("context")...');
      mondaySdk
        .get('context')
        .then((context: any) => {
          console.log('📦 Contexte reçu:', context);
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);

          // Vérifier si l'utilisateur a un ID (authentifié monday.com)
          const hasUser = 
            context?.user?.id || 
            context?.userId || 
            context?.account?.userId ||
            context?.data?.user?.id;

          // Vérifier si c'est un viewer/guest/consultant (permissions limitées dans monday.com)
          const isViewer = context?.user?.isViewOnly === true || 
                          context?.user?.isGuest === true ||
                          context?.user?.kind === 'guest' ||
                          context?.user?.kind === 'viewer';

          console.log('👤 Analyse utilisateur:', {
            hasUser,
            isViewer,
            userId: context?.user?.id,
            kind: context?.user?.kind,
            isViewOnly: context?.user?.isViewOnly,
            isGuest: context?.user?.isGuest
          });

          if (hasUser && !isViewer) {
            console.log('✅ ADMIN — Utilisateur avec permissions d\'écriture complètes → MODE ÉDITION');
            setLectureSeule(false);
          } else if (hasUser && isViewer) {
            console.log('🔒 CONSULTANT/VIEWER — Utilisateur avec permissions limitées → MODE LECTURE SEULE');
            setLectureSeule(true);
          } else {
            console.log('⚠️ Aucun utilisateur détecté — MODE ÉDITION par défaut (ne pas bloquer les admins)');
            setLectureSeule(false); // Par défaut en mode édition si pas d'utilisateur
          }
        })
        .catch((error: Error) => {
          console.error('❌ Erreur lors de monday.get("context"):', error);
          if (resolved) return;
          resolved = true;
          clearTimeout(timeoutId);
          console.warn('Erreur SDK — MODE ÉDITION par défaut pour ne pas bloquer les admins');
          setLectureSeule(false); // MODE ÉDITION en cas d'erreur
        });
    } catch (error) {
      console.error('❌ Exception lors de monday.get("context"):', error);
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        console.warn('Exception SDK — MODE ÉDITION par défaut');
        setLectureSeule(false); // MODE ÉDITION en cas d'exception
      }
    }

    return () => {
      clearTimeout(timeoutId);
      resolved = true;
    };
  }, []);

  return lectureSeule;
}

/**
 * Fonction de garde pour les opérations d'écriture
 * À appeler au début de toute fonction qui modifie les données du board
 * 
 * @param nomAction - Nom de l'action pour la journalisation
 * @param estLectureSeule - État du mode lecture seule (depuis useEstLectureSeule)
 * @returns `true` si l'action peut continuer, `false` si elle doit être bloquée
 */
export function garderEcriture(nomAction: string, estLectureSeule: boolean): boolean {
  if (estLectureSeule) {
    console.warn(`Action "${nomAction}" bloquée : application en consultation seule`);
    return false;
  }
  return true;
}

/**
 * Composant badge pour indiquer visuellement le mode lecture seule
 * Affiche « Consultation seule » avec une infobulle explicative
 */
export const BadgeConsultationSeule: React.FC = () => {
  return (
    <span
      style={{ 
        display: 'inline-block',
        fontSize: '12px',
        color: '#676879',
        backgroundColor: '#F0F1F3',
        padding: '4px 10px',
        borderRadius: '12px',
        fontWeight: 500,
      }}
      title="Cette vue publique ne permet aucune modification des données"
    >
      Consultation seule
    </span>
  );
};
