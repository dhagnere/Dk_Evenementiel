import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ExtractionkioskBoard } from '@api/BoardSDK';
import { garderEcriture } from '@generated/utils/access';
import {
  validateStatusValue,
  VALID_QUARTIERS,
  VALID_NATURES,
  VALID_NIVEAUX,
  VALID_TYPES,
  VALID_TARDIVE,
  VALID_REPROG,
  VALID_STATUTS,
  VALID_PILOTES
} from '@generated/utils/board-columns-reference';

/**
 * Helper function to retry an operation with exponential backoff
 * Garantit la fiabilité absolue de l'import en cas d'erreurs temporaires (429, timeout, etc.)
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  itemIdentifier: string,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const is429 = errorMsg.includes('429') || errorMsg.includes('Too Many Requests');
      const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT');
      const isServerError = errorMsg.includes('500') || errorMsg.includes('502') || errorMsg.includes('503');
      
      // Retry on 429 (rate limit), timeout, or server errors
      if ((is429 || isTimeout || isServerError) && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delayMs = 1000 * Math.pow(2, attempt);
        console.warn(`⚠️ [${itemIdentifier}] ${is429 ? 'Rate limit (429)' : isTimeout ? 'Timeout' : 'Server error'} - Retry ${attempt + 1}/${maxRetries} dans ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      
      // If not a retriable error or we've exhausted retries
      console.error(`❌ [${itemIdentifier}] Échec définitif après ${attempt + 1} tentatives:`, errorMsg);
      throw error;
    }
  }
  
  throw new Error(`[${itemIdentifier}] Max retries (${maxRetries}) dépassé`);
}

// ─── Step 1: Parse the uploaded file and return all rows as JSON ───
export const parseUploadedFile = createServerFn({ method: 'POST' })
  .validator((data: FormData) => data)
  .handler(async ({ data }) => {
    const file = data.get('file') as File;
    if (!file) throw new Error('Aucun fichier fourni');

    const fileName = file.name.toLowerCase();
    const isCSV = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    if (!isCSV && !isExcel) throw new Error('Format non valide. CSV ou Excel uniquement.');

    let rows: string[][] = [];
    if (isCSV) {
      // Pour CSV, essayer d'abord UTF-8, puis Windows-1252 si échec
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      
      // Essayer UTF-8 d'abord
      let text = new TextDecoder('utf-8').decode(bytes);
      
      // Détecter si UTF-8 a échoué (présence de caractères de remplacement �)
      if (text.includes('�')) {
        console.log('⚠️ UTF-8 a échoué, tentative avec Windows-1252...');
        text = new TextDecoder('windows-1252').decode(bytes);
      }
      
      rows = parseCSV(text);
    } else {
      rows = await parseXLSX(new Uint8Array(await file.arrayBuffer()));
    }

    if (rows.length < 2) throw new Error('Fichier vide ou sans données.');

    const headers = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => c.trim() !== ''));

    // Nettoyer les caractères de remplacement � dans toutes les cellules
    const cleanedRows = dataRows.map(row => 
      row.map(cell => {
        // Si la cellule contient �, essayer de la nettoyer
        if (cell.includes('�')) {
          console.warn(`⚠️ Caractère de remplacement détecté: "${cell}"`);
          // Malheureusement, on ne peut pas récupérer le caractère original
          // Signaler à l'utilisateur
        }
        return cell;
      })
    );

    console.log(`parseUploadedFile: ${cleanedRows.length} data rows, headers: ${headers.join(', ')}`);
    return { headers, dataRows: cleanedRows, totalRows: cleanedRows.length };
  });

// ─── Step 2: Fetch existing items for deduplication (ultra-fast version) ───
export const fetchExistingForImport = createServerFn({ method: 'GET' })
  .validator(z.object({}).optional())
  .handler(async () => {
    const board = new ExtractionkioskBoard();
    
    // Strategy: Load ONLY the first page (500 items) to find maxSeq quickly
    // This avoids timeout on large boards. Deduplication will happen via create/update logic.
    console.log('fetchExistingForImport: loading first 500 items only (fast mode)...');
    
    try {
      const page = await board.items()
        // Minimum columns: only what we need for deduplication key (nom + dateDeDbut + lieu)
        .withColumns(['nom', 'dateDeDbut', 'lieu'])
        .withPagination({ limit: 500 })
        .execute();
      
      const existing: Array<{
        id: string; name: string; nom: string | null;
        dateDeDbut: Date | null; lieu: string | null;
      }> = [];
      
      for (const item of page.items ?? []) {
        existing.push({
          id: item.id,
          name: item.name,
          nom: item.nom ?? null,
          dateDeDbut: item.dateDeDbut ?? null,
          lieu: item.lieu ?? null,
        });
      }
      
      // Find highest EVT sequence
      let maxSeq = 0;
      for (const item of existing) {
        const m = item.name.match(/^EVT-\d{4}-(\d+)$/);
        if (m) {
          const n = parseInt(m[1], 10);
          if (n > maxSeq) maxSeq = n;
        }
      }

      console.log(`fetchExistingForImport: ${existing.length} items loaded (first page only), maxSeq=${maxSeq}`);
      return { existing, maxSeq };
    } catch (e) {
      console.error('fetchExistingForImport: error:', e);
      // Fallback: return empty to allow import to continue
      return { existing: [], maxSeq: 0 };
    }
  });

// ─── Step 3: Create a batch of NEW items ───
export const createItemsBatch = createServerFn({ method: 'POST' })
  .validator(z.object({
    items: z.array(z.object({
      autoId: z.string(),
      rowData: z.record(z.string(), z.unknown()),
    })),
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Création d\'éléments', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    const board = new ExtractionkioskBoard();
    let created = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`📦 createItemsBatch: Traitement de ${data.items.length} nouveaux événements...`);
    
    // Process sequentially with retry and delay to GUARANTEE complete processing
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const progress = `${i + 1}/${data.items.length}`;
      
      try {
        const createData: Record<string, unknown> = {};

        // Map all fields from rowData
        for (const [key, value] of Object.entries(item.rowData)) {
          if (key === 'name') continue; // We set name from autoId
          // Skip validations during creation (they're false by default)
          if (key === 'validationTechnique' || key === 'validationPolitique') continue;
          
          // Handle dates
          if (key === 'dateDeDbut' || key === 'dateDeFin' || key === 'date') {
            if (value) createData[key] = new Date(value as string);
          } 
          // Handle dropdown (pilote is an array)
          else if (key === 'pilote') {
            const piloteValue = Array.isArray(value) ? value : (value ? [value] : []);
            // Validate each pilote name
            const validatedPilotes = piloteValue
              .map(p => validateStatusValue(String(p), VALID_PILOTES))
              .filter(Boolean) as string[];
            if (validatedPilotes.length > 0) createData[key] = validatedPilotes;
          }
          // Handle status columns (validate against allowed values)
          else if (key === 'quartier') {
            const validated = validateStatusValue(String(value), VALID_QUARTIERS);
            if (validated) createData[key] = validated;
          }
          else if (key === 'nature') {
            const validated = validateStatusValue(String(value), VALID_NATURES);
            if (validated) createData[key] = validated;
          }
          else if (key === 'niveau') {
            const validated = validateStatusValue(String(value), VALID_NIVEAUX);
            if (validated) createData[key] = validated;
          }
          else if (key === 'type') {
            const validated = validateStatusValue(String(value), VALID_TYPES);
            if (validated) createData[key] = validated;
          }
          else if (key === 'tardive') {
            const validated = validateStatusValue(String(value), VALID_TARDIVE);
            if (validated) createData[key] = validated;
          }
          else if (key === 'reprog') {
            const validated = validateStatusValue(String(value), VALID_REPROG);
            if (validated) createData[key] = validated;
          }
          else if (key === 'statut') {
            const validated = validateStatusValue(String(value), VALID_STATUTS);
            if (validated) createData[key] = validated;
          }
          // Handle text fields (nom, lieu, directionPilote, organisateur)
          else if (value !== null && value !== undefined && value !== '') {
            createData[key] = value;
          }
        }

        // Set the monday.com item name (identifier)
        createData.name = item.autoId;
        
        // Marquer comme "✅ Créé" lors de l'import
        createData.statutDimport = "✅ Créé";
        
        // Ensure the event name is set
        if (!createData.nom && item.rowData.nom) {
          createData.nom = item.rowData.nom;
        }

        console.log(`[${progress}] Création de ${item.autoId}...`);
        console.log(`   📋 Données sources (rowData):`, {
          nom: item.rowData.nom,
          pilote: item.rowData.pilote,
          directionPilote: item.rowData.directionPilote,
          nature: item.rowData.nature,
          quartier: item.rowData.quartier,
          niveau: item.rowData.niveau,
          type: item.rowData.type,
          organisateur: item.rowData.organisateur
        });
        console.log(`   📦 Données à envoyer (createData):`, {
          name: createData.name,
          nom: createData.nom,
          pilote: createData.pilote,
          directionPilote: createData.directionPilote,
          nature: createData.nature,
          quartier: createData.quartier,
          niveau: createData.niveau,
          type: createData.type,
          organisateur: createData.organisateur
        });
        
        // VÉRIFICATION : Comparer rowData vs createData pour détecter les pertes
        const validationReport: string[] = [];
        for (const [key, sourceValue] of Object.entries(item.rowData)) {
          if (key === 'name' || key === 'validationTechnique' || key === 'validationPolitique') continue;
          if (sourceValue && !createData[key]) {
            validationReport.push(`⚠️ "${key}": "${sourceValue}" → PERDU (validation échouée ou vide)`);
          }
        }
        if (validationReport.length > 0) {
          console.warn(`   ⚠️ COLONNES PERDUES:`, validationReport.join(', '));
        } else {
          console.log(`   ✅ Toutes les colonnes validées avec succès`);
        }
        
        // Use retry with backoff to guarantee creation
        await retryWithBackoff(
          () => board.item().create(createData).execute(),
          item.autoId
        );
        
        created++;
        console.log(`✅ [${progress}] ${item.autoId} créé avec succès`);
        
        // Delay between items to respect API rate limits (300ms = ~3 items/second)
        if (i < data.items.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
        
      } catch (e) {
        failed++;
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`❌ [${progress}] Échec définitif pour ${item.autoId}:`, errorMsg);
        errors.push(`${item.autoId}: ${errorMsg}`);
      }
    }

    console.log(`createItemsBatch: created=${created}, failed=${failed}`);
    return { created, failed, errors };
  });

// ─── Step 4: Update a batch of existing items ───
// ⚠️ FONCTION NON UTILISÉE (conservée pour référence)
// La logique d'import actuelle IGNORE les doublons au lieu de les mettre à jour
// pour préserver les données existantes (validations, etc.)
export const updateItemsBatch = createServerFn({ method: 'POST' })
  .validator(z.object({
    items: z.array(z.object({
      id: z.string(),
      rowData: z.record(z.string(), z.unknown()),
    })),
    estLectureSeule: z.boolean().optional()
  }))
  .handler(async ({ data }) => {
    // Garde en mode lecture seule
    if (!garderEcriture('Mise à jour d\'éléments', data.estLectureSeule ?? false)) {
      throw new Error('Action non autorisée : application en consultation seule');
    }
    
    const board = new ExtractionkioskBoard();
    let updated = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`🔄 updateItemsBatch: Traitement de ${data.items.length} événements existants...`);
    
    // Process sequentially with retry and delay to GUARANTEE complete processing
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const progress = `${i + 1}/${data.items.length}`;
      
      try {
        const updateData: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(item.rowData)) {
          if (key === 'name') continue;
          // NEVER update validations (preserve existing values)
          if (key === 'validationTechnique' || key === 'validationPolitique' || key === 'validParDateClef') continue;
          
          // Handle dates — toujours mettre à jour même si vide (pour pouvoir effacer une date)
          if (key === 'dateDeDbut' || key === 'dateDeFin' || key === 'date') {
            if (value) {
              updateData[key] = new Date(value as string);
            } else {
              // Date vide dans le fichier → on efface la date dans le board
              updateData[key] = null;
            }
          } 
          // Handle dropdown (pilote is an array) — peut être vidé
          else if (key === 'pilote') {
            const piloteValue = Array.isArray(value) ? value : (value ? [value] : []);
            // Validate each pilote name
            const validatedPilotes = piloteValue
              .map(p => validateStatusValue(String(p), VALID_PILOTES))
              .filter(Boolean) as string[];
            // Si vide, on efface la valeur existante
            updateData[key] = validatedPilotes.length > 0 ? validatedPilotes : [];
          }
          // Handle status columns (validate against allowed values) — peut être vidé
          else if (key === 'quartier') {
            const validated = validateStatusValue(String(value), VALID_QUARTIERS);
            updateData[key] = validated || null;
          }
          else if (key === 'nature') {
            const validated = validateStatusValue(String(value), VALID_NATURES);
            updateData[key] = validated || null;
          }
          else if (key === 'niveau') {
            const validated = validateStatusValue(String(value), VALID_NIVEAUX);
            updateData[key] = validated || null;
          }
          else if (key === 'type') {
            const validated = validateStatusValue(String(value), VALID_TYPES);
            updateData[key] = validated || null;
          }
          else if (key === 'tardive') {
            const validated = validateStatusValue(String(value), VALID_TARDIVE);
            updateData[key] = validated || null;
          }
          else if (key === 'reprog') {
            const validated = validateStatusValue(String(value), VALID_REPROG);
            updateData[key] = validated || null;
          }
          else if (key === 'statut') {
            const validated = validateStatusValue(String(value), VALID_STATUTS);
            updateData[key] = validated || null;
          }
          // Handle text fields (nom, lieu, directionPilote, organisateur) — peut être vidé
          else {
            // Toujours mettre à jour, même si vide (pour pouvoir effacer)
            // Une valeur vide écrase l'ancienne valeur
            updateData[key] = value !== null && value !== undefined ? value : null;
          }
        }

        if (Object.keys(updateData).length > 0) {
          console.log(`[${progress}] 🔄 Mise à jour de l'item ${item.id}...`);
          console.log(`   📋 Données sources complètes (rowData):`, item.rowData);
          console.log(`   📦 Données à envoyer au board (updateData):`, updateData);
          console.log(`   🔍 Comparaison clé par clé:`);
          for (const key of Object.keys(item.rowData)) {
            if (key === 'name' || key === 'validationTechnique' || key === 'validationPolitique' || key === 'validParDateClef') continue;
            const sourceValue = item.rowData[key];
            const updateValue = updateData[key];
            const action = updateValue === undefined ? '❌ IGNORÉ' : 
                          (sourceValue === '' || sourceValue === null) && updateValue === null ? '🗑️ EFFACÉ' :
                          '✅ ENVOYÉ';
            console.log(`      ${key}: "${sourceValue}" → "${updateValue}" ${action}`);
          }
          
          // Use retry with backoff to guarantee update
          await retryWithBackoff(
            () => board.item(item.id).update(updateData).execute(),
            item.id
          );
          
          updated++;
          console.log(`✅ [${progress}] Item ${item.id} mis à jour avec succès`);
        } else {
          console.log(`⏭️ [${progress}] Item ${item.id} - Aucun champ à mettre à jour (toutes les valeurs sont identiques ou invalides)`);
        }
        
        // Delay between items to respect API rate limits (300ms = ~3 items/second)
        if (i < data.items.length - 1) {
          await new Promise(r => setTimeout(r, 300));
        }
        
      } catch (e) {
        failed++;
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`❌ [${progress}] Échec définitif pour l'item ${item.id}:`, errorMsg);
        errors.push(`${item.id}: ${errorMsg}`);
      }
    }

    console.log(`✅ updateItemsBatch: updated=${updated}, failed=${failed}`);
    return { updated, failed, errors };
  });


// ═══════════════════════════════════════════════════════════════════
// CSV parser
// ═══════════════════════════════════════════════════════════════════

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells: string[] = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !quoted) { quoted = true; continue; }
      if (ch === '"' && quoted) {
        if (line[i + 1] === '"') { field += '"'; i++; continue; }
        quoted = false; continue;
      }
      if ((ch === ',' || ch === ';') && !quoted) {
        cells.push(field.trim());
        field = '';
        continue;
      }
      field += ch;
    }
    cells.push(field.trim());
    rows.push(cells);
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════
// XLSX parser (pure TypeScript, zero dependencies)
// ═══════════════════════════════════════════════════════════════════

async function parseXLSX(buf: Uint8Array): Promise<string[][]> {
  const entries = await unpackZip(buf);

  // Shared strings - utiliser UTF-8 explicitement
  let shared: string[] = [];
  const ssKey = Object.keys(entries).find(k => k.toLowerCase().includes('sharedstrings.xml'));
  if (ssKey && entries[ssKey]) {
    shared = extractSharedStrings(new TextDecoder('utf-8').decode(entries[ssKey]));
  }

  // Find sheet1 - utiliser UTF-8 explicitement
  const sheetKey = Object.keys(entries).find(k => k.toLowerCase().includes('xl/worksheets/sheet1.xml'))
    || Object.keys(entries).find(k => k.toLowerCase().includes('xl/worksheets/sheet'));
  if (!sheetKey || !entries[sheetKey]) throw new Error('Aucune feuille trouvée dans le fichier Excel.');

  return parseSheet(new TextDecoder('utf-8').decode(entries[sheetKey]), shared);
}

async function unpackZip(buf: Uint8Array): Promise<Record<string, Uint8Array>> {
  const entries: Record<string, Uint8Array> = {};
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  for (let i = 0; i < buf.length - 46; i++) {
    if (view.getUint32(i, true) !== 0x02014b50) continue;

    const compression = view.getUint16(i + 10, true);
    const compSize = view.getUint32(i + 20, true);
    const nameLen = view.getUint16(i + 28, true);
    const extraLen = view.getUint16(i + 30, true);
    const commentLen = view.getUint16(i + 32, true);
    const localOff = view.getUint32(i + 42, true);

    const name = new TextDecoder().decode(buf.subarray(i + 46, i + 46 + nameLen));

    if (localOff < buf.length - 30) {
      const locNameLen = view.getUint16(localOff + 26, true);
      const locExtraLen = view.getUint16(localOff + 28, true);
      const dataStart = localOff + 30 + locNameLen + locExtraLen;

      if (dataStart + compSize <= buf.length) {
        const raw = buf.subarray(dataStart, dataStart + compSize);
        if (compression === 0) {
          entries[name] = raw;
        } else if (compression === 8) {
          try { entries[name] = await inflate(raw); } catch { /* skip */ }
        }
      }
    }

    i += 45 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  w.write(data as unknown as BufferSource);
  w.close();
  const r = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await r.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function decode(s: string): string {
  // D'abord décoder les entités HTML numériques (&#233; → é)
  let decoded = s.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  
  // Puis les entités nommées courantes
  decoded = decoded
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&eacute;/g, 'é')
    .replace(/&egrave;/g, 'è')
    .replace(/&ecirc;/g, 'ê')
    .replace(/&agrave;/g, 'à')
    .replace(/&acirc;/g, 'â')
    .replace(/&ocirc;/g, 'ô')
    .replace(/&ucirc;/g, 'û')
    .replace(/&ccedil;/g, 'ç')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&'); // Toujours en dernier
  
  return decoded;
}

function extractSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/gi;
  let m: RegExpExecArray | null;
  while ((m = siRe.exec(xml)) !== null) {
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/gi;
    let tm: RegExpExecArray | null;
    let str = '';
    while ((tm = tRe.exec(m[1])) !== null) str += tm[1];
    out.push(decode(str));
  }
  return out;
}

function colIdx(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function parseSheet(xml: string, shared: string[]): string[][] {
  const rowsMap = new Map<number, Map<number, string>>();
  let maxCol = 0;

  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/gi;
  let rm: RegExpExecArray | null;
  let defRow = 0;

  while ((rm = rowRe.exec(xml)) !== null) {
    const rAttr = rm[0].match(/\br="(\d+)"/i);
    const rowNum = rAttr ? parseInt(rAttr[1], 10) - 1 : defRow;
    defRow = rowNum + 1;

    const cellMap = new Map<number, string>();
    const cellRe = /<c\b([^>]*)>(.*?)(?:<\/c>|$)/gi;
    let cm: RegExpExecArray | null;
    let defCol = 0;

    while ((cm = cellRe.exec(rm[1])) !== null) {
      const attrs = cm[1];
      const inner = cm[2];

      const ref = attrs.match(/\br="([A-Z]+)\d+"/i);
      const ci = ref ? colIdx(ref[1].toUpperCase()) : defCol;
      defCol = ci + 1;
      if (ci > maxCol) maxCol = ci;

      const tp = attrs.match(/\bt="([^"]+)"/i);
      const t = tp ? tp[1] : '';
      let val = '';

      if (t === 's') {
        const v = inner.match(/<v\b[^>]*>(.*?)<\/v>/i);
        if (v) val = shared[parseInt(v[1].trim(), 10)] ?? '';
      } else if (t === 'inlineStr') {
        const ts = inner.match(/<t\b[^>]*>(.*?)<\/t>/gi);
        if (ts) val = decode(ts.map(x => x.replace(/<[^>]+>/g, '')).join(''));
      } else if (t === 'b') {
        const v = inner.match(/<v\b[^>]*>(.*?)<\/v>/i);
        val = v && v[1].trim() === '1' ? 'Oui' : 'Non';
      } else {
        const v = inner.match(/<v\b[^>]*>(.*?)<\/v>/i);
        if (v) val = decode(v[1].trim());
      }

      cellMap.set(ci, val);
    }
    rowsMap.set(rowNum, cellMap);
  }

  const result: string[][] = [];
  for (const rn of Array.from(rowsMap.keys()).sort((a, b) => a - b)) {
    const rm2 = rowsMap.get(rn);
    if (!rm2) continue;
    const arr: string[] = [];
    for (let c = 0; c <= maxCol; c++) arr.push(rm2.get(c) ?? '');
    if (arr.some(x => x.trim() !== '')) result.push(arr);
  }
  return result;
}
