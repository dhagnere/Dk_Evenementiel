/**
 * Composant de sécurité pour la page de connexion
 * 
 * PROTECTION :
 * - Désactive la pastille Vibe/Monday
 * - Bloque tous les éléments cliquables sauf le formulaire de connexion
 * - Empêche l'accès à l'éditeur depuis la page publique
 */

import { useEffect } from 'react';

export function SecuritePageConnexion() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    console.log('🔒 [SECURITE PAGE CONNEXION] Protection activée — Pastille Vibe désactivée');

    // 1. Masquer et désactiver la pastille Vibe via CSS
    const style = document.createElement('style');
    style.id = 'connexion-security-styles';
    style.textContent = `
      /* Masquer la pastille Vibe/Monday */
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
      iframe[src*="edit"],
      [class*="vibe"],
      [class*="monday-pill"] {
        display: none !important;
        visibility: hidden !important;
        pointer-events: none !important;
        opacity: 0 !important;
        width: 0 !important;
        height: 0 !important;
        position: absolute !important;
        left: -9999px !important;
        z-index: -1 !important;
      }

      /* Empêcher l'ouverture de modals d'édition */
      [role="dialog"][data-vibe],
      [role="dialog"][aria-label*="edit"],
      [role="dialog"][aria-label*="Vibe"],
      [role="dialog"][aria-label*="monday"] {
        display: none !important;
      }
    `;
    document.head.appendChild(style);

    // 2. Bloquer tous les clics sur la pastille
    const blockVibeAccess = (e: Event) => {
      const target = e.target as HTMLElement;
      
      if (
        target.closest('.monday-app-pill') ||
        target.closest('.monday-app-feature-button') ||
        target.closest('.monday-vibe-pill') ||
        target.closest('[data-testid="app-feature-button"]') ||
        target.closest('[data-testid="edit-app-button"]') ||
        target.closest('[data-vibe-edit]') ||
        target.closest('[data-monday-pill]') ||
        target.className?.includes('vibe') ||
        target.className?.includes('monday')
      ) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.warn('🚫 [SECURITE PAGE CONNEXION] Tentative d\'accès bloquée');
        return false;
      }
    };

    // 3. Bloquer les raccourcis clavier d'édition
    const blockEditShortcuts = (e: KeyboardEvent) => {
      const isEditShortcut = 
        (e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E') ||
        (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K') ||
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C');

      if (isEditShortcut) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.warn('🚫 [SECURITE PAGE CONNEXION] Raccourci bloqué:', e.key);
        return false;
      }
    };

    // Capturer en phase de capture pour intercepter AVANT tout autre handler
    document.addEventListener('click', blockVibeAccess, true);
    document.addEventListener('mousedown', blockVibeAccess, true);
    document.addEventListener('mouseup', blockVibeAccess, true);
    document.addEventListener('touchstart', blockVibeAccess, true);
    document.addEventListener('keydown', blockEditShortcuts, true);

    // 4. Observer le DOM pour supprimer dynamiquement les éléments Vibe
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Supprimer les iframes Vibe
            if (
              node.tagName === 'IFRAME' && 
              (node.getAttribute('src')?.includes('vibe') || 
               node.getAttribute('src')?.includes('edit'))
            ) {
              node.remove();
              console.warn('🚫 [SECURITE PAGE CONNEXION] iframe supprimée');
            }

            // Supprimer les pastilles
            if (
              node.classList?.contains('monday-app-pill') ||
              node.classList?.contains('monday-vibe-pill') ||
              node.hasAttribute('data-vibe-edit') ||
              node.className?.includes('vibe') ||
              node.className?.includes('monday-pill')
            ) {
              node.remove();
              console.warn('🚫 [SECURITE PAGE CONNEXION] Pastille supprimée');
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // 5. Désactiver le clic droit
    const disableContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };
    document.addEventListener('contextmenu', disableContextMenu);

    // 6. Marquer le body
    document.body.setAttribute('data-connexion-page', 'true');
    document.body.classList.add('connexion-readonly');

    console.log('✅ [SECURITE PAGE CONNEXION] Protection complète activée');

    // Cleanup
    return () => {
      const styleEl = document.getElementById('connexion-security-styles');
      if (styleEl) styleEl.remove();
      
      document.removeEventListener('click', blockVibeAccess, true);
      document.removeEventListener('mousedown', blockVibeAccess, true);
      document.removeEventListener('mouseup', blockVibeAccess, true);
      document.removeEventListener('touchstart', blockVibeAccess, true);
      document.removeEventListener('keydown', blockEditShortcuts, true);
      document.removeEventListener('contextmenu', disableContextMenu);
      
      observer.disconnect();
      
      document.body.removeAttribute('data-connexion-page');
      document.body.classList.remove('connexion-readonly');
    };
  }, []);

  return null;
}
