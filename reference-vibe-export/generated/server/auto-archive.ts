import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';

/**
 * Clé de déduplication pour identifier une série d'événements
 */
function makeSeriesKey(nom: string | null, lieu: string | null): string {
  const n = (nom || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const l = (lieu || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return `${n}|${l}`;
}

/**
 * Vérifie si une série d'événements est complètement terminée
 * Une série est terminée si TOUTES ses dates de fin sont passées
 */
function isSeriesCompletelyPast(events: Array<{ dateDeFin: Date | null }>): boolean {
  if (events.length === 0) return false;
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  // La série est terminée si la dernière date de fin est passée
  const lastDate = events
    .map(e => e.dateDeFin)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0]; // Trier par ordre décroissant
  
  if (!lastDate) return false;
  
  const dateFin = new Date(lastDate);
  dateFin.setHours(0, 0, 0, 0);
  
  return dateFin < aujourdhui;
}

/**
 * Archive automatiquement les événements passés
 * 
 * RÈGLES INTELLIGENTES :
 * 1. Un événement isolé est archivé si sa dateDeFin < aujourd'hui
 * 2. Une série contiguë (même nom + lieu) est archivée UNIQUEMENT si TOUTES ses dates sont passées
 * 3. Si une série est en cours (certaines dates passées, d'autres futures), elle n'est PAS archivée
 * 
 * Exemples :
 * - DUCASSE du 29/08 au 06/09, aujourd'hui = 31/08 → PAS archivé (série en cours)
 * - DUCASSE du 29/08 au 06/09, aujourd'hui = 07/09 → ARCHIVÉ (série terminée)
 * - Marché Noël le 01/12, aujourd'hui = 02/12 → ARCHIVÉ (événement isolé terminé)
 */
export const autoArchivePassedEvents = createServerFn({ method: 'POST' })
  .validator(z.object({
    dryRun: z.boolean().optional(),
    estLectureSeule: z.boolean().optional()
  }).optional())
  .handler(async ({ data }) => {
    const dryRun = data?.dryRun ?? false;
    const estLectureSeule = data?.estLectureSeule ?? false;
    
    if (estLectureSeule) {
      console.log('❌ Auto-archivage bloqué : mode lecture seule');
      return { archived: 0, kept: 0, series: [], message: 'Bloqué en mode lecture seule' };
    }
    
    console.log(`\n🗂️ AUTO-ARCHIVAGE DES ÉVÉNEMENTS PASSÉS ${dryRun ? '(DRY RUN)' : ''}`);
    
    const board = new ExtractionkioskBoard();
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    // Récupérer tous les événements NON archivés
    const allEvents = await board.items()
      .withColumns(['nom', 'dateDeDbut', 'dateDeFin', 'lieu', 'statut'])
      .orderBy({ column: 'name', direction: 'asc' })
      .withPagination({ limit: 500 })
      .execute();
    
    const events = allEvents.items ?? [];
    console.log(`📊 ${events.length} événements à analyser`);
    
    // Regrouper par série (nom + lieu)
    const seriesMap = new Map<string, typeof events>();
    
    for (const event of events) {
      // Ignorer les événements annulés
      if (event.statut === 'Annulée') continue;
      
      const _key = makeSeriesKey(event.nom ?? event.name, event.lieu);
      if (!seriesMap.has(_key)) {
        seriesMap.set(_key, []);
      }
      seriesMap.get(_key)!.push(event);
    }
    
    console.log(`📋 ${seriesMap.size} séries détectées`);
    
    let toArchive: Array<{ id: string; nom: string; dateDeFin: Date | null; reason: string }> = [];
    let kept: Array<{ nom: string; reason: string }> = [];
    const seriesReport: Array<{ nom: string; lieu: string; count: number; status: string }> = [];
    
    // Analyser chaque série
    for (const [key, serieEvents] of seriesMap.entries()) {
      const nom = serieEvents[0].nom ?? serieEvents[0].name;
      const lieu = serieEvents[0].lieu ?? '(sans lieu)';
      
      if (serieEvents.length === 1) {
        // Événement ISOLÉ : archiver si dateDeFin < aujourd'hui
        const event = serieEvents[0];
        
        if (!event.dateDeFin) {
          kept.push({ nom, reason: 'Pas de date de fin' });
          seriesReport.push({ nom, lieu, count: 1, status: 'Conservé (pas de date)' });
          continue;
        }
        
        const dateFin = new Date(event.dateDeFin);
        dateFin.setHours(0, 0, 0, 0);
        
        if (dateFin < aujourdhui) {
          toArchive.push({ 
            id: event.id, 
            nom, 
            dateDeFin: event.dateDeFin,
            reason: `Événement isolé terminé (${dateFin.toLocaleDateString('fr-FR')} < ${aujourdhui.toLocaleDateString('fr-FR')})` 
          });
          seriesReport.push({ nom, lieu, count: 1, status: '🗃️ À archiver (terminé)' });
        } else {
          kept.push({ nom, reason: `Date future (${dateFin.toLocaleDateString('fr-FR')})` });
          seriesReport.push({ nom, lieu, count: 1, status: '✅ Conservé (futur)' });
        }
      } else {
        // SÉRIE CONTIGUË : archiver UNIQUEMENT si TOUTES les dates sont passées
        const isCompletelyPast = isSeriesCompletelyPast(serieEvents);
        
        if (isCompletelyPast) {
          // Toutes les dates sont passées → archiver toute la série
          for (const event of serieEvents) {
            toArchive.push({ 
              id: event.id, 
              nom, 
              dateDeFin: event.dateDeFin,
              reason: `Série complètement terminée (${serieEvents.length} événements)` 
            });
          }
          
          const lastDate = serieEvents
            .map(e => e.dateDeFin)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          
          seriesReport.push({ 
            nom, 
            lieu, 
            count: serieEvents.length, 
            status: `🗃️ À archiver (série terminée le ${lastDate?.toLocaleDateString('fr-FR')})` 
          });
        } else {
          // Certaines dates sont futures → CONSERVER toute la série (même les dates passées)
          for (const _event of serieEvents) {
            kept.push({ 
              nom, 
              reason: `Série en cours (${serieEvents.length} événements, certaines dates futures)` 
            });
          }
          
          const firstDate = serieEvents
            .map(e => e.dateDeDbut)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => a.getTime() - b.getTime())[0];
          
          const lastDate = serieEvents
            .map(e => e.dateDeFin)
            .filter((d): d is Date => d !== null)
            .sort((a, b) => b.getTime() - a.getTime())[0];
          
          seriesReport.push({ 
            nom, 
            lieu, 
            count: serieEvents.length, 
            status: `✅ Conservé (série en cours : ${firstDate?.toLocaleDateString('fr-FR')} → ${lastDate?.toLocaleDateString('fr-FR')})` 
          });
        }
      }
    }
    
    console.log(`\n📊 RÉSULTAT DE L'ANALYSE:`);
    console.log(`   • À archiver : ${toArchive.length} événements`);
    console.log(`   • À conserver : ${kept.length} événements`);
    
    if (seriesReport.length > 0) {
      console.log(`\n📋 DÉTAIL PAR SÉRIE:`);
      seriesReport.forEach(s => {
        console.log(`   ${s.status} - "${s.nom}" (${s.lieu}): ${s.count} événement(s)`);
      });
    }
    
    // Archivage effectif (sauf en mode dry-run)
    let archived = 0;
    
    if (!dryRun && toArchive.length > 0) {
      console.log(`\n🗃️ ARCHIVAGE EN COURS...`);
      
      for (const item of toArchive) {
        try {
          await board.item(item.id).archive().execute();
          archived++;
          console.log(`   ✅ Archivé : "${item.nom}" (${item.reason})`);
        } catch (e) {
          console.error(`   ❌ Échec : "${item.nom}"`, e);
        }
      }
      
      console.log(`\n✅ ARCHIVAGE TERMINÉ : ${archived}/${toArchive.length} événements archivés`);
    } else if (dryRun) {
      console.log(`\n🔍 DRY RUN : ${toArchive.length} événements SERAIENT archivés`);
      toArchive.slice(0, 10).forEach(item => {
        console.log(`   • "${item.nom}" - ${item.reason}`);
      });
      if (toArchive.length > 10) {
        console.log(`   ... et ${toArchive.length - 10} autres`);
      }
    }
    
    return {
      archived: dryRun ? 0 : archived,
      kept: kept.length,
      toArchiveCount: toArchive.length,
      series: seriesReport,
      dryRun
    };
  });

/**
 * Vérifie quels événements seraient archivés (simulation)
 */
export const previewAutoArchive = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    return autoArchivePassedEvents({ data: { dryRun: true, estLectureSeule: false } });
  });
