/**
 * Utilitaire pour fusionner automatiquement les événements multi-jours
 * lors de l'import d'un fichier Excel
 */

/**
 * Clé simple pour regrouper les événements (nom + lieu uniquement, sans date)
 */
function makeSimpleKey(nom: string, lieu: string | null | undefined): string {
  const n = (nom || '').trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const l = (lieu || '').trim().toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return `${n}|${l}`;
}

/**
 * Groupe les événements par nom + lieu
 */
interface EventRecord {
  nom: string;
  dateDeDbut?: string | null;
  dateDeFin?: string | null;
  lieu?: string | null;
  [key: string]: unknown;
}

export function mergeContiguousEvents(records: EventRecord[]): {
  merged: EventRecord[];
  stats: {
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
} {
  console.log('\n🔄 FUSION AUTOMATIQUE DES ÉVÉNEMENTS MULTI-JOURS');
  console.log(`📋 ${records.length} lignes dans le fichier Excel`);
  
  // Grouper par nom + lieu
  const groups = new Map<string, EventRecord[]>();
  
  for (const rec of records) {
    const nom = rec.nom as string;
    const lieu = rec.lieu as string | null | undefined;
    const key = makeSimpleKey(nom, lieu);
    
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(rec);
  }
  
  console.log(`📊 ${groups.size} événements uniques (nom + lieu)`);
  
  const merged: EventRecord[] = [];
  const mergedGroups: Array<{
    nom: string;
    lieu: string | null;
    originalLines: number;
    dateDebut: string;
    dateFin: string;
    durationDays: number;
  }> = [];
  
  for (const [_key, groupRecords] of groups.entries()) {
    if (groupRecords.length === 1) {
      // Un seul événement → garder tel quel
      merged.push(groupRecords[0]);
      continue;
    }
    
    // Plusieurs lignes pour le même événement → analyser
    const nom = groupRecords[0].nom as string;
    const lieu = groupRecords[0].lieu as string | null | undefined;
    
    // Extraire et trier les dates
    const dates = groupRecords
      .map(r => r.dateDeDbut ? new Date(r.dateDeDbut as string) : null)
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());
    
    if (dates.length === 0) {
      // Pas de dates valides → garder le premier
      merged.push(groupRecords[0]);
      console.warn(`⚠️ "${nom}" : ${groupRecords.length} lignes mais aucune date valide`);
      continue;
    }
    
    // Vérifier si les dates sont contiguës
    let isContiguous = true;
    for (let i = 1; i < dates.length; i++) {
      const prevDate = dates[i - 1];
      const currDate = dates[i];
      const diffInDays = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffInDays > 1) {
        isContiguous = false;
        break;
      }
    }
    
    if (isContiguous && dates.length > 1) {
      // Série contiguë → FUSIONNER
      const firstDate = dates[0];
      const lastDate = dates[dates.length - 1];
      const durationDays = Math.floor((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      
      // Créer un événement fusionné
      const mergedEvent: EventRecord = {
        ...groupRecords[0], // Copier toutes les données du premier
        dateDeDbut: firstDate.toISOString(),
        dateDeFin: lastDate.toISOString()
      };
      
      merged.push(mergedEvent);
      
      console.log(
        `✅ FUSION: "${nom}" (${lieu || 'sans lieu'})\n` +
        `   ${groupRecords.length} lignes → 1 événement\n` +
        `   ${firstDate.toLocaleDateString('fr-FR')} → ${lastDate.toLocaleDateString('fr-FR')} (${durationDays} jours)`
      );
      
      mergedGroups.push({
        nom,
        lieu: lieu || null,
        originalLines: groupRecords.length,
        dateDebut: firstDate.toLocaleDateString('fr-FR'),
        dateFin: lastDate.toLocaleDateString('fr-FR'),
        durationDays
      });
    } else {
      // Dates non contiguës → garder séparés
      merged.push(...groupRecords);
      console.log(
        `⏭️ NON FUSIONNÉ: "${nom}" (${lieu || 'sans lieu'})\n` +
        `   ${groupRecords.length} lignes avec dates non contiguës → conservées séparément`
      );
    }
  }
  
  const reductionCount = records.length - merged.length;
  
  console.log(`\n📊 RÉSULTAT FUSION:`);
  console.log(`   • Lignes originales: ${records.length}`);
  console.log(`   • Lignes après fusion: ${merged.length}`);
  console.log(`   • Réduction: ${reductionCount} lignes fusionnées`);
  console.log(`   • ${mergedGroups.length} événements fusionnés\n`);
  
  return {
    merged,
    stats: {
      originalCount: records.length,
      mergedCount: merged.length,
      reductionCount,
      mergedGroups
    }
  };
}

/**
 * Crée une clé de déduplication souple (nom + lieu uniquement)
 * pour détecter les doublons même si les dates ont changé
 */
export function makeSoftKey(nom: string | null | undefined, lieu: string | null | undefined): string {
  return makeSimpleKey(nom || '', lieu);
}
