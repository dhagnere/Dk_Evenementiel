/**
 * Référence des colonnes du board extraction-kiosk
 * Valeurs valides pour chaque colonne de type status/dropdown
 * 
 * ⚠️ IMPORTANT : Ces valeurs doivent correspondre EXACTEMENT (respect de la casse et accents)
 * aux options définies dans le board monday.com
 */

export const VALID_QUARTIERS = [
  'Dunkerque - Centre',
  'Malo-les-Bains',
  'Fort-Mardyck',
  'Petite-Synthe',
  'Rosendaël',
  'Dunkerque - Sud',
  'Agglomération',
  'Station Balnéaire',
  'Glacis'
] as const;

export const VALID_PILOTES = [
  'Eva LELEU',
  'Sandrine CLAEYS',
  'Philippe MORTIER',
  'Carinne DEBRUYNE',
  'Cédric DELATER',
  'Dominique STEVENIN',
  'Gael BOLLENGIER',
  'Gonzague CLARYS',
  'Tony BERNAERT',
  'Lucie SWAL',
  'Rene SCHEPENS',
  'Nicolas DAMIE',
  'Fabienne LEMAHIEU',
  'Justine BARON',
  'YOHAN PICQUES',
  'Mathilde VANDERRUSTEN',
  'Hélène DENIS',
  'Nathalie DESMIDT',
  'Kevin LAFRANCE',
  'Lucie AGEZ',
  'Laila MESSAOUDI',
  'Valerie SANS',
  'Pierre-Baptiste MAINY',
  'Leila BOUAZZA',
  'Jessie TRICOT',
  'Céline MELLIEZ',
  'Melanie VANHELLE',
  'Hélène PYNTHE',
  'Julie WALLYN',
  'Isabelle DUPUIS',
  'VALENTINE BOURIEZ',
  'Aurélie CHIREZ'
] as const;

export const VALID_NATURES = [
  'Culture',
  'Animation de quartier',
  'Animation "Grand Public"',
  'Jeunesse',
  'Patriotique',
  'Protocole',
  'Sport',
  'Noces d\'Or - Etat Civil',
  'Brocantes',
  'Assemblée (Conseil Municipal, Conseil de Quartier ...)',
  'Environnement'
] as const;

export const VALID_NIVEAUX = [
  'Ville',
  'Associatif',
  'Ville / Asso.',
  'Ville / CUD',
  'CUD'
] as const;

export const VALID_TYPES = [
  'Exceptionnelle',
  'Récurrente',
  'Événement'
] as const;

export const VALID_TARDIVE = [
  'Oui',
  'Non'
] as const;

export const VALID_REPROG = [
  'Oui',
  'Non'
] as const;

export const VALID_STATUTS = [
  'Validée',
  'Annulée',
  'À valider',
  'Brouillon'
] as const;

/**
 * Mapping des variantes courantes vers les valeurs officielles du board
 * Permet de reconnaître "culture" → "Culture", "grand public" → "Animation "Grand Public"", etc.
 */
const NATURE_ALIASES: Record<string, string> = {
  'culture': 'Culture',
  'animation quartier': 'Animation de quartier',
  'animation de quartier': 'Animation de quartier',
  'quartier': 'Animation de quartier',
  'grand public': 'Animation "Grand Public"',
  'animation grand public': 'Animation "Grand Public"',
  'jeunesse': 'Jeunesse',
  'patriotique': 'Patriotique',
  'protocole': 'Protocole',
  'sport': 'Sport',
  'sportif': 'Sport',
  'noces or': 'Noces d\'Or - Etat Civil',
  'noces d or': 'Noces d\'Or - Etat Civil',
  'etat civil': 'Noces d\'Or - Etat Civil',
  'brocante': 'Brocantes',
  'brocantes': 'Brocantes',
  'assemblee': 'Assemblée (Conseil Municipal, Conseil de Quartier ...)',
  'conseil': 'Assemblée (Conseil Municipal, Conseil de Quartier ...)',
  'environnement': 'Environnement',
};

/**
 * Valide et normalise une valeur de colonne status
 * @param value La valeur brute du CSV
 * @param validOptions Les options valides pour cette colonne
 * @returns La valeur normalisée ou null si invalide
 */
export function validateStatusValue(
  value: string | null | undefined,
  validOptions: readonly string[]
): string | null {
  if (!value) return null;
  
  const normalized = value.trim();
  
  // Vérifier d'abord les alias (pour Nature uniquement si validOptions === VALID_NATURES)
  const isNatureColumn = validOptions === VALID_NATURES;
  if (isNatureColumn) {
    const lowerValue = normalized.toLowerCase();
    if (NATURE_ALIASES[lowerValue]) {
      console.log(`✅ Alias reconnu: "${value}" → "${NATURE_ALIASES[lowerValue]}"`);
      return NATURE_ALIASES[lowerValue];
    }
  }
  
  // Correspondance exacte (sensible à la casse)
  if (validOptions.includes(normalized as any)) {
    return normalized;
  }
  
  // Correspondance insensible à la casse
  const lowerValue = normalized.toLowerCase();
  const match = validOptions.find(opt => opt.toLowerCase() === lowerValue);
  if (match) return match;
  
  // Fuzzy matching : enlever les accents, espaces, apostrophes, guillemets
  const fuzzyValue = normalized
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Enlever les accents
    .replace(/['"\s-]/g, ''); // Enlever apostrophes, guillemets, espaces, tirets
    
  const fuzzyMatch = validOptions.find(opt => {
    const fuzzyOpt = opt
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/['"\s-]/g, '');
    return fuzzyOpt === fuzzyValue;
  });
  
  if (fuzzyMatch) {
    console.warn(`⚠️ Fuzzy match: "${value}" → "${fuzzyMatch}"`);
    return fuzzyMatch;
  }
  
  // Pas de correspondance - LOGGER l'erreur pour diagnostic
  console.error(`❌ VALIDATION ÉCHOUÉE pour "${value}"`);
  console.error(`   Options valides:`, validOptions);
  console.error(`   → La colonne sera OMISE - Monday utilisera sa valeur par défaut !`);
  console.error(`   → Vérifiez que l'orthographe, la casse et les accents sont corrects`);
  return null;
}

/**
 * Type guard pour vérifier les valeurs de colonnes
 */
export type Quartier = typeof VALID_QUARTIERS[number];
export type Pilote = typeof VALID_PILOTES[number];
export type Nature = typeof VALID_NATURES[number];
export type Niveau = typeof VALID_NIVEAUX[number];
export type Type = typeof VALID_TYPES[number];
export type Tardive = typeof VALID_TARDIVE[number];
export type Reprog = typeof VALID_REPROG[number];
export type Statut = typeof VALID_STATUTS[number];
