# 🧹 Guide : Nettoyage des doublons avant import

## Pourquoi nettoyer les doublons ?

Votre board contient **850 événements**. Vous allez importer **528 nouveaux événements**.

Sans nettoyage, la déduplication ne vérifie que les **500 premiers items** du board (pour éviter les timeouts).
→ **Risque** : si des doublons existent dans les items 501-850, ils ne seront pas détectés.

**Solution** : Utilisez l'option **"🧹 Nettoyer les doublons existants"** pour une déduplication complète.

---

## ✅ Validation automatique lors de l'archivage

**Nouveau comportement :** Lorsqu'un événement est archivé (date révolue), le système coche automatiquement :
- ✅ **Validation Politique**
- ✅ **Validation Technique**

**Logique :** Un événement archivé a forcément eu lieu, donc les validations sont considérées comme acquises.

Vous verrez dans les logs :
```
🔒 Validation automatique de l'événement EVT-2026-0001 avant archivage...
📦 Archivage de l'événement EVT-2026-0001...
✅ Événement EVT-2026-0001 validé et archivé avec succès
```

---

## 📋 Procédure recommandée

### **Étape 1 : Premier import AVEC nettoyage**

1. Ouvrez le dialog d'import
2. Sélectionnez votre fichier `special_events_global.xlsx`
3. ✅ **COCHEZ** "🧹 Nettoyer les doublons existants"
4. ❌ **DÉCOCHEZ** "🔢 Renuméroter les identifiants" (optionnel, pas urgent)
5. Cliquez sur **Importer**

**⏱️ Temps estimé :**
- Nettoyage : ~2-3 minutes (850 items à analyser)
- Import : ~1 minute (528 items)
- **TOTAL : ~4-5 minutes**

---

### **Étape 2 : Imports suivants SANS nettoyage**

Une fois le board nettoyé, les imports suivants seront beaucoup plus rapides :

1. Sélectionnez votre fichier
2. ❌ **DÉCOCHEZ** "Nettoyer les doublons" (déjà fait)
3. ❌ **DÉCOCHEZ** "Renuméroter" (pas nécessaire)
4. Cliquez sur **Importer**

**⏱️ Temps estimé : ~1 minute** ⚡

---

## 🎯 Résultats attendus

Après le nettoyage, le dialog de résultats affichera :

```
🧹 Nettoyage automatique
━━━━━━━━━━━━━━━━━━━━
Doublons archivés : 47
Identifiants renumérotés : -

━━━━━━━━━━━━━━━━━━━━

✅ Nouveau(x) : 450
🔄 Mis à jour : 78
❌ Erreur(s) : 0
```

---

## ⚠️ En cas de timeout

Si le nettoyage timeout (rare avec 850 items, mais possible) :

### **Option A : Archiver manuellement les vieux événements**
1. Dans monday.com, filtrez les événements de 2024 et avant
2. Sélectionnez-les tous
3. Archivez-les manuellement
4. Puis faites l'import SANS l'option de nettoyage

### **Option B : Diviser l'import**
1. Divisez votre fichier Excel en 2 fichiers de ~250 lignes chacun
2. Importez-les séparément
3. La déduplication fonctionnera sur chaque import

---

## 🔍 Comment vérifier les doublons après import ?

1. Allez dans la vue **Conflits**
2. Les doublons apparaîtront comme des conflits (même nom + même date + même lieu)
3. Vous pouvez les archiver manuellement si nécessaire

---

## 📊 Optimisations appliquées

- ✅ Pauses réduites : 100ms au lieu de 300ms
- ✅ Batches de 50 items au lieu de 10
- ✅ Chargement optimisé : colonnes minimales
- ✅ Logs détaillés pour suivre la progression

**Durée maximale garantie : 5 minutes pour 850 + 528 items** ✅
