/**
 * Modules de l'application et niveaux de droits. Un compte a, pour chaque module, un niveau parmi
 * NIVEAUX (ou aucun accès) ; chaque niveau inclut les précédents. Un super-administrateur a tous les
 * droits sur tous les modules, ainsi que l'administration générale (comptes, sauvegardes, RGPD…).
 */

export const NIVEAUX = ['lecture', 'contribution', 'validation', 'administration'] as const;
export type Niveau = (typeof NIVEAUX)[number];

export interface DefinitionModule {
  code: string;
  libelle: string;
  description: string;
  /** Faux tant que le module n'est pas livré : il apparaît « bientôt disponible » dans l'interface. */
  disponible: boolean;
  /** Ce que permet chaque niveau dans ce module, affiché dans l'écran des droits. */
  niveaux: Record<Niveau, string>;
}

export const MODULES = [
  {
    code: 'calendrier',
    libelle: 'Calendrier',
    description: 'Calendrier des événements du territoire : liste, carte, conflits, fiches de renseignement.',
    disponible: true,
    niveaux: {
      lecture: 'Consulter le calendrier, la liste, la carte et les conflits ; exporter en CSV.',
      contribution: 'Déposer une fiche de renseignement.',
      validation: 'Valider les événements, changer leur statut et leurs dates.',
      administration: 'Supprimer des événements, importer un CSV, fusionner les doublons, géocoder.',
    },
  },
  {
    code: 'stock',
    libelle: 'Stock & Protocole',
    description: 'Goodies, cadeaux protocolaires, demandes des directions, registre protocolaire et stocks déportés.',
    disponible: true,
    niveaux: {
      lecture: 'Consulter le catalogue des goodies et le tableau de bord.',
      contribution: 'Demander des goodies pour sa direction ; déclarer les sorties et retours de son stock déporté.',
      validation:
        'Voir les cadeaux protocolaires et le registre ; valider les demandes, ajustements et anomalies ; remettre les demandes.',
      administration: 'Gérer le catalogue, les réceptions, les ajustements, les stocks déportés et les paramètres.',
    },
  },
  {
    code: 'projets',
    libelle: 'Projets événementiels',
    description: 'Rétroplanning, tâches, prestataires, plan d’implantation, sécurité et budget.',
    disponible: false,
    niveaux: {
      lecture: 'Consulter les projets.',
      contribution: 'Mettre à jour les tâches et la logistique.',
      validation: 'Valider les jalons, le budget et les dossiers de sécurité.',
      administration: 'Créer et clôturer des projets, gérer les prestataires.',
    },
  },
] as const satisfies readonly DefinitionModule[];

export type CodeModule = (typeof MODULES)[number]['code'];
export type Droits = Partial<Record<CodeModule, Niveau>>;

export const CODES_MODULES = MODULES.map((m) => m.code) as CodeModule[];

export function estNiveau(valeur: unknown): valeur is Niveau {
  return typeof valeur === 'string' && (NIVEAUX as readonly string[]).includes(valeur);
}

export function estModule(valeur: unknown): valeur is CodeModule {
  return typeof valeur === 'string' && (CODES_MODULES as string[]).includes(valeur);
}

/** Le niveau détenu couvre-t-il le niveau requis ? */
export function niveauSuffit(detenu: Niveau | undefined, requis: Niveau): boolean {
  return detenu !== undefined && NIVEAUX.indexOf(detenu) >= NIVEAUX.indexOf(requis);
}

/** Ne garde que les couples module/niveau valides (sert à nettoyer une saisie ou une sauvegarde). */
export function nettoyerDroits(brut: unknown): Droits {
  const droits: Droits = {};
  if (brut && typeof brut === 'object') {
    for (const [module, niveau] of Object.entries(brut)) {
      if (estModule(module) && estNiveau(niveau)) droits[module] = niveau;
    }
  }
  return droits;
}

/** Format texte des droits dans le CSV des comptes : « calendrier:lecture;stock:validation ». */
export function droitsEnTexte(droits: Droits): string {
  return Object.entries(droits)
    .map(([module, niveau]) => `${module}:${niveau}`)
    .join(';');
}

export function droitsDepuisTexte(texte: string): Droits {
  return nettoyerDroits(
    Object.fromEntries(
      texte
        .split(/[;,]/)
        .map((morceau) => morceau.split(':').map((s) => s.trim().toLowerCase()))
        .filter((paire) => paire.length === 2)
    )
  );
}

/**
 * Profil d'un compte décrit avec l'ancien rôle de Dk_Calendar (CSV ou sauvegarde antérieurs à
 * l'application unifiée) : Administrateur → super-administrateur, Consultant → contribution au
 * calendrier.
 */
export function profilDepuisRoleHerite(role: unknown): { superAdmin: boolean; droits: Droits } {
  return role === 'Administrateur'
    ? { superAdmin: true, droits: {} }
    : { superAdmin: false, droits: { calendrier: 'contribution' } };
}
