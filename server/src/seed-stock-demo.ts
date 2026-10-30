/**
 * Jeu de démonstration du module Stock & Protocole, repris de la maquette : catalogue, directions et
 * stocks déportés. Réservé à une base de recette : le script refuse de tourner si le catalogue
 * contient déjà des articles.
 *
 * Usage : npm run seed:stock-demo -w server
 */
import { appliquerMigrations, insererUn, pool, requeteUne, transaction } from './db.js';
import { directionParNom } from './lib/comptes.js';
import { creerMouvement } from './lib/stock.js';

const ARTICLES = [
  ['G-001', 'Stylo bille CUD', 'Papeterie', 'Goodies', 1200, 300, 0.45, 'Central · A1'],
  ['G-002', 'Tote bag coton « Dunkerque »', 'Textile', 'Goodies', 340, 150, 2.8, 'Central · A2'],
  ['G-003', 'Casquette brodée', 'Textile', 'Goodies', 90, 80, 4.9, 'Central · A2'],
  ['G-004', 'Gourde inox', 'Objets', 'Goodies', 210, 60, 7.5, 'Central · B1'],
  ['G-005', 'Bracelet silicone', 'Objets', 'Goodies', 2000, 400, 0.3, 'Central · B2'],
  ['G-006', 'Parapluie aux couleurs de la Ville', 'Objets', 'Goodies', 45, 40, 12, 'Central · B3'],
  ['P-101', 'Médaille de la Ville (coffret)', 'Médailles', 'Protocole', 38, 10, 28, 'Central · Coffre'],
  ['P-102', 'Livre patrimoine dunkerquois', 'Livres', 'Protocole', 24, 15, 35, 'Central · Coffre'],
  ['P-103', 'Coffret gourmand régional', 'Gastronomie', 'Protocole', 12, 10, 45, 'Central · Coffre'],
  ['P-104', 'Maquette de navire', "Objets d'art", 'Protocole', 6, 3, 120, 'Central · Coffre'],
] as const;

const DIRECTIONS = [
  'Service Événementiel',
  'Direction des Sports',
  'Direction de la Culture',
  'Direction de la Jeunesse',
  "Direction de l'Économie",
  'Cabinet du Maire',
  'Mairie de quartier',
];

const DEPOTS = ['Direction des Sports', 'Direction de la Culture', 'Direction de la Jeunesse', 'Mairie de quartier'];

async function main() {
  await appliquerMigrations();
  if (await requeteUne('SELECT 1 FROM stock_articles LIMIT 1')) {
    throw new Error('Le catalogue contient déjà des articles : jeu de démonstration non chargé');
  }
  await transaction(async (client) => {
    const directions = new Map<string, string>();
    for (const nom of DIRECTIONS) directions.set(nom, (await directionParNom(nom, client))!);
    for (const [reference, libelle, famille, categorie, stockPhysique, seuil, pmp, emplacement] of ARTICLES) {
      const article = await insererUn<{ _id: string }>(
        'stock_articles',
        { reference, libelle, famille, categorie, stockPhysique, seuil, pmp, emplacement },
        client
      );
      await creerMouvement(
        {
          type: 'Création',
          articleId: article._id,
          quantite: stockPhysique,
          valeur: stockPhysique * pmp,
          detail: 'Stock initial (jeu de démonstration)',
          statut: 'Appliqué',
          auteurId: null,
          auteurNom: 'Jeu de démonstration',
        },
        client
      );
    }
    for (const nom of DEPOTS) await insererUn('stock_depots', { directionId: directions.get(nom) }, client);
  });
  console.log(`[demo] ${ARTICLES.length} articles, ${DIRECTIONS.length} directions et ${DEPOTS.length} stocks déportés créés.`);
}

main()
  .catch((err) => {
    console.error('[demo] Échec :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
