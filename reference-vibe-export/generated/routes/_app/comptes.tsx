import { createFileRoute } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { 
  getDemandesEnAttente, 
  getComptesUtilisateurs, 
  approuverDemande, 
  rejeterDemande,
  creerCompteManuel,
  toggleStatutCompte 
} from '@generated/server/gestion-comptes';
import { testerMotDePasse } from '@generated/server/debug-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  UserPlus, 
  CheckCircle, 
  Users, 
  UserCheck, 
  UserX, 
  Mail, 
  Shield,
  Clock,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Info
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const Route = createFileRoute('/_app/comptes')({ component: GestionComptes });

type Demande = {
  id: string;
  nom: string;
  email: string;
  profil: string;
  motif: string;
  organisation: string;
  dateDemande: string;
};

type Compte = {
  id: string;
  nom: string;
  email: string;
  role: string;
  statut: string;
  derniereConnexion: string;
};

function GestionComptes() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [comptes, setComptes] = useState<Compte[]>([]);
  const [traitement, setTraitement] = useState(false);
  
  // Formulaire création manuelle
  const [dialogCreationOpen, setDialogCreationOpen] = useState(false);
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauEmail, setNouveauEmail] = useState('');
  const [nouveauRole, setNouveauRole] = useState<'Administrateur' | 'Consultant'>('Consultant');
  const [motDePasseGenere, setMotDePasseGenere] = useState('');
  
  // Résultat de création
  const [resultatCreation, setResultatCreation] = useState<{
    email: string;
    motDePasse: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  
  // Dialog de confirmation d'approbation
  const [dialogApprobationOpen, setDialogApprobationOpen] = useState(false);
  const [demandeEnCoursApprobation, setDemandeEnCoursApprobation] = useState<Demande | null>(null);
  
  // Dialog de confirmation de rejet
  const [dialogRejetOpen, setDialogRejetOpen] = useState(false);
  const [demandeEnCoursRejet, setDemandeEnCoursRejet] = useState<Demande | null>(null);
  const [motifRejet, setMotifRejet] = useState('');

  useEffect(() => {
    // Vérifier si admin côté client uniquement
    if (typeof window !== 'undefined') {
      const sessionStr = localStorage.getItem('session_cal_evt');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (session.role === 'Administrateur') {
            setIsAdmin(true);
            chargerDonnees();
            return;
          }
        } catch (e) {
          console.error('Erreur parsing session:', e);
        }
      }
    }
    setIsAdmin(false);
    setLoading(false);
  }, []);

  const chargerDonnees = async () => {
    setLoading(true);
    try {
      const [demandesRes, comptesRes] = await Promise.all([
        getDemandesEnAttente(),
        getComptesUtilisateurs()
      ]);
      
      setDemandes(demandesRes?.demandes ?? []);
      setComptes(comptesRes?.comptes ?? []);
    } catch (error) {
      console.error('Erreur chargement données:', error);
    } finally {
      setLoading(false);
    }
  };

  const genererMotDePasse = () => {
    const caracteres = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let mdp = '';
    for (let i = 0; i < 12; i++) {
      mdp += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
    }
    setMotDePasseGenere(mdp);
  };

  const handleApprouver = async (demande: Demande) => {
    console.log('👆 Bouton Approuver cliqué pour:', demande);
    setDemandeEnCoursApprobation(demande);
    setDialogApprobationOpen(true);
  };
  
  const confirmerApprobation = async () => {
    if (!demandeEnCoursApprobation) return;
    
    // Protection contre les clics multiples
    if (traitement) {
      console.log('⚠️ Traitement déjà en cours, ignoré');
      return;
    }
    
    const demande = demandeEnCoursApprobation;
    console.log('✅ Approbation confirmée, génération du mot de passe...');
    
    const mdpTemp = Array.from({ length: 12 }, () => 
      'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
        .charAt(Math.floor(Math.random() * 69))
    ).join('');
    
    console.log('🔑 Mot de passe généré:', mdpTemp);
    
    setTraitement(true);
    setDialogApprobationOpen(false);
    
    try {
      console.log('📡 Envoi de la requête d\'approbation...');
      const result = await approuverDemande({ 
        data: { 
          demandeId: demande.id, 
          motDePasseTemporaire: mdpTemp 
        } 
      });
      
      console.log('📥 Réponse reçue:', result);
      
      if (result.ok) {
        console.log('✅ Approbation réussie !');
        setResultatCreation({
          email: result.email || demande.email,
          motDePasse: result.motDePasseTemporaire || mdpTemp
        });
        await chargerDonnees();
      } else {
        console.error('❌ Échec de l\'approbation:', result.message);
        alert(result.message || 'Erreur lors de l\'approbation');
      }
    } catch (error) {
      console.error('❌ Exception lors de l\'approbation:', error);
      alert('Erreur lors de l\'approbation de la demande');
    } finally {
      setTraitement(false);
      setDemandeEnCoursApprobation(null);
      console.log('🏁 Traitement terminé');
    }
  };

  const handleRejeter = async (demande: Demande) => {
    console.log('👆 Bouton Rejeter cliqué pour:', demande);
    setDemandeEnCoursRejet(demande);
    setMotifRejet('');
    setDialogRejetOpen(true);
  };
  
  const confirmerRejet = async () => {
    if (!demandeEnCoursRejet || !motifRejet.trim()) {
      alert('Veuillez saisir un motif de rejet');
      return;
    }
    
    // Protection contre les clics multiples
    if (traitement) {
      console.log('⚠️ Traitement déjà en cours, ignoré');
      return;
    }
    
    const demande = demandeEnCoursRejet;
    
    setTraitement(true);
    setDialogRejetOpen(false);
    
    try {
      const result = await rejeterDemande({ 
        data: { 
          demandeId: demande.id, 
          motifRejet: motifRejet 
        } 
      });
      
      if (result.ok) {
        await chargerDonnees();
      } else {
        alert(result.message || 'Erreur lors du rejet');
      }
    } catch (error) {
      console.error('Erreur rejet:', error);
      alert('Erreur lors du rejet de la demande');
    } finally {
      setTraitement(false);
      setDemandeEnCoursRejet(null);
      setMotifRejet('');
    }
  };

  const handleCreerCompte = async () => {
    if (!nouveauNom || !nouveauEmail || !motDePasseGenere) {
      alert('Veuillez remplir tous les champs et générer un mot de passe');
      return;
    }
    
    // Protection contre les clics multiples
    if (traitement) {
      console.log('⚠️ Traitement déjà en cours, ignoré');
      return;
    }
    
    setTraitement(true);
    try {
      const result = await creerCompteManuel({
        data: {
          nom: nouveauNom,
          email: nouveauEmail,
          role: nouveauRole,
          motDePasseTemporaire: motDePasseGenere
        }
      });
      
      if (result.ok) {
        setResultatCreation({
          email: result.email || nouveauEmail,
          motDePasse: result.motDePasseTemporaire || motDePasseGenere
        });
        setDialogCreationOpen(false);
        setNouveauNom('');
        setNouveauEmail('');
        setNouveauRole('Consultant');
        setMotDePasseGenere('');
        await chargerDonnees();
      } else {
        alert(result.message || 'Erreur lors de la création');
      }
    } catch (error) {
      console.error('Erreur création compte:', error);
      alert('Erreur lors de la création du compte');
    } finally {
      setTraitement(false);
    }
  };

  const handleToggleStatut = async (compte: Compte) => {
    // Protection contre les clics multiples
    if (traitement) {
      console.log('⚠️ Traitement déjà en cours, ignoré');
      return;
    }
    
    const nouveauStatut = compte.statut === 'Actif' ? 'Suspendu' : 'Actif';
    const action = compte.statut === 'Actif' ? 'suspendre' : 'réactiver';
    
    // Utiliser window.confirm pour éviter le problème de sandbox
    const confirmation = window.confirm(`Confirmer ${action} le compte de ${compte.nom} ?`);
    if (!confirmation) return;
    
    setTraitement(true);
    try {
      const result = await toggleStatutCompte({
        data: { 
          compteId: compte.id,
          nouveauStatut: nouveauStatut as 'Actif' | 'Suspendu'
        }
      });
      
      if (result.ok) {
        await chargerDonnees();
      } else {
        alert(result.message || `Erreur lors de ${action}`);
      }
    } catch (error) {
      console.error('Erreur toggle statut:', error);
      alert(`Erreur lors de ${action} du compte`);
    } finally {
      setTraitement(false);
    }
  };

  const copierIdentifiants = () => {
    if (!resultatCreation) return;
    
    const texte = `Email: ${resultatCreation.email}\nMot de passe: ${resultatCreation.motDePasse}`;
    navigator.clipboard.writeText(texte);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isAdmin) {
    return (
      <div className="container mx-auto p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              Accès refusé
            </CardTitle>
            <CardDescription>
              Cette page est réservée aux administrateurs.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8">
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Gestion des comptes</h1>
          <p className="text-muted-foreground mt-1">
            Approuvez les demandes d'accès et gérez les comptes utilisateurs
          </p>
        </div>
        <Button onClick={() => setDialogCreationOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Créer un compte
        </Button>
      </div>

      {/* Dialog création manuelle */}
      <Dialog open={dialogCreationOpen} onOpenChange={setDialogCreationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un compte manuellement</DialogTitle>
            <DialogDescription>
              Créez un nouveau compte utilisateur avec un mot de passe temporaire
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="nom">Nom complet</Label>
              <Input
                id="nom"
                value={nouveauNom}
                onChange={(e) => setNouveauNom(e.target.value)}
                placeholder="Jean Dupont"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={nouveauEmail}
                onChange={(e) => setNouveauEmail(e.target.value)}
                placeholder="[email protected]"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="role">Rôle</Label>
              <Select
                value={nouveauRole}
                onValueChange={(v) => setNouveauRole(v as 'Administrateur' | 'Consultant')}
              >
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consultant">Consultant (lecture seule)</SelectItem>
                  <SelectItem value="Administrateur">Administrateur (tous droits)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="mdp">Mot de passe temporaire</Label>
              <div className="flex gap-2">
                <Input
                  id="mdp"
                  value={motDePasseGenere}
                  onChange={(e) => setMotDePasseGenere(e.target.value)}
                  placeholder="Cliquez pour générer"
                  readOnly
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={genererMotDePasse}
                >
                  Générer
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Ce mot de passe sera communiqué à l'utilisateur
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDialogCreationOpen(false)}
              disabled={traitement}
            >
              Annuler
            </Button>
            <Button
              onClick={handleCreerCompte}
              disabled={traitement}
            >
              {traitement ? 'Création...' : 'Créer le compte'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog résultat création */}
      <Dialog open={!!resultatCreation} onOpenChange={() => setResultatCreation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              Compte créé avec succès
            </DialogTitle>
            <DialogDescription>
              Transmettez ces identifiants à l'utilisateur de manière sécurisée
            </DialogDescription>
          </DialogHeader>
          
          {resultatCreation && (
            <div className="space-y-4 py-4">
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2 font-mono text-sm">
                    <div>
                      <span className="text-muted-foreground">Email :</span>
                      <br />
                      <span className="font-semibold">{resultatCreation.email}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Mot de passe :</span>
                      <br />
                      <span className="font-semibold">{resultatCreation.motDePasse}</span>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
              
              <Button
                onClick={copierIdentifiants}
                variant="outline"
                className="w-full"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copié !
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copier les identifiants
                  </>
                )}
              </Button>
              
              <Button
                onClick={async () => {
                  if (!resultatCreation) return;
                  console.log('🔍 Test du mot de passe...');
                  const test = await testerMotDePasse({
                    data: {
                      email: resultatCreation.email,
                      motDePasse: resultatCreation.motDePasse
                    }
                  });
                  console.log('📋 Résultat du test:', test);
                  alert(test.ok ? '✅ Mot de passe valide !' : '❌ ' + test.message);
                }}
                variant="secondary"
                className="w-full"
              >
                🔍 Tester le mot de passe
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog confirmation approbation */}
      <Dialog open={dialogApprobationOpen} onOpenChange={setDialogApprobationOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-green-600" />
              Confirmer l'approbation
            </DialogTitle>
            <DialogDescription>
              Êtes-vous sûr de vouloir approuver cette demande ?
            </DialogDescription>
          </DialogHeader>
          
          {demandeEnCoursApprobation && (
            <div className="space-y-4 py-4">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Nom :</span> {demandeEnCoursApprobation.nom}
                </div>
                <div>
                  <span className="font-medium">Email :</span> {demandeEnCoursApprobation.email}
                </div>
                <div>
                  <span className="font-medium">Profil :</span> {demandeEnCoursApprobation.profil}
                </div>
              </div>
              
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Un mot de passe temporaire sera généré automatiquement et envoyé par email à l'utilisateur.
                </AlertDescription>
              </Alert>
            </div>
          )}
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDialogApprobationOpen(false)}
              disabled={traitement}
            >
              Annuler
            </Button>
            <Button
              onClick={confirmerApprobation}
              disabled={traitement}
            >
              {traitement ? 'Approbation...' : 'Approuver'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmation rejet */}
      <Dialog open={dialogRejetOpen} onOpenChange={setDialogRejetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Confirmer le rejet
            </DialogTitle>
            <DialogDescription>
              Indiquez le motif de rejet de cette demande
            </DialogDescription>
          </DialogHeader>
          
          {demandeEnCoursRejet && (
            <div className="space-y-4 py-4">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Nom :</span> {demandeEnCoursRejet.nom}
                </div>
                <div>
                  <span className="font-medium">Email :</span> {demandeEnCoursRejet.email}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="motif-rejet">Motif du rejet</Label>
                <Input
                  id="motif-rejet"
                  value={motifRejet}
                  onChange={(e) => setMotifRejet(e.target.value)}
                  placeholder="Ex: Profil non adapté, doublon..."
                />
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setDialogRejetOpen(false)}
              disabled={traitement}
            >
              Annuler
            </Button>
            <Button
              onClick={confirmerRejet}
              disabled={traitement}
              variant="destructive"
            >
              {traitement ? 'Rejet...' : 'Rejeter'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Onglets */}
      <Tabs defaultValue="demandes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="demandes" className="gap-2">
            <Clock className="h-4 w-4" />
            Demandes en attente
            {demandes.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {demandes.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="comptes" className="gap-2">
            <Users className="h-4 w-4" />
            Comptes utilisateurs
            <Badge variant="secondary" className="ml-1">
              {comptes.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Demandes en attente */}
        <TabsContent value="demandes" className="space-y-4">
          {demandes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                Aucune demande en attente
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {demandes.map((demande) => (
                <Card key={demande.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{demande.nom}</CardTitle>
                        <CardDescription className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5" />
                          {demande.email}
                        </CardDescription>
                      </div>
                      <Badge variant={demande.profil === 'Administrateur' ? 'default' : 'secondary'}>
                        <Shield className="h-3 w-3 mr-1" />
                        {demande.profil}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm space-y-2">
                      <div>
                        <span className="font-medium">Organisation :</span> {demande.organisation}
                      </div>
                      <div>
                        <span className="font-medium">Motif :</span> {demande.motif}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Demande du {demande.dateDemande}
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-2">
                      <Button
                        onClick={() => handleApprouver(demande)}
                        disabled={traitement}
                        className="flex-1"
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Approuver
                      </Button>
                      <Button
                        onClick={() => handleRejeter(demande)}
                        disabled={traitement}
                        variant="destructive"
                        className="flex-1"
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Rejeter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Comptes utilisateurs */}
        <TabsContent value="comptes" className="space-y-4">
          {comptes.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                Aucun compte utilisateur
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {comptes.map((compte) => (
                <Card key={compte.id}>
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <div className="font-semibold">{compte.nom}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={compte.role === 'Administrateur' ? 'default' : 'secondary'}>
                            {compte.role}
                          </Badge>
                          <Badge variant={compte.statut === 'Actif' ? 'default' : 'destructive'}>
                            {compte.statut}
                          </Badge>
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5" />
                          {compte.email}
                        </div>
                        {compte.derniereConnexion && (
                          <div className="text-xs text-muted-foreground">
                            Dernière connexion : {compte.derniereConnexion}
                          </div>
                        )}
                      </div>
                      
                      <Button
                        onClick={() => handleToggleStatut(compte)}
                        disabled={traitement}
                        variant="outline"
                        size="sm"
                      >
                        {compte.statut === 'Actif' ? 'Suspendre' : 'Réactiver'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
