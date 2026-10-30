# ✅ Filtres Persistants avec localStorage

## 🎯 Problème Résolu

**Avant :** Après validation d'un événement (ou F5), les filtres (recherche "football", quartier, statut, nature) étaient réinitialisés et vous reveniez à la liste complète.

**Maintenant :** Les filtres sont **automatiquement sauvegardés** dans le navigateur et **restaurés** au rechargement de la page.

---

## 🔧 Modifications Appliquées

### **1. Initialisation depuis localStorage**

Chaque filtre lit sa valeur sauvegardée au démarrage :

```typescript
const [searchTerm, setSearchTerm] = useState(() => {
  return localStorage.getItem('eventFilter_searchTerm') || '';
});

const [filterQuartier, setFilterQuartier] = useState(() => {
  return localStorage.getItem('eventFilter_quartier') || 'ALL';
});

// Idem pour filterStatut, filterNature, afficherArchives
```

### **2. Sauvegarde automatique à chaque changement**

```typescript
useEffect(() => {
  localStorage.setItem('eventFilter_searchTerm', searchTerm);
}, [searchTerm]);

// Un useEffect par filtre
```

### **3. Bouton "Réinitialiser les filtres"**

Un nouveau bouton apparaît automatiquement dès qu'un filtre est actif :

```typescript
<Button onClick={() => {
  setSearchTerm('');
  setFilterQuartier('ALL');
  setFilterStatut('ALL');
  setFilterNature('ALL');
}}>
  Réinitialiser les filtres
</Button>
```

---

## ✅ Comportement Actuel

### **Scénario 1 : Filtrage et validation**

1. Tapez "football" dans la recherche
2. La liste affiche uniquement les événements contenant "football"
3. Cliquez sur un événement → cochez une validation
4. **Résultat : la liste reste filtrée sur "football"** ✅

### **Scénario 2 : Rafraîchissement de la page (F5)**

1. Appliquez un filtre (recherche "football", quartier "Malo-les-Bains")
2. Appuyez sur **F5** (rafraîchir la page)
3. **Résultat : les filtres sont restaurés automatiquement** ✅
4. Vous voyez toujours les événements "football" de "Malo-les-Bains"

### **Scénario 3 : Fermeture et réouverture du navigateur**

1. Filtrez par "Carnaval"
2. Fermez complètement l'onglet
3. Rouvrez l'app le lendemain
4. **Résultat : le filtre "Carnaval" est toujours actif** ✅

### **Scénario 4 : Réinitialisation manuelle**

1. Filtres actifs : "football" + "Malo-les-Bains" + "Validée"
2. Un bouton "Réinitialiser les filtres" apparaît (avec icône ×)
3. Cliquez dessus
4. **Résultat : tous les filtres reviennent à "Tous" / vide** ✅

---

## 🎨 Interface Utilisateur

### **Bouton "Réinitialiser les filtres"**

- **Apparaît uniquement** si au moins un filtre est actif
- **Position :** À droite des dropdowns de filtre
- **Style :** Ghost button (discret)
- **Icône :** × (croix)
- **Action :** Réinitialise TOUS les filtres d'un coup

### **Indicateur visuel**

Quand un filtre est actif, le compteur d'événements reflète le nombre filtré :

```
🔍 Recherche : "football"
📊 Résultats : 15 événements (au lieu de 1200)
```

---

## 📦 Données Sauvegardées

| Clé localStorage              | Valeur                         | Description                      |
|-------------------------------|--------------------------------|----------------------------------|
| `eventFilter_searchTerm`      | "football"                     | Texte de recherche               |
| `eventFilter_quartier`        | "Malo-les-Bains" ou "ALL"      | Filtre quartier                  |
| `eventFilter_statut`          | "Validée" ou "ALL"             | Filtre statut                    |
| `eventFilter_nature`          | "Sport" ou "ALL"               | Filtre nature d'événement        |
| `eventFilter_afficherArchives`| "true" ou "false"              | Toggle afficher archives         |

---

## 🔍 Debug & Vérification

### **Inspecter le localStorage**

1. F12 → Console
2. Tapez :
   ```javascript
   localStorage.getItem('eventFilter_searchTerm')
   ```
3. Vous devriez voir la valeur actuelle du filtre

### **Effacer manuellement les filtres sauvegardés**

Si vous voulez repartir de zéro :

```javascript
localStorage.removeItem('eventFilter_searchTerm');
localStorage.removeItem('eventFilter_quartier');
localStorage.removeItem('eventFilter_statut');
localStorage.removeItem('eventFilter_nature');
localStorage.removeItem('eventFilter_afficherArchives');
```

Ou tout effacer d'un coup :

```javascript
localStorage.clear();
```

### **Vérifier que ça fonctionne**

**Test 1 :**
1. Tapez "Carnaval" dans la recherche
2. F5 (rafraîchir)
3. Vérifiez que "Carnaval" est toujours dans la barre de recherche ✅

**Test 2 :**
1. Sélectionnez quartier "Dunkerque - Centre"
2. Fermez l'onglet
3. Rouvrez l'app
4. Vérifiez que "Dunkerque - Centre" est toujours sélectionné ✅

**Test 3 :**
1. Activez 3 filtres différents
2. Cliquez sur "Réinitialiser les filtres"
3. Tous reviennent à "Tous" / vide ✅

---

## 🚀 Avantages

✅ **Persistance** : Les filtres survivent aux rafraîchissements  
✅ **UX fluide** : Plus besoin de re-filtrer après chaque action  
✅ **Cohérence** : Les filtres sont partagés entre les vues (calendrier, liste, stats)  
✅ **Réversible** : Bouton de réinitialisation accessible à tout moment  
✅ **Performant** : localStorage est instantané, pas de requête réseau  

---

## 📝 Notes Techniques

### **Pourquoi localStorage et pas URL ?**

- **localStorage** : invisible, ne pollue pas l'URL, persiste entre sessions
- **URL (query params)** : visible mais se perd en navigation, pas adapté ici

### **Compatibilité**

- Fonctionne sur tous les navigateurs modernes
- Les données restent **privées** (locales au navigateur de l'utilisateur)
- Chaque utilisateur a ses propres filtres sauvegardés

### **Limite**

- Les filtres sont liés au **domaine + navigateur**
- Si l'utilisateur change de navigateur → filtres réinitialisés
- Taille max localStorage : 5-10 MB (largement suffisant pour 5 strings)

---

## ✅ Résumé

**État actuel :**
✅ Filtres sauvegardés automatiquement  
✅ Restaurés au rechargement (F5, réouverture)  
✅ Bouton de réinitialisation visible si filtres actifs  
✅ Validation d'événement ne casse plus les filtres  

**Cas d'usage typique :**
1. Vous filtrez par "football"
2. Vous validez 10 événements un par un
3. **La liste reste filtrée sur "football" tout du long** ✅
4. Même après un F5, vous retrouvez vos "football" ✅
