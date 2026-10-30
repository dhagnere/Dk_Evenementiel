import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { config } from '../config.js';

/**
 * Contenu du jeton de session : l'identifiant suffit. Les droits sont relus en base à chaque requête
 * (voir middleware/auth.ts), pour qu'un changement de droits ou une suspension s'applique aussitôt.
 */
export interface JetonSession {
  userId: string;
}

const EXPIRES_IN_SECONDS = 8 * 60 * 60; // 8h, comme l'application d'origine

export function signSession(payload: JetonSession): string {
  return jwt.sign({ userId: payload.userId }, config.jwtSecret, { expiresIn: EXPIRES_IN_SECONDS, algorithm: 'HS256' });
}

export function verifySession(token: string): JetonSession | null {
  try {
    // Restreint explicitement l'algorithme accepté : sans cela, jwt.verify accepterait tout
    // algorithme déclaré dans l'en-tête du jeton fourni par le client.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    return typeof payload === 'object' && typeof payload.userId === 'string' ? { userId: payload.userId } : null;
  } catch {
    return null;
  }
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: EXPIRES_IN_SECONDS * 1000,
    path: '/',
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(config.cookieName, { path: '/' });
}
