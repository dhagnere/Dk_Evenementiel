import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { getEvents } from '@generated/server/events';
import { withAuthRetry } from '@generated/utils/auth-retry';
import { generateConflictsPdf } from '@generated/server/pdf-generator';
import {
  buildConflictMap,
  getConflictDays,
  getConflictEventCount,
  getMostLoadedDay,
  getSeverityColor,
  getSeverityLabel,
  estArbitre,
  estArchive,
type Event
} from '@generated/utils/conflicts';
import { useEstLectureSeule } from '@generated/utils/access';

import {
  type PeriodType,
  formatPeriodLabel,
  eventOverlapsPeriod,
} from '@generated/utils/period-utils';
import ChargementEvenements from '@generated/components/ChargementEvenements';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar as CalendarIcon, MapPin, CheckCircle2, FileDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ValidationBadge } from '@generated/components/ValidationBadge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

export const Route = createFileRoute('/_app/conflits')({ component: ConflictsView });

function ConflictsView() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [includePast, setIncludePast] = useState(false);
  const [periodFilter, setPeriodFilter] = useState<PeriodType>('all');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [openDays, setOpenDays] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);
  
  // Mode lecture seule (pas de fonctions d'écriture dans cette vue)
  const _lectureSeule = useEstLectureSeule();
  useEffect(() => {
    let active = true;
    
    const loadData = async () => {
      setLoading(true);
      
      try {
        const res = await withAuthRetry(() => getEvents({ data: {} }), { isActive: () => active });
        if (active) {
          console.log('Conflicts: Total items from server:', res?.items?.length || 0);
          setEvents(res?.items ?? []);
          setError(null);
        }
      } catch (e) {
        if (active) {
          setError(e as Error);
          console.error('Error loading events:', e);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    // Délai pour laisser le temps au token monday.com d'être disponible
    const timer = setTimeout(loadData, 1000);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  // Deduplicate events
  const uniqueEventsMap = new Map<string, Event>();
  events.forEach(event => {
    const key = `${(event.nom || event.name).trim().toLowerCase()}_${event.dateDeDbut || ''}_${(event.lieu || '').trim().toLowerCase()}_${(event.organisateur || '').trim().toLowerCase()}`;
    if (!uniqueEventsMap.has(key)) {
      uniqueEventsMap.set(key, event);
    }
  });
  let uniqueEvents = Array.from(uniqueEventsMap.values());

  // Filtrer les événements archivés ET annulés (on ne les affiche jamais dans la vue Conflits)
  uniqueEvents = uniqueEvents.filter(e => !estArchive(e) && e.statut !== 'Annulée');

  // Filtrer les événements par période d'abord
  const periodFilteredEvents = uniqueEvents.filter(e => {
    if (periodFilter === 'all') return true;
    if (!includePast && e.dateDeDbut && new Date(e.dateDeDbut) < new Date()) return false;
    
    return eventOverlapsPeriod(
      e.dateDeDbut ? new Date(e.dateDeDbut) : null,
      e.dateDeFin ? new Date(e.dateDeFin) : null,
      periodFilter,
      referenceDate
    );
  });

  // Build conflict map sur les événements filtrés
  const conflictMap = buildConflictMap(periodFilteredEvents);
  const conflictDays = getConflictDays(conflictMap, includePast);

  // KPIs
  const nbConflictDays = conflictDays.length;
  const nbConflictEvents = getConflictEventCount(conflictDays);
  const mostLoadedDay = getMostLoadedDay(conflictMap);

  const toggleDay = (dateKey: string) => {
    setOpenDays(prev => {
      const newSet = new Set(prev);
      if (newSet.has(dateKey)) {
        newSet.delete(dateKey);
      } else {
        newSet.add(dateKey);
      }
      return newSet;
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const base64Pdf = await generateConflictsPdf({
        data: {
          conflictDays: conflictDays
            .filter(day => day.severity !== 'none')
            .map(day => ({
              date: day.date,
              severity: day.severity as 'none' | 'moderate' | 'high' | 'critical',
              events: day.events.map(e => ({
                id: e.id,
                nom: e.nom ?? null,
                name: e.name,
                lieu: e.lieu ?? null,
                organisateur: e.organisateur ?? null,
                dateDeDbut: e.dateDeDbut ? (typeof e.dateDeDbut === 'string' ? e.dateDeDbut : e.dateDeDbut.toISOString()) : null,
                dateDeFin: e.dateDeFin ? (typeof e.dateDeFin === 'string' ? e.dateDeFin : e.dateDeFin.toISOString()) : null,
                statut: e.statut ?? null,
                validationTechnique: e.validationTechnique ?? null,
                validationPolitique: e.validationPolitique ?? null,
                validParDateClef: e.validParDateClef ?? null,
              })),
            })),
          includePast,
        },
      });

      const link = document.createElement('a');
      link.href = `data:application/pdf;base64,${base64Pdf}`;
      link.download = `conflits-calendrier-${new Date().toISOString().split('T')[0]}.pdf`;
      link.click();
    } catch (e) {
      console.error('Error generating PDF:', e);
      alert('Erreur lors de la génération du PDF');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-medium tracking-tight text-foreground">
                Conflits à Arbitrer
              </h1>
              <p className="mt-1 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                Ville de Dunkerque
              </p>
            </div>

            {/* KPI Cards */}
            <div className="flex gap-4">
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Jours en conflit</div>
                <div className="text-2xl font-medium text-foreground">
                  {loading ? '...' : nbConflictDays}
                </div>
              </div>
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-amber-600">À arbitrer</div>
                <div className="text-2xl font-medium text-amber-600">
                  {loading ? '...' : nbConflictEvents}
                </div>
              </div>
              <div className="rounded-lg border bg-card/80 px-4 py-2 backdrop-blur-sm">
                <div className="font-mono text-xs uppercase tracking-wider text-destructive">Jour le plus chargé</div>
                <div className="text-base font-medium text-destructive">
                  {loading ? '...' : mostLoadedDay ? `${mostLoadedDay.count} à arbitrer` : '—'}
                </div>
                {mostLoadedDay && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(mostLoadedDay.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="border-b bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 space-y-3">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox 
                id="include-past" 
                checked={includePast}
                onCheckedChange={(checked) => setIncludePast(checked === true)}
              />
              <Label htmlFor="include-past" className="font-mono text-xs cursor-pointer">
                Inclure les dates passées
              </Label>
            </div>

            <select
              value={periodFilter}
              onChange={(e) => {
                const newPeriod = e.target.value as PeriodType;
                setPeriodFilter(newPeriod);
                if (newPeriod !== 'day' && newPeriod !== 'week') {
                  setReferenceDate(new Date());
                }
              }}
              className="h-9 px-3 rounded-md border border-input bg-background text-xs font-mono ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring w-[200px]"
            >
              <option value="all">Toutes les périodes</option>
              <option value="day">Jour</option>
              <option value="week">Semaine</option>
              <option value="month">Mois prochain</option>
              <option value="quarter">Trimestre prochain</option>
              <option value="year">Année prochaine</option>
            </select>

            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 ml-auto"
              onClick={handleExportPdf}
              disabled={exportingPdf || conflictDays.length === 0}
            >
              {exportingPdf ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Export...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4" />
                  Exporter PDF
                </>
              )}
            </Button>
          </div>

          {/* Contrôles de période (jour / semaine) */}
          {periodFilter === 'day' && (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 font-mono text-xs">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatPeriodLabel('day', referenceDate)}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={referenceDate}
                  onSelect={(date) => date && setReferenceDate(date)}
                  />
                </PopoverContent>
              </Popover>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReferenceDate(new Date())}
                className="font-mono text-xs"
              >
                Aujourd'hui
              </Button>
            </div>
          )}

          {periodFilter === 'week' && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(referenceDate);
                  newDate.setDate(newDate.getDate() - 7);
                  setReferenceDate(newDate);
                }}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="text-sm font-mono px-4 py-1 bg-muted/50 rounded-md">
                {formatPeriodLabel('week', referenceDate)}
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  const newDate = new Date(referenceDate);
                  newDate.setDate(newDate.getDate() + 7);
                  setReferenceDate(newDate);
                }}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReferenceDate(new Date())}
                className="font-mono text-xs"
              >
                Cette semaine
              </Button>
            </div>
          )}

          {periodFilter === 'month' && (
            <div className="text-sm font-mono text-muted-foreground">
              {formatPeriodLabel('month', referenceDate)}
            </div>
          )}

          {periodFilter === 'quarter' && (
            <div className="text-sm font-mono text-muted-foreground">
              {formatPeriodLabel('quarter', referenceDate)}
            </div>
          )}

          {periodFilter === 'year' && (
            <div className="text-sm font-mono text-muted-foreground">
              {formatPeriodLabel('year', referenceDate)}
            </div>
          )}
        </div>
      </div>

      {/* Conflict List */}
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <ChargementEvenements />
        ) : error ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-8 text-center">
            <p className="text-sm text-destructive">
              Une erreur est survenue lors du chargement des conflits.
            </p>
          </div>
        ) : conflictDays.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p className="text-lg font-medium text-foreground">Aucun conflit détecté</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tous les jours ont moins de 2 événements
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {conflictDays.map(({ date, events, severity }) => {
              const dateObj = new Date(date);
              const isOpen = openDays.has(date);
              const color = getSeverityColor(severity);
              const label = getSeverityLabel(severity);

              return (
                <Collapsible key={date} open={isOpen} onOpenChange={() => toggleDay(date)}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-accent/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div 
                              className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm"
                              style={{ backgroundColor: color }}
                            >
                              {events.length}
                            </div>
                            <div>
                              <CardTitle className="text-lg">
                                {dateObj.toLocaleDateString('fr-FR', {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric'
                                })}
                              </CardTitle>
                              <CardDescription className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" style={{ borderColor: color, color }}>
                                  {label}
                                </Badge>
                                {(() => {
                                  const aArbitrer = events.filter(e => !estArbitre(e)).length;
                                  return (
                                    <span className="text-xs">
                                      {aArbitrer} à arbitrer sur {events.length} événements
                                    </span>
                                  );
                                })()}
                              </CardDescription>
                            </div>
                          </div>
                          {isOpen ? (
                            <ChevronUp className="h-5 w-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-muted-foreground" />
                          )}
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-3">
                        {/* Séparer les événements : à arbitrer d'abord, puis arbitrés */}
                        {(() => {
                          const aArbitrer = events.filter(e => !estArbitre(e));
                          const arbitres = events.filter(e => estArbitre(e));
                          
                          return (
                            <>
                              {/* Événements à arbitrer */}
                              {aArbitrer.map(event => {
                                return (
                                  <div 
                                    key={event.id}
                                    className="border-2 border-amber-500/40 rounded-lg p-4 hover:bg-accent/30 transition-colors cursor-pointer"
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div>
                                        <h4 className="font-semibold text-foreground">
                                          {event.nom || event.name}
                                        </h4>
                                        <p className="text-xs font-mono font-semibold text-primary mt-0.5">
                                          {event.name}
                                        </p>
                                        <Badge variant="outline" className="text-[10px] mt-1 border-amber-500 text-amber-700">
                                          À arbitrer
                                        </Badge>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                      {event.organisateur && (
                                        <div className="flex items-center gap-1.5">
                                          <span>Organisateur : <strong className="text-foreground">{event.organisateur}</strong></span>
                                        </div>
                                      )}
                                      {event.lieu && (
                                        <div className="flex items-center gap-1.5">
                                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                                          <span>Lieu : <strong className="text-foreground">{event.lieu}</strong></span>
                                        </div>
                                      )}
                                      {event.dateDeDbut && (
                                        <div className="flex items-center gap-1.5">
                                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                          <span>Début : <strong className="text-foreground">{new Date(event.dateDeDbut).toLocaleDateString('fr-FR')}</strong></span>
                                        </div>
                                      )}
                                      {event.dateDeFin && (
                                        <div className="flex items-center gap-1.5">
                                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                          <span>Fin : <strong className="text-foreground">{new Date(event.dateDeFin).toLocaleDateString('fr-FR')}</strong></span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-3">
                                      <ValidationBadge 
                                        validationTechnique={event.validationTechnique}
                                        validationPolitique={event.validationPolitique}
                                        validParDateClef={event.validParDateClef}
                                        size="sm"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              
                              {/* Événements arbitrés — affichés en second, légèrement estompés */}
                              {arbitres.map(event => {
                                return (
                                  <div 
                                    key={event.id}
                                    className="border border-green-500/20 rounded-lg p-4 bg-muted/30 opacity-70 hover:opacity-90 transition-opacity"
                                  >
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                      <div>
                                        <h4 className="font-semibold text-foreground">
                                          {event.nom || event.name}
                                        </h4>
                                        <p className="text-xs font-mono font-semibold text-primary mt-0.5">
                                          {event.name}
                                        </p>
                                        <Badge variant="outline" className="text-[10px] mt-1 border-green-600 text-green-700 bg-green-50">
                                          Arbitré — ressources bloquées
                                        </Badge>
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-muted-foreground">
                                      {event.organisateur && (
                                        <div className="flex items-center gap-1.5">
                                          <span>Organisateur : <strong className="text-foreground">{event.organisateur}</strong></span>
                                        </div>
                                      )}
                                      {event.lieu && (
                                        <div className="flex items-center gap-1.5">
                                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                                          <span>Lieu : <strong className="text-foreground">{event.lieu}</strong></span>
                                        </div>
                                      )}
                                      {event.dateDeDbut && (
                                        <div className="flex items-center gap-1.5">
                                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                          <span>Début : <strong className="text-foreground">{new Date(event.dateDeDbut).toLocaleDateString('fr-FR')}</strong></span>
                                        </div>
                                      )}
                                      {event.dateDeFin && (
                                        <div className="flex items-center gap-1.5">
                                          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
                                          <span>Fin : <strong className="text-foreground">{new Date(event.dateDeFin).toLocaleDateString('fr-FR')}</strong></span>
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-3">
                                      <ValidationBadge 
                                        validationTechnique={event.validationTechnique}
                                        validationPolitique={event.validationPolitique}
                                        validParDateClef={event.validParDateClef}
                                        size="sm"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </>
                          );
                        })()}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
