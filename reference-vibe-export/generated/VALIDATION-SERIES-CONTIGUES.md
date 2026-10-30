# Validation Intelligente : Séries Contiguës vs Dispersées

**Version** : `b7c9e4f5-3d8a-4e9f-a1b2-5c6d7e8f9g0h`  
**Date** : 2026-08-16

---

## 🎯 Différenciation Intelligente

### **Problème Initial**

**Tous les événements avec le même nom étaient validés ensemble**, même si :
- ❌ Festival 3 jours consécutifs (12, 13, 14 août) → OK ✅
- ❌ Ateliers tous les samedis (1, 8, 15, 22 sept) → **PAS OK** ❌

**→ Besoin de distinguer les séries contiguës des séries dispersées !**

---

## 🔍 Logique de Détection

### **Série Contiguë** (Validation Groupée)

**Critères** :
1. ✅ Même nom exact
2. ✅ **Dates consécutives** (écart ≤ 1 jour)

**Exemples** :
```
Festival Jazz
├─ 10/08/2026 ← Jour 1
├─ 11/08/2026 ← Jour 2 (écart = 1 jour) ✅
└─ 12/08/2026 ← Jour 3 (écart = 1 jour) ✅

→ SÉRIE CONTIGUË : Validation groupée autorisée
```

---

### **Série Dispersée** (Validation Individuelle)

**Critères** :
1. ✅ Même nom exact
2. ❌ **Dates non-consécutives** (écart > 1 jour)

**Exemples** :
```
Atelier Poterie
├─ 01/09/2026 ← Samedi 1
├─ 08/09/2026 ← Samedi 2 (écart = 7 jours) ❌
├─ 15/09/2026 ← Samedi 3 (écart = 7 jours) ❌
└─ 22/09/2026 ← Samedi 4 (écart = 7 jours) ❌

→ SÉRIE DISPERSÉE : Validation individuelle obligatoire
```

---

## 📋 Cas Concrets

### **Cas 1 : Festival 3 Jours Consécutifs**

**Board** :
```
EVT-2026-0100 | HABITER LA MODERNITÉ... | 12/08/2026 | À valider
EVT-2026-0101 | HABITER LA MODERNITÉ... | 13/08/2026 | À valider
EVT-2026-0102 | HABITER LA MODERNITÉ... | 14/08/2026 | À valider
```

**Analyse** :
- Écart 12→13 : 1 jour ✅
- Écart 13→14 : 1 jour ✅
- **Verdict** : Série contiguë

**Dialog** :
```
┌────────────────────────────────────────────┐
│ ✅ Valider la série complète               │
│    (3 événements) ?                        │
├────────────────────────────────────────────┤
│ 📅 Série contiguë détectée                 │
│ Cet événement se déroule sur 3 jours      │
│ consécutifs.                               │
│ Toutes les dates de la série seront       │
│ validées ensemble.                         │
│                                            │
│ [Annuler] [Valider les 3 événements]      │
└────────────────────────────────────────────┘
```

**Résultat** : **1 clic = 3 validations** ✅

---

### **Cas 2 : Ateliers Tous les Samedis (4 Semaines)**

**Board** :
```
EVT-2026-0200 | Atelier Poterie | 01/09/2026 | À valider
EVT-2026-0201 | Atelier Poterie | 08/09/2026 | À valider
EVT-2026-0202 | Atelier Poterie | 15/09/2026 | À valider
EVT-2026-0203 | Atelier Poterie | 22/09/2026 | À valider
```

**Analyse** :
- Écart 01→08 : 7 jours ❌
- Écart 08→15 : 7 jours ❌
- Écart 15→22 : 7 jours ❌
- **Verdict** : Série dispersée

**Dialog** :
```
┌────────────────────────────────────────────┐
│ ✅ Valider cet événement ?                 │
├────────────────────────────────────────────┤
│ Événement : Atelier Poterie                │
│                                            │
│ Cette action va :                          │
│ 1. Mettre le statut à "Validée"           │
│ 2. Cocher validations Politique +         │
│    Technique                               │
│                                            │
│ [Annuler] [Confirmer]                      │
└────────────────────────────────────────────┘
```

**Résultat** : **Validation individuelle uniquement** ❌  
**→ Il faut valider chaque samedi séparément**

---

### **Cas 3 : Exposition 1 Mois (30 Jours Consécutifs)**

**Board** :
```
EVT-2026-0300 | Expo Photos | 01/10/2026 | À valider
EVT-2026-0301 | Expo Photos | 02/10/2026 | À valider
...
EVT-2026-0329 | Expo Photos | 30/10/2026 | À valider
```

**Analyse** :
- Tous les jours consécutifs (écart = 1 jour) ✅
- **Verdict** : Série contiguë

**Dialog** :
```
┌────────────────────────────────────────────┐
│ ✅ Valider la série complète               │
│    (30 événements) ?                       │
├────────────────────────────────────────────┤
│ 📅 Série contiguë détectée                 │
│ Cet événement se déroule sur 30 jours     │
│ consécutifs.                               │
│                                            │
│ [Valider les 30 événements]               │
└────────────────────────────────────────────┘
```

**Résultat** : **1 clic = 30 validations** ✅

---

### **Cas 4 : Stage 5 Jours (Lundi-Vendredi, Sans Week-End)**

**Board** :
```
EVT-2026-0400 | Stage Théâtre | 03/11/2026 (Lun) | À valider
EVT-2026-0401 | Stage Théâtre | 04/11/2026 (Mar) | À valider
EVT-2026-0402 | Stage Théâtre | 05/11/2026 (Mer) | À valider
EVT-2026-0403 | Stage Théâtre | 06/11/2026 (Jeu) | À valider
EVT-2026-0404 | Stage Théâtre | 07/11/2026 (Ven) | À valider
```

**Analyse** :
- Écart Lun→Mar : 1 jour ✅
- Écart Mar→Mer : 1 jour ✅
- Écart Mer→Jeu : 1 jour ✅
- Écart Jeu→Ven : 1 jour ✅
- **Verdict** : Série contiguë

**Dialog** :
```
┌────────────────────────────────────────────┐
│ ✅ Valider la série complète               │
│    (5 événements) ?                        │
├────────────────────────────────────────────┤
│ 📅 Série contiguë détectée                 │
│ Cet événement se déroule sur 5 jours      │
│ consécutifs.                               │
│                                            │
│ [Valider les 5 événements]                │
└────────────────────────────────────────────┘
```

**Résultat** : **1 clic = 5 validations** ✅

---

### **Cas 5 : Cours Bi-Hebdomadaires (Mardi et Jeudi)**

**Board** :
```
EVT-2026-0500 | Cours Yoga | 05/11/2026 (Mar) | À valider
EVT-2026-0501 | Cours Yoga | 07/11/2026 (Jeu) | À valider
EVT-2026-0502 | Cours Yoga | 12/11/2026 (Mar) | À valider
EVT-2026-0503 | Cours Yoga | 14/11/2026 (Jeu) | À valider
```

**Analyse** :
- Écart Mar→Jeu : 2 jours ❌ (> 1)
- **Verdict** : Série dispersée

**Dialog** :
```
┌────────────────────────────────────────────┐
│ ✅ Valider cet événement ?                 │
├────────────────────────────────────────────┤
│ Événement : Cours Yoga                     │
│                                            │
│ [Annuler] [Confirmer]                      │
└────────────────────────────────────────────┘
```

**Résultat** : **Validation individuelle** ❌

---

## 🔧 Algorithme de Détection

### **Pseudo-Code**

```typescript
function isContiguousSeries(eventName: string): boolean {
  // 1. Trouver tous les événements avec ce nom
  const seriesEvents = events.filter(e => e.nom === eventName);
  
  // 2. Si moins de 2 événements → pas une série
  if (seriesEvents.length <= 1) return false;
  
  // 3. Extraire et trier les dates
  const dates = seriesEvents
    .map(e => e.dateDeDebut)
    .sort((a, b) => a - b);
  
  // 4. Vérifier que toutes les dates sont consécutives
  for (let i = 1; i < dates.length; i++) {
    const diffInDays = (dates[i] - dates[i-1]) / (24 * 60 * 60 * 1000);
    
    // Si écart > 1 jour → série dispersée
    if (diffInDays > 1) {
      return false;
    }
  }
  
  // 5. Tous les écarts ≤ 1 jour → série contiguë
  return true;
}
```

---

### **Exemples d'Écarts**

| Date 1 | Date 2 | Écart | Contigu ? |
|--------|--------|-------|-----------|
| 10/08 | 11/08 | 1 jour | ✅ Oui |
| 10/08 | 12/08 | 2 jours | ❌ Non |
| 10/08 | 17/08 | 7 jours | ❌ Non |
| 10/08 | 10/08 | 0 jour | ✅ Oui (même jour) |

---

## 🎨 UX Adaptative

### **Série Contiguë**

**Dialog** :
- Titre : "Valider la série complète (X événements)"
- Badge bleu : "Série contiguë détectée"
- Texte : "se déroule sur X jours consécutifs"
- Bouton : "Valider les X événements"

---

### **Série Dispersée ou Événement Unique**

**Dialog** :
- Titre : "Valider cet événement ?"
- Pas de badge
- Texte standard
- Bouton : "Confirmer"

**→ UX claire et différenciée !**

---

## 📊 Tableau Récapitulatif

| Type d'Événement | Dates | Écarts | Validation |
|------------------|-------|--------|------------|
| Festival 3 jours | 12, 13, 14 août | 1j, 1j | ✅ Groupée |
| Expo 30 jours | 1→30 octobre | Tous 1j | ✅ Groupée |
| Ateliers samedis | 1, 8, 15, 22 sept | 7j, 7j, 7j | ❌ Individuelle |
| Cours Mar+Jeu | 5, 7, 12, 14 nov | 2j, 5j, 2j | ❌ Individuelle |
| Stage Lun-Ven | 3, 4, 5, 6, 7 nov | 1j, 1j, 1j, 1j | ✅ Groupée |
| Concert unique | 24 décembre | N/A | ❌ Individuelle |

---

## ✅ Garanties

### **Précision**

✅ **Détection fiable** : Algorithme basé sur l'écart réel entre dates  
✅ **Pas de faux positifs** : Ateliers hebdomadaires ne sont jamais groupés  
✅ **Pas de faux négatifs** : Festivals consécutifs toujours détectés  

---

### **Sécurité**

✅ **Confirmation obligatoire** : Dialog avant toute validation  
✅ **Feedback clair** : Nombre de jours affiché  
✅ **Réversible** : Bouton "Annuler" toujours disponible  

---

### **Performance**

✅ **Calcul rapide** : O(n log n) pour trier + O(n) pour vérifier  
✅ **Pas de surcharge serveur** : Validation individuelle si dispersée  
✅ **Rate limiting** : Pause entre validations en série  

---

## 🎉 Résumé

**Problème** :
- ❌ Validation groupée pour TOUS les événements du même nom
- ❌ Ateliers hebdomadaires validés par erreur en batch

**Solution** :
- ✅ Détection intelligente : contiguë vs dispersée
- ✅ Validation groupée UNIQUEMENT si dates consécutives (écart ≤ 1 jour)
- ✅ Validation individuelle pour séries dispersées (cours, ateliers...)

**Résultat** :
- ✅ Festival 3 jours → 1 clic (groupé)
- ✅ Expo 30 jours → 1 clic (groupé)
- ✅ Ateliers samedis → 4 clics (individuels)
- ✅ Cours Mar+Jeu → 4 clics (individuels)

**→ Validation intelligente et contextuelle !** 🧠✨

---

**Déployé avec succès !** 🚀
