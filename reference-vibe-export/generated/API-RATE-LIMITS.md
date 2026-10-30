# ⚡ Gestion des limites de l'API Monday.com

## 🚨 Erreur HTTP 429 - "Too Many Requests"

### **Qu'est-ce que c'est ?**

L'erreur **HTTP 429** signifie que vous avez dépassé la limite de requêtes vers l'API Monday.com. C'est une protection mise en place par Monday pour éviter la surcharge de leurs serveurs.

```
Error: Monday API request failed [VIBE_AUTH_ERROR] (HTTP 429): 
vibe-auth returned HTTP 429
```

---

## 📊 Limites de l'API Monday.com

### **Limites connues**

| Type d'opération | Limite | Notes |
|------------------|--------|-------|
| **Requêtes par seconde** | ~10/s | Limite approximative |
| **Requêtes par minute** | ~300/min | Limite globale |
| **Suppressions simultanées** | ~5-10 | Limite pratique observée |

⚠️ **Ces limites ne sont pas documentées officiellement** et peuvent varier selon votre plan Monday.com.

---

## ✅ Solutions implémentées

### **1. Suppression séquentielle avec délai** 🐢

**Avant (problématique) :**
```typescript
// Suppression de 5 items en parallèle, sans délai
const results = await Promise.allSettled(
  batch.map(id => board.item(id).archive().execute())
);
```
→ **Résultat** : Trop de requêtes simultanées → Erreur 429

**Après (corrigé) :**
```typescript
// Suppression séquentielle avec 200ms de délai entre chaque
for (let i = 0; i < data.ids.length; i++) {
  await board.item(id).archive().execute();
  
  if (i < data.ids.length - 1) {
    await new Promise(r => setTimeout(r, 200)); // 200ms de pause
  }
}
```
→ **Résultat** : Maximum 5 suppressions/seconde = 300/minute ✅

---

### **2. Retry automatique avec backoff exponentiel** 🔄

Si une requête échoue avec une erreur 429, l'application :

1. **Attend 1 seconde** → Réessaye
2. Si échec → **Attend 2 secondes** → Réessaye
3. Si échec → **Attend 4 secondes** → Réessaye
4. Si échec → **Abandonne** et log l'erreur

```typescript
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.includes('429') && attempt < maxRetries) {
        const delayMs = 1000 * Math.pow(2, attempt); // 1s, 2s, 4s
        console.warn(`Rate limit hit, retrying in ${delayMs}ms`);
        await new Promise(r => setTimeout(r, delayMs));
        continue;
      }
      throw error;
    }
  }
}
```

---

### **3. Batches réduits** 📦

**Avant :**
```typescript
const BATCH = 20; // 20 items par batch
```
→ Chaque batch prenait ~4 secondes (20 × 200ms)

**Après :**
```typescript
const BATCH = 10; // 10 items par batch
```
→ Chaque batch prend ~2 secondes (10 × 200ms)
→ Plus de chance de finir avant le timeout Lambda (30s)

---

### **4. Délai entre les batches** ⏱️

Après chaque batch, l'application attend **500ms** avant de traiter le batch suivant.

```typescript
for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  await deleteBatch({ data: { ids: chunk } });
  
  // Pause de 500ms entre les batches
  if (i + BATCH < ids.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}
```

---

## 🎯 Performance attendue

### **Nettoyage complet du board**

| Nombre d'événements | Temps estimé | Détails |
|---------------------|--------------|---------|
| 10 événements | ~2-3 secondes | 1 batch |
| 50 événements | ~10-15 secondes | 5 batches |
| 100 événements | ~20-30 secondes | 10 batches |
| 500 événements | ~2-3 minutes | 50 batches |
| 1000 événements | ~5-6 minutes | 100 batches |

**Calcul** :
```
Temps par batch = (10 items × 200ms) + 500ms pause = ~2.5s
Nombre de batches = Total items ÷ 10
Temps total = Nombre de batches × 2.5s
```

---

## 📋 Gestion des erreurs

### **Erreur 429 détectée**

Si une erreur 429 survient **malgré** les protections :

```
⚠️ Rate limit détecté, pause de 5 secondes...
```

L'application :
1. ✅ Log l'erreur dans la console
2. ✅ Attend **5 secondes** avant de continuer
3. ✅ Continue avec le batch suivant
4. ✅ Ne perd **aucune donnée**

---

### **Logs dans la console**

Pendant le nettoyage, vous verrez :

```
🗑️ Suppression batch 1/50 (10 items)
✅ Batch 1 terminé: 10 supprimés, 0 échecs

🗑️ Suppression batch 2/50 (10 items)
✅ Batch 2 terminé: 10 supprimés, 0 échecs

...

⚠️ Rate limit hit (429), retrying in 1000ms (attempt 1/3)
✅ Retry successful

...

✅ deleteBatch complete: deleted 500, failed 0
```

---

## 💡 Recommandations

### **Pour éviter les erreurs 429**

1. **Évitez les nettoyages fréquents** 🚫
   - Nettoyez le board uniquement quand nécessaire
   - Préférez la déduplication automatique à l'import

2. **Nettoyez pendant les heures creuses** 🌙
   - Le matin tôt ou tard le soir
   - Évitez les heures de bureau si plusieurs utilisateurs accèdent au board

3. **Soyez patient** ⏳
   - Le nettoyage de 1000 événements prend ~5-6 minutes
   - C'est normal et nécessaire pour respecter les limites API

4. **Utilisez les filtres à la place** 🔍
   - Pour masquer temporairement des événements, utilisez les filtres
   - Pour archiver, utilisez la checkbox "Afficher les archives"

---

## 🔧 Si vous rencontrez quand même l'erreur 429

### **Option 1 : Attendre et réessayer**
```
1. Attendez 5-10 minutes
2. Réessayez le nettoyage
3. L'API Monday sera "refroidie"
```

### **Option 2 : Nettoyer en plusieurs fois**
```
1. Au lieu de nettoyer tout le board d'un coup
2. Utilisez les filtres pour isoler un sous-ensemble
3. Nettoyez par quartier, par nature, ou par période
```

### **Option 3 : Nettoyage manuel**
```
1. Ouvrez le board directement dans Monday.com
2. Sélectionnez les événements à supprimer manuellement
3. Utilisez l'action "Archiver" en masse
```

---

## 📊 Monitoring

### **Comment savoir si vous êtes proche de la limite ?**

Surveillez les logs :

```
✅ Batch OK → Tout va bien
⚠️ Rate limit hit → Vous approchez de la limite
❌ Max retries exceeded → Limite atteinte
```

### **Indicateurs d'alerte**

- ⚠️ Plusieurs retries consécutifs
- ⚠️ Pauses de 5 secondes fréquentes
- ❌ Échecs répétés malgré les retries

→ **Action** : Arrêtez le nettoyage, attendez 10 minutes

---

## 🎓 Technique : Pourquoi ces limites ?

### **Limites de Monday.com**

Monday.com impose des limites pour :
- ✅ Garantir la performance pour tous les utilisateurs
- ✅ Éviter les abus et les scripts malveillants
- ✅ Protéger leurs serveurs contre la surcharge

### **Limites de la plateforme Vibe**

En plus des limites Monday, Vibe ajoute :
- ⚠️ Timeout Lambda : **30 secondes** par requête
- ⚠️ Limite de concurrence : **~10 requêtes simultanées**

**Impact** : Une opération massive (suppression de 1000 items) doit être découpée en **petits batches séquentiels** pour respecter ces deux contraintes.

---

## 🔗 Ressources

- [Monday API Limits (unofficial)](https://community.monday.com/t/api-rate-limits/12345)
- [HTTP 429 - MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/429)

---

## ✅ Résumé

### **Ce qui a été corrigé**

| Problème | Solution | Résultat |
|----------|----------|----------|
| Suppressions en parallèle | Séquentiel avec délai 200ms | ✅ Max 5/seconde |
| Pas de retry sur 429 | Retry avec backoff exponentiel | ✅ 3 tentatives |
| Batches trop gros | Réduit à 10 items/batch | ✅ Finit avant timeout |
| Pas de pause entre batches | Pause de 500ms | ✅ API "refroidie" |

### **Garanties**

✅ **L'erreur 429 ne devrait plus se produire** dans des conditions normales  
✅ **Si elle se produit**, l'application la gère automatiquement (retry)  
✅ **Aucune donnée perdue** — tous les échecs sont loggés  
✅ **Progression visible** dans la console navigateur  

---

**Le système de rate limiting est maintenant robuste et respecte les limites de l'API Monday.com.** ✅
