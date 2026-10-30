# 📊 KPI — Indicateurs clés de performance

## Vue d'ensemble des KPI affichés

Les **3 cartes KPI** en haut à droite du calendrier affichent des statistiques en temps réel sur les événements.

---

## 📈 Les 3 KPI expliqués

### **1. Total affiché** 📦

```
Nombre d'événements uniques affichés dans le calendrier
```

**Calcul :**
```typescript
uniqueEvents.length
```

**Ce qui est compté :**
- ✅ Événements **uniques** (dédupliqués par : nom + date début + lieu + organisateur)
- ✅ Événements **futurs** (date de fin >= aujourd'hui)
- ❌ **Exclus** : Événements passés (date de fin < aujourd'hui)
- ❌ **Exclus** : Doublons (même nom, même date, même lieu, même organisateur)

**Exemple :**
```
Si le board contient :
- "Fête de quartier" le 15/08/2026 à Rosendaël (Organisateur: Ville)
- "Fête de quartier" le 15/08/2026 à Rosendaël (Organisateur: Ville) [DOUBLON]
- "Concert" le 20/08/2026 à Centre-ville (Organisateur: CUD)
- "Marché de Noël" le 01/12/2025 (passé)

Total affiché = 2
(Le doublon et l'événement passé sont exclus)
```

---

### **2. Validés** ✅

```
Nombre d'événements avec TOUTES les validations complètes
```

**Calcul :**
```typescript
uniqueEvents.filter(e => 
  e.validationTechnique === true 
  && 
  e.validationPolitique === true
).length
```

**Conditions pour être compté :**
- ✅ **Validation Technique** cochée
- ✅ **Validation Politique** cochée
- ✅ Les DEUX validations doivent être `true`

**Badge associé :**
```
✅ Vert "Validée"
```

**Exemple :**
```
Événement A :
  - Validation Technique : ✓
  - Validation Politique : ✓
  → Compté dans "Validés" ✅

Événement B :
  - Validation Technique : ✓
  - Validation Politique : ✗
  → PAS compté (il manque la validation politique)

Événement C :
  - Validation Technique : ✗
  - Validation Politique : ✗
  → PAS compté (aucune validation)
```

---

### **3. En attente** ⏳

```
Nombre d'événements sans validation complète
```

**Calcul :**
```typescript
total - validated
```

**Conditions pour être compté :**
- ❌ **Au moins UNE** validation manquante
- ❌ Validation Technique = `false` ou `null`
- ❌ Validation Politique = `false` ou `null`

**Badge associé :**
```
❌ Rouge "Non validée"
```

**Exemple :**
```
Si Total affiché = 100
Et Validés = 75

En attente = 100 - 75 = 25
```

---

## 🔄 Mise à jour des KPI

### **Quand les KPI sont recalculés ?**

Les KPI sont **recalculés automatiquement** quand :
1. ✅ Le chargement des événements est terminé
2. ✅ Un événement est ajouté ou modifié
3. ✅ Un événement est validé (cochage des validations)
4. ✅ La recherche change (événements filtrés)
5. ✅ L'option "Afficher les événements passés" est cochée/décochée

**Technologie :** `useMemo` React → recalcul optimisé uniquement quand nécessaire

---

## 🎯 Cas d'usage

### **Scénario 1 : Préparation d'un événement**

```
Total affiché : 150 événements
Validés       : 120 événements (80%)
En attente    :  30 événements (20%)
```

**Interprétation :**
- ✅ 80% des événements sont prêts
- ⚠️ 30 événements nécessitent encore une validation

**Action :** Consulter la vue "Liste" et filtrer par statut pour identifier les événements en attente.

---

### **Scénario 2 : Début d'import**

```
Total affiché : 0 événements
Validés       : 0 événements
En attente    : 0 événements
```

**Interprétation :**
- Le board est vide ou tous les événements sont passés

**Action :** Cliquer sur "Importer un fichier" pour ajouter des événements.

---

### **Scénario 3 : Après import**

```
Total affiché : 528 événements
Validés       :   0 événements (0%)
En attente    : 528 événements (100%)
```

**Interprétation :**
- Import réussi, mais aucune validation
- Tous les événements nécessitent une validation

**Action :** Commencer la validation par lots (par quartier, par nature, etc.)

---

## 🧮 Formules de calcul

### **Total affiché**
```javascript
uniqueEvents.length
```

### **Validés**
```javascript
uniqueEvents.filter(e => 
  e.validationTechnique === true && 
  e.validationPolitique === true
).length
```

### **En attente**
```javascript
total - validated
```

### **Taux de validation**
```javascript
(validated / total) * 100
// Exemple : (120 / 150) * 100 = 80%
```

---

## ⚠️ Points d'attention

### **Pourquoi le Total affiché peut être différent du total du board ?**

1. **Déduplication** → Les doublons sont comptés une seule fois
   ```
   Board : 530 items
   Dédupliqués : 528 items
   → 2 doublons retirés
   ```

2. **Événements passés exclus** (si "Afficher les événements passés" est décoché)
   ```
   Board : 530 items
   Passés : 50 items
   Total affiché : 480 items
   ```

3. **Recherche active** → Seuls les événements correspondants sont comptés
   ```
   Board : 530 items
   Recherche "Concert" : 15 résultats
   Total affiché : 15 items
   ```

### **Pourquoi les KPI ne correspondent pas aux compteurs du board Monday ?**

Les KPI de l'application appliquent des **filtres et déduplication** que Monday.com ne fait pas :
- Monday affiche **tous les items** (y compris doublons et passés)
- L'application affiche **uniquement les événements pertinents** (uniques et futurs)

**C'est normal et voulu !**

---

## 📊 Calcul détaillé — Exemple complet

### **Situation du board**
```
Board Monday : 550 items au total

Détail :
- 520 événements futurs
- 30 événements passés (date fin < aujourd'hui)
- 5 doublons parmi les futurs

Validations :
- 400 événements avec Validation Technique ET Politique
- 115 événements avec une seule validation
- 5 événements sans aucune validation
```

### **Calcul des KPI**

#### **Étape 1 : Déduplication**
```
520 événements futurs - 5 doublons = 515 événements uniques
```

#### **Étape 2 : Total affiché**
```
Total affiché = 515 événements
```

#### **Étape 3 : Validés**
```
Événements avec les 2 validations = 400
Validés = 400 événements
```

#### **Étape 4 : En attente**
```
En attente = Total - Validés
En attente = 515 - 400 = 115 événements
```

### **Résultat affiché**

```
┌─────────────────────┬──────┐
│ Total affiché       │  515 │
├─────────────────────┼──────┤
│ Validés (vert)      │  400 │
├─────────────────────┼──────┤
│ En attente (orange) │  115 │
└─────────────────────┴──────┘

Taux de validation : 77.7%
```

---

## 🔍 FAQ

### **Q : Pourquoi le Total change quand je recherche ?**
**R :** C'est normal ! Le Total affiché représente les événements **actuellement visibles** après filtres et recherche.

### **Q : Pourquoi les Validés ne correspondent pas au statut "Validée" du board ?**
**R :** Le statut "Validée" dans Monday est une colonne libre. Le KPI "Validés" compte uniquement les événements avec **les 2 checkboxes cochées** (Validation Technique ET Politique).

### **Q : Comment augmenter le nombre de Validés ?**
**R :** Cliquez sur un événement et cochez les 2 validations. Le KPI se mettra à jour automatiquement.

### **Q : Les KPI incluent-ils les événements annulés ?**
**R :** Oui, sauf s'ils sont passés. Un événement futur annulé est compté dans "Total affiché" et "En attente".

---

## 📖 Ressources

- [`README.md`](./README.md) — Documentation générale
- [`SECURITE-VIBE.md`](./SECURITE-VIBE.md) — Sécurité de l'application
- [`IMPORT-GUIDE.md`](./IMPORT-GUIDE.md) — Guide d'import

---

**📊 KPI — Des indicateurs précis pour piloter vos événements.**
