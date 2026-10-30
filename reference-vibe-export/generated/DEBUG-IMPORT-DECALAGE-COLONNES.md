# 🔍 DEBUG : Décalage de Colonnes à l'Import

## 🎯 Problème Signalé

**Symptôme :** Lors de l'importation d'une nouvelle série d'événements (CSV/Excel), les données sont décalées :
- Des noms d'événements se retrouvent dans la colonne "Lieu"
- Des lieux se retrouvent dans d'autres champs
- Décalage généralisé dans les colonnes

## ✅ Correction Appliquée

J'ai ajouté des **logs ultra-détaillés** pour identifier précisément où se produit le décalage.

---

## 📊 Nouveaux Logs de Débogage

### **1. Analyse des En-têtes (Phase de Mapping)**

Quand vous importez un fichier, vous verrez maintenant dans la console :

```
════════════════════════════════════════════════════════
🔍 ANALYSE DÉTAILLÉE DES EN-TÊTES DU FICHIER
════════════════════════════════════════════════════════
📄 Nombre total de colonnes : 15

  ✅ Colonne 0: "Nom"
     ↳ Normalisé: "nom"
     ↳ Mappé vers: nom

  ✅ Colonne 1: "Date de début"
     ↳ Normalisé: "date de debut"
     ↳ Mappé vers: dateDeDbut

  ✅ Colonne 2: "Lieu"
     ↳ Normalisé: "lieu"
     ↳ Mappé vers: lieu

  ⚠️  Colonne 3: "Colonne Inconnue"
     ↳ Normalisé: "colonne inconnue"
     ↳ ❌ NON RECONNUE - SERA IGNORÉE

────────────────────────────────────────────────────────
📊 RÉSUMÉ : 12/15 colonnes reconnues
────────────────────────────────────────────────────────

📋 MAPPING FINAL (index de colonne → champ board) :
   0 → nom
   1 → dateDeDbut
   2 → lieu
   4 → quartier
   5 → nature
   ...
════════════════════════════════════════════════════════
```

### **2. Parsing de Lignes (Échantillon ~3%)**

Pour ne pas saturer les logs, ~3% des lignes affichent un détail complet :

```
┌─────────────────────────────────────────────────────
│ 🔍 PARSING DÉTAILLÉ D'UNE LIGNE
├─────────────────────────────────────────────────────
│ Nombre de cellules dans la ligne : 15
│
│ Colonne 0 → nom
│   Valeur brute : "Marché de Noël"
│   ✅ Texte : "Marché de Noël"
│
│ Colonne 2 → lieu
│   Valeur brute : "Place du Général de Gaulle"
│   ✅ Texte : "Place du Général de Gaulle"
│
│ Colonne 4 → quartier
│   Valeur brute : "Centre"
│   ✅ Texte : "Centre"
│
│ 📦 RÉSULTAT FINAL :
│   nom: "Marché de Noël"
│   lieu: "Place du Général de Gaulle"
│   quartier: "Centre"
│   nature: "Animation Grand Public"
│   directionPilote: "Communication"
│   organisateur: "Ville de Dunkerque"
└─────────────────────────────────────────────────────
```

---

## 🛠️ Comment Diagnostiquer le Problème

### **Étape 1 : Ouvrir la Console du Navigateur**

1. Appuyez sur **F12** (ou Cmd+Option+I sur Mac)
2. Allez dans l'onglet **Console**
3. Importez votre fichier CSV/Excel

### **Étape 2 : Vérifier le Mapping des En-têtes**

Dans les logs, cherchez la section **"ANALYSE DÉTAILLÉE DES EN-TÊTES"**.

**✅ Bon mapping :**
```
Colonne 0: "Nom" → nom
Colonne 2: "Lieu" → lieu
```

**❌ Mauvais mapping (décalage) :**
```
Colonne 0: "Nom" → nom
Colonne 1: "Quelque chose" → (NON RECONNUE)  ← Colonne intruse !
Colonne 2: "Lieu" → lieu
```

Si vous avez une colonne non reconnue **avant** les colonnes importantes, tout sera décalé.

### **Étape 3 : Vérifier les Lignes Parsées**

Cherchez les sections **"PARSING DÉTAILLÉ D'UNE LIGNE"** (~3% des lignes).

**Vérifiez que :**
- La colonne 0 contient bien le **nom** de l'événement (pas un lieu)
- La colonne 2 contient bien le **lieu** (pas un nom)
- Les valeurs sont dans les bons champs

---

## 🔧 Solutions Possibles

### **Problème 1 : Colonne Intruse dans le Fichier**

**Cause :** Votre fichier CSV/Excel contient une colonne supplémentaire non reconnue au milieu.

**Solution :** 
1. Ouvrez le fichier CSV/Excel dans LibreOffice/Excel
2. Supprimez les colonnes non utilisées
3. Assurez-vous que l'ordre est correct :
   ```
   Nom | Date de début | Date de fin | Lieu | Quartier | ...
   ```

### **Problème 2 : En-têtes Mal Écrits**

**Cause :** Les en-têtes ont été renommés et ne sont plus reconnus.

**Solution :**
Utilisez **exactement** ces noms (les majuscules/accents n'ont pas d'importance) :

| ✅ Valides | Champ Board |
|-----------|-------------|
| Nom, Name, Événement, Titre | Nom de l'événement |
| Date de début, Date début, Début | Date de début |
| Date de fin, Date fin, Fin | Date de fin |
| Lieu, Adresse, Localisation | Lieu |
| Quartier, Secteur, Zone | Quartier |
| Nature, Catégorie, Thème | Nature |
| Pilote, Responsable, Contact | Pilote |
| Direction pilote, Direction, Service | Direction pilote |
| Organisateur, Association | Organisateur |

### **Problème 3 : Ordre de Colonnes Inversé**

**Cause :** Les colonnes sont dans le mauvais ordre dans le fichier source.

**Solution :**
Le mapping se fait **automatiquement** en lisant les en-têtes, donc l'ordre n'a **pas d'importance** tant que les en-têtes sont corrects.

**Exemple :**
```
Lieu | Nom | Date  → ✅ FONCTIONNE (mapping automatique)
Nom | Lieu | Date  → ✅ FONCTIONNE aussi
```

---

## 🎯 Action Immédiate

**1. Réimportez votre fichier**
**2. Ouvrez la console (F12)**
**3. Copiez/collez ici les logs de la section "ANALYSE DÉTAILLÉE"**
**4. Je pourrai voir exactement où est le problème**

---

## 📋 Template CSV Recommandé

Pour éviter tout problème, utilisez cette structure exacte :

```csv
Nom,Date de début,Date de fin,Lieu,Quartier,Nature,Niveau,Type,Pilote,Direction pilote,Organisateur,Statut
Marché de Noël,15/12/2024,22/12/2024,Place Jean Bart,Dunkerque - Centre,Culture,Ville,Récurrente,Jean Dupont,Communication,Ville de Dunkerque,Validée
```

---

## ✅ Vérification Rapide

**Avant d'importer, vérifiez que :**
- [ ] La première ligne contient les **noms des colonnes** (en-têtes)
- [ ] Les en-têtes correspondent aux noms ci-dessus (approximativement)
- [ ] Il n'y a **pas de colonnes vides** au milieu
- [ ] Les dates sont au format **DD/MM/YYYY** (09/02/2027 = 9 février 2027)

---

**Avec ces logs détaillés, on va identifier précisément où se trouve le décalage ! 🎯**
