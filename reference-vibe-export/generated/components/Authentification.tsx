import { useState, useEffect } from 'react';
import { existeAdministrateur, initialiserAdministrateur, connexion } from '@generated/server/auth';
import { DemandeAcces } from './DemandeAcces';
import { ResetPasswordFlow } from './ResetPasswordFlow';
import { LogosInstitutionnels } from './LogosInstitutionnels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, User, Mail, Lock, Info } from 'lucide-react';
const CLE_SESSION = 'session_cal_evt';

interface Session {
  email: string;
  nom: string;
  role: 'Administrateur' | 'Consultant';
  expireLe: number;
}

/**
 * Hook de gestion de session utilisateur
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);

  // Fonction pour charger la session depuis localStorage
  const chargerSession = () => {
    const sessionStockee = localStorage.getItem(CLE_SESSION);
    if (sessionStockee) {
      try {
        const parsed: Session = JSON.parse(sessionStockee);
        // Vérifier si la session est expirée
        if (parsed.expireLe > Date.now()) {
          setSession(parsed);
          return true;
        } else {
          localStorage.removeItem(CLE_SESSION);
          setSession(null);
          return false;
        }
      } catch {
        localStorage.removeItem(CLE_SESSION);
        setSession(null);
        return false;
      }
    }
    setSession(null);
    return false;
  };

  useEffect(() => {
    // Charger la session au montage
    chargerSession();
    setChargement(false);

    // Vérifier périodiquement si la session a changé (utile dans environnement Vibe)
    const intervalle = setInterval(() => {
      chargerSession();
    }, 1000); // Vérifier toutes les secondes

    return () => clearInterval(intervalle);
  }, []);

  const connecter = (nouvelleSession: Session) => {
    localStorage.setItem(CLE_SESSION, JSON.stringify(nouvelleSession));
    setSession(nouvelleSession);
    // Forcer un rechargement immédiat pour s'assurer que la session est prise en compte
    setTimeout(() => {
      chargerSession();
    }, 100);
  };

  const deconnecter = () => {
    localStorage.removeItem(CLE_SESSION);
    setSession(null);
  };

  return { session, connecter, deconnecter, chargement };
}

/**
 * Utilitaire pour vérifier si l'utilisateur est administrateur
 */
export function estAdministrateur(session: Session | null): boolean {
  return session?.role === 'Administrateur';
}

/**
 * Page de connexion avec initialisation du premier compte si nécessaire
 */
export default function PageConnexion() {
  const { connecter } = useSession();
  const [adminExiste, setAdminExiste] = useState<boolean | null>(null);
  const [nombreComptes, setNombreComptes] = useState<number>(0);
  const [erreurLecture, setErreurLecture] = useState<string>('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nom, setNom] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');
  const [afficherDemandeAcces, setAfficherDemandeAcces] = useState(false);
  const [afficherResetPassword, setAfficherResetPassword] = useState(false);

  const chargerEtatComptes = (tentative = 0) => {
    const MAX_TENTATIVES = 3;
    if (tentative === 0) {
      console.log('🔄 Chargement de l\'état des comptes...');
      setErreurLecture('');
      setAdminExiste(null);
    }
    existeAdministrateur()
      .then((resultat) => {
        console.log('✅ État des comptes récupéré:', resultat);
        setAdminExiste(resultat.existe);
        setNombreComptes(resultat.nombreComptes);
        setErreurLecture('');
      })
      .catch((error) => {
        // "Failed to fetch" survient typiquement lors d'un démarrage à froid du serveur
        // ou d'une coupure réseau passagère : on retente automatiquement avant d'afficher une erreur.
        const estErreurReseau = error instanceof TypeError && /fetch/i.test(error.message);

        if (estErreurReseau && tentative < MAX_TENTATIVES) {
          const delai = 800 * (tentative + 1);
          console.warn(`⚠️ Échec réseau (tentative ${tentative + 1}/${MAX_TENTATIVES}), nouvelle tentative dans ${delai}ms...`);
          setTimeout(() => chargerEtatComptes(tentative + 1), delai);
          return;
        }

        console.error('❌ Erreur lors du chargement de l\'état des comptes:', error);
        const message = estErreurReseau
          ? 'Connexion au serveur impossible. Vérifiez votre connexion internet puis réessayez.'
          : (error instanceof Error ? error.message : 'Erreur inconnue');
        setErreurLecture(message);
        setAdminExiste(null);
      });
  };

  useEffect(() => {
    chargerEtatComptes();
  }, []);
const gererInitialisation = async (e: React.FormEvent) => {
  e.preventDefault();
  setErreur('');

  if (motDePasse !== confirmation) {
    setErreur('Les mots de passe ne correspondent pas');
    return;
  }

  if (motDePasse.length < 10) {
    setErreur('Le mot de passe doit contenir au moins 10 caractères');
    return;
  }

  setEnCours(true);

  try {
    const resultat = await initialiserAdministrateur({
      data: { nom, email, motDePasse }
    });

    if (resultat.ok) {
      console.log('✅ Compte administrateur initialisé');
        
        // Auto-connexion après initialisation
      const connexionRes = await connexion({
data: { email, motDePasse }
      });

      if (connexionRes.ok && connexionRes.session) {
        connecter(connexionRes.session);
          
    console.log('✅ Connexion automatique réussie');
          
    // Forcer rechargement pour environnement Vibe
  setTimeout(() => {
    window.location.reload();
  }, 500);
    } else {
  setErreur(connexionRes.message);
}
      } else {
        setErreur(resultat.message);
      }
    } catch (err) {
      console.error('Erreur initialisation:', err);
      setErreur('Une erreur est survenue lors de l\'initialisation');
    } finally {
      setEnCours(false);
    }
  };
  const gererConnexion = async (e: React.FormEvent) => {
    e.preventDefault();
    setErreur('');
    setEnCours(true);

    try {
      console.log('🔐 Tentative de connexion avec:', email);
      const resultat = await connexion({
        data: { email, motDePasse }
      });

      console.log('📥 Réponse de connexion:', resultat);

      if (resultat.ok && resultat.session) {
        // Enregistrer la session
        connecter(resultat.session);
        
        // Log pour debug
        console.log('✅ Connexion réussie:', resultat.session.nom, '-', resultat.session.role);
        console.log('💾 Session enregistrée dans localStorage');
        
        // Dans certains environnements Vibe, forcer un rechargement complet aide
        setTimeout(() => {
          console.log('🔄 Rechargement de la page...');
          window.location.reload();
        }, 500);
      } else {
        console.warn('❌ Échec de connexion:', resultat.message);
        setErreur(resultat.message);
      }
    } catch (err) {
      console.error('❌ Exception lors de la connexion:', err);
      setErreur('Une erreur est survenue lors de la connexion');
    } finally {
      setEnCours(false);
    }
  };

  if (afficherDemandeAcces) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl shadow-xl">
            <CardHeader className="space-y-3 pb-6">
              <Button
                variant="ghost"
                onClick={() => setAfficherDemandeAcces(false)}
                className="w-fit"
              >
                ← Retour à la connexion
              </Button>
            </CardHeader>
            <CardContent>
              <DemandeAcces />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (afficherResetPassword) {
    return (
      <ResetPasswordFlow 
        onRetourConnexion={() => setAfficherResetPassword(false)} 
      />
    );
  }

  if (adminExiste === null && !erreurLecture) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex items-center justify-center">
        <div className="text-muted-foreground">Chargement...</div>
      </div>
    );
  }

  // Erreur de lecture du board
  if (erreurLecture) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex flex-col">
        {/* En-tête */}
        <div className="w-full bg-white border-b shadow-sm">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <LogosInstitutionnels />
            <h1 className="text-2xl font-bold text-slate-800 mt-4">
              Calendrier des Événements
            </h1>
            <p className="text-sm text-slate-600 mt-1">
              Communauté urbaine de Dunkerque
            </p>
          </div>
        </div>

        {/* Contenu principal */}
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="space-y-3 pb-6">
              <div className="mx-auto h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
                <AlertCircle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl text-center">Erreur de connexion</CardTitle>
            </CardHeader>

            <CardContent className="space-y-6">
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Impossible de lire la base des comptes : {erreurLecture}
                </AlertDescription>
              </Alert>

              <Button
                onClick={() => chargerEtatComptes()}
                className="w-full bg-[#0073EA] hover:bg-[#0073EA]/90"
              >
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 flex flex-col">
      {/* En-tête */}
      <div className="w-full bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <LogosInstitutionnels />
          <h1 className="text-2xl font-bold text-slate-800 mt-4">
            Calendrier des Événements
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Communauté urbaine de Dunkerque
          </p>
        </div>
      </div>

      {/* Contenu principal */}
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader className="space-y-3 pb-6">
            {adminExiste ? (
              <>
                <div className="mx-auto h-16 w-16 rounded-full bg-[#0073EA]/10 flex items-center justify-center">
                  <Lock className="h-8 w-8 text-[#0073EA]" />
                </div>
                <CardTitle className="text-2xl text-center">Connexion</CardTitle>
                <CardDescription className="text-center">
                  Accédez au calendrier des événements
                </CardDescription>
              </>
            ) : (
              <>
                <div className="mx-auto h-16 w-16 rounded-full bg-amber-100 flex items-center justify-center">
                  <User className="h-8 w-8 text-amber-600" />
                </div>
                <CardTitle className="text-2xl text-center">
                  Initialisation du compte administrateur
                </CardTitle>
                <CardDescription className="text-center">
                  Créez le premier compte administrateur de l'application
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Encart d'information pour l'initialisation */}
            {!adminExiste && (
              <Alert className="border-amber-200 bg-amber-50">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-sm text-amber-900">
                  Ce compte sera celui du propriétaire de l'application. Il disposera de tous
                  les droits : consultation, modification des arbitrages, création de nouveaux
                  comptes utilisateurs.
                </AlertDescription>
              </Alert>
            )}

            {/* Message d'erreur */}
            {erreur && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            {/* Formulaire d'initialisation */}
            {!adminExiste ? (
              <form onSubmit={gererInitialisation} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nom">Nom complet</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nom"
                      type="text"
                      placeholder="Jean Dupont"
                      value={nom}
                      onChange={(e) => setNom(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Adresse e-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="jean.dupont@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motdepasse">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="motdepasse"
                      type="password"
                      placeholder="Au moins 10 caractères"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                      minLength={10}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmation">Confirmer le mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmation"
                      type="password"
                      placeholder="Retapez le mot de passe"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                      minLength={10}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#0073EA] hover:bg-[#0073EA]/90"
                  disabled={enCours}
                >
                  {enCours ? 'Initialisation en cours…' : 'Créer le compte administrateur'}
                </Button>

                {/* Diagnostic */}
                <div className="text-center text-[11px] text-slate-400 mt-2">
                  Comptes enregistrés : {nombreComptes}
                </div>
              </form>
            ) : (
              /* Formulaire de connexion */
              <form onSubmit={gererConnexion} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-connexion">Adresse e-mail</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email-connexion"
                      type="email"
                      placeholder="votre.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="motdepasse-connexion">Mot de passe</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="motdepasse-connexion"
                      type="password"
                      placeholder="••••••••••"
                      value={motDePasse}
                      onChange={(e) => setMotDePasse(e.target.value)}
                      className="pl-10"
                      required
                      disabled={enCours}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-[#0073EA] hover:bg-[#0073EA]/90"
                  disabled={enCours}
                >
                  {enCours ? 'Connexion en cours…' : 'Se connecter'}
                </Button>

                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => setAfficherResetPassword(true)}
                    className="text-muted-foreground hover:text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                  <button
                    type="button"
                    onClick={() => setAfficherDemandeAcces(true)}
                    className="text-[#0073EA] hover:underline"
                  >
                    Demander un accès
                  </button>
                </div>

                {/* Diagnostic */}
                <div className="text-center text-[11px] text-slate-400 mt-2">
                  Comptes enregistrés : {nombreComptes}
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bandeau d'information en bas */}
      <div className="w-full bg-white border-t">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-start gap-3 text-sm text-slate-600">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-[#0073EA]" />
            <p>
              <strong>Deux profils existent.</strong> Administrateur : consultation et
              modification des arbitrages. Consultant : consultation seule.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
