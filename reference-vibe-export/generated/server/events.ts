import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import monday from 'monday-sdk-js';
import { ExtractionkioskBoard } from '@api/BoardSDK';
import { garderEcriture } from '@generated/utils/access';

const mondaySdk = monday();

const COLUMNS = [
  'dateDeDbut',
  'dateDeFin',
  'nom',
  'lieu',
  'quartier',
  'pilote',
  'directionPilote',
  'organisateur',
  'nature',
  'niveau',
  'type',
  'statut',
  'tardive',
  'reprog',
  'validationTechnique',
  'validationPolitique',
  'validParDateClef',
  'statutDimport'
] as const;

export const getEvents = createServerFn({ method: 'GET' })
  .validator(z.object({
    quartier: z.string().optional(),
    statut: z.string().optional(),
    nature: z.string().optional(),
    searchTerm: z.string().optional(),
    includeArchived: z.boolean().optional(),
  }).optional())
  .handler(async ({ data }) => {
    console.log('[getEvents] Starting with filters:', data);
    
    const board = new ExtractionkioskBoard();
    
    // Build filters
    const filters: Record<string, unknown> = {};
    
    if (data?.quartier && data.quartier !== 'ALL') {
      filters.quartier = data.quartier;
    }
    if (data?.statut && data.statut !== 'ALL') {
      filters.statut = data.statut;
    }
    if (data?.nature && data.nature !== 'ALL') {
      filters.nature = data.nature;
    }
    if (data?.searchTerm && data.searchTerm.trim().length > 0) {
      filters.nom = { contains: data.searchTerm.trim() };
    }

    console.log('[getEvents] Applying filters:', filters);

    // Build query
    let query = board.items().withColumns([...COLUMNS]);
    
    if (Object.keys(filters).length > 0) {
      query = query.where(filters);
    }
    
    query = query
      .orderBy({ column: 'name', direction: 'asc' })
      .withPagination({ limit: 500 });

    console.log('[getEvents] Executing first page...');
    const firstPage = await query.execute();
    console.log('[getEvents] First page received:', firstPage.items?.length ?? 0, 'items');
    
    const allItems = [...(firstPage.items ?? [])];
    let cursor = firstPage.cursor ?? undefined;

    // Fetch ALL remaining pages (no timeout limit - we want everything)
    let pageCount = 1;

    while (cursor) {
      await new Promise(r => setTimeout(r, 300)); // Rate limit protection

      const nextQuery = board.items()
        .withColumns([...COLUMNS])
        .orderBy({ column: 'name', direction: 'asc' })
        .withPagination({ limit: 500, cursor });

      const page = await nextQuery.execute();
      allItems.push(...(page.items ?? []));
      cursor = page.cursor ?? undefined;
      pageCount++;
      
      console.log(`[getEvents] Page ${pageCount}: +${page.items?.length ?? 0} items (total: ${allItems.length})`);
    }

    console.log(`[getEvents] ✅ Finished loading ALL pages: ${pageCount} total pages, ${allItems.length} items`);
    
    // Post-filter for "Validée" status
    let finalItems = allItems;
    if (data?.statut === 'Validée') {
      finalItems = allItems.filter(item => 
        item.validationTechnique === true && item.validationPolitique === true
      );
      console.log(`[getEvents] "Validée" filter: ${finalItems.length}/${allItems.length} items`);
    }
    
    console.log(`[getEvents] Returning ${finalItems.length} items`);
    return { items: finalItems, cursor: null };
  });

export const getEventById = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const board = new ExtractionkioskBoard();
    const item = await board.item(data.id).withColumns([...COLUMNS]).execute();
    return item;
  });

export const updateEventStatus = createServerFn({ method: 'POST' })
  .validator(z.object({
    id: z.string(),
    statut: z.enum(['Validée', 'Annulée', 'À valider', 'Brouillon']),
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Mise à jour du statut', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    const board = new ExtractionkioskBoard();
    const updated = await board.item(data.id)
      .update({ statut: data.statut })
      .returnColumns(['statut'])
      .execute();
    return updated;
  });

export const updateEventValidations = createServerFn({ method: 'POST' })
  .validator(z.object({
    id: z.string(),
    validationTechnique: z.boolean().optional(),
    validationPolitique: z.boolean().optional(),
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Mise à jour des validations', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    const board = new ExtractionkioskBoard();
    const updateData: { validationTechnique?: boolean; validationPolitique?: boolean } = {};
    if (data.validationTechnique !== undefined) updateData.validationTechnique = data.validationTechnique;
    if (data.validationPolitique !== undefined) updateData.validationPolitique = data.validationPolitique;
    const updated = await board.item(data.id)
      .update(updateData)
      .returnColumns(['validationTechnique', 'validationPolitique'])
      .execute();
    return updated;
  });

/**
 * Valide un événement en un seul clic
 * 1. Met le statut à "Validée"
 * 2. Coche les validations Politique et Technique
 * 3. Coche "Validé par Date Clef" si viaPastilleDateClef = true
 * Note: L'événement n'est PAS archivé dans monday.com (il reste visible)
 * Il est considéré comme "archivé" visuellement si sa date est passée
 */
export const validateAndArchiveEvent = createServerFn({ method: 'POST' })
  .validator(z.object({
    id: z.string(),
    estLectureSeule: z.boolean().optional(),
    viaPastilleDateClef: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Validation', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    console.log(`🔒 Validation de l'événement ${data.id} via ${data.viaPastilleDateClef ? 'Date Clef' : 'Statut'}...`);
    console.log(`  📊 Paramètres reçus:`, {
      id: data.id,
      viaPastilleDateClef: data.viaPastilleDateClef,
      estLectureSeule: data.estLectureSeule
    });
    
    const board = new ExtractionkioskBoard();
    
    // Mettre à jour le statut + validations + flag Date Clef si applicable
    const updatePayload = {
      statut: 'Validée',
      validationTechnique: true,
      validationPolitique: true,
      validParDateClef: data.viaPastilleDateClef ?? false
    };
    console.log(`  ✏️ Mise à jour avec payload:`, updatePayload);
    
    const result = await board.item(data.id).update(updatePayload).execute();
    
    console.log(`✅ Événement validé avec succès - Résultat:`, result);
    return { success: true };
  });

/**
 * Valider toute une série d'événements (même nom)
 * Identifie tous les événements avec le même nom et les valide tous en batch
 */
export const validateEventSeries = createServerFn({ method: 'POST' })
  .validator(z.object({
    eventName: z.string(), // Le nom de l'événement (pour trouver toute la série)
    estLectureSeule: z.boolean().optional(),
    viaPastilleDateClef: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Validation de série', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    console.log(`🔒 Validation de la série complète: "${data.eventName}"`);
    
    const board = new ExtractionkioskBoard();
    
    // Trouver tous les événements de la série
    console.log(`  🔍 Recherche de tous les événements avec le nom "${data.eventName}"...`);
    
    const allEvents: any[] = [];
    let cursor: string | undefined = undefined;
    
    // Charger tous les événements avec ce nom (pagination)
    do {
      const page = await board.items()
        .withColumns(['nom', 'statut'])
        .where({ nom: { contains: data.eventName } })
        .withPagination({ limit: 500, cursor })
        .execute();
      
      // Filtrer pour ne garder que les correspondances exactes (contains peut être trop large)
      const exactMatches = (page.items ?? []).filter(item =>
        (item.nom || '').trim().toLowerCase() === data.eventName.trim().toLowerCase()
      );
      
      allEvents.push(...exactMatches);
      cursor = page.cursor ?? undefined;
    } while (cursor);
    
    console.log(`  ✅ Trouvé ${allEvents.length} événements dans la série`);
    
    if (allEvents.length === 0) {
      console.log('  ⚠️ Aucun événement trouvé avec ce nom');
      return { success: false, validated: 0, total: 0, message: 'Aucun événement trouvé' };
    }
    
    // Valider tous les événements en batch (par lots de 10 pour éviter les timeouts)
    let validated = 0;
    let failed = 0;
    const BATCH_SIZE = 10;
    
    console.log(`  🔄 Validation en batch (taille: ${BATCH_SIZE})...`);
    
    for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
      const batch = allEvents.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(allEvents.length / BATCH_SIZE);
      
      console.log(`  📦 Batch ${batchNum}/${totalBatches} (${batch.length} événements)...`);
      
      // Valider tous les événements du batch en parallèle
      const results = await Promise.allSettled(
        batch.map(event => 
          board.item(event.id).update({
            statut: 'Validée',
            validationTechnique: true,
            validationPolitique: true,
            validParDateClef: data.viaPastilleDateClef ?? false
          }).execute()
        )
      );
      
      // Compter succès et échecs
      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          validated++;
          console.log(`    ✅ ${batch[idx].name}`);
        } else {
          failed++;
          console.error(`    ❌ ${batch[idx].name}:`, result.reason);
        }
      });
      
      // Pause de 500ms entre batches pour éviter rate limits
      if (i + BATCH_SIZE < allEvents.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    
    console.log(`✅ Validation de série terminée: ${validated}/${allEvents.length} événements validés${failed > 0 ? ` (${failed} échecs)` : ''}`);
    return {
      success: true,
      validated,
      failed,
      total: allEvents.length,
      message: `${validated} événement(s) validé(s) dans la série`
    };
  });

export const getFilterOptions = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    console.log('[getFilterOptions] Starting...');
    const board = new ExtractionkioskBoard();
    
    const [quartiers, natures, statuts] = await Promise.all([
      board.aggregate().groupBy('quartier').countItems('count').execute(),
      board.aggregate().groupBy('nature').countItems('count').execute(),
      board.aggregate().groupBy('statut').countItems('count').execute(),
    ]);

    console.log('[getFilterOptions] Aggregates received');

    return {
      quartiers: quartiers?.map(r => ({ label: r.quartier, count: r.count })).filter(q => q.label) ?? [],
      natures: natures?.map(r => ({ label: r.nature, count: r.count })).filter(n => n.label) ?? [],
      statuts: statuts?.map(r => ({ label: r.statut, count: r.count })).filter(s => s.label) ?? [],
    };
  });

export const getEventStats = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    console.log('[getEventStats] Starting...');
    const board = new ExtractionkioskBoard();
    
    // Charger TOUS les événements avec pagination pour calculer les validations
    const allItems: Array<{ validationTechnique: boolean | null; validationPolitique: boolean | null }> = [];
    let cursor: string | undefined = undefined;
    let pageNum = 0;
    
    do {
      pageNum++;
      console.log(`[getEventStats] Loading page ${pageNum}...`);
      const page = await board.items()
        .withColumns(['validationTechnique', 'validationPolitique'])
        .withPagination({ limit: 500, cursor })
        .execute();
      
      allItems.push(...(page.items ?? []));
      cursor = page.cursor;
      
      console.log(`[getEventStats] Page ${pageNum}: ${page.items?.length ?? 0} items (total: ${allItems.length})`);
    } while (cursor);
    
    const totalCount = allItems.length;
    const validatedCount = allItems.filter(e => 
      e.validationTechnique === true && e.validationPolitique === true
    ).length;
    const pendingCount = totalCount - validatedCount;
    
    const [byStatut, byNature] = await Promise.all([
      board.aggregate().groupBy('statut').countItems('count').execute(),
      board.aggregate().groupBy('nature').countItems('count').execute(),
    ]);
    
    console.log('[getEventStats] Stats calculated - total:', totalCount, 'validated:', validatedCount, 'pending:', pendingCount);
    
    return {
      total: totalCount,
      validated: validatedCount,
      pending: pendingCount,
      byStatut: byStatut ?? [],
      byNature: byNature ?? [],
    };
  });

export const updateEventDates = createServerFn({ method: 'POST' })
  .validator(z.object({
    id: z.string(),
    dateDeDbut: z.string().nullable(),
    dateDeFin: z.string().nullable(),
    estLectureSeule: z.boolean(),
  }))
  .handler(async ({ data }) => {
    // Garde en lecture seule
    if (!garderEcriture('Mise à jour des dates', data.estLectureSeule)) {
      return { success: false, error: 'Mode lecture seule actif' };
    }

    try {
      const board = new ExtractionkioskBoard();
      await board.item(data.id).update({
        dateDeDbut: data.dateDeDbut,
        dateDeFin: data.dateDeFin,
      }).execute();
      
      return { success: true };
    } catch (e) {
      console.error('Error updating event dates:', e);
      throw new Error(e instanceof Error ? e.message : 'Erreur lors de la mise à jour des dates');
    }
  });

/**
 * Récupère le contexte utilisateur monday pour déterminer s'il est admin ou consultant
 */
export const getUserContext = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    try {
      const context = await mondaySdk.get('context') as any;
      
      const hasUser = 
        context?.user?.id || 
        context?.userId || 
        context?.account?.userId ||
        context?.data?.user?.id;

      const isViewer = context?.user?.isViewOnly === true || 
                      context?.user?.isGuest === true ||
                      context?.user?.kind === 'guest' ||
                      context?.user?.kind === 'viewer';

      return {
        hasUser: !!hasUser,
        isViewer,
        isAdmin: hasUser && !isViewer,
        userId: context?.user?.id,
        kind: context?.user?.kind
      };
    } catch (error) {
      console.error('Error fetching user context:', error);
      // En cas d'erreur, on retourne des valeurs par défaut (mode édition pour ne pas bloquer)
      return {
        hasUser: false,
        isViewer: false,
        isAdmin: true, // Par défaut admin pour ne pas bloquer
        userId: null,
        kind: null
      };
    }
  });
