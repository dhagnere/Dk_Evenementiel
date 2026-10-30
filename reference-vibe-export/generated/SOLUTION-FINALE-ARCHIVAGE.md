# ✅ Solution Finale : Archivage Automatique Intelligent

**Date :** 1er septembre 2026  
**Problème résolu :** Les événements archivés dans Monday.com ne s'affichaient pas dans le calendrier

---

## 🔧 Problème Identifié

### **Symptômes**

1. Le bouton "Archiver tous les passés" était visible
2. Clic sur le bouton → confirmation → archivage lancé
3. **Mais** : impossible de voir si l'archivage avait réellement eu lieu
4. Toggle "Afficher les archives" activé → aucun événement archivé visible

---

### **Cause Racine**

La fonction `getEvents()` utilisait `board.items()` qui par défaut **ne récupère QUE les événements actifs** (non archivés) de Monday.com.

**Résultat :**
- Les événements étaient bien archivés dans Monday.com
- Mais `getEvents()` ne les récupérait jamais
- Le toggle "Afficher les archives" ne faisait que filtrer côté client (dates passées)
- Il ne demandait jamais les événements archivés au serveur Monday.com

---

## ✅ Solution Implémentée

### **1. Ajout du paramètre `includeArchived`**

**Fichier :** `src/generated/server/events.ts`

```typescript
export const getEvents = createServerFn({ method: 'GET' })
  .validator(z.object({
    quartier: z.string().optional(),
    statut: z.string().optional(),
    nature: z.string().optional(),
    searchTerm: z.string().optional(),
    includeArchived: z.boolean().optional(), // ← NOUVEAU
  }).optional())
  .handler(async ({ data }) => {
    // ...
    
    let query = board.items().withColumns([...COLUMNS]);
    
    // ✅ Inclure les événements archivés si demandé
    if (data?.includeArchived === true) {
      console.log('[getEvents] ✅ Including ARCHIVED events');
      query = query.includeArchived();
    } else {
      console.log('[getEvents] ❌ Excluding archived events (active only)');
    }
    
    // ... reste de la requête
  });
```

**Effet :**
- `includeArchived: false` (défaut) → Monday renvoie seulement les événements actifs
- `includeArchived: true` → Monday renvoie actifs + archivés

---

### **2. Passage du paramètre depuis le composant**

**Fichier :** `src/generated/routes/_app/index.tsx`

```typescript
useEffect(() => {
  const loadData = async () => {
    const [eventsRes, statsRes] = await withAuthRetry(
      () => Promise.all([
        getEvents({ 
          data: { 
            searchTerm: searchTerm || undefined, 
            quartier: filterQuartier === 'ALL' ? undefined : filterQuartier, 
            statut: filterStatut === 'ALL' ? undefined : filterStatut, 
            nature: filterNature === 'ALL' ? undefined : filterNature,
            includeArchived: afficherArchives // ← NOUVEAU
          } 
        }),
        getEventStats()
      ])
    );
    // ...
  };
  
  loadData();
}, [searchTerm, filterQuartier, filterStatut, filterNature, refreshTrigger, afficherArchives]); 
// ↑ AJOUT : afficherArchives dans les dépendances
```

**Effet :**
- Quand l'utilisateur coche le toggle → `afficherArchives` passe à `true`
- Le `useEffect` se relance automatiquement
- `getEvents()` est appelé avec `includeArchived: true`
- Monday.com renvoie actifs + archivés

---

### **3. Messages visuels améliorés**

#### **Bannière "Mode archives activé" (Toggle ON + Données chargées)**

```
┌──────────────────────────────────────────────────┐
│ ✅ Mode archives activé                          │
│                                                  │
│ Le calendrier affiche maintenant :              │
│ • 330 événements actifs                          │
│ • 150 événements archivés (récupérés depuis     │
│   Monday.com)                                    │
│ = 480 événements au total                        │
│                                                  │
│ 💡 Les événements archivés s'affichent sur      │
│    leurs dates passées dans le calendrier        │
└──────────────────────────────────────────────────┘
```

---

#### **Message de chargement (Toggle ON + Données en cours)**

```
┌──────────────────────────────────────────────────┐
│ ⟳ Chargement des événements archivés...         │
│                                                  │
│ Récupération des événements actifs + archivés   │
│ depuis Monday.com                                │
└──────────────────────────────────────────────────┘
```

---

#### **Message si aucun archivé (Toggle ON + 0 archivés)**

```
┌──────────────────────────────────────────────────┐
│ ✅ Mode archives activé                          │
│                                                  │
│ Aucun événement archivé trouvé dans Monday.com. │
│ Tous les événements passés ont probablement     │
│ déjà été archivés.                               │
└──────────────────────────────────────────────────┘
```

---

### **4. Logs console détaillés**

#### **Toggle DÉSACTIVÉ**

```javascript
[Calendar] Loading events with filters: { includeArchived: false }
[getEvents] ❌ Excluding archived events (active only)
[getEvents] Returning 330 items

[Filter] Starting with 330 total events (includeArchived=false)
[Filter] After deduplication: 330 unique events
[Filter] Split into: 330 active events + 0 archived events
[Filter] ❌ TOGGLE DÉSACTIVÉ → Displaying only: 330 active events
```

---

#### **Toggle ACTIVÉ**

```javascript
[Calendar] Loading events with filters: { includeArchived: true }
[getEvents] ✅ Including ARCHIVED events
[getEvents] Returning 480 items (330 actifs + 150 archivés)

[Filter] Starting with 480 total events (includeArchived=true)
[Filter] After deduplication: 480 unique events
[Filter] Split into: 330 active events + 150 archived events
[Filter] ✅ TOGGLE ACTIVÉ → Displaying: 330 active + 150 archived = 480 total
[Filter] ✅ Archived events sample: [
  { name: "Carnaval", dateFin: "2026-03-17T..." },
  { name: "Marché de Noël", dateFin: "2025-12-24T..." },
  { name: "Fête de la Musique", dateFin: "2026-06-21T..." }
]
```

---

## 🔄 Flux Complet

### **Étape 1 : Archivage**

```
Utilisateur clique sur [🗃️ Archiver tous les passés]
  ↓
Confirmation affichée
  ↓
Utilisateur confirme
  ↓
Fonction autoArchivePassedEvents() exécutée
  ↓
Monday.com archive 150 événements passés
  ↓
Message de succès affiché
  ↓
Calendrier rafraîchi automatiquement (refreshTrigger++)
```

---

### **Étape 2 : Affichage des archives**

```
Utilisateur coche ☑ Afficher les archives
  ↓
afficherArchives = true
  ↓
useEffect se déclenche (dépendance afficherArchives)
  ↓
getEvents({ includeArchived: true }) appelé
  ↓
Monday.com renvoie actifs (330) + archivés (150)
  ↓
Séparation en activeEvents (330) + archivedEvents (150)
  ↓
uniqueEvents = [...activeEvents, ...archivedEvents] = 480
  ↓
Calendrier affiche les 480 événements
  ↓
Bannière bleue "✅ Mode archives activé" visible
```

---

## 🧪 Test de Vérification

### **Test 1 : Archivage**

1. **Créez un événement de test :**
   ```
   Nom : Test Archivage Auto
   Date début : 28/08/2026
   Date fin : 29/08/2026 (hier)
   Lieu : Test
   Statut : Validée
   ```

2. **Rafraîchissez** le calendrier (F5)

3. **Vérifiez** que l'événement apparaît dans la liste

4. **Cliquez** sur `[🗃️ Archiver tous les passés]`

5. **Confirmez** l'archivage

6. **Vérifiez le message :**
   ```
   ✅ ARCHIVAGE TERMINÉ !
   • 1 événement archivé
   • 330 événements conservés
   ```

7. **Vérifiez** que l'événement a disparu du calendrier

---

### **Test 2 : Affichage des archives**

1. **Après l'archivage** (événement "Test Archivage Auto" archivé)

2. **Cochez** ☑ Afficher les archives

3. **Observez** :
   - Message "⟳ Chargement des événements archivés..." apparaît brièvement
   - Puis bannière "✅ Mode archives activé" s'affiche
   - Compteur : "330 actifs + 1 archivé = 331 total"

4. **Ouvrez la console** (F12) et vérifiez :
   ```javascript
   [getEvents] ✅ Including ARCHIVED events
   [Filter] ✅ TOGGLE ACTIVÉ → Displaying: 330 active + 1 archived = 331 total
   [Filter] ✅ Archived events sample: [
     { name: "Test Archivage Auto", dateFin: "2026-08-29T..." }
   ]
   ```

5. **Cherchez** l'événement "Test Archivage Auto" dans le calendrier :
   - Date : 29/08/2026 (hier)
   - Il doit apparaître dans la case du 29 août

6. **Décochez** ☐ Afficher les archives

7. **Vérifiez** que l'événement disparaît à nouveau

---

## 📊 Logs de Diagnostic

### **Problème : Toggle activé mais 0 archivé affiché**

**Console :**
```javascript
[getEvents] ✅ Including ARCHIVED events
[getEvents] Returning 330 items  ← PROBLÈME : devrait être 480
[Filter] Split into: 330 active events + 0 archived events
```

**Diagnostic :**
- Monday.com n'a renvoyé aucun événement archivé
- Soit aucun événement n'a été archivé
- Soit l'archivage a échoué

**Solution :**
- Allez dans Monday.com → Board → Menu → "View archived items"
- Vérifiez si des événements sont listés
- Si oui, le problème vient du SDK
- Si non, les événements n'ont jamais été archivés

---

### **Problème : Archivage échoue silencieusement**

**Console :**
```javascript
🗃️ Archivage automatique de TOUS les événements passés du board...
[Aucun autre log]
```

**Diagnostic :**
- La fonction `autoArchivePassedEvents` plante avant d'arriver au board
- Vérifier les permissions (lectureSeule?)

**Solution :**
- Ouvrez la console et cherchez les erreurs rouges
- Vérifiez que vous n'êtes pas en mode lecture seule
- Rechargez la page et réessayez

---

## ✅ Checklist de Vérification Finale

Avant de rapporter un bug, vérifiez :

- [ ] J'ai cliqué sur "Archiver tous les passés" et confirmé
- [ ] J'ai vu le message "✅ ARCHIVAGE TERMINÉ !"
- [ ] J'ai coché ☑ Afficher les archives
- [ ] J'ai vu le message "⟳ Chargement..." puis "✅ Mode archives activé"
- [ ] J'ai ouvert la console (F12) et vu `[getEvents] ✅ Including ARCHIVED events`
- [ ] J'ai vérifié le compteur dans la bannière bleue
- [ ] J'ai cherché l'événement archivé à sa date passée dans le calendrier
- [ ] J'ai vérifié Monday.com → "View archived items" pour confirmer l'archivage

---

## 🎯 Résumé

**Avant :**
- `getEvents()` ne récupérait que les actifs
- Toggle "Afficher archives" ne faisait qu'un filtre côté client
- Événements archivés dans Monday jamais visibles

**Après :**
- `getEvents({ includeArchived: true })` récupère actifs + archivés
- Toggle "Afficher archives" déclenche un rechargement avec archivés
- Événements archivés visibles sur leurs dates passées
- Messages visuels clairs pour chaque état
- Logs détaillés pour debug

---

**Les événements archivés dans Monday.com s'affichent maintenant correctement dans le calendrier ! 🎉**
