# Debug : Série Pas Détectée

**Version** : `b18f53b6-3285-45da-ad86-50bdaf2f5630`  
**Problème** : Seule la date cliquée est validée, pas toute la série

---

## 🔍 Logs de Debug Ajoutés

### **Ouvrez la Console (F12)**

Quand vous cliquez sur la validation d'un événement, vous devriez voir :

```javascript
🔍 isContiguousSeries pour "HABITER LA MODERNITÉ...": {
  totalEvents: 150,           // Nombre total d'événements chargés
  seriesEventsFound: 3,       // Nombre d'événements avec ce nom exact
  names: ["EVT-...", "EVT-...", "EVT-..."]
}
  📅 Dates extraites: ["12/08/2026", "13/08/2026", "14/08/2026"]
  📏 Écart 12/08/2026 → 13/08/2026: 1 jours
  📏 Écart 13/08/2026 → 14/08/2026: 1 jours
  ✅ Série contiguë détectée!
📊 seriesCount pour "HABITER LA MODERNITÉ...": 3
```

---

## 🐛 Scénarios de Problème

### **Scénario 1 : `seriesEventsFound: 1`**

**Log** :
```
🔍 isContiguousSeries pour "HABITER LA MODERNITÉ...": {
  seriesEventsFound: 1,  ← PROBLÈME
  ...
}
  ❌ Moins de 2 événements trouvés
📊 seriesCount: 0
```

**Cause** : Un seul événement trouvé dans `events`

**Solutions** :

#### A. Les événements n'ont pas le même nom exact

Vérifiez dans le board monday.com que tous les événements ont **exactement** le même nom dans la colonne `Nom` :
- ✅ "HABITER LA MODERNITÉ À DUNKERQUE - ÉDITION # 2"
- ✅ "HABITER LA MODERNITÉ À DUNKERQUE - ÉDITION # 2"
- ❌ "HABITER LA MODERNITÉ À DUNKERQUE - ÉDITION # 2 " (espace en plus)
- ❌ "Habiter la modernité à Dunkerque - Édition # 2" (casse différente)

**Action** : Corrigez les noms dans le board pour qu'ils soient **identiques**.

---

#### B. Les autres événements ne sont pas chargés

Si vous voyez `totalEvents: 25` alors que vous avez 150+ événements :
→ Problème de pagination

**Vérifiez** dans `getEvents` (serveur) :
```typescript
// S'assurer que TOUS les événements sont chargés
let allItems: any[] = [];
let cursor: string | undefined = undefined;

do {
  const page = await board.items()
    .withColumns([...])
    .withPagination({ limit: 500, cursor })
    .execute();
  
  allItems.push(...(page.items ?? []));
  cursor = page.cursor ?? undefined;
} while (cursor);
```

**Action** : Vérifiez que `getEvents` boucle sur tous les cursors.

---

#### C. Filtres actifs masquent les autres dates

Si vous avez des filtres actifs (quartier, nature, statut...) :
→ Les autres dates de la série peuvent être filtrées

**Test** : Désactivez TOUS les filtres et réessayez.

---

### **Scénario 2 : `Dates extraites: ["12/08/2026"]`**

**Log** :
```
🔍 isContiguousSeries pour "HABITER LA MODERNITÉ...": {
  seriesEventsFound: 3,
  ...
}
  📅 Dates extraites: ["12/08/2026"]  ← PROBLÈME (1 seule date)
  ❌ Moins de 2 dates valides
```

**Cause** : Les autres événements n'ont pas de date valide dans `dateDeDebut`

**Solutions** :

#### A. Vérifier les dates dans le board

Dans monday.com, vérifiez que TOUTES les lignes ont une date dans la colonne "Date de début" :
- ✅ 12/08/2026
- ✅ 13/08/2026
- ❌ (vide)

**Action** : Remplissez toutes les dates manquantes.

---

#### B. Problème de colonne

Vérifiez que la colonne utilisée est bien `dateDeDebut` :
```typescript
.withColumns(['dateDeDebut', ...])
```

**Action** : Vérifiez dans `getEvents` que `dateDeDebut` est dans `withColumns`.

---

### **Scénario 3 : Écarts > 1 Jour**

**Log** :
```
🔍 isContiguousSeries pour "HABITER LA MODERNITÉ...": {
  seriesEventsFound: 4,
  ...
}
  📅 Dates extraites: ["01/09/2026", "08/09/2026", "15/09/2026", "22/09/2026"]
  📏 Écart 01/09/2026 → 08/09/2026: 7 jours  ← PROBLÈME
  ❌ Série dispersée (écart > 1 jour)
📊 seriesCount: 0
```

**Cause** : Les dates ne sont PAS consécutives (normal pour des ateliers hebdomadaires)

**Comportement attendu** : Validation individuelle

**Action** : C'est le comportement voulu ! Les ateliers tous les samedis doivent être validés un par un.

---

### **Scénario 4 : `seriesCount: 0` malgré série contiguë détectée**

**Log** :
```
  ✅ Série contiguë détectée!
📊 seriesCount pour "HABITER LA MODERNITÉ...": 0  ← PROBLÈME
```

**Cause** : Le filtre final dans `seriesCount` ne trouve pas les événements

**Solution** :

Vérifiez que le nom utilisé pour le filtre est exact :
```typescript
const seriesCount = eventToValidate && isContiguousSeries(eventToValidate.nom || eventToValidate.name) 
  ? events.filter(e => 
      (e.nom || e.name).trim().toLowerCase() === (eventToValidate.nom || eventToValidate.name).trim().toLowerCase()
    ).length 
  : 0;
```

**Action** : Ajoutez un log temporaire :
```typescript
console.log('🔍 Filtrage final:', {
  searchName: (eventToValidate.nom || eventToValidate.name).trim().toLowerCase(),
  matches: events.filter(e => 
    (e.nom || e.name).trim().toLowerCase() === (eventToValidate.nom || eventToValidate.name).trim().toLowerCase()
  ).map(e => e.nom || e.name)
});
```

---

## ✅ Checklist de Vérification

Pour que la validation de série fonctionne :

- [ ] Tous les événements ont **exactement** le même nom dans la colonne `Nom`
- [ ] Toutes les lignes ont une date valide dans `Date de début`
- [ ] Les dates sont **consécutives** (écart ≤ 1 jour)
- [ ] Tous les événements sont **chargés** (pagination complète)
- [ ] Aucun filtre actif ne masque les autres dates
- [ ] La colonne `dateDeDebut` est bien dans `withColumns` de `getEvents`

---

## 🔧 Test Unitaire

### **Créer un Événement Test**

1. Dans monday.com, créez 3 lignes avec :
   - **Nom** : "TEST SÉRIE CONTIGUË" (identique pour les 3)
   - **Date de début** : 
     - Ligne 1 : 20/08/2026
     - Ligne 2 : 21/08/2026
     - Ligne 3 : 22/08/2026
   - **Statut** : "À valider"

2. Rafraîchissez l'app (F5)

3. Ouvrez la console (F12)

4. Cherchez "TEST SÉRIE CONTIGUË" dans la liste

5. Cliquez sur validation d'une date

6. **Vérifiez la console** :
   ```
   🔍 isContiguousSeries pour "TEST SÉRIE CONTIGUË": {
     seriesEventsFound: 3,  ← Doit être 3
     ...
   }
     📅 Dates extraites: ["20/08/2026", "21/08/2026", "22/08/2026"]
     📏 Écart 20/08/2026 → 21/08/2026: 1 jours
     📏 Écart 21/08/2026 → 22/08/2026: 1 jours
     ✅ Série contiguë détectée!
   📊 seriesCount: 3  ← Doit être 3
   ```

7. **Le dialog doit s'afficher** avec "Valider les 3 événements"

8. **Après validation** : Les 3 lignes doivent avoir statut "Validée"

---

## 📝 Prochaines Étapes

1. **Rafraîchissez l'app** (F5)
2. **Ouvrez la console** (F12)
3. **Cliquez sur validation** d'un événement de série
4. **Copiez-collez les logs** de la console ici

**→ Les logs nous diront exactement où est le problème !** 🔍

---

**Avec ces logs, nous saurons si :**
- Les événements ne sont pas trouvés (nom différent)
- Les dates ne sont pas extraites (dates manquantes)
- Les écarts sont trop grands (série dispersée)
- Le compteur final est incorrect (bug de logique)

**Testez maintenant et partagez les logs !** 🚀
