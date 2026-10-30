# 📋 Valeurs exactes à utiliser dans votre fichier Excel/CSV

## ⚠️ IMPORTANT : Respect de la casse et des accents

Les valeurs des colonnes de type **liste déroulante** (Quartier, Nature, Niveau, Type, etc.) doivent correspondre **EXACTEMENT** aux options définies dans le board Monday.com.

**Une seule lettre différente = valeur rejetée = Monday utilisera sa valeur par défaut !**

---

## 🔴 Symptôme : Tous les événements passent en "Protocole"

Si tous vos événements importés ont **Nature = "Protocole"** alors que votre Excel contient autre chose, c'est que :

1. ❌ La valeur dans votre Excel **ne correspond pas exactement** à une option valide
2. ❌ La validation échoue et rejette la valeur
3. ❌ Monday.com utilise sa valeur par défaut : **"Protocole"** (la couleur grise)

**Solution :** Utilisez **EXACTEMENT** les valeurs listées ci-dessous.

---

## ✅ Valeurs autorisées par colonne

### **Quartier**

Copiez-collez ces valeurs EXACTEMENT (respect de la casse, espaces, tirets) :

```
Dunkerque - Centre
Malo-les-Bains
Fort-Mardyck
Petite-Synthe
Rosendaël
Dunkerque - Sud
Agglomération
Station Balnéaire
Glacis
```

**❌ Erreurs courantes :**
- ❌ "Dunkerque Centre" (sans tiret)
- ❌ "DUNKERQUE - CENTRE" (tout en majuscules)
- ❌ "dunkerque - centre" (tout en minuscules)
- ❌ "Dunkerque-Sud" (pas d'espace autour du tiret)
- ❌ "Rosendael" (sans ë)
- ❌ "Malo les Bains" (sans tirets)

---

### **Nature**

```
Culture
Animation de quartier
Animation "Grand Public"
Jeunesse
Patriotique
Protocole
Sport
Noces d'Or - Etat Civil
Brocantes
Assemblée (Conseil Municipal, Conseil de Quartier ...)
Environnement
```

**⚠️ Attention aux guillemets et apostrophes :**
- ✅ `Animation "Grand Public"` (guillemets **droits** `"`, pas courbes `"`)
- ✅ `Noces d'Or - Etat Civil` (apostrophe **droite** `'`, pas courbe `'`)
- ✅ `Assemblée (Conseil Municipal, Conseil de Quartier ...)` (parenthèses et points de suspension)

**❌ Erreurs courantes :**
- ❌ "Animation Grand Public" (sans guillemets)
- ❌ "Animation «Grand Public»" (guillemets français)
- ❌ "Noces d'Or" (apostrophe courbe au lieu de droite)
- ❌ "Noces d Or" (sans apostrophe)
- ❌ "Assemblée" (sans la description complète)
- ❌ "Protocole " (espace à la fin)

---

### **Niveau**

```
Ville
Associatif
Ville / Asso.
Ville / CUD
CUD
```

**⚠️ Attention aux espaces autour du `/` :**
- ✅ `Ville / Asso.` (espaces **avant et après** le `/`)
- ✅ `Ville / CUD` (espaces **avant et après** le `/`)

**❌ Erreurs courantes :**
- ❌ "Ville/Asso." (pas d'espaces)
- ❌ "Ville/ Asso." (espace seulement après)
- ❌ "Ville /Asso." (espace seulement avant)
- ❌ "Ville / Asso" (sans le point final)

---

### **Type**

```
Exceptionnelle
Récurrente
Événement
```

**⚠️ Attention aux accents :**
- ✅ `Récurrente` (accent aigu sur le é)
- ✅ `Événement` (accent grave sur le É)

**❌ Erreurs courantes :**
- ❌ "Recurrente" (sans accent)
- ❌ "Evenement" (sans accent)
- ❌ "Exceptionnel" (sans le "le")

---

### **Tardive**

```
Oui
Non
```

**❌ Erreurs courantes :**
- ❌ "oui" (minuscule)
- ❌ "OUI" (tout majuscule)
- ❌ "Yes" / "No"
- ❌ "1" / "0"
- ❌ "Vrai" / "Faux"

---

### **Reprog.** (Reprogrammation)

```
Oui
Non
```

**Même règle que Tardive.**

---

### **Statut**

```
Validée
Annulée
À valider
Brouillon
```

**⚠️ Attention aux accents :**
- ✅ `Validée` (double "e" avec accent)
- ✅ `Annulée` (double "l", double "e" avec accent)
- ✅ `À valider` (À avec accent grave, pas à)

**❌ Erreurs courantes :**
- ❌ "Validé" (sans le second e)
- ❌ "Annulé" (sans le second e)
- ❌ "A valider" (A sans accent)
- ❌ "à valider" (a minuscule)
- ❌ "En cours" (n'existe pas)

---

### **Pilote**

Liste complète des pilotes autorisés :

```
Eva LELEU
Sandrine CLAEYS
Philippe MORTIER
Carinne DEBRUYNE
Cédric DELATER
Dominique STEVENIN
Gael BOLLENGIER
Gonzague CLARYS
Tony BERNAERT
Lucie SWAL
Rene SCHEPENS
Nicolas DAMIE
Fabienne LEMAHIEU
Justine BARON
YOHAN PICQUES
Mathilde VANDERRUSTEN
Hélène DENIS
Nathalie DESMIDT
Kevin LAFRANCE
Lucie AGEZ
Laila MESSAOUDI
Valerie SANS
Pierre-Baptiste MAINY
Leila BOUAZZA
Jessie TRICOT
Céline MELLIEZ
Melanie VANHELLE
Hélène PYNTHE
Julie WALLYN
Isabelle DUPUIS
VALENTINE BOURIEZ
Aurélie CHIREZ
```

**⚠️ Attention :**
- Respect STRICT de la casse (certains sont en MAJUSCULES, d'autres pas)
- Respect des accents (é, è, etc.)
- Certains noms ont des tirets (Pierre-Baptiste)

**❌ Erreurs courantes :**
- ❌ "eva leleu" (tout minuscule)
- ❌ "EVA LELEU" (tout majuscule)
- ❌ "Cédric Delater" (Delater devrait être en majuscule)
- ❌ "Rene Schepens" (sans accent sur René)
- ❌ "Helene Denis" (sans accent sur Hélène)

---

## 🔧 Comment vérifier vos valeurs avant import

### **Méthode 1 : Copier-coller depuis ce document**

1. Ouvrez ce document
2. **Copiez** la valeur exacte (Ctrl+C)
3. **Collez** dans votre Excel (Ctrl+V)

**✅ Garantit que la casse, les accents, et les espaces sont corrects.**

---

### **Méthode 2 : Utiliser la validation Excel**

1. Dans Excel, sélectionnez la colonne "Nature"
2. Menu **Données** → **Validation des données**
3. Sélectionnez **Liste**
4. Copiez-collez les valeurs séparées par des virgules :
   ```
   Culture,Animation de quartier,Animation "Grand Public",Jeunesse,Patriotique,Protocole,Sport,Noces d'Or - Etat Civil,Brocantes,Assemblée (Conseil Municipal Conseil de Quartier ...),Environnement
   ```
5. Validez

**✅ Excel vous proposera uniquement les valeurs autorisées dans un menu déroulant.**

---

### **Méthode 3 : Rechercher/Remplacer dans Excel**

Si vous avez déjà importé des données avec des valeurs incorrectes :

1. **Ctrl+H** (Rechercher & Remplacer)
2. Rechercher : `protocole` (minuscule)
3. Remplacer par : `Protocole` (majuscule)
4. Cliquer sur **Remplacer tout**

Répétez pour toutes les variations courantes :
- `culture` → `Culture`
- `sport` → `Sport`
- `Noces d Or` → `Noces d'Or - Etat Civil`
- etc.

---

## 🧪 Test de validation

### **Créer un fichier de test minimal**

Créez un fichier CSV avec **UNE SEULE LIGNE** contenant chaque colonne :

```csv
Date,Date de début,Date de fin,Nom,Lieu,Quartier,Pilote,Direction pilote,Nature,Niveau,Type,Tardive,Reprog.,Organisateur,Statut
15/08/2026,15/08/2026,15/08/2026,TEST VALIDATION,Test Lieu,Dunkerque - Centre,Eva LELEU,Direction Communication,Culture,Ville,Événement,Non,Non,Ville de Dunkerque,Validée
```

**Importez ce fichier.**

Si tous les champs sont correctement importés dans Monday.com, votre format est bon.

---

## 🚨 Diagnostic lors de l'import

Lors de votre prochain import, **ouvrez la console (F12)** et cherchez les lignes :

```
❌ VALIDATION ÉCHOUÉE : "Protocole " ne correspond à aucune option valide : [...]
   → La colonne sera OMISE et Monday utilisera sa valeur par défaut !
```

Ces logs vous indiqueront **EXACTEMENT** quelle valeur a été rejetée et pourquoi.

**Exemple :**
```
❌ VALIDATION ÉCHOUÉE : "Noces d Or" ne correspond à aucune option valide : 
   ["Culture", "Animation de quartier", ..., "Noces d'Or - Etat Civil", ...]
   → La colonne sera OMISE et Monday utilisera sa valeur par défaut !
```

**Solution :** Remplacer `"Noces d Or"` par `"Noces d'Or - Etat Civil"` dans votre Excel.

---

## 📊 Fuzzy matching automatique

Le système tente maintenant de corriger automatiquement certaines erreurs courantes :

**Tolérances automatiques :**
- ✅ Espaces en trop avant/après : `" Culture "` → `"Culture"`
- ✅ Majuscules/minuscules : `"culture"` → `"Culture"`
- ✅ Accents manquants : `"Validee"` → `"Validée"`
- ✅ Espaces au lieu de tirets : `"Malo les Bains"` → `"Malo-les-Bains"`
- ✅ Guillemets courbes vs droits : `"Animation "Grand Public""` → `"Animation "Grand Public""`

**❌ Mais ne tolère PAS :**
- Abréviations : "Proto" ≠ "Protocole"
- Mots manquants : "Animation" ≠ "Animation de quartier"
- Ordre différent : "Grand Public Animation" ≠ "Animation "Grand Public""

---

## ✅ Checklist avant import

- [ ] J'ai vérifié que toutes mes valeurs correspondent **exactement** aux listes ci-dessus
- [ ] J'ai utilisé **Copier-coller** depuis ce document pour garantir la casse
- [ ] J'ai vérifié les **accents** (é, è, à, ë, etc.)
- [ ] J'ai vérifié les **guillemets** (droits `"`, pas courbes `"`)
- [ ] J'ai vérifié les **apostrophes** (droites `'`, pas courbes `'`)
- [ ] J'ai vérifié les **espaces** autour des `/` et `-`
- [ ] J'ai supprimé tous les espaces en début/fin de cellule
- [ ] J'ai testé avec un fichier minimal avant d'importer tout

---

**Si vous suivez ces règles strictement, vos événements seront importés avec les bonnes valeurs et ne passeront plus tous en "Protocole" !** ✅
