import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { appliquerMigrations, clauseSet, executer, insererUn, pool, requeteUne, transaction } from './db.js';
import { parseEventsCsv, parseUsersCsv } from './lib/csv.js';
import { genererHash, genererSel } from './lib/password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

async function seedEvents(): Promise<void> {
  const filePath = path.join(DATA_DIR, 'evenements.csv');
  if (!existsSync(filePath)) {
    console.log(`[seed] Fichier introuvable, ignoré : ${filePath}`);
    return;
  }

  const { rows, errors } = parseEventsCsv(readFileSync(filePath, 'utf-8'));
  errors.forEach((e) => console.warn(`[seed] ${e}`));

  let created = 0;
  let updated = 0;
  // Mise à jour si l'événement existe déjà (même eventId, sinon même nom et même jour), création sinon.
  await transaction(async (client) => {
    for (const row of rows) {
      const { texte, params } = clauseSet('evenements', { ...row }, 1);
      const identite = row.eventId
        ? { condition: `event_id = $${params.length + 1}`, params: [row.eventId] }
        : {
            condition: `nom = $${params.length + 1} AND date_clef IS NOT DISTINCT FROM $${params.length + 2}`,
            params: [row.nom, row.dateClef],
          };
      const modifies = await executer(
        `UPDATE evenements SET ${texte} WHERE ${identite.condition}`,
        [...params, ...identite.params],
        client
      );
      if (modifies > 0) {
        updated++;
      } else {
        await insererUn('evenements', row, client);
        created++;
      }
    }
  });
  console.log(`[seed] Événements : ${created} créés, ${updated} mis à jour (${rows.length} lignes lues)`);
}

async function seedUsers(): Promise<void> {
  const filePath = path.join(DATA_DIR, 'utilisateurs.csv');
  if (!existsSync(filePath)) {
    console.log(`[seed] Fichier introuvable, ignoré : ${filePath}`);
    return;
  }

  const { rows, errors } = parseUsersCsv(readFileSync(filePath, 'utf-8'));
  errors.forEach((e) => console.warn(`[seed] ${e}`));

  let created = 0;
  let updated = 0;
  const motsDePasseGeneres: Array<{ email: string; motDePasse: string }> = [];

  for (const row of rows) {
    const existant = await requeteUne<{ _id: string }>('SELECT id FROM utilisateurs WHERE email = $1', [row.email]);
    if (existant) {
      const champs: Record<string, unknown> = { nom: row.nom, role: row.role, statut: row.statut };
      if (row.motDePasseInitial) Object.assign(champs, await genererHash(row.motDePasseInitial));
      const { texte, params } = clauseSet('utilisateurs', champs, 2);
      await executer(`UPDATE utilisateurs SET ${texte} WHERE id = $1`, [existant._id, ...params]);
      updated++;
    } else {
      const motDePasse = row.motDePasseInitial || genererSel().slice(0, 12);
      const { hash, sel } = await genererHash(motDePasse);
      await insererUn('utilisateurs', {
        nom: row.nom,
        email: row.email,
        role: row.role,
        statut: row.motDePasseInitial ? row.statut : 'Mot de passe à définir',
        hash,
        sel,
      });
      if (!row.motDePasseInitial) motsDePasseGeneres.push({ email: row.email, motDePasse });
      created++;
    }
  }

  if (motsDePasseGeneres.length > 0) {
    console.log('[seed] Mots de passe temporaires générés (aucun fourni dans le CSV) :');
    motsDePasseGeneres.forEach(({ email, motDePasse }) => console.log(`  - ${email} : ${motDePasse}`));
  }
  console.log(`[seed] Utilisateurs : ${created} créés, ${updated} mis à jour (${rows.length} lignes lues)`);
}

async function main() {
  await appliquerMigrations();
  await seedEvents();
  await seedUsers();
  await pool.end();
  console.log('[seed] Terminé.');
}

main().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});
