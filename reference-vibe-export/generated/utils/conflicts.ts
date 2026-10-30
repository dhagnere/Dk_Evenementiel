/**
 * Utilitaire de détection de conflits de calendrier
 * Un conflit = plusieurs événements présents le MÊME JOUR, tous lieux confondus
 */

export type Event = {
  id: string;
  nom: string | null;
  name: string;
  dateDeDbut: Date | string | null;
  dateDeFin: Date | string | null;
  lieu: string | null;
  organisateur: string | null;
  statut: string | null;
  nature: string | null;
  validationTechnique: boolean | null;
  validationPolitique: boolean | null;
  validParDateClef: boolean | null;
};

export type ConflictSeverity = 'none' | 'moderate' | 'high' | 'critical';

// Seuil à partir duquel on affiche une alerte de conflit
export const SEUIL_ALERTE = 2;

/**
 * Vérifie si un événement est arbitré (double validation acquise)
 * Ressources réservées et bloquées — n'est plus un conflit à traiter
 * IMPORTANT: Un événement annulé n'est JAMAIS arbitré (même s'il était validé avant)
 */
export function estArbitre(event: Event): boolean {
  // Un événement annulé n'est jamais arbitré, même s'il a été validé
  if (event.statut === 'Annulée') return false;
  
  return event.validationTechnique === true && event.validationPolitique === true;
}

/**
 * Vérifie si un événement est archivé (date de fin passée)
 * Les événements archivés sont masqués par défaut dans toutes les vues
 */
export function estArchive(event: Event): boolean {
  if (!event.dateDeFin) return false;
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  const dateFin = new Date(event.dateDeFin);
  dateFin.setHours(0, 0, 0, 0);
  
  const isArchived = dateFin < aujourdhui;
  
  // Log pour debug (premier événement seulement)
  if (Math.random() < 0.001) { // 0.1% de chance pour ne pas spammer
    console.log(`[estArchive DEBUG] Aujourd'hui: ${aujourdhui.toISOString().split('T')[0]}, Event: ${event.nom || event.name}, dateFin: ${dateFin.toISOString().split('T')[0]}, isArchived: ${isArchived}`);
  }
  
  return isArchived;
}

/**
 * Vérifie si un jour est en conflit selon la logique métier :
 * - AU MOINS UN événement non arbitré
 * - ET au moins un autre événement le même jour (arbitré ou non)
 * Si tous les événements d'un jour sont arbitrés → pas de conflit
 */
export function jourEnConflit(dateKey: string, conflictMap: Map<string, Event[]>): boolean {
  const dayEvents = conflictMap.get(dateKey) || [];
  if (dayEvents.length < 2) return false; // Pas de conflit si moins de 2 événements
  
  const nonArbitres = dayEvents.filter(e => !estArbitre(e));
  return nonArbitres.length > 0; // Conflit si au moins un événement non arbitré
}

/**
 * Retourne tous les jours (YYYY-MM-DD) couverts par un événement
 */
export function getEventDays(event: Event): string[] {
  if (!event.dateDeDbut) return [];
  
  const startDate = new Date(event.dateDeDbut);
  startDate.setHours(0, 0, 0, 0);
  
  const endDate = event.dateDeFin ? new Date(event.dateDeFin) : new Date(startDate);
  endDate.setHours(0, 0, 0, 0);
  
  const days: string[] = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    days.push(formatDateKey(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return days;
}

/**
 * Formate une date en clé YYYY-MM-DD
 */
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Construit une Map des événements par jour
 * Map<YYYY-MM-DD, Event[]>
 */
export function buildConflictMap(events: Event[]): Map<string, Event[]> {
  const conflictMap = new Map<string, Event[]>();
  
  // Exclure les événements annulés
  const validEvents = events.filter(e => e.statut !== 'Annulée');
  
  for (const event of validEvents) {
    const days = getEventDays(event);
    for (const day of days) {
      if (!conflictMap.has(day)) {
        conflictMap.set(day, []);
      }
      conflictMap.get(day)!.push(event);
    }
  }
  
  return conflictMap;
}

/**
 * Retourne les autres événements partageant au moins un jour avec l'événement donné
 */
export function getEventConflicts(event: Event, conflictMap: Map<string, Event[]>): Event[] {
  const days = getEventDays(event);
  const conflictingEvents = new Set<Event>();
  
  for (const day of days) {
    const eventsOnDay = conflictMap.get(day) || [];
    for (const e of eventsOnDay) {
      if (e.id !== event.id) {
        conflictingEvents.add(e);
      }
    }
  }
  
  return Array.from(conflictingEvents);
}

/**
 * Calcule le niveau de sévérité d'un jour en fonction du nombre d'événements
 */
export function getDaySeverity(eventCount: number): ConflictSeverity {
  if (eventCount <= 1) return 'none';
  if (eventCount === 2) return 'moderate';
  if (eventCount <= 4) return 'high';
  return 'critical';
}

/**
 * Retourne la couleur associée à un niveau de sévérité
 */
export function getSeverityColor(severity: ConflictSeverity): string {
  switch (severity) {
    case 'moderate': return '#FDAB3D'; // Orange
    case 'high': return '#E44258'; // Rouge
    case 'critical': return '#BB3354'; // Rouge foncé
    default: return 'transparent';
  }
}

/**
 * Retourne le label associé à un niveau de sévérité
 */
export function getSeverityLabel(severity: ConflictSeverity): string {
  switch (severity) {
    case 'moderate': return 'Modéré';
    case 'high': return 'Élevé';
    case 'critical': return 'Critique';
    default: return '';
  }
}

/**
 * Retourne les jours en conflit selon la nouvelle règle métier
 * Un jour est en conflit si : >= seuil événements ET au moins un non arbitré
 */
export function getConflictDays(conflictMap: Map<string, Event[]>, includePast: boolean = false): Array<{
  date: string;
  events: Event[];
  severity: ConflictSeverity;
}> {
  const result: Array<{ date: string; events: Event[]; severity: ConflictSeverity }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (const [dateKey, events] of conflictMap.entries()) {
    // Appliquer la nouvelle règle : conflit si au moins un événement non arbitré et >= 2 événements
    if (!jourEnConflit(dateKey, conflictMap)) continue;
    
    const date = new Date(dateKey);
    if (!includePast && date < today) continue;
    
    // Ne compter que les événements NON arbitrés pour la sévérité
    const eventsNonArbitres = events.filter(e => !estArbitre(e));
    
    result.push({
      date: dateKey,
      events,
      severity: getDaySeverity(eventsNonArbitres.length), // Sévérité basée sur les NON arbitrés
    });
  }
  
  // Trier par date croissante
  result.sort((a, b) => a.date.localeCompare(b.date));
  
  return result;
}

/**
 * Retourne le nombre d'événements à arbitrer (non arbitrés) dans les jours en conflit
 */
export function getConflictEventCount(conflictDays: Array<{ events: Event[] }>): number {
  const eventIds = new Set<string>();
  for (const day of conflictDays) {
    for (const event of day.events) {
      if (!estArbitre(event)) {
        eventIds.add(event.id);
      }
    }
  }
  return eventIds.size;
}

/**
 * Retourne le jour le plus chargé (avec le plus d'événements à arbitrer)
 */
export function getMostLoadedDay(conflictMap: Map<string, Event[]>): { date: string; count: number } | null {
  let maxCount = 0;
  let maxDate = '';
  
  for (const [date, events] of conflictMap.entries()) {
    // Ne compter que les événements NON arbitrés
    const nonArbitresCount = events.filter(e => !estArbitre(e)).length;
    if (nonArbitresCount > maxCount) {
      maxCount = nonArbitresCount;
      maxDate = date;
    }
  }
  
  return maxCount > 0 ? { date: maxDate, count: maxCount } : null;
}
