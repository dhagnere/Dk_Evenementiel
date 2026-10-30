# 📋 Guide complet du système d'import de fichiers CSV/Excel

## 🎯 Vue d'ensemble

Le système d'import est conçu pour être **extrêmement flexible** et accepter des fichiers avec des noms de colonnes variés. Il normalise automatiquement les en-têtes et les fait correspondre aux colonnes du board monday.com.

---

## 🔧 Comment fonctionne la normalisation automatique

### Étape 1 : Normalisation des en-têtes
Quand vous uploadez un fichier, chaque en-tête de colonne est normalisé :

```
"Nom de l'événement"  →  "nom de l evenement"  →  Reconnu comme "nom"
"Date début"          →  "date debut"           →  Reconnu comme "dateDeDbut"
"QUARTIER"            →  "quartier"             →  Reconnu comme "quartier"
```

**Transformations appliquées :**
- ✅ Conversion en minuscules
- ✅ Suppression des accents (é → e, à → a, ç → c)
- ✅ Suppression de la ponctuation (', ., -, _)
- ✅ Réduction des espaces multiples

### Étape 2 : Correspondance avec le board
Le système reconnaît automatiquement **plus de 100 variantes** de noms de colonnes :

| Votre colonne CSV | Variantes acceptées | Colonne board |
|-------------------|---------------------|---------------|
| **Nom** | nom, name, titre, intitulé, événement, libellé | `nom` |
| **Date** | date, dates | `date` (dupliquée vers début ET fin) |
| **Date de début** | date début, date_debut, debut, start | `dateDeDbut` |
| **Date de fin** | date fin, fin, end, date de clôture | `dateDeFin` |
| **Lieu** | lieu, adresse, localisation, site, endroit | `lieu` |
| **Quartier** | quartier, secteur, zone, arrondissement | `quartier` |
| **Pilote** | pilote, responsable, référent, contact | `pilote` |
| **Direction pilote** | direction pilote, direction, service, dir | `directionPilote` |
| **Nature** | nature, catégorie, thème, type d'événement | `nature` |
| **Niveau** | niveau, échelle, portée, périmètre | `niveau` |
| **Type** | type, typologie, format, récurrence | `type` |
| **Tardive** | tardive, demande tardive, tardif | `tardive` |
| **Reprog** | reprog, reprogrammation, reporté, report | `reprog` |
| **Organisateur** | organisateur, organisme, structure, association | `organisateur` |
| **Statut** | statut, état, status, avancement | `statut` |

---

## ✅ Validation automatique des valeurs

### Colonnes de type Status
Les valeurs sont **automatiquement normalisées** (insensibles à la casse) :

**Quartier** → 9 options valides :
- Dunkerque - Centre
- Malo-les-Bains
- Fort-Mardyck
- Petite-Synthe
- Rosendaël
- Dunkerque - Sud
- Agglomération
- Station Balnéaire
- Glacis

**Nature** → 11 options valides :
- Culture
- Animation de quartier
- Animation "Grand Public"
- Jeunesse
- Patriotique
- Protocole
- Sport
- Noces d'Or - Etat Civil
- Brocantes
- Assemblée (Conseil Municipal, Conseil de Quartier ...)
- Environnement

**Niveau** → 5 options valides :
- Ville
- Associatif
- Ville / Asso.
- Ville / CUD
- CUD

**Type** → 3 options valides :
- Exceptionnelle
- Récurrente
- Événement

**Tardive / Reprog** → 2 options :
- Oui
- Non

**Statut** → 4 options :
- Validée
- Annulée
- À valider
- Brouillon

### Exemples de normalisation automatique
```
CSV: "culture"          → monday.com: "Culture"
CSV: "DUNKERQUE-CENTRE" → monday.com: "Dunkerque - Centre"
CSV: "ville / asso"     → monday.com: "Ville / Asso."
CSV: "oui"              → monday.com: "Oui"
CSV: "Validee"          → monday.com: "Validée"
```

---

## 📝 Format des données

### Dates
Formats acceptés :
- `DD/MM/YYYY` : 15/02/2024
- `YYYY-MM-DD` : 2024-02-15
- Numéros de série Excel : 45340

### Pilotes (dropdown)
Accepte :
- Une seule valeur : `Jean Dupont`
- Plusieurs valeurs séparées par virgule : `Jean Dupont, Marie Martin`

32 pilotes valides (voir le board pour la liste complète)

### Champs texte
- **Nom** : texte libre (obligatoire)
- **Lieu** : texte libre
- **Direction pilote** : texte libre
- **Organisateur** : texte libre

---

## 🚫 Colonnes protégées

Ces colonnes **ne sont JAMAIS modifiées** par l'import :
- ❌ **Validation Technique**
- ❌ **Validation Politique**

Elles sont gérées uniquement manuellement dans l'application.

---

## 📥 Processus d'import complet

### 1. Prévisualisation
Après sélection du fichier, le système affiche :
- ✅ **Colonnes reconnues** (en vert)
- ⚠️ **Colonnes ignorées** (en orange)
- ❌ **Colonnes manquantes** (en rouge, bloque l'import)

### 2. Validation
Le système vérifie :
- Présence des colonnes obligatoires : `Nom` + (`Date` OU `Date de début`)
- Validité des valeurs pour les colonnes status
- Format des dates

### 3. Import par batches
- **10 items par batch** (pour éviter les erreurs 429)
- **500ms de pause** entre chaque batch
- **Barre de progression** en temps réel

### 4. Mise à jour intelligente
- Les items existants sont **mis à jour** (détection par Nom + Date de début)
- Les nouveaux items sont **créés** avec un ID automatique `EVT-2026-XXXX`
- Les validations existantes sont **préservées**

### 5. Rapport détaillé
À la fin, un dialog affiche :
- 🆕 Nombre d'événements créés (avec détails)
- 🔄 Nombre d'événements mis à jour (avec détails)
- ❌ Nombre d'erreurs (si applicable)

---

## 📊 Template CSV

Téléchargez le modèle depuis l'interface (bouton "📥 Télécharger modèle CSV").

**⚠️ IMPORTANT :** L'ordre des colonnes correspond EXACTEMENT à l'extraction du board (`special_events_global.xlsx`)

**Colonnes du template (dans l'ordre) :**
```
Date, Date de début, Date de fin, Nom, Lieu, Quartier, Pilote, 
Direction pilote, Organisateur, Statut, Nature, Niveau, Type, 
Tardive, Reprog
```

**Ligne d'exemple :**
```
15/02/2024, 15/02/2024, 20/02/2024, Carnaval de Dunkerque, 
Centre-ville, Dunkerque - Centre, Jean Dupont, Direction Communication,
Association Carnaval, Validée, Culture, Ville, Récurrente, Non, Non
```

**✅ Vous pouvez directement uploader l'extraction du board sans modification !**

---

## 🔍 Déboguer un import

### Logs console
Ouvrez la console du navigateur (F12) pour voir :
```
🔍 Analyse des en-têtes du fichier :
  ✅ Colonne 0: "Nom" → nom
  ✅ Colonne 1: "Date début" → dateDeDbut
  ⚠️ Colonne 2: "Commentaire" → IGNORÉE

📊 Résumé : 15/16 colonnes reconnues

Creating item EVT-2026-0672 with data: nom, dateDeDbut, dateDeFin, lieu, quartier
```

### Erreurs courantes

**"Colonne obligatoire manquante"**
→ Votre fichier ne contient ni "Nom" ni "Date de début"
→ Solution : Renommez vos colonnes ou utilisez le template

**"HTTP 429"**
→ Trop de requêtes trop rapidement
→ Solution : Automatique - le système ralentit automatiquement

**"Invalid status value"**
→ Une valeur de colonne status ne correspond à aucune option
→ Solution : Vérifiez l'orthographe exacte (consultez la liste ci-dessus)

---

## 💡 Astuces

1. **Utilisez le template** : C'est le moyen le plus sûr d'avoir le bon format
2. **Commencez petit** : Testez avec 2-3 lignes avant d'importer 14 000 lignes
3. **Vérifiez la prévisualisation** : Elle vous montre exactement ce qui sera importé
4. **Respectez les options** : Les valeurs de colonnes status doivent correspondre exactement
5. **Conservez les validations** : Ne mettez pas ces colonnes dans votre CSV

---

## 📞 Support

En cas de problème, fournissez :
- Les logs console complets
- Un extrait du fichier CSV (3 premières lignes)
- Le message d'erreur exact
