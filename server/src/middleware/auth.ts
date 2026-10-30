import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { verifySession } from '../lib/session.js';
import { chargerProfil, type ProfilCompte } from '../lib/comptes.js';
import { niveauSuffit, type CodeModule, type Niveau } from '../lib/droits.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: ProfilCompte;
    }
  }
}

/**
 * Lit la session depuis le cookie si présente, sans bloquer la requête. Le profil (droits, statut)
 * est relu en base : un compte suspendu ou supprimé perd sa session immédiatement.
 */
export async function readSession(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[config.cookieName];
    const jeton = token ? verifySession(token) : null;
    if (jeton) {
      const profil = await chargerProfil(jeton.userId);
      if (profil) req.session = profil;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** Le compte connecté dispose-t-il au moins de ce niveau sur ce module ? */
export function peut(session: ProfilCompte | undefined, module: CodeModule, niveau: Niveau): boolean {
  if (!session) return false;
  return session.superAdmin || niveauSuffit(session.droits[module], niveau);
}

/** Bloque la requête si aucune session valide n'est présente. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ ok: false, message: 'Non authentifié' });
    return;
  }
  next();
}

/** Bloque la requête si le compte n'a pas le niveau requis sur le module. */
export function requireModule(module: CodeModule, niveau: Niveau) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session) {
      res.status(401).json({ ok: false, message: 'Non authentifié' });
      return;
    }
    if (!peut(req.session, module, niveau)) {
      res.status(403).json({ ok: false, message: 'Action non autorisée avec vos droits sur ce module' });
      return;
    }
    next();
  };
}

/** Bloque la requête si le compte n'est pas super-administrateur. */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ ok: false, message: 'Non authentifié' });
    return;
  }
  if (!req.session.superAdmin) {
    res.status(403).json({ ok: false, message: 'Action réservée aux super-administrateurs' });
    return;
  }
  next();
}
