# 🗃️ Archivage Automatique Intelligent - Tous les Événements Passés

**Date :** 31 août 2026  
**Fonction :** Archiver automatiquement TOUS les événements passés du board Monday.com

---

## 🎯 Objectif

Un bouton permet d'archiver **automatiquement et intelligemment** tous les événements dont la date de fin est passée, directement dans le board Monday.com.

---

## 🔘 Le Bouton

### **Emplacement**

Dans la barre de filtres, en haut du calendrier :

```
[🗃️ Archiver tous les passés]
```

**Couleur :** Orange vif (impossible à manquer)  
**Visible :** Toujours (sauf mode lecture seule)

---

### **États du Bouton**

#### **État Normal (Prêt)**
```
[🗃️ Archiver tous les passés]
```
**Action :** Clic → Analyse du board → Archivage intelligent

---

#### **État En Cours (Processing)**
```
[⟳ Archivage en cours...]
```
**Visuel :** Spinner animé, bouton désactivé  
**Durée :** Quelques secondes selon le nombre d'événements

---

#### **Mode Lecture Seule (Masqué)**
```
[Bouton non visible]
```
**Raison :** Vous n'avez pas les permissions d'écriture

---

## 🧠 Intelligence de l'Archivage

### **Règles Appliquées**

L'archivage est **intelligent** : il distingue les événements isolés des séries contiguës.

#### **1. Événement Isolé**

**Critère :** Un seul événement avec ce nom + lieu  
**Action :** Archivé si `dateDeFin < aujourd'hui`

**Exemple :**
```
Événement : "Marché de Noël" au Centre-ville
Date fin  : 24/12/2025
Aujourd'hui : 31/08/2026

→ ARCHIVÉ ✅ (date passée, événement unique)
```

---

#### **2. Série Contiguë (Même Nom + Lieu)**

**Critère :** Plusieurs événements avec le même nom et le même lieu  
**Action :** Archivé UNIQUEMENT si TOUTES les dates de fin sont passées

**Exemple 1 : Série Terminée**
```
Série : "Carnaval" au Centre-ville
• 15/03/2026 → 17/03/2026
• 18/03/2026 → 20/03/2026
• 21/03/2026 → 23/03/2026

Aujourd'hui : 31/08/2026

→ TOUTE LA SÉRIE ARCHIVÉE ✅ (toutes les dates passées)
```

---

**Exemple 2 : Série En Cours**
```
Série : "DUCASSE" à Dunkerque
• 29/08/2026 → 31/08/2026  ← Date passée
• 01/09/2026 → 03/09/2026  ← Date future
• 04/09/2026 → 06/09/2026  ← Date future

Aujourd'hui : 31/08/2026

→ TOUTE LA SÉRIE CONSERVÉE 🛡️ (des dates futures existent)
```

**Raison :** La série est encore en cours, même si certains événements sont déjà passés.

---

### **Pourquoi Cette Intelligence ?**

**Problème sans intelligence :**
- Archiver chaque événement individuellement
- Casser une série en cours (DUCASSE du 29/08 au 06/09)
- Perdre le contexte des événements multi-jours

**Solution intelligente :**
- Détection automatique des séries (nom + lieu identiques)
- Conservation des séries en cours
- Archivage propre des séries terminées

---

## 🔄 Workflow Complet

### **Étape 1 : Cliquer sur le Bouton**

```
[🗃️ Archiver tous les passés]
```

---

### **Étape 2 : Confirmation**

Une fenêtre de confirmation s'affiche :

```
🗃️ ARCHIVAGE AUTOMATIQUE DE TOUS LES ÉVÉNEMENTS PASSÉS

Cette action va analyser TOUS les événements du board Monday.com et archiver :

• Les événements isolés dont la date de fin est passée
• Les séries d'événements (même nom + lieu) complètement terminées

⚠️ Les séries en cours (avec des dates futures) seront conservées.

Cette action est irréversible. Continuer ?

[Annuler] [OK]
```

**⚠️ Lisez attentivement avant de confirmer !**

---

### **Étape 3 : Archivage en Cours**

```
[⟳ Archivage en cours...]
```

**Logs dans la console (F12) :**

```javascript
🗃️ Archivage automatique de TOUS les événements passés du board...

🗂️ AUTO-ARCHIVAGE DES ÉVÉNEMENTS PASSÉS
📊 480 événements à analyser
📋 152 séries détectées

✅ Conservé (série en cours : 29/08 → 06/09) - "DUCASSE" (31 événements)
🗃️ À archiver (série terminée) - "Carnaval" (3 événements)
🗃️ À archiver (terminé) - "Marché Noël" (1 événement)
🗃️ À archiver (série terminée) - "Fête de la Musique" (5 événements)

✅ ARCHIVAGE TERMINÉ : 150/150 événements archivés avec succès
```

---

### **Étape 4 : Message de Succès**

```
✅ ARCHIVAGE TERMINÉ !

📊 Résultats :
• 150 événements archivés dans Monday.com
• 330 événements conservés (futurs ou en cours)

📋 Exemples :
  • Carnaval (Centre-ville) - 3 événements - 🗃️ À archiver (terminé)
  • Marché de Noël (Place Jean Bart) - 1 événement - 🗃️ À archiver (terminé)
  • DUCASSE (Dunkerque) - 31 événements - ✅ Conservé (série en cours)
  • Fête de la Musique (Divers lieux) - 5 événements - 🗃️ À archiver (terminé)
  • Brocante (Malo) - 2 événements - 🗃️ À archiver (terminé)

Le calendrier va se rafraîchir.

[OK]
```

---

### **Étape 5 : Rafraîchissement Automatique**

Le calendrier se recharge automatiquement pour refléter les changements.

**Résultat visible :**
- Les événements archivés ne sont plus dans le board actif
- Seuls les événements futurs/en cours restent visibles
- Le compteur "X masqués" se met à jour

---

## 📊 Exemple Concret

### **Board Avant Archivage**

```
Total : 480 événements actifs dans Monday.com

Séries détectées :
• DUCASSE (29/08 → 06/09) : 31 événements
• Carnaval (15/03 → 23/03) : 3 événements
• Marché Noël (01/12 → 24/12) : 1 événement
• Fête Musique (21/06) : 5 événements
• Brocante (05/04) : 2 événements
• ... (147 autres séries)
```

---

### **Analyse Intelligente (31/08/2026)**

```
🔍 Analyse en cours...

DUCASSE (29/08 → 06/09) : 31 événements
  → Dernière date : 06/09/2026
  → 06/09 > 31/08 → CONSERVÉ ✅

Carnaval (15/03 → 23/03) : 3 événements
  → Dernière date : 23/03/2026
  → 23/03 < 31/08 → ARCHIVÉ 🗃️

Marché Noël (01/12 → 24/12) : 1 événement
  → Date fin : 24/12/2025
  → 24/12 < 31/08 → ARCHIVÉ 🗃️

Fête Musique (21/06) : 5 événements
  → Dernière date : 21/06/2026
  → 21/06 < 31/08 → ARCHIVÉ 🗃️

Brocante (05/04) : 2 événements
  → Dernière date : 05/04/2026
  → 05/04 < 31/08 → ARCHIVÉ 🗃️
```

---

### **Board Après Archivage**

```
Total actif : 330 événements (futurs/en cours)
Total archivé : 150 événements (passés)

Événements conservés :
• DUCASSE (29/08 → 06/09) : 31 événements ✅
• ... (299 autres événements futurs)

Événements archivés dans Monday.com :
• Carnaval : 3 événements 🗃️
• Marché Noël : 1 événement 🗃️
• Fête Musique : 5 événements 🗃️
• Brocante : 2 événements 🗃️
• ... (139 autres événements)
```

---

## 🎨 Bannière d'Information

Une grande bannière orange explique le fonctionnement :

```
┌─────────────────────────────────────────────────────────────┐
│ 🗃️ Archivage automatique intelligent                        │
│                                                             │
│ Le bouton "Archiver tous les passés" analyse              │
│ intelligemment TOUS les événements du board et archive :   │
│                                                             │
│ ┌──────────────────────┬──────────────────────┐           │
│ │ ✅ Archivés :        │ 🛡️ Conservés :       │           │
│ ├──────────────────────┼──────────────────────┤           │
│ │ • Événements isolés  │ • Événements futurs  │           │
│ │   dont date passée   │   ou en cours        │           │
│ │ • Séries complète-   │ • Séries avec dates  │           │
│ │   ment terminées     │   futures            │           │
│ └──────────────────────┴──────────────────────┘           │
│                                                             │
│ 💡 Exemple : "DUCASSE" du 29/08 au 06/09                   │
│    → Conservé tant que date du jour < 06/09                │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧪 Test Pratique

### **Créer un Événement de Test**

1. Dans Monday.com, créez un événement :
   ```
   Nom : Test Archivage
   Date début : 28/08/2026 (avant-hier)
   Date fin : 29/08/2026 (hier)
   Lieu : Test
   ```

2. Rafraîchissez le calendrier (F5)

3. Vérifiez les logs :
   ```javascript
   [Filter] Split into: 331 active events + 1 archived events
   ```

4. Cliquez sur **"Archiver tous les passés"**

5. Confirmez l'archivage

6. Vérifiez le message de succès :
   ```
   ✅ ARCHIVAGE TERMINÉ !
   • 1 événement archivé
   • 330 événements conservés
   
   📋 Exemples :
     • Test Archivage (Test) - 1 événement - 🗃️ À archiver (terminé)
   ```

7. Rafraîchissement automatique

8. Vérifiez que l'événement a disparu du calendrier

9. Vérifiez dans Monday.com → Section "Archived items"

---

## 📝 Questions Fréquentes

### **Q1 : Le bouton archive-t-il TOUS les événements ?**

**R :** Non ! Seulement ceux dont **toutes** les dates sont passées. Les séries en cours sont conservées.

---

### **Q2 : Que se passe-t-il pour DUCASSE du 29/08 au 06/09 si on est le 31/08 ?**

**R :** DUCASSE est **conservé** car la dernière date (06/09) est future. Même si les événements du 29 et 30 août sont passés, toute la série reste active.

---

### **Q3 : Puis-je annuler l'archivage ?**

**R :** Non, c'est irréversible. Les événements sont archivés dans Monday.com et ne peuvent être restaurés que manuellement depuis la section "Archived items".

---

### **Q4 : Combien de temps prend l'archivage ?**

**R :** Quelques secondes pour 500 événements. Le bouton affiche un spinner pendant le traitement.

---

### **Q5 : Que faire si j'ai archivé par erreur ?**

**R :** Allez dans Monday.com → Board → Menu → "View archived items" → Restaurez les événements manuellement.

---

### **Q6 : Le bouton n'apparaît pas, pourquoi ?**

**R :** Vous êtes en mode lecture seule. Connectez-vous avec un compte administrateur.

---

## ✅ Checklist Avant Archivage

Avant de cliquer sur "Archiver tous les passés" :

- [ ] Je suis administrateur (pas consultant)
- [ ] J'ai lu la confirmation attentivement
- [ ] Je comprends que c'est irréversible
- [ ] J'ai vérifié la date du jour dans le panneau debug
- [ ] Je sais que les séries en cours seront conservées
- [ ] J'ai fait une sauvegarde si nécessaire (export CSV)

---

## 🎯 Résumé

**Un bouton, une action :**
```
[🗃️ Archiver tous les passés]
   ↓
Analyse intelligente
   ↓
Archivage des événements/séries terminés
   ↓
Conservation des événements futurs/en cours
   ↓
Message de succès détaillé
   ↓
Rafraîchissement automatique
```

**Règle d'or :**  
*Un événement isolé est archivé si sa date est passée.*  
*Une série est archivée UNIQUEMENT si TOUTES ses dates sont passées.*

---

**Cliquez sur "Archiver tous les passés" et laissez l'intelligence faire le tri ! 🎉**
