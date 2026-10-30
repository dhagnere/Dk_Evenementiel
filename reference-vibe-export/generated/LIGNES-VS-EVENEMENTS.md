# 🔢 Comprendre : Lignes vs Événements

**Concept clé :** Avec la fusion automatique, le nombre de **lignes** du fichier Excel n'est pas égal au nombre d'**événements** créés.

---

## 📊 Différence Fondamentale

### Lignes (avant fusion)
Ce qui est **écrit** dans le fichier Excel.

```csv
DUCASSE,29/08/2026,Rosendaël
DUCASSE,30/08/2026,Rosendaël
DUCASSE,31/08/2026,Rosendaël
Carnaval,15/03/2026,Centre
Carnaval,16/03/2026,Centre
```
**→ 5 lignes**

### Événements (après fusion)
Ce qui est **créé** dans le board.

```
Board monday.com :
1. DUCASSE (29/08 → 31/08) ← 3 lignes fusionnées
2. Carnaval (15/03 → 16/03) ← 2 lignes fusionnées
```
**→ 2 événements**

---

## 🔄 Le Processus de Transformation

```
150 LIGNES du fichier Excel
      ↓
      ├─ 21 lignes SANS NOM → ignorées (skippedInvalid)
      └─ 129 lignes VALIDES
            ↓
            FUSION AUTOMATIQUE
            ↓
            100 ÉVÉNEMENTS
            ↓
            DÉDUPLICATION avec le board
            ↓
            ├─ 50 NOUVEAUX → créés
            ├─ 50 EXISTANTS → ignorés (validations préservées)
            └─ 0 ÉCHECS
```

**Résultat :**
- 150 lignes → 100 événements
- 50 lignes "perdues" = **fusionnées**, pas perdues !

---

## ❌ Erreur Courante

### Formule FAUSSE
```javascript
// On ne peut PAS additionner lignes et événements !
total = totalCreated + skipped + totalFailed + skippedInvalid
      = 50 événements + 50 événements + 0 événements + 21 lignes
      = ??? (pommes + oranges)
```

### Formule CORRECTE
```javascript
// Traçabilité des LIGNES
totalLignes = lignesValides + lignesInvalides
            = 129 + 21
            = 150 ✅

// Traçabilité des ÉVÉNEMENTS
totalÉvénements = créés + ignorés + échecs
                = 50 + 50 + 0
                = 100 ✅
```

---

## 📈 Exemple Chiffré

### Scénario

**Fichier Excel :**
- 150 lignes au total
- 21 lignes sans nom (invalides)
- 129 lignes valides

**Fusion automatique :**
- DUCASSE : 31 lignes → 1 événement
- Carnaval : 3 lignes → 1 événement
- Autres : 95 lignes → 95 événements (pas de fusion)
- **Total : 129 lignes → 97 événements**

Wait, refaisons le calcul :
- 31 lignes fusionnées en 1 = 30 lignes réduites
- 3 lignes fusionnées en 1 = 2 lignes réduites
- Total réduit : 32 lignes
- 129 - 32 = 97 événements

Ou plus simplement dans notre exemple :
- 129 lignes valides
- 29 lignes fusionnées
- 129 - 29 = 100 événements ✅

**Déduplication avec le board :**
- Board actuel : 50 événements déjà validés
- 100 événements du fichier
  - 50 sont nouveaux → créés
  - 50 existent déjà → ignorés (validations préservées)

### Traçabilité

**Niveau 1 : LIGNES**
```
Total lignes fichier : 150
  = 129 lignes valides
  + 21 lignes invalides
✅ 150 = 150
```

**Niveau 2 : ÉVÉNEMENTS**
```
Total événements après fusion : 100
  = 50 créés
  + 50 ignorés (doublons)
  + 0 échecs
✅ 100 = 100
```

**Relation :**
```
150 lignes
  → (- 21 invalides)
  → 129 lignes valides
  → (- 29 fusionnées)
  → 100 événements
```

---

## 🎯 Points Clés

### 1. Deux Niveaux de Comptage

| Niveau | Ce qu'on compte | Formule |
|--------|----------------|---------|
| **Lignes** | Ce qui est dans le fichier Excel | lignes valides + lignes invalides |
| **Événements** | Ce qui est créé/traité dans le board | créés + ignorés + échecs |

### 2. La Fusion Réduit le Nombre

```
31 lignes "DUCASSE" → 1 événement "DUCASSE"

Ce n'est pas une perte !
C'est une FUSION intelligente.
```

### 3. Ne Jamais Mélanger

```
❌ FAUX : totalLignes + totalÉvénements
✅ VRAI : Tracer les deux séparément
```

---

## 📊 Logs Explicites

### Anciens Logs (ambigus)
```
✅ 50 créés
⏭️ 50 ignorés
📊 TOTAL: 100
❌ ERREUR: 150 - 100 = 50 lignes perdues !
```
**→ Confusion : on compare lignes (150) avec événements (100)**

### Nouveaux Logs (clairs)
```
📊 TRAÇABILITÉ FINALE:
   • Lignes du fichier: 150
   • Lignes invalides (sans nom): 21
   • Lignes valides: 129
   • Lignes valides fusionnées: 129 → 100 événements
   • Événements créés: 50
   • Événements ignorés: 50
   • Échecs: 0
   • TOTAL LIGNES comptabilisées: 150/150 ✅
   • TOTAL ÉVÉNEMENTS traités: 100/100 ✅

✅ TRAÇABILITÉ OK: 100% des lignes comptabilisées 
   (129 valides + 21 invalides) et 100% des 
   événements traités (50 créés + 50 ignorés)
```

---

## 💡 Analogie Simple

Imaginez que vous triez des pièces de monnaie :

**Étape 1 : Comptage initial**
- Vous avez 150 pièces (= lignes du fichier)

**Étape 2 : Tri**
- 21 pièces sont fausses → poubelle (= lignes invalides)
- 129 pièces sont vraies (= lignes valides)

**Étape 3 : Regroupement**
- Vous regroupez par valeur
- 31 pièces de 1€ → 1 pile de "31 × 1€"
- 3 pièces de 2€ → 1 pile de "3 × 2€"
- etc.
- **Résultat : 100 piles** (= événements)

**Question :** Avez-vous perdu 50 pièces ?
**Réponse :** NON ! Vous les avez **regroupées**.

---

## ✅ Conclusion

**La fusion n'est PAS une perte, c'est une transformation.**

```
150 lignes → 100 événements
```

Ce n'est pas :
- ❌ 50 lignes perdues

C'est :
- ✅ 21 lignes invalides (ignorées)
- ✅ 29 lignes fusionnées en événements multi-jours
- ✅ 100 événements créés/traités

**Les deux traçabilités (lignes ET événements) doivent être à 100% ✨**
