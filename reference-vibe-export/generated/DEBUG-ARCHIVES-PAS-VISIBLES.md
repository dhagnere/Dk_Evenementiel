# 🔍 Debug : Les Archives N'Apparaissent Pas

**Problème :** Vous avez coché "Afficher les archives" mais aucun événement archivé n'apparaît dans le calendrier.

---

## 📋 Checklist de Diagnostic

Suivez ces étapes **dans l'ordre** et notez les résultats :

### **Étape 1 : Vérifier s'il existe des événements archivés dans Monday.com**

1. Ouvrez Monday.com
2. Allez sur le board **"extraction-kiosk"**
3. Cliquez sur le menu (3 points) → **"View archived items"**
4. **Notez le nombre d'items archivés**

**❓ Question :** Voyez-vous des items archivés ?
- ✅ **Oui, X items** → Passez à l'étape 2
- ❌ **Non, 0 items** → **PROBLÈME IDENTIFIÉ** : Aucun événement n'a été archivé. Utilisez d'abord le bouton "Archiver tous les passés"

---

### **Étape 2 : Vérifier que le toggle déclenche bien un rechargement**

1. Ouvrez la **console** (F5 puis F12)
2. **Décochez** "Afficher les archives" (s'il était coché)
3. **Cochez** "Afficher les archives"
4. **Cherchez** dans la console :

```javascript
[Toggle] Afficher archives: true
[Toggle] This will trigger useEffect and reload with includeArchived=true
[Calendar] Loading events with filters: { includeArchived: true }
```

**❓ Question :** Voyez-vous ces 3 lignes ?
- ✅ **Oui** → Passez à l'étape 3
- ❌ **Non** → **PROBLÈME** : Le toggle ne déclenche pas le rechargement. Rafraîchissez la page (F5) et réessayez

---

### **Étape 3 : Vérifier que la requête GraphQL s'exécute**

1. **Console toujours ouverte**
2. **Cherchez** ces lignes :

```javascript
[getEvents] ✅ Fetching ARCHIVED events via GraphQL...
[getEvents] Executing GraphQL query for all items...
[getEvents] GraphQL response received
[getEvents] GraphQL returned X total items
[getEvents] Found Y archived items (state="archived")
```

**❓ Question :** Quelle est la valeur de Y (archived items) ?

**Cas A : Y > 0** (par exemple "Found 150 archived items")
- ✅ **Parfait** → Les archives sont récupérées. Passez à l'étape 4

**Cas B : Y = 0** ("Found 0 archived items")
- ❌ **PROBLÈME** : GraphQL renvoie des items mais aucun n'a state="archived"
- **Solution :** Les items ne sont peut-être pas vraiment archivés. Retournez à l'étape 1

**Cas C : Aucune de ces lignes n'apparaît**
- ❌ **PROBLÈME** : La requête GraphQL ne s'exécute pas
- **Solution :** Vérifiez les erreurs rouges dans la console

---

### **Étape 4 : Vérifier que les archives sont mappées correctement**

1. **Console toujours ouverte**
2. **Cherchez** ces lignes :

```javascript
[getEvents] Mapped archived item: "Nom Événement" (Nom) - dates: 2026-03-15 → 2026-03-17
[getEvents] ✅ Total after adding Y archived: X items
```

**❓ Question :** Voyez-vous des lignes "Mapped archived item" ?
- ✅ **Oui** → Les archives sont mappées. Passez à l'étape 5
- ❌ **Non** → **PROBLÈME** : Le mapping échoue. Cherchez une erreur rouge dans la console

---

### **Étape 5 : Vérifier que les événements arrivent côté client**

1. **Console toujours ouverte**
2. **Cherchez** ces lignes :

```javascript
[Calendar] Received: X events
[Calendar] afficherArchives: true
[Calendar] Events with dateDeFin < today: Y/X
```

**❓ Question :** Quelle est la valeur de Y ?

**Cas A : Y > 0** (par exemple "Events with dateDeFin < today: 150/480")
- ✅ **Parfait** → Les événements passés sont bien reçus. Passez à l'étape 6

**Cas B : Y = 0**
- ❌ **PROBLÈME** : Aucun événement n'a de date passée
- **Solution :** Les événements ne sont peut-être pas vraiment passés. Vérifiez la date du jour (console : `new Date()`)

---

### **Étape 6 : Vérifier la séparation actifs/archivés**

1. **Console toujours ouverte**
2. **Cherchez** ces lignes :

```javascript
[Filter] Starting with X total events (includeArchived=true)
[Filter] Split into: A active events + B archived events
[Filter] ✅ TOGGLE ACTIVÉ → Displaying: A active + B archived = C total
[Filter] ✅ Archived events sample: [...]
```

**❓ Question :** Quelle est la valeur de B ?

**Cas A : B > 0** (par exemple "150 archived events")
- ✅ **Super** → Les archives sont séparées correctement. Passez à l'étape 7

**Cas B : B = 0**
- ❌ **PROBLÈME** : La fonction `estArchive()` ne détecte aucun événement comme archivé
- **Solution :** Vérifiez la date du jour. Si vous êtes en septembre 2026, les événements de janvier 2026 devraient être détectés comme archivés

---

### **Étape 7 : Vérifier l'affichage dans le calendrier**

1. **Regardez** la bannière bleue en haut du calendrier

**❓ Question :** Que dit la bannière ?

**Cas A : "330 actifs + 150 archivés = 480 total"**
- ✅ **Excellent** → Les compteurs sont corrects

**Cas B : "Aucun événement archivé trouvé"**
- ❌ **PROBLÈME** : `archivedEventsCount = 0` côté affichage
- **Solution :** Vérifiez l'étape 6

---

2. **Cliquez** sur une **date passée** dans le calendrier (ex: 15 mars 2026)

**❓ Question :** Voyez-vous des événements dans la popup ?
- ✅ **Oui** → **SUCCÈS !** Les archives s'affichent correctement
- ❌ **Non** → Passez à l'étape 8

---

### **Étape 8 : Forcer le debug**

1. **Cliquez** sur le bouton **"Debug: Reload"** (à côté du toggle)
2. **Attendez** 2 secondes
3. **Refaites** toutes les étapes 2-7

**Si le problème persiste :**
- Copiez **toutes les lignes de la console** (Ctrl+A dans la console, Ctrl+C)
- Cherchez les lignes contenant `[getEvents]`, `[Calendar]`, `[Filter]`
- Partagez ces logs

---

## 🎯 Résultats Attendus (Fonctionnement Normal)

Si tout fonctionne, vous devriez voir cette séquence complète :

```javascript
// 1. Toggle activé
[Toggle] Afficher archives: true
[Toggle] This will trigger useEffect and reload with includeArchived=true

// 2. Rechargement déclenché
[Calendar] Loading events with filters: { includeArchived: true }

// 3. Requête serveur
[getEvents] Starting with filters: { includeArchived: true }
[getEvents] ✅ Fetching ARCHIVED events via GraphQL...
[getEvents] Executing GraphQL query for all items...
[getEvents] GraphQL response received
[getEvents] GraphQL returned 480 total items
[getEvents] Found 150 archived items (state="archived")
[getEvents] Archived items IDs: ["5101234567:Carnaval", "5101234568:Marché Noël", ...]

// 4. Mapping des archives
[getEvents] Mapped archived item: Carnaval (Carnaval) - dates: 2026-03-15 → 2026-03-17
[getEvents] Mapped archived item: Marché de Noël (Marché de Noël) - dates: 2025-12-24 → 2025-12-24
[getEvents] ✅ Total after adding 150 archived: 480 items
[getEvents] Returning 480 items

// 5. Réception côté client
[Calendar] Received: 480 events
[Calendar] afficherArchives: true
[Calendar] Events with dateDeFin < today: 150/480
[Calendar] Sample past events: [
  { name: "Carnaval", dateFin: "2026-03-17T..." },
  { name: "Marché de Noël", dateFin: "2025-12-24T..." }
]

// 6. Séparation et affichage
[Filter] Starting with 480 total events (includeArchived=true)
[Filter] After deduplication: 480 unique events
[Filter] Split into: 330 active events + 150 archived events
[Filter] ✅ TOGGLE ACTIVÉ → Displaying: 330 active + 150 archived = 480 total
[Filter] ✅ Archived events sample: [
  { name: "Carnaval", dateFin: "2026-03-17T..." }
]
```

---

## 🚨 Problèmes Courants

### **Problème 1 : "Found 0 archived items"**

**Cause :** Aucun item n'a `state="archived"` dans Monday.com

**Solutions :**
1. Vérifiez dans Monday.com → "View archived items"
2. Si vide, cliquez sur "Archiver tous les passés" d'abord
3. Attendez le message de succès
4. Recochez "Afficher les archives"

---

### **Problème 2 : "Events with dateDeFin < today: 0/480"**

**Cause :** Tous les événements ont des dates futures

**Solutions :**
1. Vérifiez la date du jour : `new Date()` dans la console
2. Si vous êtes en septembre 2026, des événements de mars 2026 devraient être passés
3. Vérifiez que les événements ont bien une `dateDeFin` renseignée

---

### **Problème 3 : "Split into: 330 active + 0 archived"**

**Cause :** La fonction `estArchive()` ne détecte rien

**Solutions :**
1. Vérifiez la date système de votre ordinateur
2. La fonction considère qu'un événement est archivé si `dateDeFin < aujourd'hui`
3. Si aujourd'hui = 31/08/2026, un événement du 29/08/2026 devrait être détecté

---

### **Problème 4 : Erreur GraphQL dans la console**

**Cause :** La requête Monday.com échoue

**Solutions :**
1. Cherchez une erreur rouge avec "GraphQL"
2. Vérifiez votre token Monday.com (rafraîchissez la page)
3. Vérifiez que le board ID 5101294948 est correct

---

## ✅ Test Simple

**Créez un événement de test :**

1. Allez dans Monday.com → Board "extraction-kiosk"
2. Créez un nouvel item :
   - Nom : "TEST ARCHIVE"
   - Date début : 28/08/2026
   - Date fin : 29/08/2026 (hier)
   - Statut : Validée
3. **Archivez-le manuellement** (clic droit → Archive)
4. Revenez dans l'app
5. Cochez "Afficher les archives"
6. Cherchez dans la console : `"TEST ARCHIVE"`
7. Cliquez sur le 29/08/2026 dans le calendrier

**Résultat attendu :** Vous voyez "TEST ARCHIVE" dans la popup du 29/08

---

**Suivez cette checklist et notez à quelle étape le problème apparaît ! 🔍**
