import type { Request } from 'express';
import { insererUn } from '../db.js';

export interface IdentiteJournal {
  userId: string | null;
  nom: string;
  email: string;
}

/** Extrait l'identité du compte connecté depuis la session de la requête, pour le journal d'audit. */
export function identiteDeRequete(req: Request): IdentiteJournal {
  return { userId: req.session?.userId ?? null, nom: req.session?.nom ?? '', email: req.session?.email ?? '' };
}

/**
 * Enregistre une action dans le journal d'audit. Best-effort : une panne d'écriture du journal
 * n'interrompt jamais l'action métier elle-même (l'appelant l'a déjà exécutée quand ceci est appelé).
 */
export async function consigner(
  identite: IdentiteJournal,
  action: string,
  cible: string,
  details?: unknown
): Promise<void> {
  try {
    await insererUn('journal_actions', {
      utilisateurId: identite.userId,
      utilisateurNom: identite.nom,
      utilisateurEmail: identite.email,
      action,
      cible,
      details: details ?? null,
    });
  } catch (err) {
    console.error("[journal] Échec de l'écriture du journal :", err);
  }
}
