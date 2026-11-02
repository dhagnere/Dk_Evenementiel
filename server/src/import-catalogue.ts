/**
 * Reprise d'un catalogue d'articles dans le module Stock, en ligne de commande, depuis un fichier
 * JSON ou CSV. L'écran Stock → Catalogue → Importer un CSV fait la même chose (super-administrateurs).
 *
 * Usage :
 *   node server/dist/import-catalogue.js catalogue.csv              (analyse : rien n'est écrit)
 *   node server/dist/import-catalogue.js catalogue.csv --appliquer  (écriture)
 * Sur Scalingo :
 *   scalingo --app <app> run --file catalogue.csv "node server/dist/import-catalogue.js /tmp/uploads/catalogue.csv --appliquer"
 *
 * Un JSON peut en plus fixer la liste des emplacements : { emplacements, emplacementProtocole, source, articles }.
 */
import { readFileSync } from 'node:fs';
import { appliquerMigrations, pool } from './db.js';
import { analyserCatalogue, appliquerCatalogue, decoderFichier, lireCsvCatalogue } from './lib/importCatalogue.js';

async function main() {
  const [fichier, ...options] = process.argv.slice(2);
  if (!fichier) throw new Error('Indiquez le fichier du catalogue (CSV ou JSON)');
  const appliquer = options.includes('--appliquer');
  await appliquerMigrations();

  const contenu = readFileSync(fichier);
  let source = `Reprise du catalogue (${fichier.split('/').pop()})`;
  let emplacements: string[] | undefined;
  let emplacementProtocole: string | undefined;
  let lecture: ReturnType<typeof lireCsvCatalogue>;
  if (fichier.toLowerCase().endsWith('.json')) {
    const json = JSON.parse(contenu.toString('utf-8'));
    ({ emplacements, emplacementProtocole } = json);
    source = json.source ?? source;
    lecture = { lignes: json.articles.map((brut: Record<string, unknown>, i: number) => ({ ligne: i + 1, brut })), ecartes: [], erreurs: [] };
  } else {
    lecture = lireCsvCatalogue(decoderFichier(contenu));
  }

  const analyse = await analyserCatalogue(lecture.lignes, {
    emplacements,
    emplacementProtocole,
    ajouterEmplacements: options.includes('--ajouter-emplacements'),
    ecartes: lecture.ecartes,
    erreurs: lecture.erreurs,
  });
  console.log(`[catalogue] ${analyse.articles.length} article(s) lus, ${analyse.ecartes.length} écarté(s), ${analyse.existants.length} déjà présent(s), ${analyse.aCreer} à créer.`);
  console.log(`[catalogue] ${analyse.protocole} cadeau(x) protocolaire(s), ${analyse.retires} retiré(s), ${analyse.aValoriser} à valoriser. Valeur reprise : ${analyse.valeur.toFixed(2)} €`);
  if (analyse.emplacementsInconnus.length) console.log(`[catalogue] Emplacements ajoutés : ${analyse.emplacementsInconnus.join(', ')}`);
  if (analyse.anomalies.length) {
    console.log(`[catalogue] ${analyse.anomalies.length} anomalie(s) : import impossible en l'état.`);
    analyse.anomalies.forEach((a) => console.log(`  ligne ${a.ligne} ${a.reference} : ${a.message}`));
    process.exitCode = 1;
    return;
  }
  if (!appliquer) {
    console.log('[catalogue] Analyse seule : rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }
  const crees = await appliquerCatalogue(analyse, { source, emplacements, emplacementProtocole, auteurId: null, auteurNom: 'Reprise du catalogue' });
  console.log(`[catalogue] ${crees} article(s) créé(s).`);
}

main()
  .catch((err) => {
    console.error('[catalogue] Échec :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
