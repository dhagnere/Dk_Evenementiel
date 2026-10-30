import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import { config } from '../config.js';

export interface SessionPayload {
  userId: string;
  email: string;
  nom: string;
  role: 'Administrateur' | 'Consultant';
}

const EXPIRES_IN_SECONDS = 8 * 60 * 60; // 8h, comme l'application d'origine

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: EXPIRES_IN_SECONDS, algorithm: 'HS256' });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    // Restreint explicitement l'algorithme accepté : sans cela, jwt.verify accepterait tout
    // algorithme déclaré dans l'en-tête du jeton fourni par le client.
    return jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as SessionPayload;
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
