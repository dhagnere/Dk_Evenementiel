import { createFileRoute, Link, Outlet } from '@tanstack/react-router';
import { Calendar, List, AlertTriangle, MapPin, LogOut, Users } from 'lucide-react';
import { useEstLectureSeule, BadgeConsultationSeule } from '@generated/utils/access';
import { SecuriteVibe } from '@generated/components/SecuriteVibe';
import { DemandeAcces } from '@generated/components/DemandeAcces';
import { LogosInstitutionnels } from '@generated/components/LogosInstitutionnels';
import { useSession, estAdministrateur, default as PageConnexion } from '@generated/components/Authentification';
import { SecuritePageConnexion } from '@generated/components/SecuritePageConnexion';
import ChargementEvenements from '@generated/components/ChargementEvenements';
import { Button } from '@/components/ui/button';

export const Route = createFileRoute('/_app')({ component: AppLayout });

function AppLayout() {
  const { session, deconnecter, chargement } = useSession();
  const lectureSeule = useEstLectureSeule();

  // Chargement en cours
  if (chargement) {
    return <ChargementEvenements />;
  }

  // Non connecté : afficher uniquement la page de connexion
  if (!session) {
    return (
      <>
        <SecuritePageConnexion />
        <PageConnexion />
      </>
    );
  }

  const isAdmin = estAdministrateur(session);

  return (
    <div className="min-h-screen bg-background">
      {/* Composant de sécurité Vibe - bloque la pastille Monday en mode consultation */}
      <SecuriteVibe lectureSeule={lectureSeule} />
      
      {/* Navigation */}
      <div className="border-b bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4">
          {/* Logos institutionnels en haut */}
          <div className="border-b border-border/50 py-3">
            <LogosInstitutionnels size="md" variant="horizontal" />
          </div>

          {/* Menu de navigation */}
          <div className="flex items-center justify-between gap-4 py-2">
            <div className="flex items-center gap-1">
            <Link
              to="/"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              <Calendar className="h-4 w-4" />
              Calendrier
            </Link>
            <Link
              to="/liste"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              <List className="h-4 w-4" />
              Liste
            </Link>
            <Link
              to="/conflits"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              <AlertTriangle className="h-4 w-4" />
              Conflits
            </Link>
            <Link
              to="/carte"
              className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
            >
              <MapPin className="h-4 w-4" />
              Carte
            </Link>
            {isAdmin && (
              <>
                <Link
                  to="/comptes"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
                >
                  <Users className="h-4 w-4" />
                  Comptes
                </Link>
                <Link
                  to="/procedure-comptes-pdf"
                  className="flex items-center gap-2 rounded-lg px-4 py-2 font-mono text-sm transition-colors hover:bg-accent/50 [&.active]:bg-accent [&.active]:text-accent-foreground"
                >
                  📄 Procédure
                </Link>
              </>
            )}
            </div>

            {/* Informations utilisateur et déconnexion */}
            <div className="flex items-center gap-4">
              {/* Badge et demande d'accès en mode lecture seule */}
              {lectureSeule && (
                <>
                  <BadgeConsultationSeule />
                  <DemandeAcces />
                </>
              )}
              
              {/* Nom et rôle de l'utilisateur */}
              <div className="text-sm text-muted-foreground">
                {session.nom} <span className="font-medium">({session.role})</span>
              </div>
              
              {/* Bouton déconnexion */}
              <Button
                variant="ghost"
                size="sm"
                onClick={deconnecter}
                className="gap-2 text-sm"
              >
                <LogOut className="h-4 w-4" />
                Se déconnecter
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Page Content */}
      <Outlet />
    </div>
  );
}
