# 📧 Intégration d'un Service d'Email

## État actuel

Le système d'authentification et de gestion des comptes est **entièrement fonctionnel**, mais les emails sont actuellement **affichés dans la console et l'interface** plutôt qu'envoyés réellement.

### Ce qui fonctionne déjà :

✅ Génération de tokens de réinitialisation (expiration 15 min)  
✅ Cryptage PBKDF2-SHA256 des mots de passe  
✅ Création de comptes avec mot de passe temporaire  
✅ Notifications d'approbation de compte  
✅ Logs d'audit complets  
✅ Interface utilisateur complète  

### Ce qui nécessite une intégration externe :

❌ Envoi réel d'emails aux utilisateurs  
❌ Notification email aux administrateurs  

---

## 🚀 Activation de l'envoi d'emails

Le fichier `src/generated/server/email-service.ts` contient toutes les fonctions d'envoi d'email. Elles sont prêtes à être connectées à un service externe.

### Option 1 : SendGrid (Recommandé)

**Installation :**
\`\`\`bash
npm install @sendgrid/mail
\`\`\`

**Configuration dans `email-service.ts` :**
\`\`\`typescript
import sgMail from '@sendgrid/mail';

// Au début du fichier, après les imports
sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

// Dans la fonction envoyerEmailReset, remplacer le console.log par :
const msg = {
  to: data.email,
  from: '[email protected]', // Votre email vérifié
  subject: sujet,
  text: message,
  html: \`<pre>\${message}</pre>\` // Ou un template HTML personnalisé
};

await sgMail.send(msg);
\`\`\`

**Variables d'environnement :**
\`\`\`
SENDGRID_API_KEY=SG.xxxxxxxxxxxxx
EMAIL_FROM=[email protected]
\`\`\`

---

### Option 2 : AWS SES

**Installation :**
\`\`\`bash
npm install @aws-sdk/client-ses
\`\`\`

**Configuration dans `email-service.ts` :**
\`\`\`typescript
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const sesClient = new SESClient({ 
  region: process.env.AWS_REGION || 'eu-west-1' 
});

// Dans la fonction envoyerEmailReset :
const command = new SendEmailCommand({
  Source: process.env.EMAIL_FROM,
  Destination: { ToAddresses: [data.email] },
  Message: {
    Subject: { Data: sujet },
    Body: { Text: { Data: message } }
  }
});

await sesClient.send(command);
\`\`\`

**Variables d'environnement :**
\`\`\`
AWS_REGION=eu-west-1
AWS_ACCESS_KEY_ID=xxxxx
AWS_SECRET_ACCESS_KEY=xxxxx
EMAIL_FROM=[email protected]
\`\`\`

---

### Option 3 : Mailgun

**Installation :**
\`\`\`bash
npm install mailgun.js form-data
\`\`\`

**Configuration dans `email-service.ts` :**
\`\`\`typescript
import formData from 'form-data';
import Mailgun from 'mailgun.js';

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY || ''
});

// Dans la fonction envoyerEmailReset :
await mg.messages.create(process.env.MAILGUN_DOMAIN || '', {
  from: process.env.EMAIL_FROM,
  to: [data.email],
  subject: sujet,
  text: message
});
\`\`\`

**Variables d'environnement :**
\`\`\`
MAILGUN_API_KEY=xxxxx
MAILGUN_DOMAIN=mg.votredomaine.com
EMAIL_FROM=[email protected]
\`\`\`

---

## 📝 Templates d'email à personnaliser

Une fois le service configuré, vous pouvez améliorer les templates dans `email-service.ts` :

### 1. **Email de réinitialisation** (`envoyerEmailReset`)

Actuellement : texte brut avec token  
Améliorations possibles :
- Template HTML avec logo
- Bouton "Réinitialiser maintenant" (lien direct)
- Branding Dunkerque
- Footer avec mentions légales

### 2. **Email d'approbation** (`envoyerEmailApprobation`)

Actuellement : texte brut avec identifiants  
Améliorations possibles :
- Guide de première connexion
- Lien direct vers l'application
- Tutoriel vidéo
- Contact support

### 3. **Notification admin** (`notifierAdminNouvelleDemande`)

Actuellement : console uniquement  
Améliorations possibles :
- Email groupé aux admins
- Lien direct vers la page de gestion
- Résumé quotidien des demandes

---

## 🔒 Sécurité

⚠️ **Après activation de l'envoi d'emails :**

1. **Retirer le token du retour API**  
   Dans `reset-password.ts`, ligne ~160, supprimer :
   \`\`\`typescript
   token, // À retirer en production
   \`\`\`

2. **Créer une route de réinitialisation**  
   Créer `/reset-password/:token` qui charge automatiquement le token

3. **Limiter le débit**  
   Ajouter un rate-limiting sur les demandes de reset (max 3/heure/email)

4. **Logger les tentatives**  
   Tous les envois d'email sont déjà loggés dans l'audit

---

## 📊 Monitoring

Une fois les emails activés, surveillez :

- **Taux de délivrabilité** (via votre fournisseur)
- **Bounces et plaintes** (emails invalides)
- **Temps de réception** (< 1 minute recommandé)
- **Taux d'ouverture** des emails d'approbation

Les logs d'audit dans l'application tracent déjà toutes les actions.

---

## ✅ Checklist de mise en production

- [ ] Service d'email configuré et testé
- [ ] Variables d'environnement sécurisées
- [ ] Email FROM vérifié par le fournisseur
- [ ] Templates HTML personnalisés (optionnel)
- [ ] Token retiré de la réponse API
- [ ] Route `/reset-password/:token` créée
- [ ] Rate-limiting activé
- [ ] Tests end-to-end réalisés
- [ ] Monitoring configuré

---

## 💡 Pour tester sans vraie intégration

Le système actuel affiche tous les tokens et mots de passe directement dans l'interface, ce qui est parfait pour :

- Tests en développement
- Démonstrations
- Validation du workflow complet

Les utilisateurs peuvent copier/coller les tokens affichés à l'écran.
