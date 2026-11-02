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
  /** Dernier prix d'achat unitaire TTC connu. */
  prixAchat: number | null;
  /** Taux de TVA en % (20, 10, 5,5, 2,1 ou 0) : les prix sont TTC, le HT s'en déduit. */
  tauxTva: number;
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
  projetId: string | null;
  projetTitre: string | null;
  /** PMP TTC figé à la remise, et total livré. */
  prixUnitaireLivre: number | null;
  valeurLivree: number | null;
  remiseLe: string | null;
  tauxTvaLivre: number | null;
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

/** Jalon du squelette de rétroplanning (portillon). */
export interface Jalon {
  code: string;
  libelle: string;
  offset: number;
  question: string;
  livrable: string;
}

export interface RoleProjet {
  code: string;
  libelle: string;
  mission: string;
  niveauMin: number;
}

export interface TacheType {
  code: string;
  libelle: string;
  module: string;
  jalon: string;
  offset: number;
  niveauMin: number;
  porte: string;
  fait: string;
  valide: string;
  informe: string[];
  livrable: string;
  bloquante: boolean;
  incompressibleJours: number | null;
}

/** Référentiel du rétroplanning : squelette, niveaux, critères, modules, tâches types. */
export interface ReferentielRetroplanning {
  jalons: Jalon[];
  roles: RoleProjet[];
  seuilsJauge: [number, number, number];
  niveaux: { niveau: number; libelle: string; exemples: string; jalons: { code: string; valideur: string }[] }[];
  criteres: { code: string; libelle: string; modules: string[]; majoration: boolean; niveauMax: boolean }[];
  modules: { code: string; libelle: string; activation: string; nonRetourJours: number | null }[];
  taches: TacheType[];
  budgetPostes: string[];
}

export interface ReferentielsProjets {
  referentiel: ReferentielRetroplanning;
  types: Record<TypeProjet, string>;
  budgetPostes: string[];
  pieces: { code: string; libelle: string }[];
  delaiInscriptionJours: number;
  stockageActif: boolean;
}

export type Meteo = 'vert' | 'orange' | 'rouge';

export interface NonRetourModule {
  module: string;
  libelle: string;
  delai: number;
  date: string;
  depassee: boolean;
  ouvertes?: number;
}

/** Ce que donnerait un projet, avant enregistrement. */
export interface SimulationProjet {
  niveau: number;
  base: number;
  majorations: string[];
  multiSites: boolean;
  niveauLibelle: string;
  restant: number;
  modules: { code: string; libelle: string }[];
  jalons: { code: string; libelle: string; date: string; passe: boolean }[];
  nonRetour: NonRetourModule[];
  infaisables: { code: string; libelle: string; module: string; incompressibleJours: number }[];
  nombreTaches: number;
}

export type ModeFormation = 'binome' | 'seul' | 'copilote';

export interface ProgressionPilote {
  utilisateurId: string;
  nom: string;
  autonome: boolean;
  autonomeLe: string | null;
  decidePar: string;
  notes: string;
  prochaine: string | null;
  etapes: {
    code: string;
    libelle: string;
    niveau: number;
    mode: ModeFormation;
    acquise: boolean;
    projets: { _id: string; titre: string; dateJour: string; niveau: number; statut: string; formateur: Personne | null; valide: boolean }[];
  }[];
  projets: { _id: string; titre: string; dateJour: string; niveau: number; statut: string; formationMode: ModeFormation | null; bilanFranchi: boolean }[];
}

export interface Personne {
  utilisateurId?: string | null;
  nom: string;
}

export interface JalonPilotage extends Jalon {
  valideur: string;
  date: string;
  valideurTenu: string;
  valideurNom: string | null;
  franchi: { code: string; decidePar: string; commentaire: string; createdAt: string } | null;
  total: number;
  faites: number;
  bloquantsOuverts: number;
  meteo: Meteo;
}

export interface PilotageProjet {
  niveau: number;
  base: number;
  majorations: string[];
  multiSites: boolean;
  niveauLibelle: string;
  modules: { code: string; libelle: string }[];
  jalons: JalonPilotage[];
  prochain: JalonPilotage | null;
  meteo: Meteo;
  bloquants: TacheProjet[];
  infaisables: number;
  nonRetour: NonRetourModule[];
  roles: (RoleProjet & { tenuPar: string; utile: boolean })[];
}

export interface IndicateursProjet {
  _id: string;
  titre: string;
  type: TypeProjet | null;
  niveau: number;
  criteres: string[];
  dateJour: string;
  dateFin: string | null;
  lieu: string;
  jauge: number | null;
  statut: StatutProjet;
  inscritLe: string;
  prochainJalon?: { code: string; libelle: string; date: string } | null;
  meteo?: Meteo;
  bloquants?: number;
  infaisables?: number;
  totalTaches: number;
  tachesFaites: number;
  tachesEnRetard: number;
  demarchesEnRetard: number;
}

export interface Projet {
  _id: string;
  titre: string;
  type: TypeProjet | null;
  niveau: number;
  criteres: string[];
  roles: Record<string, Personne>;
  formationMode: ModeFormation | null;
  formateur: Personne | null;
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
  code: string | null;
  decalage: number;
  libelle: string;
  module: string;
  jalon: string;
  porte: string;
  faitRole: string;
  valideRole: string;
  informe: string[];
  livrable: string;
  bloquante: boolean;
  incompressibleJours: number | null;
  fait: boolean;
  faitPar: string;
  relanceLe: string | null;
  // Calculés par le serveur.
  jalonActif: string;
  echeance: string;
  enRetard: boolean;
  infaisable: boolean;
  porteTenu: string;
  portePar: string | null;
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
  evenement: EvenementLie | null;
  demandesStock: DemandeStockLiee[] | null;
  projet: Projet;
  pilotage: PilotageProjet;
  formation: { autonome: boolean; prochaine: string | null; etapes: { code: string; libelle: string; acquise: boolean }[]; avis: string | null } | null;
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
  type: TypeProjet | null;
  criteres: string[];
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

// --- Liaisons entre modules ---

export interface ResumeEvenementCalendrier {
  _id: string;
  nom: string;
  dateDeDebut: string | null;
  dateDeFin: string | null;
  lieu: string;
  quartier?: string;
  pilote?: string;
  directionPilote?: string;
  organisateur?: string;
  nature?: string;
  statut: string;
  valide?: boolean;
  /** Une ligne au moins de la série est marquée « Date Clef ». */
  dateClef?: boolean;
  nombreJours?: number;
}

/** Événement du calendrier lié à un projet ; supprime : il n'existe plus dans le calendrier. */
export type EvenementLie = (ResumeEvenementCalendrier & { supprime: false }) | { supprime: true; nom: string | null };

export interface DemandeStockLiee {
  _id: string;
  numero: string;
  directionNom: string;
  quantite: number;
  statut: string;
  dateBesoin: string;
  valeur: number;
  reference: string;
  libelle: string;
}

export interface FicheEvenementUnique {
  evenement: ResumeEvenementCalendrier & { inscritLe: string };
  projets: IndicateursProjet[] | null;
  demandesStock: DemandeStockLiee[] | null;
}

export interface SyntheseAccueil {
  aTraiter: { module: string; libelle: string; nombre: number; chemin: string; alerte?: boolean }[];
  prochains: (ResumeEvenementCalendrier & { projet?: IndicateursProjet | null; goodies?: number })[];
}
