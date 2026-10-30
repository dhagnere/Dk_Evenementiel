# 📅 Calendrier Événements Dunkerque — Documentation

Application de gestion et de consultation des événements de la ville de Dunkerque, avec système de permissions et de validation.

---

## 🚀 Démarrage rapide

### **Première connexion**

1. **Si aucun administrateur n'existe** → Créez le compte admin initial
2. **Sinon** → Connectez-vous avec vos identifiants

### **Rôles utilisateurs**

| Rôle | Permissions | Badge |
|------|-------------|-------|
| **Administrateur** | ✅ Tout (modification, validation, import) | Aucun badge |
| **Consultant** | 👁️ Consultation seule | Badge bleu "Consultation seule" |

---

## 📚 Documentation détaillée

### **🔐 Sécurité & Permissions**
- [`SECURITE-VIBE.md`](./SECURITE-VIBE.md) — Protection de l'éditeur Vibe contre les consultants

### **📊 Indicateurs & Statistiques**
- [`KPI-EXPLICATION.md`](./KPI-EXPLICATION.md) — Explication détaillée des 3 KPI affichés

### **📥 Import de données**
- 🛡️ [`IMPORT-ROBUSTE.md`](./IMPORT-ROBUSTE.md) — **Garantie zéro perte : Retry automatique, rate limiting, logs détaillés**
- 🚨 [`CORRECTION-DATES-CRITIQUES.md`](./CORRECTION-DATES-CRITIQUES.md) — **CORRECTION CRITIQUE : Format des dates (DD/MM/YYYY)**
- 🚨 [`DIAGNOSTIC-IMPORT-CORRUPTION.md`](./DIAGNOSTIC-IMPORT-CORRUPTION.md) — **Diagnostic si Pilote/Nature/Direction sont corrompus**
- 📋 [`VALEURS-COLONNES-EXACTES.md`](./VALEURS-COLONNES-EXACTES.md) — **Liste complète des valeurs EXACTES à utiliser (évite "Protocole" par défaut)**
- [`IMPORT-GUIDE.md`](./IMPORT-GUIDE.md) — Guide complet d'import CSV/Excel
- [`VERIFICATION-IMPORT.md`](./VERIFICATION-IMPORT.md) — Comment s'assurer qu'aucun événement n'est oublié
- [`FORMAT-IMPORT.md`](./FORMAT-IMPORT.md) — Format attendu et colonnes
- [`CONVERSION-RAPIDE.md`](./CONVERSION-RAPIDE.md) — Convertir Excel en CSV
- [`CONVERSION-EXCEL-CSV.md`](./CONVERSION-EXCEL-CSV.md) — Guide détaillé de conversion

### **🧹 Nettoyage & Maintenance**
- 🚀 [`VALIDATION-RAPIDE-LISTE.md`](./VALIDATION-RAPIDE-LISTE.md) — **NOUVEAU : Validation et archivage en 1 clic depuis la liste**
- [`VALIDATION-AUTO-ARCHIVAGE.md`](./VALIDATION-AUTO-ARCHIVAGE.md) — Validation automatique lors de l'archivage manuel
- [`GUIDE-NETTOYAGE.md`](./GUIDE-NETTOYAGE.md) — Options de nettoyage pré-import
- [`NETTOYAGE-AUTO.md`](./NETTOYAGE-AUTO.md) — Déduplication automatique
- [`API-RATE-LIMITS.md`](./API-RATE-LIMITS.md) — Gestion des limites API (erreur 429)
- [`API-RATE-LIMITS.md`](./API-RATE-LIMITS.md) — Gestion des limites API (erreur 429)

---

## 🎯 Fonctionnalités principales

### **1. Vue Calendrier** 📅
- Calendrier interactif mensuel
- **🔒 Archivage automatique** : Un bouton "Archiver événements passés" valide et archive automatiquement tous les événements dont la date est révolue
- Pastilles colorées par statut de validation
- Clic sur une date → liste des événements du jour
- Export PDF de la journée

**Pastilles de validation :**
- 🟣 **Violet** → Validation technique ET politique
- 🟢 **Vert** → Validation technique uniquement
- 🔵 **Bleu** → Validation politique uniquement
- 🔴 **Rouge** → Aucune validation

### **2. Vue Liste** 📋
- Tableau exhaustif de tous les événements
- Tri par nom, date, statut
- Filtres : Quartier, Nature, Statut
- Recherche textuelle
- Badge de validation unifié (vert "Validée" / rouge "Non validée")

### **3. Vue Conflits** ⚠️
- Détection automatique des conflits de dates
- Événements à arbitrer (plusieurs événements le même jour)
- Événements arbitrés (prioritaires, ressources bloquées)
- Export PDF des conflits

### **4. Vue Carte** 🗺️
- Géolocalisation des événements
- Marqueurs cliquables avec détails
- Filtrage par période (semaine, mois, année)
- Géocodage automatique via BAN (Base Adresse Nationale)

### **5. Gestion des comptes** 👥 *(Administrateurs uniquement)*
- Création de comptes Administrateur ou Consultant
- Réinitialisation de mots de passe
- Suspension de comptes
- Demandes d'accès en attente

---

## 🔧 Actions administrateur

### **Validation d'événements**
1. Cliquez sur un événement (calendrier, liste, ou conflits)
2. Cochez "Validation Technique" et/ou "Validation Politique"
3. L'événement est marqué comme validé

### **Import de données**
1. Préparez votre fichier CSV (voir [`FORMAT-IMPORT.md`](./FORMAT-IMPORT.md))
2. Cliquez sur "Importer un fichier"
3. Options :
   - **Nettoyer les doublons** → Supprime les événements en double
   - **Renuméroter les IDs** → EVT-2026-0001, EVT-2026-0002...
4. Sélectionnez le fichier → Import automatique

### **Nettoyage du board**
Avant un gros import, activez les options :
- ✅ **Nettoyer les doublons** (recommandé)
- ✅ **Renuméroter les IDs** (optionnel)

⚠️ **Attention** : Ces opérations peuvent prendre 1-2 minutes sur un board de 800+ événements.

---

## 🎨 Interface utilisateur

### **KPI Cards** (en haut à droite)
- **Total affiché** → Nombre d'événements visibles (après filtres)
- **Validés** → Événements avec les 2 validations
- **En attente** → Événements incomplets

### **Badge de validation** (dans toutes les vues)
- ✅ **Vert "Validée"** → Validation technique ET politique OK
- ❌ **Rouge "Non validée"** → Au moins une validation manquante

### **Badge de conflit** (vue Liste et Conflits)
- 🟧 **Orange "À arbitrer"** → Plusieurs événements le même jour
- 🟩 **Vert "Arbitré"** → Événement prioritaire (ressources bloquées)

---

## 🛡️ Sécurité

### **Protection Vibe**
En mode **Consultant**, les protections suivantes sont actives :
- ❌ Pastille Monday masquée (pas d'accès à l'éditeur)
- ❌ Raccourcis clavier désactivés (Ctrl+E, Cmd+E)
- ❌ Menu contextuel désactivé
- 📝 Toutes les tentatives d'accès sont loggées

👉 Voir [`SECURITE-VIBE.md`](./SECURITE-VIBE.md) pour les détails complets.

### **Protection des données**
- ✅ Mots de passe hashés (bcrypt + sel)
- ✅ Sessions avec expiration (24h)
- ✅ Validation côté serveur de toutes les opérations
- ✅ Logs des actions sensibles

---

## 🐛 Résolution de problèmes

### **"Failed to fetch"**
→ Le serveur a mis trop de temps à répondre. Rechargez la page.

### **"Une erreur est survenue lors du chargement des événements"**
→ Vérifiez votre connexion internet et rechargez.

### **L'import se bloque à 30-40 événements**
→ C'est normal ! Le système pause 300ms entre chaque batch de 25 items pour respecter les limites de l'API Monday. Un import de 500 événements prend ~2-3 minutes.

### **Les totaux ne correspondent pas**
→ Les KPI cards affichent les événements **après déduplication** et **filtres actifs**. C'est normal.

### **Je ne peux pas modifier les événements**
→ Vérifiez le badge en haut à droite. Si vous voyez "Consultation seule", vous êtes en mode Consultant. Demandez un accès Administrateur.

---

## 📞 Support

### **Demander un accès Administrateur**
1. Connectez-vous en mode Consultant
2. Cliquez sur "Demander un accès Administrateur" en haut à droite
3. Remplissez le formulaire (nom, raison)
4. Un administrateur recevra votre demande et pourra créer votre compte

### **Réinitialiser votre mot de passe**
1. Sur la page de connexion, cliquez sur "Mot de passe oublié ?"
2. Entrez votre email
3. Suivez les instructions

---

## 🎓 Bonnes pratiques

### **Pour les administrateurs**
1. ✅ Créez des comptes Consultant pour les utilisateurs externes
2. ✅ Nettoyez le board avant les gros imports
3. ✅ Validez les événements au fur et à mesure
4. ✅ Exportez en PDF avant les modifications importantes

### **Pour les consultants**
1. ✅ Utilisez les filtres pour trouver rapidement un événement
2. ✅ Exportez en PDF si vous avez besoin de partager
3. ✅ Demandez un accès Administrateur si vous avez besoin de modifier

---

## 🔄 Mises à jour

### Version actuelle : 1.0 (13 août 2026)

**Nouveautés :**
- ✅ Système de permissions (Admin / Consultant)
- ✅ Protection Vibe contre les accès non autorisés
- ✅ Badge de validation unifié (vert/rouge)
- ✅ Import CSV/Excel optimisé (batches de 25, pause 300ms)
- ✅ Nettoyage automatique des doublons
- ✅ Renumérotation des IDs événement
- ✅ KPI cards dynamiques (totaux cohérents)
- ✅ Export PDF (journée, conflits)
- ✅ Géolocalisation sur carte interactive

---

## 📄 Licence

Application développée pour la Ville de Dunkerque.  
Tous droits réservés © 2026

---

**📅 Calendrier Événements Dunkerque — Gestion simplifiée des événements municipaux.**
