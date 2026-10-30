import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';
import { garderEcriture } from '@generated/utils/access';

/**
 * Fonction de nettoyage des doublons dans le board
 * 
 * Stratégie :
 * 1. Charge TOUS les événements du board
 * 2. Groupe par clé unique (nom + dateDeDbut + lieu + organisateur)
 * 3. Pour chaque groupe avec doublons, garde LE MEILLEUR et supprime les autres
 * 
 * Critères de sélection du "meilleur" :
 * - Priorité 1 : Événement validé (technique + politique) > non validé
 * - Priorité 2 : Événement avec Date Clef > sans Date Clef
 * - Priorité 3 : Plus récent (createdAt)
 */

function makeDeduplicationKey(
  nom: string | null,
  dateDeDebut: Date | string | null,
  lieu: string | null,
  organisateur: string | null
): string {
  const n = (nom || '').trim().toLowerCase();
  const d = dateDeDebut ? (typeof dateDeDebut === 'string' ? dateDeDebut : dateDeDebut.toISOString().split('T')[0]) : '';
  const l = (lieu || '').trim().toLowerCase();
  const o = (organisateur || '').trim().toLowerCase();
  return `${n}_${d}_${l}_${o}`;
}

export const findAndCleanDuplicates = createServerFn({ method: 'POST' })
  .validator(z.object({
    dryRun: z.boolean().optional(), // Si true, ne supprime rien, juste liste les doublons
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    const dryRun = data.dryRun ?? false;
    
    // Garde en mode lecture seule
    if (!dryRun && !garderEcriture('Nettoyage des doublons', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }

    console.log(`🧹 Démarrage du nettoyage des doublons (dryRun: ${dryRun})...`);
    
    const board = new ExtractionkioskBoard();
    
    // Charger tous les événements (peut prendre du temps sur gros boards)
    console.log('Chargement de tous les événements du board...');
    
    // Premier chargement pour obtenir le type
    const firstPage = await board.items()
      .withColumns([
        'nom',
        'dateDeDbut',
        'dateDeFin',
        'lieu',
        'organisateur',
        'statut',
        'validationTechnique',
        'validationPolitique',
        'validParDateClef'
      ])
      .withPagination({ limit: 500 })
      .execute();
    
    type BoardItem = NonNullable<typeof firstPage.items>[number];
    let allItems: BoardItem[] = [...(firstPage.items ?? [])];
    let cursor: string | undefined = firstPage.cursor ?? undefined;
    
    console.log(`  Chargé ${allItems.length} événements (page terminée)...`);
    
    while (cursor) {
      const page = await board.items()
        .withColumns([
          'nom',
          'dateDeDbut',
          'dateDeFin',
          'lieu',
          'organisateur',
          'statut',
          'validationTechnique',
          'validationPolitique',
          'validParDateClef'
        ])
        .withPagination({ limit: 500, cursor })
        .execute();
      
      allItems = allItems.concat(page.items ?? []);
      cursor = page.cursor ?? undefined;
      
      console.log(`  Chargé ${allItems.length} événements (page terminée)...`);
    }
    
    console.log(`✅ Total chargé : ${allItems.length} événements`);
    
    // Grouper par clé de déduplication
    const groups = new Map<string, BoardItem[]>();
    
    for (const item of allItems) {
      const key = makeDeduplicationKey(
        item.nom,
        item.dateDeDbut,
        item.lieu,
        item.organisateur
      );
      
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    }
    
    console.log(`Groupes créés : ${groups.size} clés uniques`);
    
    // Identifier les doublons (groupes avec plus d'un événement)
    const duplicateGroups: Array<{
      key: string;
      nom: string | null;
      dateDeDebut: string | null;
      lieu: string | null;
      count: number;
      toKeep: BoardItem;
      toDelete: BoardItem[];
    }> = [];
    
    for (const [key, items] of groups.entries()) {
      if (items.length <= 1) continue; // Pas de doublon
      
      // Trier pour garder le meilleur
      items.sort((a, b) => {
        // Priorité 1 : Validé (technique + politique)
        const aValidated = (a.validationTechnique === true && a.validationPolitique === true);
        const bValidated = (b.validationTechnique === true && b.validationPolitique === true);
        if (aValidated && !bValidated) return -1;
        if (!aValidated && bValidated) return 1;
        
        // Priorité 2 : Date Clef
        const aDateClef = a.validParDateClef === true;
        const bDateClef = b.validParDateClef === true;
        if (aDateClef && !bDateClef) return -1;
        if (!aDateClef && bDateClef) return 1;
        
        // Priorité 3 : Plus récent (createdAt)
        const aCreated = new Date(a.createdAt).getTime();
        const bCreated = new Date(b.createdAt).getTime();
        return bCreated - aCreated; // Plus récent en premier
      });
      
      const toKeep = items[0];
      const toDelete = items.slice(1);
      
      duplicateGroups.push({
        key,
        nom: toKeep.nom,
        dateDeDebut: toKeep.dateDeDbut ? (typeof toKeep.dateDeDbut === 'string' ? toKeep.dateDeDbut : toKeep.dateDeDbut.toISOString().split('T')[0]) : null,
        lieu: toKeep.lieu,
        count: items.length,
        toKeep,
        toDelete
      });
      
      console.log(`📋 Doublon détecté: "${toKeep.nom || toKeep.name}" (${items.length} exemplaires)`);
      console.log(`   Gardé: ${toKeep.name} (validé: ${toKeep.validationTechnique && toKeep.validationPolitique ? 'oui' : 'non'}, Date Clef: ${toKeep.validParDateClef ? 'oui' : 'non'})`);
      toDelete.forEach(d => {
        console.log(`   Supprimé: ${d.name} (validé: ${d.validationTechnique && d.validationPolitique ? 'oui' : 'non'}, Date Clef: ${d.validParDateClef ? 'oui' : 'non'})`);
      });
    }
    
    console.log(`🔍 Doublons trouvés : ${duplicateGroups.length} groupes`);
    
    if (dryRun) {
      console.log('🔍 Mode DRY RUN : aucune suppression effectuée');
      return {
        dryRun: true,
        duplicatesFound: duplicateGroups.length,
        totalDuplicateItems: duplicateGroups.reduce((sum, g) => sum + g.toDelete.length, 0),
        duplicates: duplicateGroups.map(g => ({
          nom: g.nom,
          dateDeDebut: g.dateDeDebut,
          lieu: g.lieu,
          count: g.count,
          kept: g.toKeep.name,
          deleted: g.toDelete.map(d => d.name)
        }))
      };
    }
    
    // Supprimer les doublons (un par un pour garantir la fiabilité)
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];
    
    for (const group of duplicateGroups) {
      for (const item of group.toDelete) {
        try {
          console.log(`🗑️ Suppression de ${item.name}...`);
          await board.item(item.id).archive().execute();
          deleted++;
          console.log(`✅ ${item.name} supprimé`);
          
          // Pause de 200ms entre suppressions pour éviter rate limits
          await new Promise(r => setTimeout(r, 200));
        } catch (e) {
          failed++;
          const errorMsg = e instanceof Error ? e.message : String(e);
          console.error(`❌ Erreur lors de la suppression de ${item.name}:`, errorMsg);
          errors.push(`${item.name}: ${errorMsg}`);
        }
      }
    }
    
    console.log(`✅ Nettoyage terminé : ${deleted} doublons supprimés, ${failed} échecs`);
    
    return {
      dryRun: false,
      duplicatesFound: duplicateGroups.length,
      deleted,
      failed,
      errors,
      details: duplicateGroups.map(g => ({
        nom: g.nom,
        dateDeDebut: g.dateDeDebut,
        lieu: g.lieu,
        count: g.count,
        kept: g.toKeep.name,
        deleted: g.toDelete.map(d => d.name)
      }))
    };
  });
