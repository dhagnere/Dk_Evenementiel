# 🚨 DIAGNOSTIC : Corruption des données à l'import

## ⚠️ Problème signalé

**Symptômes :**
- Les événements importés ont le champ **Pilote vide**
- Le champ **Direction pilote** contient des données incorrectes (décalées)
- Le champ **Nature** est systématiquement mis à "Protocole" alors que le fichier Excel contient autre chose
- Les événements archivés semblent particulièrement touchés

---

## 🔍 Causes possibles

### **1. Ordre des colonnes incorrect dans l'Excel**

Si l'ordre des colonnes dans votre fichier Excel ne correspond pas à ce qui est attendu, les données seront lues dans les mauvaises colonnes.

**Exemple de problème :**
```
Votre Excel :
[Date] [Nom] [Direction pilote] [Pilote] [Nature] [Lieu]
                     ↑              ↑         ↑
Le code lit :
[Date] [Nom] [Pilote]           [Direction] [Nature]
                                     ❌          ❌
```

**Résultat :** "Direction pilote" est lu comme "Pilote", et "Pilote" est ignoré.

---

### **2. Colonnes vides ou colonnes cachées**

Si votre fichier Excel contient des **colonnes vides** entre les colonnes de données, elles décalent tout le mapping.

**Exemple :**
```
Excel :
[Date] [Nom] [(vide)] [Pilote] [Direction] [Nature]

Le code voit :
[Date] [Nom] [?????] [Pilote] [Direction] [Nature]
              ↑ Cette colonne vide décale tout !
```

---

### **3. En-têtes de colonnes non reconnus**

Le système utilise les **noms des en-têtes** pour identifier les colonnes. Si un en-tête est mal orthographié ou contient des caractères spéciaux, il ne sera pas reconnu.

**En-têtes reconnus pour chaque colonne :**

| Colonne attendue | En-têtes valides (exemples) |
|------------------|----------------------------|
| **Nom** | "Nom", "Nom de l'événement", "Événement", "Titre" |
| **Pilote** | "Pilote", "Pilotes", "Responsable", "Référent" |
| **Direction pilote** | "Direction pilote", "Direction", "Service pilote", "Service" |
| **Nature** | "Nature", "Type d'événement", "Catégorie", "Thème" |
| **Quartier** | "Quartier", "Secteur", "Zone" |
| **Date de début** | "Date de début", "Date début", "Début", "Date" |
| **Date de fin** | "Date de fin", "Date fin", "Fin" |
| **Lieu** | "Lieu", "Adresse", "Localisation" |

---

## 🛠️ Diagnostic étape par étape

### **Étape 1 : Vérifier l'ordre des colonnes dans votre Excel**

Ouvrez votre fichier Excel et **notez l'ordre EXACT des colonnes** (de gauche à droite).

**Ordre recommandé (extraction standard) :**
```
1. Date
2. Date de début
3. Date de fin
4. Nom
5. Lieu
6. Quartier
7. Pilote
8. Direction pilote
9. Nature
10. Niveau
11. Type
12. Tardive
13. Reprog.
14. Organisateur
15. Statut
```

**❓ Votre ordre est-il différent ?**
→ Si oui, c'est probablement la cause du problème.

---

### **Étape 2 : Vérifier les en-têtes**

Regardez la **première ligne** de votre Excel. Les en-têtes doivent être exactement comme ceci (sans faute de frappe) :

```
Date | Date de début | Date de fin | Nom | Lieu | Quartier | Pilote | Direction pilote | Nature | ...
```

**⚠️ Vérifiez :**
- ✅ Pas d'espaces supplémentaires avant ou après
- ✅ Pas de caractères spéciaux cachés
- ✅ Majuscules/minuscules correctes (le système normalise, mais mieux vaut respecter)

---

### **Étape 3 : Activer les logs de diagnostic**

Lors de votre prochain import, **ouvrez la console navigateur** (F12) **AVANT** de cliquer sur "Importer".

Vous verrez maintenant des logs très détaillés :

```
🔍 Analyse des en-têtes du fichier :
  ✅ Colonne 0: "Date" → date
  ✅ Colonne 1: "Date de début" → dateDeDbut
  ✅ Colonne 2: "Date de fin" → dateDeFin
  ✅ Colonne 3: "Nom" → nom
  ✅ Colonne 4: "Lieu" → lieu
  ✅ Colonne 5: "Quartier" → quartier
  ⚠️ Colonne 6: "Pilot" (normalisé: "pilot") → IGNORÉE  ❌
  ✅ Colonne 7: "Direction pilote" → directionPilote
  ✅ Colonne 8: "Nature" → nature

📊 Résumé : 8/9 colonnes reconnues
```

**🔍 Regardez attentivement :**
- Les colonnes marquées `⚠️ IGNORÉE` ne seront PAS importées
- L'ordre des colonnes (0, 1, 2...) doit correspondre à votre Excel

---

### **Étape 4 : Vérifier les données pendant l'import**

Pendant l'import, des logs montrent EXACTEMENT ce qui est lu et ce qui est envoyé :

```
[1/300] Création de EVT-2027-0001...
   📋 Données sources (rowData):
      nom: "CHAPELLE DE LA MAIRIE DE ROSENDAEL"
      pilote: ["Eva LELEU"]
      directionPilote: "Direction Communication"
      nature: "Protocole"
      quartier: "Rosendaël"
   
   📦 Données à envoyer (createData):
      name: "EVT-2027-0001"
      nom: "CHAPELLE DE LA MAIRIE DE ROSENDAEL"
      pilote: ["Eva LELEU"]
      directionPilote: "Direction Communication"
      nature: "Protocole"
      quartier: "Rosendaël"

✅ [1/300] EVT-2027-0001 créé avec succès
```

**🔍 Comparez avec votre Excel :**
- Les valeurs dans `rowData` correspondent-elles à ce qui est dans votre fichier ?
- Si `rowData` est déjà incorrect, le problème vient du **mapping des colonnes**
- Si `rowData` est correct mais `createData` est incorrect, le problème vient de la **validation**

---

## 🔧 Solutions

### **Solution 1 : Réorganiser les colonnes Excel** (recommandé)

Ouvrez votre fichier Excel et **réorganisez les colonnes** dans l'ordre standard :

1. Date
2. Date de début
3. Date de fin
4. Nom
5. Lieu
6. Quartier
7. Pilote
8. Direction pilote
9. Nature
10. Niveau
11. Type
12. Tardive
13. Reprog.
14. Organisateur
15. Statut

**💾 Sauvegardez** et réimportez.

---

### **Solution 2 : Vérifier et corriger les en-têtes**

Assurez-vous que la première ligne contient exactement ces en-têtes :

```
Date | Date de début | Date de fin | Nom | Lieu | Quartier | Pilote | Direction pilote | Nature | Niveau | Type | Tardive | Reprog. | Organisateur | Statut
```

**⚠️ Fautes courantes à corriger :**
- "Pilot" → "Pilote"
- "Direction Pilote" (avec majuscule) → "Direction pilote"
- "Natire" → "Nature"
- "Quariter" → "Quartier"

---

### **Solution 3 : Supprimer les colonnes vides**

1. Sélectionnez toutes les colonnes vides dans votre Excel
2. Clic droit → "Supprimer"
3. Sauvegardez et réimportez

---

### **Solution 4 : Utiliser le modèle CSV**

Téléchargez le **modèle CSV** depuis l'application :

1. Ouvrez le Calendrier
2. Cliquez sur "Importer un fichier"
3. Cliquez sur "📥 Télécharger le modèle CSV"
4. Copiez vos données dans ce modèle
5. Importez

Le modèle a les colonnes dans le bon ordre.

---

## 📊 Test de validation

Pour confirmer que le problème est résolu :

### **Test 1 : Import d'une ligne de test**

Créez un fichier Excel avec **UNE SEULE LIGNE** :

```csv
Date,Date de début,Date de fin,Nom,Lieu,Quartier,Pilote,Direction pilote,Nature
15/08/2026,15/08/2026,15/08/2026,TEST DIAGNOSTIC,Test Lieu,Rosendaël,Eva LELEU,Direction Communication,Culture
```

Importez-le et vérifiez dans le board monday.com que :
- ✅ Pilote = "Eva LELEU"
- ✅ Direction pilote = "Direction Communication"
- ✅ Nature = "Culture"

Si ça fonctionne, le problème vient de votre fichier Excel complet.

---

### **Test 2 : Vérifier un événement archivé**

1. Ouvrez un événement qui a été archivé
2. Vérifiez ses champs :
   - Pilote
   - Direction pilote
   - Nature
3. Si les champs sont incorrects, c'est qu'ils l'étaient **AVANT** l'archivage

**⚠️ Important :** L'archivage (bouton "Nettoyer") **ne modifie JAMAIS** les données. Il ne fait qu'archiver l'événement. Si les données sont incorrectes après archivage, c'est qu'elles l'étaient déjà avant.

---

## 🆘 Demande d'aide

Si le problème persiste après avoir suivi ce guide :

1. **Ouvrez la console navigateur** (F12) avant l'import
2. **Importez votre fichier**
3. **Copiez TOUS les logs** de la console
4. **Envoyez-les** avec :
   - Une capture d'écran de votre Excel (première ligne + une ligne de données)
   - Le nom exact de l'événement problématique
   - Une capture du board monday.com montrant l'événement avec les mauvaises données

---

## 📝 Checklist de dépannage

Avant de signaler un bug, vérifiez :

- [ ] J'ai vérifié l'ordre des colonnes dans mon Excel
- [ ] J'ai vérifié les en-têtes (première ligne)
- [ ] J'ai supprimé toutes les colonnes vides
- [ ] J'ai ouvert la console (F12) pendant l'import
- [ ] J'ai lu les logs de diagnostic
- [ ] J'ai comparé les valeurs `rowData` avec mon Excel
- [ ] J'ai testé avec une seule ligne de données
- [ ] J'ai vérifié qu'aucun événement n'a les bonnes données (si tous sont incorrects, c'est un problème de mapping)

---

**Ce guide de diagnostic permettra d'identifier précisément où les données sont corrompues (lecture Excel, mapping, validation, ou envoi à Monday).**
