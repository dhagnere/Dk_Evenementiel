/** Génère un mot de passe temporaire lisible, utilisé pour la création/réinitialisation de comptes. */
export function genererMotDePasse(): string {
  return Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8).toUpperCase() + '!2';
}
