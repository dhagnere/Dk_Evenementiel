# 🔄 Archivage Automatique vs Affichage des Archives

**Date :** 31 août 2026  
**Clarification importante :** Différence entre "Afficher" et "Archiver"

---

## 🎯 Deux Concepts Différents

### **1. "Afficher les archives" (Toggle)**
- ☑ Checkbox dans l'interface
- **Effet :** Montre/cache les événements passés dans CE calendrier
- **Action :** Côté client uniquement (filtrage d'affichage)
- **Réversible :** OUI (cochez/décochez à volonté)
- **Board Monday.com :** AUCUN changement

### **2. "Archiver X passés" (Bouton)**
- 🗃️ Bouton orange avec nombre
- **Effet :** Archive définitivement les événements dans Monday.com
- **Action :** Appel API Monday.com (modification du board)
- **Réversible :** NON (action définitive)
- **Board Monday.com :** Les items sont archivés (masqués du board)

---

## 📊 Tableau Comparatif

| Critère | Toggle "Afficher" | Bouton "Archiver" |
|---------|-------------------|-------------------|
| **Interface** | ☑ Checkbox | 🗃️ Bouton |
| **Action** | Filtrage visuel | Archivage Monday.com |
| **Board Monday** | Pas touché | Items archivés |
| **Réversible** | ✅ Oui | ❌ Non |
| **Temps réel** | Instantané | Quelques secondes |
| **Permission** | Tous | Admin seulement |

---

## 🔄 Workflow Recommandé

### **Cas 1 : Consulter les Événements Passés**

**Objectif :** Voir les événements archivés sans modifier le board

**Action :**
1. ✅ Cochez le toggle **"Afficher les archives"**
2. Les événements passés apparaissent dans le calendrier
3. Décochez pour les masquer à nouveau

**Résultat :** Aucun changement dans Monday.com

---

### **Cas 2 : Nettoyer le Board Périodiquement**

**Objectif :** Archiver définitivement les événements passés dans Monday.com

**Action :**
1. Vérifiez le nombre d'événements à archiver : `(X masqués)`
2. Cliquez sur le bouton **"🗃️ Archiver X passés"**
3. Confirmez l'action (dialogue de confirmation)
4. Attendez quelques secondes (archivage en cours)
5. Le calendrier se rafraîchit automatiquement

**Résultat :** Les X événements sont archivés dans Monday.com

---

## 🎨 Interface Avant/Après

### **Avant Archivage (Board plein)**

```
Filtres :
☐ Afficher les archives (150 masqués)
[🗃️ Archiver 150 passés]

Board Monday.com : 480 items actifs
```

---

### **Après Archivage (Board nettoyé)**

```
Filtres :
☐ Afficher les archives (0 masqués)
[Bouton masqué - aucun événement à archiver]

Board Monday.com : 330 items actifs + 150 items archivés
```

---

## 🔍 Logs Console

### **Toggle "Afficher" activé**

```javascript
[Toggle] Afficher archives: true
[Filter] ✅ Displaying: 330 active + 150 archived = 480 total
```

**Effet :** Affichage seulement, pas d'appel API

---

### **Bouton "Archiver" cliqué**

```javascript
🗃️ Archivage manuel des événements passés...

🗂️ AUTO-ARCHIVAGE DES ÉVÉNEMENTS PASSÉS
📊 480 événements à analyser
📋 152 séries détectées

🗃️ À archiver (série terminée) - "Carnaval" (3 événements)
🗃️ À archiver (terminé) - "Marché Noël" (1 événement)
...

✅ ARCHIVAGE TERMINÉ : 150/150 événements archivés

✅ 150 événements archivés avec succès
```

**Effet :** Appel API Monday.com, items archivés définitivement

---

## ⚠️ Message de Confirmation

Quand vous cliquez sur **"Archiver X passés"**, une confirmation apparaît :

```
⚠️ Voulez-vous archiver automatiquement tous les événements 
   dont la date de fin est passée ?

   150 événements seront archivés dans Monday.com.

   Cette action est irréversible.

   [Annuler] [OK]
```

**Important :** Lisez attentivement avant de confirmer !

---

## 🎯 Message de Succès

Après archivage réussi :

```
✅ Archivage terminé !

• 150 événements archivés
• 330 événements conservés

Le calendrier va se rafraîchir.

[OK]
```

---

## 🚨 Cas d'Erreur

### **Mode Lecture Seule**

Si vous êtes en mode consultation :

```
Bouton "Archiver" : Désactivé (grisé)
Tooltip : "Action non autorisée en mode lecture seule"
```

**Solution :** Connectez-vous en tant qu'administrateur

---

### **Erreur d'Archivage**

Si l'archivage échoue :

```
❌ Erreur lors de l'archivage des événements.

Consultez la console pour plus de détails.

[OK]
```

**Solution :** Vérifiez la console (F12) pour voir l'erreur exacte

---

## 📚 Cas d'Usage Typiques

### **1. Audit/Consultation**
**Besoin :** Voir les événements passés pour rapport/statistiques  
**Action :** Toggle "Afficher" ☑  
**Board Monday :** Pas touché

---

### **2. Nettoyage Mensuel**
**Besoin :** Archiver les événements du mois précédent  
**Action :** Bouton "Archiver X passés" 🗃️  
**Board Monday :** Items archivés définitivement

---

### **3. Import avec Données Historiques**
**Besoin :** Importer un fichier avec dates depuis janvier  
**Action :** Import + option "Archiver automatiquement" activée  
**Board Monday :** Seuls les événements futurs restent actifs

---

## 🛠️ Bonnes Pratiques

### **✅ À Faire**

1. **Avant d'archiver :** Cochez le toggle pour vérifier quels événements seront archivés
2. **Panneau debug :** Déroulez "🔍 Debug" pour voir la liste exacte
3. **Confirmation :** Lisez attentivement le message de confirmation
4. **Périodicité :** Archivez mensuellement pour garder un board propre

---

### **❌ À Ne Pas Faire**

1. Ne cliquez pas sur "Archiver" sans avoir vérifié le nombre
2. N'archivez pas si vous avez des doutes sur les dates
3. N'archivez pas pendant qu'un import est en cours

---

## 🔄 Résumé du Flux

```
Événements chargés depuis Monday.com
          ↓
Séparation en deux arrays :
  • activeEvents (330)     [en cours / à venir]
  • archivedEvents (150)   [date fin passée]
          ↓
┌─────────────────────────────────────┐
│ Toggle "Afficher"                   │
│ ☐ Désactivé → uniqueEvents = 330   │
│ ☑ Activé    → uniqueEvents = 480   │
└─────────────────────────────────────┘
          ↓
Affichage dans le calendrier
          ↓
Optionnel :
┌─────────────────────────────────────┐
│ Bouton "Archiver X passés"          │
│ Clic → Confirmation → API Monday    │
│ → Items archivés dans le board      │
└─────────────────────────────────────┘
          ↓
Rafraîchissement du calendrier
archivedEvents.length = 0
```

---

## 📊 Statistiques d'Archivage

Le bouton "Archiver X passés" affiche intelligemment :

- **Aucun événement passé :** Bouton masqué
- **1-10 événements :** `🗃️ Archiver X passés`
- **11+ événements :** `🗃️ Archiver X passés` (même format)

**Compteur en temps réel :** Se met à jour automatiquement quand les dates passent

---

## ✅ Checklist de Vérification

Avant d'archiver définitivement, vérifiez :

- [ ] J'ai coché le toggle "Afficher les archives"
- [ ] J'ai consulté le panneau "🔍 Debug" pour voir la liste
- [ ] Le nombre affiché sur le bouton est correct
- [ ] Je suis en mode administrateur (pas lecture seule)
- [ ] J'ai bien lu le message de confirmation
- [ ] Je comprends que c'est irréversible

---

## 🎯 TL;DR

| Action | Toggle ☑ | Bouton 🗃️ |
|--------|----------|-----------|
| **Fonction** | Afficher/Masquer | Archiver définitivement |
| **Board Monday** | Pas touché | Modifié |
| **Réversible** | Oui | Non |
| **Usage** | Consultation | Nettoyage |

**Afficher = voir temporairement**  
**Archiver = supprimer définitivement du board actif**

---

## 📞 Support

**Question fréquente :** "Pourquoi les événements archivés ne s'affichent pas ?"

**Réponse :** Deux possibilités :

1. **Toggle désactivé :** Cochez "Afficher les archives" ☑
2. **Événements déjà archivés dans Monday :** Ils ont été archivés définitivement et ne sont plus dans le board actif

**Pour vérifier :** Ouvrez Monday.com directement et regardez la section "Archived items"

---

**Les événements passent maintenant automatiquement en archivés avec un simple clic ! 🎉**
