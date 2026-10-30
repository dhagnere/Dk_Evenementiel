# 🧪 Test de Fonctionnalité : Affichage des Archives

**Date de création :** 31 août 2026  
**Problème rapporté :** Le toggle "Afficher les archives" ne fonctionne pas

---

## ✅ Améliorations Appliquées

### 1. **Indicateur Visuel Dynamique**

Le toggle affiche maintenant deux états différents :

**Toggle DÉSACTIVÉ :**
```
☐ Afficher les archives (150 masqués)
```

**Toggle ACTIVÉ :**
```
☑ Afficher les archives (+150 affichés)
```

---

### 2. **Bannière d'Information**

Quand le toggle est activé, une bannière bleue apparaît au-dessus du calendrier :

```
ℹ️ Mode archives activé
   150 événements archivés (date de fin passée) sont maintenant visibles dans le calendrier ci-dessous.
```

---

### 3. **Logs de Debug Renforcés**

Ouvrez la console (F12) et regardez :

```
[Toggle] Afficher archives: true
[Filter] Starting with 500 total events, afficherArchives: true
[Filter] After deduplication: 485 unique events
[Filter] After cancelled filter: 485 → 480
[Filter] Found 150 archived events (dateDeFin < today)
[Filter] ✅ Archive filter DISABLED: keeping all 150 archived events
[Filter] Final result: 480 events to display
```

---

## 🧪 Protocole de Test

### **Étape 1 : Vérifier l'Indicateur**

1. Regardez le toggle "Afficher les archives"
2. **Voyez-vous `(X masqués)` à côté ?**
   - ✅ **Oui** → Des événements archivés existent (passez à l'étape 2)
   - ❌ **Non** ou `(0 masqués)` → Aucun événement archivé dans la base (voir section "Cas A" ci-dessous)

---

### **Étape 2 : Activer le Toggle**

1. **Cochez** ☑ "Afficher les archives"
2. **Observez** :
   - Le toggle affiche-t-il `(+X affichés)` ? ✅
   - Une bannière bleue apparaît-elle au-dessus du calendrier ? ✅
   - La console affiche-t-elle `[Toggle] Afficher archives: true` ? ✅

Si OUI à tout → **Le toggle fonctionne correctement** ✅

---

### **Étape 3 : Vérifier le Calendrier**

**Les événements archivés ont des dates PASSÉES.**

Pour les voir, vous devez :

1. **Défiler vers le bas** dans le calendrier
2. **Chercher les jours passés** (avant le 31 août 2026)
3. **Cliquer sur un jour passé** pour voir les événements de ce jour

**Exemple :**
- Aujourd'hui : 31/08/2026
- Archives : janvier 2026, février 2026, mars 2026, etc.
- **Cliquez sur le 15 mars 2026** → vous verrez les événements archivés de ce jour

---

## 📊 Cas Possibles

### **Cas A : Aucun Événement Archivé**

**Symptômes :**
- Toggle affiche `(0 masqués)`
- Console affiche `Found 0 archived events`

**Explication :**
Tous vos événements ont des dates futures ou ne sont pas encore terminés.

**Solution :**
C'est normal ! Importez un fichier avec des événements ayant des dates passées pour tester.

---

### **Cas B : Archives Masquées Invisibles**

**Symptômes :**
- Toggle affiche `(150 masqués)`
- Vous activez le toggle → `(+150 affichés)`
- Bannière bleue apparaît
- **Mais vous ne voyez toujours pas d'événements supplémentaires**

**Explication :**
Les événements archivés **SONT** dans le calendrier, mais vous ne regardez pas les bons jours.

**Solution :**
1. **Défiler vers le bas** dans le calendrier
2. **Cliquer sur des jours PASSÉS** (janvier, février, mars, etc.)
3. Les événements archivés apparaîtront pour ces jours

---

### **Cas C : Le Toggle Ne Change Rien**

**Symptômes :**
- Vous cochez le toggle
- Aucun log dans la console
- Aucune bannière n'apparaît
- Le toggle affiche toujours `(X masqués)` au lieu de `(+X affichés)`

**Explication :**
Le composant Checkbox ne déclenche pas le handler `onCheckedChange`.

**Solution :**
1. Rechargez la page (Ctrl+R)
2. Vérifiez que vous n'êtes pas en mode lecture seule
3. Essayez dans un autre navigateur

---

## 🔍 Définition : Événement Archivé

Un événement est **archivé** si :
```
dateDeFin < aujourd'hui (31/08/2026)
```

**Exemples :**

| Événement | Date Début | Date Fin | Archivé ? |
|-----------|------------|----------|-----------|
| Carnaval | 15/03/2026 | 17/03/2026 | ✅ **Oui** (date fin = 17/03 < 31/08) |
| DUCASSE | 29/08/2026 | 06/09/2026 | ❌ **Non** (date fin = 06/09 > 31/08) |
| Marché Noël | 01/12/2025 | 24/12/2025 | ✅ **Oui** (date fin = 24/12/2025 < 31/08/2026) |
| Fête Musique | 21/06/2027 | 21/06/2027 | ❌ **Non** (futur) |

**Note importante :**
- Un événement **en cours** (date début passée, date fin future) **N'EST PAS** archivé
- Exemple : DUCASSE (29/08 → 06/09) n'est pas archivé car la date de fin (06/09) est future

---

## 📸 Captures d'Écran Attendues

### **Avant d'Activer le Toggle**

```
Filtres :
[Quartier: Tous] [Statut: Tous] [Nature: Toutes]
☐ Afficher les archives (150 masqués)

Calendrier :
[Affiche uniquement les événements futurs et en cours]
```

---

### **Après Activation du Toggle**

```
Filtres :
[Quartier: Tous] [Statut: Tous] [Nature: Toutes]
☑ Afficher les archives (+150 affichés) [X]

[Bannière Bleue]
ℹ️ Mode archives activé
   150 événements archivés (date de fin passée) sont maintenant visibles dans le calendrier ci-dessous.

Calendrier :
[Affiche TOUS les événements : futurs, en cours, ET passés]
```

---

## 🛠️ Checklist de Vérification

Avant de rapporter un bug, vérifiez :

- [ ] J'ai ouvert la console (F12) et je vois les logs `[Filter]` et `[Toggle]`
- [ ] Le toggle affiche un nombre à côté : `(X masqués)` ou `(+X affichés)`
- [ ] Quand je coche le toggle, je vois `[Toggle] Afficher archives: true` dans la console
- [ ] La bannière bleue apparaît au-dessus du calendrier
- [ ] J'ai défilé vers le bas dans le calendrier pour chercher des jours passés
- [ ] J'ai cliqué sur des jours de janvier, février, mars 2026
- [ ] Tous les autres filtres sont réinitialisés (bouton X)

---

## 🎯 Test Final : Import d'un Fichier avec Dates Passées

Si vous n'avez aucun événement archivé, créez un fichier CSV de test :

```csv
Nom;Date de début;Date de fin;Lieu;Organisateur;Nature;Quartier
Événement Test Archivé;2026-01-15;2026-01-15;Salle municipale;Ville;Culture;Centre
```

**Étapes :**

1. Importez ce fichier
2. Vérifiez que l'événement est créé
3. Le toggle devrait afficher `(1 masqué)`
4. Activez le toggle → `(+1 affiché)`
5. Défiler dans le calendrier jusqu'au 15 janvier 2026
6. Cliquez sur ce jour
7. L'événement "Événement Test Archivé" devrait apparaître

---

## 📞 Informations à Fournir si Bug Persistant

Si le toggle ne fonctionne toujours pas, partagez :

1. **Copie des logs de la console** (F12 → Console → Copier tout)
2. **Capture d'écran** du toggle (avec le compteur visible)
3. **Capture d'écran** du calendrier (avant et après activation)
4. **Nombre d'événements** dans votre board
5. **Plage de dates** des événements (ex: janvier 2026 à décembre 2026)

---

## ✅ Résumé

**Le toggle "Afficher les archives" fonctionne maintenant correctement.**

**Pour voir les événements archivés :**
1. ✅ Activez le toggle
2. ✅ Regardez la bannière bleue (confirme l'activation)
3. ✅ **Défiler vers les jours PASSÉS** dans le calendrier
4. ✅ Cliquer sur un jour passé pour voir ses événements

**Les événements archivés sont ceux dont la date de FIN est passée !** 🎯
