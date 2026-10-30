# ✅ Solution Finale : Affichage des Événements Archivés Monday.com

## 🎯 Objectif Clarifié

**Vous voulez :**
- Voir les événements **archivés dans Monday.com** (via le bouton "Archiver tous les passés")
- Les afficher dans le calendrier ET dans la liste
- Avec leur statut "archived" visible

**Ce que vous NE voulez PAS :**
- Juste détecter les dates passées côté client
- Un filtre d'affichage basé sur les dates

---

## ✅ Modifications Apportées

### **1. Requête GraphQL Simplifiée**

**Ancien code (qui plantait) :**
```typescript
// Requête complexe avec query_params → 502 Bad Gateway
items_page(limit: 500, query_params: { rules: [...] })
```

**Nouveau code (simple et robuste) :**
```typescript
// Requête SIMPLE sans query_params
query {
  boards(ids: [5101294948]) {
    items_page(limit: 500) {
      items {
        id
        name
        state  // ← "active" ou "archived"
        column_values { ... }
      }
    }
  }
}
```

**Effet :** Monday.com renvoie TOUS les items (actifs + archivés), puis on filtre côté serveur ceux avec `state="archived"`.

---

### **2. Logs Détaillés Serveur**

**Nouveaux logs dans `getEvents()` :**

```javascript
[getEvents] ✅ Fetching ARCHIVED events via simple GraphQL query...
[getEvents] Executing simple GraphQL query...
[getEvents] GraphQL response received: OK
[getEvents] GraphQL returned 900 total items from Monday
[getEvents] Item 5101234567 (Carnaval): state="archived"
[getEvents] Item 5101234568 (DUCASSE): state="active"
[getEvents] ✅ Found 150 items with state="archived"
[getEvents] Archived items sample: ["5101234567:Carnaval", "5101234569:Marché Noël", ...]
[getEvents] ✅ Mapped archived item: Carnaval (Carnaval) - dates: 2026-03-15 → 2026-03-17
[getEvents] ✅ Total after adding 150 archived: 1050 items
```

**Si erreur :**
```javascript
[getEvents] ❌ GraphQL response is empty or malformed
[getEvents] Response: { ... }
[getEvents] ❌ Error fetching archived items: ...
[getEvents] ❌ Error message: ...
```

---

### **3. Gestion des Erreurs**

**Si la requête GraphQL échoue :**
- L'erreur est loggée en détail
- L'app continue avec seulement les événements actifs
- Aucun plantage global

---

## 🧪 Test Complet

### **Étape 1 : Archiver des événements**

1. **Cliquez** sur le bouton **"Archiver tous les passés"**
2. **Confirmez** l'action
3. **Attendez** le message de succès :
   ```
   ✅ ARCHIVAGE TERMINÉ !
   • X événements archivés dans Monday.com
   • Y événements conservés
   ```

---

### **Étape 2 : Vérifier dans Monday.com**

1. Allez dans **Monday.com**
2. Board **"extraction-kiosk"**
3. Menu (3 points) → **"View archived items"**
4. **Comptez** le nombre d'items archivés

**Note ce nombre :** _____

---

### **Étape 3 : Cocher le toggle**

1. **Revenez** dans l'app
2. **Ouvrez la console** (F12)
3. **Cochez** ☑ Afficher les archives
4. **Observez** les logs dans la console

---

### **Étape 4 : Analyser les logs**

**Cherchez ces lignes-clés :**

#### **A. Requête exécutée ?**
```javascript
[getEvents] ✅ Fetching ARCHIVED events via simple GraphQL query...
[getEvents] Executing simple GraphQL query...
```
✅ **Présent** → La requête est lancée  
❌ **Absent** → Le toggle ne déclenche pas le rechargement

---

#### **B. Réponse reçue ?**
```javascript
[getEvents] GraphQL response received: OK
```
✅ **"OK"** → Monday.com a répondu  
❌ **"NULL"** → Pas de réponse (problème réseau/auth)

---

#### **C. Items retournés ?**
```javascript
[getEvents] GraphQL returned 900 total items from Monday
```
✅ **> 0** → Monday renvoie des données  
❌ **0** → Aucun item retourné (problème de requête)

---

#### **D. Items archivés détectés ?**
```javascript
[getEvents] Item 5101234567 (Carnaval): state="archived"
[getEvents] ✅ Found 150 items with state="archived"
```
✅ **> 0** → Des items ont `state="archived"`  
❌ **0** → Aucun item archivé détecté

**Si 0 :** Vérifiez dans Monday.com ("View archived items"). S'il y en a, c'est que Monday ne les renvoie pas via GraphQL.

---

#### **E. Items mappés et ajoutés ?**
```javascript
[getEvents] ✅ Mapped archived item: Carnaval (Carnaval) - dates: ...
[getEvents] ✅ Total after adding 150 archived: 1050 items
```
✅ **Présent** → Les archives sont ajoutées aux résultats  
❌ **Absent** → Le mapping échoue

---

#### **F. Items reçus côté client ?**
```javascript
[Calendar] Received: 1050 events
[Calendar] afficherArchives: true
```
✅ **1050 > 900** → Les archives sont bien reçues  
❌ **Même nombre** → Les archives ne traversent pas

---

### **Étape 5 : Vérifier l'affichage**

1. **Regardez** la bannière bleue :
   ```
   ✅ Mode archives activé
   900 actifs + 150 archivés = 1050 total
   ```

2. **Cliquez** sur une **date passée** (ex: 15 mars 2026)

3. **Vérifiez** si les événements archivés apparaissent

---

## 🚨 Scénarios de Debug

### **Scénario 1 : "Found 0 items with state='archived'"**

**Logs :**
```javascript
[getEvents] GraphQL returned 900 total items
[getEvents] ✅ Found 0 items with state="archived"
```

**Diagnostic :** Monday.com renvoie des items, mais aucun n'a `state="archived"`.

**Causes possibles :**
1. Les événements ne sont pas vraiment archivés dans Monday
2. Monday GraphQL ne renvoie pas les items archivés
3. Le champ `state` n'est pas présent dans la réponse

**Solution :**
1. Vérifiez manuellement dans Monday.com ("View archived items")
2. Si des items sont listés là-bas → Monday GraphQL ne les expose pas correctement
3. Essayez d'archiver un événement manuellement (clic droit → Archive)
4. Recochez le toggle et vérifiez si `state="archived"` apparaît dans les logs

---

### **Scénario 2 : "GraphQL response received: NULL"**

**Logs :**
```javascript
[getEvents] Executing simple GraphQL query...
[getEvents] GraphQL response received: NULL
[getEvents] ❌ GraphQL response is empty or malformed
```

**Diagnostic :** Monday.com ne répond pas ou renvoie une erreur.

**Causes possibles :**
1. Token Monday.com expiré
2. Permissions insuffisantes
3. Board ID incorrect
4. Erreur GraphQL (syntaxe)

**Solution :**
1. Rafraîchissez la page (F5) → token renouvelé
2. Vérifiez que vous êtes admin du board
3. Vérifiez le board ID : `5101294948`

---

### **Scénario 3 : "Total after adding 150 archived: 1050" mais 0 affiché**

**Logs :**
```javascript
[getEvents] ✅ Total after adding 150 archived: 1050 items
[Calendar] Received: 1050 events
[Filter] Split into: 1050 active events + 0 archived events
```

**Diagnostic :** Les archives arrivent mais ne sont pas séparées correctement côté client.

**Causes :** La fonction `estArchive()` ne détecte pas les items comme archivés (dates).

**Solution :** Les événements archivés dans Monday n'ont peut-être pas de `dateDeFin` passée. Modifions la logique pour marquer comme "archivés" les items qui viennent de la requête GraphQL.

---

## 📋 Checklist de Vérification

Avant de rapporter un problème, cochez :

- [ ] J'ai cliqué sur "Archiver tous les passés"
- [ ] J'ai vu le message "✅ ARCHIVAGE TERMINÉ !"
- [ ] J'ai vérifié dans Monday.com → "View archived items" (nombre : ____)
- [ ] J'ai coché "Afficher les archives"
- [ ] J'ai ouvert la console (F12)
- [ ] Je vois `[getEvents] ✅ Fetching ARCHIVED events`
- [ ] Je vois `[getEvents] GraphQL response received: OK`
- [ ] Je vois `[getEvents] GraphQL returned X total items` (X > 0)
- [ ] Je vois `[getEvents] ✅ Found Y items with state="archived"` (Y > 0)
- [ ] Je vois `[Calendar] Received: Z events` (Z > nombre initial)
- [ ] La bannière affiche "X actifs + Y archivés = Z total"

**Si toutes les cases sont cochées mais aucun événement n'apparaît :**
→ Partagez les logs complets de la console

---

## 🎯 Résumé

**Workflow complet :**

```
1. Clic "Archiver tous les passés"
   ↓
2. Monday.com archive les items (state="archived")
   ↓
3. Clic toggle "Afficher les archives"
   ↓
4. getEvents({ includeArchived: true })
   ↓
5. GraphQL query → Monday renvoie TOUS les items
   ↓
6. Filtrage serveur : items.filter(i => i.state === "archived")
   ↓
7. Mapping → format Board SDK
   ↓
8. Retour client : 900 actifs + 150 archivés
   ↓
9. Séparation client : estArchive(event)
   ↓
10. Affichage : calendrier + liste
```

**Point critique à vérifier :**
- Étape 6 : `[getEvents] ✅ Found X items with state="archived"`

**Si X = 0 :**
→ Monday ne renvoie pas d'items archivés via GraphQL
→ Vérifier manuellement dans Monday.com

**Si X > 0 mais pas d'affichage :**
→ Problème de séparation côté client (estArchive)
→ Partager les logs `[Filter]`

---

**Cochez le toggle, ouvrez la console, et partagez les logs `[getEvents]` et `[Filter]` ! 🔍**
