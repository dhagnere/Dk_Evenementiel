import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Fonction de diagnostic pour analyser un fichier CSV/Excel
 * Affiche exactement ce que le parseur voit pour identifier les problèmes de mapping
 */
export const debugImport = createServerFn({ method: 'POST' })
  .validator(z.object({
    csvContent: z.string(),
  }))
  .handler(async ({ data }) => {
    const lines = data.csvContent.split('\n').filter(l => l.trim());
    
    if (lines.length === 0) {
      return { error: 'Fichier vide' };
    }

    // Parse la première ligne (en-têtes)
    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine);
    
    // Parse quelques lignes de données (max 5)
    const dataRows = lines.slice(1, 6).map(line => parseCSVLine(line));
    
    // Créer un rapport détaillé
    const report = {
      totalLines: lines.length,
      headers: headers.map((h, i) => ({
        index: i,
        value: h,
        normalized: normalizeHeader(h),
        length: h.length,
        hasSpecialChars: /[#;,"\n\r]/.test(h),
      })),
      sampleRows: dataRows.map((row, rowIndex) => ({
        rowNumber: rowIndex + 2, // +2 car ligne 1 = headers, et index start à 0
        cells: row.map((cell, cellIndex) => ({
          columnIndex: cellIndex,
          columnName: headers[cellIndex] || '(hors limite)',
          value: cell,
          length: cell.length,
          hasSpecialChars: /[#;,"\n\r]/.test(cell),
        })),
        columnCount: row.length,
        matchesHeaderCount: row.length === headers.length,
      })),
      headerCount: headers.length,
      issues: [] as string[],
    };

    // Détecter les problèmes
    dataRows.forEach((row, i) => {
      if (row.length !== headers.length) {
        report.issues.push(
          `Ligne ${i + 2}: ${row.length} colonnes au lieu de ${headers.length} attendues`
        );
      }
    });

    // Vérifier les caractères spéciaux dans les en-têtes
    headers.forEach((h, i) => {
      if (/[#;,"\n\r]/.test(h)) {
        report.issues.push(
          `En-tête colonne ${i} "${h}" contient des caractères spéciaux`
        );
      }
    });

    return report;
  });

/**
 * Parse une ligne CSV en respectant les guillemets
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Double quote = escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of cell
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last cell
  result.push(current.trim());
  
  return result;
}

/**
 * Normalise un en-tête pour le matching
 */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .trim()
    .replace(/\s+/g, ' '); // Normalize spaces
}
