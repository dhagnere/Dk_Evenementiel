import { executer, inserer, pool, requete, requeteUne, type Executant } from '../db.js';
import { nettoyerDroits, type Droits } from './droits.js';

/** Profil d'un compte tel qu'utilisé pour les contrôles d'accès et renvoyé au client. */
export interface ProfilCompte {
  userId: string;
  email: string;
  nom: string;
  statut: string;
  superAdmin: boolean;
  directionId: string | null;
  direction: string | null;
  droits: Droits;
}

/**
 * Requête de base des comptes avec leur direction et leurs droits regroupés en un objet
 * { module: niveau }. Le filtre est ajouté par l'appelant.
 */
const SELECT_COMPTES = `
  SELECT u.id, u.nom, u.email, u.statut, u.super_admin, u.direction_id, u.derniere_connexion,
         u.created_at, u.updated_at, d.nom AS direction,
         COALESCE(jsonb_object_agg(dm.module, dm.niveau) FILTER (WHERE dm.module IS NOT NULL), '{}'::jsonb) AS droits
    FROM utilisateurs u
    LEFT JOIN directions d ON d.id = u.direction_id
    LEFT JOIN droits_modules dm ON dm.utilisateur_id = u.id`;

export interface CompteDetaille {
  _id: string;
  nom: string;
  email: string;
  statut: string;
  superAdmin: boolean;
  directionId: string | null;
  direction: string | null;
  droits: Droits;
  derniereConnexion: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listerComptes(): Promise<CompteDetaille[]> {
  return requete<CompteDetaille>(`${SELECT_COMPTES} GROUP BY u.id, d.nom ORDER BY u.nom`);
}

export async function chargerCompte(id: string, executant: Executant = pool): Promise<CompteDetaille | null> {
  return requeteUne<CompteDetaille>(`${SELECT_COMPTES} WHERE u.id = $1 GROUP BY u.id, d.nom`, [id], executant);
}

/**
 * Profil à jour d'un compte, relu en base à chaque requête : une suspension ou un retrait de droits
 * prend effet immédiatement, sans attendre l'expiration de la session. Renvoie null pour un compte
 * supprimé ou suspendu.
 */
export async function chargerProfil(id: string): Promise<ProfilCompte | null> {
  const compte = await chargerCompte(id);
  if (!compte || compte.statut === 'Suspendu') return null;
  return {
    userId: compte._id,
    email: compte.email,
    nom: compte.nom,
    statut: compte.statut,
    superAdmin: compte.superAdmin,
    directionId: compte.directionId,
    direction: compte.direction,
    droits: nettoyerDroits(compte.droits),
  };
}

/** Remplace l'ensemble des droits d'un compte. Un super-administrateur n'en garde aucun en propre. */
export async function ecrireDroits(utilisateurId: string, droits: Droits, executant: Executant = pool): Promise<void> {
  await executer('DELETE FROM droits_modules WHERE utilisateur_id = $1', [utilisateurId], executant);
  const lignes = Object.entries(nettoyerDroits(droits)).map(([module, niveau]) => ({ utilisateurId, module, niveau }));
  if (lignes.length > 0) await inserer('droits_modules', lignes, executant);
}

/** Nombre de super-administrateurs actifs, hors un compte donné le cas échéant. */
export async function compterSuperAdminsActifs(saufId?: string, executant: Executant = pool): Promise<number> {
  const ligne = await requeteUne<{ nombre: number }>(
    "SELECT count(*) AS nombre FROM utilisateurs WHERE super_admin AND statut <> 'Suspendu' AND id IS DISTINCT FROM $1",
    [saufId ?? null],
    executant
  );
  return ligne?.nombre ?? 0;
}

/** Retrouve une direction par son nom (casse et espaces ignorés), en la créant si besoin. */
export async function directionParNom(nom: string, executant: Executant = pool): Promise<string | null> {
  const propre = nom.trim();
  if (!propre) return null;
  const existante = await requeteUne<{ _id: string }>('SELECT id FROM directions WHERE lower(nom) = lower($1)', [propre], executant);
  if (existante) return existante._id;
  const [creee] = await inserer<{ _id: string }>('directions', [{ nom: propre }], executant);
  return creee._id;
}
