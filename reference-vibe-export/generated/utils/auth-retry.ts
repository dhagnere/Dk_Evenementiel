/**
 * Utilitaires de résilience pour les appels serveur effectués juste après
 * le montage de l'application, avant que le jeton d'authentification
 * monday.com ("vibe-auth") ne soit disponible dans le contexte de requête.
 *
 * Symptômes typiques de ce problème de timing :
 * - "Failed to fetch"
 * - "Missing vibe-auth session token in request context"
 */

/**
 * Détecte si une erreur correspond à ce problème de timing d'authentification
 * (donc probablement transitoire) plutôt qu'à une vraie erreur applicative.
 */
export function isAuthTimingError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|vibe-auth|session token/i.test(message);
}

/**
 * Exécute `fn` avec plusieurs tentatives et un délai croissant si l'échec
 * ressemble à un problème de timing d'authentification. Les autres erreurs
 * sont propagées immédiatement (pas de retry inutile).
 */
export async function withAuthRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelay?: number; isActive?: () => boolean } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 4;
  const baseDelay = options.baseDelay ?? 800;
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.isActive && !options.isActive()) {
      throw lastError ?? new Error('Chargement annulé');
    }
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const dernierEssai = attempt === maxAttempts - 1;
      if (!isAuthTimingError(error) || dernierEssai) {
        throw error;
      }
      const delai = baseDelay * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, delai));
    }
  }

  throw lastError;
}
