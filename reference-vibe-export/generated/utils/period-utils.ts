/**
 * Utilitaires pour la gestion des périodes de filtrage
 */

export type PeriodType = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year';

/**
 * Calcule le lundi de la semaine contenant la date donnée
 */
export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Ajuster si dimanche
  return new Date(d.setDate(diff));
}

/**
 * Calcule le dimanche de la semaine contenant la date donnée
 */
export function getSunday(date: Date): Date {
  const monday = getMonday(date);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

/**
 * Formate une période pour l'affichage
 */
export function formatPeriodLabel(
  periodType: PeriodType,
  referenceDate: Date
): string {
  const d = new Date(referenceDate);
  
  switch (periodType) {
    case 'all':
      return 'Tous les événements';
    
    case 'day': {
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      };
      return d.toLocaleDateString('fr-FR', options);
    }
    
    case 'week': {
      const monday = getMonday(d);
      const sunday = getSunday(d);
      return `Semaine du ${monday.getDate()} au ${sunday.getDate()} ${sunday.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`;
    }
    
    case 'month': {
      return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }
    
    case 'quarter': {
      const quarter = Math.floor(d.getMonth() / 3) + 1;
      return `Trimestre ${quarter} ${d.getFullYear()}`;
    }
    
    case 'year': {
      return `Année ${d.getFullYear()}`;
    }
    
    default:
      return 'Tous les événements';
  }
}

/**
 * Vérifie si un événement chevauche une période donnée
 * Un événement pluri-jours est retenu s'il croise au moins un jour de la période
 */
export function eventOverlapsPeriod(
  eventStart: Date | null,
  eventEnd: Date | null,
  periodType: PeriodType,
  referenceDate: Date
): boolean {
  if (!eventStart) return false;
  
  const start = new Date(eventStart);
  const end = eventEnd ? new Date(eventEnd) : start;
  
  if (periodType === 'all') return true;
  
  // Définir les bornes de la période
  let periodStart: Date;
  let periodEnd: Date;
  
  const ref = new Date(referenceDate);
  ref.setHours(0, 0, 0, 0);
  
  switch (periodType) {
    case 'day':
      periodStart = new Date(ref);
      periodEnd = new Date(ref);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    
    case 'week':
      periodStart = getMonday(ref);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = getSunday(ref);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    
    case 'month':
      periodStart = new Date(ref.getFullYear(), ref.getMonth(), 1);
      periodEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    
    case 'quarter': {
      const quarterStart = Math.floor(ref.getMonth() / 3) * 3;
      periodStart = new Date(ref.getFullYear(), quarterStart, 1);
      periodEnd = new Date(ref.getFullYear(), quarterStart + 3, 0, 23, 59, 59, 999);
      break;
    }
    
    case 'year':
      periodStart = new Date(ref.getFullYear(), 0, 1);
      periodEnd = new Date(ref.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    
    default:
      return true;
  }
  
  // Chevauchement : l'événement croise la période si :
  // - son début est avant ou pendant la période ET
  // - sa fin est pendant ou après la période
  return start <= periodEnd && end >= periodStart;
}
