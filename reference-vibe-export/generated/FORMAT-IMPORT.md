# 📋 Format d'import des événements

## ✅ Ordre EXACT des colonnes (correspond à l'extraction du board)

Le template CSV téléchargeable est maintenant **parfaitement aligné** avec l'extraction Excel du board `special_events_global.xlsx`.

### Colonnes dans l'ordre :

| # | Colonne | Type | Obligatoire | Exemple |
|---|---------|------|-------------|---------|
| 1 | **Date** | Date | Non* | 15/02/2024 |
| 2 | **Date de début** | Date | Oui* | 15/02/2024 |
| 3 | **Date de fin** | Date | Non | 20/02/2024 |
| 4 | **Nom** | Texte | ✅ Oui | Carnaval de Dunkerque |
| 5 | **Lieu** | Texte | Non | Centre-ville |
| 6 | **Quartier** | Status | Non | Dunkerque - Centre |
| 7 | **Pilote** | Dropdown | Non | Jean Dupont |
| 8 | **Direction pilote** | Texte | Non | Direction Communication |
| 9 | **Organisateur** | Texte | Non | Association Carnaval |
| 10 | **Statut** | Status | Non | Validée |
| 11 | **Nature** | Status | Non | Culture |
| 12 | **Niveau** | Status | Non | Ville |
| 13 | **Type** | Status | Non | Récurrente |
| 14 | **Tardive** | Status | Non | Non |
| 15 | **Reprog** | Status | Non | Non |

\* **Note sur les dates :** Vous devez fournir soit "Date" (qui sera dupliquée en début ET fin), soit "Date de début" (obligatoire si pas de "Date").

---

## 🔄 Déduplication automatique

Le système élimine automatiquement les doublons selon ces critères :

### 1️⃣ **Doublons dans le fichier uploadé**
Avant même de toucher au board, le système détecte et **ignore** les lignes en double dans votre fichier.

**Critères de détection :**
- Même **Nom** (insensible à la casse)
- Même **Date de début**
- Même **Lieu**
- Même **Organisateur**

**Exemple :**
```csv
Carnaval,15/02/2024,Centre-ville,Association A
Carnaval,15/02/2024,Centre-ville,Association A  ← DOUBLON IGNORÉ
```

### 2️⃣ **Doublons avec le board existant**
Si un événement existe déjà dans le board, il sera **mis à jour** au lieu d'être créé.

**Critères de détection :**
- Même **Nom** + **Date de début** + **Lieu** + **Organisateur**

**Résultat :**
- ✅ Les données existantes sont **préservées** (ID, validations)
- 🔄 Les nouvelles valeurs **écrasent** les anciennes (sauf validations techniques/politiques)

---

## 🎯 Correction des décalages de colonnes

### Problème corrigé ✅
Avant, le template avait cet ordre :
```
Nom, Date, ..., Nature, Niveau, Type, Tardive, Reprog, Organisateur, Statut
```

L'extraction avait cet ordre :
```
Date, Date de début, ..., Organisateur, Statut, Nature, Niveau, Type, Tardive, Reprog
```

**Résultat :** Les données se retrouvaient dans les mauvaises colonnes !

### Solution appliquée ✅
Le template utilise maintenant **exactement le même ordre** que l'extraction :
```
Date, Date de début, Date de fin, Nom, Lieu, Quartier, Pilote, 
Direction pilote, Organisateur, Statut, Nature, Niveau, Type, Tardive, Reprog
```

---

## 📥 Comment utiliser

### Option 1 : Utiliser l'extraction directement
1. Exportez vos événements depuis le board
2. Modifiez le fichier Excel selon vos besoins
3. Uploadez le fichier tel quel
4. ✅ Toutes les colonnes seront correctement mappées

### Option 2 : Utiliser le template
1. Téléchargez le template CSV depuis l'interface
2. Remplissez les colonnes **dans l'ordre indiqué**
3. Uploadez le fichier
4. ✅ Le système reconnaît automatiquement les colonnes

### Option 3 : Format libre
Le système est **très flexible** et reconnaît de nombreuses variantes de noms :
- "Date début" = "date de debut" = "debut" = "start"
- "Quartier" = "secteur" = "zone"
- "Pilote" = "responsable" = "referent"

**Mais attention :** L'ordre des colonnes n'a pas d'importance UNIQUEMENT si les **en-têtes sont présents**.

---

## ⚠️ Points d'attention

### 1. Toujours inclure les en-têtes
❌ **Mauvais :** Fichier sans ligne d'en-têtes
```csv
Carnaval,15/02/2024,Centre-ville
```

✅ **Bon :** Fichier avec en-têtes
```csv
Nom,Date de début,Lieu
Carnaval,15/02/2024,Centre-ville
```

### 2. Respecter les valeurs valides pour les colonnes Status
Les colonnes **Quartier**, **Nature**, **Niveau**, **Type**, **Statut**, **Tardive**, **Reprog** ont des valeurs prédéfinies.

❌ **Mauvais :** `Dunkerque Centre` (espace au lieu de tiret)  
✅ **Bon :** `Dunkerque - Centre`

Le système **normalise automatiquement** la casse, mais pas l'orthographe exacte.

### 3. Ne JAMAIS modifier les validations
Les colonnes **Validation Technique** et **Validation Politique** ne doivent **PAS** être dans votre fichier d'import.

Elles sont gérées uniquement dans l'application.

---

## 🔍 Logs de débogage

Pendant l'import, ouvrez la console (F12) pour voir :

```
🔍 Analyse des en-têtes du fichier :
  ✅ Colonne 0: "Date" → date
  ✅ Colonne 1: "Date de début" → dateDeDbut
  ✅ Colonne 3: "Nom" → nom
  ...
  
📊 Résumé : 15/15 colonnes reconnues

⚠️ Doublon détecté dans le fichier : "Carnaval" le 2024-02-15 à Centre-ville
⚠️ Doublon détecté dans le fichier : "Fête de la Mer" le 2024-06-20 à Malo-les-Bains

Create: 47, Update: 3, Skip: 2
```

---

## 📞 Support

En cas de décalage de colonnes après import :
1. Téléchargez le **template CSV** depuis l'interface
2. Vérifiez que vos **en-têtes correspondent** exactement
3. Vérifiez que les **valeurs** correspondent aux options valides
4. Consultez les **logs console** pour voir quel mapping a été détecté
