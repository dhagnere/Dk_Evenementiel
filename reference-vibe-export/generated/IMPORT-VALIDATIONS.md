# 📥 Import et Mise à Jour des Validations

## ⚠️ Comportement Actuel

**Les validations NE sont PAS mises à jour lors de l'import !**

### **Colonnes Préservées (non modifiées)**

Lors d'un import de mise à jour, ces colonnes **gardent leurs valeurs existantes** :

1. ✅ `Validation Technique`
2. ✅ `Validation Politique`
3. ⚠️ `Validé par Date Clef` (actuellement aussi préservée)

**→ Protection contre l'écrasement accidentel des validations manuelles**

---

## 🎯 Pourquoi Cette Logique ?

### **Scénario de Protection**

**Sans protection :**
```
1. Vous validez 50 événements manuellement (2h de travail)
2. Vous importez un fichier Excel de mise à jour
3. Si le fichier Excel n'a pas ces colonnes...
4. ❌ Toutes les validations sont perdues !
```

**Avec protection (actuel) :**
```
1. Vous validez 50 événements manuellement
2. Vous importez un fichier Excel de mise à jour
3. Les validations restent intactes ✅
4. Seules les autres colonnes (dates, lieux, etc.) sont mises à jour
```

---

## 📊 Que se Passe-t-il lors d'un Import ?

### **Import d'un Fichier avec Colonnes de Validation**

**Fichier Excel :**
```csv
Nom,Date début,Quartier,Validation Technique,Validation Politique,Validé par Date Clef
Concert de Noël,24/12/2026,Centre,OUI,OUI,OUI
Marché,15/12/2026,Malo,NON,NON,NON
```

**Résultat :**
- ✅ `Nom`, `Date début`, `Quartier` → **MIS À JOUR**
- ❌ `Validation Technique`, `Validation Politique`, `Validé par Date Clef` → **IGNORÉS**

**→ Les validations existantes sont PRÉSERVÉES**

---

## 🔧 Options Disponibles

### **Option 1 : Laisser tel quel (Recommandé)**

**Avantages :**
- ✅ Protection contre perte accidentelle
- ✅ Les validations manuelles sont sûres
- ✅ Pas de risque d'écrasement

**Inconvénient :**
- ❌ Impossible de mettre à jour les validations via Excel

**→ Sécurité maximale**

---

### **Option 2 : Permettre la Mise à Jour (Risqué)**

Je peux modifier le code pour **permettre la mise à jour des validations** via Excel.

**Avantages :**
- ✅ Flexibilité totale
- ✅ Possibilité de mettre à jour en masse

**Inconvénients :**
- ❌ Risque d'écrasement accidentel
- ❌ Si vous oubliez les colonnes dans Excel → Tout est remis à zéro
- ❌ Nécessite une vigilance constante

**Code à modifier :**
```typescript
// Retirer cette protection :
if (key === 'validationTechnique' || key === 'validationPolitique') continue;

// Permettre la mise à jour conditionnelle :
if (value !== null && value !== undefined) {
  updateData[key] = value;
}
```

---

### **Option 3 : Mise à Jour Conditionnelle avec Flag**

Je peux ajouter une **option dans l'interface d'import** :

**Interface :**
```
☐ Autoriser la mise à jour des validations
   ⚠️ Attention : les validations existantes seront écrasées
```

**Comportement :**
- **Case NON cochée** (défaut) → Validations préservées
- **Case COCHÉE** → Validations mises à jour depuis Excel

**Avantages :**
- ✅ Sécurité par défaut
- ✅ Flexibilité si besoin
- ✅ Choix conscient de l'utilisateur

---

## 🧪 Test du Comportement Actuel

### **Étape 1 : Préparer un Fichier de Test**

**Créez un fichier Excel avec :**
```csv
Nom,Date début,Quartier,Validation Technique,Validation Politique
Concert Test,01/01/2027,Centre,OUI,OUI
```

### **Étape 2 : Importer**

1. Vue Calendrier → Bouton "📤 Importer"
2. Sélectionnez le fichier
3. Lancez l'import

### **Étape 3 : Vérifier**

**Dans Monday.com :**
- Si l'événement existait déjà :
  - `Nom`, `Date début`, `Quartier` → ✅ Mis à jour
  - `Validation Technique`, `Validation Politique` → ❌ Inchangées

**→ Les validations existantes sont préservées**

---

## ⚙️ Code Actuel (Protection Active)

```typescript
// src/generated/server/import.ts - ligne 306-307
// NEVER update validations (preserve existing values)
if (key === 'validationTechnique' || key === 'validationPolitique') continue;
```

**Cette ligne IGNORE les validations lors de l'import.**

---

## 📋 Colonnes Mises à Jour vs Préservées

| Colonne | Mise à jour via Import | Raison |
|---------|------------------------|--------|
| `Nom` | ✅ Oui | Donnée métier modifiable |
| `Date début` | ✅ Oui | Donnée métier modifiable |
| `Date fin` | ✅ Oui | Donnée métier modifiable |
| `Lieu` | ✅ Oui | Donnée métier modifiable |
| `Quartier` | ✅ Oui | Donnée métier modifiable |
| `Nature` | ✅ Oui | Donnée métier modifiable |
| `Statut` | ✅ Oui | Donnée métier modifiable |
| `Pilote` | ✅ Oui | Donnée métier modifiable |
| **Validation Technique** | ❌ **Non** | **Protection validation manuelle** |
| **Validation Politique** | ❌ **Non** | **Protection validation manuelle** |
| **Validé par Date Clef** | ❌ **Non** | **Protection traçabilité** |

---

## ✅ Recommandation

**Je recommande de GARDER la protection actuelle** pour ces raisons :

1. ✅ **Sécurité** : Pas de perte accidentelle de validations
2. ✅ **Traçabilité** : Les validations manuelles sont sacrées
3. ✅ **Workflow cohérent** : Import = mise à jour métier, pas validation
4. ✅ **Validation = action consciente** : Doit se faire via l'interface

**Si vous avez vraiment besoin de mettre à jour les validations en masse :**
→ Je peux implémenter **l'Option 3** (flag conditionnel dans l'interface)

---

## 🎯 Workflow Recommandé

### **Import de Mise à Jour**

1. **Préparez Excel** avec colonnes métier (Nom, Dates, Lieu, etc.)
2. **N'incluez PAS** les colonnes de validation
3. **Importez** → Les données métier sont mises à jour
4. **Validez manuellement** via pastilles (Statut ou Date Clef)

**→ Séparation claire entre import de données et validation**

---

### **Cas d'Usage : Reprogrammation d'Événements**

**Scénario :**
- 20 événements validés pour juin 2026
- Reprogrammés pour septembre 2026
- Vous voulez mettre à jour les dates SANS perdre les validations

**Actions :**
1. **Fichier Excel** :
   ```csv
   Nom,Date début,Date fin
   Concert A,15/09/2026,15/09/2026
   Concert B,20/09/2026,20/09/2026
   ```
2. **Importez** → Dates mises à jour
3. **Validations** → ✅ Préservées !

**→ Protection automatique**

---

## 🔍 Vérifier les Validations après Import

**Dans Monday.com :**
1. Ouvrez le board "extraction-kiosk"
2. Vérifiez les colonnes :
   - `Validation Technique`
   - `Validation Politique`
   - `Validé par Date Clef`
3. ✅ Les valeurs sont identiques à avant l'import

**Dans l'Application :**
1. Vue Liste → Colonne "Date Clef"
2. Les badges verts "✓ Date Clef" sont toujours là
3. Vue Calendrier → Les badges bleus sont toujours affichés

---

## 🎉 Résumé

**Comportement Actuel :**

❌ **Les validations ne sont PAS mises à jour lors de l'import**  
✅ **Protection contre perte accidentelle**  
✅ **Validation = action manuelle consciente**  
✅ **Traçabilité préservée**  

**Si vous voulez modifier ce comportement :**
→ Dites-moi quelle option vous préférez (2 ou 3) et je modifierai le code.

**Sinon :**
→ Le système actuel protège vos validations manuelles ! 🛡️
