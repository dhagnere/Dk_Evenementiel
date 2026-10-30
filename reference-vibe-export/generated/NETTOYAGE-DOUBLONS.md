# 🧹 Nettoyage Automatique des Doublons

## 🎯 Objectif

**Problème** : Lors des imports Excel répétés, le board monday.com grossit car les doublons s'accumulent (même événement créé plusieurs fois avec des IDs différents).

**Solution** : Fonction de nettoyage intelligente qui :
1. Détecte les vrais doublons (même nom + date + lieu + organisateur)
2. Garde le MEILLEUR exemplaire (validé, Date Clef, plus récent)
3. Supprime les autres pour alléger le board

---

## 🔑 Clé de Déduplication

### **Critère d'Identification**

Un événement est considéré comme doublon si :
```
Clé = nom + dateDeDebut + lieu + organisateur
```

**Exemple** :
- Événement A : "Concert" + "24/12/2026" + "Place Centrale" + "Ville"
- Événement B : "Concert" + "24/12/2026" + "Place Centrale" + "Ville"

**→ A et B sont des doublons (même clé)**

---

## 🏆 Critères de Sélection du "Meilleur"

Quand plusieurs événements ont la même clé, on garde **UN SEUL** selon cette priorité :

### **Priorité 1 : Validations Complètes**

✅ **Validé (Technique + Politique)** > ❌ Non validé

**Exemple** :
- EVT-2026-0100 : Validé ✅
- EVT-2026-0200 : Non validé ❌

**→ On garde EVT-2026-0100**

---

### **Priorité 2 : Date Clef**

🔵 **Validé par Date Clef** > ⚪ Sans Date Clef

**Exemple** :
- EVT-2026-0100 : Validé + Date Clef 🔵
- EVT-2026-0200 : Validé (sans Date Clef)

**→ On garde EVT-2026-0100**

---

### **Priorité 3 : Plus Récent**

📅 **CreatedAt plus récent** > Plus ancien

**Exemple** :
- EVT-2026-0100 : Créé le 15/01/2027
- EVT-2026-0200 : Créé le 10/01/2027

**→ On garde EVT-2026-0100 (plus récent)**

---

## 🔄 Workflow Complet

### **Déclenchement**

**Interface** : Vue Liste → Bouton **"Nettoyer doublons"** (🗑️)

**Restrictions** :
- ✅ Visible seulement pour les **Administrateurs**
- ❌ Invisible pour les Consultants (lecture seule)

---

### **Étapes**

```
1. Clic sur "Nettoyer doublons"
         ↓
2. Chargement de TOUS les événements du board
   (peut prendre 10-30 secondes sur gros boards)
         ↓
3. Groupement par clé unique
   (nom + dateDeDebut + lieu + organisateur)
         ↓
4. Pour chaque groupe avec doublons :
   - Trier par priorité (validé > Date Clef > récent)
   - Garder le premier
   - Marquer les autres pour suppression
         ↓
5. Suppression des doublons (un par un, avec pause)
         ↓
6. Affichage du résultat dans un dialog
         ↓
7. Rechargement automatique de la liste
```

---

## 📊 Interface de Résultat

### **Dialog de Résultat**

**KPIs affichés** :
```
┌─────────────────────────────────────────────┐
│  🧹 Nettoyage des doublons terminé          │
├─────────────────────────────────────────────┤
│                                             │
│   Groupes de doublons : 12                  │
│   Doublons supprimés  : 18                  │
│   Échecs              : 0                   │
│                                             │
├─────────────────────────────────────────────┤
│  Détails des doublons nettoyés :            │
│                                             │
│  📅 Concert de Noël                         │
│  24/12/2026 • Place Centrale               │
│  ✓ Conservé : EVT-2026-0100                │
│  ✗ Supprimé : EVT-2026-0200                │
│  ✗ Supprimé : EVT-2026-0300                │
│                                             │
│  📅 Marché de printemps                     │
│  15/03/2027 • Rue du Commerce              │
│  ✓ Conservé : EVT-2027-0050                │
│  ✗ Supprimé : EVT-2027-0051                │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 🧪 Exemple Concret

### **Situation Initiale**

**Board avec 3 doublons du même Concert** :

| ID | Nom | Date | Lieu | Valid. Tech. | Valid. Pol. | Date Clef | CreatedAt |
|----|-----|------|------|--------------|-------------|-----------|-----------|
| EVT-2026-0100 | Concert de Noël | 24/12/2026 | Place Centrale | ✅ | ✅ | ✅ | 20/01/2027 |
| EVT-2026-0200 | Concert de Noël | 24/12/2026 | Place Centrale | ✅ | ✅ | ❌ | 18/01/2027 |
| EVT-2026-0300 | Concert de Noël | 24/12/2026 | Place Centrale | ❌ | ❌ | ❌ | 15/01/2027 |

---

### **Analyse**

**Clé commune** : `concert de noël_2026-12-24_place centrale_ville`

**Tri par priorité** :
1. **EVT-2026-0100** : Validé ✅ + Date Clef 🔵 + Plus récent 📅
2. EVT-2026-0200 : Validé ✅ (mais sans Date Clef)
3. EVT-2026-0300 : Non validé ❌

**Décision** : Garder EVT-2026-0100, supprimer les 2 autres

---

### **Résultat**

**Board après nettoyage** :

| ID | Nom | Date | Lieu | Valid. Tech. | Valid. Pol. | Date Clef | CreatedAt |
|----|-----|------|------|--------------|-------------|-----------|-----------|
| EVT-2026-0100 | Concert de Noël | 24/12/2026 | Place Centrale | ✅ | ✅ | ✅ | 20/01/2027 |

**Gain** : 2 événements supprimés → Board plus léger

**Tracabilité** : Les validations et Date Clef sont préservées (on a gardé le meilleur)

---

## 🛡️ Protections

### **1. Sécurité des Données**

✅ **Validations préservées** : On garde toujours l'événement validé en priorité  
✅ **Date Clef préservée** : Les événements avec Date Clef sont prioritaires  
✅ **Plus récent priorisé** : En cas d'égalité, on garde le plus récent  

**→ On ne perd jamais le travail de validation manuel !**

---

### **2. Performance**

✅ **Pause entre suppressions** : 200ms entre chaque item supprimé  
✅ **Rate limit respecté** : Évite les erreurs 429 de monday.com  
✅ **Logging détaillé** : Chaque opération tracée dans la console  

**→ Garantie de fiabilité même sur gros boards !**

---

### **3. Contrôle d'Accès**

✅ **Administrateurs seulement** : Le bouton n'apparaît pas pour les Consultants  
✅ **Lecture seule respectée** : Impossible d'exécuter en mode consultation  

**→ Protection contre les suppressions accidentelles !**

---

## 📋 Cas d'Usage

### **Cas 1 : Import Répété**

**Chronologie** :
1. Import Excel initial → 500 événements créés
2. Import corrigé (erreur de dates) → 500 doublons créés
3. Import final (erreur de lieux) → 500 doublons supplémentaires

**Board** : 1500 événements (dont 1000 doublons)

**Action** : Clic sur "Nettoyer doublons"

**Résultat** : 
- 500 groupes de doublons détectés
- 1000 doublons supprimés
- 500 événements uniques conservés (les meilleurs)

**→ Board divisé par 3 !** ✅

---

### **Cas 2 : Validation Manuelle Avant Import**

**Chronologie** :
1. Import initial → EVT-2026-0100 "Concert" créé
2. Validation manuelle → EVT-2026-0100 validé + Date Clef
3. Import corrigé → EVT-2026-0500 "Concert" créé (doublon, non validé)

**Board** : 2 événements dont 1 doublon

**Action** : Nettoyage des doublons

**Résultat** :
- EVT-2026-0100 conservé (validé + Date Clef)
- EVT-2026-0500 supprimé (non validé)

**→ Le travail de validation est préservé !** ✅

---

### **Cas 3 : Board Propre**

**Situation** : Aucun doublon dans le board

**Action** : Clic sur "Nettoyer doublons"

**Résultat** :
```
✨ Aucun doublon détecté. Le board est propre !
```

**→ Aucun impact si pas de doublon !** ✅

---

## 🔧 Logs Console

### **Exemple de Logs**

```
🧹 Démarrage du nettoyage des doublons (dryRun: false)...
Chargement de tous les événements du board...
  Chargé 527 événements (page terminée)...
  Chargé 1000 événements (page terminée)...
  Chargé 1200 événements (page terminée)...
✅ Total chargé : 1200 événements
Groupes créés : 600 clés uniques
📋 Doublon détecté: "Concert de Noël" (2 exemplaires)
   Gardé: EVT-2026-0100 (validé: oui, Date Clef: oui)
   Supprimé: EVT-2026-0200 (validé: non, Date Clef: non)
🗑️ Suppression de EVT-2026-0200...
✅ EVT-2026-0200 supprimé
📋 Doublon détecté: "Marché de printemps" (3 exemplaires)
   Gardé: EVT-2027-0050 (validé: oui, Date Clef: non)
   Supprimé: EVT-2027-0051 (validé: non, Date Clef: non)
   Supprimé: EVT-2027-0052 (validé: non, Date Clef: non)
🗑️ Suppression de EVT-2027-0051...
✅ EVT-2027-0051 supprimé
🗑️ Suppression de EVT-2027-0052...
✅ EVT-2027-0052 supprimé
...
✅ Nettoyage terminé : 600 doublons supprimés, 0 échecs
```

---

## ⚙️ Configuration Technique

### **Paramètres**

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `dryRun` | `false` | Mode réel (true = simulation) |
| `limit` | `500` | Items par page lors du chargement |
| `delay` | `200ms` | Pause entre suppressions |

---

### **API Utilisée**

**Fonction** : `findAndCleanDuplicates`

**Fichier** : `src/generated/server/cleanup-duplicates.ts`

**Import** : `import { findAndCleanDuplicates } from '@generated/server/cleanup-duplicates';`

**Appel** :
```typescript
const result = await findAndCleanDuplicates({ 
  data: { 
    dryRun: false, 
    estLectureSeule: lectureSeule 
  } 
});
```

---

## ✅ Garanties

### **Intégrité des Données**

✅ **Événements validés prioritaires** : Jamais supprimés si un doublon non validé existe  
✅ **Date Clef prioritaire** : Les événements avec badge bleu sont gardés en priorité  
✅ **Plus récent priorisé** : En cas d'égalité, on garde la version la plus récente  
✅ **Traçabilité** : Tous les doublons supprimés listés dans le dialog de résultat  

**→ Aucune perte de données critiques !**

---

### **Performance**

✅ **Pagination** : Charge par pages de 500 pour éviter timeouts  
✅ **Rate limiting** : Pause de 200ms entre suppressions  
✅ **Retry** : Gestion des erreurs temporaires  

**→ Fiable même sur boards de 5000+ événements !**

---

### **UX**

✅ **Feedback immédiat** : Dialog avec détails des suppressions  
✅ **Rechargement auto** : La liste se rafraîchit après nettoyage  
✅ **KPIs mis à jour** : Compteurs recalculés automatiquement  

**→ Expérience fluide et transparente !**

---

## 🎉 Récapitulatif

**Fonction** : Nettoyage automatique des doublons

**Déclenchement** : Bouton "Nettoyer doublons" (Vue Liste, administrateurs seulement)

**Critère** : Même nom + date + lieu + organisateur

**Priorité** :
1. Validé (Technique + Politique)
2. Validé par Date Clef
3. Plus récent (createdAt)

**Résultat** :
- ✅ Board allégé (doublons supprimés)
- ✅ Validations préservées
- ✅ Dialog de résultat détaillé
- ✅ Rechargement automatique

**Protection** :
- 🛡️ Administrateurs seulement
- 🛡️ Pause entre suppressions
- 🛡️ Logging complet
- 🛡️ Gestion d'erreurs

**→ Board propre sans perte de données !** 🧹✨
