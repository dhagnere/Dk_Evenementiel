# 🔍 Debug : Événements Archivés Non Affichés

**Problème :** Les événements archivés ne s'affichent pas même quand le toggle "Afficher les archives" est activé.

---

## 📊 Nouveaux Logs de Debug

### Dans la Console (F12)

Vous verrez maintenant des logs détaillés à chaque changement :

```
[Filter] Starting with 500 total events, afficherArchives: true
[Filter] After deduplication: 485 unique events
[Filter] After cancelled filter: 485 → 480
[Filter] Found 150 archived events (dateDeFin < today)
[Filter] ✅ Archive filter DISABLED: keeping all 150 archived events (afficherArchives: true, searchTerm: "")
[Filter] Final result: 480 events to display
```

**OU si le toggle est désactivé :**

```
[Filter] Starting with 500 total events, afficherArchives: false
[Filter] After deduplication: 485 unique events
[Filter] After cancelled filter: 485 → 480
[Filter] Found 150 archived events (dateDeFin < today)
[Filter] ❌ Archive filter ACTIVE: 480 → 330 (removed 150 archived events)
[Filter] Final result: 330 events to display
```

---

## 🎨 Indicateur Visuel

Le toggle affiche maintenant le **nombre d'événements masqués** :

```
☐ Afficher les archives (150 masqués)
```

Cela vous permet de voir immédiatement :
- **Si des événements archivés existent** dans la base
- **Combien sont masqués** quand le toggle est désactivé

---

## 🧪 Test de Diagnostic

### Étape 1 : Ouvrir la Console

1. Appuyez sur **F12**
2. Allez dans l'onglet **Console**

---

### Étape 2 : Activer le Toggle

1. Cliquez sur **☐ Afficher les archives**
2. Regardez les logs :

```
[Toggle] Afficher archives: true
[Filter] Starting with 500 total events, afficherArchives: true
[Filter] ✅ Archive filter DISABLED: keeping all 150 archived events
```

**Si vous voyez :**
- `afficherArchives: true` → ✅ Le state change correctement
- `keeping all 150 archived events` → ✅ Le filtrage est désactivé
- `Final result: 480 events` → ✅ Les événements sont disponibles

---

### Étape 3 : Vérifier le Calendrier

Les événements archivés devraient maintenant apparaître dans le calendrier.

**Si vous ne les voyez toujours pas :**

1. Vérifiez les dates affichées dans le calendrier
2. Naviguez vers les mois passés (janvier, février, etc.)
3. Les événements archivés ont leur `dateDeFin < aujourd'hui`

---

## 🔍 Cas Possibles

### Cas 1 : Aucun Événement Archivé

**Logs :**
```
[Filter] Found 0 archived events (dateDeFin < today)
```

**Explication :** Tous vos événements ont des dates futures ou ne sont pas encore terminés.

**Indicateur :** `(0 masqués)` à côté du toggle

---

### Cas 2 : Événements Archivés Présents Mais Pas Affichés

**Logs :**
```
[Filter] Found 150 archived events
[Filter] ✅ Archive filter DISABLED
[Filter] Final result: 480 events to display
```

**Mais vous ne les voyez pas dans le calendrier.**

**Causes possibles :**

1. **Vous regardez le mauvais mois**
   - Les événements archivés ont des dates passées (janvier, février, etc.)
   - Naviguez vers les mois précédents dans le calendrier

2. **Les événements sont dans des groupes masqués**
   - Vérifiez les filtres (Quartier, Statut, Nature)
   - Réinitialisez tous les filtres (bouton ↺)

3. **Les événements sont masqués par un autre filtre**
   - Filtre de recherche actif
   - Filtre de quartier/nature actif

---

### Cas 3 : Le Toggle Ne Change Pas le State

**Logs :**
```
(Aucun log [Toggle] quand vous cliquez)
```

**Explication :** Le composant Checkbox ne déclenche pas le handler.

**Solution :**
- Rechargez la page (Ctrl+R)
- Vérifiez que vous n'êtes pas en mode lecture seule

---

## 📅 Définition d'un Événement Archivé

Un événement est considéré **archivé** si :

```
dateDeFin < aujourd'hui
```

**Exemples (aujourd'hui = 31/08/2026) :**

| Événement | Date Début | Date Fin | Archivé ? |
|-----------|------------|----------|-----------|
| Marché Noël | 01/12/2025 | 24/12/2025 | ✅ Oui |
| DUCASSE | 29/08/2026 | 06/09/2026 | ❌ Non (date fin future) |
| Carnaval | 15/03/2026 | 17/03/2026 | ✅ Oui |
| Fête Musique | 21/06/2027 | 21/06/2027 | ❌ Non (futur) |

**Note importante :**
- Un événement en cours (date début passée, date fin future) **N'EST PAS archivé**
- Seuls les événements **complètement terminés** sont archivés

---

## 🛠️ Fonction `estArchive`

**Code actuel :**

```typescript
export function estArchive(event: Event): boolean {
  if (!event.dateDeFin) return false;
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  const dateFin = new Date(event.dateDeFin);
  dateFin.setHours(0, 0, 0, 0);
  
  return dateFin < aujourdhui;
}
```

**Logique :**
1. Si pas de date de fin → pas archivé
2. Comparer `dateDeFin` (à minuit) avec `aujourdhui` (à minuit)
3. Si `dateDeFin < aujourdhui` → archivé

**Avantages :**
- ✅ Les événements en cours restent visibles
- ✅ Seuls les événements terminés sont archivés
- ✅ La comparaison se fait à minuit (pas d'effet d'heure)

---

## 🎯 Checklist de Vérification

Avant de signaler un bug, vérifiez :

- [ ] La console est ouverte (F12)
- [ ] Vous voyez les logs `[Filter]` et `[Toggle]`
- [ ] Le toggle indique `(X masqués)` avec X > 0
- [ ] Vous avez cliqué sur le toggle et vu `afficherArchives: true`
- [ ] Vous avez navigué vers les mois passés dans le calendrier
- [ ] Tous les autres filtres sont réinitialisés (bouton ↺)
- [ ] Vous n'êtes pas en mode lecture seule

---

## 📸 Exemple de Logs Attendus

**Scénario : Import d'un fichier avec dates depuis janvier 2026**

**Date actuelle : 31/08/2026**

**Logs attendus :**

```
[Filter] Starting with 528 total events, afficherArchives: false
[Filter] After deduplication: 500 unique events
[Filter] After cancelled filter: 500 → 485 (15 annulés)
[Filter] Found 250 archived events (dateDeFin < today)
[Filter] ❌ Archive filter ACTIVE: 485 → 235 (removed 250 archived events)
[Filter] Final result: 235 events to display
```

**Ensuite, activation du toggle :**

```
[Toggle] Afficher archives: true
[Filter] Starting with 528 total events, afficherArchives: true
[Filter] After deduplication: 500 unique events
[Filter] After cancelled filter: 500 → 485
[Filter] Found 250 archived events (dateDeFin < today)
[Filter] ✅ Archive filter DISABLED: keeping all 250 archived events (afficherArchives: true, searchTerm: "")
[Filter] Final result: 485 events to display
```

**Résultat :**
- 235 → 485 événements (+250 archives affichés)
- Le calendrier affiche maintenant tous les mois depuis janvier

---

## 🚀 Prochaines Étapes

1. **Activez le toggle** et partagez les logs
2. **Naviguez vers janvier 2026** dans le calendrier
3. **Regardez l'indicateur** `(X masqués)`

**Les logs vont nous dire exactement ce qui se passe ! 🔍**
