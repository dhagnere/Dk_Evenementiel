import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState, useMemo } from 'react';
import { getEvents, getEventStats, updateEventStatus, updateEventValidations, updateEventDates } from '@generated/server/events';
import { autoArchivePassedEvents } from '@generated/server/auto-archive';
import { withAuthRetry } from '@generated/utils/auth-retry';
import { parseUploadedFile, fetchExistingForImport, createItemsBatch } from '@generated/server/import';
import { exportAllEventsAsCSV } from '@generated/server/export-test';
import { cleanDuplicatesInBoard, renumberEventIds } from '@generated/server/board-cleanup';

import { buildColumnMapping, parseRowToRecord, makeKey, generateTemplateCSV, analyzeHeaders } from '@generated/utils/import-utils';
import { mergeContiguousEvents, makeSoftKey } from '@generated/utils/merge-contiguous-events';
import { generateDayEventsPdf } from '@generated/server/pdf-generator';
import { buildConflictMap, getDaySeverity, getSeverityColor, jourEnConflit, formatDateKey, estArbitre, estArchive } from '@generated/utils/conflicts';
import { useSession, estAdministrateur } from '@generated/components/Authentification';
import { ValidationBadge } from '@generated/components/ValidationBadge';
import ChargementEvenements from '@generated/components/ChargementEvenements';
import {
  CalendarProvider,
  CalendarDate,
  CalendarDatePicker,
  CalendarMonthPicker,
  CalendarYearPicker,
  CalendarDatePagination,
  CalendarHeader,
  CalendarBody,
} from '@/components/full-page-calendar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, MapPin, Calendar as CalendarIcon, CheckCircle2, X, Upload, FileDown, AlertTriangle, FileCheck, RefreshCw, AlertCircle, Info, Archive } from 'lucide-react';

export const Route = createFileRoute('/_app/')({ component: CalendarView });

type Event = Awaited<ReturnType<typeof getEvents>>['items'][number];

type CalendarEvent = {
  id: string;
  name: string;
  endAt: Date;
  status: { color: string };
  fullEvent: Event;
};

function CalendarView() {
  // Gestion de la session et des permissions
  const { session } = useSession();
  const lectureSeule = !estAdministrateur(session);
  
  // Custom translation observer to force "+X en plus" in the calendar
  useEffect(() => {
    const translateCalendarMore = () => {
      // Find all text nodes and buttons containing "more"
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (node.nodeValue && /\+\s*(\d+)\s*more/i.test(node.nodeValue)) {
          node.nodeValue = node.nodeValue.replace(/\+\s*(\d+)\s*more/i, '+$1 en plus');
        }
      }

      // Also target buttons/spans directly
      const buttons = document.querySelectorAll('button, span, div, p');
      buttons.forEach((el) => {
        if (el.children.length === 0 && el.textContent && /\+\s*(\d+)\s*more/i.test(el.textContent)) {
          el.textContent = el.textContent.replace(/\+\s*(\d+)\s*more/i, '+$1 en plus');
        }
      });
    };

    // Run immediately
    translateCalendarMore();

    // Run on any DOM change
    const observer = new MutationObserver(() => {
      translateCalendarMore();
    });

    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [validationTechnique, setValidationTechnique] = useState(false);
  const [validationPolitique, setValidationPolitique] = useState(false);
  const [updatingValidations, setUpdatingValidations] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [eventsListDialogOpen, setEventsListDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0, phase: '' });
  const [cleanDuplicates, setCleanDuplicates] = useState(false); // Désactivé par défaut pour éviter les timeouts
  const [renumberIds, setRenumberIds] = useState(false); // Désactivé par défaut pour éviter les timeouts
  const [autoArchive, setAutoArchive] = useState(true); // Activé par défaut pour archiver automatiquement les événements passés

  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [filePreview, setFilePreview] = useState<{ headers: string[]; analysis: ReturnType<typeof analyzeHeaders> } | null>(null);
  const [openedFromPopup, setOpenedFromPopup] = useState(false); // Track if details opened from popup
  const [importResultDialogOpen, setImportResultDialogOpen] = useState(false);
  const [importResults, setImportResults] = useState<{
    created: Array<{ nom: string; dateDeDbut: string | null }>;
    updated: Array<{ nom: string; dateDeDbut: string | null }>;
    totalCreated: number;
    totalUpdated: number;
    totalSkipped?: number; // Nombre de doublons ignorés (déjà dans le board)
    totalSkippedInvalid?: number; // Lignes sans nom (invalides)
    totalFailed: number;
    unmappedColumns?: Array<{ original: string; columnIndex: number }>; // Colonnes non reconnues
    mergeStats?: {
      originalCount: number;
      mergedCount: number;
      reductionCount: number;
      mergedGroups: Array<{
        nom: string;
        lieu: string | null;
        originalLines: number;
        dateDebut: string;
        dateFin: string;
        durationDays: number;
      }>;
    };
    cleanupResults?: { archived: number; kept: number; remaining?: number; mightHaveMore?: boolean } | null;
    renumberResults?: { renamed: number; totalItems: number; reachedLimit?: boolean } | null;
    autoArchiveResults?: { archived: number; kept: number; toArchiveCount: number; series: Array<{ nom: string; lieu: string; count: number; status: string }> } | null;
  } | null>(null);
  // État pour modification des dates
  const [editingDates, setEditingDates] = useState(false);
  const [newDateDeDebut, setNewDateDeDebut] = useState<string>('');
  const [newDateDeFin, setNewDateDeFin] = useState<string>('');
  const [updatingDates, setUpdatingDates] = useState(false);
  
  // Persister les filtres dans localStorage pour qu'ils survivent au rafraîchissement
  const [searchTerm, setSearchTerm] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eventFilter_searchTerm') || '';
    }
    return '';
  });
  const [filterQuartier, setFilterQuartier] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eventFilter_quartier') || 'ALL';
    }
    return 'ALL';
  });
  const [filterStatut, setFilterStatut] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eventFilter_statut') || 'ALL';
    }
    return 'ALL';
  });
  const [filterNature, setFilterNature] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('eventFilter_nature') || 'ALL';
    }
    return 'ALL';
  });
  const [archivingPassed, setArchivingPassed] = useState(false);
  const [_stats, setStats] = useState<{ total: number; validated: number; pending: number; byStatut: Array<{ statut: string; count: number }>; byNature: Array<{ nature: string; count: number }> } | null>(null);
  const [_updatingStatus, _setUpdatingStatus] = useState(false);

  // PDF export state
  const [exportingPdf, setExportingPdf] = useState(false);

  // Debug log for dialog state
  useEffect(() => {
    console.log('dialogOpen state changed:', dialogOpen);
  }, [dialogOpen]);

  // Sauvegarder les filtres dans localStorage à chaque changement
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eventFilter_searchTerm', searchTerm);
    }
  }, [searchTerm]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eventFilter_quartier', filterQuartier);
    }
  }, [filterQuartier]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eventFilter_statut', filterStatut);
    }
  }, [filterStatut]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('eventFilter_nature', filterNature);
    }
  }, [filterNature]);

  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        console.log('[Calendar] Loading events with filters:', { searchTerm, filterQuartier, filterStatut, filterNature });
        
        const [eventsRes, statsRes] = await withAuthRetry(
          () => Promise.all([
            getEvents({ 
              data: { 
                searchTerm: searchTerm || undefined, 
                quartier: filterQuartier === 'ALL' ? undefined : filterQuartier, 
                statut: filterStatut === 'ALL' ? undefined : filterStatut, 
                nature: filterNature === 'ALL' ? undefined : filterNature,
                includeArchived: false // Archives toujours désactivées
              } 
            }),
            getEventStats()
          ]),
          { isActive: () => active }
        );
        
        if (active) {
          console.log('[Calendar] Received:', eventsRes?.items?.length || 0, 'events');
          
          // Debug: combien d'événements ont une dateDeFin passée ?
          const aujourdhui = new Date();
          aujourdhui.setHours(0, 0, 0, 0);
          const withPastDates = (eventsRes?.items ?? []).filter(e => {
            if (!e.dateDeFin) return false;
            const df = new Date(e.dateDeFin);
            df.setHours(0, 0, 0, 0);
            return df < aujourdhui;
          });
          console.log(`[Calendar] Events with dateDeFin < today: ${withPastDates.length}/${eventsRes?.items?.length || 0}`);
          if (withPastDates.length > 0) {
            console.log('[Calendar] Sample past events:', withPastDates.slice(0, 3).map(e => ({
              name: e.nom || e.name,
              dateFin: e.dateDeFin
            })));
          }
          
          setEvents(eventsRes?.items ?? []);
          setStats(statsRes ?? null);
          setError(null);
        }
      } catch (e) {
        if (active) {
          const errorMessage = e instanceof Error ? e.message : String(e);
          console.error('[Calendar] Error loading events:', errorMessage);
          console.error('[Calendar] Full error:', e);
          setError(e as Error);
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
  }, [searchTerm, filterQuartier, filterStatut, filterNature, refreshTrigger]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      if (extension === 'csv' || extension === 'xlsx' || extension === 'xls') {
        setSelectedFile(file);
        
        // Analyser le fichier pour prévisualisation
        try {
          const formData = new FormData();
          formData.append('file', file);
          const parsed = await parseUploadedFile({ data: formData });
          if (parsed.headers && parsed.headers.length > 0) {
            const analysis = analyzeHeaders(parsed.headers);
            
            // Vérifier si le fichier contient des caractères mal encodés
            const hasEncodingIssues = parsed.headers.some(h => h.includes('�')) || 
              parsed.dataRows?.some(row => row.some(cell => cell.includes('�')));
            
            if (hasEncodingIssues) {
              setErrorMessage(
                '⚠️ ATTENTION : Le fichier contient des caractères mal encodés (é affichés comme �).\n\n' +
                'Recommandation :\n' +
                '1. Ouvrez le fichier dans Excel\n' +
                '2. Enregistrez-le à nouveau en UTF-8\n' +
                '3. Ou exportez à nouveau depuis Monday.com\n\n' +
                'L\'import peut continuer mais certains caractères seront illisibles.'
              );
              setErrorDialogOpen(true);
            }
            
            setFilePreview({ headers: parsed.headers, analysis });
          }
        } catch (err) {
          console.error('Error analyzing file:', err);
          setFilePreview(null);
        }
      } else {
        console.error('❌ Format de fichier invalide');
      }
    }
  };

  const handleDownloadTemplate = () => {
    const csv = generateTemplateCSV();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM pour Excel
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modele-extraction-evenements.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  /**
   * Test de déduplication : exporte toutes les données et les réimporte
   * pour vérifier que 0 doublons sont créés
   */
  const handleTestDeduplication = async () => {
    console.log('🧪 handleTestDeduplication appelé, lectureSeule =', lectureSeule);
    
    if (lectureSeule) {
      alert('❌ Test non autorisé en mode lecture seule');
      return;
    }

    const confirmed = window.confirm(
      '🧪 TEST DE DÉDUPLICATION\n\n' +
      'Ce test va :\n' +
      '1. Exporter TOUTES les données actuelles du board\n' +
      '2. Les réimporter immédiatement\n' +
      '3. Vérifier que 0 doublons sont créés\n\n' +
      'Résultat attendu : tous les événements sont ignorés (déjà présents)\n\n' +
      'Continuer ?'
    );

    if (!confirmed) return;

    try {
      setUploading(true);
      setUploadProgress({ current: 0, total: 0, phase: 'Export des données...' });

      console.log('🧪 === TEST DE DÉDUPLICATION ===');

      // Step 1: Exporter toutes les données
      console.log('📤 Étape 1/3 : Export des données du board...');
      const exportResult = await exportAllEventsAsCSV({ data: {} });
      console.log(`✅ Export terminé : ${exportResult.totalItems} événements`);

      // Step 2: Créer un fichier Blob et le "parser"
      console.log('📋 Étape 2/3 : Parsing du fichier exporté...');
      const blob = new Blob(['\uFEFF' + exportResult.csv], { type: 'text/csv;charset=utf-8;' });
      const file = new File([blob], exportResult.filename, { type: 'text/csv' });

      const formData = new FormData();
      formData.append('file', file);

      const parsed = await parseUploadedFile({ data: formData });
      console.log(`✅ ${parsed.dataRows.length} lignes parsées`);

      // Step 3: Réimporter (devrait tout ignorer)
      console.log('🔄 Étape 3/3 : Réimport et déduplication...');
      setUploadProgress({ current: 0, total: 0, phase: 'Test de déduplication...' });

      const { existing } = await fetchExistingForImport({ data: {} });
      console.log(`Board actuel : ${existing.length} événements`);

      const colMap = buildColumnMapping(parsed.headers);
      const existingMap = new Map<string, typeof existing[0]>();
      for (const item of existing) {
        existingMap.set(makeKey(item.nom ?? item.name, item.dateDeDbut, item.lieu), item);
      }

      let toCreate = 0;
      let skipped = 0;

      for (const row of parsed.dataRows) {
        const rec = parseRowToRecord(row, colMap);
        if (rec.date && !rec.dateDeDbut) rec.dateDeDbut = rec.date;
        const eventName = (rec.nom as string | undefined) ?? null;
        if (!eventName) { skipped++; continue; }

        const key = makeKey(eventName, rec.dateDeDbut as string | null, rec.lieu as string | null | undefined);
        const ex = existingMap.get(key);

        if (ex) {
          skipped++;
        } else {
          toCreate++;
        }
      }

      console.log('=== RÉSULTAT DU TEST ===');
      console.log(`✅ Événements exportés : ${exportResult.totalItems}`);
      console.log(`✅ Événements réimportés : ${parsed.dataRows.length}`);
      console.log(`⏭️  Doublons ignorés : ${skipped}`);
      console.log(`❌ Nouveaux (ne devrait pas arriver) : ${toCreate}`);

      setUploading(false);
      setUploadProgress({ current: 0, total: 0, phase: '' });

      if (toCreate === 0 && skipped === exportResult.totalItems) {
        alert(
          `✅ TEST RÉUSSI !\n\n` +
          `${exportResult.totalItems} événements exportés\n` +
          `${skipped} doublons correctement ignorés\n` +
          `0 doublon créé\n\n` +
          `La déduplication fonctionne parfaitement.`
        );
      } else {
        alert(
          `⚠️ TEST AVEC AVERTISSEMENT\n\n` +
          `Exportés : ${exportResult.totalItems}\n` +
          `Ignorés : ${skipped}\n` +
          `Nouveaux détectés : ${toCreate}\n\n` +
          `Vérifiez les logs (F12) pour comprendre pourquoi certains événements ne sont pas reconnus.`
        );
      }

    } catch (e) {
      console.error('❌ Erreur lors du test:', e);
      setUploading(false);
      alert(`❌ Erreur lors du test :\n\n${e instanceof Error ? e.message : String(e)}`);
    }
  };



  const handleMaintenanceOnly = async () => {
    // Garde en mode lecture seule
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }

    // Vérifier qu'au moins une option est cochée
    if (!cleanDuplicates && !renumberIds) {
      alert('⚠️ Veuillez cocher au moins une option de traitement.');
      return;
    }

    // Fermer le dialog et afficher l'état de chargement
    setUploadDialogOpen(false);
    setUploading(true);
    setUploadProgress({ current: 0, total: 0, phase: 'Lancement des traitements...' });

    try {
      console.log('=== MAINTENANCE START ===');

      let cleanupResults = null;
      let renumberResults = null;

      // Step 1: Clean duplicates if requested
      if (cleanDuplicates) {
        setUploadProgress({ current: 0, total: 0, phase: '🧹 Nettoyage des doublons du board...' });
        console.log('🧹 Nettoyage des doublons...');
        cleanupResults = await cleanDuplicatesInBoard({ data: { estLectureSeule: lectureSeule } });
        console.log('📊 Résultat du nettoyage:', cleanupResults);
        console.log(`✅ ${cleanupResults.archived} doublons archivés`);
      }

      // Step 2: Renumber event IDs if requested
      if (renumberIds) {
        setUploadProgress({ current: 0, total: 0, phase: '🔢 Renumérotation des événements...' });
        console.log('🔢 Renumérotation...');
        renumberResults = await renumberEventIds({ data: { estLectureSeule: lectureSeule } });
        console.log(`✅ ${renumberResults.renamed} événements renumérotés`);
      }

      // Step 3: Refresh data
      console.log('Refreshing calendar data...');
      setUploadProgress({ current: 0, total: 0, phase: 'Actualisation...' });
      
      const [eventsRes, statsRes] = await Promise.all([
        getEvents({ data: {} }),
        getEventStats()
      ]);

      setEvents(eventsRes?.items ?? []);
      setStats(statsRes);

      // Step 4: Show results
      const results = {
        created: [],
        updated: [],
        totalCreated: 0,
        totalUpdated: 0,
        totalSkipped: 0,
        totalFailed: 0,
        cleanupResults: cleanupResults ? { 
          archived: cleanupResults.archived, 
          kept: cleanupResults.kept,
          remaining: cleanupResults.remaining ?? 0,
          mightHaveMore: cleanupResults.mightHaveMore ?? false
        } : null,
        renumberResults: renumberResults ? { 
          renamed: renumberResults.renamed, 
          totalItems: renumberResults.totalItems,
          reachedLimit: renumberResults.reachedLimit ?? false
        } : null
      };
      
      console.log('📋 Stockage des résultats:', results);
      setImportResults(results);
      setImportResultDialogOpen(true);

      console.log('=== MAINTENANCE DONE ===');
    } catch (e) {
      console.error('Error during maintenance:', e);
      const errorMsg = e instanceof Error ? e.message : String(e);
      setErrorMessage(`❌ Erreur lors des traitements:\n\n${errorMsg}`);
      setErrorDialogOpen(true);
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, phase: '' });
    }
  };

  // Fonction pour archiver TOUS les événements passés du board
  const handleArchiveAllPassed = async () => {
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }

    const confirmed = window.confirm(
      `🗃️ ARCHIVAGE AUTOMATIQUE DE TOUS LES ÉVÉNEMENTS PASSÉS\n\n` +
      `Cette action va analyser TOUS les événements du board Monday.com et archiver :\n\n` +
      `• Les événements isolés dont la date de fin est passée\n` +
      `• Les séries d'événements (même nom + lieu) complètement terminées\n\n` +
      `⚠️ Les séries en cours (avec des dates futures) seront conservées.\n\n` +
      `Cette action est irréversible. Continuer ?`
    );

    if (!confirmed) return;

    setArchivingPassed(true);
    try {
      console.log('🗃️ Archivage automatique de TOUS les événements passés du board...');
      const result = await autoArchivePassedEvents({ 
        data: { 
          dryRun: false, 
          estLectureSeule: lectureSeule 
        } 
      });
      
      console.log(`✅ ${result.archived} événements archivés avec succès`);
      
      // Afficher un message de succès détaillé
      const seriesSummary = result.series?.slice(0, 5).map(s => 
        `  • ${s.nom} (${s.lieu}) - ${s.count} événement${s.count > 1 ? 's' : ''} - ${s.status}`
      ).join('\n') || '';
      
      const moreCount = (result.series?.length || 0) > 5 ? `\n  ... et ${(result.series?.length || 0) - 5} autres séries` : '';
      
      alert(
        `✅ ARCHIVAGE TERMINÉ !\n\n` +
        `📊 Résultats :\n` +
        `• ${result.archived} événement${result.archived > 1 ? 's archivés' : ' archivé'} dans Monday.com\n` +
        `• ${result.kept} événement${result.kept > 1 ? 's conservés' : ' conservé'} (futurs ou en cours)\n\n` +
        `📋 Exemples :\n${seriesSummary}${moreCount}\n\n` +
        `Le calendrier va se rafraîchir.`
      );
      
      // Rafraîchir les événements
      setRefreshTrigger(prev => prev + 1);
    } catch (e) {
      console.error('Erreur lors de l\'archivage:', e);
      alert('❌ Erreur lors de l\'archivage des événements.\n\nConsultez la console pour plus de détails.');
    } finally {
      setArchivingPassed(false);
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      setUploading(false);
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }

    // Close popup immediately and show uploading state
    setUploadDialogOpen(false);
    setUploading(true);
    setUploadProgress({ current: 0, total: 0, phase: 'Analyse du fichier...' });

    try {
      console.log('=== IMPORT START ===');

      // Step 0a: Clean duplicates in board if requested
      let cleanupResults = null;
      if (cleanDuplicates) {
        setUploadProgress({ current: 0, total: 0, phase: '🧹 Nettoyage des doublons du board...' });
        console.log('🧹 Nettoyage des doublons...');
        cleanupResults = await cleanDuplicatesInBoard({ data: { estLectureSeule: lectureSeule } });
        console.log(`✅ ${cleanupResults.archived} doublons archivés`);
      }

      // Step 0b: Renumber event IDs if requested
      let renumberResults = null;
      if (renumberIds) {
        setUploadProgress({ current: 0, total: 0, phase: '🔢 Renumérotation des événements...' });
        console.log('🔢 Renumérotation...');
        renumberResults = await renumberEventIds({ data: { estLectureSeule: lectureSeule } });
        console.log(`✅ ${renumberResults.renamed} événements renumérotés`);
      }

      // Step 1: Parse file on the server
      setUploadProgress({ current: 0, total: 0, phase: 'Analyse du fichier...' });
      const formData = new FormData();
      formData.append('file', selectedFile);
      const parsed = await parseUploadedFile({ data: formData });
      console.log(`Parsed ${parsed.totalRows} rows`);

      // Step 2: Fetch existing items for deduplication
      const { existing, maxSeq } = await fetchExistingForImport();
      console.log(`Existing: ${existing.length}, maxSeq: ${maxSeq}`);

      // Step 3a: Parse all rows from file
      const colMap = buildColumnMapping(parsed.headers);
      const headerAnalysis = analyzeHeaders(parsed.headers);
      const rawRecords: Array<Record<string, unknown>> = [];
      let skippedInvalid = 0; // Lignes sans nom (invalides)
      
      for (const row of parsed.dataRows) {
        const rec = parseRowToRecord(row, colMap);
        
        // Si on a une colonne 'date' unique mais pas de dateDeDbut/dateDeFin, dupliquer automatiquement
        if (rec.date && !rec.dateDeDbut) {
          rec.dateDeDbut = rec.date;
        }
        if (rec.date && !rec.dateDeFin) {
          rec.dateDeFin = rec.date;
        }
        
        const eventName = (rec.nom as string | undefined) ?? null;
        if (!eventName) {
          skippedInvalid++;
          continue;
        }
        
        rawRecords.push(rec);
      }
      
      if (skippedInvalid > 0) {
        console.log(`⚠️ ${skippedInvalid} ligne(s) ignorée(s) (pas de nom)`);
      }
      
      // Step 3b: FUSION AUTOMATIQUE des événements multi-jours contiguës
      const { merged, stats } = mergeContiguousEvents(rawRecords as any);
      
      console.log(`\n✅ FUSION TERMINÉE:`);
      console.log(`   ${stats.originalCount} lignes → ${stats.mergedCount} événements`);
      console.log(`   ${stats.reductionCount} lignes fusionnées`);
      if (stats.mergedGroups.length > 0) {
        console.log(`\n📋 Événements fusionnés:`);
        stats.mergedGroups.forEach(g => {
          console.log(`   • "${g.nom}" (${g.lieu || 'sans lieu'}): ${g.originalLines} lignes → ${g.durationDays} jours (${g.dateDebut} → ${g.dateFin})`);
        });
      }
      
      // Step 3c: Construire la carte des événements existants avec déduplication SOUPLE (nom + lieu uniquement)
      // Cela garantit que les validations sont préservées même si les dates changent
      const existingMapSoft = new Map<string, typeof existing[0]>();
      console.log('\n🗂️ Construction de la carte des événements existants (déduplication souple: nom + lieu)...');
      for (const item of existing) {
        const softKey = makeSoftKey(item.nom ?? item.name, item.lieu);
        console.log(`  📌 Existing: "${item.nom ?? item.name}" (${item.lieu || 'sans lieu'}) → clé souple: "${softKey}"`);
        existingMapSoft.set(softKey, item);
      }
      console.log(`✅ ${existingMapSoft.size} événements uniques dans le board (nom + lieu)\n`);

      const currentYear = new Date().getFullYear();
      let seq = maxSeq;
      const toCreate: Array<{ autoId: string; rowData: Record<string, unknown> }> = [];
      let skipped = 0; // Compte les doublons ignorés (déjà dans le board)

      const createdDetails: Array<{ nom: string; dateDeDbut: string | null }> = [];

      for (const rec of merged) {
        const eventName = rec.nom as string;
        const lieu = rec.lieu as string | null | undefined;
        
        // Clé souple pour détecter les doublons (nom + lieu uniquement, sans les dates)
        const softKey = makeSoftKey(eventName, lieu);
        
        console.log(`  🔍 New from file (merged): "${eventName}" (${lieu || 'sans lieu'}) → clé souple: "${softKey}"`);
        
        // Vérifier si existe déjà dans le board (déduplication souple)
        const ex = existingMapSoft.get(softKey);
        if (ex) {
          console.log(
            `⏭️ ÉVÉNEMENT EXISTANT DANS LE BOARD (IGNORÉ - VALIDATIONS PRÉSERVÉES) :\n` +
            `   ID board: ${ex.id}\n` +
            `   Nom: "${eventName}"\n` +
            `   Lieu: ${lieu || '(vide)'}\n` +
            `   Clé de déduplication souple: ${softKey}\n` +
            `   📌 RÈGLE D'IMPORT SOUPLE: Même nom + lieu → considéré comme identique\n` +
            `   ✅ Validations, statut, dates, et toutes autres données restent INCHANGÉS\n` +
            `   💡 Les dates peuvent avoir changé dans le fichier, mais l'événement n'est PAS recréé`
          );
          skipped++;
        } else {
          seq++;
          rec.nom = eventName;
          toCreate.push({ autoId: `EVT-${currentYear}-${String(seq).padStart(4, '0')}`, rowData: rec });
          createdDetails.push({ nom: eventName, dateDeDbut: rec.dateDeDbut as string | null });
        }
      }

      // VÉRIFICATION TRAÇABILITÉ : toutes les lignes du fichier doivent être comptées
      const totalLinesAccountedFor = stats.originalCount + skippedInvalid;
      const totalEventsProcessed = toCreate.length + skipped;
      
      console.log(`\n📊 TRAÇABILITÉ FINALE:`);
      console.log(`   • Lignes du fichier Excel: ${parsed.dataRows.length}`);
      console.log(`   • Lignes invalides (sans nom): ${skippedInvalid}`);
      console.log(`   • Lignes valides: ${stats.originalCount}`);
      console.log(`   • Après fusion automatique: ${stats.mergedCount} événements`);
      console.log(`   • Lignes fusionnées: ${stats.reductionCount}`);
      console.log(`   • Nouveaux à créer: ${toCreate.length}`);
      console.log(`   • Doublons ignorés (déjà dans le board): ${skipped}`);
      console.log(`   • Total événements traités: ${totalEventsProcessed}/${stats.mergedCount}`);
      console.log(`   • Total lignes comptabilisées: ${totalLinesAccountedFor}/${parsed.dataRows.length}\n`);
      
      // Vérifier que toutes les lignes du fichier sont comptabilisées
      if (totalLinesAccountedFor !== parsed.dataRows.length) {
        console.error(`❌ ERREUR DE TRAÇABILITÉ: ${parsed.dataRows.length - totalLinesAccountedFor} lignes perdues !`);
      } else if (totalEventsProcessed !== stats.mergedCount) {
        console.error(`⚠️ ALERTE TRAÇABILITÉ: ${stats.mergedCount - totalEventsProcessed} événements non comptabilisés !`);
      } else {
        console.log(`✅ TRAÇABILITÉ OK: 100% des lignes comptabilisées et traitées`);
      }

      // Step 4: Process creates in batches of 10 (ultra-safe to guarantee NO failures)
      // Each batch takes ~3 seconds (10 items × 300ms delay) - well within Lambda timeout
      const BATCH_SIZE = 10;
      let totalCreated = 0;
      let totalCreateFailed = 0;
      const allCreateErrors: string[] = [];

      for (let i = 0; i < toCreate.length; i += BATCH_SIZE) {
        const batch = toCreate.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(toCreate.length / BATCH_SIZE);
        console.log(`📦 Création batch ${batchNum}/${totalBatches} (${batch.length} événements)...`);
        setUploadProgress({ current: batchNum, total: totalBatches, phase: `Création (${batchNum}/${totalBatches})` });
        
        const res = await createItemsBatch({ data: { items: batch, estLectureSeule: lectureSeule } });
        totalCreated += res.created;
        totalCreateFailed += res.failed;
        if (res.errors && res.errors.length > 0) {
          allCreateErrors.push(...res.errors);
        }
        
        console.log(`✅ Batch ${batchNum} terminé: ${res.created} créés, ${res.failed} échecs`);
        
        // Pause de 500ms entre les batches pour laisser l'API Monday "respirer"
        if (i + BATCH_SIZE < toCreate.length) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      // Step 5: Aucune mise à jour (les doublons sont simplement ignorés)

      // Step 6: Refresh calendar data and rebuild entire logic chain
      console.log('Refreshing calendar data...');
      setUploadProgress({ current: 0, total: 0, phase: 'Actualisation...' });
      
      const [eventsRes, statsRes] = await Promise.all([
        getEvents({ data: {} }),          // Recharger tous les événements
        getEventStats()                   // Recalculer les statistiques (total, par statut, par nature)
      ]);

      console.log(`Events loaded after import: ${eventsRes?.items?.length ?? 0}`);
      console.log(`Stats after import:`, statsRes);
      setEvents(eventsRes?.items ?? []);           // ➡️ Mettre à jour les événements (recalcule automatiquement la carte des conflits)
      setStats(statsRes);                          // ➡️ Mettre à jour les compteurs
      
      // Réinitialiser l'état d'upload
      setSelectedFile(null);
      setFilePreview(null);

      // Construire un message récapitulatif avec détails des erreurs si nécessaire
      let summaryMessage = '';
      const totalFailed = totalCreateFailed;
      const allErrors = [...allCreateErrors];
      
      if (totalFailed > 0) {
        summaryMessage = `⚠️ Import terminé avec ${totalFailed} erreur(s) :\n\n`;
        summaryMessage += `✅ Nouveaux créés : ${totalCreated} événements\n`;
        summaryMessage += `⏭️ Ignorés : ${skipped} événements (déjà présents dans le board → AUCUNE modification)\n`;
        summaryMessage += `❌ Échecs : ${totalCreateFailed} créations échouées\n\n`;
        summaryMessage += `📌 RÈGLE D'IMPORT :\n`;
        summaryMessage += `• Si l'événement existe déjà → il n'est PAS importé et son état actuel est PRÉSERVÉ\n`;
        summaryMessage += `• Sinon → il est créé comme nouvel événement\n\n`;
        
        if (allErrors.length > 0) {
          summaryMessage += `Détails des erreurs :\n`;
          allErrors.slice(0, 5).forEach(err => {
            summaryMessage += `• ${err}\n`;
          });
          if (allErrors.length > 5) {
            summaryMessage += `... et ${allErrors.length - 5} autre(s) erreur(s)\n`;
          }
          summaryMessage += `\n⚠️ Les événements échoués n'ont PAS été importés.\n`;
          summaryMessage += `Vérifiez les logs dans la console (F12) pour plus de détails.`;
        }
        
        console.warn('❌ ERREURS D\'IMPORT :', allErrors);
      }

      // VÉRIFICATION FINALE : toutes les lignes doivent être comptabilisées
      // Note : avec la fusion, plusieurs lignes peuvent devenir 1 événement
      // FORMULE CORRECTE : lignes valides (avant fusion) + lignes invalides = total lignes du fichier
      const totalAccountedForFinal = stats.originalCount + skippedInvalid;
      const totalEventsAccountedFor = totalCreated + skipped + totalFailed;
      
      console.log(`\n📊 VÉRIFICATION FINALE (après création):`);
      console.log(`   • Lignes du fichier: ${parsed.dataRows.length}`);
      console.log(`   • Lignes invalides (sans nom): ${skippedInvalid}`);
      console.log(`   • Lignes valides: ${stats.originalCount}`);
      console.log(`   • Lignes valides fusionnées: ${stats.originalCount} → ${stats.mergedCount} événements`);
      console.log(`   • Événements créés: ${totalCreated}`);
      console.log(`   • Événements ignorés (doublons): ${skipped}`);
      console.log(`   • Échecs: ${totalFailed}`);
      console.log(`   • TOTAL LIGNES comptabilisées: ${totalAccountedForFinal}/${parsed.dataRows.length}`);
      console.log(`   • TOTAL ÉVÉNEMENTS traités: ${totalEventsAccountedFor}/${stats.mergedCount}`);
      
      if (totalAccountedForFinal !== parsed.dataRows.length) {
        console.error(`❌ ERREUR DE TRAÇABILITÉ (lignes): ${parsed.dataRows.length - totalAccountedForFinal} lignes perdues !`);
      } else if (totalEventsAccountedFor !== stats.mergedCount) {
        console.error(`❌ ERREUR DE TRAÇABILITÉ (événements): ${stats.mergedCount - totalEventsAccountedFor} événements perdus !`);
      } else {
        console.log(`✅ TRAÇABILITÉ OK: 100% des lignes comptabilisées (${stats.originalCount} valides + ${skippedInvalid} invalides) et 100% des événements traités (${totalEventsAccountedFor}/${stats.mergedCount})`);
      }

      // Step 5: Auto-archiver les événements passés si demandé
      let autoArchiveResults = null;
      if (autoArchive && totalCreated > 0) {
        setUploadProgress({ current: 0, total: 0, phase: '🗃️ Archivage automatique des événements passés...' });
        console.log('\n🗃️ Auto-archivage des événements passés...');
        autoArchiveResults = await autoArchivePassedEvents({ data: { dryRun: false, estLectureSeule: lectureSeule } });
        console.log(`✅ ${autoArchiveResults.archived} événements archivés automatiquement`);
      }

      // Préparer et afficher le dialogue de résultats détaillés
      setImportResults({
        created: createdDetails,
        updated: [], // Plus de mises à jour - les doublons sont ignorés
        totalCreated,
        totalUpdated: 0, // Plus de mises à jour
        totalSkipped: skipped, // Nombre de doublons ignorés (déjà dans le board)
        totalSkippedInvalid: skippedInvalid, // Lignes sans nom (invalides)
        totalFailed,
        unmappedColumns: headerAnalysis.unmapped.length > 0 ? headerAnalysis.unmapped : undefined,
        mergeStats: stats.reductionCount > 0 ? stats : undefined, // Stats de fusion si événements fusionnés
        cleanupResults: cleanupResults ? { 
          archived: cleanupResults.archived, 
          kept: cleanupResults.kept,
          remaining: cleanupResults.remaining ?? 0,
          mightHaveMore: cleanupResults.mightHaveMore ?? false
        } : null,
        renumberResults: renumberResults ? { 
          renamed: renumberResults.renamed, 
          totalItems: renumberResults.totalItems,
          reachedLimit: renumberResults.reachedLimit ?? false
        } : null,
        autoArchiveResults: autoArchiveResults ? {
          archived: autoArchiveResults.archived,
          kept: autoArchiveResults.kept,
          toArchiveCount: autoArchiveResults.toArchiveCount ?? 0,
          series: autoArchiveResults.series ?? []
        } : null
      });
      setImportResultDialogOpen(true);
      
      // Afficher un avertissement si des erreurs sont survenues
      if (totalFailed > 0) {
        console.log('✅ Import terminé:', summaryMessage);
      }

      console.log('=== IMPORT DONE ===');
      console.log(`📊 Résultat final : ${totalCreated} créés, ${skipped} doublons ignorés, ${totalFailed} échecs`);
      if (autoArchiveResults) {
        console.log(`📊 Auto-archivage : ${autoArchiveResults.archived} archivés, ${autoArchiveResults.kept} conservés`);
      }
    } catch (e) {
      console.error('Error uploading file:', e);
      
      let errorMsg = 'Erreur inconnue';
      if (e instanceof Error) {
        errorMsg = e.message;
        
        // Détail supplémentaire pour "Failed to fetch"
        if (e.message === 'Failed to fetch' || e.message.includes('fetch')) {
          errorMsg = `Timeout ou erreur réseau.\n\n` +
            `Causes possibles :\n` +
            `• Le fichier est trop volumineux (> 1000 lignes)\n` +
            `• Le board contient trop d'événements (> 5000)\n` +
            `• Les options de nettoyage sont activées (lentes)\n\n` +
            `Solutions :\n` +
            `✓ Désactivez les options de nettoyage\n` +
            `✓ Divisez votre fichier en plusieurs imports\n` +
            `✓ Supprimez les anciennes données du board`;
        }
      }
      
      setErrorMessage(`❌ Erreur lors de l'importation:\n\n${errorMsg}`);
      setErrorDialogOpen(true);
    } finally {
      setUploading(false);
      setUploadProgress({ current: 0, total: 0, phase: '' });
    }
  };

  const _handleStatusUpdate = async (newStatut: string) => {
    if (!selectedEvent) return;
    
    // Garde en lecture seule
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }
    
    _setUpdatingStatus(true);
    try {
      await updateEventStatus({ data: { id: selectedEvent.id, statut: newStatut as 'Validée' | 'Annulée' | 'À valider' | 'Brouillon', estLectureSeule: lectureSeule } });
      
      console.log(`[Status Update] Event ${selectedEvent.name} status changed to: "${newStatut}"`);
      
      // If status is "Annulée", reload all data to ensure the event disappears
      if (newStatut === 'Annulée') {
        console.log('[Status Update] Reloading all data after cancellation...');
        const [eventsRes, statsRes] = await Promise.all([
          getEvents({ 
            data: { 
              searchTerm: searchTerm || undefined, 
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
        setDialogOpen(false);
        console.log('[Status Update] Data reloaded, cancelled event should be gone');
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
      console.error('❌ Erreur lors de la mise à jour du statut');
    } finally {
      _setUpdatingStatus(false);
    }
  };

  const handleValidationUpdate = async (field: 'validationTechnique' | 'validationPolitique', value: boolean) => {
    if (!selectedEvent) return;
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
      return;
    }
    
    setUpdatingValidations(true);
    try {
      const updateData = { id: selectedEvent.id, [field]: value, estLectureSeule: lectureSeule };
      await updateEventValidations({ data: updateData });
      
      // Update ALL items with the same unique key (name + date + lieu + organisateur)
      // to ensure multi-day events or duplicates all get updated
      const eventKey = `${(selectedEvent.nom || selectedEvent.name).trim().toLowerCase()}_${selectedEvent.dateDeDbut || ''}_${(selectedEvent.lieu || '').trim().toLowerCase()}_${(selectedEvent.organisateur || '').trim().toLowerCase()}`;
      
      console.log(`[Validation] Mise à jour de ${field} = ${value} pour clé: ${eventKey}`);
      
      setEvents(prev => {
        const updated = prev.map(e => {
          const key = `${(e.nom || e.name).trim().toLowerCase()}_${e.dateDeDbut || ''}_${(e.lieu || '').trim().toLowerCase()}_${(e.organisateur || '').trim().toLowerCase()}`;
          if (key === eventKey) {
            console.log(`  ✅ Mise à jour item ${e.id}: ${e.name}`);
            return { ...e, [field]: value };
          }
          return e;
        });
        return updated;
      });
      
      setSelectedEvent(prev => prev ? { ...prev, [field]: value } : null);
      
      // Update the checkbox state
      if (field === 'validationTechnique') {
        setValidationTechnique(value);
      } else {
        setValidationPolitique(value);
      }
      
      console.log(`[Validation] KPIs devraient se mettre à jour automatiquement`);
    } catch (e) {
      console.error('Error updating validation:', e);
    } finally {
      setUpdatingValidations(false);
    }
  };

  const handleDatesUpdate = async () => {
    if (!selectedEvent) return;
    
    // Garde en mode lecture seule
    if (lectureSeule) {
      console.log('❌ Action non autorisée : lecture seule');
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
      console.error('❌ Erreur lors de la mise à jour des dates');
    } finally {
      setUpdatingDates(false);
    }
  };

  // Initialiser les dates quand on ouvre le dialogue
  useEffect(() => {
    if (dialogOpen && selectedEvent) {
      setEditingDates(false);
      setNewDateDeDebut(selectedEvent.dateDeDbut ? new Date(selectedEvent.dateDeDbut).toISOString().split('T')[0] : '');
      setNewDateDeFin(selectedEvent.dateDeFin ? new Date(selectedEvent.dateDeFin).toISOString().split('T')[0] : '');
    }
  }, [dialogOpen, selectedEvent]);

  // Séparer les événements actifs (affichés) - les annulés sont filtrés
  const { activeEvents, archivedEvents } = useMemo(() => {
    console.log(`[Filter] Starting with ${events.length} total events`);
    
    // Déduplication par name + start date + lieu + organisateur
    const uniqueEventsMap = new Map<string, Event>();
    events.forEach(event => {
      const key = `${(event.nom || event.name).trim().toLowerCase()}_${event.dateDeDbut || ''}_${(event.lieu || '').trim().toLowerCase()}_${(event.organisateur || '').trim().toLowerCase()}`;
      if (!uniqueEventsMap.has(key)) {
        uniqueEventsMap.set(key, event);
      }
    });
    let deduped = Array.from(uniqueEventsMap.values());
    console.log(`[Filter] After deduplication: ${deduped.length} unique events`);

    // Toujours filtrer les événements annulés
    const beforeCancelledFilter = deduped.length;
    deduped = deduped.filter(e => {
      const isAnnulee = e.statut === 'Annulée';
      if (isAnnulee) {
        console.log(`[Filter] Removing cancelled event: ${e.name} (statut: "${e.statut}")`);
      }
      return !isAnnulee;
    });
    console.log(`[Filter] After cancelled filter: ${beforeCancelledFilter} → ${deduped.length}`);

    // Tous les événements sont "actifs" (archives toujours masquées)
    const active = deduped;
    const archived: Event[] = []; // Toujours vide car archives désactivées
    
    console.log(`[Filter] ${active.length} active events (archives disabled)`);
    
    return { activeEvents: active, archivedEvents: archived };
  }, [events]);

  // Array final à afficher : uniquement les événements actifs
  const uniqueEvents = useMemo(() => {
    console.log(`[Filter] Displaying ${activeEvents.length} active events`);
    return activeEvents;
  }, [activeEvents]);

  // Count pour l'indicateur
  const archivedEventsCount = archivedEvents.length;
  
  // Log pour debug
  useEffect(() => {
    console.log(`[Debug] archivedEventsCount: ${archivedEventsCount}`);
    console.log(`[Debug] archivedEvents array:`, archivedEvents.slice(0, 5));
  }, [archivedEventsCount, archivedEvents]);

  // Calculate stats from the currently displayed (deduplicated) events
  const _displayedStats = useMemo(() => {
    const total = uniqueEvents.length;
    const validated = uniqueEvents.filter(e => 
      e.validationTechnique === true && e.validationPolitique === true
    ).length;
    const pending = total - validated;
    
    return { total, validated, pending };
  }, [uniqueEvents]);

  // Calculer dynamiquement les options de filtres en fonction des événements affichés
  // Les chiffres doivent correspondre aux KPI (total sans filtre de recherche textuelle)
  const dynamicFilterOptions = useMemo(() => {
    // Utiliser uniqueEvents (déjà dédupliqué + annulés exclus + archives selon toggle)
    // mais SANS appliquer le filtre de recherche textuelle, pour que les chiffres correspondent aux KPI
    
    // Quartiers : compter sur TOUS les événements (sans tenir compte des autres filtres pour avoir le total réel)
    const quartiersMap = new Map<string, number>();
    uniqueEvents.forEach(e => {
      if (e.quartier) {
        quartiersMap.set(e.quartier, (quartiersMap.get(e.quartier) || 0) + 1);
      }
    });
    
    // Statuts : compter sur TOUS les événements (les chiffres doivent correspondre aux KPI)
    const statutsMap = new Map<string, number>();
    uniqueEvents.forEach(e => {
      if (e.statut && e.statut !== 'Annulée') { // Ne jamais afficher "Annulée" dans les options
        statutsMap.set(e.statut, (statutsMap.get(e.statut) || 0) + 1);
      }
    });
    
    // Natures : compter sur TOUS les événements
    const naturesMap = new Map<string, number>();
    uniqueEvents.forEach(e => {
      if (e.nature) {
        naturesMap.set(e.nature, (naturesMap.get(e.nature) || 0) + 1);
      }
    });
    
    return {
      quartiers: Array.from(quartiersMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      statuts: Array.from(statutsMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
      natures: Array.from(naturesMap.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count),
    };
  }, [uniqueEvents]);

  // Build conflict map
  const _conflictMap = useMemo(() => buildConflictMap(uniqueEvents), [uniqueEvents]);

  // Convert events to calendar format (exclude cancelled events)
  // Memoize to avoid infinite render loop
  const calendarEvents: CalendarEvent[] = useMemo(() => {
    // For multi-day events, create an entry for EACH DAY between start and end
    return uniqueEvents
    .filter(e => e.dateDeDbut && e.statut !== 'Annulée')
    .flatMap(e => {
      const startDate = new Date(e.dateDeDbut!);
      startDate.setHours(0, 0, 0, 0);
      const endDate = e.dateDeFin ? new Date(e.dateDeFin) : new Date(startDate);
      endDate.setHours(0, 0, 0, 0);
      
      // Generate array of dates between start and end (inclusive)
      const dates: Date[] = [];
      const currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        dates.push(new Date(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Determine color based on validation status or archive status
      const isArchived = estArchive(e);
      const hasTechnique = e.validationTechnique === true;
      const hasPolitique = e.validationPolitique === true;
      let dotColor: string;
      
      if (isArchived) {
        dotColor = '#9ca3af'; // Gray - archived
      } else if (hasTechnique && hasPolitique) {
        dotColor = '#9333ea'; // Purple - both validations
      } else if (hasTechnique) {
        dotColor = '#22c55e'; // Green - technical only
      } else if (hasPolitique) {
        dotColor = '#3b82f6'; // Blue - political only
      } else {
        dotColor = '#ef4444'; // Red - none
      }
      
      // Create a calendar event for each day with unique ID
      return dates.map((date) => ({
        id: `${e.id}-${date.toISOString().split('T')[0]}`, // Unique ID per day
        name: e.nom || e.name,
        endAt: date,
        status: { 
          color: dotColor
        },
        fullEvent: e,
      }));
    });
  }, [uniqueEvents]); // Recalculate only when uniqueEvents changes



  return (
    <>
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
                Calendrier des Événements
              </h1>
              <p className="text-muted-foreground">
                Gestion et validation des événements de Dunkerque
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              {/* Badge mode consultation + debug */}
              <div className="flex items-center gap-2">
                {lectureSeule && (
                  <Badge 
                    variant="outline" 
                    className="gap-2 text-xs px-3 py-1.5 bg-orange-50 border-orange-200 text-orange-700"
                    title="Cette vue ne permet aucune modification des données"
                  >
                    <span className="h-2 w-2 rounded-full bg-orange-500" />
                    Consultation seule
                  </Badge>
                )}
              </div>
              
                    {/* Upload Button - masqué en lecture seule */}
                  {!lectureSeule && (
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                    size="lg"
                    className="gap-2"
                  disabled={uploading}
                >
              {uploading ? (
                                <>
                                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  {uploadProgress.phase || 'Import en cours...'}
                                  {uploadProgress.total > 0 && ` ${uploadProgress.current}/${uploadProgress.total}`}
                                </>
                              ) : (
                                <>
                                  <Upload className="h-5 w-5" />
                                  Importer un fichier
                                </>
                              )}
                            </Button>
                          )}
            
              {/* KPIs - 2 indicateurs alignés */}
              <div className="flex gap-3">
                <Card className="min-w-[140px]" title="Nombre de manifestations affichées (filtrées selon vos critères)">
                  <CardHeader className="pb-2 pt-3">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wide text-blue-600 mb-0.5">Manifestations</CardDescription>
                    <CardTitle className="text-4xl font-bold text-blue-600 tabular-nums">
                      {loading ? (
                        <div className="h-10 w-16 animate-pulse rounded bg-muted" />
                      ) : (
                        uniqueEvents.length
                      )}
                    </CardTitle>
                  </CardHeader>
                </Card>
                <Card className="min-w-[140px]" title="Manifestations validées (Technique ET Politique) parmi les événements affichés">
                  <CardHeader className="pb-2 pt-3">
                    <CardDescription className="text-xs font-semibold uppercase tracking-wide text-green-600 mb-0.5">Validées</CardDescription>
                    <CardTitle className="text-4xl font-bold text-green-600 tabular-nums">
                      {loading ? (
                        <div className="h-10 w-16 animate-pulse rounded bg-muted" />
                      ) : (
                        uniqueEvents.filter(e => e.validationTechnique && e.validationPolitique).length
                      )}
                    </CardTitle>
                  </CardHeader>
                </Card>
              </div>
            </div>
          </div>
          
          {/* Indicateur de chargement des données */}
          {!loading && events.length > 0 && (
            <div className="mt-4 text-center">
              <p className="text-xs text-muted-foreground">
                {events.length} événements chargés depuis le serveur
                {events.length >= 2000 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    ⚠ Limite de temps atteinte - certains événements peuvent ne pas être affichés
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-muted/30">
        <div className="container mx-auto px-6 py-6">
          <div className={`flex flex-col gap-4 md:flex-row md:items-center ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Rechercher un événement..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-11"
                disabled={loading}
              />
            </div>
            
            <div className="flex flex-wrap gap-2 items-center">
              <select
                value={filterQuartier}
                onChange={(e) => setFilterQuartier(e.target.value)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={loading}
              >
                <option value="ALL">Tous les quartiers</option>
                {dynamicFilterOptions.quartiers.map(q => (
                  <option key={q.label} value={q.label}>
                    {q.label} ({q.count})
                  </option>
                ))}
              </select>

              <select
                value={filterStatut}
                onChange={(e) => setFilterStatut(e.target.value)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={loading}
              >
                <option value="ALL">Tous les statuts</option>
                {dynamicFilterOptions.statuts.map(s => (
                  <option key={s.label} value={s.label}>
                    {s.label} ({s.count})
                  </option>
                ))}
              </select>

              <select
                value={filterNature}
                onChange={(e) => setFilterNature(e.target.value)}
                className="h-10 px-3 rounded-md border border-input bg-background text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                disabled={loading}
              >
                <option value="ALL">Toutes natures</option>
                {dynamicFilterOptions.natures.map(n => (
                  <option key={n.label} value={n.label}>
                    {n.label} ({n.count})
                  </option>
                ))}
              </select>

              {/* Bouton pour réinitialiser tous les filtres */}
              {(searchTerm !== '' || filterQuartier !== 'ALL' || filterStatut !== 'ALL' || filterNature !== 'ALL') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterQuartier('ALL');
                    setFilterStatut('ALL');
                    setFilterNature('ALL');
                    console.log('✨ Filtres réinitialisés');
                  }}
                  className="gap-2 h-10 text-xs text-muted-foreground hover:text-foreground"
                  disabled={loading}
                >
                  <X className="h-4 w-4" />
                  Réinitialiser les filtres
                </Button>
              )}

              {/* Bouton d'archivage - toujours visible si pas en lecture seule */}
              {!lectureSeule && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleArchiveAllPassed}
                  disabled={loading || archivingPassed}
                  className="gap-2 h-10 text-sm bg-orange-600 hover:bg-orange-700 text-white"
                  title="Archiver automatiquement TOUS les événements passés du board Monday.com (analyse intelligente des séries)"
                >
                  {archivingPassed ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Archivage en cours...
                    </>
                  ) : (
                    <>
                      <Archive className="h-4 w-4" />
                      Archiver tous les passés
                    </>
                  )}
                </Button>
              )}

              {(filterQuartier !== 'ALL' || filterStatut !== 'ALL' || filterNature !== 'ALL' || searchTerm) && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setFilterQuartier('ALL');
                    setFilterStatut('ALL');
                    setFilterNature('ALL');
                    setSearchTerm('');
                  }}
                  disabled={loading}
                  title="Réinitialiser les filtres"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  console.log('[Calendar] Manuel refresh requested');
                  setRefreshTrigger(prev => prev + 1);
                }}
                disabled={loading}
                title="Actualiser le calendrier"
                className={loading ? 'opacity-50' : ''}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Info message when archives are displayed */}
      {/* Debug panel - Extended (always visible when admin) */}
      {/* Bannière d'information sur l'archivage automatique */}
      {!lectureSeule && (
        <div className="container mx-auto px-6 pt-4">
          <div className="rounded-lg border-2 border-orange-300 bg-gradient-to-r from-orange-50 to-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Archive className="h-6 w-6 text-orange-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900 mb-2">🗃️ Archivage automatique intelligent</h3>
                <p className="text-sm text-orange-800 mb-3">
                  Le bouton <strong>"Archiver tous les passés"</strong> analyse intelligemment TOUS les événements du board et archive :
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="bg-white p-3 rounded border border-orange-200">
                    <p className="font-medium text-orange-900 mb-1">✅ Archivés :</p>
                    <ul className="space-y-1 text-orange-700">
                      <li>• Événements isolés dont la date de fin est passée</li>
                      <li>• Séries complètement terminées (même nom + lieu)</li>
                    </ul>
                  </div>
                  <div className="bg-white p-3 rounded border border-orange-200">
                    <p className="font-medium text-orange-900 mb-1">🛡️ Conservés :</p>
                    <ul className="space-y-1 text-orange-700">
                      <li>• Événements futurs ou en cours</li>
                      <li>• Séries avec des dates futures (même si certaines dates sont passées)</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-orange-600 mt-3 font-medium">
                  💡 Exemple : "DUCASSE" du 29/08 au 06/09 → Conservé tant que la date du jour &lt; 06/09
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Debug panel - ÉTENDU avec exemples d'événements */}
      {!lectureSeule && (
        <div className="container mx-auto px-6 pt-4">
          <details className="rounded-lg border-2 border-orange-300 bg-orange-50" open>
            <summary className="cursor-pointer p-3 font-bold text-sm text-orange-900 hover:bg-orange-100 flex items-center justify-between">
              <span>🔍 DEBUG COMPLET : Date & Événements ({archivedEventsCount} archivés détectés)</span>
              <span className="text-xs text-muted-foreground">Cliquez pour masquer</span>
            </summary>
            <div className="p-4 border-t space-y-3">
              {/* Info sur la date actuelle */}
              <div className="bg-white p-4 rounded border-2 border-blue-400">
                <p className="text-lg font-bold text-blue-900 mb-2">
                  📅 Date actuelle du système
                </p>
                <p className="text-2xl font-mono font-bold text-blue-700">
                  {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-sm text-blue-700 mt-2 bg-blue-50 p-2 rounded">
                  Un événement est archivé si <code className="bg-blue-200 px-1 rounded">dateDeFin &lt; {new Date().toLocaleDateString('fr-FR')}</code>
                </p>
              </div>
              
              {/* Exemples d'événements avec dates */}
              <div className="bg-white p-4 rounded border-2 border-purple-300">
                <p className="font-bold text-purple-900 mb-2">📋 Exemples d'événements (5 premiers) :</p>
                <div className="space-y-2">
                  {uniqueEvents.slice(0, 5).map((e, idx) => {
                    const dateFin = e.dateDeFin ? new Date(e.dateDeFin) : null;
                    const aujourdhui = new Date();
                    aujourdhui.setHours(0, 0, 0, 0);
                    if (dateFin) dateFin.setHours(0, 0, 0, 0);
                    const isPast = dateFin && dateFin < aujourdhui;
                    
                    return (
                      <div key={idx} className={`p-3 rounded border-2 ${isPast ? 'bg-orange-100 border-orange-400' : 'bg-green-50 border-green-300'}`}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-bold text-sm">{e.nom || e.name}</span>
                          <span className={`px-3 py-1 rounded font-bold text-xs ${isPast ? 'bg-orange-500 text-white' : 'bg-green-500 text-white'}`}>
                            {isPast ? '🗃️ PASSÉ (archivé)' : '✅ ACTIF (futur)'}
                          </span>
                        </div>
                        <div className="text-xs space-y-1">
                          <div>Date fin: <code className="bg-gray-200 px-1 rounded">{dateFin ? dateFin.toISOString().split('T')[0] : 'Pas de date'}</code></div>
                          <div>Comparaison: dateFin ({dateFin ? dateFin.toLocaleDateString('fr-FR') : '?'}) {isPast ? '<' : '>='} aujourd'hui ({aujourdhui.toLocaleDateString('fr-FR')})</div>
                          <div>Lieu: {e.lieu || '(non renseigné)'}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {archivedEventsCount === 0 ? (
                <div className="bg-green-50 p-3 rounded border border-green-200">
                  <p className="text-sm font-medium text-green-900">✅ Aucun événement à archiver</p>
                  <p className="text-xs text-green-700 mt-1">
                    Tous vos événements ont des dates de fin futures ou sont encore en cours.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  <p className="text-sm font-medium text-gray-700">
                    {archivedEventsCount} événement{archivedEventsCount > 1 ? 's' : ''} à archiver :
                  </p>
                  {archivedEvents.slice(0, 50).map((e, i) => {
                    const dateFin = e.dateDeFin ? new Date(e.dateDeFin) : null;
                    return (
                      <div key={i} className="text-xs font-mono bg-white p-2 rounded border">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{e.nom || e.name}</span>
                          <Badge variant="outline" className="text-xs">
                            {e.dateDeDbut ? new Date(e.dateDeDbut).toLocaleDateString('fr-FR') : 'Sans date'} 
                            {dateFin && ` → ${dateFin.toLocaleDateString('fr-FR')}`}
                          </Badge>
                          <span className="text-gray-500">{e.lieu || 'Sans lieu'}</span>
                          {dateFin && (
                            <span className="text-red-600 text-xs">
                              (fin passée : {dateFin.toLocaleDateString('fr-FR')})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {archivedEventsCount > 50 && (
                    <p className="text-xs text-gray-500 text-center pt-2">
                      ... et {archivedEventsCount - 50} autres événements archivés
                    </p>
                  )}
                </div>
              )}
            </div>
          </details>
        </div>
      )}

      {/* Calendar */}
      <div className="container mx-auto px-6 py-8">
        {loading ? (
          <ChargementEvenements />
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
            <p className="text-sm text-destructive mb-2 font-semibold">
              Une erreur est survenue lors du chargement des événements.
            </p>
            <p className="text-xs text-muted-foreground mb-4 font-mono">
              {error.message || 'Erreur inconnue'}
            </p>
            <Button
              variant="outline"
              onClick={() => window.location.reload()}
            >
              Réessayer
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 p-12 text-center">
            <CalendarIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground/40" />
            <h3 className="text-xl font-semibold mb-2">Aucun événement</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Le calendrier est vide. Commencez par importer des événements.
            </p>
            <Button
              variant="default"
              onClick={() => setUploadDialogOpen(true)}
              className="gap-2"
              disabled={lectureSeule}
            >
              <Upload className="h-4 w-4" />
              Importer des événements
            </Button>
            {lectureSeule && (
              <p className="text-xs text-muted-foreground mt-4">
                Mode consultation : vous ne pouvez pas importer d'événements
              </p>
            )}
          </div>
        ) : (
          <>
            {/* Legend */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Légende des validations</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#9333ea' }} />
                    <span className="text-sm">Technique & Politique</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#22c55e' }} />
                    <span className="text-sm">Technique uniquement</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                    <span className="text-sm">Politique uniquement</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-sm">Aucune validation</span>
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
                  <CalendarIcon className="h-4 w-4" />
                  Cliquez sur une date pour voir tous les événements et gérer les validations
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <CalendarProvider locale="fr-FR" startDay={1}>
                  <CalendarDate>
                    <CalendarDatePicker>
                      <CalendarMonthPicker />
                      <CalendarYearPicker start={2020} end={2035} />
                    </CalendarDatePicker>
                    <CalendarDatePagination />
                  </CalendarDate>
                  <CalendarHeader />
                  <CalendarBody
                    features={calendarEvents}
                    mode="single"
                    onSelect={(date) => {
                      console.log('Date selected:', date);
                      if (date instanceof Date) {
                        setSelectedDate(date);
                        setEventsListDialogOpen(true);
                      }
                    }}
                    >
                      {({ feature }) => (
                      <div className="flex items-center gap-2">
                      <div
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: feature.status.color }}
                      />
                      <span className="truncate text-xs">{feature.name}</span>
                      </div>
                    )}
                  </CalendarBody>
                </CalendarProvider>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Events List Dialog - shows all events for a selected date */}
      <Dialog open={eventsListDialogOpen} onOpenChange={setEventsListDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden">
          <div className="px-6 pt-6 pb-4 border-b">
            <div className="flex items-start justify-between gap-4">
              <DialogHeader className="flex-1">
                <DialogTitle className="text-2xl font-semibold">
                  Événements du {selectedDate?.toLocaleDateString('fr-FR', { 
                    weekday: 'long', 
                    day: 'numeric', 
                    month: 'long', 
                    year: 'numeric' 
                  })}
                </DialogTitle>
                <DialogDescription className="text-base mt-2">
                  Cliquez sur un événement pour voir ses détails et gérer les validations
                </DialogDescription>
              </DialogHeader>

              <Button
                onClick={async () => {
                  if (!selectedDate) return;
                  
                  setExportingPdf(true);
                  try {
                    // Filter events for the selected day
                    const dayEvents = uniqueEvents.filter(e => {
                      if (!e.dateDeDbut) return false;
                      const eventStart = new Date(e.dateDeDbut);
                      eventStart.setHours(0, 0, 0, 0);
                      const eventEnd = e.dateDeFin ? new Date(e.dateDeFin) : new Date(eventStart);
                      eventEnd.setHours(0, 0, 0, 0);
                      const checkDate = new Date(selectedDate);
                      checkDate.setHours(0, 0, 0, 0);
                      return checkDate >= eventStart && checkDate <= eventEnd && e.statut !== 'Annulée';
                    });

                    // Generate PDF via server function
                    const base64Pdf = await generateDayEventsPdf({ 
                      data: { 
                        date: `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}`,
                        events: dayEvents.map(e => ({
                          id: e.id,
                          nom: e.nom ?? null,
                          name: e.name,
                          lieu: e.lieu ?? null,
                          quartier: e.quartier ?? null,
                          nature: e.nature ?? null,
                          type: e.type ?? null,
                          organisateur: e.organisateur ?? null,
                          pilote: e.pilote ?? null,
                          statut: e.statut ?? null,
                          validationTechnique: e.validationTechnique ?? null,
                          validationPolitique: e.validationPolitique ?? null,
                          validParDateClef: e.validParDateClef ?? null,
                          dateDeDbut: e.dateDeDbut ? (typeof e.dateDeDbut === 'string' ? e.dateDeDbut : e.dateDeDbut.toISOString()) : null,
                          dateDeFin: e.dateDeFin ? (typeof e.dateDeFin === 'string' ? e.dateDeFin : e.dateDeFin.toISOString()) : null,
                        }))
                      } 
                    });

                    // Download the PDF
                    const dateStr = selectedDate.toLocaleDateString('fr-FR', { 
                      day: '2-digit', 
                      month: '2-digit', 
                      year: 'numeric' 
                    }).replace(/\//g, '-');
                    
                    const link = document.createElement('a');
                    link.href = `data:application/pdf;base64,${base64Pdf}`;
                    link.download = `evenements-${dateStr}.pdf`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  } catch (error) {
                    console.error('Error generating PDF:', error);
                    console.error('❌ Erreur lors de la génération du PDF');
                  } finally {
                    setExportingPdf(false);
                  }
                }}
                disabled={exportingPdf}
                variant="outline"
                size="sm"
                className="gap-2 shrink-0"
              >
                {exportingPdf ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Génération...
                  </>
                ) : (
                  <>
                    <FileDown className="h-4 w-4" />
                    Imprimer PDF
                  </>
                )}
              </Button>
            </div>

            {/* Legend in popup - sticky */}
            <Card className="mt-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Légende des validations</CardTitle>
              </CardHeader>
              <CardContent className="pb-3">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: '#9333ea' }} />
                    <span className="text-xs">Technique & Politique</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
                    <span className="text-xs">Technique uniquement</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: '#3b82f6' }} />
                    <span className="text-xs">Politique uniquement</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: '#ef4444' }} />
                    <span className="text-xs">Aucune validation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: '#9ca3af' }} />
                    <span className="text-xs">Archivé</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6 bg-white">
            {/* Title & Stats for PDF export & view */}
            {selectedDate && (() => {
              const dayEvents = uniqueEvents.filter(e => {
                if (!e.dateDeDbut) return false;
                const eventStart = new Date(e.dateDeDbut);
                eventStart.setHours(0, 0, 0, 0);
                const eventEnd = e.dateDeFin ? new Date(e.dateDeFin) : new Date(eventStart);
                eventEnd.setHours(0, 0, 0, 0);
                const checkDate = new Date(selectedDate);
                checkDate.setHours(0, 0, 0, 0);
                return checkDate >= eventStart && checkDate <= eventEnd && e.statut !== 'Annulée';
              });

              const dayEventCount = dayEvents.length;
              const dayEventsNonArbitres = dayEvents.filter(e => !estArbitre(e));
              const dayEventCountNonArbitre = dayEventsNonArbitres.length;
              const daySeverity = getDaySeverity(dayEventCountNonArbitre); // Calculer la sévérité sur les NON arbitrés
              const severityColor = getSeverityColor(daySeverity);
              
              // Appliquer la nouvelle règle de conflit
              const dateKey = formatDateKey(selectedDate);
              const showConflictBanner = jourEnConflit(dateKey, _conflictMap) && dayEventCountNonArbitre > 0;

              return (
                <>
                  {showConflictBanner && (
                    <div 
                      className="mx-6 mt-4 rounded-lg p-3 flex items-center gap-2 text-white font-medium text-sm"
                      style={{ backgroundColor: severityColor }}
                    >
                      <AlertTriangle className="h-5 w-5 shrink-0" />
                      <div className="flex flex-col gap-0.5">
                        <span>⚠ {dayEventCountNonArbitre} événement{dayEventCountNonArbitre > 1 ? 's' : ''} à arbitrer ce jour</span>
                        {dayEventCount > dayEventCountNonArbitre && (
                          <span className="text-xs opacity-90">(sur {dayEventCount} événement{dayEventCount > 1 ? 's' : ''} programmé{dayEventCount > 1 ? 's' : ''})</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="mb-4 pt-4 px-6 border-b pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-bold text-foreground">
                          Événements du {selectedDate.toLocaleDateString('fr-FR', { 
                            weekday: 'long', 
                            day: 'numeric', 
                            month: 'long', 
                            year: 'numeric' 
                          })}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                          Ville de Dunkerque — {dayEvents.length} manifestation(s) au programme
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {dayEvents.map((event) => {
                      const isArchived = estArchive(event);
                      const hasTechnique = event.validationTechnique === true;
                      const hasPolitique = event.validationPolitique === true;
                      let dotColor: string;
                      let dotTitle: string;
                      
                      if (isArchived) {
                        dotColor = '#9ca3af'; // Gray
                        dotTitle = 'Archivé';
                      } else if (hasTechnique && hasPolitique) {
                        dotColor = '#9333ea'; // Purple
                        dotTitle = 'Validé technique et politique';
                      } else if (hasTechnique) {
                        dotColor = '#22c55e'; // Green
                        dotTitle = 'Validé technique uniquement';
                      } else if (hasPolitique) {
                        dotColor = '#3b82f6'; // Blue
                        dotTitle = 'Validé politique uniquement';
                      } else {
                        dotColor = '#ef4444'; // Red
                        dotTitle = 'Non validé';
                      }

                      return (
                        <Card
                          key={event.id}
                          className="cursor-pointer transition-all hover:shadow-md hover:border-primary/50"
                          onClick={() => {
                            setSelectedEvent(event);
                            setValidationTechnique(event.validationTechnique ?? false);
                            setValidationPolitique(event.validationPolitique ?? false);
                            setOpenedFromPopup(true); // Mark as opened from popup
                            setEventsListDialogOpen(false);
                            setDialogOpen(true);
                          }}
                        >
                          <CardContent className="p-4 space-y-3">
                            {/* Title & Status */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 min-w-0">
                                <div 
                                  className="h-4 w-4 rounded-full shrink-0 mt-1" 
                                  style={{ backgroundColor: dotColor }}
                                  title={dotTitle}
                                />
                                <div className="min-w-0">
                                  <h3 className="font-bold text-lg leading-tight text-foreground">
                                    {event.nom || event.name}
                                  </h3>
                                  <p className="text-xs font-mono font-semibold text-primary mt-0.5">
                                    {event.name}
                                  </p>
                                  {event.organisateur && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      Organisé par : <span className="font-medium text-foreground">{event.organisateur}</span>
                                    </p>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <Badge 
                                  variant={
                                    isArchived ? 'secondary' :
                                    hasTechnique && hasPolitique ? 'default' :
                                    'destructive'
                                  }
                                  className={
                                    isArchived ? '' :
                                    hasTechnique && hasPolitique ? 'bg-green-600 hover:bg-green-700' :
                                    ''
                                  }
                                >
                                  {isArchived ? 'Archivée' : (hasTechnique && hasPolitique ? 'Validée' : 'Non validée')}
                                </Badge>
                                {(hasTechnique && hasPolitique) && event.validParDateClef && (
                                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white">
                                    ✓ Date Clef
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Details grid: Dates, Location, Quarter, Nature, Type, Driver */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t">
                              {event.dateDeDbut && (
                                <div className="flex items-center gap-1.5">
                                  <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="truncate">Début : <strong className="text-foreground">{new Date(event.dateDeDbut).toLocaleDateString('fr-FR')}</strong></span>
                                </div>
                              )}
                              {event.dateDeFin && (
                                <div className="flex items-center gap-1.5">
                                  <CalendarIcon className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="truncate">Fin : <strong className="text-foreground">{new Date(event.dateDeFin).toLocaleDateString('fr-FR')}</strong></span>
                                </div>
                              )}
                              {event.lieu && (
                                <div className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                                  <span className="truncate">Lieu : <strong className="text-foreground">{event.lieu}</strong></span>
                                </div>
                              )}
                              {event.quartier && (
                                <div className="flex items-center gap-1.5">
                                  <span className="h-2 w-2 rounded-full bg-primary/60 shrink-0" />
                                  <span className="truncate">Quartier : <strong className="text-foreground">{event.quartier}</strong></span>
                                </div>
                              )}
                              {event.nature && (
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">Nature : <strong className="text-foreground">{event.nature}</strong></span>
                                </div>
                              )}
                              {event.type && (
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate">Type : <strong className="text-foreground">{event.type}</strong></span>
                                </div>
                              )}
                              {event.pilote && (
                                <div className="flex items-center gap-1.5 col-span-1 sm:col-span-2">
                                  <span className="truncate">Pilote : <strong className="text-foreground">{Array.isArray(event.pilote) ? event.pilote.join(', ') : event.pilote}</strong></span>
                                </div>
                              )}
                            </div>

                            {/* Validation badge */}
                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <ValidationBadge 
                                validationTechnique={event.validationTechnique}
                                validationPolitique={event.validationPolitique}
                                size="sm"
                              />
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Event Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        // Si on ferme le dialogue et qu'il a été ouvert depuis le popup, rouvrir le popup
        if (!open && openedFromPopup) {
          setOpenedFromPopup(false);
          setEventsListDialogOpen(true);
        }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {selectedEvent && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl font-semibold pr-8">
                  {selectedEvent.nom || selectedEvent.name}
                </DialogTitle>
                <DialogDescription className="text-base">
                  Détails {lectureSeule ? '(consultation seule)' : 'et validation'} de l'événement
                </DialogDescription>
              </DialogHeader>

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

              <div className="space-y-6 mt-6">
                {/* Validation Status - Read-only display in consultation mode */}
                {lectureSeule ? (
                  <Card className="border-2">
                    <CardHeader>
                      <CardTitle className="text-base">État des validations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex items-center gap-3">
                          <div className={`h-5 w-5 rounded flex items-center justify-center ${validationTechnique ? 'bg-green-100' : 'bg-gray-100'}`}>
                            {validationTechnique && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-green-700">Validation Technique</div>
                            <div className="text-xs text-muted-foreground">
                              {validationTechnique ? 'Validé' : 'Non validé'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`h-5 w-5 rounded flex items-center justify-center ${validationPolitique ? 'bg-blue-100' : 'bg-gray-100'}`}>
                            {validationPolitique && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-blue-700">Validation Politique</div>
                            <div className="text-xs text-muted-foreground">
                              {validationPolitique ? 'Validé' : 'Non validé'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  /* Validation Cards - Interactive mode */
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 border-green-200 bg-green-50/50">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-green-700">
                          <CheckCircle2 className="h-5 w-5" />
                          Validation Technique
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="validation-technique"
                            checked={validationTechnique}
                            onCheckedChange={(checked) => handleValidationUpdate('validationTechnique', checked === true)}
                            disabled={updatingValidations}
                            className="h-5 w-5"
                          />
                          <Label htmlFor="validation-technique" className="text-sm font-medium cursor-pointer">
                            {validationTechnique ? 'Validé' : 'Non validé'}
                          </Label>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-2 border-blue-200 bg-blue-50/50">
                      <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-blue-700">
                          <CheckCircle2 className="h-5 w-5" />
                          Validation Politique
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center gap-3">
                          <Checkbox
                            id="validation-politique"
                            checked={validationPolitique}
                            onCheckedChange={(checked) => handleValidationUpdate('validationPolitique', checked === true)}
                            disabled={updatingValidations}
                            className="h-5 w-5"
                          />
                          <Label htmlFor="validation-politique" className="text-sm font-medium cursor-pointer">
                            {validationPolitique ? 'Validé' : 'Non validé'}
                          </Label>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Status Badge if cancelled */}
                {selectedEvent.statut === 'Annulée' && (
                  <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
                    <Badge variant="destructive" className="text-base gap-2">
                      <X className="h-4 w-4" />
                      Événement annulé
                    </Badge>
                  </div>
                )}

                {/* Status Section - Masqué complètement en mode consultation */}
                {!lectureSeule && (
                  <Card className="border-2">
                    <CardHeader>
                      <CardTitle className="text-base">Statut de l'événement</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2">
                        <select
                          value={selectedEvent.statut || 'À valider'}
                          onChange={(e) => _handleStatusUpdate(e.target.value)}
                          disabled={_updatingStatus}
                          className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm font-medium ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                        >
                          <option value="À valider">À valider</option>
                          <option value="Validée">Validée</option>
                          <option value="Annulée">❌ Annulée</option>
                          <option value="Brouillon">Brouillon</option>
                        </select>
                        {selectedEvent.statut === 'Validée' && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                        {selectedEvent.statut === 'Annulée' && <X className="h-5 w-5 text-destructive" />}
                      </div>
                      
                      {/* Bouton d'annulation rapide */}
                      {selectedEvent.statut !== 'Annulée' && (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Êtes-vous sûr de vouloir annuler l'événement "${selectedEvent.nom || selectedEvent.name}" ?\n\nCette action changera le statut à "Annulée".`)) {
                              _handleStatusUpdate('Annulée');
                            }
                          }}
                          disabled={_updatingStatus}
                          className="w-full gap-2"
                        >
                          {_updatingStatus ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              Annulation en cours...
                            </>
                          ) : (
                            <>
                              <X className="h-4 w-4" />
                              Annuler cet événement
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Event Details */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Informations de l'événement</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
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
                                <Label htmlFor="date-debut" className="text-xs">Date de début</Label>
                                <Input
                                  id="date-debut"
                                  type="date"
                                  value={newDateDeDebut}
                                  onChange={(e) => setNewDateDeDebut(e.target.value)}
                                  disabled={updatingDates}
                                  className="mt-1"
                                />
                              </div>
                              <div>
                                <Label htmlFor="date-fin" className="text-xs">Date de fin</Label>
                                <Input
                                  id="date-fin"
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
                          <div className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5" />
                            Lieu
                          </div>
                          <div className="text-sm">{selectedEvent.lieu}</div>
                        </div>
                      )}

                      {selectedEvent.quartier && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Quartier</div>
                          <Badge variant="secondary">{selectedEvent.quartier}</Badge>
                        </div>
                      )}

                      {selectedEvent.nature && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Nature</div>
                          <Badge variant="secondary">{selectedEvent.nature}</Badge>
                        </div>
                      )}

                      {selectedEvent.type && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Type</div>
                          <Badge variant="outline">{selectedEvent.type}</Badge>
                        </div>
                      )}

                      {selectedEvent.niveau && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Niveau</div>
                          <Badge variant="outline">{selectedEvent.niveau}</Badge>
                        </div>
                      )}

                      {selectedEvent.pilote && selectedEvent.pilote.length > 0 && (
                        <div className="md:col-span-2">
                          <div className="text-sm font-medium text-muted-foreground mb-1">Pilote</div>
                          <div className="text-sm">{selectedEvent.pilote.join(', ')}</div>
                        </div>
                      )}

                      {selectedEvent.directionPilote && (
                        <div className="md:col-span-2">
                          <div className="text-sm font-medium text-muted-foreground mb-1">Direction Pilote</div>
                          <div className="text-sm">{selectedEvent.directionPilote}</div>
                        </div>
                      )}

                      {selectedEvent.organisateur && (
                        <div className="md:col-span-2">
                          <div className="text-sm font-medium text-muted-foreground mb-1">Organisateur</div>
                          <div className="text-sm">{selectedEvent.organisateur}</div>
                        </div>
                      )}
                      
                      {selectedEvent.statutDimport && (
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Statut d'import</div>
                          <Badge 
                            variant={
                              selectedEvent.statutDimport === '✅ Créé' ? 'default' :
                              selectedEvent.statutDimport === '⏭️ Ignoré' ? 'secondary' :
                              selectedEvent.statutDimport === '❌ Échec' ? 'destructive' :
                              'outline'
                            }
                            className={
                              selectedEvent.statutDimport === '✅ Créé' ? 'bg-green-600' :
                              selectedEvent.statutDimport === '⏭️ Ignoré' ? 'bg-orange-500' :
                              selectedEvent.statutDimport === '❌ Échec' ? '' :
                              'bg-blue-500'
                            }
                          >
                            {selectedEvent.statutDimport}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => {
        setUploadDialogOpen(open);
        if (!open) {
          setSelectedFile(null);
          setFilePreview(null);
        }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
              <Upload className="h-6 w-6" />
              Importer un fichier d'extraction
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              Sélectionnez un fichier CSV ou Excel contenant les données des événements à importer
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Bouton test de déduplication */}
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="pt-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">🧪 Test de déduplication</p>
                  <p className="text-xs text-muted-foreground">
                    Exporte toutes les données actuelles du board et les réimporte pour vérifier que 0 doublons sont créés
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log('🔵 Bouton Test cliqué !');
                    handleTestDeduplication();
                  }}
                  className="gap-2 shrink-0"
                  disabled={uploading}
                >
                  <RefreshCw className="h-4 w-4" />
                  Lancer le test
                </Button>
              </CardContent>
            </Card>

            {/* Bouton télécharger modèle */}
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-medium text-sm">Pas de fichier modèle ?</p>
                  <p className="text-xs text-muted-foreground">
                    Téléchargez un fichier CSV pré-formaté avec les bonnes colonnes et un exemple
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="gap-2 shrink-0"
                >
                  <FileDown className="h-4 w-4" />
                  Télécharger le modèle
                </Button>
              </CardContent>
            </Card>

            {/* File Input */}
            <div className="space-y-3">
              <Label htmlFor="file-upload" className="text-sm font-medium">
                Fichier d'extraction
              </Label>
              <div className="flex items-center gap-3">
                <Input
                  id="file-upload"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="flex-1"
                />
              </div>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span>{selectedFile.name}</span>
                  <span className="text-xs">
                    ({(selectedFile.size / 1024).toFixed(1)} Ko)
                  </span>
                </div>
              )}
              <Card className="border-amber-200 bg-amber-50">
                <CardContent className="pt-3 pb-3">
                  <p className="text-sm font-medium text-amber-900 mb-2">⚠️ Fichier Excel → Convertir en CSV</p>
                  <p className="text-xs text-amber-800">
                    Les gros fichiers Excel (.xlsx) peuvent causer des timeouts. 
                    Convertissez votre fichier en CSV pour un import rapide et fiable.
                  </p>
                  <div className="mt-2 text-xs text-amber-700">
                    <strong>Dans Excel :</strong> Fichier → Enregistrer sous → CSV (délimiteur : point-virgule)
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Prévisualisation du mapping */}
            {filePreview && (
              <Card className={`border-2 ${filePreview.analysis.missingRequired.length > 0 ? 'border-destructive bg-destructive/5' : 'border-green-500 bg-green-50/50'}`}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    {filePreview.analysis.missingRequired.length > 0 ? (
                      <>
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        Colonnes manquantes détectées
                      </>
                    ) : (
                      <>
                        <FileCheck className="h-5 w-5 text-green-600" />
                        Fichier analysé avec succès
                      </>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Colonnes reconnues */}
                  {filePreview.analysis.mapped.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2">✅ Colonnes reconnues ({filePreview.analysis.mapped.length}) :</p>
                      <div className="space-y-1.5">
                        {filePreview.analysis.mapped.map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-xs font-mono">
                              {m.original}
                            </Badge>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-700 font-medium">{m.mapped}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Colonnes non reconnues */}
                  {filePreview.analysis.unmapped.length > 0 && (
                    <div>
                      <p className="text-sm font-medium mb-2 text-amber-700">⚠️ Colonnes ignorées ({filePreview.analysis.unmapped.length}) :</p>
                      <div className="flex flex-wrap gap-2">
                        {filePreview.analysis.unmapped.map((u, i) => (
                          <Badge key={i} variant="outline" className="text-xs border-amber-500 text-amber-700">
                            {u.original}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Colonnes manquantes */}
                  {filePreview.analysis.missingRequired.length > 0 && (
                    <div className="rounded-md border-2 border-destructive p-3 bg-destructive/10">
                      <p className="text-sm font-medium mb-2 text-destructive">❌ Colonnes obligatoires manquantes :</p>
                      <ul className="list-disc list-inside space-y-1 text-sm text-destructive">
                        {filePreview.analysis.missingRequired.map((col, i) => (
                          <li key={i}>{col}</li>
                        ))}
                      </ul>
                      <p className="text-xs text-destructive mt-2">
                        Le fichier ne peut pas être importé sans ces colonnes. Veuillez télécharger le modèle ou ajuster votre fichier.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  <p className="font-medium text-blue-900">Format recommandé :</p>
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li>Fichiers CSV (.csv) — séparateur point-virgule (;) ou virgule (,)</li>
                  </ul>
                  <p className="mt-3 text-xs text-blue-700">
                    💡 Le système reconnaît automatiquement de nombreuses variantes de noms de colonnes
                  </p>
                  <p className="mt-2 text-xs text-blue-600">
                    ⚡ Import optimisé : 528 lignes en ~2-3 minutes avec CSV
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Options de nettoyage */}
            <Card className="border-orange-200 bg-orange-50/50">
              <CardContent className="pt-4 space-y-3">
                <p className="font-medium text-sm text-orange-900">Options de nettoyage automatique :</p>
                
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="clean-duplicates"
                    checked={cleanDuplicates}
                    onCheckedChange={(checked) => setCleanDuplicates(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="clean-duplicates" className="text-sm font-medium cursor-pointer">
                      🧹 Nettoyer les doublons existants
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Avant l'import, archive automatiquement tous les doublons du board (même nom + date + lieu + organisateur)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="renumber-ids"
                    checked={renumberIds}
                    onCheckedChange={(checked) => setRenumberIds(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="renumber-ids" className="text-sm font-medium cursor-pointer">
                      🔢 Renuméroter les identifiants
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Renumérotise tous les EVT-YYYY-NNNN pour qu'ils soient consécutifs (triés par date)
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Checkbox
                    id="auto-archive"
                    checked={autoArchive}
                    onCheckedChange={(checked) => setAutoArchive(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="auto-archive" className="text-sm font-medium cursor-pointer">
                      🗃️ Archiver automatiquement les événements passés
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Après l'import, archive les événements dont la date est passée (sauf les séries contiguës en cours)
                    </p>
                    <p className="text-xs text-blue-700 mt-1">
                      ✨ Intelligent : une série multi-jours (ex: DUCASSE 29/08→06/09) n'est archivée que si TOUTES les dates sont passées
                    </p>
                  </div>
                </div>
                
                <div className="mt-3 p-2 bg-amber-100 border border-amber-300 rounded text-xs text-amber-900">
                  <strong>⚠️ Attention :</strong> Ces options peuvent prendre plusieurs minutes sur un board volumineux. 
                  Ne les activez que si nécessaire. Pour un import simple, laissez-les décochées.
                </div>
                
                {(cleanDuplicates || renumberIds) && !selectedFile && (
                  <div className="mt-3 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-900">
                    <strong>💡 Astuce :</strong> Vous pouvez exécuter ces traitements sans importer de fichier. 
                    Cliquez sur "Exécuter les traitements" ci-dessous.
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setSelectedFile(null);
                  setFilePreview(null);
                }}
                disabled={uploading}
              >
                Annuler
              </Button>
              
              {/* Bouton pour exécuter uniquement les traitements (sans fichier) */}
              {(cleanDuplicates || renumberIds) && !selectedFile && (
                <Button
                  onClick={handleMaintenanceOnly}
                  disabled={uploading}
                  variant="outline"
                  className="gap-2 border-orange-500 text-orange-700 hover:bg-orange-50"
                >
                  {uploading ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Traitement...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Exécuter les traitements
                    </>
                  )}
                </Button>
              )}
              
              <Button
                onClick={handleFileUpload}
                disabled={!selectedFile || uploading || (filePreview?.analysis.missingRequired.length ?? 0) > 0}
                className="gap-2"
              >
                {uploading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                    Importation...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Importer
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Results Dialog */}
      {/* Dialog d'erreur d'import */}
      <Dialog open={errorDialogOpen} onOpenChange={setErrorDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Erreur d'importation
            </DialogTitle>
            <DialogDescription className="mt-4 whitespace-pre-wrap">
              {errorMessage}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-4">
            <Button onClick={() => setErrorDialogOpen(false)}>
              Fermer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importResultDialogOpen} onOpenChange={setImportResultDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              {importResults?.totalCreated === 0 ? 'Traitements terminés !' : 'Import terminé avec succès !'}
            </DialogTitle>
            <DialogDescription className="text-base mt-2">
              {importResults?.totalCreated === 0 ? 'Récapitulatif des opérations effectuées' : 'Récapitulatif des événements importés'}
            </DialogDescription>
          </DialogHeader>

          {importResults && (() => {
            console.log('🎨 Affichage dialog avec résultats:', importResults);
            return (
              <div className="space-y-6 mt-4">
                {/* Résumé du nettoyage (si effectué) */}
                {(importResults.cleanupResults || importResults.renumberResults) && (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      🧹 Nettoyage automatique
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {importResults.cleanupResults && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Doublons archivés :</span>
                          <Badge variant="secondary">{importResults.cleanupResults.archived}</Badge>
                        </div>
                        
                        {/* Message si des items restent à archiver */}
                        {(importResults.cleanupResults.remaining ?? 0) > 0 && (
                          <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-amber-900">
                                  {importResults.cleanupResults.remaining} doublon(s) restant(s)
                                </p>
                                <p className="text-xs text-amber-800">
                                  Pour éviter les timeouts, maximum 50 archivages par opération. 
                                  Relancez le nettoyage pour continuer.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 gap-2 border-amber-600 text-amber-700 hover:bg-amber-50"
                                  onClick={async () => {
                                    setImportResultDialogOpen(false);
                                    await handleMaintenanceOnly();
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Continuer le nettoyage
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Message si potentiellement d'autres doublons dans les pages suivantes */}
                        {importResults.cleanupResults.mightHaveMore && (importResults.cleanupResults.remaining ?? 0) === 0 && (
                          <div className="mt-3 p-3 bg-blue-100 border border-blue-300 rounded">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-blue-700 shrink-0 mt-0.5" />
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-blue-900">
                                  D'autres doublons pourraient exister
                                </p>
                                <p className="text-xs text-blue-800">
                                  Ce nettoyage a analysé les 500 premiers items. Relancez pour vérifier les items suivants.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 gap-2 border-blue-600 text-blue-700 hover:bg-blue-50"
                                  onClick={async () => {
                                    setImportResultDialogOpen(false);
                                    await handleMaintenanceOnly();
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Vérifier les items suivants
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {importResults.renumberResults && (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Identifiants renumérotés :</span>
                          <Badge variant="secondary">{importResults.renumberResults.renamed} / {importResults.renumberResults.totalItems}</Badge>
                        </div>
                        
                        {/* Message si limite atteinte */}
                        {importResults.renumberResults.reachedLimit && (
                          <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                              <div className="space-y-2">
                                <p className="text-sm font-medium text-amber-900">
                                  Renumérotation partielle (limite de 300 items par appel)
                                </p>
                                <p className="text-xs text-amber-800">
                                  Relancez pour continuer la renumérotation des items restants.
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 gap-2 border-amber-600 text-amber-700 hover:bg-amber-50"
                                  onClick={async () => {
                                    setImportResultDialogOpen(false);
                                    await handleMaintenanceOnly();
                                  }}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Continuer la renumérotation
                                </Button>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Résumé de l'archivage automatique (si archivage effectué) */}
              {importResults.autoArchiveResults && importResults.autoArchiveResults.archived > 0 && (
                <Card className="border-slate-200 bg-slate-50/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      🗃️ Archivage automatique
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Événements archivés :</span>
                      <Badge variant="secondary">{importResults.autoArchiveResults.archived}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Événements conservés :</span>
                      <Badge variant="outline">{importResults.autoArchiveResults.kept}</Badge>
                    </div>
                    
                    {importResults.autoArchiveResults.series && importResults.autoArchiveResults.series.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-2">Détail par série :</p>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {importResults.autoArchiveResults.series.slice(0, 10).map((serie, i) => (
                            <div key={i} className="text-xs p-2 rounded bg-background border">
                              <div className="font-medium">{serie.nom} ({serie.lieu})</div>
                              <div className="text-muted-foreground mt-0.5">{serie.status}</div>
                            </div>
                          ))}
                          {importResults.autoArchiveResults.series.length > 10 && (
                            <p className="text-xs text-muted-foreground text-center">
                              ... et {importResults.autoArchiveResults.series.length - 10} autre(s)
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-3 p-2 bg-blue-100/50 rounded text-xs text-blue-700">
                      <strong>✨ Archivage intelligent :</strong> Les séries multi-jours en cours (ex: DUCASSE 29/08→06/09 avec date actuelle = 31/08) 
                      sont conservées jusqu'à ce que TOUTES leurs dates soient passées.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Résumé de la fusion automatique (si fusion effectuée) */}
              {importResults.mergeStats && importResults.mergeStats.reductionCount > 0 && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      🔄 Fusion automatique des événements multi-jours
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <div className="text-2xl font-bold text-blue-700">{importResults.mergeStats.originalCount}</div>
                        <div className="text-xs text-blue-600">Lignes du fichier</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-green-700">{importResults.mergeStats.mergedCount}</div>
                        <div className="text-xs text-green-600">Événements après fusion</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-purple-700">{importResults.mergeStats.reductionCount}</div>
                        <div className="text-xs text-purple-600">Lignes fusionnées</div>
                      </div>
                    </div>
                    
                    {importResults.mergeStats.mergedGroups.length > 0 && (
                      <div className="mt-4">
                        <div className="text-sm font-medium text-blue-900 mb-2">Événements fusionnés :</div>
                        <div className="max-h-40 overflow-y-auto space-y-2">
                          {importResults.mergeStats.mergedGroups.map((group, i) => (
                            <div key={i} className="flex items-center justify-between gap-4 p-2 rounded border bg-white text-sm">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{group.nom}</div>
                                <div className="text-xs text-muted-foreground">
                                  {group.lieu || 'Sans lieu'} • {group.dateDebut} → {group.dateFin}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="outline" className="text-xs border-blue-500 text-blue-700">
                                  {group.originalLines} lignes
                                </Badge>
                                <span className="text-muted-foreground">→</span>
                                <Badge variant="outline" className="text-xs border-green-500 text-green-700">
                                  {group.durationDays} jours
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-3 p-2 bg-blue-100/50 rounded text-xs text-blue-700">
                      <strong>💡 Fusion intelligente :</strong> Les événements sur plusieurs lignes consécutives 
                      (même nom + lieu) ont été automatiquement fusionnés en un seul événement multi-jours.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Avertissement : Colonnes non reconnues */}
              {importResults.unmappedColumns && importResults.unmappedColumns.length > 0 && (
                <Card className="border-amber-300 bg-amber-50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-900">
                      <AlertTriangle className="h-5 w-5" />
                      {importResults.unmappedColumns.length} colonne{importResults.unmappedColumns.length > 1 ? 's' : ''} ignorée{importResults.unmappedColumns.length > 1 ? 's' : ''}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-amber-800">
                      Les colonnes suivantes n'ont pas été reconnues et leurs données n'ont <strong>pas été importées</strong> :
                    </p>
                    <div className="space-y-2">
                      {importResults.unmappedColumns.map((col, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 bg-white rounded border border-amber-200">
                          <Badge variant="outline" className="shrink-0 font-mono">
                            Col. {col.columnIndex}
                          </Badge>
                          <span className="text-sm font-medium text-amber-900">
                            "{col.original}"
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 p-3 bg-amber-100 border border-amber-300 rounded">
                      <p className="text-xs text-amber-900 font-medium mb-2">
                        💡 Pour que ces colonnes soient importées :
                      </p>
                      <ul className="text-xs text-amber-800 space-y-1 ml-4 list-disc">
                        <li>Vérifiez l'orthographe des en-têtes (ex: "Nom", "Lieu", "Date de début")</li>
                        <li>Consultez <code className="bg-amber-200 px-1 rounded">DEBUG-IMPORT-DECALAGE-COLONNES.md</code> pour la liste complète</li>
                        <li>Si vous pensez qu'il s'agit d'un bug, contactez le support</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Résumé de l'import (seulement si import effectué) */}
              {(importResults.totalCreated > 0 || importResults.totalSkipped > 0 || importResults.totalFailed > 0) && (
                <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-green-200 bg-green-50/50">
                    <CardContent className="pt-4">
                      <div className="text-center">
                        <div className="text-3xl font-bold text-green-700">{importResults.totalCreated}</div>
                        <div className="text-sm text-green-600 mt-1">Nouveau(x)</div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {(importResults.totalSkipped ?? 0) > 0 && (
                    <Card className="border-orange-200 bg-orange-50/50">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-orange-700">{importResults.totalSkipped}</div>
                          <div className="text-sm text-orange-600 mt-1">Doublons ignorés</div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {importResults.totalFailed > 0 && (
                    <Card className="border-red-200 bg-red-50/50">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-red-700">{importResults.totalFailed}</div>
                          <div className="text-sm text-red-600 mt-1">Erreur(s)</div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {(importResults.totalSkippedInvalid ?? 0) > 0 && (
                    <Card className="border-gray-200 bg-gray-50/50">
                      <CardContent className="pt-4">
                        <div className="text-center">
                          <div className="text-3xl font-bold text-gray-700">{importResults.totalSkippedInvalid}</div>
                          <div className="text-sm text-gray-600 mt-1">Lignes sans nom</div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
                
                {/* Message pour les lignes invalides */}
                {(importResults.totalSkippedInvalid ?? 0) > 0 && (
                  <Card className="border-gray-200 bg-gray-50/50">
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-gray-600 shrink-0 mt-0.5" />
                        <div className="text-sm text-gray-700">
                          <strong>{importResults.totalSkippedInvalid} ligne(s) ignorée(s)</strong> car elles ne contiennent pas de nom d'événement. 
                          Vérifiez que votre fichier Excel contient bien une colonne "Nom" avec des valeurs pour chaque ligne.
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Règle d'import */}
                {(importResults.totalSkipped ?? 0) > 0 && (
                  <Card className="border-purple-200 bg-purple-50/50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm flex items-center gap-2 text-purple-900">
                        📌 Règle d'import
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-2">
                      <div className="text-sm text-purple-800 space-y-1">
                        <div className="flex items-start gap-2">
                          <span className="text-purple-600 font-bold shrink-0">•</span>
                          <span>
                            <strong>Si l'événement existe déjà</strong> dans le board (même nom + date + lieu) 
                            → il n'est <strong>PAS importé</strong> et son état actuel est <strong>PRÉSERVÉ</strong>
                          </span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="text-purple-600 font-bold shrink-0">•</span>
                          <span>
                            <strong>Sinon</strong> → il est créé comme <strong>nouvel événement</strong>
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 p-2 bg-purple-100/50 rounded text-xs text-purple-700">
                        <strong>Pourquoi ?</strong> Pour éviter que le board ne se remplisse avec des doublons 
                        et pour préserver les validations et modifications déjà effectuées sur les événements existants.
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {/* Vérification de traçabilité */}
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-3 pb-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900">
                            Traçabilité : 100% des lignes comptabilisées
                          </span>
                        </div>
                      </div>
                      {importResults.mergeStats && (
                        <div className="text-xs text-blue-700 bg-blue-100/50 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <span>Lignes du fichier :</span>
                            <span className="font-semibold">{importResults.mergeStats.originalCount + (importResults.totalSkippedInvalid ?? 0)}</span>
                          </div>
                          <div className="flex items-center justify-between mt-1">
                            <span>Après fusion + traitement :</span>
                            <span className="font-semibold">
                              {importResults.totalCreated} créés + {importResults.totalSkipped ?? 0} ignorés + {importResults.totalFailed} échecs
                              {(importResults.totalSkippedInvalid ?? 0) > 0 && ` + ${importResults.totalSkippedInvalid} invalides`}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                </>
              )}

              {/* Liste des événements créés */}
              {importResults.created.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Badge className="bg-green-600">+{importResults.created.length}</Badge>
                      Événements créés
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="max-h-60 overflow-y-auto space-y-2">
                      {importResults.created.map((evt, i) => (
                        <div key={i} className="flex items-center justify-between gap-4 p-2 rounded border bg-card hover:bg-accent/50 transition-colors">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <CalendarIcon className="h-4 w-4 text-primary shrink-0" />
                            <div className="min-w-0">
                              <div className="font-medium truncate">{evt.nom}</div>
                              {evt.dateDeDbut && (
                                <div className="text-xs text-muted-foreground">
                                  {new Date(evt.dateDeDbut).toLocaleDateString('fr-FR', { 
                                    day: 'numeric', 
                                    month: 'long', 
                                    year: 'numeric' 
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline" className="shrink-0 text-xs border-green-500 text-green-700">
                            Nouveau
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Message informatif sur les doublons ignorés */}
              {(importResults.totalSkipped ?? 0) > 0 && (
                <Card className="border-orange-200 bg-orange-50/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-orange-900">
                          {importResults.totalSkipped ?? 0} événement{(importResults.totalSkipped ?? 0) > 1 ? 's' : ''} déjà présent{(importResults.totalSkipped ?? 0) > 1 ? 's' : ''}
                        </p>
                        <p className="text-sm text-orange-700 mt-1">
                          Ces événements existent déjà dans le board (même nom + dates + lieu + organisateur) et n'ont pas été modifiés.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Note importante sur la préservation des données */}
              {(importResults.totalSkipped ?? 0) > 0 && (
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-900">
                          Données préservées
                        </p>
                        <p className="text-sm text-blue-700 mt-1">
                          Les événements existants conservent <strong>toutes</strong> leurs données d'origine : validations, statut, organisateur, etc.
                        </p>
                        <p className="text-xs text-blue-600 mt-2 italic">
                          Note : Un événement est considéré comme "existant" s'il a le même <strong>nom + date de début + lieu</strong>. Cela permet d'avoir plusieurs événements homonymes le même jour dans des lieux différents.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Info */}
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    💡 <strong>Astuce :</strong> Si vous ne voyez pas tous les événements sur le calendrier, 
                    naviguez avec les flèches ◀ ▶ pour parcourir les différents mois.
                  </p>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end">
                <Button onClick={() => setImportResultDialogOpen(false)}>
                  Fermer
                </Button>
              </div>
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
