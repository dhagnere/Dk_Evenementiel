/**
 * Valeurs de référence pour les colonnes à choix de l'événement.
 * Repris de l'export monday Vibe d'origine (reference-vibe-export/utils/board-columns-reference.ts)
 * afin de garder la même terminologie métier.
 */

export const VALID_QUARTIERS = [
  'Dunkerque - Centre',
  'Malo-les-Bains',
  'Fort-Mardyck',
  'Petite-Synthe',
  'Rosendaël',
  'Saint-Pol-sur-Mer',
  'Dunkerque - Sud',
  'Agglomération',
  'Station Balnéaire',
  'Glacis',
] as const;

export const VALID_NATURES = [
  'Culture',
  'Animation de quartier',
  'Animation "Grand Public"',
  'Jeunesse',
  'Patriotique',
  'Protocole',
  'Sport',
  "Noces d'Or - Etat Civil",
  'Brocantes',
  'Assemblée (Conseil Municipal, Conseil de Quartier ...)',
  'Environnement',
] as const;

export const VALID_NIVEAUX = ['Ville', 'Associatif', 'Ville / Asso.', 'Ville / CUD', 'CUD'] as const;

export const VALID_TYPES = ['Exceptionnelle', 'Récurrente', 'Événement'] as const;

export const VALID_OUI_NON = ['Oui', 'Non'] as const;

export const VALID_STATUTS = ['Validée', 'Annulée', 'À valider', 'Brouillon'] as const;

export const VALID_ROLES = ['Administrateur', 'Consultant'] as const;

export const VALID_STATUTS_COMPTE = ['Actif', 'Suspendu', 'Mot de passe à définir'] as const;

export type Quartier = (typeof VALID_QUARTIERS)[number];
export type Nature = (typeof VALID_NATURES)[number];
export type Niveau = (typeof VALID_NIVEAUX)[number];
export type TypeEvenement = (typeof VALID_TYPES)[number];
export type Statut = (typeof VALID_STATUTS)[number];
export type Role = (typeof VALID_ROLES)[number];
export type StatutCompte = (typeof VALID_STATUTS_COMPTE)[number];
