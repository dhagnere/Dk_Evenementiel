/**
 * Géocodage d'adresses via Nominatim (OpenStreetMap), un service gratuit sans clé API.
 * Sa politique d'usage impose au maximum 1 requête par seconde et un User-Agent identifiant
 * l'application : https://operations.osmfoundation.org/policies/nominatim/
 */
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'CalendrierEvenementsDunkerque/1.0 (usage interne, non commercial)';
const DELAI_ENTRE_REQUETES_MS = 1100;

/**
 * Boîte englobante (avec marge) du territoire de la Communauté urbaine de Dunkerque, de Gravelines
 * à l'ouest jusqu'à la frontière belge (Bray-Dunes/Zuydcoote) à l'est. Sert à contraindre le
 * géocodage à cette zone, pour éviter qu'un simple nom de salle sans indication de ville (ex. « Salle
 * des fêtes ») ne soit géolocalisé sur une commune homonyme ailleurs en France (Paris, Marseille…).
 */
export const LIMITES_CUD = { latMin: 50.92, latMax: 51.12, lonMin: 2.05, lonMax: 2.6 };

export function estDansCUD(latitude: number, longitude: number): boolean {
  return (
    latitude >= LIMITES_CUD.latMin &&
    latitude <= LIMITES_CUD.latMax &&
    longitude >= LIMITES_CUD.lonMin &&
    longitude <= LIMITES_CUD.lonMax
  );
}

export interface Coordonnees {
  latitude: number;
  longitude: number;
}

function attendre(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Géocode une adresse, en restreignant strictement la recherche au territoire de la Communauté
 * urbaine de Dunkerque (`viewbox` + `bounded=1` — sans `bounded=1`, `viewbox` ne fait que
 * favoriser cette zone sans exclure le reste du monde, ce qui ne suffit pas à éviter les faux
 * positifs sur une adresse ambiguë). Renvoie `null` si aucun résultat n'a été trouvé DANS cette
 * zone — délibérément : mieux vaut un événement non localisé qu'un événement mal localisé à Paris
 * ou Marseille.
 */
export async function geocoderAdresse(adresse: string): Promise<Coordonnees | null> {
  const requete = adresse.trim();
  if (!requete) return null;

  const { lonMin, latMax, lonMax, latMin } = LIMITES_CUD;
  const params = new URLSearchParams({
    format: 'json',
    limit: '1',
    q: requete,
    viewbox: `${lonMin},${latMax},${lonMax},${latMin}`,
    bounded: '1',
  });
  const url = `${NOMINATIM_URL}?${params.toString()}`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });

  if (!res.ok) {
    throw new Error(`Nominatim a répondu ${res.status}`);
  }

  const resultats = (await res.json()) as Array<{ lat: string; lon: string }>;
  if (resultats.length === 0) return null;

  const { lat, lon } = resultats[0];
  const latitude = Number(lat);
  const longitude = Number(lon);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;

  return { latitude, longitude };
}

/**
 * Géocode une liste d'adresses en respectant la limite de Nominatim (1 req/s) : les appels sont
 * séquentiels avec un délai entre chacun, jamais en parallèle.
 */
export async function geocoderPlusieursAdresses(
  adresses: string[]
): Promise<Map<string, Coordonnees | null>> {
  const resultats = new Map<string, Coordonnees | null>();
  for (const adresse of adresses) {
    try {
      resultats.set(adresse, await geocoderAdresse(adresse));
    } catch (err) {
      console.error(`[geocodage] Échec pour "${adresse}" :`, err);
      resultats.set(adresse, null);
    }
    await attendre(DELAI_ENTRE_REQUETES_MS);
  }
  return resultats;
}
