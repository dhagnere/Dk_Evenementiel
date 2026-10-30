import pg from 'pg';
import path from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/migrations, que le code tourne depuis src/ (tsx) ou dist/ (build).
const DOSSIER_MIGRATIONS = path.join(__dirname, '..', 'migrations');

// COUNT(*) et autres bigint arrivent en texte par défaut (pour ne pas perdre de précision au-delà de
// 2^53) : aucun compteur de l'appli n'approche cette limite, on les convertit en nombre.
pg.types.setTypeParser(pg.types.builtins.INT8, (valeur) => parseInt(valeur, 10));

export const pool = new pg.Pool({ connectionString: config.databaseUrl });

/** Le pool, ou un client déjà engagé dans une transaction : les deux exposent `query`. */
export type Executant = pg.Pool | pg.PoolClient;

/** Ligne telle que renvoyée par l'API : clés en camelCase, clé primaire sous `_id`. */
export type Ligne = Record<string, unknown>;

const versCamel = (nom: string) => nom.replace(/_([a-z])/g, (_, lettre: string) => lettre.toUpperCase());
const versSnake = (nom: string) => nom.replace(/[A-Z]/g, (lettre) => `_${lettre.toLowerCase()}`);

/**
 * Convertit une ligne SQL au format attendu par le client (hérité de MongoDB) : `date_clef` devient
 * `dateClef`, `id` devient `_id`.
 */
export function enObjet(ligne: Record<string, unknown>): Ligne {
  const objet: Ligne = {};
  for (const [cle, valeur] of Object.entries(ligne)) {
    objet[cle === 'id' ? '_id' : versCamel(cle)] = valeur;
  }
  return objet;
}

/** Exécute une requête paramétrée et renvoie les lignes converties par `enObjet`. */
export async function requete<T = Ligne>(texte: string, params: unknown[] = [], executant: Executant = pool): Promise<T[]> {
  const resultat = await executant.query(texte, params);
  return resultat.rows.map(enObjet) as T[];
}

/** Exécute une requête sans lignes à renvoyer (UPDATE, DELETE…) et renvoie le nombre de lignes touchées. */
export async function executer(texte: string, params: unknown[] = [], executant: Executant = pool): Promise<number> {
  const resultat = await executant.query(texte, params);
  return resultat.rowCount ?? 0;
}

/** Variante de `requete` pour une seule ligne attendue (ou aucune). */
export async function requeteUne<T = Ligne>(texte: string, params: unknown[] = [], executant: Executant = pool): Promise<T | null> {
  const lignes = await requete<T>(texte, params, executant);
  return lignes[0] ?? null;
}

/** Exécute `fn` dans une transaction : tout est validé ensemble, ou rien en cas d'erreur. */
export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Colonnes modifiables de chaque table, en camelCase (`_id` = clé primaire). Sert de liste blanche :
 * seuls ces noms peuvent finir dans le texte SQL généré par `inserer` et `clauseSet`, les valeurs
 * passant toujours en paramètres.
 */
const TABLES = {
  evenements: {
    colonnes: [
      '_id', 'eventId', 'nom', 'dateClef', 'dateDeDebut', 'dateDeFin', 'lieu', 'latitude', 'longitude',
      'statutGeocodage', 'quartier', 'pilote', 'directionPilote', 'organisateur', 'nature', 'niveau', 'type',
      'statut', 'tardive', 'reprog', 'validationTechnique', 'validationPolitique', 'validParDateClef',
      'statutDimport', 'createdAt', 'updatedAt',
    ],
    json: [],
  },
  utilisateurs: {
    colonnes: ['_id', 'nom', 'email', 'role', 'statut', 'hash', 'sel', 'derniereConnexion', 'createdAt', 'updatedAt'],
    json: [],
  },
  demandes_acces: {
    colonnes: ['_id', 'nom', 'email', 'organisation', 'motif', 'statut', 'motifRejet', 'createdAt', 'updatedAt'],
    json: [],
  },
  sauvegardes: {
    colonnes: ['_id', 'type', 'nombreEvenements', 'nombreUtilisateurs', 'evenements', 'utilisateurs', 'createdAt', 'updatedAt'],
    json: ['evenements', 'utilisateurs'],
  },
  journal_actions: {
    colonnes: ['_id', 'utilisateurId', 'utilisateurNom', 'utilisateurEmail', 'action', 'cible', 'details', 'createdAt', 'updatedAt'],
    json: ['details'],
  },
} satisfies Record<string, { colonnes: string[]; json: string[] }>;

export type NomTable = keyof typeof TABLES;

function colonneSql(table: NomTable, champ: string): string {
  if (!(TABLES[table].colonnes as string[]).includes(champ)) {
    throw new Error(`Colonne inconnue pour ${table} : ${champ}`);
  }
  return champ === '_id' ? 'id' : versSnake(champ);
}

// node-postgres transforme un tableau JS en tableau SQL : pour une colonne jsonb, on sérialise soi-même.
function valeurSql(table: NomTable, champ: string, valeur: unknown): unknown {
  return (TABLES[table].json as string[]).includes(champ) && valeur !== null ? JSON.stringify(valeur) : valeur;
}

/**
 * Prépare pour `inserer` un objet venu de l'extérieur (sauvegarde JSON, export MongoDB…) : seules les
 * colonnes connues de la table sont gardées (ce qui écarte par ex. le `__v` de Mongoose) et les
 * valeurs nulles sont retirées, la colonne prenant alors sa valeur par défaut — NULL pour une date,
 * '' ou 'attente' pour un texte obligatoire.
 */
export function preparerLigne(table: NomTable, objet: Record<string, unknown>): Ligne {
  const colonnes = TABLES[table].colonnes as string[];
  return Object.fromEntries(Object.entries(objet).filter(([cle, valeur]) => colonnes.includes(cle) && valeur !== null));
}

/** Nombre de lignes par INSERT, pour rester loin de la limite de 65 535 paramètres par requête. */
const LOT_INSERTION = 500;

/**
 * Insère des objets (champs en camelCase) et renvoie les lignes créées. Un champ absent ou
 * `undefined` prend la valeur par défaut de la colonne, comme avec Mongoose.
 */
export async function inserer<T = Ligne>(table: NomTable, objets: readonly object[], executant: Executant = pool): Promise<T[]> {
  const creees: T[] = [];
  for (let debut = 0; debut < objets.length; debut += LOT_INSERTION) {
    const lot = objets.slice(debut, debut + LOT_INSERTION) as Ligne[];
    const champs = [...new Set(lot.flatMap((o) => Object.keys(o).filter((c) => o[c] !== undefined)))];
    const params: unknown[] = [];
    const valeurs = lot.map(
      (o) =>
        `(${champs
          .map((c) => {
            if (o[c] === undefined) return 'DEFAULT';
            params.push(valeurSql(table, c, o[c]));
            return `$${params.length}`;
          })
          .join(', ')})`
    );
    const colonnes = champs.map((c) => colonneSql(table, c)).join(', ');
    const texte =
      champs.length === 0
        ? `INSERT INTO ${table} DEFAULT VALUES RETURNING *`
        : `INSERT INTO ${table} (${colonnes}) VALUES ${valeurs.join(', ')} RETURNING *`;
    creees.push(...(await requete<T>(texte, params, executant)));
  }
  return creees;
}

/** Variante de `inserer` pour un seul objet. */
export async function insererUn<T = Ligne>(table: NomTable, objet: object, executant: Executant = pool): Promise<T> {
  const [ligne] = await inserer<T>(table, [objet], executant);
  return ligne;
}

/**
 * Construit la clause `SET` d'un UPDATE à partir d'un objet (champs `undefined` ignorés). Les
 * paramètres sont numérotés à partir de `premierParam`, pour laisser la place à ceux du WHERE.
 */
export function clauseSet(table: NomTable, champs: Ligne, premierParam = 1): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const affectations = Object.entries(champs)
    .filter(([, valeur]) => valeur !== undefined)
    .map(([champ, valeur]) => {
      params.push(valeurSql(table, champ, valeur));
      return `${colonneSql(table, champ)} = $${premierParam + params.length - 1}`;
    });
  if (affectations.length === 0) throw new Error(`Mise à jour de ${table} sans aucun champ`);
  return { texte: affectations.join(', '), params };
}

/**
 * Applique, dans l'ordre alphabétique, les fichiers de server/migrations pas encore passés. Chaque
 * fichier tourne dans sa propre transaction ; un verrou consultatif évite que deux instances du
 * serveur démarrées en même temps ne les jouent en double.
 */
export async function appliquerMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(714230)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS migrations_schema (nom text PRIMARY KEY, appliquee_le timestamptz NOT NULL DEFAULT now())'
    );
    const { rows } = await client.query<{ nom: string }>('SELECT nom FROM migrations_schema');
    const dejaFaites = new Set(rows.map((r) => r.nom));
    const fichiers = (await readdir(DOSSIER_MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();

    for (const fichier of fichiers) {
      if (dejaFaites.has(fichier)) continue;
      const sql = await readFile(path.join(DOSSIER_MIGRATIONS, fichier), 'utf-8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO migrations_schema (nom) VALUES ($1)', [fichier]);
        await client.query('COMMIT');
        console.log(`[db] Migration appliquée : ${fichier}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Échec de la migration ${fichier} : ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(714230)').catch(() => undefined);
    client.release();
  }
}

let connected = false;

export async function connectDb(): Promise<void> {
  if (connected) return;
  await appliquerMigrations();
  connected = true;
  console.log(`[db] Connecté à PostgreSQL (${config.databaseUrl.replace(/\/\/.*@/, '//***@')})`);
}
