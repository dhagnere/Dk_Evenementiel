import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { verifySession, type SessionPayload } from '../lib/session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: SessionPayload;
    }
  }
}

/** Lit la session depuis le cookie si présente, sans bloquer la requête. */
export function readSession(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.cookieName];
  if (token) {
    const payload = verifySession(token);
    if (payload) req.session = payload;
  }
  next();
}

/** Bloque la requête si aucune session valide n'est présente. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ ok: false, message: 'Non authentifié' });
    return;
  }
  next();
}

/** Bloque la requête si l'utilisateur n'est pas Administrateur. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ ok: false, message: 'Non authentifié' });
    return;
  }
  if (req.session.role !== 'Administrateur') {
    res.status(403).json({ ok: false, message: 'Action non autorisée : application en consultation seule' });
    return;
  }
  next();
}
