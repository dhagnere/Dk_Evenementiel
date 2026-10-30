# 🔍 Debug : Affichage des Archives

**Problème rapporté :** Les événements archivés ne sont plus affichables.

---

## 📋 Comment Fonctionne le Filtrage des Archives

### Définition : Qu'est-ce qu'un Événement Archivé ?

Un événement est considéré comme **archivé** si sa **date de fin est passée**.

```javascript
function estArchive(event) {
  if (!event.dateDeFin) return false;
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  const dateFin = new Date(event.dateDeFin);
  dateFin.setHours(0, 0, 0, 0);
  
  return dateFin < aujourdhui; // Date de fin < aujourd'hui
}
```

**Exemple :**
- Aujourd'hui : 31 août 2026
- Événement "Carnaval" : 15 mars 2026 → **ARCHIVÉ** ✅
- Événement "DUCASSE" : 6 septembre 2026 → **NON archivé** (futur)

---

## 🔄 Logique de Filtrage

### Par Défaut : Archives CACHÉES

```javascript
if (!afficherArchives && !searchTerm) {
  // Filtrer (cacher) les événements archivés
  events = events.filter(e => !estArchive(e));
}
```

**Conditions pour AFFICHER les archives :**
- ✅ Toggle "Afficher les archives" activé (`afficherArchives = true`)
- ✅ OU une recherche est en cours (`searchTerm` non vide)

**Conditions pour CACHER les archives :**
- ❌ Toggle "Afficher les archives" désactivé ET aucune recherche

---

## 🖱️ Comment Afficher les Archives

### Dans le Calendrier (route `/`)

1. Cherchez le toggle **"Afficher les archives"** dans la barre de filtres (en haut)
2. Cochez la case
3. Les événements passés apparaissent avec un **point gris**

### Dans la Liste (route `/liste`)

1. Cherchez le toggle **"Afficher les archives"** dans la barre de filtres
2. Cochez la case
3. Les événements archivés apparaissent en bas de la liste

---

## 🐛 Debugging

### Logs Ajoutés

Des logs sont maintenant affichés dans la console (F12) pour diagnostiquer le problème :

**Calendrier (`index.tsx`) :**
```
[Filter] Archive filter: 500 → 350 (removed 150 archived events)
```
Ou si le toggle est activé :
```
[Filter] Archive filter DISABLED (afficherArchives: true, searchTerm: "")
```

**Liste (`liste.tsx`) :**
```
[Liste] Archive filter: 500 → 350 (removed 150 archived events)
```
Ou si le toggle est activé :
```
[Liste] Archive filter DISABLED (afficherArchives: true, debouncedSearch: "")
```

### Comment Vérifier

1. Ouvrez la console (F12)
2. Activez/désactivez le toggle "Afficher les archives"
3. Vérifiez les logs :
   - Si vous voyez `Archive filter DISABLED` → le toggle fonctionne ✅
   - Si vous voyez toujours `removed X archived events` → le toggle ne change pas le state ❌

---

## ❓ Problèmes Possibles

### 1. Le State ne Change Pas

**Symptôme :** Le toggle ne change pas de couleur quand on clique.

**Cause :** Le composant `Checkbox` ne met pas à jour le state.

**Solution :** Vérifier que l'événement `onCheckedChange` est bien déclenché.

### 2. Le Memo ne se Recalcule Pas

**Symptôme :** Le toggle change, mais les événements ne s'affichent pas.

**Cause :** Le `useMemo` ne se recalcule pas quand `afficherArchives` change.

**Solution :** Vérifier que `afficherArchives` est bien dans les dépendances du `useMemo` :
```javascript
}, [events, afficherArchives, searchTerm]); // ← afficherArchives doit être ici
```

### 3. Les Événements Archivés ne sont Pas Chargés

**Symptôme :** Le toggle fonctionne, mais aucun événement passé n'existe.

**Cause :** Le serveur ne renvoie que les événements futurs.

**Solution :** Vérifier que `getEvents()` ne filtre pas par date côté serveur.

**Vérification :** 
```javascript
// Dans server/events.ts, il NE DOIT PAS y avoir de filtre comme :
// filters.dateDeFin = { gte: new Date() } // ← NE PAS FAIRE ÇA !
```

### 4. La Déduplication Supprime les Archives

**Symptôme :** Les événements archivés sont chargés, mais disparaissent après déduplication.

**Cause :** La logique de déduplication privilégie les événements non archivés.

**Solution :** Vérifier la logique de déduplication dans `uniqueEvents`.

---

## 🧪 Test de Diagnostic

### Étape 1 : Vérifier qu'il Existe des Événements Archivés

Dans la console :
```javascript
// Ouvrir F12 et taper :
console.log('Événements archivés :', 
  events.filter(e => new Date(e.dateDeFin) < new Date())
);
```

**Si le résultat est vide `[]` :** Aucun événement archivé dans la base → normal qu'ils ne s'affichent pas.

**Si le résultat contient des événements :** Ils existent, donc le problème est dans le filtrage.

### Étape 2 : Vérifier le State du Toggle

Dans la console, après avoir activé le toggle :
```javascript
// Vérifier le state (ne fonctionne que dans React DevTools)
// Ou regarder les logs "[Filter] Archive filter DISABLED..."
```

### Étape 3 : Vérifier le Filtrage

Si les événements existent ET le toggle est activé, mais ils ne s'affichent toujours pas :

**Vérifier dans le code :**
```javascript
// Dans uniqueEvents (index.tsx ligne ~969)
if (!afficherArchives && !searchTerm) {
  deduped = deduped.filter(e => !estArchive(e));
}
```

**Le problème peut venir de :**
- `afficherArchives` reste `false` malgré le toggle
- `searchTerm` est défini (alors le filtre passe même si toggle = false)
- `estArchive()` retourne toujours `true` (problème de parsing de date)

---

## 🎯 Checklist de Vérification

Avant de dire "les archives ne s'affichent pas", vérifiez :

- [ ] Il existe au moins un événement avec `dateDeFin < aujourd'hui`
- [ ] Le toggle "Afficher les archives" existe dans l'interface
- [ ] Cliquer sur le toggle change bien sa couleur/état
- [ ] Les logs console montrent `Archive filter DISABLED` quand toggle = ON
- [ ] Le nombre total d'événements augmente quand on active le toggle

---

## 📊 Exemple de Flux

```
Board monday.com : 500 événements
  - 350 événements futurs (non archivés)
  - 150 événements passés (archivés)

         ↓ getEvents() (serveur)

Client reçoit : 500 événements
  - Pas de filtre côté serveur ✅

         ↓ uniqueEvents (useMemo)

Toggle DÉSACTIVÉ (afficherArchives = false) :
  → Filtre les archives
  → Affiche : 350 événements ✅

Toggle ACTIVÉ (afficherArchives = true) :
  → Pas de filtre
  → Affiche : 500 événements ✅
```

---

## 🔧 Correction Appliquée

### Logs de Debug Ajoutés

**Fichier :** `routes/_app/index.tsx`
```javascript
if (!afficherArchives && !searchTerm) {
  deduped = deduped.filter(e => !estArchive(e));
  console.log(`[Filter] Archive filter: ${beforeArchiveFilter} → ${deduped.length} (removed ${beforeArchiveFilter - deduped.length} archived events)`);
} else {
  console.log(`[Filter] Archive filter DISABLED (afficherArchives: ${afficherArchives}, searchTerm: "${searchTerm || ''}")`);
}
```

**Fichier :** `routes/_app/liste.tsx`
```javascript
if (!afficherArchives && !debouncedSearch) {
  filtered = filtered.filter(e => !estArchive(e));
  console.log(`[Liste] Archive filter: ${beforeArchiveFilter} → ${filtered.length} (removed ${beforeArchiveFilter - filtered.length} archived events)`);
} else {
  console.log(`[Liste] Archive filter DISABLED (afficherArchives: ${afficherArchives}, debouncedSearch: "${debouncedSearch || ''}")`);
}
```

---

## ✅ Prochaines Étapes

1. **Ouvrir la console** (F12)
2. **Activer le toggle** "Afficher les archives"
3. **Regarder les logs** :
   - Vous voyez `Archive filter DISABLED` ? → Le toggle fonctionne ✅
   - Vous ne voyez rien ? → Le toggle ne change pas le state ❌
   - Vous voyez `removed 0 archived events` ? → Aucun événement archivé dans la base
   - Vous voyez `removed X archived events` même avec toggle activé ? → Bug de state

4. **Partagez les logs** pour diagnostic précis

---

**Les logs permettront de savoir exactement où se situe le problème ! 🔍**
