# ⚠️ Problème : Événements Multi-Jours Créés Jour par Jour

## 🔴 Symptôme

L'événement **"DUCASSE DE ROSENDAEL"** qui se déroule **du 29/08 au 06/09** (9 jours) apparaît dans le board comme **31 items séparés**.

**Log observé :**
```
✅ Série contiguë: "DUCASSE DE ROSENDAEL" (31 événements, 29/08/2026 → 06/09/2026)
```

---

## 🔍 Analyse

### Ce qui devrait se passer

Un événement multi-jours devrait être représenté par **1 seul item** dans le board avec :
- **Date de début** : 29/08/2026
- **Date de fin** : 06/09/2026

Le calendrier afficherait alors cet événement sur **tous les jours** entre ces deux dates (9 jours).

### Ce qui se passe actuellement

Le board contient **31 items différents** avec le même nom "DUCASSE DE ROSENDAEL", chacun avec sa propre date.

**Hypothèse :** Le fichier Excel source contient **31 lignes séparées** pour le même événement (une ligne par jour + d'autres dates ?).

---

## 🎯 Causes Possibles

### Cause 1 : Fichier Excel mal formaté

Le fichier Excel contient une ligne par jour au lieu d'une seule ligne avec date de début et date de fin :

```csv
❌ MAUVAIS FORMAT (31 lignes) :
Nom,Date de début,Date de fin,Lieu
DUCASSE DE ROSENDAEL,29/08/2026,29/08/2026,Rosendaël
DUCASSE DE ROSENDAEL,30/08/2026,30/08/2026,Rosendaël
DUCASSE DE ROSENDAEL,31/08/2026,31/08/2026,Rosendaël
DUCASSE DE ROSENDAEL,01/09/2026,01/09/2026,Rosendaël
...
DUCASSE DE ROSENDAEL,06/09/2026,06/09/2026,Rosendaël

✅ BON FORMAT (1 seule ligne) :
Nom,Date de début,Date de fin,Lieu
DUCASSE DE ROSENDAEL,29/08/2026,06/09/2026,Rosendaël
```

### Cause 2 : Export monday.com incorrect

Si le fichier Excel provient d'un export de monday.com, il est possible que l'export crée une ligne par jour au lieu d'une ligne par événement.

**Solution :** Ne pas utiliser l'export brut de monday.com, mais créer manuellement un fichier avec le bon format.

### Cause 3 : Colonne "Date" unique au lieu de "Date de début" + "Date de fin"

Si le fichier Excel n'a qu'une colonne "Date" (au lieu de "Date de début" + "Date de fin"), l'import duplique automatiquement cette valeur :

```javascript
// Dans le code d'import (index.tsx, ligne 526)
if (rec.date && !rec.dateDeDbut) {
  rec.dateDeDbut = rec.date;
}
if (rec.date && !rec.dateDeFin) {
  rec.dateDeFin = rec.date;
}
```

**Résultat :** Chaque ligne devient un événement d'un seul jour.

---

## ✅ Solutions

### Solution 1 : Corriger le fichier Excel source

**Avant l'import :**

1. Ouvrir le fichier Excel source
2. Pour chaque événement multi-jours, **garder une seule ligne** avec :
   - **Nom** : Nom de l'événement
   - **Date de début** : Première date (29/08/2026)
   - **Date de fin** : Dernière date (06/09/2026)
3. **Supprimer toutes les autres lignes** pour le même événement
4. Sauvegarder et réimporter

**Exemple de correction pour DUCASSE DE ROSENDAEL :**

```csv
AVANT (31 lignes) :
DUCASSE DE ROSENDAEL,29/08/2026,29/08/2026,Rosendaël
DUCASSE DE ROSENDAEL,30/08/2026,30/08/2026,Rosendaël
...
DUCASSE DE ROSENDAEL,06/09/2026,06/09/2026,Rosendaël

APRÈS (1 ligne) :
DUCASSE DE ROSENDAEL,29/08/2026,06/09/2026,Rosendaël
```

### Solution 2 : Nettoyage dans le board

Si le board contient déjà ces 31 items, il faut les nettoyer :

1. **Option A : Archivage manuel**
   - Filtrer par nom : "DUCASSE DE ROSENDAEL"
   - Sélectionner les 30 items en trop (garder celui avec la bonne date de fin)
   - Archiver

2. **Option B : Nettoyage automatique (fonction "Nettoyer les doublons")**
   - Avant l'import, cocher l'option **"Nettoyer les doublons avant import"**
   - Le système conservera automatiquement le premier item et archivera les 30 autres
   - ⚠️ **Limite :** La clé de déduplication actuelle compare (nom + date de début + lieu)
   - Si tous les 31 items ont des dates de début différentes, ils ne seront PAS détectés comme doublons
   - **Voir Solution 3 ci-dessous**

### Solution 3 : Améliorer la déduplication (nom + lieu uniquement)

**Problème actuel :** La clé de déduplication utilise `nom + date de début + lieu`.

Si un événement multi-jours est représenté par 31 items avec 31 dates de début différentes, ils ont tous des clés différentes → pas de détection de doublon.

**Solution possible (à développer) :**
- Ajouter une option "Déduplication intelligente par nom + lieu uniquement"
- Lors du nettoyage, si plusieurs items ont le même nom + lieu :
  - Garder celui avec la date de début la plus ancienne et la date de fin la plus récente
  - Archiver tous les autres
- ⚠️ **Risque :** Pourrait fusionner des événements distincts si le même événement se reproduit plusieurs fois dans l'année au même endroit

---

## 📊 Impact Actuel

### Sur les KPIs

Le KPI **"Manifestations"** compte **31 manifestations** au lieu de **1**.

**Pourquoi ?** La déduplication côté client utilise la clé `nom + date de début + lieu`. 
Si les 31 items ont 31 dates de début différentes, ils sont considérés comme 31 manifestations uniques.

### Sur le calendrier

Le calendrier affiche correctement les 31 items (un par jour), mais cela encombre l'interface.

### Sur les validations

Pour valider "DUCASSE DE ROSENDAEL", il faut valider **31 items séparément** ou utiliser la validation de série contiguë (qui valide tous les items de la série d'un coup).

---

## 🛠️ Correction Immédiate (Log)

Le log a été corrigé pour afficher le **nombre de jours réels** au lieu du nombre d'items :

**Avant :**
```
✅ Série contiguë: "DUCASSE DE ROSENDAEL" (31 événements, 29/08/2026 → 06/09/2026)
```

**Maintenant :**
```
✅ Série contiguë: "DUCASSE DE ROSENDAEL" (9 jours, 29/08/2026 → 06/09/2026) [31 items dans le board]
```

Cela permet de voir immédiatement qu'il y a un problème : 9 jours mais 31 items.

---

## 📝 Recommandations

### Court terme (immédiat)

1. **Vérifier le fichier Excel source**
   - Combien de lignes pour "DUCASSE DE ROSENDAEL" ?
   - Si 31 lignes → corriger le fichier (voir Solution 1)

2. **Nettoyer le board**
   - Archiver les 30 items en trop
   - Garder 1 seul item avec les bonnes dates (29/08 → 06/09)

3. **Réimporter le fichier corrigé**
   - Règle d'import : si l'item existe déjà, il sera ignoré
   - Seul le nouvel item propre sera créé

### Moyen terme (développement futur)

1. **Détection automatique lors de l'import**
   - Avant création, analyser le fichier Excel
   - Si un même événement (nom + lieu) apparaît sur plusieurs lignes consécutives
   - Proposer à l'utilisateur de fusionner en un seul item multi-jours

2. **Alerte dans l'UI**
   - Après import, afficher une alerte si des séries contiguës avec > 10 items sont détectées
   - "⚠️ DUCASSE DE ROSENDAEL : 31 items détectés pour 9 jours. Souhaitez-vous fusionner ?"

3. **Option de déduplication avancée**
   - Ajouter une case à cocher "Fusionner les événements contigus avec le même nom"
   - Lors du nettoyage, fusionner automatiquement les séries

---

## 🔗 Fichiers Concernés

- **Log corrigé :** `src/generated/routes/_app/liste.tsx` (ligne 158)
- **Déduplication :** `src/generated/utils/import-utils.ts` (fonction `makeKey`)
- **Import :** `src/generated/routes/_app/index.tsx` (ligne 530+)
- **Nettoyage :** `src/generated/server/cleanup-duplicates.ts`

---

**Date :** 31 août 2026  
**Priorité :** Haute (impact sur les KPIs et l'UX)
