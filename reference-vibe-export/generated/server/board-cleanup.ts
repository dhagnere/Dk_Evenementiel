import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';
import { garderEcriture } from '@generated/utils/access';

/**
 * Détecte et archive les doublons dans le board
 * Garde uniquement la ligne la plus récente (par createdAt) pour chaque doublon
 */
export const cleanDuplicatesInBoard = createServerFn({ method: 'POST' })
  .validator(z.object({
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Nettoyage des doublons', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }

    const board = new ExtractionkioskBoard();
    
    console.log('🧹 Début du nettoyage des doublons...');
    
    // OPTIMISATION : Charger UNE SEULE page pour éviter timeout
    // L'utilisateur peut relancer pour traiter les pages suivantes
    const LIMIT = 500;
    
    console.log(`📄 Chargement d'une page (${LIMIT} items max)...`);
    const page = await board.items()
      .withColumns(['nom', 'dateDeDbut', 'dateDeFin', 'lieu', 'organisateur'])
      .withPagination({ limit: LIMIT })
      .execute();
    
    const allItems: Array<{
      id: string;
      name: string;
      nom: string | null;
      dateDeDbut: Date | null;
      dateDeFin: Date | null;
      lieu: string | null;
      organisateur: string | null;
      createdAt: Date;
    }> = [];

    for (const item of page.items ?? []) {
      allItems.push({
        id: item.id,
        name: item.name,
        nom: item.nom ?? null,
        dateDeDbut: item.dateDeDbut ?? null,
        dateDeFin: item.dateDeFin ?? null,
        lieu: item.lieu ?? null,
        organisateur: item.organisateur ?? null,
        createdAt: item.createdAt,
      });
    }

    console.log(`📊 Total items chargés: ${allItems.length}`);

    // Grouper par clé de déduplication (nom + dateDeDebut + lieu + organisateur)
    const groupedByKey = new Map<string, typeof allItems>();
    
    for (const item of allItems) {
      const key = makeDeduplicationKey(
        item.nom ?? item.name,
        item.dateDeDbut,
        item.lieu,
        item.organisateur,
        item.dateDeFin
      );
      
      if (!groupedByKey.has(key)) {
        groupedByKey.set(key, []);
      }
      groupedByKey.get(key)!.push(item);
    }

    // Trouver les doublons (groupes avec plus d'1 item)
    const duplicateGroups = Array.from(groupedByKey.entries())
      .filter(([_, items]) => items.length > 1);

    console.log(`🔍 Groupes de doublons détectés: ${duplicateGroups.length}`);

    if (duplicateGroups.length === 0) {
      return { 
        totalDuplicates: 0, 
        archived: 0, 
        kept: 0,
        details: []
      };
    }

    // Pour chaque groupe de doublons, garder le plus récent et archiver les autres
    // LIMITE: max 50 archivages par appel pour éviter timeout Lambda (50 × 150ms = 7.5s)
    const MAX_ARCHIVES_PER_CALL = 50;
    let archived = 0;
    let totalToArchive = 0;
    const details: Array<{ nom: string; kept: string; archived: string[] }> = [];

    // Compter le nombre total d'items à archiver
    for (const [_, items] of duplicateGroups) {
      totalToArchive += items.length - 1;
    }

    console.log(`📊 Total à archiver: ${totalToArchive} items (limite: ${MAX_ARCHIVES_PER_CALL} par appel)`);

    for (const [_key, items] of duplicateGroups) {
      // Si on a atteint la limite, arrêter
      if (archived >= MAX_ARCHIVES_PER_CALL) {
        console.log(`⚠️ Limite atteinte (${MAX_ARCHIVES_PER_CALL}), arrêt. Relancez pour continuer.`);
        break;
      }

      // Trier par date de création (plus récent en premier)
      items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      
      const toKeep = items[0];
      const toArchive = items.slice(1);

      console.log(`📦 Groupe "${toKeep.nom || toKeep.name}": garder ${toKeep.id}, archiver ${toArchive.length} items`);

      const archivedIds: string[] = [];
      
      // Archiver les doublons (séquentiellement pour éviter 429)
      for (const item of toArchive) {
        // Vérifier la limite avant chaque archivage
        if (archived >= MAX_ARCHIVES_PER_CALL) {
          console.log(`⚠️ Limite atteinte pour ce groupe, items restants sautés`);
          break;
        }

        try {
          await board.item(item.id).archive().execute();
          archived++;
          archivedIds.push(item.id);
          console.log(`  ✅ Archivé: ${item.id} (${item.name}) [${archived}/${MAX_ARCHIVES_PER_CALL}]`);
          
          // Pause de 50ms pour éviter rate limiting (compromis vitesse/fiabilité)
          if (archived < MAX_ARCHIVES_PER_CALL) {
            await new Promise(r => setTimeout(r, 50));
          }
        } catch (e) {
          console.error(`  ❌ Erreur archivage ${item.id}:`, e);
        }
      }

      if (archivedIds.length > 0) {
        details.push({
          nom: toKeep.nom || toKeep.name,
          kept: toKeep.id,
          archived: archivedIds
        });
      }
    }

    console.log(`✅ Nettoyage terminé: ${archived} doublons archivés sur ${totalToArchive}`);
    
    const remaining = totalToArchive - archived;
    const loadedOnePage = allItems.length === LIMIT; // Si on a chargé exactement 500, il y a peut-être une autre page

    return {
      totalDuplicates: totalToArchive,
      archived,
      kept: details.length,
      remaining, // Nombre d'items restants à archiver dans la page actuelle
      mightHaveMore: loadedOnePage && remaining === 0, // Pourrait y avoir d'autres doublons dans les pages suivantes
      details
    };
  });

/**
 * Renumérotise tous les items EVT-YYYY-NNNN pour qu'ils soient consécutifs
 */
export const renumberEventIds = createServerFn({ method: 'POST' })
  .validator(z.object({
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Renumérotation des événements', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }

    const board = new ExtractionkioskBoard();
    
    console.log('🔢 Début de la renumérotation...');
    
    // Charger tous les items actifs (non archivés)
    const allItems: Array<{
      id: string;
      name: string;
      dateDeDbut: Date | null;
    }> = [];

    let cursor: string | undefined;
    let pageNum = 0;
    do {
      const page = await board.items()
        .withColumns(['dateDeDbut'])
        .withPagination(cursor ? { limit: 500, cursor } : { limit: 500 })
        .execute();
      
      for (const item of page.items ?? []) {
        allItems.push({
          id: item.id,
          name: item.name,
          dateDeDbut: item.dateDeDbut ?? null,
        });
      }
      cursor = page.cursor ?? undefined;
      pageNum++;
    } while (cursor);

    console.log(`📊 Total items à renuméroter: ${allItems.length}`);

    // Trier par date de début (puis par name pour stabilité)
    allItems.sort((a, b) => {
      const dateA = a.dateDeDbut?.getTime() ?? 0;
      const dateB = b.dateDeDbut?.getTime() ?? 0;
      if (dateA !== dateB) return dateA - dateB;
      return a.name.localeCompare(b.name);
    });

    // Grouper par année
    const byYear = new Map<number, typeof allItems>();
    for (const item of allItems) {
      const year = item.dateDeDbut?.getFullYear() ?? new Date().getFullYear();
      if (!byYear.has(year)) {
        byYear.set(year, []);
      }
      byYear.get(year)!.push(item);
    }

    let totalRenamed = 0;
    const MAX_RENAMES_PER_CALL = 300; // Limite pour éviter timeout (300 × 50ms = 15s + lecture)
    const renameLog: Array<{ oldName: string; newName: string }> = [];

    console.log(`⚙️ Limite de renumérotation: ${MAX_RENAMES_PER_CALL} items par appel`);

    // Renuméroter par année
    for (const [year, items] of Array.from(byYear.entries()).sort((a, b) => a[0] - b[0])) {
      console.log(`📅 Année ${year}: ${items.length} items`);
      
      // Arrêter si on atteint la limite
      if (totalRenamed >= MAX_RENAMES_PER_CALL) {
        console.log(`⚠️ Limite de ${MAX_RENAMES_PER_CALL} renumérotations atteinte, arrêt`);
        break;
      }
      
      let seq = 1;
      for (const item of items) {
        // Vérifier la limite avant chaque renommage
        if (totalRenamed >= MAX_RENAMES_PER_CALL) {
          console.log(`⚠️ Limite atteinte pour cette année, items restants sautés`);
          break;
        }

        const newName = `EVT-${year}-${String(seq).padStart(4, '0')}`;
        
        if (item.name !== newName) {
          try {
            // Renommer l'item
            await board.item(item.id).update({ name: newName }).execute();
            totalRenamed++;
            renameLog.push({ oldName: item.name, newName });
            console.log(`  ✅ ${item.name} → ${newName}`);
            
            // Pause de 50ms pour éviter rate limiting
            await new Promise(r => setTimeout(r, 50));
          } catch (e) {
            console.error(`  ❌ Erreur renommage ${item.id}:`, e);
          }
        }
        
        seq++;
      }
    }

    console.log(`✅ Renumérotation terminée: ${totalRenamed} items renommés sur ${allItems.length} total`);

    return {
      totalItems: allItems.length,
      renamed: totalRenamed,
      reachedLimit: totalRenamed >= MAX_RENAMES_PER_CALL, // Indique si la limite a été atteinte
      byYear: Array.from(byYear.entries()).map(([year, items]) => ({ year, count: items.length })),
      log: renameLog.slice(0, 50) // Limiter le log aux 50 premiers
    };
  });

/**
 * Normalise une chaîne pour la comparaison de déduplication
 * IDENTIQUE à la fonction côté client pour garantir la cohérence
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
 * Génère une clé de déduplication (IDENTIQUE à makeKey côté client)
 * ⚠️ CRITIQUE : Doit utiliser exactement la même logique que makeKey pour cohérence
 */
function makeDeduplicationKey(
  nom: string | null | undefined,
  dateDeDbut: Date | null | undefined,
  lieu: string | null | undefined,
  organisateur: string | null | undefined,
  dateDeFin?: Date | null | undefined
): string {
  // Normalisation stricte du nom
  const n = normalizeForDedup(nom);
  
  // Normalisation des dates (format YYYY-MM-DD)
  let dDebut = '';
  if (dateDeDbut) {
    dDebut = dateDeDbut.toISOString().split('T')[0];
  }
  
  let dFin = '';
  if (dateDeFin) {
    dFin = dateDeFin.toISOString().split('T')[0];
  }
  
  // Normalisation du lieu et organisateur
  const l = normalizeForDedup(lieu);
  const o = normalizeForDedup(organisateur);
  
  return `${n}|${dDebut}|${dFin}|${l}|${o}`;
}
