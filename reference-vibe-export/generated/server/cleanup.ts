import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';
import { garderEcriture } from '@generated/utils/access';

// Step 1: Fetch all item IDs from the board
export const fetchAllItemIds = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    const board = new ExtractionkioskBoard();
    const allIds: string[] = [];
    let cursor: string | undefined;

    let pageNum = 0;
    do {
      if (pageNum > 0) {
        await new Promise(r => setTimeout(r, 300));
      }
      const page = await board.items()
        .withPagination(cursor ? { limit: 500, cursor } : { limit: 500 })
        .execute();

      for (const item of page.items ?? []) {
        allIds.push(item.id);
      }
      cursor = page.cursor ?? undefined;
      pageNum++;
    } while (cursor);

    console.log(`fetchAllItemIds: found ${allIds.length} items`);
    return { ids: allIds, total: allIds.length };
  });

/**
 * Helper function to retry a request with exponential backoff on 429
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const is429 = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
      
      if (is429 && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = 1000 * Math.pow(2, attempt);
        console.warn(`⚠️ Rate limit hit (429), retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      // If not a 429 or we've exhausted retries, throw
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded');
}

// Step 2: Delete a batch of items (called multiple times from the client)
export const deleteBatch = createServerFn({ method: 'POST' })
  .validator(z.object({ 
    ids: z.array(z.string()),
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Suppression d\'éléments', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    const board = new ExtractionkioskBoard();
    let deleted = 0;
    let failed = 0;

    // Process items SEQUENTIALLY (not in parallel) to avoid rate limits
    // With a delay between each item to respect Monday API limits
    for (let i = 0; i < data.ids.length; i++) {
      const id = data.ids[i];
      
      try {
        // AVANT d'archiver : cocher les validations politique et technique
        // Logique : un événement archivé (date révolue) a forcément eu lieu, donc validations OK
        console.log(`🔒 [${i + 1}/${data.ids.length}] Validation automatique de l'événement ${id} avant archivage...`);
        await retryWithBackoff(() => 
          board.item(id).update({
            validationPolitique: true,
            validationTechnique: true
          }).execute()
        );
        
        // Petit délai entre l'update et l'archive
        await new Promise(r => setTimeout(r, 100));
        
        // Puis archiver
        console.log(`📦 [${i + 1}/${data.ids.length}] Archivage de l'événement ${id}...`);
        await retryWithBackoff(() => board.item(id).archive().execute());
        deleted++;
        
        console.log(`✅ [${i + 1}/${data.ids.length}] Événement ${id} validé et archivé avec succès`);
        
        // Add a small delay between deletions to avoid rate limiting
        // 200ms = max 5 deletions/second = 300/minute (well within limits)
        if (i < data.ids.length - 1) {
          await new Promise(r => setTimeout(r, 200));
        }
      } catch (error) {
        console.error(`❌ Failed to delete item ${id}:`, error);
        failed++;
      }
      
      // Log progress every 10 items
      if ((i + 1) % 10 === 0) {
        console.log(`📊 Progress: ${i + 1}/${data.ids.length} items processed (${deleted} deleted, ${failed} failed)`);
      }
    }

    console.log(`✅ deleteBatch complete: deleted ${deleted}, failed ${failed}`);
    return { deleted, failed };
  });
