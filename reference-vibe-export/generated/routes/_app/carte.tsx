import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef, useMemo } from 'react';
import { getEvents } from '@generated/server/events';
import { withAuthRetry } from '@generated/utils/auth-retry';
import { estArbitre, jourEnConflit, buildConflictMap, formatDateKey, estArchive } from '@generated/utils/conflicts';
import {
  normalizeLieu,
  findInKnownLocations,
  getCachedLocation,
  setCachedLocation,
  purgeOldCache,
  geocodeViaBAN,
  geocoderCentreQuartier,
} from '@generated/utils/geocoding-utils';
import {
  type PeriodType,
  formatPeriodLabel,
  eventOverlapsPeriod,
} from '@generated/utils/period-utils';
import ChargementEvenements from '@generated/components/ChargementEvenements';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ValidationBadge } from '@generated/components/ValidationBadge';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Search, MapPin, AlertCircle, X, Calendar, Users, CheckCircle2, XCircle, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export const Route = createFileRoute('/_app/carte')({ component: MapView });

type Event = Awaited<ReturnType<typeof getEvents>>['items'][number];

// Boîte englobante du territoire de la Communauté urbaine de Dunkerque
const BORNES_CUD: [[number, number], [number, number]] = [
  [50.88, 2.00],  // sud-ouest
  [51.12, 2.65],  // nord-est
];

type GeocodedLocation = {
  lat: number;
  lon: number;
  lieu: string;
  events: Event[];
  status: 'arbitre' | 'attente' | 'conflit';
  precision: 'exacte' | 'commune' | 'quartier';
};

function MapView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [geocodedLocations, setGeocodedLocations] = useState<GeocodedLocation[]>([]);
  const [nonLocalizedEvents, setNonLocalizedEvents] = useState<Event[]>([]);
  const [geocodingProgress, setGeocodingProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<GeocodedLocation | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [diagnosticQuartierOpen, setDiagnosticQuartierOpen] = useState(false);
  const [diagnosticNonLocalOpen, setDiagnosticNonLocalOpen] = useState(false);

  // Filtres
  const [searchTerm, setSearchTerm] = useState('');
  const [period, setPeriod] = useState<PeriodType>('all');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<'all' | 'arbitre' | 'attente'>('all');
  const [conflictsOnly, setConflictsOnly] = useState(false);

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const selectedMarkerRef = useRef<any>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Purger l'ancien cache au montage
  useEffect(() => {
    purgeOldCache();
  }, []);

  // Charger les événements
  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        const res = await withAuthRetry(() => getEvents({ data: {} }), { isActive: () => active });
        if (active) {
          setEvents(res?.items ?? []);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setError(e as Error);
          console.error('Error loading events:', e);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    // Délai pour laisser le temps au token monday.com d'être disponible
    const timer = setTimeout(loadData, 1000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // Déduplication des événements
  const uniqueEvents = useMemo(() => {
    const seen = new Map<string, Event>();
    for (const event of events) {
      const key = [
        event.nom || event.name,
        event.dateDeDbut,
        event.lieu,
        event.organisateur,
      ].join('|');
      
      if (!seen.has(key)) {
        seen.set(key, event);
      }
    }
    return Array.from(seen.values());
  }, [events]);

  // Filtrage des événements
  const filteredEvents = useMemo(() => {
    let filtered = uniqueEvents.filter(e => e.statut !== 'Annulée');
    
    // Filtrer les événements archivés (on ne les affiche jamais sur la carte car ils ne sont plus pertinents)
    filtered = filtered.filter(e => !estArchive(e));
    
    // Filtre période (avec chevauchement)
    if (period !== 'all') {
      filtered = filtered.filter(e => 
        eventOverlapsPeriod(
          e.dateDeDbut ? new Date(e.dateDeDbut) : null,
          e.dateDeFin ? new Date(e.dateDeFin) : null,
          period,
          referenceDate
        )
      );
    }
    
    // Filtre statut
    if (statusFilter === 'arbitre') {
      filtered = filtered.filter(e => estArbitre(e));
    } else if (statusFilter === 'attente') {
      filtered = filtered.filter(e => !estArbitre(e));
    }
    
    // Filtre conflits
    if (conflictsOnly) {
      const conflictMap = buildConflictMap(filtered);
      filtered = filtered.filter(e => {
        if (estArbitre(e)) return false;
        if (!e.dateDeDbut) return false;
        const dateKey = formatDateKey(new Date(e.dateDeDbut));
        return jourEnConflit(dateKey, conflictMap);
      });
    }
    
    // Filtre recherche
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(e => 
        (e.nom || e.name).toLowerCase().includes(term) ||
        (e.lieu || '').toLowerCase().includes(term)
      );
    }
    
    return filtered;
  }, [uniqueEvents, period, referenceDate, statusFilter, conflictsOnly, searchTerm]);

  // Helper pour construire une location avec son statut
  const buildLocation = (
    lieu: string,
    lat: number,
    lon: number,
    events: Event[],
    precision: 'exacte' | 'commune' | 'quartier' = 'exacte'
  ): GeocodedLocation => {
    // Recalculer le conflict map localement pour ce groupe d'événements
    const localConflictMap = buildConflictMap(events);
    let status: 'arbitre' | 'attente' | 'conflit' = 'arbitre';
    
    const hasConflict = events.some(e => {
      if (!e.dateDeDbut) return false;
      const dateKey = formatDateKey(new Date(e.dateDeDbut));
      return jourEnConflit(dateKey, localConflictMap);
    });
    
    if (hasConflict) {
      status = 'conflit';
    } else {
      const allArbitre = events.every(e => estArbitre(e));
      if (!allArbitre) {
        status = 'attente';
      }
    }
    
    return { lat, lon, lieu, events, status, precision };
  };

  // Clé stable pour le géocodage : liste triée des lieux normalisés
  const lieuxKey = useMemo(() => {
    const lieux = new Set<string>();
    for (const event of filteredEvents) {
      if (event.lieu && event.lieu.trim()) {
        lieux.add(normalizeLieu(event.lieu.trim()));
      }
    }
    return Array.from(lieux).sort().join(',');
  }, [filteredEvents]);

  // Géocodage progressif
  useEffect(() => {
    // Annuler le géocodage en cours si on change de filtres
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    if (filteredEvents.length === 0) {
      setGeocodedLocations([]);
      setNonLocalizedEvents([]);
      setGeocodingProgress(null);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const processGeocodingProgressive = async () => {
      // Grouper par lieu
      const eventsByLieu = new Map<string, Event[]>();
      const nonLocalized: Event[] = [];
      
      for (const event of filteredEvents) {
        if (!event.lieu || event.lieu.trim() === '') {
          nonLocalized.push(event);
          continue;
        }
        
        const lieu = event.lieu.trim();
        if (!eventsByLieu.has(lieu)) {
          eventsByLieu.set(lieu, []);
        }
        eventsByLieu.get(lieu)!.push(event);
      }
      
      setNonLocalizedEvents(nonLocalized);
      
      const lieux = Array.from(eventsByLieu.keys());
      if (lieux.length === 0) {
        setGeocodedLocations([]);
        setGeocodingProgress(null);
        return;
      }
      
      const resolvedLocations = new Map<string, GeocodedLocation>();
      const pendingLieux: { lieu: string; quartier: string | null }[] = [];
      
      // Phase 1 : résolution instantanée (dictionnaire + cache)
      for (const lieu of lieux) {
        if (controller.signal.aborted) return;
        
        const normalized = normalizeLieu(lieu);
        const eventsLieu = eventsByLieu.get(lieu)!;
        // Récupérer le quartier du premier événement du lieu
        const quartier = eventsLieu[0]?.quartier || null;
        
        // a. Correspondance exacte dans le dictionnaire statique
        const knownCoords = findInKnownLocations(normalized);
        if (knownCoords) {
          const location = buildLocation(lieu, knownCoords[0], knownCoords[1], eventsLieu, 'exacte');
          resolvedLocations.set(lieu, location);
          continue;
        }
        
        // b. Chercher dans le cache
        const cached = getCachedLocation(normalized);
        if (cached === 'failed') {
          // Échec connu, passer à la résolution par quartier si disponible
          if (quartier) {
            pendingLieux.push({ lieu, quartier });
          } else {
            nonLocalized.push(...eventsLieu);
          }
          continue;
        }
        if (cached) {
          const location = buildLocation(lieu, cached.lat, cached.lon, eventsLieu, cached.precision);
          resolvedLocations.set(lieu, location);
          continue;
        }
        
        // Sinon, à géocoder
        pendingLieux.push({ lieu, quartier });
      }
      
      // Afficher immédiatement les lieux résolus
      setGeocodedLocations(Array.from(resolvedLocations.values()));
      
      if (pendingLieux.length === 0) {
        setGeocodingProgress(null);
        return;
      }
      
      // Phase 2 : géocodage en arrière-plan avec pool de 5 requêtes
      setGeocodingProgress({ current: 0, total: pendingLieux.length });
      
      const pool = 5;
      let completed = 0;
      
      const geocodeLieu = async (item: { lieu: string; quartier: string | null }) => {
        if (controller.signal.aborted) return;
        
        const { lieu, quartier } = item;
        const normalized = normalizeLieu(lieu);
        const eventsLieu = eventsByLieu.get(lieu)!;
        
        try {
          // Timeout de 8 secondes par requête
          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => timeoutController.abort(), 8000);
          
          // Combiner avec le contrôleur parent
          const combinedSignal = controller.signal.aborted ? controller.signal : timeoutController.signal;
          
          // b. & c. Tenter le géocodage via BAN (avec extraction d'adresse et libellé nettoyé)
          const coords = await geocodeViaBAN(lieu, quartier, combinedSignal);
          clearTimeout(timeoutId);
          
          if (controller.signal.aborted) return;
          
          if (coords) {
            // Succès : mettre en cache et ajouter le marqueur
            setCachedLocation(normalized, coords);
            const location = buildLocation(lieu, coords.lat, coords.lon, eventsLieu, coords.precision);
            
            setGeocodedLocations(prev => [...prev, location]);
          } else {
            // d. Échec du géocodage → repli sur le centre du quartier si disponible
            if (quartier) {
              const centreQuartier = await geocoderCentreQuartier(quartier, combinedSignal);
              
              if (centreQuartier) {
                const coordsQuartier = { ...centreQuartier, precision: 'quartier' as const };
                setCachedLocation(normalized, coordsQuartier);
                const location = buildLocation(lieu, centreQuartier.lat, centreQuartier.lon, eventsLieu, 'quartier');
                
                setGeocodedLocations(prev => [...prev, location]);
              } else {
                // e. Aucun quartier ou échec du géocodage quartier → non localisé
                setCachedLocation(normalized, null);
                setNonLocalizedEvents(prev => [...prev, ...eventsLieu]);
              }
            } else {
              // e. Aucun quartier → non localisé
              setCachedLocation(normalized, null);
              setNonLocalizedEvents(prev => [...prev, ...eventsLieu]);
            }
          }
        } catch {
          if (controller.signal.aborted) return;
          // Erreur : tenter repli quartier si disponible
          if (quartier) {
            try {
              const centreQuartier = await geocoderCentreQuartier(quartier);
              if (centreQuartier) {
                const coordsQuartier = { ...centreQuartier, precision: 'quartier' as const };
                setCachedLocation(normalized, coordsQuartier);
                const location = buildLocation(lieu, centreQuartier.lat, centreQuartier.lon, eventsLieu, 'quartier');
                
                setGeocodedLocations(prev => [...prev, location]);
              } else {
                setCachedLocation(normalized, null);
                setNonLocalizedEvents(prev => [...prev, ...eventsLieu]);
              }
            } catch {
              setCachedLocation(normalized, null);
              setNonLocalizedEvents(prev => [...prev, ...eventsLieu]);
            }
          } else {
            setCachedLocation(normalized, null);
            setNonLocalizedEvents(prev => [...prev, ...eventsLieu]);
          }
        }
        
        completed++;
        setGeocodingProgress({ current: completed, total: pendingLieux.length });
      };
      
      // Traiter par pool de 5
      for (let i = 0; i < pendingLieux.length; i += pool) {
        if (controller.signal.aborted) return;
        const batch = pendingLieux.slice(i, i + pool);
        await Promise.all(batch.map(geocodeLieu));
      }
      
      setGeocodingProgress(null);
    };
    
    processGeocodingProgressive();
    
    return () => {
      controller.abort();
    };
  }, [lieuxKey, filteredEvents]);

  // Initialiser Leaflet côté client uniquement
  useEffect(() => {
    if (typeof window === 'undefined' || !mapContainerRef.current) return;
    
    let mounted = true;
    
    // Charger Leaflet dynamiquement
    const loadLeaflet = async () => {
      try {
        // Injecter le CSS
        if (!document.getElementById('leaflet-css')) {
          const link = document.createElement('link');
          link.id = 'leaflet-css';
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          document.head.appendChild(link);
        }
        
        // Charger le JS - vérifier si un script existe déjà
        if (!(window as any).L) {
          const existingScript = document.querySelector('script[src*="leaflet"]');
          
          if (existingScript) {
            // Un script Leaflet existe déjà, attendre qu'il se charge
            await new Promise<void>((resolve) => {
              if ((window as any).L) {
                resolve();
              } else {
                existingScript.addEventListener('load', () => resolve());
              }
            });
          } else {
            // Injecter un nouveau script
            await new Promise<void>((resolve, reject) => {
              const script = document.createElement('script');
              script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
              script.onload = () => resolve();
              script.onerror = () => reject(new Error('Failed to load Leaflet'));
              document.body.appendChild(script);
            });
          }
        }
        
        // Vérifier si le composant est toujours monté
        if (!mounted) return;
        
        const L = (window as any).L;
        
        // Corriger le bug des icônes par défaut
        delete (L.Icon.Default.prototype as any)._getIconUrl;
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        });
        
        // Vérifier que le conteneur existe et n'est pas déjà initialisé
        const container = mapContainerRef.current;
        if (!container) return;
        
        // Leaflet marque un conteneur initialisé avec _leaflet_id
        if ((container as any)._leaflet_id) {
          console.warn('[Carte] Map container already initialized, skipping');
          return;
        }
        
        // Créer la carte si elle n'existe pas
        if (!mapRef.current && mounted) {
          // Marge pour maxBounds (0.05 degré de latitude/longitude)
          const maxBoundsExtended: [[number, number], [number, number]] = [
            [BORNES_CUD[0][0] - 0.05, BORNES_CUD[0][1] - 0.05],
            [BORNES_CUD[1][0] + 0.05, BORNES_CUD[1][1] + 0.05],
          ];
          
          const map = L.map(container, {
            maxBounds: maxBoundsExtended,
            maxBoundsViscosity: 0.8,
            minZoom: 10,
            maxZoom: 18,
          });
          
          // Cadrer sur le territoire CUD
          map.fitBounds(BORNES_CUD, { padding: [20, 20] });
          
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 18,
          }).addTo(map);
          
          mapRef.current = map;
        }
      } catch (error) {
        console.error('[Carte] Failed to initialize Leaflet:', error);
      }
    };
    
    loadLeaflet();
    
    return () => {
      mounted = false;
      // Cleanup de la carte
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Mettre à jour les marqueurs
  useEffect(() => {
    if (!mapRef.current) return;
    
    const L = (window as any).L;
    if (!L) return;
    
    // Supprimer les marqueurs existants
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];
    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove();
      selectedMarkerRef.current = null;
    }
    
    // Ajouter les nouveaux marqueurs
    for (const location of geocodedLocations) {
      // Couleur selon le statut
      const colorMap = {
        arbitre: '#16a34a',  // vert
        attente: '#f59e0b',  // orange
        conflit: '#dc2626',  // rouge
      };
      
      const color = colorMap[location.status];
      const isSelected = selectedLocation?.lieu === location.lieu;
      const size = isSelected ? 32 : 24;
      const isApproximate = location.precision === 'commune';
      
      // Icône personnalisée avec couleur et style pointillé si approximatif
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div style="
            background-color: ${color};
            width: ${size}px;
            height: ${size}px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            border: ${isSelected ? '3px' : '2px'} solid white;
            ${isApproximate ? 'border-style: dashed;' : ''}
            box-shadow: ${isSelected ? '0 0 15px rgba(0,0,0,0.5)' : '0 2px 5px rgba(0,0,0,0.3)'};
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
          ">
            <span style="
              color: white;
              font-size: ${isSelected ? '12px' : '10px'};
              font-weight: bold;
              transform: rotate(45deg);
            ">${location.events.length}</span>
          </div>
        `,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      });
      
      const marker = L.marker([location.lat, location.lon], { icon }).addTo(mapRef.current);
      
      // Tooltip si localisation approximative
      if (isApproximate) {
        // Récupérer le quartier du premier événement
        const quartierNom = location.events[0]?.quartier || 'quartier';
        marker.bindTooltip(`Localisation approximative — centre du quartier ${quartierNom}`, {
          permanent: false,
          direction: 'top',
          offset: [0, -size],
        });
      }
      
      // Au clic, ouvrir le panneau latéral
      marker.on('click', () => {
        setSelectedLocation(location);
        // Recentrer la carte sur le marqueur
        mapRef.current.flyTo([location.lat, location.lon], 13, { duration: 0.5 });
      });
      
      if (isSelected) {
        selectedMarkerRef.current = marker;
      } else {
        markersRef.current.push(marker);
      }
    }
  }, [geocodedLocations, selectedLocation]);

  // Gestion de la touche Échap
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLocation) {
        setSelectedLocation(null);
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [selectedLocation]);

  const totalLocations = geocodedLocations.length;
  const totalEvents = geocodedLocations.reduce((sum, loc) => sum + loc.events.length, 0);

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Erreur</CardTitle>
            <CardDescription>Impossible de charger les événements.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-60px)] flex-col bg-background">
      {/* Header & Filters */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="mb-4">
            <h1 className="text-3xl font-medium tracking-tight text-foreground">
              Carte des Événements
            </h1>
            <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Dunkerque et Agglomération
            </p>
          </div>

          {/* Filtres */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {/* Recherche */}
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un événement ou un lieu..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 font-mono text-xs"
                />
              </div>

              {/* Période */}
              <select
                value={period}
                onChange={(e) => {
                  const newPeriod = e.target.value as PeriodType;
                  setPeriod(newPeriod);
                  if (newPeriod !== 'day' && newPeriod !== 'week') {
                    setReferenceDate(new Date());
                  }
                }}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Tous</option>
                <option value="day">Jour</option>
                <option value="week">Semaine</option>
                <option value="month">Mois</option>
                <option value="quarter">Trimestre</option>
                <option value="year">Année</option>
              </select>

              {/* Statut */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">Tous les statuts</option>
                <option value="arbitre">Arbitrés</option>
                <option value="attente">À arbitrer</option>
              </select>

              {/* Conflits uniquement */}
              <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-background">
                <Checkbox 
                  id="conflicts-only-map" 
                  checked={conflictsOnly}
                  onCheckedChange={(checked) => setConflictsOnly(checked === true)}
                />
                <Label htmlFor="conflicts-only-map" className="font-mono text-xs cursor-pointer">
                  Conflits uniquement
                </Label>
              </div>
            </div>

            {/* Contrôles de période (jour / semaine) */}
            {period === 'day' && (
              <div className="flex items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
                      <Calendar className="h-3.5 w-3.5" />
                      {formatPeriodLabel('day', referenceDate)}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={referenceDate}
                      onSelect={(date) => date && setReferenceDate(date)}
                    />
                  </PopoverContent>
                </Popover>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReferenceDate(new Date())}
                  className="font-mono text-xs"
                >
                  Aujourd'hui
                </Button>
              </div>
            )}

            {period === 'week' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    const newDate = new Date(referenceDate);
                    newDate.setDate(newDate.getDate() - 7);
                    setReferenceDate(newDate);
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-sm font-mono px-4 py-1 bg-muted/50 rounded-md">
                  {formatPeriodLabel('week', referenceDate)}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    const newDate = new Date(referenceDate);
                    newDate.setDate(newDate.getDate() + 7);
                    setReferenceDate(newDate);
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReferenceDate(new Date())}
                  className="font-mono text-xs"
                >
                  Cette semaine
                </Button>
              </div>
            )}

            {period === 'month' && (
              <div className="text-sm font-mono text-muted-foreground">
                {formatPeriodLabel('month', referenceDate)}
              </div>
            )}

            {period === 'quarter' && (
              <div className="text-sm font-mono text-muted-foreground">
                {formatPeriodLabel('quarter', referenceDate)}
              </div>
            )}

            {period === 'year' && (
              <div className="text-sm font-mono text-muted-foreground">
                {formatPeriodLabel('year', referenceDate)}
              </div>
            )}
          </div>

          {/* Stats */}
          <div className="mt-4 flex gap-3 items-center text-xs text-muted-foreground font-mono">
            <span>{totalEvents} événements sur {totalLocations} lieux affichés</span>
            {geocodingProgress && (
              <span className="text-amber-600">
                Localisation en cours… {geocodingProgress.current}/{geocodingProgress.total} lieux
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (mapRef.current) {
                  const L = (window as any).L;
                  if (L) {
                    mapRef.current.fitBounds(BORNES_CUD, { padding: [20, 20], duration: 0.5 });
                  }
                }
              }}
              className="ml-auto text-xs h-7"
            >
              <MapPin className="h-3 w-3 mr-1" />
              Recentrer sur la CUD
            </Button>
          </div>
        </div>
      </div>

      {/* Carte et panneau */}
      <div className="flex-1 flex flex-col lg:flex-row relative">
        {/* Carte */}
        <div className={`relative ${selectedLocation ? 'lg:w-2/3' : 'w-full'} transition-all duration-300`}>
          <div ref={mapContainerRef} className="h-full min-h-[500px] lg:min-h-[calc(100vh-250px)]" />
          
          {/* Overlay de chargement des événements */}
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-[900] pointer-events-none">
              <div className="bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-border p-6 pointer-events-auto">
                <ChargementEvenements compact />
              </div>
            </div>
          )}
          
          {/* Barre de progression du géocodage */}
          {geocodingProgress && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border px-4 py-2 text-xs font-mono">
              Localisation en cours… {geocodingProgress.current}/{geocodingProgress.total} lieux
            </div>
          )}
              
              {/* Légende (en bas à droite) */}
              <div className="absolute bottom-4 right-4 z-[1000] max-w-xs">
                <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setLegendOpen(!legendOpen)}
                    className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium hover:bg-accent/50 transition-colors"
                  >
                    <span>Légende</span>
                    {legendOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </button>
                  
                  {legendOpen && (
                    <div className="px-4 pb-4 space-y-3 text-xs">
                      {/* Couleurs */}
                      <div>
                        <div className="font-semibold mb-2 text-muted-foreground uppercase tracking-wide text-[10px]">
                          Couleurs des marqueurs
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="h-3 w-3 rounded-full bg-green-600 shrink-0 mt-0.5" />
                            <span className="text-foreground/80 leading-tight">
                              Tous les événements du lieu sont arbitrés
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-3 w-3 rounded-full bg-amber-500 shrink-0 mt-0.5" />
                            <span className="text-foreground/80 leading-tight">
                              Au moins un événement en attente d'arbitrage
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-3 w-3 rounded-full bg-red-600 shrink-0 mt-0.5" />
                            <span className="text-foreground/80 leading-tight">
                              Au moins un événement un jour en conflit
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Précision */}
                      <div className="pt-2 border-t">
                        <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide text-[10px]">
                          Précision de localisation
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-start gap-2">
                            <div className="h-3 w-3 rounded-full bg-gray-400 border-2 border-white shrink-0 mt-0.5" />
                            <span className="text-foreground/80 leading-tight">
                              Contour plein : localisation exacte (adresse validée)
                            </span>
                          </div>
                          <div className="flex items-start gap-2">
                            <div className="h-3 w-3 rounded-full bg-gray-400 border-2 border-dashed border-white shrink-0 mt-0.5" />
                            <span className="text-foreground/80 leading-tight">
                              Contour pointillé : localisation au quartier (centre approximatif)
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Chiffre */}
                      <div className="pt-2 border-t">
                        <div className="font-semibold mb-1 text-muted-foreground uppercase tracking-wide text-[10px]">
                          Chiffre affiché
                        </div>
                        <p className="text-foreground/80 leading-tight">
                          Le nombre indique le total d'événements programmés à ce lieu sur la période filtrée.
                        </p>
                      </div>

                      {/* Rappel */}
                      <div className="pt-2 border-t">
                        <p className="text-muted-foreground italic leading-tight">
                          💡 Un événement pluri-jours mobilise ses ressources sur toute sa période, du premier au dernier jour.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
        </div>

        {/* Panneau latéral */}
        {selectedLocation && (
          <div className="lg:w-1/3 border-l bg-card flex flex-col max-h-[calc(100vh-60px)] lg:max-h-[calc(100vh-60px)]">
            {/* En-tête du panneau */}
            <div className="border-b bg-card/50 backdrop-blur-sm p-4 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="h-5 w-5 text-primary shrink-0" />
                  <h2 className="text-lg font-semibold text-foreground truncate">
                    {selectedLocation.lieu}
                  </h2>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">
                    {selectedLocation.events.length} événement{selectedLocation.events.length > 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div 
                      className="h-3 w-3 rounded-full" 
                      style={{ 
                        backgroundColor: selectedLocation.status === 'arbitre' ? '#16a34a' : selectedLocation.status === 'attente' ? '#f59e0b' : '#dc2626' 
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {selectedLocation.status === 'arbitre' ? 'Arbitré' : selectedLocation.status === 'attente' ? 'À arbitrer' : 'Conflit'}
                    </span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedLocation(null)}
                className="shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Résumé */}
            <div className="px-4 py-3 bg-muted/30 border-b">
              <div className="flex items-center gap-4 text-xs font-mono">
                {(() => {
                  const conflictMap = buildConflictMap(selectedLocation.events);
                  const nbArbitre = selectedLocation.events.filter(e => estArbitre(e)).length;
                  const nbAttente = selectedLocation.events.filter(e => !estArbitre(e)).length;
                  const nbConflit = selectedLocation.events.filter(e => {
                    // Ne compter que les événements NON arbitrés en conflit
                    if (estArbitre(e)) return false;
                    if (!e.dateDeDbut) return false;
                    const dateKey = formatDateKey(new Date(e.dateDeDbut));
                    return jourEnConflit(dateKey, conflictMap);
                  }).length;

                  return (
                    <>
                      <span className="text-green-600">{nbArbitre} arbitré{nbArbitre > 1 ? 's' : ''}</span>
                      <span className="text-amber-600">{nbAttente} à arbitrer</span>
                      {nbConflit > 0 && <span className="text-red-600">{nbConflit} en conflit</span>}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Liste des événements (scrollable) */}
            <div className="flex-1 overflow-y-auto">
              {(() => {
                const conflictMap = buildConflictMap(selectedLocation.events);
                const sortedEvents = [...selectedLocation.events].sort((a, b) => {
                  const dateA = a.dateDeDbut ? new Date(a.dateDeDbut).getTime() : 0;
                  const dateB = b.dateDeDbut ? new Date(b.dateDeDbut).getTime() : 0;
                  return dateA - dateB;
                });

                return sortedEvents.map((event) => {
                  const hasTech = event.validationTechnique === true;
                  const hasPol = event.validationPolitique === true;
                  const isArbitre = hasTech && hasPol;
                  
                  let conflictDayCount = 0;
                  let isConflict = false;
                  // Les événements arbitrés ne sont jamais en conflit
                  if (!isArbitre && event.dateDeDbut) {
                    const dateKey = formatDateKey(new Date(event.dateDeDbut));
                    isConflict = jourEnConflit(dateKey, conflictMap);
                    if (isConflict) {
                      const eventsOnDay = conflictMap.get(dateKey) || [];
                      // Ne compter que les événements NON arbitrés ce jour
                      conflictDayCount = eventsOnDay.filter(e => !estArbitre(e)).length;
                    }
                  }

                  return (
                    <div 
                      key={event.id}
                      className="border-b p-4 hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <h3 className="font-semibold text-sm text-foreground leading-tight">
                          {event.nom || event.name}
                        </h3>
                        <Badge 
                          variant={isArbitre ? 'default' : 'secondary'}
                          className={`shrink-0 text-[10px] ${isArbitre ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                        >
                          {isArbitre ? 'Arbitré' : 'À arbitrer'}
                        </Badge>
                      </div>

                      <div className="space-y-1.5 text-xs text-muted-foreground">
                        {event.dateDeDbut && (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {new Date(event.dateDeDbut).toLocaleDateString('fr-FR')}
                              {event.dateDeFin && event.dateDeFin !== event.dateDeDbut && (
                                <> → {new Date(event.dateDeFin).toLocaleDateString('fr-FR')}</>
                              )}
                            </span>
                          </div>
                        )}
                        
                        {event.organisateur && (
                          <div className="flex items-center gap-1.5">
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{event.organisateur}</span>
                          </div>
                        )}

                        {/* Validation */}
                        <div className="flex items-center gap-2 pt-1">
                          <ValidationBadge 
                            validationTechnique={event.validationTechnique}
                            validationPolitique={event.validationPolitique}
                            size="sm"
                          />
                        </div>

                        {/* Badge conflit */}
                        {isConflict && (
                          <div className="pt-1">
                            <Badge variant="destructive" className="text-[9px] px-1.5 py-0.5">
                              <AlertTriangle className="h-2.5 w-2.5 mr-1 inline" />
                              Jour en conflit ({conflictDayCount} événements)
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}
      </div>

      {/* Diagnostic de localisation */}
      {(geocodedLocations.length > 0 || nonLocalizedEvents.length > 0) && (
        <div className="border-t bg-muted/30">
          <div className="container mx-auto px-4 py-4">
            <div className="space-y-3">
              {/* Localisés précisément */}
              {(() => {
                const precis = geocodedLocations.filter(loc => loc.precision === 'exacte');
                const nbEventsPrecis = precis.reduce((sum, loc) => sum + loc.events.length, 0);
                return precis.length > 0 && (
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                    <span className="font-medium text-foreground">
                      {nbEventsPrecis} événement{nbEventsPrecis > 1 ? 's' : ''} localisé{nbEventsPrecis > 1 ? 's' : ''} précisément
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({precis.length} lieu{precis.length > 1 ? 'x' : ''})
                    </span>
                  </div>
                );
              })()}
              
              {/* Localisés au quartier */}
              {(() => {
                const quartier = geocodedLocations.filter(loc => loc.precision === 'quartier');
                const nbEventsQuartier = quartier.reduce((sum, loc) => sum + loc.events.length, 0);
                
                return quartier.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDiagnosticQuartierOpen(!diagnosticQuartierOpen)}
                        className="flex items-center gap-2 text-sm hover:bg-accent/50 rounded px-2 py-1 -ml-2 transition-colors"
                      >
                        {diagnosticQuartierOpen ? <ChevronDown className="h-4 w-4 text-amber-600 shrink-0" /> : <ChevronUp className="h-4 w-4 text-amber-600 shrink-0" />}
                        <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="font-medium text-foreground">
                          {nbEventsQuartier} événement{nbEventsQuartier > 1 ? 's' : ''} localisé{nbEventsQuartier > 1 ? 's' : ''} au quartier
                        </span>
                        <span className="text-xs text-muted-foreground">
                          (centre approximatif)
                        </span>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const liste = quartier.map(loc => loc.lieu).join('\n');
                          navigator.clipboard.writeText(liste);
                        }}
                        className="ml-auto text-xs h-7"
                      >
                        Copier la liste
                      </Button>
                    </div>
                    {diagnosticQuartierOpen && (
                      <div className="pl-10 space-y-1">
                        {quartier.map(loc => (
                          <div key={loc.lieu} className="text-xs text-muted-foreground">
                            • {loc.lieu} ({loc.events.length} événement{loc.events.length > 1 ? 's' : ''})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              
              {/* Non localisés */}
              {(() => {
                // Grouper par lieu
                const lieuxNonLocalises = new Map<string, number>();
                for (const event of nonLocalizedEvents) {
                  const lieu = event.lieu || '(lieu manquant)';
                  lieuxNonLocalises.set(lieu, (lieuxNonLocalises.get(lieu) || 0) + 1);
                }
                const lieuxArray = Array.from(lieuxNonLocalises.entries());
                
                return nonLocalizedEvents.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setDiagnosticNonLocalOpen(!diagnosticNonLocalOpen)}
                        className="flex items-center gap-2 text-sm hover:bg-accent/50 rounded px-2 py-1 -ml-2 transition-colors"
                      >
                        {diagnosticNonLocalOpen ? <ChevronDown className="h-4 w-4 text-red-600 shrink-0" /> : <ChevronUp className="h-4 w-4 text-red-600 shrink-0" />}
                        <XCircle className="h-4 w-4 text-red-600 shrink-0" />
                        <span className="font-medium text-foreground">
                          {nonLocalizedEvents.length} événement{nonLocalizedEvents.length > 1 ? 's' : ''} non localisé{nonLocalizedEvents.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          (lieu manquant ou introuvable)
                        </span>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const liste = lieuxArray.map(([lieu]) => lieu).join('\n');
                          navigator.clipboard.writeText(liste);
                        }}
                        className="ml-auto text-xs h-7"
                      >
                        Copier la liste
                      </Button>
                    </div>
                    {diagnosticNonLocalOpen && (
                      <div className="pl-10 space-y-1">
                        {lieuxArray.map(([lieu, count]) => (
                          <div key={lieu} className="text-xs text-muted-foreground">
                            • {lieu} ({count} événement{count > 1 ? 's' : ''})
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
