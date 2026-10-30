/**
 * Normalise un libellé de lieu pour la recherche et le cache
 * - Minuscules
 * - Accents supprimés
 * - Ponctuation retirée
 * - Espaces multiples réduits
 * - Articles de tête ignorés (le, la, les, l')
 */
export function normalizeLieu(lieu: string): string {
  if (!lieu) return '';
  
  let normalized = lieu
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^\w\s]/g, ' ') // Remplacer la ponctuation par des espaces
    .replace(/\s+/g, ' ') // Réduire les espaces multiples
    .trim();
  
  // Retirer les articles de tête
  const articles = ['le ', 'la ', 'les ', "l'"];
  for (const article of articles) {
    if (normalized.startsWith(article)) {
      normalized = normalized.slice(article.length);
      break;
    }
  }
  
  return normalized;
}

/**
 * Liste des 17 communes de la Communauté urbaine de Dunkerque
 * + communes associées et quartiers rattachés à Dunkerque
 */
export const COMMUNES_CUD = [
  // 17 communes principales de la CUD
  'Armbouts-Cappel',
  'Bourbourg',
  'Bray-Dunes',
  'Cappelle-la-Grande',
  'Coudekerque-Branche',
  'Craywick',
  'Dunkerque',
  'Ghyvelde',
  'Grand-Fort-Philippe',
  'Grande-Synthe',
  'Gravelines',
  'Leffrinckoucke',
  'Loon-Plage',
  'Saint-Georges-sur-l\'Aa',
  'Spycker',
  'Téteghem-Coudekerque-Village',
  'Zuydcoote',
  
  // Communes associées et quartiers rattachés à Dunkerque
  'Malo-les-Bains',
  'Rosendaël',
  'Petite-Synthe',
  'Saint-Pol-sur-Mer',
  'Fort-Mardyck',
  'Mardyck',
];

// Normaliser les communes pour la comparaison
const COMMUNES_CUD_NORMALIZED = COMMUNES_CUD.map(c => normalizeLieu(c));

/**
 * Boîte englobante du territoire de la CUD
 */
const BBOX = {
  latMin: 50.88,
  latMax: 51.12,
  lonMin: 2.00,
  lonMax: 2.65,
};

/**
 * Centre de référence (Dunkerque centre)
 */
const CENTER_DUNKERQUE = { lat: 51.0344, lon: 2.3768 };

/**
 * Mappage Quartier → Commune et Code postal
 */
export const QUARTIER_VERS_COMMUNE: Record<string, { commune: string; postcode: string }> = {
  'dunkerque centre': { commune: 'Dunkerque', postcode: '59140' },
  'malo les bains': { commune: 'Dunkerque', postcode: '59240' },
  'rosendael': { commune: 'Dunkerque', postcode: '59240' },
  'petite synthe': { commune: 'Dunkerque', postcode: '59640' },
  'saint pol sur mer': { commune: 'Dunkerque', postcode: '59430' },
  'fort mardyck': { commune: 'Dunkerque', postcode: '59430' },
  'mardyck': { commune: 'Dunkerque', postcode: '59279' },
  'dunkerque sud': { commune: 'Dunkerque', postcode: '59140' },
  'agglomeration': { commune: 'Dunkerque', postcode: '59140' },
  'station balneaire': { commune: 'Dunkerque', postcode: '59240' },
  'glacis': { commune: 'Dunkerque', postcode: '59140' },
};

/**
 * Dictionnaire statique enrichi des principaux équipements dunkerquois
 * Clés normalisées pour maximiser les correspondances
 */
export const LIEUX_CONNUS_NORMALISES: Record<string, [number, number]> = {
  // Lieux culturels
  'place jean bart': [51.0344, 2.3768],
  'kursaal': [51.0387, 2.3726],
  'kursaal grande salle': [51.0387, 2.3726],
  'halle aux sucres': [51.0387, 2.3691],
  'bateau feu': [51.0344, 2.3768],
  'le bateau feu': [51.0344, 2.3768],
  'musee portuaire': [51.0387, 2.3691],
  'laac': [51.0387, 2.3691],
  'frac grand large': [51.0387, 2.3691],
  'studio 43': [51.0344, 2.3768],
  'beffroi de saint eloi': [51.0344, 2.3768],
  'beffroi': [51.0344, 2.3768],
  'belfroi': [51.0344, 2.3768],
  
  // Lieux sportifs
  'stade marcel tribut': [51.0344, 2.3895],
  'complexe sportif': [51.0344, 2.3895],
  'palais du littoral': [51.0450, 2.3850],
  'palais des sports': [51.0344, 2.3895],
  
  // Espaces publics
  'plage de malo les bains': [51.0450, 2.3850],
  'plage malo': [51.0450, 2.3850],
  'plage': [51.0450, 2.3850],
  'plage de leffrinckoucke': [51.0620, 2.4510],
  'digue de mer': [51.0450, 2.3850],
  'digue des allies': [51.0450, 2.3850],
  'digue': [51.0450, 2.3850],
  'mole 1': [51.0387, 2.3691],
  'parc du fort louis': [51.0287, 2.3768],
  'parc galame': [51.0287, 2.3768],
  'puythouck': [51.0287, 2.3768],
  'citadelle': [51.0387, 2.3691],
  'fort des dunes': [51.0620, 2.4510],
  'parc ziegler': [51.0344, 2.3768],
  'parc coquelle': [51.0287, 2.3768],
  'place du centenaire': [51.0344, 2.3768],
  'place turenne': [51.0344, 2.3768],
  'fort de petite synthe': [51.0187, 2.3768],
  'memorial du souvenir': [51.0344, 2.3768],
  
  // Lieux institutionnels
  'palais de justice': [51.0344, 2.3768],
  'hotel de ville': [51.0344, 2.3768],
  'hotel de ville de dunkerque': [51.0344, 2.3768],
  'mairie': [51.0344, 2.3768],
  'gare de dunkerque': [51.0287, 2.3768],
  'gare': [51.0287, 2.3768],
  
  // Quartiers / zones (centres approximatifs)
  'petite synthe': [51.0187, 2.3768],
  'rosendael': [51.0387, 2.4000],
  'saint pol sur mer': [51.0287, 2.3500],
  'malo les bains': [51.0450, 2.3850],
  'malo': [51.0450, 2.3850],
  'mardyck': [51.0287, 2.3200],
  'fort mardyck': [51.0287, 2.3200],
  'dunkerque centre': [51.0344, 2.3768],
  'dunkerque sud': [51.0287, 2.3768],
  'glacis': [51.0344, 2.3900],
};

const CACHE_VERSION = 'geocache_v4';
const CACHE_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

export type CachedGeocodingResult = {
  lat: number;
  lon: number;
  precision: 'exacte' | 'commune' | 'quartier';
  timestamp: number;
} | {
  failed: true;
  timestamp: number;
};

/**
 * Cache en mémoire des centres de quartiers/communes géocodés
 */
const communeCentersCache = new Map<string, { lat: number; lon: number }>();

/**
 * Extrait une adresse potentielle d'un libellé de lieu
 * Retourne { adresse, commune, postcode? } ou null
 */
export function extraireAdresse(lieu: string): { adresse: string; commune?: string; postcode?: string } | null {
  if (!lieu) return null;
  
  // 1. Repérer un code postal français (59xxx)
  const codePostalMatch = lieu.match(/\b(59\d{3})\b/);
  if (codePostalMatch) {
    const postcode = codePostalMatch[1];
    // Extraire le contexte autour du code postal
    let segment = '';
    
    // Chercher entre parenthèses
    const parentheseMatch = lieu.match(/\(([^)]+59\d{3}[^)]*)\)/);
    if (parentheseMatch) {
      segment = parentheseMatch[1].trim();
    } else {
      // Prendre depuis le début de la phrase jusqu'après le code postal
      const indexCP = lieu.indexOf(postcode);
      const avant = lieu.slice(Math.max(0, indexCP - 100), indexCP);
      const apres = lieu.slice(indexCP, Math.min(lieu.length, indexCP + 50));
      segment = (avant + apres).trim();
    }
    
    // Extraire la commune (mot après le code postal)
    const communeMatch = segment.match(/59\d{3}\s+([A-Za-zÀ-ÿ-]+(?:\s+[A-Za-zÀ-ÿ-]+)*)/);
    const commune = communeMatch ? communeMatch[1].trim() : undefined;
    
    return { adresse: segment, commune, postcode };
  }
  
  // 2. Extraire le contenu entre parenthèses contenant un mot-clé de voie
  const motsVoie = ['rue', 'avenue', 'boulevard', 'place', 'quai', 'chemin', 'route', 'impasse', 'allée', 'allees', 'parvis', 'digue', 'esplanade', 'square', 'rond-point', 'rond point'];
  const parentheseMatch = lieu.match(/\(([^)]+)\)/);
  if (parentheseMatch) {
    const contenu = parentheseMatch[1].toLowerCase();
    if (motsVoie.some(mot => contenu.includes(mot))) {
      // Extraire la commune si elle suit un code postal ou est à la fin
      const communeMatch = contenu.match(/\b([A-Za-zÀ-ÿ-]+(?:\s+[A-Za-zÀ-ÿ-]+){0,2})$/);
      const commune = communeMatch ? communeMatch[1].trim() : undefined;
      return { adresse: parentheseMatch[1].trim(), commune };
    }
  }
  
  // 3. Repérer un motif "situé au <numéro> <voie> à <commune>" ou "au <numéro> <voie>"
  const patternSitue = /situé\s+(?:au|à)\s+(\d+[^,.]+(?:rue|avenue|boulevard|place|quai|chemin|route|impasse|allée|parvis)[^,.]+)/i;
  const matchSitue = lieu.match(patternSitue);
  if (matchSitue) {
    const adresse = matchSitue[1].trim();
    // Chercher "à <commune>"
    const communeMatch = adresse.match(/\bà\s+([A-Za-zÀ-ÿ-]+(?:\s+[A-Za-zÀ-ÿ-]+)*)/i);
    const commune = communeMatch ? communeMatch[1].trim() : undefined;
    return { adresse, commune };
  }
  
  const patternAu = /\bau\s+(\d+[^,.]+(?:rue|avenue|boulevard|place|quai|chemin|route|impasse|allée|parvis)[^,.]+)/i;
  const matchAu = lieu.match(patternAu);
  if (matchAu) {
    return { adresse: matchAu[1].trim() };
  }
  
  return null;
}

/**
 * Nettoie un libellé de lieu en retirant les parenthèses et mentions de type
 */
export function nettoyerLibelle(lieu: string): string {
  if (!lieu) return '';
  
  // Garder le contenu entre parenthèses s'il contient une adresse
  const motsVoie = ['rue', 'avenue', 'boulevard', 'place', 'quai', 'chemin', 'route', 'impasse', 'allée', 'allees', 'parvis', 'digue', 'esplanade', 'square'];
  const parentheseMatch = lieu.match(/\(([^)]+)\)/);
  if (parentheseMatch) {
    const contenu = parentheseMatch[1].toLowerCase();
    // Si c'est une adresse, l'utiliser directement
    if (motsVoie.some(mot => contenu.includes(mot)) || /\d+/.test(contenu)) {
      return parentheseMatch[1].trim();
    }
  }
  
  // Sinon, retirer les parenthèses et leur contenu
  let nettoye = lieu.replace(/\([^)]*\)/g, '').trim();
  
  // Retirer les mentions de type en fin de chaîne
  nettoye = nettoye.replace(/\s*[-–—]\s*(Musée|Quartier|Salle|Centre|Parc|Fort|Stade|Palais|Plage|Digue|Halle|Gymnase|Église|Chapelle|Mairie|Bibliothèque|Piscine|Terrain)$/i, '').trim();
  
  // Retirer les préfixes descriptifs
  nettoye = nettoye.replace(/^(Salle|Centre|Parc|Fort|Stade|Palais|Plage|Digue|Halle|Gymnase|Église|Chapelle|Mairie|Bibliothèque|Piscine|Terrain)\s+/i, '').trim();
  
  return nettoye;
}

/**
 * Déduit la commune et le code postal depuis la valeur du quartier
 */
export function deduireDepuisQuartier(quartier: string | null): { commune: string; postcode: string } | null {
  if (!quartier) return null;
  
  const normalized = normalizeLieu(quartier);
  
  // Chercher dans le mappage explicite
  if (QUARTIER_VERS_COMMUNE[normalized]) {
    return QUARTIER_VERS_COMMUNE[normalized];
  }
  
  // Sinon, vérifier si c'est une des 17 communes de la CUD
  const index = COMMUNES_CUD_NORMALIZED.indexOf(normalized);
  if (index !== -1) {
    return { commune: COMMUNES_CUD[index], postcode: '' };
  }
  
  return null;
}

/**
 * Récupère une entrée du cache localStorage
 */
export function getCachedLocation(lieuNormalized: string): { lat: number; lon: number; precision: 'exacte' | 'commune' | 'quartier' } | null | 'failed' {
  if (typeof window === 'undefined') return null;
  
  try {
    const cacheKey = `${CACHE_VERSION}:${lieuNormalized}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) return null;
    
    const parsed: CachedGeocodingResult = JSON.parse(cached);
    const age = Date.now() - parsed.timestamp;
    
    // Expirer après 30 jours
    if (age > CACHE_DURATION_MS) {
      localStorage.removeItem(cacheKey);
      return null;
    }
    
    if ('failed' in parsed) {
      return 'failed';
    }
    
    return { lat: parsed.lat, lon: parsed.lon, precision: parsed.precision };
  } catch {
    return null;
  }
}

/**
 * Met en cache un résultat de géocodage (succès ou échec)
 */
export function setCachedLocation(
  lieuNormalized: string,
  result: { lat: number; lon: number; precision: 'exacte' | 'commune' | 'quartier' } | null
): void {
  if (typeof window === 'undefined') return;
  
  try {
    const cacheKey = `${CACHE_VERSION}:${lieuNormalized}`;
    
    if (result === null) {
      // Cache négatif
      localStorage.setItem(cacheKey, JSON.stringify({
        failed: true,
        timestamp: Date.now(),
      }));
    } else {
      localStorage.setItem(cacheKey, JSON.stringify({
        lat: result.lat,
        lon: result.lon,
        precision: result.precision,
        timestamp: Date.now(),
      }));
    }
  } catch {
    // Quota dépassé, on ignore silencieusement
  }
}

/**
 * Purge les anciennes versions du cache
 */
export function purgeOldCache(): void {
  if (typeof window === 'undefined') return;
  
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.startsWith('geocache_') && !key.startsWith(CACHE_VERSION)) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore
  }
}

/**
 * Recherche un lieu dans le dictionnaire statique (avec recherche partielle)
 */
export function findInKnownLocations(lieuNormalized: string): [number, number] | null {
  // Recherche exacte
  if (LIEUX_CONNUS_NORMALISES[lieuNormalized]) {
    return LIEUX_CONNUS_NORMALISES[lieuNormalized];
  }
  
  // Recherche partielle (le lieu contient un nom connu ou vice-versa)
  for (const [key, coords] of Object.entries(LIEUX_CONNUS_NORMALISES)) {
    if (lieuNormalized.includes(key) || key.includes(lieuNormalized)) {
      return coords;
    }
  }
  
  return null;
}

/**
 * Détecte la commune mentionnée dans un libellé de lieu
 */
function detecterCommune(lieu: string): string | null {
  const normalized = normalizeLieu(lieu);
  
  for (let i = 0; i < COMMUNES_CUD.length; i++) {
    if (normalized.includes(COMMUNES_CUD_NORMALIZED[i])) {
      return COMMUNES_CUD[i];
    }
  }
  
  return null;
}

/**
 * Géocode une commune ou un quartier pour obtenir son centre (avec cache mémoire)
 */
export async function geocoderCentreQuartier(
  quartier: string,
  signal?: AbortSignal
): Promise<{ lat: number; lon: number } | null> {
  const normalized = normalizeLieu(quartier);
  
  // Vérifier le cache mémoire
  if (communeCentersCache.has(normalized)) {
    return communeCentersCache.get(normalized)!;
  }
  
  // Tenter de géocoder le quartier/commune
  const info = deduireDepuisQuartier(quartier);
  const query = info?.commune || quartier;
  
  try {
    const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(query + ' Dunkerque')}&type=municipality&limit=1`;
    
    const response = await fetch(url, { signal });
    
    if (!response.ok) return null;
    
    const json = await response.json();
    
    if (!json.features || json.features.length === 0) return null;
    
    const [lon, lat] = json.features[0].geometry.coordinates;
    const coords = { lat, lon };
    
    // Mettre en cache mémoire
    communeCentersCache.set(normalized, coords);
    
    return coords;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    console.error(`[geocoderCentreQuartier] Error for "${quartier}":`, error);
    return null;
  }
}

/**
 * Valide qu'un résultat de géocodage BAN est dans le territoire de la CUD
 */
function validerResultat(feature: any): boolean {
  // Vérifier que les coordonnées sont dans la boîte englobante (critère strict)
  const [lon, lat] = feature.geometry.coordinates;
  if (lat < BBOX.latMin || lat > BBOX.latMax || lon < BBOX.lonMin || lon > BBOX.lonMax) {
  return false;
  }
  
    // Vérifier le score minimum (abaissé à 0.3 pour plus de tolérance)
    if (feature.properties.score < 0.3) return false;
  
    // Vérifier que la commune est dans la CUD (si présente)
  const city = feature.properties.city;
  if (city) {
  const cityNormalized = normalizeLieu(city);
  // Si on a une commune, vérifier qu'elle est dans la CUD
  // Mais accepter même si pas dans la liste si les coords sont bonnes
    if (!COMMUNES_CUD_NORMALIZED.includes(cityNormalized)) {
  // Tolérer si le score est élevé (>0.6) et dans la bbox
  if (feature.properties.score < 0.6) {
  return false;
}
    }
  }
  
  return true;
}

// Rate limiting pour Nominatim (1 requête par seconde max)
let lastNominatimCall = 0;
const NOMINATIM_DELAY = 1000;

/**
 * Géocode un lieu via OpenStreetMap Nominatim (fallback)
 */
async function geocodeViaNominatim(
  lieu: string,
  quartier: string | null,
  signal?: AbortSignal
): Promise<{ lat: number; lon: number; precision: 'exacte' | 'commune' | 'quartier' } | null> {
  try {
    // Respecter le rate limit de Nominatim (1 req/sec)
    const now = Date.now();
    const timeSinceLastCall = now - lastNominatimCall;
    if (timeSinceLastCall < NOMINATIM_DELAY) {
      await new Promise(resolve => setTimeout(resolve, NOMINATIM_DELAY - timeSinceLastCall));
    }
    lastNominatimCall = Date.now();
    
    const info = deduireDepuisQuartier(quartier);
    const city = info?.commune || detecterCommune(lieu) || 'Dunkerque';
    
    // Construire la requête avec le lieu + ville + pays
    const query = `${lieu}, ${city}, France`;
    
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(query)}&` +
      `format=json&` +
      `limit=5&` +
      `bounded=1&` +
      `viewbox=${BBOX.lonMin},${BBOX.latMax},${BBOX.lonMax},${BBOX.latMin}&` +
      `addressdetails=1`;
    
    const response = await fetch(url, {
      signal,
      headers: {
        'User-Agent': 'Monday.com Events App (geocoding for event locations)'
      }
    });
    
    if (!response.ok) return null;
    
    const results = await response.json();
    
    if (!results || results.length === 0) return null;
    
    // Prendre le premier résultat qui est dans la bounding box
    for (const result of results) {
      const lat = parseFloat(result.lat);
      const lon = parseFloat(result.lon);
      
      if (lat >= BBOX.latMin && lat <= BBOX.latMax && 
          lon >= BBOX.lonMin && lon <= BBOX.lonMax) {
        
        // Déterminer la précision selon le type
        let precision: 'exacte' | 'commune' | 'quartier' = 'commune';
        if (result.type === 'house' || result.type === 'building' || 
            result.type === 'amenity' || result.type === 'leisure' ||
            result.type === 'tourism' || result.type === 'shop') {
          precision = 'exacte';
        } else if (result.type === 'suburb' || result.type === 'neighbourhood') {
          precision = 'quartier';
        }
        
        return { lat, lon, precision };
      }
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error('Nominatim geocoding error:', error);
    return null;
  }
}

/**
 * Géocode un lieu via l'API BAN avec validation stricte et support d'adresse extraite
 * + fallback vers Nominatim si BAN échoue
 */
export async function geocodeViaBAN(
  lieu: string,
  quartier: string | null,
  signal?: AbortSignal
): Promise<{ lat: number; lon: number; precision: 'exacte' | 'commune' | 'quartier' } | null> {
  try {
    // Étape 1 : Tenter d'extraire une adresse du libellé
    const adresseExtraite = extraireAdresse(lieu);
    if (adresseExtraite) {
      // Géocoder l'adresse extraite
      const info = deduireDepuisQuartier(quartier);
      const postcode = adresseExtraite.postcode || info?.postcode;
      const city = adresseExtraite.commune || info?.commune;
      
      let url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseExtraite.adresse)}&limit=5&lat=${CENTER_DUNKERQUE.lat}&lon=${CENTER_DUNKERQUE.lon}`;
      if (postcode) url += `&postcode=${postcode}`;
      if (city) url += `&city=${encodeURIComponent(city)}`;
      
      const response = await fetch(url, { signal });
      
      if (response.ok) {
        const json = await response.json();
        
        if (json.features && json.features.length > 0) {
          // Chercher le premier résultat valide
          for (const feature of json.features) {
            if (validerResultat(feature)) {
              const [lon, lat] = feature.geometry.coordinates;
              return { lat, lon, precision: 'exacte' };
            }
          }
        }
      }
      
      // Si échec avec postcode, retenter sans
      if (postcode) {
        let urlSansCP = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresseExtraite.adresse)}&limit=5&lat=${CENTER_DUNKERQUE.lat}&lon=${CENTER_DUNKERQUE.lon}`;
        if (city) urlSansCP += `&city=${encodeURIComponent(city)}`;
        
        const response2 = await fetch(urlSansCP, { signal });
        
        if (response2.ok) {
          const json2 = await response2.json();
          
          if (json2.features && json2.features.length > 0) {
            for (const feature of json2.features) {
              if (validerResultat(feature)) {
                const [lon, lat] = feature.geometry.coordinates;
                return { lat, lon, precision: 'exacte' };
              }
            }
          }
        }
      }
    }
    
    // Étape 2 : Nettoyer le libellé et tenter un géocodage classique via BAN
    const libelleNettoye = nettoyerLibelle(lieu);
    const info = deduireDepuisQuartier(quartier);
    const city = info?.commune || detecterCommune(libelleNettoye);
    
    let url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(libelleNettoye + ' Dunkerque')}&limit=5&lat=${CENTER_DUNKERQUE.lat}&lon=${CENTER_DUNKERQUE.lon}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    
    const response = await fetch(url, { signal });
    
    if (response.ok) {
      const json = await response.json();
      
      if (json.features && json.features.length > 0) {
        // Chercher le premier résultat valide
        for (const feature of json.features) {
          if (validerResultat(feature)) {
            const [lon, lat] = feature.geometry.coordinates;
            return { lat, lon, precision: 'exacte' };
          }
        }
      }
    }
    
    // Étape 3 : Fallback vers OpenStreetMap Nominatim si BAN n'a rien trouvé
    console.log(`[geocodeViaBAN] BAN failed for "${lieu}", trying Nominatim...`);
    const nominatimResult = await geocodeViaNominatim(lieu, quartier, signal);
    if (nominatimResult) {
      return nominatimResult;
    }
    
    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return null;
    }
    console.error(`[geocodeViaBAN] Error for "${lieu}":`, error);
    
    // Tenter Nominatim même en cas d'erreur BAN
    try {
      const nominatimResult = await geocodeViaNominatim(lieu, quartier, signal);
      if (nominatimResult) {
        return nominatimResult;
      }
    } catch (nomErr) {
      console.error(`[Nominatim] Also failed for "${lieu}":`, nomErr);
    }
    
    return null;
  }
}
