# ✅ Validation automatique des événements passés

## 🎯 Comportement

Le système offre deux façons d'archiver et valider automatiquement les événements :

### **1. Bouton "Archiver événements passés"** (recommandé)

Un bouton dédié dans la vue Calendrier qui :
- ✅ Trouve **automatiquement** TOUS les événements dont la date est révolue
- ✅ Coche les **Validations Politique et Technique**
- ✅ **Archive** ces événements

**Un clic = tous les événements passés sont validés et archivés**

---

### **2. Archivage manuel**

Lorsque vous archivez des événements manuellement (via le bouton "🧹 Nettoyer le board"), le système applique aussi automatiquement les deux validations :

- ✅ **Validation Politique** 
- ✅ **Validation Technique**

---

## 💡 Logique

Un événement archivé est un événement dont la date est **révolue** (passée). 

**Si l'événement a eu lieu, il a forcément été validé** (politiquement et techniquement), sinon il n'aurait pas eu lieu.

**Donc :** Archiver = Valider automatiquement

---

## 🚀 Comment utiliser le bouton "Archiver événements passés"

### **Étape 1 : Ouvrir la vue Calendrier**

Le bouton se trouve dans la barre d'outils du haut, à côté du bouton "Nettoyer".

---

### **Étape 2 : Cliquer sur "Archiver événements passés"**

Un message de confirmation s'affiche :

```
🔒 Archivage et validation automatiques

Cette action va :
1. Trouver TOUS les événements dont la date est révolue (passée)
2. Cocher automatiquement les validations Politique et Technique
3. Archiver ces événements

Voulez-vous continuer ?
```

---

### **Étape 3 : Confirmer**

Cliquez sur **OK** pour lancer le processus.

Le système va :
1. **Scanner** tous les événements du board
2. **Identifier** ceux dont la date de fin est passée
3. **Valider** et **archiver** chacun d'eux

**Pendant le traitement :**
- Le bouton affiche "Archivage..." avec un spinner
- Des logs détaillés apparaissent dans la console (F12)

---

### **Étape 4 : Vérifier le résultat**

Une fois terminé, un message s'affiche :

```
✅ Archivage automatique terminé

42 événements validés (Politique + Technique)
42 événements archivés
```

---

## 🔄 Processus d'archivage

Pour chaque événement archivé :

### **Étape 1 : Validation automatique** 🔒

Le système coche d'abord les deux validations :

```
🔒 Validation automatique de l'événement EVT-2026-0001 avant archivage...
```

**Mise à jour :**
- `Validation Politique` → ✅ Coché
- `Validation Technique` → ✅ Coché

---

### **Étape 2 : Archivage** 📦

Ensuite, l'événement est archivé :

```
📦 Archivage de l'événement EVT-2026-0001...
✅ Événement EVT-2026-0001 validé et archivé avec succès
```

---

## 📊 Logs de progression

Dans la console (F12), vous verrez pour chaque événement :

```
🔒 [1/150] Validation automatique de l'événement EVT-2026-0001 avant archivage...
📦 [1/150] Archivage de l'événement EVT-2026-0001...
✅ [1/150] Événement EVT-2026-0001 validé et archivé avec succès

🔒 [2/150] Validation automatique de l'événement EVT-2026-0002 avant archivage...
📦 [2/150] Archivage de l'événement EVT-2026-0002...
✅ [2/150] Événement EVT-2026-0002 validé et archivé avec succès

...

📊 Progress: 10/150 items processed (10 deleted, 0 failed)
```

---

## ⏱️ Impact sur le temps de traitement

**Avant :** Archivage seul
- 1 appel API par événement
- ~200ms entre chaque événement
- Exemple : 150 événements = ~30 secondes

**Après :** Validation + Archivage
- 2 appels API par événement (update + archive)
- ~300ms entre chaque événement (100ms update + 100ms pause + 200ms archive)
- Exemple : 150 événements = ~45 secondes

**Impact :** +50% de temps, mais garantit la cohérence des données.

---

## 🔍 Vérification dans Monday.com

Après archivage, ouvrez un événement archivé dans Monday.com :

**Avant :**
- Validation Politique : ❌ (vide)
- Validation Technique : ❌ (vide)

**Après :**
- Validation Politique : ✅ (coché)
- Validation Technique : ✅ (coché)

---

## 🚨 Cas particuliers

### **Événement annulé**

Si un événement a le statut **"Annulée"**, faut-il le valider quand même ?

**Oui.** La validation signifie "approuvé pour être dans le calendrier", pas "a eu lieu effectivement".

Un événement annulé a été approuvé politiquement et techniquement avant son annulation.

---

### **Événement en brouillon**

Si un événement a le statut **"Brouillon"**, faut-il le valider ?

**Non idéalement**, mais le système le fera quand même s'il est archivé.

**Recommandation :** Ne pas archiver les brouillons. Utilisez le filtre par statut lors du nettoyage.

---

### **Événement futur archivé par erreur**

Si vous archivez par erreur un événement dont la date n'est pas encore passée :

**Le système le validera quand même.**

**Solution :** Désarchivez l'événement manuellement dans Monday.com, puis décochez les validations si elles n'auraient pas dû être cochées.

---

## 🎯 Avantages de la validation automatique

✅ **Cohérence des données** : Tous les événements archivés sont marqués comme validés  
✅ **Gain de temps** : Pas besoin de valider manuellement avant archivage  
✅ **Historique complet** : Permet de voir que tous les événements passés ont été approuvés  
✅ **Reporting précis** : Les statistiques de validation reflètent la réalité  

---

## 📝 Exemple concret

### **Scénario : Nettoyage de 150 événements de 2024**

1. Vous cliquez sur "🧹 Nettoyer le board"
2. Vous cochez "Archiver les événements de plus de 6 mois"
3. Le système identifie 150 événements de 2024 (dates révolues)
4. **Pour chaque événement :**
   - Validation Politique → ✅
   - Validation Technique → ✅
   - Archivage → 📦
5. Résultat : 150 événements archivés ET validés

**Temps total :** ~1 minute

---

## ⚙️ Désactivation (si besoin)

Si vous souhaitez **désactiver** la validation automatique lors de l'archivage :

**Actuellement :** Ce n'est pas possible via l'interface.

**Pourquoi :** La validation automatique est considérée comme une bonne pratique pour maintenir la cohérence des données.

**Alternative :** Si vous archivez un événement qui ne devrait pas être validé, décochez manuellement les validations dans Monday.com après archivage.

---

## 📞 Support

Si vous rencontrez un problème avec la validation automatique :

1. Ouvrez la console (F12) pendant l'archivage
2. Notez les logs d'erreur
3. Vérifiez dans Monday.com si les validations ont été appliquées
4. Signalez tout comportement inattendu

---

**La validation automatique lors de l'archivage garantit que tous vos événements passés sont marqués comme approuvés, simplifiant la gestion et le reporting.** ✅
