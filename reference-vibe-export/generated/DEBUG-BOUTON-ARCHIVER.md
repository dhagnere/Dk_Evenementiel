# 🔍 Debug : Bouton "Archiver X passés" n'apparaît pas

**Problème :** Le bouton d'archivage automatique n'est pas visible  
**Solution :** Diagnostic et correction étape par étape

---

## ✅ Amélioration : Bouton Toujours Visible

### **Avant (Problème)**

Le bouton n'apparaissait que si `archivedEventsCount > 0`, ce qui le rendait invisible si aucun événement passé n'était détecté.

```typescript
{archivedEventsCount > 0 && (
  <Button>Archiver {archivedEventsCount} passés</Button>
)}
```

**Problème :** Impossible de savoir pourquoi le bouton n'apparaît pas.

---

### **Après (Solution)**

Le bouton est **toujours visible** (sauf mode lecture seule) et affiche clairement son état :

```typescript
{!lectureSeule && (
  <Button disabled={archivedEventsCount === 0}>
    {archivedEventsCount === 0 
      ? "Aucun événement à archiver"
      : `Archiver ${archivedEventsCount} passés`}
  </Button>
)}
```

**Résultat :**
- ✅ Bouton toujours visible
- ✅ État clair (0 ou X événements)
- ✅ Désactivé si rien à archiver
- ✅ Tooltip explicatif

---

## 🎨 États du Bouton

### **État 1 : Aucun événement à archiver**

```
[⚪ Aucun événement à archiver] (grisé, désactivé)
```

**Tooltip :** "Aucun événement passé à archiver"

---

### **État 2 : X événements à archiver**

```
[🗃️ Archiver 150 passés] (actif, cliquable)
```

**Tooltip :** "Archiver définitivement les événements passés dans Monday.com"

---

### **État 3 : Archivage en cours**

```
[⟳ Archivage...] (désactivé, spinner animé)
```

---

### **État 4 : Mode lecture seule**

```
[Bouton masqué]
```

**Raison :** Vous n'avez pas les permissions d'archivage

---

## 🔍 Panneau de Debug Amélioré

Un nouveau panneau déroulant affiche maintenant des informations détaillées :

### **Titre**
```
🔍 Debug : Événements archivés (150) [▼ Cliquez pour voir les détails]
```

---

### **Contenu**

**Si 0 événement :**
```
┌──────────────────────────────────────────────┐
│ Date du jour : lundi 31 août 2026            │
│ Un événement est archivé si dateDeFin < aujourd'hui │
├──────────────────────────────────────────────┤
│ ✅ Aucun événement à archiver                │
│                                              │
│ Tous vos événements ont des dates de fin    │
│ futures ou sont encore en cours.             │
└──────────────────────────────────────────────┘
```

---

**Si X événements :**
```
┌──────────────────────────────────────────────┐
│ Date du jour : lundi 31 août 2026            │
│ Un événement est archivé si dateDeFin < aujourd'hui │
├──────────────────────────────────────────────┤
│ 150 événements à archiver :                  │
│                                              │
│ Carnaval                                     │
│ 15/03/2026 → 17/03/2026 | Centre-ville      │
│ (fin passée : 17/03/2026)                    │
│                                              │
│ Marché de Noël                               │
│ 01/12/2025 → 24/12/2025 | Place Jean Bart   │
│ (fin passée : 24/12/2025)                    │
│                                              │
│ ... et 148 autres événements                 │
└──────────────────────────────────────────────┘
```

---

## 📊 Logs Console (F12)

### **Nouveaux logs de debug**

```javascript
[Debug] archivedEventsCount: 150
[Debug] archivedEvents array: [
  { name: "Carnaval", dateDeFin: "2026-03-17T00:00:00.000Z", ... },
  { name: "Marché de Noël", dateDeFin: "2025-12-24T00:00:00.000Z", ... },
  ...
]

[Filter] Starting with 500 total events
[Filter] After deduplication: 485 unique events
[Filter] After cancelled filter: 485 → 480
[Filter] Split into: 330 active events + 150 archived events
```

---

## 🧪 Test de Diagnostic

### **Étape 1 : Vérifier que le bouton s'affiche**

1. Rechargez la page
2. Cherchez le bouton dans la barre de filtres
3. **Voyez-vous le bouton ?**
   - ✅ **Oui** → Passez à l'étape 2
   - ❌ **Non** → Vous êtes en mode lecture seule (voir étape 4)

---

### **Étape 2 : Vérifier l'état du bouton**

**Le bouton affiche quoi ?**

**Option A :** `⚪ Aucun événement à archiver` (grisé)
- **Signification :** Aucun événement avec date de fin passée
- **Action :** Normal, rien à faire
- **Vérification :** Ouvrez le panneau debug pour confirmer

**Option B :** `🗃️ Archiver X passés` (actif)
- **Signification :** X événements détectés avec date de fin passée
- **Action :** Cliquez pour les archiver
- **Vérification :** Ouvrez le panneau debug pour voir la liste

---

### **Étape 3 : Vérifier le panneau de debug**

1. Cherchez **"🔍 Debug : Événements archivés (X)"**
2. Cliquez pour dérouler
3. **Que voyez-vous ?**

**Si count = 0 :**
```
✅ Aucun événement à archiver
Tous vos événements ont des dates de fin futures ou sont encore en cours.
```
**→ C'est normal, vos événements ne sont pas passés**

**Si count > 0 :**
```
150 événements à archiver :
[Liste des événements avec dates de fin passées]
```
**→ Cliquez sur le bouton "Archiver X passés"**

---

### **Étape 4 : Vérifier le mode lecture seule**

**Le bouton n'apparaît PAS du tout ?**

Vous êtes probablement en **mode lecture seule** (consultant).

**Vérification :**
- Cherchez un message en haut de la page : "Mode consultation"
- Vérifiez que votre compte a le rôle "Administrateur"

**Solution :**
- Connectez-vous avec un compte administrateur
- Ou demandez à un administrateur d'archiver les événements

---

## 🎯 Cas d'Usage

### **Cas 1 : Tous les Événements Sont Futurs**

**Symptômes :**
- Bouton affiché : `⚪ Aucun événement à archiver`
- Panneau debug : "✅ Aucun événement à archiver"
- Console : `[Debug] archivedEventsCount: 0`

**Explication :**
Tous vos événements ont des dates de fin >= 31/08/2026 (aujourd'hui).

**Solution :**
C'est normal ! Revenez dans quelques jours quand des dates seront passées.

---

### **Cas 2 : Événements Détectés Mais Bouton Désactivé**

**Symptômes :**
- Bouton affiché : `⚪ Aucun événement à archiver` (grisé)
- Panneau debug : "150 événements à archiver"
- Console : `[Debug] archivedEventsCount: 150`

**Explication :**
Bug d'affichage — le count est correct dans le panneau mais pas sur le bouton.

**Solution :**
Rechargez la page (Ctrl+R). Si le problème persiste, ouvrez un ticket.

---

### **Cas 3 : Événements en Cours Non Archivés**

**Symptômes :**
- Événement DUCASSE : 29/08 → 06/09
- Date du jour : 31/08
- L'événement n'est PAS dans la liste à archiver

**Explication :**
C'est **normal** ! L'événement est encore en cours car `dateDeFin (06/09) > aujourd'hui (31/08)`.

**Solution :**
Revenez le 7 septembre, l'événement apparaîtra dans la liste.

---

## 📝 Règle d'Archivage

```javascript
function estArchive(event) {
  if (!event.dateDeFin) return false;
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  const dateFin = new Date(event.dateDeFin);
  dateFin.setHours(0, 0, 0, 0);
  
  return dateFin < aujourdhui;
}
```

**En clair :**
- L'événement DOIT avoir une `dateDeFin`
- La `dateDeFin` DOIT être strictement antérieure à aujourd'hui
- La comparaison se fait à minuit (0h00)

**Exemples (aujourd'hui = 31/08/2026) :**

| Événement | Date Fin | Archivé ? |
|-----------|----------|-----------|
| Carnaval | 17/03/2026 | ✅ Oui (17/03 < 31/08) |
| DUCASSE | 06/09/2026 | ❌ Non (06/09 > 31/08) |
| Fête Musique | 21/06/2027 | ❌ Non (21/06 > 31/08) |
| Sans date fin | null | ❌ Non (pas de date) |

---

## ✅ Checklist de Vérification

Avant de rapporter un bug, vérifiez :

- [ ] Le bouton s'affiche (même grisé) dans la barre de filtres
- [ ] Je ne suis PAS en mode lecture seule
- [ ] J'ai ouvert le panneau "🔍 Debug : Événements archivés"
- [ ] Le panneau affiche "0" ou "X événements à archiver"
- [ ] J'ai ouvert la console (F12) et vu les logs `[Debug]`
- [ ] Le `archivedEventsCount` dans la console correspond au panneau
- [ ] J'ai vérifié la date du jour dans le panneau debug
- [ ] J'ai vérifié que mes événements ont bien des dates de fin passées

---

## 🚀 Test Final

**Pour vérifier que tout fonctionne :**

1. Créez un événement de test avec date de fin = hier :
   ```
   Nom : Test Archivage
   Date début : 29/08/2026
   Date fin : 30/08/2026  ← HIER
   ```

2. Rafraîchissez la page

3. Vérifications :
   - ✅ Bouton affiche : `🗃️ Archiver 1 passés`
   - ✅ Panneau debug affiche : "1 événement à archiver"
   - ✅ Console affiche : `[Debug] archivedEventsCount: 1`

4. Cliquez sur "Archiver 1 passés"

5. Confirmez l'archivage

6. Vérifications après archivage :
   - ✅ Message de succès : "1 événement archivé"
   - ✅ Bouton affiche : `⚪ Aucun événement à archiver`
   - ✅ Panneau debug affiche : "0"
   - ✅ Console affiche : `[Debug] archivedEventsCount: 0`

---

**Le bouton est maintenant toujours visible et son état est clair ! 🎉**
