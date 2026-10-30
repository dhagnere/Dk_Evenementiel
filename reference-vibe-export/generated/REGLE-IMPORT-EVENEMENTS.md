# Règle d'Import des Événements

## Logique d'Import

Lors de l'import d'un fichier Excel/CSV contenant des événements, la logique suivante est appliquée **pour chaque ligne du fichier** :

### 🔍 Étape 1 : Vérification de l'existence

Pour chaque événement dans le fichier, le système crée une **clé unique** basée sur :
- **Nom de l'événement** (colonne "Nom")
- **Date de début** (colonne "Date de début")
- **Lieu** (colonne "Lieu")

Cette clé permet d'identifier de manière unique un événement.

### ✅ Étape 2 : Décision d'import

#### **CAS 1 : L'événement existe déjà dans le board** ⏭️
```
Clé unique trouvée dans le board
→ L'événement est IGNORÉ
→ AUCUNE modification n'est apportée
→ L'état actuel est PRÉSERVÉ (validations, statut, etc.)
→ Comptabilisé comme "Doublon ignoré"
```

**Exemple :**
```
Fichier Excel contient :
  Nom: "Carnaval de Dunkerque"
  Date début: 15/03/2026
  Lieu: "Place Jean Bart"
  Statut: "Brouillon"

Board contient déjà :
  Nom: "Carnaval de Dunkerque"
  Date début: 15/03/2026
  Lieu: "Place Jean Bart"
  Statut: "Validée" ✅
  Validation Technique: Oui ✅
  Validation Politique: Oui ✅

→ RÉSULTAT : L'événement n'est PAS importé
→ Le statut reste "Validée" (et non "Brouillon")
→ Les validations restent cochées
→ Toutes les autres données restent inchangées
```

#### **CAS 2 : L'événement n'existe pas dans le board** ✅
```
Clé unique NON trouvée dans le board
→ L'événement est CRÉÉ
→ Un nouvel item est ajouté au board
→ Un ID automatique est généré (EVT-2026-XXXX)
→ Comptabilisé comme "Nouveau créé"
```

**Exemple :**
```
Fichier Excel contient :
  Nom: "Fête de la Musique"
  Date début: 21/06/2026
  Lieu: "Kiosque à Musique"

Board ne contient PAS cet événement
→ RÉSULTAT : Nouvel événement créé
→ ID généré : EVT-2026-0042
→ Toutes les données du fichier sont importées
```

---

## 🎯 Objectifs de cette règle

### 1. **Éviter les doublons**
Sans cette règle, chaque import créerait de nouveaux items, même pour des événements déjà présents. 
Le board deviendrait rapidement ingérable avec des milliers d'items dupliqués.

### 2. **Préserver le travail effectué**
Les validations (Technique, Politique, Date Clef) et les modifications manuelles effectuées sur les événements existants sont **PRÉSERVÉES**.

Sans cette règle, chaque import écraserait ces validations → perte de travail.

### 3. **Mise à jour sûre**
Vous pouvez importer le même fichier Excel plusieurs fois (par exemple, pour ajouter de nouveaux événements) sans risque de :
- Dupliquer les événements existants
- Perdre les validations déjà effectuées
- Corrompre les données du board

---

## 📊 Traçabilité

Chaque ligne du fichier Excel est comptabilisée dans l'une de ces catégories :

| Catégorie | Description | Badge |
|-----------|-------------|-------|
| **Nouveaux créés** | Événements qui n'existaient pas dans le board | ✅ Vert |
| **Doublons ignorés** | Événements déjà présents (aucune modification) | ⏭️ Orange |
| **Échecs** | Erreurs lors de la création (données invalides, etc.) | ❌ Rouge |

**Formule de vérification :**
```
Total lignes fichier = Nouveaux + Ignorés + Échecs
```

Cette formule garantit que **100% des lignes** sont comptabilisées et qu'aucune donnée n'est perdue.

---

## 🔧 Détection des doublons

### Clé de déduplication

La clé unique est construite ainsi :
```javascript
clé = nom_minuscule + "_" + date_début + "_" + lieu_minuscule
```

**Exemples de clés :**
```
"carnaval de dunkerque_2026-03-15_place jean bart"
"fête de la musique_2026-06-21_kiosque à musique"
"marché de noël_2025-12-01_halle aux sucres"
```

### Normalisation

- Les noms et lieux sont convertis en **minuscules**
- Les espaces multiples sont normalisés
- Les accents sont **préservés** (important pour les noms français)

### Cas particuliers

#### **Événement avec nom identique mais lieu différent** → CRÉÉS
```
Fichier 1 : "Concert Jazz" → Place Jean Bart → 15/06/2026
Fichier 2 : "Concert Jazz" → Kiosque Musique → 15/06/2026
→ 2 événements distincts (lieux différents)
```

#### **Événement avec nom identique mais date différente** → CRÉÉS
```
Fichier 1 : "Marché" → Place Jean Bart → 01/12/2025
Fichier 2 : "Marché" → Place Jean Bart → 08/12/2025
→ 2 événements distincts (dates différentes)
```

#### **Événement multi-jours** → 1 SEUL ITEM
```
Carnaval : du 15/03 au 18/03 (4 jours)
→ 1 seul item dans le board avec :
  - Date de début : 15/03
  - Date de fin : 18/03
→ Apparaît dans le calendrier sur les 4 jours
```

---

## 💡 Conseils d'utilisation

### ✅ Bonnes pratiques

1. **Import initial complet**
   - Importez une première fois le fichier Excel avec tous les événements
   - Effectuez les validations et modifications nécessaires

2. **Imports de mise à jour**
   - Ajoutez de nouveaux événements au fichier Excel
   - Réimportez → seuls les nouveaux seront créés
   - Les événements existants restent intacts

3. **Vérification avant import**
   - Consultez les logs dans la console (F12)
   - Vérifiez le résumé après import
   - Assurez-vous que 100% des lignes sont comptabilisées

### ❌ À éviter

1. **Ne pas modifier les clés de déduplication**
   - Si vous changez le nom, la date ou le lieu d'un événement dans le fichier Excel
   - Il sera considéré comme un nouvel événement → duplication

2. **Ne pas nettoyer manuellement puis réimporter**
   - Si vous archivez/supprimez des événements du board
   - Puis réimportez le même fichier → ils seront recréés

3. **Ne pas importer des fichiers avec des données incohérentes**
   - Dates au mauvais format
   - Quartiers/Natures/Statuts qui n'existent pas
   - → Résultat : échecs d'import

---

## 🔍 Logs et Debug

### Console (F12)

Pendant l'import, des logs détaillés sont affichés :

```
📦 createItemsBatch: Traitement de 150 nouveaux événements...

[1/150] Création de EVT-2026-0001...
✅ Créé avec succès

[2/150] Analyse de "Carnaval de Dunkerque"...
⏭️ ÉVÉNEMENT EXISTANT DANS LE BOARD (IGNORÉ - AUCUNE MODIFICATION) :
   ID board: 3161650350
   Nom: "Carnaval de Dunkerque"
   Date début: 2026-03-15
   Lieu: "Place Jean Bart"
   Clé de déduplication: carnaval de dunkerque_2026-03-15_place jean bart
   📌 RÈGLE D'IMPORT: L'événement existe déjà → il n'est PAS importé
   ✅ Validations, statut, et toutes autres données restent INCHANGÉS

...

📊 VÉRIFICATION FINALE:
   • Lignes du fichier: 150
   • Créées: 45
   • Ignorées (doublons): 105
   • Échecs: 0
   • TOTAL COMPTABILISÉ: 150
✅ TRAÇABILITÉ OK: 100% des lignes comptabilisées
```

---

## ❓ FAQ

### Q : Puis-je mettre à jour un événement existant via l'import ?
**R :** Non. La règle actuelle est volontairement conservatrice : si l'événement existe, il n'est pas touché. 
Pour modifier un événement existant, utilisez l'interface de l'application.

### Q : Comment forcer la réimportation d'un événement ?
**R :** Archivez ou supprimez l'événement existant dans le board, puis réimportez le fichier.

### Q : Pourquoi mes validations disparaissent après import ?
**R :** Cela ne devrait PAS arriver avec la règle actuelle. Si c'est le cas, vérifiez que :
- Le nom/date/lieu sont identiques entre le fichier et le board
- Il n'y a pas de caractères invisibles (espaces, etc.)

### Q : Que se passe-t-il si j'importe le même fichier deux fois ?
**R :** La deuxième fois :
- 0 nouveaux créés
- 100% doublons ignorés
- Le board reste strictement identique

---

**Dernière mise à jour :** 31 août 2026
