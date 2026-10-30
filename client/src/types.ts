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

export const NIVEAUX = ['lecture', 'contribution', 'validation', 'administration'] as const;
export type Niveau = (typeof NIVEAUX)[number];
export type Droits = Partial<Record<string, Niveau>>;

/** Module de l'application, tel que décrit par le serveur (GET /auth/moi). */
export interface DefinitionModule {
  code: string;
  libelle: string;
  description: string;
  disponible: boolean;
  niveaux: Record<Niveau, string>;
}

/** Profil d'accès d'un compte : super-administrateur, direction de rattachement et droits par module. */
export interface ProfilAcces {
  superAdmin: boolean;
  directionId: string | null;
  droits: Droits;
}

export interface Compte extends ProfilAcces {
  _id: string;
  nom: string;
  email: string;
  direction: string | null;
  statut: string;
  derniereConnexion: string | null;
}

export interface Direction {
  _id: string;
  nom: string;
  actif: boolean;
  nombreComptes: number;
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

// --- Module Stock & Protocole ---

export type CategorieArticle = 'Goodies' | 'Protocole';

export interface ArticleStock {
  _id: string;
  reference: string;
  libelle: string;
  famille: string;
  categorie: CategorieArticle;
  emplacement: string;
  fournisseur: string;
  delaiJours: number;
  stockPhysique: number;
  stockReserve: number;
  seuil: number;
  pmp: number;
  aValoriser: boolean;
  actif: boolean;
}

export interface EtapeDemande {
  date: string;
  action: string;
  par: string;
  motif?: string;
}

export interface DemandeStock {
  _id: string;
  numero: string;
  directionId: string | null;
  directionNom: string;
  evenement: string;
  articleId: string;
  reference: string;
  libelle: string;
  categorie: CategorieArticle;
  quantite: number;
  dateBesoin: string;
  motifTardif: string;
  beneficiaire: string;
  occasion: string;
  elu: string;
  valeur: number;
  circuit: string;
  statut: string;
  motifRefus: string;
  demandeurId: string | null;
  demandeurNom: string;
  historique: EtapeDemande[];
  createdAt: string;
}

export interface MouvementStock {
  _id: string;
  numero: string;
  type: string;
  articleId: string;
  reference: string;
  libelle: string;
  quantite: number;
  valeur: number;
  detail: string;
  statut: string;
  auteurId: string | null;
  auteurNom: string;
  decideurNom: string;
  createdAt: string;
}

export interface ParametresStock {
  seuilValidationAutomatique: number;
  seuilValidationAjustement: number;
  delaiDemandeTardiveJours: number;
  relanceDeportJours: number;
  emplacements: string[];
  emplacementProtocole: string;
}

export interface DepotStock {
  _id: string;
  directionId: string;
  direction: string;
  referentId: string | null;
  referent: string | null;
  referentEmail: string | null;
  derniereDeclaration: string | null;
  derniereRelance: string | null;
  actif: boolean;
  nombreArticles: number;
  valeur: number;
  createdAt: string;
}

export interface LigneDepot {
  articleId: string;
  reference: string;
  libelle: string;
  quantite: number;
  pmp: number;
}

export const STATUTS_DEMANDE_EN_ATTENTE = ['En attente chef de service', 'En attente Protocole', 'En attente Cabinet'];

// --- Module Projets événementiels ---

export type TypeProjet = 'festif' | 'protocolaire' | 'quartier';
export type StatutProjet = 'preparation' | 'realise' | 'cloture' | 'annule';

export interface Jalon {
  c: string;
  o: number;
  l: string;
  s: string;
  reunion?: boolean;
}

export interface ReferentielsProjets {
  jalons: Jalon[];
  types: Record<TypeProjet, string>;
  branches: string[];
  budgetPostes: string[];
  pieces: { code: string; libelle: string }[];
  delaiInscriptionJours: number;
  stockageActif: boolean;
}

export interface IndicateursProjet {
  _id: string;
  titre: string;
  type: TypeProjet;
  dateJour: string;
  dateFin: string | null;
  lieu: string;
  jauge: number | null;
  statut: StatutProjet;
  inscritLe: string;
  totalTaches: number;
  tachesFaites: number;
  tachesEnRetard: number;
  demarchesEnRetard: number;
}

export interface Projet {
  _id: string;
  titre: string;
  type: TypeProjet;
  dateJour: string;
  dateFin: string | null;
  lieu: string;
  jauge: number | null;
  demandeur: string;
  referent: string;
  description: string;
  statut: StatutProjet;
  inscritLe: string;
  montage: string;
  ouverture: string;
  fermeture: string;
  demontage: string;
  implantation: string;
  bilan: { frequentation?: number | null; forts?: string; ameliorer?: string; incidents?: string };
}

export interface TacheProjet {
  _id: string;
  decalage: number;
  branche: string;
  libelle: string;
  fait: boolean;
  faitPar: string;
}

export interface DemarcheProjet {
  _id: string;
  decalage: number;
  libelle: string;
  statut: 'a_faire' | 'depose' | 'obtenu' | 'na';
  note: string;
}

export interface PrestataireProjet {
  _id: string;
  nom: string;
  prestation: string;
  contact: string;
  arrivee: string;
  depart: string;
  montant: number | null;
  lien: string;
  pieces: Record<string, boolean | undefined>;
}

export interface LigneBudget {
  _id: string;
  poste: string;
  prevu: number;
  realise: number;
}

export interface MaterielReserve {
  articleId: string;
  quantite: number;
  code: string | null;
  nom: string;
  unite: string;
  total: number;
}

export interface ConflitMateriel {
  projetId: string;
  titre: string;
  dateJour: string;
  articleId: string;
  nom: string;
  unite: string;
  total: number;
  demande: number;
  concurrents: string[];
}

export interface FicheProjetComplete {
  projet: Projet;
  taches: TacheProjet[];
  demarches: DemarcheProjet[];
  prestataires: PrestataireProjet[];
  budget: LigneBudget[];
  materiel: MaterielReserve[];
  conflits: ConflitMateriel[];
}

export interface ArticleMateriel {
  _id: string;
  code: string | null;
  nom: string;
  unite: string;
  total: number;
  actif: boolean;
  pic: number;
}

export interface DemandeEvenement {
  _id: string;
  intitule: string;
  demandeurNom: string;
  structure: string;
  contact: string;
  dateSouhaitee: string;
  lieu: string;
  type: TypeProjet;
  jauge: number | null;
  besoins: string[];
  description: string;
  statut: 'nouvelle' | 'instruction' | 'acceptee' | 'refusee';
  reponse: string;
  projetId: string | null;
  projetTitre?: string | null;
  avancement?: number | null;
  createdAt: string;
}
