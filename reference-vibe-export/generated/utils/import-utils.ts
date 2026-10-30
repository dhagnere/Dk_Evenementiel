// Pure utility functions for import row processing — NO server dependencies

/**
 * Mapping étendu et intelligent des en-têtes de colonnes
 * Supporte de nombreuses variantes et fautes de frappe courantes
 * 
 * ⚠️ IMPORTANT : Toutes les clés doivent être en minuscules, sans accents, sans ponctuation
 * car elles seront comparées après normalisation
 */
const HEADER_MAP: Record<string, string> = {
  // Nom de l'événement
  'nom': 'nom',
  'name': 'nom',
  'nom de l evenement': 'nom',
  'nom evenement': 'nom',
  'evenement': 'nom',
  'titre': 'nom',
  'intitule': 'nom',
  'libelle': 'nom',
  
  // Date unique (sera dupliquée en début ET fin)
  'date': 'date',
  'dates': 'date',
  
  // Date de début
  'date de debut': 'dateDeDbut',
  'date debut': 'dateDeDbut',
  'date_debut': 'dateDeDbut',
  'datedebut': 'dateDeDbut',
  'debut': 'dateDeDbut',
  'start': 'dateDeDbut',
  'date start': 'dateDeDbut',
  'date de commencement': 'dateDeDbut',
  
  // Date de fin
  'date de fin': 'dateDeFin',
  'date fin': 'dateDeFin',
  'date_fin': 'dateDeFin',
  'datefin': 'dateDeFin',
  'fin': 'dateDeFin',
  'end': 'dateDeFin',
  'date end': 'dateDeFin',
  'date de cloture': 'dateDeFin',
  
  // Lieu
  'lieu': 'lieu',
  'lieux': 'lieu',
  'adresse': 'lieu',
  'localisation': 'lieu',
  'emplacement': 'lieu',
  'site': 'lieu',
  'endroit': 'lieu',
  'place': 'lieu',
  
  // Quartier
  'quartier': 'quartier',
  'quartiers': 'quartier',
  'secteur': 'quartier',
  'zone': 'quartier',
  'arrondissement': 'quartier',
  
  // Pilote
  'pilote': 'pilote',
  'pilotes': 'pilote',
  'responsable': 'pilote',
  'responsables': 'pilote',
  'referent': 'pilote',
  'referents': 'pilote',
  'contact': 'pilote',
  'contacts': 'pilote',
  
  // Direction pilote
  'direction pilote': 'directionPilote',
  'direction': 'directionPilote',
  'service pilote': 'directionPilote',
  'service': 'directionPilote',
  'direction_pilote': 'directionPilote',
  'directionpilote': 'directionPilote',
  'dir pilote': 'directionPilote',
  'dir': 'directionPilote',
  
  // Nature
  'nature': 'nature',
  'natures': 'nature',
  'type d evenement': 'nature',
  'type evenement': 'nature',
  'categorie': 'nature',
  'categories': 'nature',
  'theme': 'nature',
  'themes': 'nature',
  'thematique': 'nature',
  'thematiques': 'nature',
  
  // Niveau
  'niveau': 'niveau',
  'echelle': 'niveau',
  'portee': 'niveau',
  'perimetre': 'niveau',
  'scope': 'niveau',
  
  // Type
  'type': 'type',
  'typologie': 'type',
  'format': 'type',
  'recurrence': 'type',
  
  // Tardive
  'tardive': 'tardive',
  'demande tardive': 'tardive',
  'tardif': 'tardive',
  'tard': 'tardive',
  
  // Reprogrammation
  'reprog': 'reprog',
  'reprogrammation': 'reprog',
  'reprogramme': 'reprog',
  'reporte': 'reprog',
  'report': 'reprog',
  
  // Organisateur
  'organisateur': 'organisateur',
  'organisateurs': 'organisateur',
  'organisme': 'organisateur',
  'structure': 'organisateur',
  'porteur': 'organisateur',
  'demandeur': 'organisateur',
  'association': 'organisateur',
  'asso': 'organisateur',
  
  // Statut
  'statut': 'statut',
  'etat': 'statut',
  'status': 'statut',
  'avancement': 'statut',
  'validation': 'statut',
  
  // Validation technique (ignorées à l'import)
  'validation technique': 'validationTechnique',
  'validation_technique': 'validationTechnique',
  'validationtechnique': 'validationTechnique',
  'val technique': 'validationTechnique',
  'val tech': 'validationTechnique',
  'technique': 'validationTechnique',
  'valid tech': 'validationTechnique',
  'valide technique': 'validationTechnique',
  
  // Validation politique (ignorées à l'import)
  'validation politique': 'validationPolitique',
  'validation_politique': 'validationPolitique',
  'validationpolitique': 'validationPolitique',
  'val politique': 'validationPolitique',
  'val pol': 'validationPolitique',
  'politique': 'validationPolitique',
  'valid pol': 'validationPolitique',
  'valide politique': 'validationPolitique',
};

/**
 * Normalise un en-tête de colonne pour la comparaison
 * - Minuscules
 * - Suppression des accents
 * - Suppression de la ponctuation
 * - Trim
 */
function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^\w\s]/g, ' ') // Remplacer la ponctuation par des espaces
    .replace(/\s+/g, ' ') // Réduire les espaces multiples
    .trim();
}

/**
 * Parse une date en FORMAT EUROPÉEN (DD/MM/YYYY) UNIQUEMENT
 * ⚠️ CRITIQUE : Ne jamais utiliser new Date(s) qui interprète en format US !
 * 
 * Formats acceptés :
 * - DD/MM/YYYY (09/02/2027 = 9 février 2027)
 * - DD-MM-YYYY
 * - DD.MM.YYYY
 * - YYYY-MM-DD (ISO)
 * - Serial Excel (44952 = date Excel)
 */
function parseDate(s: string): Date | null {
  if (!s) return null;
  
  // Nettoyer la chaîne (trim + espaces internes)
  const cleaned = s.trim().replace(/\s+/g, '');
  
  // 1. Format serial Excel (ex: 44952)
  if (/^\d{5}(\.\d+)?$/.test(cleaned)) {
    const serial = parseFloat(cleaned);
    const d = new Date((serial - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // 2. Format EUROPÉEN DD/MM/YYYY (PRIORITAIRE)
  //    Exemples : 09/02/2027, 9/2/2027, 09-02-2027, 09.02.2027
  const dmy = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    
    // Validation basique
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      console.warn(`⚠️ Date invalide: ${s} (jour=${day}, mois=${month})`);
      return null;
    }
    
    // new Date(year, monthIndex, day) où monthIndex = 0-11
    const date = new Date(year, month - 1, day);
    console.log(`📅 Date parsée (EU): ${s} → ${date.toISOString().split('T')[0]} (${day}/${month}/${year})`);
    return date;
  }
  
  // 3. Format ISO YYYY-MM-DD (ex: 2027-02-09)
  const ymd = cleaned.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = parseInt(ymd[3], 10);
    
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      console.warn(`⚠️ Date invalide: ${s} (jour=${day}, mois=${month})`);
      return null;
    }
    
    const date = new Date(year, month - 1, day);
    console.log(`📅 Date parsée (ISO): ${s} → ${date.toISOString().split('T')[0]}`);
    return date;
  }
  
  // ⚠️ AUCUN FALLBACK vers new Date(s) qui utilise le format US !
  console.warn(`❌ Format de date non reconnu: "${s}" - formats acceptés: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, serial Excel`);
  return null;
}

export function buildColumnMapping(headers: string[]): Record<number, string> {
  const mapping: Record<number, string> = {};
  console.log('\n════════════════════════════════════════════════════════');
  console.log('🔍 ANALYSE DÉTAILLÉE DES EN-TÊTES DU FICHIER');
  console.log('════════════════════════════════════════════════════════');
  console.log(`📄 Nombre total de colonnes : ${headers.length}\n`);
  
  headers.forEach((h, i) => {
    const normalized = normalizeHeader(h);
    if (HEADER_MAP[normalized]) {
      mapping[i] = HEADER_MAP[normalized];
      console.log(`  ✅ Colonne ${i}: "${h}"`);
      console.log(`     ↳ Normalisé: "${normalized}"`);
      console.log(`     ↳ Mappé vers: ${HEADER_MAP[normalized]}`);
    } else {
      console.log(`  ⚠️  Colonne ${i}: "${h}"`);
      console.log(`     ↳ Normalisé: "${normalized}"`);
      console.log(`     ↳ ❌ NON RECONNUE - SERA IGNORÉE`);
    }
  });
  
  console.log('\n────────────────────────────────────────────────────────');
  console.log(`📊 RÉSUMÉ : ${Object.keys(mapping).length}/${headers.length} colonnes reconnues`);
  console.log('────────────────────────────────────────────────────────');
  
  // Afficher le mapping final index → champ
  console.log('\n📋 MAPPING FINAL (index de colonne → champ board) :');
  Object.entries(mapping)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([idx, field]) => {
      console.log(`   ${idx} → ${field}`);
    });
  console.log('════════════════════════════════════════════════════════\n');
  
  return mapping;
}

/**
 * Analyse les en-têtes et retourne un rapport de mapping
 * Utile pour prévisualisation avant import
 */
export function analyzeHeaders(headers: string[]): {
  mapped: Array<{ original: string; mapped: string; columnIndex: number }>;
  unmapped: Array<{ original: string; columnIndex: number }>;
  missingRequired: string[];
} {
  const mapped: Array<{ original: string; mapped: string; columnIndex: number }> = [];
  const unmapped: Array<{ original: string; columnIndex: number }> = [];
  
  headers.forEach((h, i) => {
    const normalized = normalizeHeader(h);
    if (HEADER_MAP[normalized]) {
      mapped.push({ original: h, mapped: HEADER_MAP[normalized], columnIndex: i });
    } else {
      unmapped.push({ original: h, columnIndex: i });
    }
  });
  
  // Vérifier les colonnes obligatoires
  const requiredColumns = ['nom', 'dateDeDbut'];
  const mappedFields = new Set(mapped.map(m => m.mapped));
  const missingRequired = requiredColumns.filter(col => !mappedFields.has(col) && col !== 'date');
  
  // Si on a 'date' mais pas 'dateDeDbut', c'est OK
  if (mappedFields.has('date') && missingRequired.includes('dateDeDbut')) {
    const index = missingRequired.indexOf('dateDeDbut');
    missingRequired.splice(index, 1);
  }
  
  return { mapped, unmapped, missingRequired };
}

export function parseRowToRecord(row: string[], colMap: Record<number, string>): Record<string, unknown> {
  const rec: Record<string, unknown> = {};
  
  // Log détaillé pour les 3 premières lignes
  const shouldLog = Math.random() < 0.03; // ~3% des lignes pour ne pas saturer les logs
  
  if (shouldLog) {
    console.log('\n┌─────────────────────────────────────────────────────');
    console.log('│ 🔍 PARSING DÉTAILLÉ D\'UNE LIGNE');
    console.log('├─────────────────────────────────────────────────────');
    console.log(`│ Nombre de cellules dans la ligne : ${row.length}`);
    console.log('│');
  }
  
  for (const [idxStr, sdkProp] of Object.entries(colMap)) {
    const idx = parseInt(idxStr, 10);
    const val = (row[idx] ?? '').trim();
    
    if (shouldLog) {
      console.log(`│ Colonne ${idx} → ${sdkProp}`);
      console.log(`│   Valeur brute : "${val}"`);
    }
    
    if (!val) {
      if (shouldLog) console.log(`│   ⏭️  Ignorée (vide)`);
      continue;
    }
    
    if (sdkProp === 'dateDeDbut' || sdkProp === 'dateDeFin' || sdkProp === 'date') {
      const d = parseDate(val);
      if (d) {
        rec[sdkProp] = d.toISOString();
        if (shouldLog) console.log(`│   ✅ Date : ${d.toISOString().split('T')[0]}`);
      } else {
        if (shouldLog) console.log(`│   ❌ Date invalide`);
      }
    } else if (sdkProp === 'pilote') {
      rec[sdkProp] = val.split(',').map(p => p.trim()).filter(Boolean);
      if (shouldLog) console.log(`│   ✅ Pilote(s) : ${JSON.stringify(rec[sdkProp])}`);
    } else if (sdkProp === 'validationTechnique' || sdkProp === 'validationPolitique') {
      rec[sdkProp] = ['oui', 'yes', 'true', '1', 'x'].includes(val.toLowerCase());
      if (shouldLog) console.log(`│   ✅ Boolean : ${rec[sdkProp]}`);
    } else {
      rec[sdkProp] = val;
      if (shouldLog) console.log(`│   ✅ Texte : "${val}"`);
    }
  }
  
  if (shouldLog) {
    console.log('│');
    console.log('│ 📦 RÉSULTAT FINAL :');
    console.log(`│   nom: "${rec.nom ?? '(vide)'}"`);
    console.log(`│   lieu: "${rec.lieu ?? '(vide)'}"`);
    console.log(`│   quartier: "${rec.quartier ?? '(vide)'}"`);
    console.log(`│   nature: "${rec.nature ?? '(vide)'}"`);
    console.log(`│   directionPilote: "${rec.directionPilote ?? '(vide)'}"`);
    console.log(`│   organisateur: "${rec.organisateur ?? '(vide)'}"`);
    console.log('└─────────────────────────────────────────────────────\n');
  }
  
  return rec;
}

/**
 * Normalise une chaîne pour la comparaison de déduplication
 * - Trim, lowercase
 * - Suppression des accents
 * - Suppression des espaces multiples
 * - Suppression de la ponctuation non significative
 */
function normalizeForDedup(s: string | null | undefined): string {
  if (!s) return '';
  
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^\w\s]/g, ' ') // Remplacer la ponctuation par des espaces
    .replace(/\s+/g, ' ') // Réduire les espaces multiples à un seul
    .trim();
}

/**
 * Génère une clé unique pour identifier un événement
 * Basé sur : nom + date de début + lieu
 * 
 * ⚠️ STRATÉGIE DE DÉDUPLICATION INTELLIGENTE :
 * - Utilise nom + date de début + lieu (normalisé)
 * - Permet d'avoir plusieurs événements le même jour avec le même nom mais dans des lieux différents
 * - Si le lieu est vide (erreur de saisie), il est normalisé en chaîne vide
 * - Deux événements avec lieu vide = même événement (probable erreur de saisie)
 * - Deux événements avec lieux différents = événements distincts
 * 
 * Exemples :
 * - "Marché de Noël" le 15/12/2024 à "Centre-ville" → clé unique A
 * - "Marché de Noël" le 15/12/2024 à "Malo-les-Bains" → clé unique B (événement différent)
 * - "Marché de Noël" le 15/12/2024 avec lieu vide → clé unique C
 */
export function makeKey(
  nom: string | null | undefined, 
  dateDeDbut: string | Date | null | undefined,
  lieu?: string | null | undefined,
  _organisateur?: string | null | undefined,
  _dateDeFin?: string | Date | null | undefined
): string {
  // Normalisation stricte du nom
  const n = normalizeForDedup(nom);
  
  // Normalisation de la date de début (format YYYY-MM-DD)
  let dDebut = '';
  if (dateDeDbut) {
    try {
      const dt = typeof dateDeDbut === 'string' ? new Date(dateDeDbut) : dateDeDbut;
      if (dt && !isNaN(dt.getTime())) {
        dDebut = dt.toISOString().split('T')[0];
      }
    } catch (e) {
      console.warn(`⚠️ makeKey: Impossible de parser la date "${dateDeDbut}":`, e);
      dDebut = '';
    }
  }
  
  // Normalisation du lieu (chaîne vide si non fourni)
  const l = normalizeForDedup(lieu);
  
  // Clé complète : nom + date de début + lieu
  // Permet de distinguer des événements avec le même nom le même jour mais dans des lieux différents
  const key = `${n}|${dDebut}|${l}`;
  
  // Log pour debug (à commenter en production)
  // console.log(`🔑 makeKey: nom="${nom}" date="${dateDeDbut}" lieu="${lieu}" → "${key}"`);
  
  return key;
}

/**
 * Génère un fichier CSV modèle avec les colonnes attendues
 * ⚠️ IMPORTANT : L'ordre des colonnes correspond EXACTEMENT à l'extraction du board
 * Retourne le contenu CSV prêt à être téléchargé
 */
export function generateTemplateCSV(): string {
  // ORDRE EXACT de l'extraction du board (special_events_global.xlsx)
  const headers = [
    'Date',
    'Date de début',
    'Date de fin',
    'Nom',
    'Lieu',
    'Quartier',
    'Pilote',
    'Direction pilote',
    'Organisateur',
    'Statut',
    'Nature',
    'Niveau',
    'Type',
    'Tardive',
    'Reprog'
  ];
  
  const exampleRow = [
    '15/02/2024',           // Date
    '15/02/2024',           // Date de début
    '20/02/2024',           // Date de fin
    'Carnaval de Dunkerque', // Nom
    'Centre-ville',         // Lieu
    'Dunkerque - Centre',   // Quartier
    'Jean Dupont',          // Pilote
    'Direction Communication', // Direction pilote
    'Association Carnaval', // Organisateur
    'Validée',              // Statut
    'Culture',              // Nature
    'Ville',                // Niveau
    'Récurrente',           // Type
    'Non',                  // Tardive
    'Non'                   // Reprog
  ];
  
  return [
    headers.join(';'),
    exampleRow.join(';'),
    // Ligne vide pour que l'utilisateur puisse remplir
    Array(headers.length).fill('').join(';')
  ].join('\n');
}

/**
 * Génère un rapport lisible du mapping pour l'utilisateur
 */
export function formatMappingReport(analysis: ReturnType<typeof analyzeHeaders>): string {
  let report = '📋 Analyse du fichier :\n\n';
  
  if (analysis.mapped.length > 0) {
    report += '✅ Colonnes reconnues :\n';
    analysis.mapped.forEach(m => {
      report += `  • "${m.original}" → ${m.mapped}\n`;
    });
    report += '\n';
  }
  
  if (analysis.unmapped.length > 0) {
    report += '⚠️ Colonnes non reconnues (seront ignorées) :\n';
    analysis.unmapped.forEach(u => {
      report += `  • "${u.original}"\n`;
    });
    report += '\n';
  }
  
  if (analysis.missingRequired.length > 0) {
    report += '❌ Colonnes obligatoires manquantes :\n';
    analysis.missingRequired.forEach(col => {
      report += `  • ${col}\n`;
    });
    report += '\n';
  } else {
    report += '✅ Toutes les colonnes obligatoires sont présentes.\n\n';
  }
  
  return report;
}
