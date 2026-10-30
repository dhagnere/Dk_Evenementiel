import { randomBytes, timingSafeEqual } from 'node:crypto';
import { pbkdf2 as pbkdf2Callback } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2 = promisify(pbkdf2Callback);
const ITERATIONS = 100_000;
const KEY_LENGTH = 32;

/** Génère un sel cryptographique aléatoire (hexadécimal). */
export function genererSel(): string {
  return randomBytes(32).toString('hex');
}

/** Dérivation PBKDF2-SHA256 d'un mot de passe avec un sel donné. */
export async function hasherMotDePasse(motDePasse: string, sel: string): Promise<string> {
  const derived = await pbkdf2(motDePasse, Buffer.from(sel, 'hex'), ITERATIONS, KEY_LENGTH, 'sha256');
  return derived.toString('hex');
}

/** Génère un hash + sel pour un nouveau mot de passe. */
export async function genererHash(motDePasse: string): Promise<{ hash: string; sel: string }> {
  const sel = genererSel();
  const hash = await hasherMotDePasse(motDePasse, sel);
  return { hash, sel };
}

/** Comparaison en temps constant d'un mot de passe avec un hash stocké. */
export async function verifierMotDePasse(motDePasse: string, hash: string, sel: string): Promise<boolean> {
  const calcule = await hasherMotDePasse(motDePasse, sel);
  const a = Buffer.from(calcule, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
