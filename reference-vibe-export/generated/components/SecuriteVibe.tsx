/**
 * Composant de sécurité pour bloquer l'accès au framework Vibe en mode consultation
 * 
 * PROTECTION :
 * - Désactive la pastille Monday (accès à l'éditeur Vibe)
 * - Empêche les consultants d'accéder au code source
 * - Masque tous les contrôles d'édition du framework
 * - Bloque les raccourcis clavier d'édition
 * 
 * IMPORTANT : Ce composant doit être monté au plus haut niveau de l'application
 */

import { useEffect } from 'react';
import { logTentativeAccesVibe } from '@generated/server/vibe-security';

interface SecuriteVibeProps {
  lectureSeule: boolean;
}

/**
 * Hook qui désactive la pastille Monday et l'accès au framework Vibe
 * en mode consultation (consultant/viewer)
 */
export function SecuriteVibe({ lectureSeule }: SecuriteVibeProps) {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (lectureSeule) {
      console.log('🔒 [SECURITE VIBE] Mode consultation activé — Désactivation de la pastille Monday');

      // 1. Masquer la pastille Monday via CSS
      const style = document.createElement('style');
      style.id = 'vibe-security-styles';
      style.textContent = `
        /* Masquer la pastille Monday et tous les contrôles Vibe */
        .monday-app-pill,
        .monday-app-feature-button,
        .monday-app-edit-button,
        .monday-vibe-pill,
        .vibe-edit-button,
        [data-testid="app-feature-button"],
        [data-testid="edit-app-button"],
        [data-vibe-edit],
        [data-monday-pill],
        .vibe-edit-controls,
        .vibe-framework-access,
        iframe[src*="vibe"],
        iframe[src*="edit"] {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
          position: absolute !important;
          left: -9999px !important;
        }

        /* Désactiver le mode édition Vibe */
        body.vibe-edit-mode {
          pointer-events: auto !important;
        }

        /* Empêcher l'ouverture de panels d'édition */
        [role="dialog"][data-vibe],
        [role="dialog"][aria-label*="edit"],
        [role="dialog"][aria-label*="Vibe"] {
          display: none !important;
        }
      `;
      document.head.appendChild(style);

      // 2. Désactiver le mode édition via postMessage (si disponible)
      // Monday.com utilise postMessage pour la communication inter-iframe
      try {
        window.parent.postMessage({ type: 'closeAppFeatureModal' }, '*');
        window.parent.postMessage({ type: 'valueCreatedForUser' }, '*');
      } catch (e) {
        console.warn('[SECURITE VIBE] Impossible de désactiver le mode édition via postMessage:', e);
      }

      // 3. Bloquer les événements sur la pastille Monday et les raccourcis clavier
      const disableVibeAccess = (e: Event) => {
        const target = e.target as HTMLElement;
        
        // Bloquer les clics sur la pastille
        if (
          target.closest('.monday-app-pill') ||
          target.closest('.monday-app-feature-button') ||
          target.closest('.monday-vibe-pill') ||
          target.closest('[data-testid="app-feature-button"]') ||
          target.closest('[data-testid="edit-app-button"]') ||
          target.closest('[data-vibe-edit]') ||
          target.closest('[data-monday-pill]')
        ) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          console.warn('🚫 [SECURITE VIBE] Tentative d\'accès à l\'éditeur bloquée');
          
          // Logger la tentative côté serveur
          logTentativeAccesVibe({ 
            data: { 
              action: 'click_vibe_pill', 
              estLectureSeule: true,
              timestamp: Date.now()
            } 
          }).catch(() => {});
          
          return false;
        }
      };

      // Bloquer les raccourcis clavier d'édition (Ctrl+E, Cmd+E, etc.)
      const blockEditShortcuts = (e: KeyboardEvent) => {
        const isEditShortcut = 
          (e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E') || // Ctrl/Cmd + E
          (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') || // Ctrl/Cmd + K
          e.key === 'F12' || // DevTools
          ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C'); // Inspect

        if (isEditShortcut) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          
          console.warn('🚫 [SECURITE VIBE] Raccourci clavier d\'édition bloqué:', e.key);
          
          // Logger la tentative
          logTentativeAccesVibe({ 
            data: { 
              action: `keyboard_shortcut_${e.key}`, 
              estLectureSeule: true,
              timestamp: Date.now()
            } 
          }).catch(() => {});
          
          return false;
        }
      };

      // Capturer tous les événements (phase de capture pour intercepter avant les autres handlers)
      document.addEventListener('click', disableVibeAccess, true);
      document.addEventListener('mousedown', disableVibeAccess, true);
      document.addEventListener('mouseup', disableVibeAccess, true);
      document.addEventListener('touchstart', disableVibeAccess, true);
      document.addEventListener('keydown', blockEditShortcuts, true);

      // 4. Observer le DOM pour masquer dynamiquement les nouveaux éléments Vibe
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              // Masquer les iframes Vibe qui pourraient être ajoutées dynamiquement
              if (
                node.tagName === 'IFRAME' && 
                (node.getAttribute('src')?.includes('vibe') || 
                 node.getAttribute('src')?.includes('edit'))
              ) {
                node.style.display = 'none';
                node.style.visibility = 'hidden';
                node.remove();
                console.warn('🚫 [SECURITE VIBE] iframe d\'édition détectée et supprimée');
              }

              // Masquer les pills qui apparaissent dynamiquement
              if (
                node.classList.contains('monday-app-pill') ||
                node.classList.contains('monday-vibe-pill') ||
                node.hasAttribute('data-vibe-edit')
              ) {
                node.style.display = 'none';
                node.remove();
                console.warn('🚫 [SECURITE VIBE] Pastille d\'édition détectée et supprimée');
              }
            }
          });
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      // 5. Marquer le body pour indiquer le mode consultation
      document.body.setAttribute('data-vibe-readonly', 'true');
      document.body.classList.add('vibe-readonly-mode');

      // 6. Désactiver le clic droit (menu contextuel) sur toute l'app
      const disableContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        console.warn('🚫 [SECURITE VIBE] Menu contextuel désactivé en mode consultation');
        return false;
      };
      document.addEventListener('contextmenu', disableContextMenu);

      console.log('✅ [SECURITE VIBE] Protection activée — Pastille Monday et raccourcis désactivés');

      // Cleanup
      return () => {
        const styleEl = document.getElementById('vibe-security-styles');
        if (styleEl) styleEl.remove();
        
        document.removeEventListener('click', disableVibeAccess, true);
        document.removeEventListener('mousedown', disableVibeAccess, true);
        document.removeEventListener('mouseup', disableVibeAccess, true);
        document.removeEventListener('touchstart', disableVibeAccess, true);
        document.removeEventListener('keydown', blockEditShortcuts, true);
        document.removeEventListener('contextmenu', disableContextMenu);
        
        observer.disconnect();
        
        document.body.removeAttribute('data-vibe-readonly');
        document.body.classList.remove('vibe-readonly-mode');
      };
    } else {
      console.log('✅ [SECURITE VIBE] Mode administrateur — Accès complet au framework Vibe');
    }
  }, [lectureSeule]);

  return null; // Ce composant ne rend rien visuellement
}
