import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Dictionnaire statique des lieux connus de Dunkerque avec leurs coordonnées
 * Format: [latitude, longitude]
 */
export const LIEUX_CONNUS: Record<string, [number, number]> = {
  // Lieux culturels
  'Place Jean Bart': [51.0344, 2.3768],
  'Kursaal': [51.0387, 2.3726],
  'Halle aux Sucres': [51.0387, 2.3691],
  'Le Bateau Feu': [51.0344, 2.3768],
  'Musée Portuaire': [51.0387, 2.3691],
  'LAAC': [51.0387, 2.3691],
  'FRAC Grand Large': [51.0387, 2.3691],
  
  // Lieux sportifs
  'Stade Marcel Tribut': [51.0344, 2.3895],
  
  // Espaces publics
  'Plage de Malo-les-Bains': [51.0450, 2.3850],
  'Digue de Mer': [51.0450, 2.3850],
  'Môle 1': [51.0387, 2.3691],
  'Parc du Fort Louis': [51.0287, 2.3768],
  'Citadelle': [51.0387, 2.3691],
  
  // Lieux institutionnels
  'Palais de Justice': [51.0344, 2.3768],
  'Hôtel de Ville': [51.0344, 2.3768],
  'Gare de Dunkerque': [51.0287, 2.3768],
  
  // Quartiers / zones
  'Fort de Petite-Synthe': [51.0187, 2.3768],
  'Rosendaël': [51.0387, 2.4000],
  'Saint-Pol-sur-Mer': [51.0287, 2.3500],
  'Petite-Synthe': [51.0187, 2.3768],
  'Malo-les-Bains': [51.0450, 2.3850],
  'Mardyck': [51.0287, 2.3200],
  'Fort-Mardyck': [51.0287, 2.3200],
  
  // Variantes communes
  'place jean bart': [51.0344, 2.3768],
  'kursaal': [51.0387, 2.3726],
  'halle aux sucres': [51.0387, 2.3691],
  'bateau feu': [51.0344, 2.3768],
  'stade marcel tribut': [51.0344, 2.3895],
  'plage malo': [51.0450, 2.3850],
  'plage': [51.0450, 2.3850],
  'digue': [51.0450, 2.3850],
  'gare': [51.0287, 2.3768],
  'mairie': [51.0344, 2.3768],
  'hotel de ville': [51.0344, 2.3768],
};

/**
 * Recherche un lieu dans le dictionnaire statique (insensible à la casse, recherche partielle)
 */
function findInKnownLocations(lieu: string): [number, number] | null {
  const normalized = lieu.toLowerCase().trim();
  
  // Recherche exacte
  if (LIEUX_CONNUS[normalized]) {
    return LIEUX_CONNUS[normalized];
  }
  
  // Recherche partielle (le lieu contient un nom connu)
  for (const [key, coords] of Object.entries(LIEUX_CONNUS)) {
    if (normalized.includes(key.toLowerCase()) || key.toLowerCase().includes(normalized)) {
      return coords;
    }
  }
  
  return null;
}

/**
 * Géocode un lieu via l'API Base Adresse Nationale
 * Retourne null si le lieu ne peut pas être trouvé
 */
export const geocodeLieu = createServerFn({ method: 'POST' })
  .validator(z.object({
    lieu: z.string(),
  }))
  .handler(async ({ data }) => {
    const { lieu } = data;
    
    if (!lieu || lieu.trim() === '') {
      return null;
    }
    
    // 1. Chercher d'abord dans le dictionnaire statique
    const knownCoords = findInKnownLocations(lieu);
    if (knownCoords) {
      return {
        lat: knownCoords[0],
        lon: knownCoords[1],
        source: 'static' as const,
      };
    }
    
    // 2. Sinon, interroger l'API BAN
    try {
      const query = encodeURIComponent(`${lieu} Dunkerque`);
      const url = `https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`;
      
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`[geocodeLieu] API error: ${response.status}`);
        return null;
      }
      
      const json = await response.json();
      
      if (!json.features || json.features.length === 0) {
        console.warn(`[geocodeLieu] No results for: ${lieu}`);
        return null;
      }
      
      // L'API retourne [longitude, latitude] — on inverse pour [lat, lon]
      const [lon, lat] = json.features[0].geometry.coordinates;
      
      return {
        lat,
        lon,
        source: 'api' as const,
      };
    } catch (error) {
      console.error(`[geocodeLieu] Error geocoding "${lieu}":`, error);
      return null;
    }
  });

/**
 * Géocode plusieurs lieux en batch avec rate limiting
 */
export const geocodeLieuxBatch = createServerFn({ method: 'POST' })
  .validator(z.object({
    lieux: z.array(z.string()),
  }))
  .handler(async ({ data }) => {
    const { lieux } = data;
    const results: Record<string, { lat: number; lon: number } | null> = {};
    
    // Traiter par lots de 10 avec pause de 100ms entre chaque
    const uniqueLieux = Array.from(new Set(lieux.filter(Boolean)));
    
    for (let i = 0; i < uniqueLieux.length; i++) {
      const lieu = uniqueLieux[i];
      
      // Chercher dans le dictionnaire
      const knownCoords = findInKnownLocations(lieu);
      if (knownCoords) {
        results[lieu] = { lat: knownCoords[0], lon: knownCoords[1] };
        continue;
      }
      
      // Sinon interroger l'API
      try {
        const query = encodeURIComponent(`${lieu} Dunkerque`);
        const url = `https://api-adresse.data.gouv.fr/search/?q=${query}&limit=1`;
        
        const response = await fetch(url);
        if (response.ok) {
          const json = await response.json();
          if (json.features && json.features.length > 0) {
            const [lon, lat] = json.features[0].geometry.coordinates;
            results[lieu] = { lat, lon };
          } else {
            results[lieu] = null;
          }
        } else {
          results[lieu] = null;
        }
        
        // Pause de 100ms entre chaque requête pour respecter le rate limit
        if (i < uniqueLieux.length - 1 && i % 10 === 9) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`[geocodeLieuxBatch] Error for "${lieu}":`, error);
        results[lieu] = null;
      }
    }
    
    return results;
  });
