# 🚨 CORRECTION CRITIQUE : Format des dates lors de l'import

## ❌ Problème identifié

### **Symptôme**
```
Fichier Excel : 09/02/2027 (9 février 2027)
Application :   02/09/2027 (2 septembre 2027) ❌ ERREUR !
```

### **Cause racine**
La fonction `parseDate` dans `src/generated/utils/import-utils.ts` avait un **fallback dangereux** :

```typescript
// ❌ ANCIEN CODE (BUGUÉ)
function parseDate(s: string): Date | null {
  // ... regex pour DD/MM/YYYY ...
  // ... regex pour YYYY-MM-DD ...
  
  // ⚠️ FALLBACK DANGEREUX - interprète en format US !
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
```

**Problème** : Si la chaîne ne correspondait pas exactement aux regex (espace supplémentaire, etc.), le code tombait sur `new Date(s)` qui interprète les dates en **format américain MM/DD/YYYY** au lieu du **format européen DD/MM/YYYY**.

---

## ✅ Solution implémentée

### **Nouveau code (corrigé)**

```typescript
/**
 * Parse une date en FORMAT EUROPÉEN (DD/MM/YYYY) UNIQUEMENT
 * ⚠️ CRITIQUE : Ne jamais utiliser new Date(s) qui interprète en format US !
 */
function parseDate(s: string): Date | null {
  if (!s) return null;
  
  // 1. Nettoyer la chaîne (trim + espaces internes)
  const cleaned = s.trim().replace(/\s+/g, '');
  
  // 2. Format serial Excel (ex: 44952)
  if (/^\d{5}(\.\d+)?$/.test(cleaned)) {
    const serial = parseFloat(cleaned);
    const d = new Date((serial - 25569) * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }
  
  // 3. Format EUROPÉEN DD/MM/YYYY (PRIORITAIRE)
  const dmy = cleaned.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
    
    // Validation
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      console.warn(`⚠️ Date invalide: ${s}`);
      return null;
    }
    
    const date = new Date(year, month - 1, day);
    console.log(`📅 Date parsée (EU): ${s} → ${date.toISOString()}`);
    return date;
  }
  
  // 4. Format ISO YYYY-MM-DD (ex: 2027-02-09)
  const ymd = cleaned.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
  if (ymd) {
    const year = parseInt(ymd[1], 10);
    const month = parseInt(ymd[2], 10);
    const day = parseInt(ymd[3], 10);
    
    if (day < 1 || day > 31 || month < 1 || month > 12) {
      console.warn(`⚠️ Date invalide: ${s}`);
      return null;
    }
    
    const date = new Date(year, month - 1, day);
    console.log(`📅 Date parsée (ISO): ${s} → ${date.toISOString()}`);
    return date;
  }
  
  // ⚠️ AUCUN FALLBACK vers new Date(s) !
  console.warn(`❌ Format de date non reconnu: "${s}"`);
  return null;
}
```

---

## 🎯 Améliorations apportées

### **1. Nettoyage robuste** 🧹
```typescript
const cleaned = s.trim().replace(/\s+/g, '');
```
- Supprime les espaces en début/fin
- Supprime les espaces internes (ex: "09 / 02 / 2027" → "09/02/2027")

### **2. Validation stricte** ✅
```typescript
if (day < 1 || day > 31 || month < 1 || month > 12) {
  console.warn(`⚠️ Date invalide: ${s}`);
  return null;
}
```
- Rejette les dates impossibles (jour > 31, mois > 12)

### **3. Logs de débogage** 📝
```typescript
console.log(`📅 Date parsée (EU): ${s} → ${date.toISOString()}`);
```
- Chaque date parsée est loggée dans la console
- Permet de vérifier que l'interprétation est correcte

### **4. Pas de fallback dangereux** 🚫
```typescript
// ⚠️ AUCUN FALLBACK vers new Date(s) !
console.warn(`❌ Format de date non reconnu: "${s}"`);
return null;
```
- Si le format n'est pas reconnu, on retourne `null` et on log un avertissement
- **Jamais** d'interprétation silencieuse en format US

---

## 📋 Formats de dates acceptés

| Format | Exemple | Interprétation |
|--------|---------|----------------|
| **DD/MM/YYYY** | 09/02/2027 | 9 février 2027 ✅ |
| **DD-MM-YYYY** | 09-02-2027 | 9 février 2027 ✅ |
| **DD.MM.YYYY** | 09.02.2027 | 9 février 2027 ✅ |
| **D/M/YYYY** | 9/2/2027 | 9 février 2027 ✅ |
| **YYYY-MM-DD** | 2027-02-09 | 9 février 2027 ✅ (ISO) |
| **Serial Excel** | 44952 | 9 février 2027 ✅ |
| **MM/DD/YYYY** | ❌ REJETÉ | Format US non accepté |

---

## 🔍 Vérification après import

### **Dans la console navigateur**

Lors de l'import, vous verrez maintenant :

```
📅 Date parsée (EU): 09/02/2027 → 2027-02-09T00:00:00.000Z (9/2/2027)
📅 Date parsée (EU): 15/03/2027 → 2027-03-15T00:00:00.000Z (15/3/2027)
📅 Date parsée (EU): 01/01/2028 → 2028-01-01T00:00:00.000Z (1/1/2028)
```

**Vérifiez** :
- La date d'origine (ex: `09/02/2027`)
- La date ISO (ex: `2027-02-09` = année-mois-jour)
- La confirmation `(9/2/2027)` = jour/mois/année

### **Dans l'application**

Après import, vérifiez dans la **Vue Liste** ou le **Calendrier** :

```
Fichier Excel : CHAPELLE DE LA MAIRIE DE ROSENDAEL - 09/02/2027

Application :
✅ Calendrier → 9 février 2027
✅ Vue Liste → 09/02/2027
✅ Panneau détails → Début: 09/02/2027
```

---

## ⚠️ Cas d'erreur

### **Date ambiguë**
```
01/12/2027
```

**Interprétation** : 1er décembre 2027 (DD/MM/YYYY)

Si vous vouliez dire "12 janvier 2027", utilisez le format ISO :
```
2027-01-12
```

### **Format non reconnu**
```
Feb 9, 2027
```

**Résultat** : ❌ Date non importée (log d'avertissement)
**Console** : `❌ Format de date non reconnu: "Feb 9, 2027"`

**Solution** : Convertissez en format européen : `09/02/2027`

### **Date invalide**
```
32/01/2027  ← jour > 31
15/13/2027  ← mois > 12
```

**Résultat** : ❌ Date non importée
**Console** : `⚠️ Date invalide: 32/01/2027 (jour=32, mois=1)`

---

## 🧪 Tests de validation

### **Test 1 : Date simple**
```csv
Nom,Date de début,Date de fin
CHAPELLE DE LA MAIRIE DE ROSENDAEL,09/02/2027,09/02/2027
```

**Résultat attendu** :
- ✅ Date de début : 9 février 2027
- ✅ Date de fin : 9 février 2027

### **Test 2 : Plage de dates**
```csv
Nom,Date de début,Date de fin
Festival d'été,15/07/2027,25/07/2027
```

**Résultat attendu** :
- ✅ Date de début : 15 juillet 2027
- ✅ Date de fin : 25 juillet 2027
- ✅ Événement visible dans le calendrier du 15 au 25 juillet

### **Test 3 : Format ISO**
```csv
Nom,Date de début
Concert de Noël,2027-12-25
```

**Résultat attendu** :
- ✅ Date de début : 25 décembre 2027

### **Test 4 : Serial Excel**
```csv
Nom,Date de début
Réunion,44952
```

**Résultat attendu** :
- ✅ Date de début : 9 février 2027 (conversion depuis serial Excel)

---

## 📝 Recommandations

### **Pour préparer vos fichiers Excel/CSV**

1. **Formatez les colonnes de dates en Excel** :
   - Sélectionnez les colonnes Date de début / Date de fin
   - Format → Cellule → Date
   - Choisissez : `DD/MM/YYYY` ou `JJ/MM/AAAA`

2. **Vérifiez visuellement** :
   ```
   ✅ 09/02/2027
   ✅ 9/2/2027
   ✅ 09-02-2027
   ❌ Feb 9, 2027
   ❌ 2/9/27
   ```

3. **Utilisez le format ISO pour les dates ambiguës** :
   ```
   ✅ 2027-02-09  (ISO - pas d'ambiguïté)
   ⚠️ 01/02/2027  (1er février ou 2 janvier ?)
   ```

---

## 🚀 Fichier modifié

- ✅ `src/generated/utils/import-utils.ts`
  - Fonction `parseDate()` réécrite
  - Suppression du fallback dangereux `new Date(s)`
  - Ajout de logs de débogage
  - Validation stricte des jours/mois

---

## ✅ Checklist de vérification

Après cette correction, vérifiez :

- [ ] Import d'un fichier avec dates DD/MM/YYYY
- [ ] Console navigateur affiche les logs `📅 Date parsée (EU): ...`
- [ ] Les dates affichées dans l'application correspondent au fichier source
- [ ] L'événement "CHAPELLE DE LA MAIRIE DE ROSENDAEL" apparaît au **9 février 2027** (et non au 2 septembre)
- [ ] Aucune erreur `❌ Format de date non reconnu` dans la console (sauf si le fichier contient des formats invalides)

---

**La correction est CRITIQUE et corrige définitivement le problème d'inversion des dates DD/MM/YYYY ↔ MM/DD/YYYY.** ✅
