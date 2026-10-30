# 📅 Dates Clefs — Validation Prioritaire

## 🎯 Qu'est-ce qu'une Date Clef ?

Une **Date Clef** est un événement **obligatoire et prioritaire** qui doit être validé en priorité.

**Exemples typiques :**
- 🇫🇷 **14 Juillet** — Fête Nationale (défilé, feu d'artifice)
- 🇫🇷 **11 Novembre** — Armistice 1918
- 🇫🇷 **8 Mai** — Armistice 1945
- 🎖️ Autres cérémonies patriotiques officielles

---

## 🔍 Comment Reconnaître une Date Clef ?

### **Critère Automatique**

Un événement est marqué comme **Date Clef** si :

✅ **Nature = "Patriotique"**

**→ La pastille bleue "📅 Date Clef" apparaît automatiquement dans la colonne dédiée**

---

## 📊 Colonne "Date Clef" dans la Vue Liste

### **Position**
```
| Statut | Date Clef | Validation | Conflit | Actions |
```

**→ Entre "Statut" et "Validation"**

---

### **Apparence de la Pastille**

#### **TOUS les événements NON validés**
```
🔵 📅 Date Clef
```
- **Couleur** : Bleu
- **État** : Cliquable (TOUS les événements non validés)
- **Tooltip** : "Date Clef : Cliquez pour valider automatiquement"
- **Au clic** : Valide l'événement (statut + validations)

#### **Événement validé ET Date Clef importante (Nature Patriotique)**
```
🟢 ✓ Date Clef
```
- **Couleur** : Vert
- **État** : Non cliquable (déjà validée)
- **Signification** : Date clef importante validée

#### **Événement validé MAIS PAS une Date Clef importante**
```
—
```
- **Affichage** : Tiret gris
- **Signification** : Validé par la colonne "Statut" (événement normal)

---

## ⚡ Validation Rapide en 1 Clic

### **Comment Valider N'IMPORTE QUEL Événement via Date Clef**

1. **Vue Liste** → Repérez la colonne **"Date Clef"**
2. **TOUS les événements non validés** ont une pastille bleue 🔵 **"📅 Date Clef"**
3. **Cliquez sur n'importe quelle pastille bleue**
4. **Dialog de confirmation** s'affiche :
   ```
   ✅ Valider cet événement ?
   
   Événement : Concert de Noël
   
   Cette action va :
   1. Mettre le statut à "Validée"
   2. Cocher les validations Politique et Technique
   
   💡 L'événement restera visible et sera marqué comme
      "Archivée" car sa date est passée
   ```
5. **Cliquez "Confirmer"**
6. **Résultat selon le type d'événement :**
   - **Si Nature = "Patriotique"** → Pastille verte 🟢 **"✓ Date Clef"**
   - **Si autre Nature** → Tiret gris **"—"**

---

### **Résultat**

**Événement Patriotique (Date Clef importante) :**

Avant validation :
```
| Défilé 14 Juillet | 🔴 Non validée | 🔵 📅 Date Clef | ❌ Non validé |
```

Après validation via Date Clef :
```
| Défilé 14 Juillet | 📦 Archivée | 🟢 ✓ Date Clef | ✅ OK |
```

Après validation via Statut :
```
| Défilé 14 Juillet | 📦 Archivée | 🟢 ✓ Date Clef | ✅ OK |
```

---

**Événement Normal (Concert, Sport, etc.) :**

Avant validation :
```
| Concert de Noël | 🔴 Non validée | 🔵 📅 Date Clef | ❌ Non validé |
```

Après validation via Date Clef :
```
| Concert de Noël | 📦 Archivée | — | ✅ OK |
```

Après validation via Statut :
```
| Concert de Noël | 📦 Archivée | — | ✅ OK |
```

**→ La pastille verte "✓ Date Clef" n'apparaît QUE pour les événements de Nature "Patriotique" validés !**

---

## 🎯 Cas d'Usage

### **Cas 1 : Préparation du 14 Juillet**

**Contexte :**
- Défilé + Feu d'artifice = 2 événements à valider

**Actions :**
1. **Vue Liste** → Colonne **"Date Clef"**
2. **Repérez les 2 pastilles bleues** 🔵
3. **Cliquez sur chacune**
4. ✅ **2 événements validés en 10 secondes**

---

### **Cas 2 : Vérification Rapide des Dates Patriotiques**

**Contexte :**
- Vous voulez vous assurer que toutes les cérémonies officielles sont validées

**Actions :**
1. **Vue Liste** → Colonne **"Date Clef"**
2. **Scrollez rapidement** pour repérer les pastilles bleues 🔵
3. **Cliquez sur chaque pastille bleue**
4. ✅ **Toutes les dates clefs validées en quelques clics**

---

### **Cas 3 : Filtrage par Nature "Patriotique"**

**Contexte :**
- Vous voulez voir uniquement les dates clefs

**Actions :**
1. **Vue Liste** → Filtre **"Nature"**
2. **Sélectionnez "Patriotique"**
3. **Résultat** : Seules les dates clefs s'affichent
4. **Colonne "Date Clef"** : Toutes les lignes ont une pastille bleue ou verte

---

## 📋 Badge "Date Clef" dans les Cartes du Calendrier

**TOUS les événements validés** affichent maintenant un badge **"✓ Date Clef"** bleu dans les cartes du calendrier, **à côté du badge "Validée"**.

### **Apparence dans la Carte**

#### **Événement validé (n'importe quelle nature)**
```
┌─────────────────────────────────────────┐
│ 🟢 Concert de Noël                      │
│ EVT-2026-0456                           │
│ Validée    ✓ Date Clef                  │
│                                         │
│ Début : 24/12/2026                      │
│ Nature : Culture                        │
└─────────────────────────────────────────┘
```

**→ Deux badges côte à côte pour TOUS les événements validés**

---

## 📋 Badge Date Clef dans la Fiche Individuelle

Quand vous cliquez sur un événement de Nature "Patriotique", un **badge bleu "Date Clef"** apparaît dans le popup de détails.

### **Apparence**

```
┌─────────────────────────────────────────────┐
│ 📅 Date Clef — Événement Prioritaire      ✓ │
│                                              │
│ Cet événement est marqué comme date clef    │
│ (Nature : Patriotique).                      │
│ ✓ Validé / Validation prioritaire recommandée│
└─────────────────────────────────────────────┘
```

**Composants :**
- 🔵 **Icône** : 📅 dans un cercle bleu
- 📝 **Titre** : "Date Clef — Événement Prioritaire"
- 🔖 **Description** : Nature + état de validation
- ✓ **Badge vert** : Si validé

---

### **États**

#### **Date Clef NON validée**
```
📅 Date Clef — Événement Prioritaire

Cet événement est marqué comme date clef (Nature : Patriotique).
Validation prioritaire recommandée.
```

#### **Date Clef VALIDÉE**
```
📅 Date Clef — Événement Prioritaire          ✓

Cet événement est marqué comme date clef (Nature : Patriotique).
✓ Validé
```

**→ Identification immédiate des dates importantes dans le popup !**

---

## 🔍 Différence entre Date Clef et Validation Normale

| Critère | Validation via Date Clef | Validation via Statut |
|---------|--------------------------|------------------------|
| **Colonne** | "Date Clef" | "Statut" |
| **Pastille avant** | 🔵 Bleue "📅 Date Clef" | 🔴 Rouge "Non validée" |
| **Disponible pour** | TOUS les événements | TOUS les événements |
| **Action** | 1 clic → Validation complète | 1 clic → Validation complète |
| **Pastille après (Patriotique)** | 🟢 "✓ Date Clef" | 🟢 "✓ Date Clef" |
| **Pastille après (Autres)** | — (tiret gris) | — (tiret gris) |
| **Badge dans popup** | ✓ Affiché si Patriotique | ✓ Affiché si Patriotique |

**→ Deux colonnes pour valider, même résultat. La colonne "Date Clef" permet d'identifier visuellement les dates patriotiques importantes après validation.**

---

## 🎛️ Flexibilité de Validation

### **Deux Façons de Valider**

Vous avez maintenant **2 colonnes cliquables** pour valider n'importe quel événement :

#### **1. Colonne "Statut"**
- Pastille rouge 🔴 **"Non validée"**
- Validation classique
- Résultat : Badge "Archivée" dans Statut, "—" dans Date Clef (sauf si Patriotique)

#### **2. Colonne "Date Clef"**
- Pastille bleue 🔵 **"📅 Date Clef"**
- Validation rapide
- Résultat : Badge "Archivée" dans Statut, "✓ Date Clef" si Patriotique, sinon "—"

**→ Choisissez la colonne qui vous convient ! Les deux valident l'événement de la même manière.**

---

### **Cas d'Usage Recommandés**

**Utilisez la colonne "Statut" pour :**
- Validation habituelle des événements
- Changement de statut (Brouillon, Annulée, etc.)

**Utilisez la colonne "Date Clef" pour :**
- Repérage rapide des dates patriotiques
- Validation en masse des événements prioritaires
- Workflow plus visuel (repérer les pastilles bleues)

---

## 📱 Responsive Mobile

La colonne "Date Clef" est visible sur mobile avec les mêmes fonctionnalités :

- ✅ Pastille bleue cliquable au tactile
- ✅ Tooltip au survol
- ✅ Dialog de confirmation adapté

---

## ✅ Garanties

✅ **Détection automatique** : Nature "Patriotique" → Badge "Date Clef"  
✅ **Validation instantanée** : 1 clic = Statut + Validations  
✅ **Visibilité maintenue** : L'événement reste visible après validation  
✅ **Badge vert après validation** : "✓ Date Clef" (non cliquable)  
✅ **Synchronisation multi-jours** : Événement multi-jours → toutes les dates validées  

---

## 🔒 Permissions

| Rôle | Peut cliquer ? | Effet |
|------|----------------|-------|
| **Administrateur** | ✅ Oui | Validation + mise à jour |
| **Consultant** | ❌ Non | Badge statique (lecture seule) |

---

## 📊 Logs de Suivi (Console F12)

```
🔵 Clic sur la date clef détecté
🔵 handleQuickValidateAndArchive appelé pour événement: EVT-2026-0123
✅ Administrateur confirmé, affichage de la confirmation...
✅ Événement validé avec succès (affiché comme archivé car date passée)
```

---

## 🎨 Personnalisation Future

Vous pouvez **étendre la détection** des dates clefs en modifiant la fonction `estDateClef()` :

**Critères possibles :**
- Type "Exceptionnelle" + Niveau "Ville"
- Nom contenant "Défilé", "Cérémonie", "Commémoration"
- Date spécifique (14/07, 11/11, 08/05, etc.)
- Pilote spécifique
- Organisateur = "Ville de Dunkerque - Protocole"

**→ Demandez à l'équipe technique d'ajouter ces critères si besoin**

---

## ✨ Avantages

⚡ **Gain de temps** : Repérage visuel immédiat des dates importantes  
🎯 **Priorisation** : Validation rapide des événements obligatoires  
🔵 **Identification visuelle** : Pastille bleue distinctive  
✅ **Validation complète** : Statut + Validations en 1 clic  
📊 **Traçabilité** : Badge vert après validation  

---

## 🚀 Résumé

**Date Clef = Événement prioritaire avec pastille bleue cliquable pour validation instantanée**

**Critère :** Nature "Patriotique"  
**Colonne :** Entre "Statut" et "Validation"  
**Action :** 1 clic → Validation complète  
**Résultat :** Badge vert "✓ Date Clef"  

**→ Validation prioritaire des dates importantes en quelques secondes !** 🇫🇷✨
