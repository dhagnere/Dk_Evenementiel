export interface Evenement {
  _id: string;
  eventId?: string;
  // Jour précis représenté par cette ligne ("Date Clef") : un événement de plusieurs jours a une
  // ligne par jour occupé, toutes partageant le même nom/dateDeDebut/dateDeFin.
  dateClef: string | null;
  nom: string;
  dateDeDebut: string | null;
  dateDeFin: string | null;
  lieu: string;
  latitude: number | null;
  longitude: number | null;
  statutGeocodage: 'attente' | 'ok' | 'echec';
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
  createdAt?: string;
}

export interface Compte {
  _id: string;
  nom: string;
  email: string;
  role: 'Administrateur' | 'Consultant';
  statut: string;
  derniereConnexion: string | null;
}

export function estValide(e: Pick<Evenement, 'validationTechnique' | 'validationPolitique'>): boolean {
  return e.validationTechnique && e.validationPolitique;
}

export function estBrouillon(e: Pick<Evenement, 'statut'>): boolean {
  return e.statut === 'Brouillon';
}

export interface Sauvegarde {
  _id: string;
  type:
    | 'quotidienne'
    | 'manuelle'
    | 'avant-import-evenements'
    | 'avant-import-utilisateurs'
    | 'avant-restauration'
    | 'avant-fusion-doublons';
  nombreEvenements: number;
  nombreUtilisateurs: number;
  createdAt: string;
}

export interface DemandeAcces {
  _id: string;
  nom: string;
  email: string;
  organisation: string;
  motif: string;
  statut: 'En attente' | 'Approuvée' | 'Rejetée';
  createdAt: string;
}
