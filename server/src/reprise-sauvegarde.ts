/**
 * Reprise des données dans PostgreSQL à partir du fichier JSON d'une sauvegarde, tel que le produit
 * le bouton « Exporter » de la page Sauvegardes (GET /api/sauvegardes/:id/export). Sert notamment au
 * passage de MongoDB à PostgreSQL : on exporte une sauvegarde depuis l'ancienne application, puis on
 * la charge ici, sans aucun outil MongoDB.
 *
 * Usage :
 *   npm run reprise -w server -- chemin/vers/sauvegarde.json              (développement)
 *   node dist/reprise-sauvegarde.js chemin/vers/sauvegarde.json           (serveur, après build)
 * Ajouter --remplacer pour vider d'abord les événements et comptes déjà présents.
 *
 * Les identifiants d'origine sont conservés : les liens et sessions restent valables.
 */
import { readFileSync } from 'node:fs';
import { appliquerMigrations, executer, inserer, pool, preparerLigne, requete, transaction } from './db.js';

async function main() {
  const args = process.argv.slice(2);
  const remplacer = args.includes('--remplacer');
  const fichier = args.find((a) => !a.startsWith('--'));
  if (!fichier) {
    throw new Error('Indiquez le fichier JSON de la sauvegarde à reprendre');
  }

  const contenu = JSON.parse(readFileSync(fichier, 'utf-8')) as {
    evenements?: Record<string, unknown>[];
    utilisateurs?: Record<string, unknown>[];
  };
  if (!Array.isArray(contenu.evenements) || !Array.isArray(contenu.utilisateurs)) {
    throw new Error("Ce fichier n'est pas une sauvegarde DK_Calendar (champs evenements et utilisateurs attendus)");
  }

  await appliquerMigrations();

  const [{ evenements, utilisateurs }] = await requete<{ evenements: number; utilisateurs: number }>(
    'SELECT (SELECT count(*) FROM evenements) AS evenements, (SELECT count(*) FROM utilisateurs) AS utilisateurs'
  );
  if ((evenements > 0 || utilisateurs > 0) && !remplacer) {
    throw new Error(
      `La base contient déjà ${evenements} événement(s) et ${utilisateurs} compte(s). ` +
        'Relancez avec --remplacer pour les écraser.'
    );
  }

  await transaction(async (client) => {
    if (remplacer) {
      await executer('DELETE FROM evenements', [], client);
      await executer('DELETE FROM utilisateurs', [], client);
    }
    await inserer('evenements', contenu.evenements!.map((e) => preparerLigne('evenements', e)), client);
    await inserer('utilisateurs', contenu.utilisateurs!.map((u) => preparerLigne('utilisateurs', u)), client);
  });

  console.log(
    `[reprise] ${contenu.evenements.length} événement(s) et ${contenu.utilisateurs.length} compte(s) chargés depuis ${fichier}`
  );
}

main()
  .catch((err) => {
    console.error('[reprise] Échec :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
