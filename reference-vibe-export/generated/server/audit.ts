import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

/**
 * Types d'événements d'audit
 */
export type AuditEventType = 
  | 'CONNEXION_REUSSIE'
  | 'CONNEXION_ECHOUEE'
  | 'CREATION_COMPTE'
  | 'CHANGEMENT_MOT_DE_PASSE'
  | 'MODIFICATION_ROLE'
  | 'COMPTE_SUSPENDU'
  | 'INITIALISATION_ADMIN'
  | 'VERIFICATION_ADMIN';

/**
 * Structure d'un événement d'audit
 */
export interface AuditEvent {
  timestamp: string;
  eventType: AuditEventType;
  userIdentifier: string;
  success: boolean;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Stockage en mémoire des événements d'audit récents (les 1000 derniers)
 * En production, ceci devrait être persisté dans un board monday ou une base de données
 */
const auditLog: AuditEvent[] = [];
const MAX_LOG_SIZE = 1000;

/**
 * Enregistre un événement d'audit
 */
export const logAuditEvent = createServerFn({ method: 'POST' })
  .validator(z.object({
    eventType: z.enum([
      'CONNEXION_REUSSIE',
      'CONNEXION_ECHOUEE',
      'CREATION_COMPTE',
      'CHANGEMENT_MOT_DE_PASSE',
      'MODIFICATION_ROLE',
      'COMPTE_SUSPENDU',
      'INITIALISATION_ADMIN',
      'VERIFICATION_ADMIN'
    ]),
    userIdentifier: z.string(),
    success: z.boolean(),
    details: z.record(z.string(), z.any()).optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional()
  }))
  .handler(async ({ data }) => {
    const event: AuditEvent = {
      timestamp: new Date().toISOString(),
      eventType: data.eventType,
      userIdentifier: data.userIdentifier,
      success: data.success,
      details: data.details,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent
    };

    // Ajouter à la file en mémoire
    auditLog.push(event);
    if (auditLog.length > MAX_LOG_SIZE) {
      auditLog.shift(); // Retirer le plus ancien
    }

    // Logger dans la console serveur pour traçabilité immédiate
    const logLevel = event.success ? 'info' : 'warn';
    const logMessage = formatAuditLog(event);
    
    if (logLevel === 'warn') {
      console.warn('[AUDIT]', logMessage);
    } else {
      console.log('[AUDIT]', logMessage);
    }

    return { ok: true };
  });

/**
 * Récupère les événements d'audit récents
 */
export const getAuditEvents = createServerFn({ method: 'GET' })
  .validator(z.object({
    limit: z.number().optional(),
    eventType: z.enum([
      'CONNEXION_REUSSIE',
      'CONNEXION_ECHOUEE',
      'CREATION_COMPTE',
      'CHANGEMENT_MOT_DE_PASSE',
      'MODIFICATION_ROLE',
      'COMPTE_SUSPENDU',
      'INITIALISATION_ADMIN',
      'VERIFICATION_ADMIN'
    ]).optional(),
    userIdentifier: z.string().optional(),
    since: z.string().optional()
  }).optional())
  .handler(async ({ data }) => {
    let filtered = [...auditLog];

    // Filtrer par type d'événement
    if (data?.eventType) {
      filtered = filtered.filter(e => e.eventType === data.eventType);
    }

    // Filtrer par utilisateur
    if (data?.userIdentifier) {
      filtered = filtered.filter(e => 
        e.userIdentifier.toLowerCase().includes(data.userIdentifier!.toLowerCase())
      );
    }

    // Filtrer par date
    if (data?.since) {
      const sinceDate = new Date(data.since);
      filtered = filtered.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    // Limiter le nombre de résultats
    const limit = data?.limit || 100;
    filtered = filtered.slice(-limit).reverse(); // Plus récents en premier

    return {
      events: filtered,
      total: auditLog.length
    };
  });

/**
 * Statistiques d'audit
 */
export const getAuditStats = createServerFn({ method: 'GET' })
  .validator(z.object({
    since: z.string().optional()
  }).optional())
  .handler(async ({ data }) => {
    let events = [...auditLog];

    // Filtrer par date si fournie
    if (data?.since) {
      const sinceDate = new Date(data.since);
      events = events.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    const stats = {
      total: events.length,
      byType: {} as Record<string, number>,
      bySuccess: {
        success: events.filter(e => e.success).length,
        failure: events.filter(e => !e.success).length
      },
      recentFailures: events
        .filter(e => !e.success)
        .slice(-10)
        .reverse()
        .map(e => ({
          timestamp: e.timestamp,
          eventType: e.eventType,
          userIdentifier: e.userIdentifier,
          details: e.details
        })),
      topUsers: getTopUsers(events, 10)
    };

    // Compter par type d'événement
    events.forEach(e => {
      stats.byType[e.eventType] = (stats.byType[e.eventType] || 0) + 1;
    });

    return stats;
  });

/**
 * Formate un événement d'audit pour affichage lisible
 */
function formatAuditLog(event: AuditEvent): string {
  const parts = [
    `[${event.timestamp}]`,
    `${event.eventType}`,
    `User: ${event.userIdentifier}`,
    `Result: ${event.success ? 'SUCCESS' : 'FAILURE'}`
  ];

  if (event.ipAddress) {
    parts.push(`IP: ${event.ipAddress}`);
  }

  if (event.details && Object.keys(event.details).length > 0) {
    parts.push(`Details: ${JSON.stringify(event.details)}`);
  }

  return parts.join(' | ');
}

/**
 * Obtient les utilisateurs les plus actifs
 */
function getTopUsers(events: AuditEvent[], limit: number): Array<{ user: string; count: number }> {
  const userCounts = new Map<string, number>();
  
  events.forEach(e => {
    const current = userCounts.get(e.userIdentifier) || 0;
    userCounts.set(e.userIdentifier, current + 1);
  });

  return Array.from(userCounts.entries())
    .map(([user, count]) => ({ user, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Efface les logs d'audit (fonction d'administration)
 * À utiliser avec précaution - peut affecter la conformité
 */
export const clearAuditLog = createServerFn({ method: 'POST' })
  .validator(z.object({
    confirm: z.literal(true)
  }))
  .handler(async ({ data }) => {
    if (!data.confirm) {
      return { ok: false, message: 'Confirmation requise' };
    }

    const clearedCount = auditLog.length;
    auditLog.length = 0;

    console.warn('[AUDIT] Logs d\'audit effacés', { clearedCount, timestamp: new Date().toISOString() });

    return { 
      ok: true, 
      message: `${clearedCount} événements d'audit ont été effacés` 
    };
  });

/**
 * Exporte les logs d'audit au format JSON
 */
export const exportAuditLog = createServerFn({ method: 'GET' })
  .validator(z.object({
    since: z.string().optional(),
    until: z.string().optional()
  }).optional())
  .handler(async ({ data }) => {
    let events = [...auditLog];

    if (data?.since) {
      const sinceDate = new Date(data.since);
      events = events.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (data?.until) {
      const untilDate = new Date(data.until);
      events = events.filter(e => new Date(e.timestamp) <= untilDate);
    }

    return {
      exportDate: new Date().toISOString(),
      eventCount: events.length,
      events: events
    };
  });
