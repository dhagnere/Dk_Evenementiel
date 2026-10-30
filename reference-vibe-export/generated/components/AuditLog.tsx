import { useState, useEffect } from 'react';
import { getAuditEvents, getAuditStats } from '@generated/server/audit';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Shield, 
  CheckCircle, 
  XCircle, 
  User, 
  Calendar, 
  Filter,
  BarChart3
} from 'lucide-react';

interface AuditEvent {
  timestamp: string;
  eventType: string;
  userIdentifier: string;
  success: boolean;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export function AuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    eventType: '' as '' | 'CONNEXION_REUSSIE' | 'CONNEXION_ECHOUEE' | 'CREATION_COMPTE' | 'CHANGEMENT_MOT_DE_PASSE' | 'MODIFICATION_ROLE' | 'COMPTE_SUSPENDU' | 'INITIALISATION_ADMIN' | 'VERIFICATION_ADMIN',
    userIdentifier: '',
    limit: 100
  });

  const chargerDonnees = async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes] = await Promise.all([
        getAuditEvents({ 
          data: {
            limit: filter.limit,
            eventType: filter.eventType || undefined,
            userIdentifier: filter.userIdentifier || undefined
          }
        }),
        getAuditStats({ data: {} })
      ]);
      
      setEvents(eventsRes?.events || []);
      setStats(statsRes);
    } catch (error) {
      console.error('Erreur chargement audit:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    chargerDonnees();
  }, []);

  const appliquerFiltres = () => {
    chargerDonnees();
  };

  const getEventTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      CONNEXION_REUSSIE: 'Connexion réussie',
      CONNEXION_ECHOUEE: 'Connexion échouée',
      CREATION_COMPTE: 'Création de compte',
      CHANGEMENT_MOT_DE_PASSE: 'Changement mot de passe',
      MODIFICATION_ROLE: 'Modification rôle',
      COMPTE_SUSPENDU: 'Compte suspendu',
      INITIALISATION_ADMIN: 'Initialisation admin',
      VERIFICATION_ADMIN: 'Vérification admin'
    };
    return labels[type] || type;
  };

  const getEventColor = (type: string, success: boolean) => {
    if (!success) return 'destructive';
    
    const colors: Record<string, any> = {
      CONNEXION_REUSSIE: 'default',
      CREATION_COMPTE: 'default',
      CHANGEMENT_MOT_DE_PASSE: 'secondary',
      INITIALISATION_ADMIN: 'default'
    };
    return colors[type] || 'secondary';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-muted-foreground">Chargement du journal d'audit...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            Journal d'audit
          </h1>
          <p className="text-muted-foreground mt-1">
            Traçabilité des événements d'authentification et de gestion des comptes
          </p>
        </div>
      </div>

      {/* Statistiques */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total événements</CardDescription>
              <CardTitle className="text-3xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Succès
              </CardDescription>
              <CardTitle className="text-3xl text-green-600">
                {stats.bySuccess.success}
              </CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <XCircle className="h-4 w-4 text-red-600" />
                Échecs
              </CardDescription>
              <CardTitle className="text-3xl text-red-600">
                {stats.bySuccess.failure}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                Taux de réussite
              </CardDescription>
              <CardTitle className="text-3xl">
                {stats.total > 0 
                  ? Math.round((stats.bySuccess.success / stats.total) * 100) 
                  : 0}%
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Filtres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="userFilter">Utilisateur</Label>
              <Input
                id="userFilter"
                placeholder="Email..."
                value={filter.userIdentifier}
                onChange={(e) => setFilter({ ...filter, userIdentifier: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="limitFilter">Nombre max</Label>
              <Input
                id="limitFilter"
                type="number"
                min="10"
                max="1000"
                value={filter.limit}
                onChange={(e) => setFilter({ ...filter, limit: parseInt(e.target.value) || 100 })}
              />
            </div>

            <div className="flex items-end">
              <Button onClick={appliquerFiltres} className="w-full">
                Appliquer
              </Button>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setFilter({ eventType: '', userIdentifier: '', limit: 100 });
                  setTimeout(chargerDonnees, 100);
                }}
                className="w-full"
              >
                Réinitialiser
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Liste des événements */}
      <Card>
        <CardHeader>
          <CardTitle>Événements récents</CardTitle>
          <CardDescription>
            {events.length} événement{events.length > 1 ? 's' : ''} affiché{events.length > 1 ? 's' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Aucun événement à afficher
              </div>
            ) : (
              events.map((event, index) => (
                <div
                  key={index}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-1">
                    {event.success ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getEventColor(event.eventType, event.success)}>
                        {getEventTypeLabel(event.eventType)}
                      </Badge>
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(event.timestamp).toLocaleString('fr-FR')}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{event.userIdentifier}</span>
                    </div>
                    
                    {event.details && Object.keys(event.details).length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                        {Object.entries(event.details).map(([key, value]) => (
                          <div key={key}>
                            <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {event.ipAddress && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        IP: {event.ipAddress}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Échecs récents */}
      {stats?.recentFailures && stats.recentFailures.length > 0 && (
        <Card className="border-red-200">
          <CardHeader>
            <CardTitle className="text-red-600 flex items-center gap-2">
              <XCircle className="h-5 w-5" />
              Échecs récents
            </CardTitle>
            <CardDescription>
              Tentatives d'authentification échouées les plus récentes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.recentFailures.slice(0, 5).map((failure: any, index: number) => (
                <div key={index} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg text-sm">
                  <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <div className="flex-1">
                    <div className="font-medium">{failure.userIdentifier}</div>
                    <div className="text-xs text-muted-foreground">
                      {getEventTypeLabel(failure.eventType)} • {new Date(failure.timestamp).toLocaleString('fr-FR')}
                    </div>
                    {failure.details?.raison && (
                      <div className="text-xs text-red-600 mt-1">{failure.details.raison}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
