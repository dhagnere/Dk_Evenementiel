# 🚫 Priorité Absolue du Statut "Annulée"

## 🎯 Règle d'Or

**Le statut "Annulée" ANNULE TOUT — même les validations.**

Un événement annulé ne doit JAMAIS apparaître dans l'application, **quelle que soit** son historique de validation.

---

## 🔒 Cas d'Erreur Humaine

### **Scénario Problématique**

**Workflow chronologique** :

1. **Lundi** : Événement "Concert de Noël" créé
2. **Mardi** : Validation Technique ✅ cochée
3. **Mercredi** : Validation Politique ✅ cochée
4. **Jeudi** : Événement validé par Date Clef 🔵 (pastille bleue)
5. **Vendredi** : **ERREUR** → L'événement doit être annulé (artiste malade)
6. **Action** : Changement de statut → **"Annulée"**

**Question** : L'événement doit-il rester visible parce qu'il était validé ?

**Réponse** : ❌ **NON** — Le statut "Annulée" PRIME sur TOUT.

---

## 📊 Hiérarchie de Priorité

```
┌─────────────────────────────────────────────────────┐
│ PRIORITÉ 1 : Statut = "Annulée" ?                  │
│              ↓ OUI → INVISIBLE (fin du traitement) │
│              ↓ NON → Continuer                     │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ PRIORITÉ 2 : Archivé (date passée) ?               │
│              ↓ OUI → Masquable (toggle disponible) │
│              ↓ NON → Continuer                     │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ PRIORITÉ 3 : Validations (Technique + Politique) ? │
│              ↓ OUI → Arbitré (vert)                │
│              ↓ NON → À arbitrer (rouge)            │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ PRIORITÉ 4 : Date Clef ?                           │
│              ↓ OUI → Badge bleu "Date Clef"        │
│              ↓ NON → Pas de badge spécial          │
└─────────────────────────────────────────────────────┘
```

**→ Le statut "Annulée" court-circuite tout le reste !** 🚫

---

## 🛡️ Implémentation

### **Fonction `estArbitre` (Renforcée)**

**Fichier** : `src/generated/utils/conflicts.ts`

**Avant** (vulnérable) :
```typescript
export function estArbitre(event: Event): boolean {
  return event.validationTechnique === true && event.validationPolitique === true;
}
```

**Problème** : Un événement annulé mais validé serait considéré comme "arbitré"

---

**Après** (protégé) :
```typescript
export function estArbitre(event: Event): boolean {
  // Un événement annulé n'est jamais arbitré, même s'il a été validé
  if (event.statut === 'Annulée') return false;
  
  return event.validationTechnique === true && event.validationPolitique === true;
}
```

**Résultat** : Un événement annulé retourne **toujours** `false`, même si validé

**→ Protection au niveau de la logique métier !** 🛡️

---

### **Filtres Client (Déjà en Place)**

**Vue Liste** :
```typescript
deduped = deduped.filter(e => e.statut !== 'Annulée');
```

**Vue Calendrier** :
```typescript
.filter(e => e.dateDeDbut && e.statut !== 'Annulée')
```

**Vue Conflits** :
```typescript
uniqueEvents = uniqueEvents.filter(e => !estArchive(e) && e.statut !== 'Annulée');
```

**→ Protection au niveau de l'affichage !** 🛡️

---

## 🧪 Test de Non-Régression

### **Protocole de Test : Événement Validé Puis Annulé**

**Étape 1 : Création et Validation**

1. Créez un événement "Concert Test"
2. Date : Demain
3. Validez via **pastille bleue** (Date Clef)
4. Vérifiez les validations :
   - ✅ Validation Technique cochée
   - ✅ Validation Politique cochée
   - ✅ Validé par Date Clef cochée

**Étape 2 : Vérification de Visibilité**

5. Vue Liste :
   - ✅ Événement visible
   - ✅ Badge vert "Validée"
   - ✅ Badge bleu "Date Clef"
   - ✅ Colonne "Date Clef" cochée

6. Vue Conflits :
   - ✅ Si conflit : événement dans section "Arbitrés"
   - ✅ Badge vert "Arbitré — ressources bloquées"
   - ✅ Badge bleu "✓ Date Clef"

**Étape 3 : Annulation**

7. Vue Liste → Pastille rouge (statut)
8. Sélectionnez **"Annulée"**
9. Confirmez

**Étape 4 : Vérification de Disparition**

10. Vue Liste :
    - ❌ Événement **NON VISIBLE** (malgré les validations)

11. Vue Calendrier :
    - ❌ Événement **NON VISIBLE** (pas de carte ce jour-là)

12. Vue Conflits :
    - ❌ Événement **NON VISIBLE** (pas dans "Arbitrés")
    - ❌ Événement **NON COMPTÉ** dans les conflits

**Étape 5 : Vérification dans monday.com (optionnel)**

13. Ouvrez le board dans monday.com
14. Trouvez l'événement "Concert Test"
15. Vérifiez :
    - ✅ Statut = "Annulée"
    - ✅ Validation Technique = cochée
    - ✅ Validation Politique = cochée
    - ✅ Validé par Date Clef = cochée

**Conclusion** :
- L'événement existe toujours dans monday.com
- Toutes les validations sont préservées
- **MAIS** il est invisible dans l'application

**→ Le statut "Annulée" prime sur les validations !** ✅

---

## 📊 Tableau de Vérité

### **Visibilité selon Statut et Validations**

| Statut | Validation Tech. | Validation Pol. | Date Clef | Visible ? | Raison |
|--------|------------------|-----------------|-----------|-----------|--------|
| À valider | ❌ | ❌ | ❌ | ✅ Oui | Événement actif non validé |
| À valider | ✅ | ❌ | ❌ | ✅ Oui | Validation partielle |
| Validée | ✅ | ✅ | ❌ | ✅ Oui | Validé via statut (pastille rouge) |
| Validée | ✅ | ✅ | ✅ | ✅ Oui | Validé via Date Clef (pastille bleue) |
| Brouillon | ❌ | ❌ | ❌ | ✅ Oui | Événement en cours de saisie |
| **Annulée** | ❌ | ❌ | ❌ | ❌ **NON** | **Statut prioritaire** |
| **Annulée** | ✅ | ❌ | ❌ | ❌ **NON** | **Statut prioritaire** |
| **Annulée** | ✅ | ✅ | ❌ | ❌ **NON** | **Statut prioritaire** |
| **Annulée** | ✅ | ✅ | ✅ | ❌ **NON** | **Statut prioritaire** |

**Conclusion** : Statut "Annulée" → **TOUJOURS invisible**, quelle que soit la validation

**→ Règle absolue sans exception !** 🚫

---

## 🎯 Cas d'Usage Réels

### **Cas 1 : Artiste Malade**

**Chronologie** :
1. Concert validé par Date Clef (événement prioritaire)
2. L'artiste est hospitalisé la veille
3. Statut → "Annulée"
4. L'événement disparaît immédiatement de toutes les vues

**Résultat** :
- ✅ Équipes ne voient plus l'événement (pas de confusion)
- ✅ Ressources libérées automatiquement (plus dans les conflits)
- ✅ Planification clarifiée

**→ Réactivité immédiate face à l'imprévu !** ✅

---

### **Cas 2 : Erreur de Validation**

**Chronologie** :
1. Deux événements le même jour au même lieu
2. Les deux sont validés par erreur (conflit non détecté)
3. On découvre le problème
4. Un des deux → Statut "Annulée"
5. Le conflit disparaît, l'autre événement reste arbitré

**Résultat** :
- ✅ Conflit résolu instantanément
- ✅ Pas besoin de décocher les validations manuellement
- ✅ Traçabilité : on sait qu'il était validé mais annulé

**→ Correction d'erreur simplifiée !** ✅

---

### **Cas 3 : Report d'Événement**

**Chronologie** :
1. Festival validé pour le 15 juillet
2. Météo défavorable → Report au 22 juillet
3. **Option A** : Annuler l'événement du 15 et créer un nouvel événement le 22
4. **Option B** : Modifier les dates de l'événement existant

**Recommandation** : Option B (modification des dates)

**Si Option A choisie** :
- Événement du 15 → Statut "Annulée" (disparaît des vues)
- Nouvel événement créé le 22 (visible, à revalider)

**→ Flexibilité dans la gestion des reports !** ✅

---

## ✅ Garanties

### **Protection Multi-Niveaux**

✅ **Fonction `estArbitre()`** : Retourne `false` si annulé  
✅ **Vue Liste** : Filtre `statut !== 'Annulée'`  
✅ **Vue Calendrier** : Filtre `statut !== 'Annulée'`  
✅ **Vue Conflits** : Filtre `statut !== 'Annulée'`  

**→ Défense en profondeur !** 🛡️

---

### **Cohérence Absolue**

✅ **Vue Liste** : Annulés jamais affichés  
✅ **Vue Calendrier** : Annulés jamais affichés  
✅ **Vue Conflits** : Annulés jamais comptés  
✅ **Export PDF** : Annulés jamais exportés  
✅ **Fonction `estArbitre()`** : Annulés jamais arbitrés  

**→ Cohérence totale dans tout le système !** ✅

---

## 🔧 Maintenance

### **Ajout de Nouvelles Fonctionnalités**

**Si vous créez une nouvelle logique métier qui utilise les validations** :

⚠️ **TOUJOURS vérifier le statut "Annulée" EN PREMIER**

**Exemple** :
```typescript
// ❌ MAUVAIS
function peutReserverRessources(event: Event): boolean {
  return event.validationTechnique === true && event.validationPolitique === true;
}

// ✅ BON
function peutReserverRessources(event: Event): boolean {
  // Un événement annulé ne réserve aucune ressource
  if (event.statut === 'Annulée') return false;
  
  return event.validationTechnique === true && event.validationPolitique === true;
}
```

**→ Toujours filtrer les annulés en premier !** 🛡️

---

## 🎉 Récapitulatif

**Règle d'Or** : `statut = "Annulée"` → **Invisible et inactif PARTOUT**

**Priorité** :
1. ⚠️ **Annulée** → Invisible (priorité absolue)
2. 📅 **Archivée** → Masquable (selon toggle)
3. ✅ **Validée** → Arbitrée (si non annulée)
4. 🔵 **Date Clef** → Badge bleu (si non annulée)

**Protection** :
- ✅ Fonction `estArbitre()` vérifie le statut
- ✅ Toutes les vues filtrent les annulés
- ✅ Export PDF exclut les annulés
- ✅ Détection de conflits ignore les annulés

**Résultat** :
- ❌ Vue Liste : Annulés invisibles (même validés)
- ❌ Vue Calendrier : Annulés invisibles (même validés)
- ❌ Vue Conflits : Annulés ignorés (même validés)
- ❌ Export PDF : Annulés non exportés (même validés)

**→ Le statut "Annulée" annule tout, y compris les validations !** 🚫✨
