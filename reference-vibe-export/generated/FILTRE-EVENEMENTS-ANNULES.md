# 🚫 Filtrage des Événements Annulés

## 🎯 Règle Absolue

**Les événements avec `statut = "Annulée"` ne doivent JAMAIS apparaître dans aucune vue.**

---

## 🔍 Implémentation Client-Side

**Note Technique** : Le SDK monday.com ne supporte pas l'opérateur `not` pour les colonnes de type `status`. Le filtrage est donc effectué côté client dans toutes les vues.

### **Couche 1 : Filtrage Client — Vue Liste**

**Fichier** : `src/generated/routes/_app/index.tsx`

**Fonction** : `uniqueEvents` (useMemo)

**Logique** :
```typescript
// ALWAYS filter cancelled events (they should never appear in the list)
deduped = deduped.filter(e => e.statut !== 'Annulée');
```

**Comportement** :
- Filtre appliqué **après** la déduplication
- Filtre appliqué **avant** le filtre des archivés
- Aucun événement annulé ne peut être affiché dans le tableau

**→ Protection côté interface utilisateur !** 🛡️

---

### **Couche 2 : Filtrage Client — Vue Calendrier**

**Fichier** : `src/generated/routes/_app/index.tsx`

**Fonction** : `calendarEvents` (useMemo)

**Logique** :
```typescript
return uniqueEvents
  .filter(e => e.dateDeDbut && e.statut !== 'Annulée')
  .flatMap(e => { /* ... */ })
```

**Comportement** :
- Filtre appliqué au moment de la transformation vers le format calendrier
- Aucun événement annulé ne génère de carte dans le calendrier

**→ Protection de l'affichage calendrier !** 🛡️

---

### **Couche 3 : Filtrage Client — Vue Conflits**

**Fichier** : `src/generated/routes/_app/conflits.tsx`

**Fonction** : Filtrage après déduplication

**Logique** :
```typescript
// Filtrer les événements archivés ET annulés (on ne les affiche jamais dans la vue Conflits)
uniqueEvents = uniqueEvents.filter(e => !estArchive(e) && e.statut !== 'Annulée');
```

**Comportement** :
- Filtre appliqué après déduplication
- Les événements annulés ne participent PAS à la détection de conflits
- Les conflits ne comptent que les événements actifs

**→ Protection de la détection de conflits !** 🛡️

---

## 📊 Vue d'Ensemble

### **Cycle de Vie d'un Événement Annulé**

```
┌─────────────────────────────────────────────────────┐
│ 1. Utilisateur change statut → "Annulée"           │
│    (via pastille rouge ou colonne Statut)          │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 2. monday.com enregistre : statut = "Annulée"      │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 3. Client applique filtres de sécurité :           │
│    - Vue Liste : .filter(e => e.statut !== 'Annulée')│
│    - Vue Calendrier : .filter(e => e.statut !== 'Annulée')│
│    - Vue Conflits : .filter(e => e.statut !== 'Annulée')│
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────┐
│ 4. Résultat : Événement invisible dans TOUTES      │
│    les vues (Liste, Calendrier, Conflits)          │
└─────────────────────────────────────────────────────┘
```

---

## 🧪 Test de Vérification

### **Protocole de Test**

**1. Créez un événement**
- Nom : "Concert Test"
- Date : Demain
- Statut : "À valider"

**2. Vérifiez qu'il est visible partout**
- ✅ Vue Liste : Visible dans le tableau
- ✅ Vue Calendrier : Visible sur la date
- ✅ Vue Conflits : Peut apparaître si conflit

**3. Annulez l'événement**
- Vue Liste → Cliquez sur la **pastille rouge** (statut)
- Sélectionnez **"Annulée"**
- Confirmez

**4. Vérifiez qu'il disparaît partout**
- ❌ Vue Liste : **Non visible** (tableau vide ou sans cet événement)
- ❌ Vue Calendrier : **Non visible** (pas de carte ce jour-là)
- ❌ Vue Conflits : **Non visible** (pas dans les conflits)

**5. Rechargez la page**
- Actualiser (F5)
- Vérifier que l'événement annulé reste invisible

**→ Si l'événement disparaît de toutes les vues : ✅ Test réussi !**

---

## ✅ Garanties

### **Protection Client-Side**

✅ **Client Liste** : Filtre `e.statut !== 'Annulée'` dans `uniqueEvents`  
✅ **Client Calendrier** : Filtre `e.statut !== 'Annulée'` dans `calendarEvents`  
✅ **Client Conflits** : Filtre `e.statut !== 'Annulée'` après déduplication  

**Note** : Les événements annulés sont chargés depuis monday.com mais filtrés avant affichage dans chaque vue.

**→ Protection cohérente dans toutes les interfaces !** 🛡️

---

### **Comportements Spécifiques**

| Vue | Événements Annulés | Événements Archivés |
|-----|-------------------|---------------------|
| **Liste** | ❌ Jamais affichés | ⚠️ Masqués par défaut (toggle disponible) |
| **Calendrier** | ❌ Jamais affichés | ✅ Affichés (en gris) |
| **Conflits** | ❌ Jamais affichés | ❌ Jamais affichés |

**Distinction Annulé vs Archivé** :
- **Annulé** = L'événement n'aura PAS lieu (décision volontaire)
- **Archivé** = L'événement a déjà eu lieu (date passée)

**→ Les annulés disparaissent, les archivés sont masquables !** ✅

---

## 🔧 Maintenance

### **Ajout d'une Nouvelle Vue**

**Si vous créez une nouvelle vue qui affiche des événements** :

1. **Charger les événements via `getEvents()`** (filtre serveur actif)
2. **Ajouter un filtre de sécurité** :
   ```typescript
   const filteredEvents = events.filter(e => e.statut !== 'Annulée');
   ```
3. **Tester** : Vérifier qu'un événement annulé n'apparaît pas

**→ Toujours doubler la protection serveur + client !** 🛡️

---

### **Ajout d'un Filtre Serveur**

**Note Technique** : Le SDK monday.com ne supporte pas `{ not: 'Annulée' }` pour les colonnes status.

**Si un jour le SDK supporte cette fonctionnalité** :
```typescript
// Cette syntaxe NE FONCTIONNE PAS actuellement
filters.statut = { not: 'Annulée' }; // ❌ Error: Operator 'not' not supported
```

**Pour l'instant**, le filtrage reste côté client uniquement.

**→ Filtrage client suffisant et fonctionnel !** 🛡️

---

## 📈 Cas d'Usage

### **Scénario 1 : Événement Annulé Puis Réactivé**

**Workflow** :
1. Événement créé : "Festival d'Été"
2. Statut changé à "Annulée" (météo défavorable)
3. Événement **disparaît** de toutes les vues
4. Statut changé à "Validée" (météo améliorée)
5. Événement **réapparaît** dans toutes les vues

**→ L'événement revient dès que le statut change !** ✅

---

### **Scénario 2 : Import Excel avec Événements Annulés**

**Workflow** :
1. Fichier Excel contient 10 événements
2. 2 événements ont `Statut = "Annulée"` dans le fichier
3. Import du fichier
4. Résultat :
   - 10 événements créés/mis à jour dans monday.com
   - **8 événements visibles** dans l'application
   - **2 événements annulés** invisibles

**→ Les annulés sont stockés mais jamais affichés !** ✅

---

### **Scénario 3 : Recherche d'un Événement Annulé**

**Workflow** :
1. Événement "Concert Test" annulé
2. Recherche "Concert" dans la vue Liste
3. Résultat : **Aucun résultat** (événement annulé invisible)

**Workaround** : Accéder directement à monday.com pour voir/modifier l'événement annulé

**→ Les annulés sont complètement cachés de l'application !** ✅

---

## 🎯 Résumé

**Règle d'Or** : `statut = "Annulée"` → **Invisible partout**

**Filtrage** :
- ✅ Serveur : `getEvents()` filtre par défaut
- ✅ Client Liste : Filtre de sécurité
- ✅ Client Calendrier : Filtre de sécurité
- ✅ Client Conflits : Filtre de sécurité

**Résultat** :
- ❌ Vue Liste : Non visible
- ❌ Vue Calendrier : Non visible
- ❌ Vue Conflits : Non visible

**→ Protection totale contre l'affichage d'événements annulés !** 🛡️✨
