import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, CheckCircle, XCircle, Clock, Info } from 'lucide-react';

/**
 * Composant d'information sur l'envoi d'emails
 * Affiche un résumé des emails qui devraient être envoyés
 */
export function EmailStatusInfo() {

  return (
    <Card className="border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Mail className="h-5 w-5" />
          État du service d'email
        </CardTitle>
        <CardDescription className="text-blue-700">
          Configuration actuelle de l'envoi d'emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="border-amber-200 bg-amber-50">
          <Info className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900 text-sm">
            <strong>Mode développement actif</strong>
            <br />
            Les emails ne sont pas réellement envoyés. Les informations sont affichées dans la console et dans l'interface utilisateur.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Réinitialisation mot de passe</span>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Console uniquement
            </Badge>
          </div>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Approbation de compte</span>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Console uniquement
            </Badge>
          </div>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm font-medium">Notification aux admins</span>
            <Badge variant="secondary" className="gap-1">
              <Clock className="h-3 w-3" />
              Console uniquement
            </Badge>
          </div>
        </div>

        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-900 text-sm space-y-2">
            <strong>Pour activer l'envoi réel d'emails</strong>
            <ul className="list-disc list-inside space-y-1 mt-2 text-xs">
              <li>Intégrez un service comme SendGrid ou AWS SES</li>
              <li>Configurez vos clés API dans les variables d'environnement</li>
              <li>Mettez à jour le fichier <code className="bg-green-100 px-1 rounded">email-service.ts</code></li>
              <li>Les tokens et identifiants seront envoyés directement par email</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="text-xs text-muted-foreground pt-2">
          💡 En attendant, tous les tokens et mots de passe temporaires sont affichés directement dans l'interface pour faciliter les tests.
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Badge d'état d'email avec tooltip
 */
interface EmailBadgeProps {
  envoye?: boolean;
  className?: string;
}

export function EmailBadge({ envoye = false, className = '' }: EmailBadgeProps) {
  if (envoye) {
    return (
      <Badge variant="secondary" className={`gap-1 ${className}`}>
        <CheckCircle className="h-3 w-3" />
        Email préparé
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <XCircle className="h-3 w-3" />
      Email non envoyé
    </Badge>
  );
}
