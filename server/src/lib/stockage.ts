import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config } from '../config.js';
import { executer, insererUn, requeteUne, type Executant, pool } from '../db.js';
import type { Fichier } from '../modeles.js';

/**
 * Pièces jointes des modules (devis, attestations, fonds de plan…), déposées sur un stockage objet
 * compatible S3. Seules les métadonnées sont en base (table fichiers). Sans configuration S3, toute
 * tentative de dépôt échoue avec un message explicite : le reste de l'application fonctionne.
 */

let client: S3Client | null = null;

export function stockageActif(): boolean {
  const { bucket, accessKeyId, secretAccessKey } = config.s3;
  return Boolean(bucket && accessKeyId && secretAccessKey);
}

function s3(): S3Client {
  if (!stockageActif()) throw new Error('Stockage des fichiers non configuré (variables S3_*)');
  client ??= new S3Client({
    region: config.s3.region,
    endpoint: config.s3.endpoint || undefined,
    // Les fournisseurs S3 hors AWS adressent le plus souvent le bucket dans le chemin de l'URL.
    forcePathStyle: Boolean(config.s3.endpoint),
    credentials: { accessKeyId: config.s3.accessKeyId!, secretAccessKey: config.s3.secretAccessKey! },
  });
  return client;
}

function cleComplete(cle: string): string {
  return `${config.s3.prefixe}${cle}`;
}

export async function deposerObjet(cle: string, contenu: Buffer, typeMime: string): Promise<void> {
  await s3().send(
    new PutObjectCommand({ Bucket: config.s3.bucket, Key: cleComplete(cle), Body: contenu, ContentType: typeMime })
  );
}

export async function lireObjet(cle: string): Promise<Readable> {
  const reponse = await s3().send(new GetObjectCommand({ Bucket: config.s3.bucket, Key: cleComplete(cle) }));
  return reponse.Body as Readable;
}

export async function supprimerObjet(cle: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: cleComplete(cle) }));
}

/** Dépose un fichier et enregistre ses métadonnées. La clé de stockage ne reprend jamais le nom d'origine. */
export async function enregistrerFichier(fichier: {
  contenu: Buffer;
  nomOrigine: string;
  typeMime: string;
  module: string;
  rattachement: string;
  deposePar: string | null;
}): Promise<Fichier> {
  const cleStockage = `${fichier.module}/${randomUUID()}`;
  await deposerObjet(cleStockage, fichier.contenu, fichier.typeMime);
  return insererUn<Fichier>('fichiers', {
    cleStockage,
    nomOrigine: fichier.nomOrigine,
    typeMime: fichier.typeMime,
    taille: fichier.contenu.length,
    module: fichier.module,
    rattachement: fichier.rattachement,
    deposePar: fichier.deposePar,
  });
}

/** Supprime un fichier du stockage puis ses métadonnées. */
export async function supprimerFichier(id: string, executant: Executant = pool): Promise<boolean> {
  const fichier = await requeteUne<Fichier>('SELECT * FROM fichiers WHERE id = $1', [id], executant);
  if (!fichier) return false;
  await supprimerObjet(fichier.cleStockage);
  await executer('DELETE FROM fichiers WHERE id = $1', [id], executant);
  return true;
}

/** Écrit, relit puis efface un petit objet de test : vérifie la configuration S3 de bout en bout. */
export async function testerStockage(): Promise<void> {
  const cle = `test/${randomUUID()}.txt`;
  const contenu = `Test de stockage DK Événementiel — ${new Date().toISOString()}`;
  await deposerObjet(cle, Buffer.from(contenu, 'utf-8'), 'text/plain; charset=utf-8');
  try {
    const flux = await lireObjet(cle);
    const morceaux: Buffer[] = [];
    for await (const morceau of flux) morceaux.push(Buffer.from(morceau));
    if (Buffer.concat(morceaux).toString('utf-8') !== contenu) {
      throw new Error("Le contenu relu ne correspond pas au contenu écrit");
    }
  } finally {
    await supprimerObjet(cle);
  }
}
