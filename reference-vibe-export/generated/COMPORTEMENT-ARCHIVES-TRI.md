# Comportement Archives et Tri par Défaut

**Version** : `5a8f4c2b-9e3a-4d7e-b5f8-3c1e2a4b6d8e`  
**Date** : 2026-08-16

---

## 🎯 Modifications Appliquées

### **1. Archives Masquées par Défaut**

**Comportement antérieur** :
- ❌ Checkbox "Afficher les archives" **cochée** au chargement
- ❌ Tous les événements passés visibles immédiatement
- ❌ Liste encombrée d'événements terminés

**Nouveau comportement** :
- ✅ Checkbox "Afficher les archives" **décochée** au chargement
- ✅ Seuls les événements **actifs et futurs** affichés
- ✅ Liste propre et concentrée sur l'essentiel

**Vues affectées** :
- **Vue Calendrier** (`index.tsx`)
- **Vue Liste** (`liste.tsx`)

---

### **2. Tri par Date Décroissant (Plus Récent en Premier)**

**Comportement antérieur** :
- ❌ Tri par "Name" (ID alphabétique) : EVT-2026-0001, EVT-2026-0002...
- ❌ Direction "desc" mais sur l'ID, pas la date
- ❌ Événements mélangés chronologiquement

**Nouveau comportement** :
- ✅ Tri par **"Date de début"** par défaut
- ✅ Direction **décroissante** (plus récent en haut)
- ✅ Événements organisés chronologiquement (futur → passé)

**Vue affectée** :
- **Vue Liste** (`liste.tsx`)

---

## 📋 Fichiers Modifiés

### **1. src/generated/routes/_app/index.tsx** (Vue Calendrier)

**Ligne 124** :
```typescript
// Avant
const [afficherArchives, setAfficherArchives] = useState(true);

// Après
const [afficherArchives, setAfficherArchives] = useState(false);
```

**Impact** :
- Archives masquées au chargement
- L'utilisateur doit cocher manuellement pour les voir

---

### **2. src/generated/routes/_app/liste.tsx** (Vue Liste)

**Ligne 60** :
```typescript
// Avant
const [sortField, setSortField] = useState<'nom' | 'dateDeDbut' | 'statut' | 'name'>('name');

// Après
const [sortField, setSortField] = useState<'nom' | 'dateDeDbut' | 'statut' | 'name'>('dateDeDbut');
```

**Impact** :
- Tri par date de début au lieu de l'ID
- Plus logique pour un calendrier d'événements

---

**Ligne 63** :
```typescript
// Avant
const [afficherArchives, setAfficherArchives] = useState(true);

// Après
const [afficherArchives, setAfficherArchives] = useState(false);
```

**Impact** :
- Archives masquées au chargement
- Cohérence avec la vue Calendrier

---

## 🎨 Expérience Utilisateur

### **Au Premier Chargement**

**Vue Calendrier** :
1. Affiche uniquement les événements **non archivés**
2. L'utilisateur voit le calendrier **actif et futur**
3. Checkbox "Afficher les archives" disponible si besoin

**Vue Liste** :
1. Affiche uniquement les événements **non archivés**
2. Triés par **date de début décroissante** (plus récent en haut)
3. Événements futurs apparaissent en premier
4. Checkbox "Afficher les archives" disponible si besoin

---

### **Définition "Archive"**

Un événement est considéré comme **archivé** si :
```typescript
// Fonction estArchive() dans utils/conflicts.ts
dateDeFin < Date actuelle
```

**Exemple** :
- Aujourd'hui : 16/08/2026
- Événement terminé le 10/08/2026 → **Archivé**
- Événement terminé le 20/08/2026 → **Non archivé** (futur)

---

## 🔄 Workflow Utilisateur

### **Scénario 1 : Planification d'Événements Futurs**

**Besoin** : Voir uniquement les événements à venir

**Action** :
1. Ouvrir Vue Calendrier ou Vue Liste
2. **Aucune action nécessaire** — archives masquées par défaut
3. Focus immédiat sur le futur

**Résultat** :
- ✅ Calendrier épuré
- ✅ Planification facilitée
- ✅ Pas de distraction avec le passé

---

### **Scénario 2 : Consultation d'Événements Passés**

**Besoin** : Vérifier un événement terminé

**Action** :
1. Ouvrir Vue Calendrier ou Vue Liste
2. **Cocher** "Afficher les archives"
3. Les événements passés apparaissent

**Résultat** :
- ✅ Accès rapide à l'historique
- ✅ Option volontaire (pas imposée)
- ✅ Retour facile au mode "actif" en décochant

---

### **Scénario 3 : Tri par Date dans la Liste**

**Besoin** : Voir les événements dans l'ordre chronologique

**Action** :
1. Ouvrir **Vue Liste**
2. **Aucune action nécessaire** — tri par date par défaut
3. Les événements sont triés du plus récent au plus ancien

**Résultat** :
- ✅ Événements futurs en haut de liste
- ✅ Événements passés en bas (si archives affichées)
- ✅ Navigation chronologique intuitive

---

## 🧪 Exemples Concrets

### **Calendrier au Chargement (16/08/2026)**

**Archives masquées** (défaut) :
```
Événements affichés :
- EVT-2026-0500 : Concert 20/08/2026 ✅
- EVT-2026-0450 : Marché 18/08/2026 ✅
- EVT-2026-0400 : Spectacle 17/08/2026 ✅

Événements masqués (archivés) :
- EVT-2026-0100 : Festival 10/08/2026 ❌
- EVT-2026-0050 : Exposition 05/08/2026 ❌
```

**Archives affichées** (après clic sur checkbox) :
```
Tous les événements visibles :
- EVT-2026-0500 : Concert 20/08/2026
- EVT-2026-0450 : Marché 18/08/2026
- EVT-2026-0400 : Spectacle 17/08/2026
- EVT-2026-0100 : Festival 10/08/2026 (archivé)
- EVT-2026-0050 : Exposition 05/08/2026 (archivé)
```

---

### **Liste au Chargement (16/08/2026)**

**Tri par date décroissante** + **Archives masquées** :
```
┌─────────────────────────────────────────┐
│ Nom                 | Date de début     │
├─────────────────────────────────────────┤
│ Concert             | 20/08/2026        │ ← Plus récent (futur)
│ Marché              | 18/08/2026        │
│ Spectacle           | 17/08/2026        │
└─────────────────────────────────────────┘

(10 événements archivés masqués)
```

**Après activation des archives** :
```
┌─────────────────────────────────────────┐
│ Nom                 | Date de début     │
├─────────────────────────────────────────┤
│ Concert             | 20/08/2026        │ ← Futur
│ Marché              | 18/08/2026        │
│ Spectacle           | 17/08/2026        │
│ ─────────────────────────────────────── │
│ Festival            | 10/08/2026        │ ← Archivé
│ Exposition          | 05/08/2026        │
│ Conférence          | 01/08/2026        │ ← Plus ancien
└─────────────────────────────────────────┘
```

---

## ✅ Avantages

### **1. Concentration sur l'Essentiel**

✅ **Futur priorisé** : Les utilisateurs voient d'abord ce qui est à venir  
✅ **Moins de bruit** : Pas de pollution visuelle avec le passé  
✅ **Planification facilitée** : Focus sur les événements actifs  

---

### **2. Tri Logique par Défaut**

✅ **Chronologique** : Ordre naturel pour un calendrier  
✅ **Plus récent en premier** : Événements futurs immédiatement visibles  
✅ **Intuitif** : Correspond aux attentes des utilisateurs  

---

### **3. Flexibilité Préservée**

✅ **Accès rapide aux archives** : Une simple checkbox  
✅ **Tri personnalisable** : Clic sur les en-têtes de colonnes  
✅ **Pas de perte de données** : Tout reste accessible  

---

## 🔄 Réversibilité

### **Pour Afficher les Archives par Défaut**

**Fichiers** : `index.tsx` et `liste.tsx`

**Modification** :
```typescript
// Ligne 124 (index.tsx) et ligne 63 (liste.tsx)
const [afficherArchives, setAfficherArchives] = useState(true);
```

---

### **Pour Trier par ID par Défaut**

**Fichier** : `liste.tsx`

**Modification** :
```typescript
// Ligne 60
const [sortField, setSortField] = useState<'nom' | 'dateDeDbut' | 'statut' | 'name'>('name');
```

---

## 📊 Impact

### **Performance**

✅ **Moins d'événements affichés** : Rendu initial plus rapide  
✅ **Pagination efficace** : Moins de lignes à paginer  
✅ **Calculs réduits** : Filtrage automatique  

---

### **UX**

✅ **Clarté visuelle** : Interface épurée  
✅ **Navigation intuitive** : Ordre chronologique  
✅ **Contrôle utilisateur** : Choix d'afficher les archives  

---

### **Données**

✅ **Aucune perte** : Tous les événements restent dans le board  
✅ **Accessible** : Archives disponibles via checkbox  
✅ **Cohérent** : Même comportement dans 2 vues  

---

## 🎉 Résumé

**Changements** :
1. ✅ Archives **masquées** par défaut (Calendrier + Liste)
2. ✅ Tri par **date décroissante** par défaut (Liste)

**Bénéfices** :
- 🎯 Focus sur le futur
- 📅 Ordre chronologique logique
- 🧹 Interface épurée
- 🔄 Archives accessibles manuellement

**Impact** :
- ✅ Vue Calendrier : Archives masquées
- ✅ Vue Liste : Archives masquées + Tri date desc
- ✅ Vue Conflits : Aucun changement

**Utilisateurs** :
- 👍 Planificateurs : Vue immédiate sur le futur
- 👍 Consultants : Interface propre sans le passé
- 👍 Administrateurs : Contrôle total via checkbox

---

**Déployé avec succès !** 🚀
