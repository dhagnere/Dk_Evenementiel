import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';

/**
 * Nominatim (le service de géocodage) impose 1 requête par seconde ; on estime donc le temps restant
 * à partir du nombre d'adresses distinctes encore à traiter, à raison d'environ une seconde chacune
 * (voir server/src/lib/geocodage.ts, DELAI_ENTRE_REQUETES_MS).
 */
const SECONDES_PAR_ADRESSE = 1.2;

interface GeocodageContextValue {
  enCours: boolean;
  secondesRestantesEstimees: number | null;
  /** Incrémenté à chaque lot traité (et à la fin) : sert de signal pour recharger les événements. */
  derniereMiseAJour: number;
  demarrer: () => void;
}

const GeocodageContext = createContext<GeocodageContextValue | null>(null);

export function GeocodageProvider({ children }: { children: ReactNode }) {
  const [enCours, setEnCours] = useState(false);
  const [secondesRestantesEstimees, setSecondesRestantesEstimees] = useState<number | null>(null);
  const [derniereMiseAJour, setDerniereMiseAJour] = useState(0);
  const enCoursRef = useRef(false);

  const demarrer = () => {
    if (enCoursRef.current) return;
    enCoursRef.current = true;
    setEnCours(true);
    (async () => {
      try {
        let restants = 1;
        while (restants > 0) {
          const res = await api.post<{
            ok: boolean;
            geocodes: number;
            echecs: number;
            restants: number;
            adressesRestantes: number;
          }>('/evenements/geocoder', {});
          restants = res.restants;
          setSecondesRestantesEstimees(res.adressesRestantes * SECONDES_PAR_ADRESSE);
          setDerniereMiseAJour((v) => v + 1);
          if (res.geocodes === 0 && res.echecs === 0) break; // sécurité anti-boucle infinie
        }
      } catch {
        // Géocodage best-effort (ex. utilisateur non administrateur, ou serveur indisponible) : on
        // abandonne silencieusement, la carte affichera simplement les événements non géolocalisés.
      } finally {
        enCoursRef.current = false;
        setEnCours(false);
        setSecondesRestantesEstimees(null);
        setDerniereMiseAJour((v) => v + 1);
      }
    })();
  };

  return (
    <GeocodageContext.Provider value={{ enCours, secondesRestantesEstimees, derniereMiseAJour, demarrer }}>
      {children}
    </GeocodageContext.Provider>
  );
}

export function useGeocodage(): GeocodageContextValue {
  const ctx = useContext(GeocodageContext);
  if (!ctx) throw new Error('useGeocodage doit être utilisé dans un GeocodageProvider');
  return ctx;
}
