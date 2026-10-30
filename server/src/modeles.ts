/**
 * Forme des lignes renvoyées par `requete` (src/db.ts) pour chaque table : champs en camelCase, clé
 * primaire sous `_id`, comme du temps de MongoDB. Le schéma lui-même est dans server/migrations.
 */

export interface Evenement {
  _id: string;
  eventId: string | null;
  nom: string;
  // Jour précis représenté par cette ligne : un événement de plusieurs jours a une ligne par jour
  // occupé, toutes partageant le même nom/dateDeDebut/dateDeFin.
  dateClef: Date | null;
  dateDeDebut: Date | null;
  dateDeFin: Date | null;
  lieu: string;
  latitude: number | null;
  longitude: number | null;
  statutGeocodage: string;
  quartier: string;
  pilote: string;
  directionPilote: string;
  organisateur: string;
  nature: string;
  niveau: string;
  type: string;
  statut: string;
  tardive: string;
  reprog: string;
  validationTechnique: boolean;
  validationPolitique: boolean;
  validParDateClef: boolean;
  statutDimport: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Utilisateur {
  _id: string;
  nom: string;
  email: string;
  role: 'Administrateur' | 'Consultant';
  statut: string; // Actif | Suspendu | Mot de passe à définir
  hash: string;
  sel: string;
  derniereConnexion: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DemandeAcces {
  _id: string;
  nom: string;
  email: string;
  organisation: string;
  motif: string;
  statut: 'En attente' | 'Approuvée' | 'Rejetée';
  motifRejet: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sauvegarde {
  _id: string;
  type: string;
  nombreEvenements: number;
  nombreUtilisateurs: number;
  evenements: Record<string, unknown>[];
  utilisateurs: Record<string, unknown>[];
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalAction {
  _id: string;
  utilisateurId: string | null;
  utilisateurNom: string;
  utilisateurEmail: string;
  action: string;
  cible: string;
  details: unknown;
  createdAt: Date;
  updatedAt: Date;
}
