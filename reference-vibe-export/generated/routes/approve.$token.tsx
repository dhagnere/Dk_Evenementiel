import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { approuverViaToken, verifierTokenApprobation } from '@generated/server/approbation-auto';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, Loader2, Mail, User, Shield } from 'lucide-react';
import { LogosInstitutionnels } from '@generated/components/LogosInstitutionnels';

export const Route = createFileRoute('/approve/$token')({
  component: ApprovalPage
});

function ApprovalPage() {
  const { token } = Route.useParams();
  const [verificationEnCours, setVerificationEnCours] = useState(true);
  const [approbationEnCours, setApprobationEnCours] = useState(false);
  const [tokenValide, setTokenValide] = useState(false);
  const [demande, setDemande] = useState<{
    nom: string;
    email: string;
    role: string;
    organisation: string;
    motif: string;
    statut: string;
  } | null>(null);
  const [resultat, setResultat] = useState<{
    ok: boolean;
    message: string;
    compte?: { nom: string; email: string; role: string };
  } | null>(null);

  // Vérifier le token au chargement
  useEffect(() => {
    let active = true;

    verifierTokenApprobation({ data: { token } })
      .then((res) => {
        if (active) {
          setTokenValide(res?.valide || false);
          if (res?.demande) {
            setDemande(res.demande);
          }
        }
      })
      .catch((err) => {
        console.error('Erreur vérification token:', err);
        if (active) setTokenValide(false);
      })
      .finally(() => {
        if (active) setVerificationEnCours(false);
      });

    return () => { active = false; };
  }, [token]);

  const handleApprouver = async () => {
    setApprobationEnCours(true);

    try {
      const res = await approuverViaToken({ data: { token } });
      setResultat(res);
    } catch (err) {
      console.error('Erreur approbation:', err);
      setResultat({
        ok: false,
        message: 'Une erreur est survenue lors de l\'approbation'
      });
    } finally {
      setApprobationEnCours(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex flex-col">
      {/* En-tête */}
      <div className="w-full bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <LogosInstitutionnels />
          <h1 className="text-2xl font-bold text-slate-800 mt-4">
            Approbation de demande d'accès
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Calendrier des Événements - Communauté urbaine de Dunkerque
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl shadow-xl">
          <CardHeader>
            <CardTitle className="text-2xl">
              {verificationEnCours
                ? 'Vérification en cours...'
                : resultat
                ? resultat.ok
                  ? 'Compte créé avec succès'
                  : 'Erreur'
                : 'Approuver cette demande ?'}
            </CardTitle>
            <CardDescription>
              {verificationEnCours
                ? 'Vérification du lien d\'approbation'
                : resultat
                ? resultat.ok
                  ? 'Le compte utilisateur a été créé et les identifiants ont été envoyés'
                  : 'Une erreur s\'est produite'
                : 'Examinez les détails ci-dessous avant d\'approuver'}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {verificationEnCours && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-[#0073EA]" />
              </div>
            )}

            {!verificationEnCours && !tokenValide && !resultat && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  Ce lien d'approbation est invalide, a expiré ou a déjà été utilisé.
                </AlertDescription>
              </Alert>
            )}

            {!verificationEnCours && tokenValide && !resultat && demande && (
              <>
                {demande.statut !== 'En attente' && (
                  <Alert>
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      Cette demande a déjà été traitée (statut : {demande.statut}).
                    </AlertDescription>
                  </Alert>
                )}

                {demande.statut === 'En attente' && (
                  <>
                    <div className="space-y-4 bg-slate-50 rounded-lg p-6">
                      <div className="flex items-start gap-3">
                        <User className="h-5 w-5 text-slate-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-medium text-slate-900">
                            {demande.nom}
                          </div>
                          <div className="text-sm text-slate-600 flex items-center gap-2 mt-1">
                            <Mail className="h-3.5 w-3.5" />
                            {demande.email}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <Shield className="h-5 w-5 text-slate-600 mt-0.5" />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-slate-700">
                            Profil demandé
                          </div>
                          <div className="text-sm text-slate-900 mt-1">
                            {demande.role}
                          </div>
                        </div>
                      </div>

                      {demande.organisation && (
                        <div className="flex items-start gap-3">
                          <div className="h-5 w-5" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700">
                              Organisation
                            </div>
                            <div className="text-sm text-slate-900 mt-1">
                              {demande.organisation}
                            </div>
                          </div>
                        </div>
                      )}

                      {demande.motif && (
                        <div className="flex items-start gap-3">
                          <div className="h-5 w-5" />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-700">
                              Motif de la demande
                            </div>
                            <div className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">
                              {demande.motif}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <Alert className="border-blue-200 bg-blue-50">
                      <AlertDescription className="text-blue-900 text-sm">
                        <strong>Action automatique :</strong> En approuvant, un compte sera créé
                        automatiquement et un email contenant les identifiants sera envoyé à{' '}
                        <strong>{demande.email}</strong>.
                      </AlertDescription>
                    </Alert>

                    <div className="flex justify-end gap-3">
                      <Button
                        onClick={handleApprouver}
                        disabled={approbationEnCours}
                        className="bg-[#0073EA] hover:bg-[#0073EA]/90"
                      >
                        {approbationEnCours ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Approbation en cours...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="mr-2 h-4 w-4" />
                            Approuver cette demande
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}

            {resultat && (
              <>
                {resultat.ok ? (
                  <>
                    <Alert className="border-green-200 bg-green-50">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-900">
                        {resultat.message}
                      </AlertDescription>
                    </Alert>

                    {resultat.compte && (
                      <div className="space-y-3 bg-slate-50 rounded-lg p-6">
                        <div className="text-sm font-medium text-slate-700">
                          Compte créé
                        </div>
                        <div className="space-y-2 text-sm">
                          <div>
                            <span className="text-slate-600">Nom :</span>{' '}
                            <span className="font-medium">{resultat.compte.nom}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Email :</span>{' '}
                            <span className="font-medium">{resultat.compte.email}</span>
                          </div>
                          <div>
                            <span className="text-slate-600">Rôle :</span>{' '}
                            <span className="font-medium">{resultat.compte.role}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <Alert className="border-blue-200 bg-blue-50">
                      <Mail className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-900 text-sm">
                        Un email contenant les identifiants a été envoyé à l'utilisateur.
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <Alert variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>{resultat.message}</AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
