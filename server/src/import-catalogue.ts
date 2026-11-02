/**
 * Reprise d'un catalogue d'articles (goodies, cadeaux protocolaires) dans le module Stock, à partir
 * d'un fichier JSON validé. Peut aussi fixer la liste des emplacements du local.
 *
 * Usage :
 *   node server/dist/import-catalogue.js catalogue.json              (simulation : rien n'est écrit)
 *   node server/dist/import-catalogue.js catalogue.json --appliquer  (écriture)
 * Sur Scalingo :
 *   scalingo --app <app> run --file catalogue.json "node server/dist/import-catalogue.js /tmp/uploads/catalogue.json --appliquer"
 *
 * Chaque article reçoit son stock initial et une ligne « Création » au journal des mouvements. Une
 * référence déjà présente au catalogue est laissée telle quelle (aucun écrasement) : relancer le
 * script ne crée pas de doublon.
 */
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { appliquerMigrations, insererUn, pool, requete, transaction } from './db.js';
import { creerMouvement, ecrireParametresStock, lireParametresStock } from './lib/stock.js';

const schema = z.object({
  emplacements: z.array(z.string().trim().min(1).max(100)).min(1).optional(),
  emplacementProtocole: z.string().trim().min(1).max(100).optional(),
  source: z.string().trim().max(300).default('Reprise du catalogue'),
  articles: z
    .array(
      z.object({
        reference: z.string().trim().min(1).max(30),
        libelle: z.string().trim().min(1).max(200),
        famille: z.string().trim().min(1).max(100),
        categorie: z.enum(['Goodies', 'Protocole']),
        emplacement: z.string().trim().min(1).max(100),
        stockInitial: z.number().int().min(0),
        prix: z.number().min(0).nullable(),
        seuil: z.number().int().min(0).default(0),
        fournisseur: z.string().trim().max(200).default(''),
        delaiJours: z.number().int().min(0).max(365).default(0),
        actif: z.boolean().default(true),
        historique: z.string().trim().max(300).default(''),
      })
    )
    .min(1),
});

async function main() {
  const [fichier, ...options] = process.argv.slice(2);
  if (!fichier) throw new Error('Indiquez le fichier JSON du catalogue');
  const appliquer = options.includes('--appliquer');
  const donnees = schema.parse(JSON.parse(readFileSync(fichier, 'utf-8')));

  await appliquerMigrations();
  const parametres = await lireParametresStock();
  const emplacements = donnees.emplacements ?? parametres.emplacements;
  const emplacementProtocole = donnees.emplacementProtocole ?? parametres.emplacementProtocole;
  if (!emplacements.includes(emplacementProtocole)) throw new Error(`L'emplacement protocole « ${emplacementProtocole} » n'est pas dans la liste`);

  // Contrôles avant toute écriture : tout le fichier passe, ou rien.
  const anomalies: string[] = [];
  const vues = new Set<string>();
  for (const a of donnees.articles) {
    if (vues.has(a.reference)) anomalies.push(`${a.reference} : référence en double dans le fichier`);
    vues.add(a.reference);
    if (!emplacements.includes(a.emplacement)) anomalies.push(`${a.reference} : emplacement inconnu « ${a.emplacement} »`);
    if (a.categorie === 'Protocole' && a.emplacement !== emplacementProtocole) {
      anomalies.push(`${a.reference} : un cadeau protocolaire se range en « ${emplacementProtocole} »`);
    }
  }
  if (anomalies.length) throw new Error(`Fichier refusé :\n  ${anomalies.join('\n  ')}`);

  const existantes = new Set(
    (await requete<{ reference: string }>('SELECT reference FROM stock_articles WHERE reference = ANY($1)', [[...vues]])).map((r) => r.reference)
  );
  const aCreer = donnees.articles.filter((a) => !existantes.has(a.reference));
  const valeur = aCreer.reduce((t, a) => t + a.stockInitial * (a.prix ?? 0), 0);
  console.log(`[catalogue] ${donnees.articles.length} article(s) dans le fichier, ${existantes.size} déjà présent(s), ${aCreer.length} à créer.`);
  console.log(`[catalogue] ${aCreer.filter((a) => a.categorie === 'Protocole').length} cadeau(x) protocolaire(s), ${aCreer.filter((a) => !a.actif).length} retiré(s), ${aCreer.filter((a) => a.prix === null).length} à valoriser.`);
  console.log(`[catalogue] Valeur du stock repris (articles valorisés) : ${valeur.toFixed(2)} €`);
  console.log(`[catalogue] Emplacements : ${emplacements.join(', ')} (protocole : ${emplacementProtocole})`);
  if (!appliquer) {
    console.log('[catalogue] Simulation : rien n’a été écrit. Relancez avec --appliquer.');
    return;
  }

  await ecrireParametresStock({ ...parametres, emplacements, emplacementProtocole });
  await transaction(async (client) => {
    for (const a of aCreer) {
      const article = await insererUn<{ _id: string }>(
        'stock_articles',
        {
          reference: a.reference,
          libelle: a.libelle,
          famille: a.famille,
          categorie: a.categorie,
          emplacement: a.emplacement,
          fournisseur: a.fournisseur,
          delaiJours: a.delaiJours,
          stockPhysique: a.stockInitial,
          seuil: a.seuil,
          pmp: a.prix ?? 0,
          aValoriser: a.prix === null,
          actif: a.actif,
        },
        client
      );
      await creerMouvement(
        {
          type: 'Création',
          articleId: article._id,
          quantite: a.stockInitial,
          valeur: a.stockInitial * (a.prix ?? 0),
          detail: [donnees.source, a.historique].filter(Boolean).join(' — '),
          statut: 'Appliqué',
          auteurId: null,
          auteurNom: 'Reprise du catalogue',
        },
        client
      );
    }
  });
  console.log(`[catalogue] ${aCreer.length} article(s) créé(s), paramètres des emplacements enregistrés.`);
}

main()
  .catch((err) => {
    console.error('[catalogue] Échec :', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
