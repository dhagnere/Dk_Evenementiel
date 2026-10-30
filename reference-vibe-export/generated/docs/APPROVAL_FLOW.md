# 🔄 Flux automatisé de création de compte

## Vue d'ensemble

Le système implémente un flux complet d'approbation de compte avec notifications email :

```
Demandeur → Formulaire → Email Admin → Lien Approbation → Création Auto → Email Client
```

---

## 📋 Étape par étape

### 1️⃣ **Demande d'accès**

**Action :** L'utilisateur remplit le formulaire de demande d'accès

**Fichier :** `src/generated/components/DemandeAcces.tsx`

**Données collectées :**
- Nom et prénom
- Adresse email
- Organisation/service
- Profil souhaité (Consultant ou Administrateur)
- Motif de la demande

**Résultat :**
- Un item `[DEMANDE] Nom` est créé dans le board
- Un token d'approbation unique est généré (validité 7 jours)
- Un email est préparé pour l'administrateur

---

### 2️⃣ **Notification à l'administrateur**

**Fichier :** `src/generated/server/monday-email.ts` → `envoyerEmailDemandeAdmin`

**Contenu de l'email :**
```
Nouvelle demande d'accès - [Nom]

INFORMATIONS DU DEMANDEUR
━━━━━━━━━━━━━━━━━━━━━━━━━
👤 Nom : [Nom complet]
📧 Email : [email]
🏢 Organisation : [organisation]
🔐 Profil demandé : [Consultant/Administrateur]

💬 Motif :
[Texte libre]

✅ APPROUVER LA DEMANDE
Cliquez sur le lien ci-dessous :
https://app.monday.com/approve/[TOKEN]
```

**Destinataire :** Premier administrateur actif trouvé dans le board

---

### 3️⃣ **Clic sur le lien d'approbation**

**Route :** `/approve/:token`

**Fichier :** `src/generated/routes/approve.$token.tsx`

**Vérifications effectuées :**
1. ✅ Le token existe et n'est pas expiré
2. ✅ La demande existe et est en statut "En attente"
3. ✅ Le token n'a pas déjà été utilisé

**Page affichée :**
- Résumé de la demande (nom, email, profil, organisation, motif)
- Bouton "Approuver cette demande"
- Avertissement : action automatique irréversible

---

### 4️⃣ **Création automatique du compte**

**Fichier :** `src/generated/server/approbation-auto.ts` → `approuverViaToken`

**Actions effectuées :**
1. 🔐 Génération d'un mot de passe temporaire sécurisé (12 caractères)
2. 🔒 Cryptage du mot de passe (PBKDF2-SHA256 + sel unique)
3. 👤 Création du compte dans le board avec :
   - Nom complet
   - Email
   - Rôle (Consultant/Administrateur)
   - Statut : **Actif** (pas besoin de réinitialiser)
   - Empreinte cryptée du mot de passe
   - Sel unique
4. ✅ Marquage de la demande comme "Approuvée"
5. 🔥 Invalidation du token (usage unique)
6. 📝 Log d'audit de la création
7. 📧 Envoi de l'email au client

---

### 5️⃣ **Email au client avec identifiants**

**Fichier :** `src/generated/server/monday-email.ts` → `envoyerEmailApprobationClient`

**Contenu de l'email :**
```
Votre accès à l'application Calendrier des Événements

Bonjour [Nom],

Vous avez demandé un accès à l'application de suivi des événements 
dunkerquois. Vous pouvez dorénavant vous y connecter en utilisant votre 
adresse mail et le mot de passe fournis dans ce message.

🔐 VOS IDENTIFIANTS
━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Email : [email]
🔑 Mot de passe : [MOT_DE_PASSE_EN_CLAIR]
👤 Profil : [Consultant/Administrateur]

⚠️ IMPORTANT
Pour des raisons de sécurité, nous vous recommandons de changer ce mot 
de passe lors de votre première connexion.

[Message spécifique au profil]
```

**Destinataire :** Email du demandeur

---

## 🔐 Sécurité

### Mot de passe temporaire
- ✅ **Généré aléatoirement** : 12 caractères (majuscules, minuscules, chiffres, symboles)
- ✅ **Envoyé en clair par email** : l'utilisateur peut le copier facilement
- ✅ **Crypté dans le board** : PBKDF2-SHA256 avec 100 000 itérations + sel unique
- ✅ **Jamais stocké en clair** : impossible de le récupérer depuis le board

### Token d'approbation
- ✅ **Cryptographiquement sûr** : 32 octets aléatoires (64 caractères hex)
- ✅ **Usage unique** : automatiquement détruit après utilisation
- ✅ **Expiration** : 7 jours de validité
- ✅ **Stockage en mémoire** : pas de persistance dans le board

### Logs d'audit
- ✅ Toutes les créations de compte sont tracées
- ✅ L'origine (approbation automatique) est enregistrée
- ✅ L'email de l'utilisateur est loggé

---

## 📧 Intégration email

**État actuel :** Mode développement
- Les emails sont **préparés** et **loggés dans la console**
- Les informations sont affichées dans l'interface pour debug
- Le flux complet fonctionne sans service d'email externe

**Pour activer l'envoi réel :**

Consultez `src/generated/docs/EMAIL_INTEGRATION.md` pour intégrer :
- SendGrid
- AWS SES
- Mailgun
- Ou tout autre service SMTP

Les fonctions d'email dans `monday-email.ts` sont prêtes à être connectées.

---

## 🎯 Avantages du flux automatisé

### Pour l'administrateur
- ✅ Un seul clic pour approuver
- ✅ Pas besoin de se connecter à l'application
- ✅ Pas de génération manuelle de mot de passe
- ✅ Notification immédiate des nouvelles demandes

### Pour le demandeur
- ✅ Réception automatique des identifiants
- ✅ Peut se connecter immédiatement
- ✅ Mot de passe lisible dans l'email
- ✅ Pas d'étape manuelle de réinitialisation

### Pour le système
- ✅ Zéro intervention humaine après le clic
- ✅ Sécurité maximale (cryptage, tokens, logs)
- ✅ Traçabilité complète
- ✅ Tokens à usage unique

---

## 🧪 Tests

### Tester le flux complet (mode dev)

1. **Soumettre une demande**
   - Aller sur la page de connexion
   - Cliquer sur "Demander un accès"
   - Remplir le formulaire

2. **Consulter la console serveur**
   - Le token et le lien d'approbation s'affichent
   - Copier le lien `/approve/[TOKEN]`

3. **Simuler le clic admin**
   - Accéder à la route : `https://[votre-app]/approve/[TOKEN]`
   - Vérifier les informations affichées
   - Cliquer sur "Approuver cette demande"

4. **Consulter la console serveur**
   - Le mot de passe temporaire s'affiche en clair
   - L'email au client est loggé

5. **Se connecter**
   - Retourner sur la page de connexion
   - Utiliser l'email et le mot de passe temporaire
   - ✅ Connexion réussie !

---

## 📁 Fichiers du système

**Serveur :**
- `approbation-auto.ts` - Logique d'approbation et création de compte
- `monday-email.ts` - Préparation des emails (admin + client)

**Routes :**
- `approve.$token.tsx` - Page d'approbation accessible via lien email

**Composants :**
- `DemandeAcces.tsx` - Formulaire de demande (mis à jour)

**Documentation :**
- `EMAIL_INTEGRATION.md` - Guide d'intégration service d'email
- `APPROVAL_FLOW.md` - Ce document

---

## ✅ Checklist de production

- [ ] Intégrer un service d'email (SendGrid, AWS SES, etc.)
- [ ] Configurer l'URL de base de l'application (`APP_URL`)
- [ ] Tester l'envoi réel d'emails
- [ ] Vérifier que les emails arrivent (boîte spam ?)
- [ ] Personnaliser les templates d'email (logo, couleurs, footer)
- [ ] Configurer un domaine email vérifié
- [ ] Tester le flux complet end-to-end
- [ ] Monitorer les logs d'audit
- [ ] Configurer des alertes en cas d'échec d'email

---

Le système est maintenant **100% fonctionnel** en mode développement avec tous les emails loggés dans la console ! 🎉
