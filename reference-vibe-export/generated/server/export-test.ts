import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';

/**
 * Exporte TOUTES les données du board au format CSV (compatible avec l'import)
 * Utile pour tester la déduplication : exporter → réimporter → vérifier que 0 doublons sont créés
 */
export const exportAllEventsAsCSV = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    const board = new ExtractionkioskBoard();
    
    console.log('📤 Export de toutes les données du board...');
    
    // Charger TOUS les événements (paginer si nécessaire)
    const allItems: Array<{
      nom: string | null;
      dateDeDbut: Date | null;
      dateDeFin: Date | null;
      lieu: string | null;
      quartier: string | null;
      pilote: string[] | null;
      directionPilote: string | null;
      organisateur: string | null;
      statut: string | null;
      nature: string | null;
      niveau: string | null;
      type: string | null;
      tardive: string | null;
      reprog: string | null;
    }> = [];
    
    let cursor: string | undefined = undefined;
    let pageNum = 0;
    
    do {
      pageNum++;
      console.log(`   Chargement page ${pageNum}...`);
      
      const page = await board.items()
        .withColumns([
          'nom', 'dateDeDbut', 'dateDeFin', 'lieu', 'quartier',
          'pilote', 'directionPilote', 'organisateur', 'statut',
          'nature', 'niveau', 'type', 'tardive', 'reprog'
        ])
        .withPagination({ limit: 500, cursor })
        .execute();
      
      allItems.push(...(page.items ?? []));
      cursor = page.cursor;
      
      console.log(`   → ${page.items?.length ?? 0} événements chargés (total: ${allItems.length})`);
    } while (cursor);
    
    console.log(`✅ Export terminé : ${allItems.length} événements`);
    
    // Générer le CSV (ordre EXACT des colonnes attendues par l'import)
    const headers = [
      'Date',
      'Date de début',
      'Date de fin',
      'Nom',
      'Lieu',
      'Quartier',
      'Pilote',
      'Direction pilote',
      'Organisateur',
      'Statut',
      'Nature',
      'Niveau',
      'Type',
      'Tardive',
      'Reprog'
    ];
    
    const rows: string[] = [headers.join(';')];
    
    for (const item of allItems) {
      const formatDate = (d: Date | null) => {
        if (!d) return '';
        const date = new Date(d);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      };
      
      const row = [
        formatDate(item.dateDeDbut),           // Date (= date de début)
        formatDate(item.dateDeDbut),           // Date de début
        formatDate(item.dateDeFin),             // Date de fin
        item.nom ?? '',                         // Nom
        item.lieu ?? '',                        // Lieu
        item.quartier ?? '',                    // Quartier
        Array.isArray(item.pilote) ? item.pilote.join(', ') : '', // Pilote
        item.directionPilote ?? '',             // Direction pilote
        item.organisateur ?? '',                // Organisateur
        item.statut ?? '',                      // Statut
        item.nature ?? '',                      // Nature
        item.niveau ?? '',                      // Niveau
        item.type ?? '',                        // Type
        item.tardive ?? '',                     // Tardive
        item.reprog ?? ''                       // Reprog
      ];
      
      // Échapper les champs contenant des ; ou des "
      const escapedRow = row.map(field => {
        if (field.includes(';') || field.includes('"') || field.includes('\n')) {
          return `"${field.replace(/"/g, '""')}"`;
        }
        return field;
      });
      
      rows.push(escapedRow.join(';'));
    }
    
    const csvContent = rows.join('\n');
    
    return {
      csv: csvContent,
      totalItems: allItems.length,
      filename: `test-reimport-${new Date().toISOString().split('T')[0]}.csv`
    };
  });
