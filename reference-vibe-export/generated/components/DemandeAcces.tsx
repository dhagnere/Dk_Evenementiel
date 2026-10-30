import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, CheckCircle2, AlertCircle, Mail } from 'lucide-react';
import { creerDemandeAcces } from '@generated/server/demande-acces';
import { Alert, AlertDescription } from '@/components/ui/alert';

const STORAGE_KEY = 'demande-acces-calendrier-timestamp';
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 heures

export function DemandeAcces() {
  const [open, setOpen] = useState(false);
  const [nomPrenom, setNomPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [organisation, setOrganisation] = useState('');
  const [profil, setProfil] = useState<'Consultant' | 'Administrateur' | ''>('');
  const [motif, setMotif] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldownActive, setCooldownActive] = useState(false);

  // Vérifier si une demande a déjà été envoyée dans les dernières 24h
  useEffect(() => {
    const lastSubmit = localStorage.getItem(STORAGE_KEY);
    if (lastSubmit) {
      const elapsed = Date.now() - parseInt(lastSubmit, 10);
      if (elapsed < COOLDOWN_MS) {
        setCooldownActive(true);
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation côté client
    if (!nomPrenom.trim()) {
      setError('Le nom et prénom sont obligatoires');
      return;
    }
    if (!email.trim() || !validateEmail(email)) {
      setError('Veuillez saisir une adresse e-mail valide');
      return;
    }
    if (!organisation.trim()) {
      setError('L\'organisation ou service est obligatoire');
      return;
    }
    if (!profil) {
      setError('Veuillez sélectionner un profil');
      return;
    }
    if (!motif.trim()) {
      setError('Le motif de la demande est obligatoire');
      return;
    }

    setSubmitting(true);

    try {
      const res = await creerDemandeAcces({
        data: {
          nomPrenom: nomPrenom.trim(),
          email: email.trim(),
          organisation: organisation.trim(),
          profil,
          motif: motif.trim(),
        },
      });

      if (res?.success) {
        // Succès : mémoriser l'envoi et afficher confirmation
        localStorage.setItem(STORAGE_KEY, Date.now().toString());
        setSubmitted(true);
        setCooldownActive(true);

        // Fermer automatiquement après 5 secondes
        setTimeout(() => {
          setOpen(false);
          // Réinitialiser le formulaire
          setNomPrenom('');
          setEmail('');
          setOrganisation('');
          setProfil('');
          setMotif('');
          setSubmitted(false);
        }, 5000);
      } else {
        setError('Erreur lors de l\'envoi de la demande');
      }
    } catch (e) {
      console.error('Erreur lors de l\'envoi de la demande d\'accès:', e);
      setError(
        e instanceof Error
          ? e.message
          : 'Une erreur est survenue lors de l\'envoi de votre demande'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (cooldownActive) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md bg-muted px-3 py-1.5 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Demande déjà transmise
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-xs">
          <UserPlus className="h-3.5 w-3.5" />
          Demander un accès
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <UserPlus className="h-5 w-5" />
            Demande d'accès
          </DialogTitle>
          <DialogDescription>
            Remplissez ce formulaire pour demander un compte. Votre demande sera examinée par l'administrateur.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
            <div className="text-center space-y-2">
              <p className="font-medium text-foreground">
                Votre demande a bien été transmise
              </p>
              <p className="text-sm text-muted-foreground">
                Un administrateur examinera votre demande et vous recevrez une réponse par email.
              </p>
            </div>
            <Alert className="border-blue-200 bg-blue-50 mt-4">
              <Mail className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-800 text-sm">
                L'administrateur recevra un lien d'approbation par email. Une fois votre demande
                approuvée, vous recevrez vos identifiants de connexion automatiquement.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            {/* Nom et prénom */}
            <div className="space-y-2">
              <Label htmlFor="nom-prenom">
                Nom et prénom <span className="text-destructive">*</span>
              </Label>
              <Input
                id="nom-prenom"
                value={nomPrenom}
                onChange={(e) => setNomPrenom(e.target.value)}
                placeholder="Jean Dupont"
                disabled={submitting}
              />
            </div>

            {/* E-mail */}
            <div className="space-y-2">
              <Label htmlFor="email">
                Adresse e-mail <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jean.dupont@example.com"
                disabled={submitting}
              />
            </div>

            {/* Organisation */}
            <div className="space-y-2">
              <Label htmlFor="organisation">
                Organisation ou service <span className="text-destructive">*</span>
              </Label>
              <Input
                id="organisation"
                value={organisation}
                onChange={(e) => setOrganisation(e.target.value)}
                placeholder="Direction Communication"
                disabled={submitting}
              />
            </div>

            {/* Profil demandé */}
            <div className="space-y-2">
              <Label htmlFor="profil">
                Profil demandé <span className="text-destructive">*</span>
              </Label>
              <Select
                value={profil}
                onValueChange={(value) => setProfil(value as 'Consultant' | 'Administrateur')}
                disabled={submitting}
              >
                <SelectTrigger id="profil">
                  <SelectValue placeholder="Sélectionnez un profil" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Consultant">Consultant</SelectItem>
                  <SelectItem value="Administrateur">Administrateur</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                <strong>Consultant :</strong> consultation seule.{' '}
                <strong>Administrateur :</strong> peut modifier les données.
              </p>
            </div>

            {/* Motif */}
            <div className="space-y-2">
              <Label htmlFor="motif">
                Motif de la demande <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="motif"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                placeholder="Expliquez brièvement pourquoi vous avez besoin d'un accès..."
                rows={4}
                disabled={submitting}
              />
            </div>

            {/* Message d'erreur */}
            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Boutons */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Envoi en cours…
                  </>
                ) : (
                  'Envoyer la demande'
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
