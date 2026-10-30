import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { getEvents, getFilterOptions, getEventStats, updateEventStatus, updateEventDates, validateAndArchiveEvent, validateEventSeries } from '@generated/server/events';
import { withAuthRetry } from '@generated/utils/auth-retry';
import { findAndCleanDuplicates } from '@generated/server/cleanup-duplicates';
import { buildConflictMap, getEventConflicts, getDaySeverity, getSeverityColor, estArbitre, jourEnConflit, formatDateKey, estArchive } from '@generated/utils/conflicts';
import { useSession, estAdministrateur } from '@generated/components/Authentification';
import { ValidationBadge } from '@generated/components/ValidationBadge';
import ChargementEvenements from '@generated/components/ChargementEvenements';
import { useXlsxExport, createSpreadsheet, createTheme } from '@skills/xlsx-export.jsx';
import { exportEventsToPdf } from '@generated/utils/pdf-export';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Search, MapPin, Users, CheckCircle2, XCircle, Clock, FileText, ArrowUpDown, ArrowUp, ArrowDown, AlertTriangle, Calendar as CalendarIcon, Trash2, FileDown } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';


export const Route = createFileRoute('/_app/liste')({ component: ListView });

type Event = Awaited<ReturnType<typeof getEvents>>['items'][number];

function ListView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterQuartier, setFilterQuartier] = useState('ALL');
  const [filterStatut, setFilterStatut] = useState('ALL');
  const [filterNature, setFilterNature] = useState('ALL');
  const [filterDateDebut, setFilterDateDebut] = useState('');
  const [filterDateFin, setFilterDateFin] = useState('');
  const [filterOptions, setFilterOptions] = useState<Awaited<ReturnType<typeof getFilterOptions>> | null>(null);
  const [_stats, setStats] = useState<Awaited<ReturnType<typeof getEventStats>> | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [validatingEventId, setValidatingEventId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [eventToValidate, setEventToValidate] = useState<Event | null>(null);
  const [validationViaPastilleDateClef, setValidationViaPastilleDateClef] = useState(false);
  const [sortField, setSortField] = useState<'nom' | 'dateDeDbut' | 'statut' | 'name'>('dateDeDbut');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showConflictsOnly, setShowConflictsOnly] = useState(false);
  const [afficherArchives, setAfficherArchives] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100); // Pagination : nombre d'événements affichés
  
  // État pour modification des dates
  const [editingDates, setEditingDates] = useState(false);
  const [newDateDeDebut, setNewDateDeDebut] = useState<string>('');
  const [newDateDeFin, setNewDateDeFin] = useState<string>('');
  const [updatingDates, setUpdatingDates] = useState(false);
  
  // État pour nettoyage des doublons
  const [cleaningDuplicates, setCleaningDuplicates] = useState(false);
  const [cleanupResultDialogOpen, setCleanupResultDialogOpen] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<Awaited<ReturnType<typeof findAndCleanDuplicates>> | null>(null);
  
  // État pour résultat de validation de série
  const [validationResultDialogOpen, setValidationResultDialogOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<{
    eventName: string;
    validated: number;
    total: number;
    events: Array<{ id: string; name: string; date: string | null }>;
  } | null>(null);
  
  // Mode lecture seule
  const { session } = useSession();
  const lectureSeule = !estAdministrateur(session);

  // Hooks pour l'export
  const tableRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const { exportToXlsx, isExporting: isExportingXlsx } = useXlsxExport();

  // Fonction pour obtenir la plage de dates complète d'une série
  const getSeriesDateRange = (eventName: string): { start: Date; end: Date } | null => {
    const seriesEvents = events.filter(e => 
      (e.nom || e.name).trim().toLowerCase() === eventName.trim().toLowerCase()
    );
    
    if (seriesEvents.length === 0) return null;
    
    const dates = seriesEvents
      .flatMap(e => {
        const dates: Date[] = [];
        if (e.dateDeDbut) dates.push(new Date(e.dateDeDbut));
        if (e.dateDeFin) dates.push(new Date(e.dateDeFin));
        return dates;
      })
      .filter(d => !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length === 0) return null;
    
    return {
      start: dates[0],
      end: dates[dates.length - 1]
    };
  };

  // Fonction pour vérifier si une série de dates est contiguë
  const isContiguousSeries = useCallback((eventName: string): boolean => {
    // Trouver tous les événements avec ce nom
    const seriesEvents = events.filter(e => 
      (e.nom || e.name).trim().toLowerCase() === eventName.trim().toLowerCase()
    );
    
    if (seriesEvents.length <= 1) {
      return false;
    }
    
    // Extraire et trier les dates de début
    const dates = seriesEvents
      .map(e => (e as any).dateDeDbut as Date | null | undefined)
      .filter((d): d is Date => d !== null && d !== undefined)
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length <= 1) {
      return false;
    }
    
    // Vérifier que toutes les dates sont consécutives (écart max 1 jour)
    for (let i = 1; i < dates.length; i++) {
      const prevDate = dates[i - 1];
      const currDate = dates[i];
      const diffInDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Si l'écart est > 1 jour, la série n'est pas contiguë
      if (diffInDays > 1) {
        return false;
      }
    }
    
    // Calculer le nombre de jours réels (pas le nombre d'items)
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const durationInDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Log unique seulement si c'est une série contiguë
    console.log(`✅ Série contiguë: "${eventName}" (${durationInDays} jours, ${firstDate.toLocaleDateString('fr-FR')} → ${lastDate.toLocaleDateString('fr-FR')}) [${seriesEvents.length} items dans le board]`);
    return true;
  }, [events]);

  // Fonction pour exporter en PDF paginé
  const handleExportPdf = () => {
    setIsExportingPdf(true);
    try {
      exportEventsToPdf(sortedEvents, getSeriesDateRange, {
        filterDateDebut,
        filterDateFin,
        searchTerm,
        filterQuartier,
        filterNature,
        filterStatut
      });
    } catch (error) {
      console.error('Erreur lors de l\'export PDF:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Fonction pour exporter en Excel
  const handleExportExcel = () => {
    const theme = createTheme({
      primary: 'FF0F4C81',
      secondary: 'FF1E88E5',
      accent: 'FFFBBF24',
      neutral: 'FFE5E7EB',
      font: 'Segoe UI'
    });

    const columns = ['ID Événement', 'Événement', 'Date Début', 'Date Fin', 'Lieu', 'Quartier', 'Nature', 'Statut', 'Validation Tech.', 'Validation Pol.', 'Date Clef'];
    
    const rows = sortedEvents.map(event => {
      const seriesRange = getSeriesDateRange(event.nom || event.name);
      const startDate = seriesRange?.start ? seriesRange.start.toLocaleDateString('fr-FR') : '—';
      const endDate = seriesRange?.end ? seriesRange.end.toLocaleDateString('fr-FR') : '—';
      
      return [
        event.name,
        event.nom || event.name,
        startDate,
        endDate,
        event.lieu || '—',
        event.quartier || '—',
        event.nature || '—',
        event.statut || '—',
        event.validationTechnique ? 'Oui' : 'Non',
        event.validationPolitique ? 'Oui' : 'Non',
        event.validParDateClef ? 'Oui' : 'Non'
      ];
    });

    const title = `Calendrier des Événements - Dunkerque${filterDateDebut || filterDateFin ? ` (${filterDateDebut ? 'du ' + new Date(filterDateDebut).toLocaleDateString('fr-FR') : ''}${filterDateDebut && filterDateFin ? ' au ' : ''}${filterDateFin ? new Date(filterDateFin).toLocaleDateString('fr-FR') : ''})` : ''}`;
    
    const wb = createSpreadsheet({
      sheetName: 'Événements',
      title,
      columns,
      rows,
      theme,
      autoFilter: true,
      freezeHeader: true,
      alternateRows: true,
      columnWidths: {
        0: 15,  // ID
        1: 40,  // Événement
        2: 12,  // Date début
        3: 12,  // Date fin
        4: 30,  // Lieu
        5: 20,  // Quartier
        6: 25,  // Nature
        7: 12,  // Statut
        8: 12,  // Val. Tech
        9: 12,  // Val. Pol
        10: 12  // Date Clef
      }
    });

    const filename = `evenements${filterDateDebut ? `-${filterDateDebut}` : ''}${filterDateFin ? `-${filterDateFin}` : ''}.xlsx`;
    exportToXlsx(wb, filename);
  };

  // Compter les événements de la série contiguë pour le dialog de confirmation
  // useMemo pour éviter les recalculs en boucle
  const seriesCount = useMemo(() => {
    if (!eventToValidate) {
      console.log('📊 seriesCount: eventToValidate est null');
      return 0;
    }
    
    const eventName = eventToValidate.nom || eventToValidate.name;
    console.log(`📊 Calcul seriesCount pour "${eventName}" (ID: ${eventToValidate.id})`);
    
    const isContiguous = isContiguousSeries(eventName);
    
    if (!isContiguous) {
      console.log(`  ❌ Série non contiguë pour "${eventName}"`);
      return 0;
    }
    
    const count = events.filter(e => 
      (e.nom || e.name).trim().toLowerCase() === eventName.trim().toLowerCase()
    ).length;
    
    console.log(`  ✅ Serie contiguë détectée: ${count} événements`);
    return count;
  }, [eventToValidate, events, isContiguousSeries]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load filter options and stats
  useEffect(() => {
    let active = true;
    
    const loadFilters = async () => {
      try {
        const [options, statsData] = await withAuthRetry(
          () => Promise.all([getFilterOptions(), getEventStats()]),
          { isActive: () => active }
        );
        
        if (active) {
          setFilterOptions(options);
          setStats(statsData);
        }
      } catch (e) {
        if (active) console.error('Error loading filters:', e);
      }
    };
    
    // Delay to ensure auth token is ready
    const timer = setTimeout(loadFilters, 100);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // Load events with filters
  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      setLoading(true);
      setDisplayLimit(100); // Réinitialiser la pagination lors du rechargement
      
      try {
        const res = await withAuthRetry(
          () => getEvents({ 
            data: {
              searchTerm: debouncedSearch || undefined,
              quartier: filterQuartier === 'ALL' ? undefined : filterQuartier,
              statut: filterStatut === 'ALL' ? undefined : filterStatut,
              nature: filterNature === 'ALL' ? undefined : filterNature,
            }
          }),
          { isActive: () => active }
        );
        
        if (active) {
          const items = res?.items ?? [];
          console.log('Total items from server:', items.length);
          
          // Check for duplicates
          const idCounts = new Map<string, number>();
          items.forEach(item => {
            idCounts.set(item.id, (idCounts.get(item.id) ?? 0) + 1);
          });
          
          const duplicates = Array.from(idCounts.entries()).filter(([_, count]) => count > 1);
          if (duplicates.length > 0) {
            console.log('Duplicate IDs found:', duplicates);
          }
          
          setEvents(items);
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
  }, [debouncedSearch, filterQuartier, filterStatut, filterNature]);

  const handleStatusUpdate = async (newStatut: string) => {
    if (!selectedEvent) return;
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      return;
    }
    
    setUpdatingStatus(true);
    try {
      await updateEventStatus({ data: { id: selectedEvent.id, statut: newStatut as 'Validée' | 'Annulée' | 'À valider' | 'Brouillon', estLectureSeule: lectureSeule } });
      
      console.log(`[Liste Status Update] Event ${selectedEvent.name} status changed to: "${newStatut}"`);
      
      // If status is "Annulée", reload all data to ensure the event disappears
      if (newStatut === 'Annulée') {
        console.log('[Liste Status Update] Reloading all data after cancellation...');
        const [eventsRes, statsRes] = await Promise.all([
          getEvents({ 
            data: { 
              searchTerm: debouncedSearch || undefined, 
              quartier: filterQuartier === 'ALL' ? undefined : filterQuartier, 
              statut: filterStatut === 'ALL' ? undefined : filterStatut, 
              nature: filterNature === 'ALL' ? undefined : filterNature 
            } 
          }),
          getEventStats()
        ]);
        
        setEvents(eventsRes?.items ?? []);
        setStats(statsRes);
        setSelectedEvent(null);
        setSheetOpen(false);
        console.log('[Liste Status Update] Data reloaded, cancelled event should be gone');
      } else {
        // Update local state for other status changes
        setEvents(prev => prev.map(e => 
          e.id === selectedEvent.id ? { ...e, statut: newStatut } : e
        ));
        setSelectedEvent(prev => prev ? { ...prev, statut: newStatut } : null);
        
        // Refresh stats
        const newStats = await getEventStats();
        setStats(newStats);
      }
    } catch (e) {
      console.error('Error updating status:', e);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleQuickValidateAndArchive = async (event: Event, _e: React.MouseEvent, viaPastilleDateClef: boolean = false) => {
    console.log(`🔵 handleQuickValidateAndArchive appelé pour événement: ${event.name} via ${viaPastilleDateClef ? 'Date Clef' : 'Statut'}`);
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      console.log('❌ Bloqué : mode lecture seule');
      return;
    }
    
    console.log('✅ Administrateur confirmé, affichage de la confirmation...');
    
    // Ouvrir le dialog de confirmation et stocker la méthode de validation
    setEventToValidate(event);
    // Stocker si c'est via Date Clef dans l'état (on va créer un nouvel état)
    setValidationViaPastilleDateClef(viaPastilleDateClef);
    setConfirmDialogOpen(true);
  };

  const executeValidateAndArchive = async () => {
    if (!eventToValidate) return;
    
    setConfirmDialogOpen(false);
    setValidatingEventId(eventToValidate.id);
    
    try {
      const eventName = eventToValidate.nom || eventToValidate.name;
      
      // Vérifier si c'est une série contiguë
      if (seriesCount > 1) {
        // Validation de série (dates contiguës)
        console.log(`🔒 Validation de la série contiguë: "${eventName}" (${seriesCount} événements)`);
        
        const result = await validateEventSeries({ 
          data: { 
            eventName,
            estLectureSeule: lectureSeule,
            viaPastilleDateClef: validationViaPastilleDateClef
          } 
        });
        
        console.log(`✅ Série validée: ${result.validated} événements sur ${result.total}`);
        
        // Recharger pour obtenir les événements validés avec leurs nouvelles données
        const res = await getEvents();
        setEvents(res?.items ?? []);
        
        // Préparer la liste des événements validés pour le dialog
        const validatedEvents = res?.items
          .filter(e => (e.nom || e.name).trim().toLowerCase() === eventName.trim().toLowerCase())
          .map(e => ({
            id: e.id,
            name: e.name,
            date: (e as any).dateDeDbut ? new Date((e as any).dateDeDbut).toLocaleDateString('fr-FR') : null
          }))
          .sort((a, b) => (a.date || '').localeCompare(b.date || '')) || [];
        
        // Afficher le dialog de résultat
        setValidationResult({
          eventName,
          validated: result.validated,
          total: result.total,
          events: validatedEvents
        });
        setValidationResultDialogOpen(true);
      } else {
        // Validation individuelle (événement unique ou série non-contiguë)
        console.log(`🔒 Validation individuelle: "${eventName}"`);
        
        await validateAndArchiveEvent({ 
          data: { 
            id: eventToValidate.id, 
            estLectureSeule: lectureSeule,
            viaPastilleDateClef: validationViaPastilleDateClef
          } 
        });
        
        console.log('✅ Événement validé avec succès');
        
        // Recharger tous les événements pour voir les événements validés
        console.log('🔄 Rechargement des événements après validation...');
        const res = await getEvents();
        console.log(`📥 ${res?.items?.length ?? 0} événements rechargés`);
        
        // Vérifier l'événement qui vient d'être validé
        const validatedEvent = res?.items?.find(e => e.id === eventToValidate.id);
        if (validatedEvent) {
          console.log(`✅ Événement validé trouvé dans les données rechargées:`, {
            id: validatedEvent.id,
            nom: validatedEvent.nom,
            statut: validatedEvent.statut,
            validationTechnique: validatedEvent.validationTechnique,
            validationPolitique: validatedEvent.validationPolitique,
            validParDateClef: validatedEvent.validParDateClef
          });
        } else {
          console.warn(`⚠️ Événement validé NON trouvé après rechargement !`);
        }
        
        setEvents(res?.items ?? []);
      }
      
      // Si c'était l'événement sélectionné, mettre à jour ses données
      if (selectedEvent?.id === eventToValidate.id) {
        const res = await getEvents();
        const updatedEvent = res?.items.find(e => e.id === eventToValidate.id);
        if (updatedEvent) {
          setSelectedEvent(updatedEvent);
        }
      }
      
      // Refresh stats
      const newStats = await getEventStats();
      setStats(newStats);
    } catch (e) {
      console.error('❌ Erreur lors de la validation:', e);
    } finally {
      setValidatingEventId(null);
      setEventToValidate(null);
    }
  };

  const handleCleanDuplicates = async () => {
    // Garde en mode lecture seule
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }

    setCleaningDuplicates(true);
    try {
      console.log('🧹 Lancement du nettoyage des doublons...');
      const result = await findAndCleanDuplicates({ data: { dryRun: false, estLectureSeule: lectureSeule } });
      
      const deletedCount = 'deleted' in result ? result.deleted : 0;
      console.log(`✅ Nettoyage terminé: ${deletedCount} doublons supprimés, ${result.duplicatesFound} groupes`);
      
      setCleanupResult(result);
      setCleanupResultDialogOpen(true);
      
      // Recharger les événements
      const res = await getEvents({ 
        data: { 
          searchTerm: debouncedSearch || undefined, 
          quartier: filterQuartier === 'ALL' ? undefined : filterQuartier, 
          statut: filterStatut === 'ALL' ? undefined : filterStatut, 
          nature: filterNature === 'ALL' ? undefined : filterNature 
        } 
      });
      setEvents(res?.items ?? []);
      
      // Refresh stats
      const newStats = await getEventStats();
      setStats(newStats);
    } catch (e) {
      console.error('❌ Erreur lors du nettoyage des doublons:', e);
      alert('Erreur lors du nettoyage des doublons. Consultez la console pour plus de détails.');
    } finally {
      setCleaningDuplicates(false);
    }
  };

  const handleDatesUpdate = async () => {
    if (!selectedEvent) return;
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      return;
    }
    
    setUpdatingDates(true);
    try {
      await updateEventDates({ 
        data: { 
          id: selectedEvent.id, 
          dateDeDbut: newDateDeDebut || null, 
          dateDeFin: newDateDeFin || null,
          estLectureSeule: lectureSeule
        } 
      });
      
      // Rafraîchir tous les événements pour recalculer les conflits
      const res = await getEvents({ data: {} });
      setEvents(res?.items ?? []);
      
      // Mettre à jour l'événement sélectionné
      const updatedEvent = res?.items.find(e => e.id === selectedEvent.id);
      if (updatedEvent) {
        setSelectedEvent(updatedEvent);
      }
      
      // Sortir du mode édition
      setEditingDates(false);
    } catch (e) {
      console.error('Error updating dates:', e);
    } finally {
      setUpdatingDates(false);
    }
  };

  // Initialiser les dates quand on ouvre le sheet
  useEffect(() => {
    if (sheetOpen && selectedEvent) {
      setEditingDates(false);
      setNewDateDeDebut(selectedEvent.dateDeDbut ? new Date(selectedEvent.dateDeDbut).toISOString().split('T')[0] : '');
      setNewDateDeFin(selectedEvent.dateDeFin ? new Date(selectedEvent.dateDeFin).toISOString().split('T')[0] : '');
    }
  }, [sheetOpen, selectedEvent]);

  const handleSort = (field: 'nom' | 'dateDeDbut' | 'statut' | 'name') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Helper pour afficher l'icône de tri appropriée
  const getSortIcon = (field: 'nom' | 'dateDeDbut' | 'statut' | 'name') => {
    if (sortField !== field) {
      return <ArrowUpDown className="ml-2 h-3 w-3 opacity-50" />;
    }
    return sortDirection === 'asc' 
      ? <ArrowUp className="ml-2 h-3 w-3 text-primary" />
      : <ArrowDown className="ml-2 h-3 w-3 text-primary" />;
  };

  // Deduplicate and filter events - wrapped in useMemo to avoid infinite loops
  const uniqueEvents = useMemo(() => {
    const uniqueEventsMap = new Map<string, Event>();
    events.forEach(event => {
      const key = `${(event.nom || event.name).trim().toLowerCase()}_${event.dateDeDbut || ''}_${(event.lieu || '').trim().toLowerCase()}_${(event.organisateur || '').trim().toLowerCase()}`;
      if (!uniqueEventsMap.has(key)) {
        uniqueEventsMap.set(key, event);
      }
    });
    const deduped = Array.from(uniqueEventsMap.values());
    
    // ALWAYS filter cancelled events (they should never appear in any view)
    const filtered = deduped.filter(e => e.statut !== 'Annulée');
    
    console.log(`After deduplication & filter: ${filtered.length} events (${deduped.length - filtered.length} cancelled removed)`);
    return filtered;
  }, [events]);

  // Build conflict map (on non-cancelled events only)
  const conflictMap = useMemo(() => buildConflictMap(uniqueEvents), [uniqueEvents]);

  // Filter events - wrapped in useMemo to avoid recalculation on every render
  const eventsFiltered = useMemo(() => {
    // Filtrer les événements archivés SAUF si le toggle est activé OU si une recherche est active
    let filtered = uniqueEvents;
    const beforeArchiveFilter = filtered.length;
    if (!afficherArchives && !debouncedSearch) {
      filtered = filtered.filter(e => !estArchive(e));
      console.log(`[Liste] Archive filter: ${beforeArchiveFilter} → ${filtered.length} (removed ${beforeArchiveFilter - filtered.length} archived events)`);
    } else {
      console.log(`[Liste] Archive filter DISABLED (afficherArchives: ${afficherArchives}, debouncedSearch: "${debouncedSearch || ''}")`);
    }

    // Filtrer par plage de dates si spécifiée (filtre inclusif avec chevauchement)
    if (filterDateDebut || filterDateFin) {
      filtered = filtered.filter(e => {
        if (!e.dateDeDbut) return false;
        
        const normalizeDate = (d: Date) => {
          const normalized = new Date(d);
          normalized.setHours(0, 0, 0, 0);
          return normalized;
        };
        
        const eventDebut = normalizeDate(new Date(e.dateDeDbut));
        const eventFin = e.dateDeFin ? normalizeDate(new Date(e.dateDeFin)) : eventDebut;
        
        if (filterDateDebut) {
          const filterDebut = normalizeDate(new Date(filterDateDebut));
          if (eventFin < filterDebut) return false;
        }
        
        if (filterDateFin) {
          const filterFin = normalizeDate(new Date(filterDateFin));
          if (eventDebut > filterFin) return false;
        }
        
        return true;
      });
    }

    // Filter by conflicts if requested
    return showConflictsOnly
      ? filtered.filter(event => {
          if (estArbitre(event)) return false;
          const days = event.dateDeDbut ? [formatDateKey(new Date(event.dateDeDbut))] : [];
          return days.some(day => jourEnConflit(day, conflictMap));
        })
      : filtered;
  }, [uniqueEvents, afficherArchives, debouncedSearch, filterDateDebut, filterDateFin, showConflictsOnly, conflictMap]);

  // Sort events - wrapped in useMemo
  const sortedEvents = useMemo(() => {
    return [...eventsFiltered].sort((a, b) => {
      let aVal: string | Date | null = null;
      let bVal: string | Date | null = null;

      if (sortField === 'nom') {
        aVal = a.nom || a.name;
        bVal = b.nom || b.name;
      } else if (sortField === 'dateDeDbut') {
        aVal = a.dateDeDbut ? new Date(a.dateDeDbut) : null;
        bVal = b.dateDeDbut ? new Date(b.dateDeDbut) : null;
      } else if (sortField === 'statut') {
        aVal = a.statut || '';
        bVal = b.statut || '';
      } else if (sortField === 'name') {
        aVal = a.name;
        bVal = b.name;
      }

      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [eventsFiltered, sortField, sortDirection]);

  // Pagination : afficher seulement les N premiers événements
  const displayedEvents = sortedEvents.slice(0, displayLimit);
  const hasMore = sortedEvents.length > displayLimit;

  const getStatusIcon = (statut: string | null) => {
    switch (statut) {
      case 'Validée':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'Annulée':
        return <XCircle className="h-4 w-4" />;
      case 'À valider':
        return <Clock className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (event: Event) => {
    const isArchived = estArchive(event);
    const hasTechnique = event.validationTechnique === true;
    const hasPolitique = event.validationPolitique === true;
    const isValidating = validatingEventId === event.id;
    
    if (isArchived) {
      return <Badge variant="secondary">Archivée</Badge>;
    }
    
    if (hasTechnique && hasPolitique) {
      return <Badge className="bg-green-600 hover:bg-green-700 text-white">Validée</Badge>;
    }
    
    // Badge cliquable pour valider et archiver
    if (!lectureSeule) {
      return (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('🔵 Clic sur le badge Statut détecté');
            handleQuickValidateAndArchive(event, e, false);
          }}
          disabled={isValidating}
          className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium bg-destructive text-white hover:bg-destructive/80 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Cliquez pour valider cet événement (statut + validations)"
        >
          {isValidating ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Traitement...
            </>
          ) : (
            'Non validée'
          )}
        </button>
      );
    }
    
    return <Badge variant="destructive">Non validée</Badge>;
  };

  const getDateClefBadge = (event: Event) => {
    const isValidating = validatingEventId === event.id;
    const isArchived = estArchive(event);
    const hasTechnique = event.validationTechnique === true;
    const hasPolitique = event.validationPolitique === true;
    const isValidated = hasTechnique && hasPolitique;
    const valideParDateClef = event.validParDateClef === true; // Validé via pastille bleue
    
    // Si validée via la pastille Date Clef, afficher badge bleu
    if ((isValidated || isArchived) && valideParDateClef) {
      return <Badge className="bg-blue-600 hover:bg-blue-700 text-white">✓ Date Clef</Badge>;
    }
    
    // Si validé par une autre méthode (pastille Statut), afficher —
    if (isValidated || isArchived) {
      return <span className="text-muted-foreground">—</span>;
    }
    
    // Badge cliquable pour TOUS les événements non validés (administrateurs)
    if (!lectureSeule) {
      return (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('🔵 Clic sur la pastille Date Clef détecté');
            handleQuickValidateAndArchive(event, e, true);
          }}
          disabled={isValidating}
          className="inline-flex items-center gap-1 rounded-full border border-transparent px-2 py-0.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Date Clef : Cliquez pour valider automatiquement"
        >
          {isValidating ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              Validation...
            </>
          ) : (
            '📅 Date Clef'
          )}
        </button>
      );
    }
    
    // Mode lecture seule : badge bleu non cliquable
    return <Badge className="bg-blue-600 text-white">📅 Date Clef</Badge>;
  };

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm no-pdf">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-foreground">
                Liste des Événements
              </h1>
              <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Ville de Dunkerque
              </p>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Badge mode lecture seule */}
              {lectureSeule && (
                <Badge variant="outline" className="gap-1.5 text-xs px-3 py-1.5 bg-muted" title="Cette vue publique ne permet aucune modification des données">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/50" />
                  Consultation seule
                </Badge>
              )}
              
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Total</div>
                <div className="text-2xl font-medium text-foreground">
                  {loading ? '...' : eventsFiltered.length}
                </div>
              </div>
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-green-600">Validés</div>
                <div className="text-2xl font-medium text-green-600">
                  {loading ? '...' : eventsFiltered.filter(e => e.validationTechnique === true && e.validationPolitique === true).length}
                </div>
              </div>
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-amber-600">En attente</div>
                <div className="text-2xl font-medium text-amber-600">
                  {loading ? '...' : eventsFiltered.filter(e => !(e.validationTechnique === true && e.validationPolitique === true)).length}
                </div>
              </div>
            </div>
          </div>
          
          {/* Indicateur de chargement des données */}
          {!loading && events.length > 0 && (
            <div className="mt-3 text-center">
              <p className="text-xs text-muted-foreground">
                {events.length} événements chargés depuis le serveur
                {events.length >= 2500 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    ⚠ Limite atteinte - certains événements peuvent ne pas être affichés
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="border-b bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col gap-3">
            {/* Première ligne : recherche par nom */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher un événement par nom..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 font-mono text-sm"
              />
            </div>
            
            {/* Deuxième ligne : recherche par date */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <div className="flex items-center gap-2 flex-1">
                <CalendarIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex flex-col sm:flex-row gap-2 flex-1">
                  <div className="flex items-center gap-2 flex-1">
                    <label htmlFor="date-debut-filter" className="text-xs font-mono text-muted-foreground whitespace-nowrap">Du</label>
                    <Input
                      id="date-debut-filter"
                      type="date"
                      value={filterDateDebut}
                      onChange={(e) => setFilterDateDebut(e.target.value)}
                      className="font-mono text-xs h-9"
                      placeholder="Date début"
                    />
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <label htmlFor="date-fin-filter" className="text-xs font-mono text-muted-foreground whitespace-nowrap">Au</label>
                    <Input
                      id="date-fin-filter"
                      type="date"
                      value={filterDateFin}
                      onChange={(e) => setFilterDateFin(e.target.value)}
                      className="font-mono text-xs h-9"
                      placeholder="Date fin"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Troisième ligne : autres filtres */}
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={filterQuartier}
                onChange={(e) => setFilterQuartier(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Tous les quartiers</option>
                {filterOptions?.quartiers.map(q => (
                  <option key={q.label} value={q.label}>
                    {q.label} ({q.count})
                  </option>
                ))}
              </select>

              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Tous les statuts</option>
                {filterOptions?.statuts.map(s => (
                  <option key={s.label} value={s.label}>
                    {s.label} ({s.count})
                  </option>
                ))}
              </select>

              <select
                value={filterNature}
                onChange={(e) => setFilterNature(e.target.value)}
                className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ALL">Toutes natures</option>
                {filterOptions?.natures.map(n => (
                  <option key={n.label} value={n.label}>
                    {n.label} ({n.count})
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-background h-9">
                <Checkbox 
                  id="show-archives-list" 
                  checked={afficherArchives}
                  onCheckedChange={(checked) => setAfficherArchives(checked === true)}
                />
                <Label htmlFor="show-archives-list" className="font-mono text-xs cursor-pointer">
                  Afficher les archives
                </Label>
              </div>

              <div className="flex items-center gap-2 rounded-md border px-3 py-2 bg-background">
                <Checkbox 
                  id="conflicts-only" 
                  checked={showConflictsOnly}
                  onCheckedChange={(checked) => setShowConflictsOnly(checked === true)}
                />
                <Label htmlFor="conflicts-only" className="font-mono text-xs cursor-pointer">
                  Conflits uniquement
                </Label>
              </div>

              {/* Bouton nettoyage des doublons (seulement pour administrateurs) */}
              {!lectureSeule && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanDuplicates}
                  disabled={cleaningDuplicates}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  {cleaningDuplicates ? 'Nettoyage...' : 'Nettoyer doublons'}
                </Button>
              )}

              {/* Bouton export PDF */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={isExportingPdf || sortedEvents.length === 0}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                {isExportingPdf ? 'Export...' : 'PDF'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                disabled={isExportingXlsx || sortedEvents.length === 0}
                className="gap-2"
              >
                <FileDown className="h-4 w-4" />
                {isExportingXlsx ? 'Export...' : 'Excel'}
              </Button>

              {(filterQuartier !== 'ALL' || filterStatut !== 'ALL' || filterNature !== 'ALL' || searchTerm || filterDateDebut || filterDateFin || showConflictsOnly || afficherArchives) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFilterQuartier('ALL');
                    setFilterStatut('ALL');
                    setFilterNature('ALL');
                    setSearchTerm('');
                    setFilterDateDebut('');
                    setFilterDateFin('');
                    setShowConflictsOnly(false);
                    setAfficherArchives(false);
                  }}
                  className="font-mono text-xs"
                >
                  Réinitialiser tous les filtres
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <ChargementEvenements />
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
            <p className="text-sm text-destructive">
              Une erreur est survenue lors du chargement des événements.
            </p>
          </div>
        ) : (
          <div ref={tableRef} className="bg-background">
            {/* En-tête pour le PDF */}
            <div className="mb-6 border-b pb-4">
              <h1 className="text-2xl font-bold mb-2">Calendrier des Événements - Dunkerque</h1>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Date d'export : {new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' })}</div>
                {(filterDateDebut || filterDateFin) && (
                  <div className="font-medium text-foreground">
                    {filterDateDebut && filterDateFin ? (
                      <>Période : du {new Date(filterDateDebut).toLocaleDateString('fr-FR')} au {new Date(filterDateFin).toLocaleDateString('fr-FR')}</>
                    ) : filterDateDebut ? (
                      <>Période : à partir du {new Date(filterDateDebut).toLocaleDateString('fr-FR')}</>
                    ) : (
                      <>Période : jusqu'au {new Date(filterDateFin).toLocaleDateString('fr-FR')}</>
                    )}
                  </div>
                )}
                {searchTerm && <div>Recherche : "{searchTerm}"</div>}
                {filterQuartier !== 'ALL' && <div>Quartier : {filterQuartier}</div>}
                {filterNature !== 'ALL' && <div>Nature : {filterNature}</div>}
                {filterStatut !== 'ALL' && <div>Statut : {filterStatut}</div>}
                <div className="font-semibold text-foreground mt-2">
                  Total : {sortedEvents.length} événement{sortedEvents.length !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {/* Indicateur de filtrage par date */}
            {(filterDateDebut || filterDateFin) && (
              <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarIcon className="h-4 w-4" />
                <span className="font-mono">
                  {filterDateDebut && filterDateFin ? (
                    <>Événements du <strong>{new Date(filterDateDebut).toLocaleDateString('fr-FR')}</strong> au <strong>{new Date(filterDateFin).toLocaleDateString('fr-FR')}</strong> : <strong>{sortedEvents.length}</strong> résultat{sortedEvents.length !== 1 ? 's' : ''}</>
                  ) : filterDateDebut ? (
                    <>Événements à partir du <strong>{new Date(filterDateDebut).toLocaleDateString('fr-FR')}</strong> : <strong>{sortedEvents.length}</strong> résultat{sortedEvents.length !== 1 ? 's' : ''}</>
                  ) : (
                    <>Événements jusqu'au <strong>{new Date(filterDateFin).toLocaleDateString('fr-FR')}</strong> : <strong>{sortedEvents.length}</strong> résultat{sortedEvents.length !== 1 ? 's' : ''}</>
                  )}
                </span>
              </div>
            )}
            
            <div className="overflow-x-auto rounded-xl border bg-card/80 backdrop-blur-sm shadow-[0_0_20px_rgba(59,130,246,0.1)] ring-1 ring-border/50">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[140px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('name')}
                      className="font-mono text-xs uppercase tracking-wider"
                    >
                      ID Événement
                      {getSortIcon('name')}
                    </Button>
                  </TableHead>
                  <TableHead className="min-w-[280px] max-w-[400px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('nom')}
                      className="font-mono text-xs uppercase tracking-wider"
                    >
                      Événement
                      {getSortIcon('nom')}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('dateDeDbut')}
                      className="font-mono text-xs uppercase tracking-wider"
                    >
                      Dates
                      {getSortIcon('dateDeDbut')}
                    </Button>
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Quartier</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Nature</TableHead>
                  <TableHead>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort('statut')}
                      className="font-mono text-xs uppercase tracking-wider"
                    >
                      Statut
                      {getSortIcon('statut')}
                    </Button>
                  </TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Date Clef</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Validation</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Conflit</TableHead>
                  <TableHead className="font-mono text-xs uppercase tracking-wider">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center">
                      <p className="text-sm text-muted-foreground">Aucun événement trouvé</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedEvents.map((event) => (
                    <TableRow
                      key={event.id}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                      onClick={() => {
                        setSelectedEvent(event);
                        setSheetOpen(true);
                      }}
                    >
                      <TableCell className="font-mono text-xs font-semibold text-primary">
                        {event.name}
                      </TableCell>
                      <TableCell className="min-w-[280px] max-w-[400px]">
                        <div className="font-medium truncate" title={event.nom || event.name}>
                          {event.nom || event.name}
                        </div>
                        {event.lieu && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate" title={event.lieu}>
                              {event.lieu}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {(() => {
                          // Afficher la date réelle de cette occurrence spécifique
                          const startDate = event.dateDeDbut?.toLocaleDateString('fr-FR');
                          const endDate = event.dateDeFin?.toLocaleDateString('fr-FR');
                          
                          if (!startDate && !endDate) return '—';
                          if (!endDate || startDate === endDate) return startDate || '—';
                          
                          return (
                            <div>
                              <div>{startDate}</div>
                              <div className="text-xs text-muted-foreground">
                                → {endDate}
                              </div>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        {event.quartier ? (
                          <Badge variant="secondary" className="text-xs truncate max-w-full" title={event.quartier}>
                            {event.quartier}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {event.nature ? (
                          <Badge variant="outline" className="text-xs truncate max-w-full" title={event.nature}>
                            {event.nature}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(event)}
                      </TableCell>
                      <TableCell>
                        {getDateClefBadge(event)}
                      </TableCell>
                      <TableCell>
                        <ValidationBadge 
                          validationTechnique={event.validationTechnique}
                          validationPolitique={event.validationPolitique}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          // Les événements arbitrés n'affichent pas de badge de conflit
                          if (estArbitre(event)) return '—';
                          
                          const conflicts = getEventConflicts(event, conflictMap);
                          if (conflicts.length === 0) return '—';
                          
                          // Ne compter que les événements NON arbitrés (incluant celui-ci)
                          const conflictsNonArbitres = conflicts.filter(c => !estArbitre(c));
                          const totalNonArbitres = conflictsNonArbitres.length + 1; // +1 for the event itself (non arbitré)
                          const totalOnSameDays = conflicts.length + 1;
                          
                          // Si tous les autres événements sont arbitrés, pas de badge
                          if (conflictsNonArbitres.length === 0) return '—';
                          
                          const severity = getDaySeverity(totalNonArbitres);
                          const color = getSeverityColor(severity);
                          const otherEventNames = conflictsNonArbitres.map(c => c.nom || c.name).join(', ');
                          
                          return (
                            <Badge 
                              variant="outline" 
                              className="text-xs font-mono"
                              style={{ borderColor: color, color }}
                              title={`Autres événements non arbitrés ce jour: ${otherEventNames}. ${totalOnSameDays} événement${totalOnSameDays > 1 ? 's' : ''} au total ce jour, dont ${totalNonArbitres} à arbitrer`}
                            >
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              {totalNonArbitres}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setSheetOpen(true);
                          }}
                          className="font-mono text-xs"
                        >
                          Détails
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            </div>

            {/* Pagination - Bouton "Charger plus" */}
            {hasMore && (
              <div className="mt-6 flex flex-col items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Affichage de <span className="font-semibold text-foreground">{displayedEvents.length}</span> sur{' '}
                  <span className="font-semibold text-foreground">{sortedEvents.length}</span> événements
                </p>
                <Button
                  onClick={() => setDisplayLimit(prev => prev + 100)}
                  variant="outline"
                  size="lg"
                  className="gap-2"
                >
                  <ArrowDown className="h-4 w-4" />
                  Charger 100 événements de plus
                </Button>
              </div>
            )}

            {/* Indicateur quand tous les événements sont affichés */}
            {sortedEvents.length > 0 && !hasMore && displayedEvents.length > 100 && (
              <div className="mt-6 text-center">
                <p className="text-sm text-muted-foreground">
                  ✓ Tous les {sortedEvents.length} événements sont affichés
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event Details Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl font-medium">
                  {selectedEvent.nom || selectedEvent.name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 font-mono text-sm font-semibold text-primary">
                  <FileText className="h-4 w-4" />
                  {selectedEvent.name}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* Alerte mode consultation */}
                {lectureSeule && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-5 w-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                        <span className="text-blue-600 text-xs font-bold">ℹ</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-blue-900 text-sm">Mode consultation seule</div>
                        <div className="text-blue-700 text-xs mt-1">
                          Vous consultez cette application en mode lecture seule. Aucune modification n'est possible.
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-6 space-y-6">
                {/* Status Badge if cancelled */}
                {selectedEvent.statut === 'Annulée' && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-3">
                    <Badge variant="destructive" className="text-sm gap-1.5">
                      <XCircle className="h-3.5 w-3.5" />
                      Événement annulé
                    </Badge>
                  </div>
                )}
                
                {/* Status Badge if archived */}
                {estArchive(selectedEvent) && selectedEvent.statut !== 'Annulée' && (
                  <div className="rounded-lg border bg-muted/50 p-3">
                    <Badge variant="secondary" className="text-sm">
                      ⏱️ Archivée — Événement passé
                    </Badge>
                  </div>
                )}
                
                {/* Date Clef Badge - affiché si validé via pastille Date Clef */}
                {selectedEvent.validParDateClef && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center mt-0.5">
                        <span className="text-white text-xs">📅</span>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-blue-900 text-sm">Date Clef — Validé par clic Date Clef</div>
                        <div className="text-blue-700 text-xs mt-1">
                          Cet événement a été validé en cliquant sur la pastille "Date Clef".
                          {(selectedEvent.validationTechnique && selectedEvent.validationPolitique) && (
                            <span className="font-semibold"> ✓ Validé</span>
                          )}
                        </div>
                      </div>
                      {(selectedEvent.validationTechnique && selectedEvent.validationPolitique) && (
                        <Badge className="bg-green-600 hover:bg-green-700 text-white">✓</Badge>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Status Update - Masqué complètement en mode consultation */}
                {!lectureSeule && (
                  <div className="rounded-lg border bg-card/50 p-4 backdrop-blur-sm">
                    <div className="mb-3 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                      Statut de l'événement
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <select
                        value={selectedEvent.statut || 'À valider'}
                        onChange={(e) => handleStatusUpdate(e.target.value)}
                        disabled={updatingStatus}
                        className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      >
                        <option value="À valider">À valider</option>
                        <option value="Validée">Validée</option>
                        <option value="Annulée">❌ Annulée</option>
                        <option value="Brouillon">Brouillon</option>
                      </select>
                      {getStatusIcon(selectedEvent.statut)}
                    </div>
                    
                    {/* Bouton d'annulation rapide */}
                    {selectedEvent.statut !== 'Annulée' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm(`Êtes-vous sûr de vouloir annuler l'événement "${selectedEvent.nom || selectedEvent.name}" ?\n\nCette action changera le statut à "Annulée".`)) {
                            handleStatusUpdate('Annulée');
                          }
                        }}
                        disabled={updatingStatus}
                        className="w-full gap-2"
                      >
                        {updatingStatus ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                            Annulation en cours...
                          </>
                        ) : (
                          <>
                            <XCircle className="h-4 w-4" />
                            Annuler cet événement
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {/* Event Details */}
                <div className="space-y-4">
                  <div className="border rounded-lg p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                        <CalendarIcon className="h-3.5 w-3.5" />
                        Dates de l'événement
                      </div>
                      {!lectureSeule && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDates(!editingDates)}
                          disabled={updatingDates}
                        >
                          {editingDates ? 'Annuler' : 'Modifier'}
                        </Button>
                      )}
                    </div>
                    
                    {!editingDates ? (
                      <div className="text-sm">
                        Du {selectedEvent.dateDeDbut ? new Date(selectedEvent.dateDeDbut).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                        {selectedEvent.dateDeFin && (
                          <> au {new Date(selectedEvent.dateDeFin).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label htmlFor="date-debut-list" className="text-xs">Date de début</Label>
                            <Input
                              id="date-debut-list"
                              type="date"
                              value={newDateDeDebut}
                              onChange={(e) => setNewDateDeDebut(e.target.value)}
                              disabled={updatingDates}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="date-fin-list" className="text-xs">Date de fin</Label>
                            <Input
                              id="date-fin-list"
                              type="date"
                              value={newDateDeFin}
                              onChange={(e) => setNewDateDeFin(e.target.value)}
                              disabled={updatingDates}
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <Button
                          onClick={handleDatesUpdate}
                          disabled={updatingDates || !newDateDeDebut}
                          size="sm"
                          className="w-full"
                        >
                          {updatingDates ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent mr-2" />
                              Mise à jour...
                            </>
                          ) : (
                            'Enregistrer les nouvelles dates'
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {selectedEvent.lieu && (
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        Lieu
                      </div>
                      <div className="text-sm">{selectedEvent.lieu}</div>
                    </div>
                  )}

                  {selectedEvent.quartier && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Quartier
                      </div>
                      <Badge variant="secondary">{selectedEvent.quartier}</Badge>
                    </div>
                  )}

                  {selectedEvent.nature && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Nature
                      </div>
                      <Badge variant="secondary">{selectedEvent.nature}</Badge>
                    </div>
                  )}

                  {selectedEvent.type && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Type
                      </div>
                      <Badge variant="outline">{selectedEvent.type}</Badge>
                    </div>
                  )}

                  {selectedEvent.pilote && selectedEvent.pilote.length > 0 && (
                    <div>
                      <div className="mb-1 flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        <Users className="h-3 w-3" />
                        Pilote
                      </div>
                      <div className="text-sm">{selectedEvent.pilote.join(', ')}</div>
                    </div>
                  )}

                  {selectedEvent.directionPilote && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Direction Pilote
                      </div>
                      <div className="text-sm">{selectedEvent.directionPilote}</div>
                    </div>
                  )}

                  {selectedEvent.organisateur && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Organisateur
                      </div>
                      <div className="text-sm">{selectedEvent.organisateur}</div>
                    </div>
                  )}

                  {selectedEvent.niveau && (
                    <div>
                      <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        Niveau
                      </div>
                      <Badge variant="outline">{selectedEvent.niveau}</Badge>
                    </div>
                  )}

                  <div className="flex gap-4">
                    {selectedEvent.tardive && (
                      <div>
                        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Tardive
                        </div>
                        <Badge variant={selectedEvent.tardive === 'Oui' ? 'destructive' : 'secondary'}>
                          {selectedEvent.tardive}
                        </Badge>
                      </div>
                    )}

                    {selectedEvent.reprog && (
                      <div>
                        <div className="mb-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                          Reprog.
                        </div>
                        <Badge variant={selectedEvent.reprog === 'Oui' ? 'destructive' : 'secondary'}>
                          {selectedEvent.reprog}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* AlertDialog pour confirmation de validation et archivage */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ✅ Valider {seriesCount > 1 ? `la série complète (${seriesCount} événements)` : 'cet événement'} ?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <div className="font-medium text-foreground">
                Événement : {eventToValidate?.nom || eventToValidate?.name}
              </div>
              
              {seriesCount > 1 && (
                <div className="p-3 rounded-md bg-blue-50 border border-blue-200">
                  <div className="flex items-start gap-2">
                    <CalendarIcon className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-900">
                      <div className="font-semibold">Série contiguë détectée</div>
                      <div className="mt-1">
                        Cet événement se déroule sur <strong>{seriesCount} jours consécutifs</strong>.
                        <br />
                        <strong>Toutes les dates de la série seront validées ensemble.</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="text-sm">
                Cette action va :
                <ul className="mt-2 list-inside list-decimal space-y-1">
                  <li>Mettre le statut à "Validée" {seriesCount > 1 ? `(${seriesCount} événements)` : ''}</li>
                  <li>Cocher les validations Politique et Technique {seriesCount > 1 ? `(${seriesCount} événements)` : ''}</li>
                  {seriesCount > 1 && (
                    <li className="font-medium text-blue-700">Valider automatiquement toutes les dates de la série</li>
                  )}
                </ul>
                {seriesCount === 1 && (
                  <div className="mt-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                    💡 L'événement restera visible et sera marqué comme "Archivée" si sa date est passée
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={executeValidateAndArchive}>
              {seriesCount > 1 ? `Valider les ${seriesCount} événements` : 'Confirmer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de résultat du nettoyage des doublons */}
      <AlertDialog open={cleanupResultDialogOpen} onOpenChange={setCleanupResultDialogOpen}>
        <AlertDialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>🧹 Nettoyage des doublons terminé</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {cleanupResult && (
                <>
                  <div className="grid grid-cols-3 gap-4 p-4 rounded-md bg-muted">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-foreground">{cleanupResult.duplicatesFound}</div>
                      <div className="text-xs text-muted-foreground">Groupes de doublons</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{'deleted' in cleanupResult ? cleanupResult.deleted : 0}</div>
                      <div className="text-xs text-muted-foreground">Doublons supprimés</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-red-600">{'failed' in cleanupResult ? cleanupResult.failed : 0}</div>
                      <div className="text-xs text-muted-foreground">Échecs</div>
                    </div>
                  </div>

                  {cleanupResult.details && cleanupResult.details.length > 0 && (
                    <div className="space-y-2">
                      <div className="font-medium text-sm text-foreground">Détails des doublons nettoyés :</div>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {cleanupResult.details.map((detail, idx) => (
                          <div key={idx} className="p-3 rounded-md border bg-card text-xs">
                            <div className="font-semibold text-foreground">{detail.nom}</div>
                            <div className="text-muted-foreground">
                              {detail.dateDeDebut} • {detail.lieu || 'Lieu non spécifié'}
                            </div>
                            <div className="mt-2 space-y-1">
                              <div className="text-green-600">✓ Conservé : {detail.kept}</div>
                              {detail.deleted.map((d, i) => (
                                <div key={i} className="text-red-600">✗ Supprimé : {d}</div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {'deleted' in cleanupResult && cleanupResult.deleted === 0 && cleanupResult.duplicatesFound === 0 && (
                    <div className="p-4 rounded-md bg-green-50 text-green-700 text-sm">
                      ✨ Aucun doublon détecté. Le board est propre !
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Fermer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de résultat de validation de série */}
      <AlertDialog open={validationResultDialogOpen} onOpenChange={setValidationResultDialogOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>✅ Validation de série terminée</AlertDialogTitle>
            <AlertDialogDescription className="space-y-4">
              {validationResult && (
                <>
                  <div className="font-medium text-foreground text-base">
                    {validationResult.validated} / {validationResult.total} événements validés
                  </div>
                  
                  <div className="p-3 rounded-md bg-green-50 border border-green-200">
                    <div className="text-sm font-semibold text-green-900 mb-2">
                      Événement : {validationResult.eventName}
                    </div>
                    <div className="text-sm text-green-800">
                      Toutes les dates de la série contiguë ont été validées avec succès.
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="font-medium text-sm text-foreground">
                      Liste des événements validés :
                    </div>
                    <div className="max-h-60 overflow-y-auto space-y-1 p-3 bg-muted rounded-md border">
                      {validationResult.events.map((evt) => (
                        <div 
                          key={evt.id} 
                          className="flex items-center gap-2 py-1.5 px-2 rounded bg-background text-sm"
                        >
                          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          <span className="font-mono text-xs text-muted-foreground">{evt.name}</span>
                          {evt.date && (
                            <span className="ml-auto font-semibold text-red-600">
                              {evt.date}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {validationResult.validated < validationResult.total && (
                    <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
                      <div className="text-sm text-amber-900">
                        ⚠️ Attention : {validationResult.total - validationResult.validated} événement(s) 
                        n'ont pas pu être validés. Consultez les logs pour plus de détails.
                      </div>
                    </div>
                  )}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Fermer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
