import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  demanderReinitialisation, 
  verifierTokenReset, 
  reinitialiserMotDePasse 
} from '@generated/server/reset-password';
import { 
  KeyRound, 
  Mail, 
  CheckCircle2, 
  AlertCircle, 
  ArrowLeft,
  Clock,
  Shield
} from 'lucide-react';

type Etape = 'demande' | 'token-genere' | 'nouveau-mdp' | 'succes';

interface ResetPasswordFlowProps {
  onRetourConnexion: () => void;
}

export function ResetPasswordFlow({ onRetourConnexion }: ResetPasswordFlowProps) {
  const [etape, setEtape] = useState<Etape>('demande');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [tokenExpiration, setTokenExpiration] = useState('');

  const handleDemandeReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setEnCours(true);

    try {
      const result = await demanderReinitialisation({
        data: { email: email.trim() }
      });

      if (result.ok) {
        setToken(result.token || '');
        setTokenExpiration(result.expireDans || '15 minutes');
        setEtape('token-genere');
      } else {
        setErreur(result.message);
      }
    } catch {
      setErreur('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setEnCours(false);
    }
  };

  const handleVerifierToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setEnCours(true);

    try {
      const result = await verifierTokenReset({
        data: { token: token.trim() }
      });

      if (result.ok) {
        setEmail(result.email || email);
        setEtape('nouveau-mdp');
      } else {
        setErreur(result.message);
      }
    } catch {
      setErreur('Token invalide ou expiré');
    } finally {
      setEnCours(false);
    }
  };

  const handleReinitialiser = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');

    // Validation côté client
    if (nouveauMotDePasse.length < 10) {
      setErreur('Le mot de passe doit contenir au moins 10 caractères');
      return;
    }

    if (nouveauMotDePasse !== confirmation) {
      setErreur('Les mots de passe ne correspondent pas');
      return;
    }

    setEnCours(true);

    try {
      const result = await reinitialiserMotDePasse({
        data: {
          token: token.trim(),
          nouveauMotDePasse
        }
      });

      if (result.ok) {
        setEtape('succes');
      } else {
        setErreur(result.message);
      }
    } catch {
      setErreur('Une erreur est survenue lors de la réinitialisation');
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl">
        {/* Étape 1 : Demande de réinitialisation */}
        {etape === 'demande' && (
          <>
            <CardHeader className="space-y-3">
              <Button
                variant="ghost"
                onClick={onRetourConnexion}
                className="w-fit"
                size="sm"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Retour à la connexion
              </Button>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <KeyRound className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mot de passe oublié ?</CardTitle>
                  <CardDescription>
                    Réinitialisez votre mot de passe en quelques étapes
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleDemandeReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Adresse e-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="votre.email@example.com"
                      className="pl-10"
                      disabled={enCours}
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Un lien de réinitialisation sera généré pour cette adresse
                  </p>
                </div>

                {erreur && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{erreur}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={enCours}
                >
                  {enCours ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Génération...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Réinitialiser le mot de passe
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {/* Étape 2 : Token généré (simulé - en production serait envoyé par email) */}
        {etape === 'token-genere' && (
          <>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Lien généré</CardTitle>
                  <CardDescription>
                    Votre lien de réinitialisation est prêt
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert className="border-blue-200 bg-blue-50">
                <Mail className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  <strong>Mode développement :</strong> En production, ce lien serait envoyé par e-mail à <strong>{email}</strong>. 
                  Pour l'instant, il est affiché directement ici pour faciliter les tests.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label>Token de réinitialisation</Label>
                <div className="rounded-lg border bg-muted/50 p-3 font-mono text-xs break-all">
                  {token}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Expire dans {tokenExpiration}
                </div>
              </div>

              <form onSubmit={handleVerifierToken} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token-input">Collez votre token</Label>
                  <Input
                    id="token-input"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Collez le token ici"
                    className="font-mono text-sm"
                    disabled={enCours}
                  />
                </div>

                {erreur && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{erreur}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={enCours}
                >
                  {enCours ? 'Vérification...' : 'Continuer'}
                </Button>
              </form>

              <Button
                variant="ghost"
                onClick={onRetourConnexion}
                className="w-full"
              >
                Retour à la connexion
              </Button>
            </CardContent>
          </>
        )}

        {/* Étape 3 : Nouveau mot de passe */}
        {etape === 'nouveau-mdp' && (
          <>
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Nouveau mot de passe</CardTitle>
                  <CardDescription>
                    Choisissez un mot de passe sécurisé
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleReinitialiser} className="space-y-4">
                <Alert className="border-blue-200 bg-blue-50">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800 text-xs">
                    <strong>Compte :</strong> {email}
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="nouveau-mdp">Nouveau mot de passe</Label>
                  <Input
                    id="nouveau-mdp"
                    type="password"
                    value={nouveauMotDePasse}
                    onChange={(e) => setNouveauMotDePasse(e.target.value)}
                    placeholder="••••••••••"
                    disabled={enCours}
                    required
                    minLength={10}
                  />
                  <p className="text-xs text-muted-foreground">
                    Minimum 10 caractères
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
                  <Input
                    id="confirmation"
                    type="password"
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    placeholder="••••••••••"
                    disabled={enCours}
                    required
                    minLength={10}
                  />
                </div>

                {erreur && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{erreur}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={enCours}
                >
                  {enCours ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Réinitialisation...
                    </>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </Button>
              </form>
            </CardContent>
          </>
        )}

        {/* Étape 4 : Succès */}
        {etape === 'succes' && (
          <>
            <CardHeader className="space-y-3">
              <div className="flex flex-col items-center text-center gap-4 py-6">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Mot de passe réinitialisé</CardTitle>
                  <CardDescription className="mt-2">
                    Votre mot de passe a été changé avec succès
                  </CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <Button
                onClick={onRetourConnexion}
                className="w-full"
              >
                Se connecter maintenant
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
