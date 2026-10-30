# ✅ Vérification d'import — Comment s'assurer qu'aucun événement n'est oublié

## 🎯 Vue d'ensemble

Après un import de fichier CSV/Excel, vous voulez être **100% certain** que tous les événements du fichier sont bien dans le board Monday. Ce guide explique comment vérifier exhaustivement votre import.

---

## 📊 Méthode 1 : Dialogue de résultats détaillés

### **Après chaque import, un dialogue s'affiche automatiquement**

```
✅ Import terminé avec succès !

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 RÉSUMÉ DE L'IMPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📥 Événements créés : 487
🔄 Événements mis à jour : 12
⏭️ Événements ignorés : 3
❌ Échecs : 0

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DÉTAIL DES ÉVÉNEMENTS CRÉÉS (487)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Fête de quartier (15/08/2026)
✅ Concert d'été (20/08/2026)
✅ Marché de Noël (01/12/2026)
...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DÉTAIL DES ÉVÉNEMENTS MIS À JOUR (12)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 Brocante du centre (10/09/2026)
🔄 Assemblée de quartier (15/09/2026)
...
```

---

## 🔢 Méthode 0 : Contrôle par numéro d'ID (NOUVEAU ✨)

### **Contrôle visuel rapide via les IDs auto-générés**

Après un import, **tous les événements créés reçoivent un ID unique** au format `EVT-ANNÉE-XXXX`.

**Exemple :**
```
EVT-2026-0001 → Premier événement créé en 2026
EVT-2026-0002 → Deuxième événement créé en 2026
...
EVT-2026-0487 → 487ème événement créé en 2026
```

### **Où voir ces IDs ?**

#### **1. Vue Liste** 📋
- Colonne **"ID Événement"** (première colonne)
- Tri possible par ID pour voir la séquence
- Panneau détails → ID affiché sous le titre

#### **2. Vue Calendrier** 📅
- Cliquez sur une date
- Sous chaque nom d'événement → **ID en bleu** (police monospace)

#### **3. Vue Conflits** ⚠️
- Sous chaque nom d'événement → **ID en bleu**

### **Comment contrôler l'import avec les IDs ?**

#### **Étape 1 : Notez le dernier ID avant import**

1. Allez dans **Vue Liste**
2. Triez par **"ID Événement"** (décroissant)
3. Notez le dernier ID, par exemple : `EVT-2026-0041`

#### **Étape 2 : Lancez l'import**

Importez votre fichier avec 487 événements.

#### **Étape 3 : Vérifiez le nouvel ID max**

1. Retournez dans **Vue Liste**
2. Triez par **"ID Événement"** (décroissant)
3. Le premier ID devrait être : `EVT-2026-0528`

**Calcul :**
```
Dernier ID avant import : EVT-2026-0041
Événements importés     : 487
Nouvel ID max attendu   : EVT-2026-0528 (41 + 487)

✅ Si l'ID max = EVT-2026-0528 → Tous les événements ont été importés
❌ Si l'ID max = EVT-2026-0450 → Il manque des événements (528 - 450 = 78 manquants)
```

#### **Étape 4 : Vérifiez la séquence**

Dans la **Vue Liste**, triez par **ID croissant** et vérifiez qu'il n'y a **pas de trous** dans la numérotation :

```
EVT-2026-0042  ✅
EVT-2026-0043  ✅
EVT-2026-0044  ✅
...
EVT-2026-0527  ✅
EVT-2026-0528  ✅
```

**Si vous voyez :**
```
EVT-2026-0042  ✅
EVT-2026-0043  ✅
EVT-2026-0045  ❌ Trou ! EVT-2026-0044 manquant
```
→ Un événement n'a pas été créé (échec ou ignoré).

### **Avantages de cette méthode**

- ✅ **Visuel** → Pas besoin de calculs complexes
- ✅ **Rapide** → Un coup d'œil suffit
- ✅ **Fiable** → Les IDs ne mentent jamais
- ✅ **Séquentiel** → Facile de détecter les trous

### **Comment lire ce dialogue ?**

#### **1. Événements créés** ✅
```
Nouveaux événements ajoutés au board Monday
```

**Ce qui est compté :**
- Événements qui n'existaient PAS dans le board avant l'import
- Basé sur la clé de déduplication : `nom + date début + lieu + organisateur`

#### **2. Événements mis à jour** 🔄
```
Événements déjà présents dans le board, mis à jour avec les nouvelles données
```

**Ce qui est compté :**
- Événements qui existaient DÉJÀ dans le board
- Les données (statut, quartier, nature, etc.) ont été actualisées

#### **3. Événements ignorés** ⏭️
```
Lignes du fichier non importées
```

**Raisons d'ignorer :**
- ❌ Nom d'événement vide ou manquant
- ❌ Doublon DANS le fichier (même nom + même date + même lieu + même organisateur)

**Exemple :**
```
Votre fichier contient :
Ligne 1 : "Fête de quartier" le 15/08/2026 à Rosendaël → ✅ Importé
Ligne 2 : "Fête de quartier" le 15/08/2026 à Rosendaël → ⏭️ Ignoré (doublon)
Ligne 3 : (nom vide) → ⏭️ Ignoré (nom manquant)
```

#### **4. Échecs** ❌
```
Erreurs lors de la création/mise à jour
```

**Si > 0 :** Consultez les logs console (F12) pour les détails.

---

## 🧮 Méthode 2 : Formule de vérification

### **Calcul automatique**

```
Événements dans le fichier = Créés + Mis à jour + Ignorés + Échecs
```

**Exemple :**
```
Fichier : 502 lignes (hors en-tête)

Résultat import :
- Créés : 487
- Mis à jour : 12
- Ignorés : 3
- Échecs : 0

Vérification :
487 + 12 + 3 + 0 = 502 ✅ TOUS les événements ont été traités
```

### **Si les comptes ne correspondent pas**

```
Fichier : 502 lignes
Créés + Mis à jour + Ignorés + Échecs = 490

❌ 12 événements manquants !
```

**Action :** Consultez les logs console (F12) pour identifier les lignes problématiques.

---

## 🔍 Méthode 3 : Logs console détaillés (F12)

### **Ouvrir la console**

1. Appuyez sur **F12** (ou clic droit → "Inspecter")
2. Allez dans l'onglet **Console**
3. Lancez l'import

### **Logs à surveiller**

#### **Phase 1 : Parsing**
```
Parsed 502 rows
```
→ Nombre de lignes détectées dans le fichier (hors en-tête)

#### **Phase 2 : Classification**
```
Create: 487, Update: 12, Skip: 3
```
→ Répartition AVANT création

#### **Phase 3 : Déduplication dans le fichier**
```
⚠️ Doublon détecté dans le fichier : "Fête de quartier" le 2026-08-15 à Rosendaël
⚠️ Doublon détecté dans le fichier : "Concert d'été" le 2026-08-20 à Centre-ville
```
→ Événements ignorés (présents plusieurs fois dans votre fichier)

#### **Phase 4 : Création par batch**
```
Creating batch 1/20...
Creating item EVT-2026-0001 with data: nom, dateDeDbut, dateDeFin, lieu, quartier
Creating item EVT-2026-0002 with data: nom, dateDeDbut, dateDeFin, lieu, quartier
...
Creating batch 2/20...
Creating item EVT-2026-0026 with data: nom, dateDeDbut, dateDeFin, lieu, quartier
```
→ Chaque événement créé est listé individuellement

#### **Phase 5 : Résultat final**
```
Events loaded after import: 528
=== IMPORT DONE ===
```
→ Nombre total d'événements dans le board après import

---

## 📋 Méthode 4 : Comparaison fichier ↔ board

### **Étape 1 : Compter les lignes du fichier source**

#### **Excel / LibreOffice**
```
1. Ouvrez le fichier
2. Descendez jusqu'à la dernière ligne avec des données
3. Notez le numéro de ligne (ex : 503)
4. Soustrayez 1 (en-tête) : 503 - 1 = 502 événements
```

#### **Notepad++ / VS Code**
```
1. Ouvrez le fichier CSV
2. Regardez en bas à droite : "Ln 503, Col 1"
3. Soustrayez 1 (en-tête) : 503 - 1 = 502 événements
```

### **Étape 2 : Compter les événements dans Monday**

#### **Via l'application**
```
KPI "Total affiché" en haut à droite
```
⚠️ **Attention :** Ce total est **après déduplication** et **exclut les événements passés**.

**Pour compter TOUS les événements (y compris doublons et passés) :**

1. Allez dans la **vue Liste**
2. Cochez **"Afficher les événements passés"**
3. Décochez tous les filtres (Quartier, Nature, Statut)
4. Le **KPI "Total affiché"** reflète maintenant TOUS les événements uniques

#### **Via Monday directement**
```
1. Ouvrez le board "extraction-kiosk" dans Monday
2. En bas de la liste : "Showing X items"
3. Ce nombre inclut TOUS les items (doublons + passés)
```

### **Étape 3 : Comparer**

```
Fichier source : 502 événements
Board Monday   : 528 événements

Différence : 528 - 502 = 26 événements en plus
```

**Explication :** Le board contenait déjà 26 événements avant l'import. Ils ont été conservés.

---

## 🧪 Méthode 5 : Test avec un petit échantillon

### **Avant d'importer 14 000 lignes…**

1. **Créez un fichier test avec 10 lignes**
2. **Importez-le**
3. **Vérifiez manuellement** que les 10 événements sont bien dans Monday
4. **Si OK** → Importez le fichier complet

### **Exemple de fichier test**

```csv
Nom;Date de début;Date de fin;Lieu;Quartier;Nature;Organisateur
Test Event 1;2026-08-15;2026-08-15;Centre-ville;Dunkerque - Centre;Culture;Ville
Test Event 2;2026-08-16;2026-08-16;Rosendaël;Rosendaël;Sport;CUD
Test Event 3;2026-08-17;2026-08-17;Malo;Malo-les-Bains;Jeunesse;Associatif
...
```

**Après import :**
- Allez dans Monday
- Recherchez "Test Event 1", "Test Event 2", etc.
- ✅ Si tous sont présents → Le processus fonctionne

---

## ⚠️ Cas particuliers

### **Cas 1 : Doublons dans le fichier**

**Situation :**
```
Fichier : 502 lignes
Import  : 487 créés + 12 mis à jour = 499
Manquants : 3
```

**Explication :**
Les 3 lignes manquantes sont des **doublons DANS le fichier** (même nom + même date + même lieu + même organisateur).

**Log console :**
```
⚠️ Doublon détecté dans le fichier : "Fête de quartier" le 2026-08-15 à Rosendaël
⚠️ Doublon détecté dans le fichier : "Concert d'été" le 2026-08-20 à Centre-ville
⚠️ Doublon détecté dans le fichier : "Marché de Noël" le 2026-12-01 à Centre-ville
```

**Action :** C'est **normal et voulu**. Le système évite de créer des doublons.

---

### **Cas 2 : Événements sans nom**

**Situation :**
```
Fichier : 502 lignes
Import  : 500 créés
Ignorés : 2
```

**Explication :**
2 lignes du fichier ont la colonne "Nom" vide.

**Log console :**
```
⚠️ Ligne 45 ignorée : nom vide
⚠️ Ligne 127 ignorée : nom vide
```

**Action :** Complétez les noms manquants dans le fichier source et réimportez.

---

### **Cas 3 : Mise à jour d'événements existants**

**Situation :**
```
Fichier : 502 événements
Import  : 487 créés + 15 mis à jour = 502 ✅
```

**Explication :**
15 événements du fichier existaient DÉJÀ dans le board. Leurs données ont été mises à jour (statut, quartier, etc.) au lieu de créer des doublons.

**Comment identifier les événements mis à jour ?**

Dans le dialogue de résultats :
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DÉTAIL DES ÉVÉNEMENTS MIS À JOUR (15)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔄 Brocante du centre (10/09/2026)
🔄 Assemblée de quartier (15/09/2026)
...
```

---

## 🎓 Checklist de vérification complète

### **Avant l'import**

- [ ] J'ai compté le nombre de lignes dans mon fichier (hors en-tête)
- [ ] J'ai vérifié qu'aucune ligne n'a de nom vide
- [ ] J'ai vérifié qu'il n'y a pas de doublons évidents dans mon fichier
- [ ] J'ai testé avec un petit échantillon (10 lignes)

### **Pendant l'import**

- [ ] J'ai ouvert la console (F12) pour suivre les logs
- [ ] J'attends la fin complète (le dialogue de résultats apparaît)
- [ ] Je ne ferme pas la fenêtre avant la fin

### **Après l'import**

- [ ] Je lis le dialogue de résultats détaillés
- [ ] Je vérifie : **Créés + Mis à jour + Ignorés = Lignes du fichier**
- [ ] Je consulte les logs console pour les warnings/erreurs
- [ ] Je compare le KPI "Total affiché" avec mon fichier (après déduplication)
- [ ] Si des événements sont marqués "Ignorés", je comprends pourquoi (doublons ou nom vide)

---

## 📞 Que faire si des événements manquent ?

### **Étape 1 : Identifier les manquants**

1. Ouvrez la console (F12)
2. Cherchez les warnings `⚠️` dans les logs
3. Notez les noms/dates des événements ignorés

### **Étape 2 : Corriger le fichier source**

- Complétez les noms vides
- Supprimez les doublons
- Vérifiez les dates au format correct

### **Étape 3 : Réimporter uniquement les manquants**

1. Créez un nouveau fichier CSV avec **uniquement** les événements manquants
2. Importez ce petit fichier
3. Le système les ajoutera sans dupliquer les autres

---

## 🧮 Formule de calcul récapitulative

```
┌─────────────────────────────────────────────────────────────┐
│  VÉRIFICATION D'IMPORT                                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Lignes du fichier (hors en-tête)                          │
│        =                                                    │
│  Événements créés                                           │
│    + Événements mis à jour                                  │
│    + Événements ignorés (doublons + noms vides)             │
│    + Échecs                                                 │
│                                                             │
│  Si cette égalité est vraie → ✅ Aucun événement oublié    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📖 Ressources

- [`README.md`](./README.md) — Documentation générale
- [`IMPORT-GUIDE.md`](./IMPORT-GUIDE.md) — Guide complet d'import
- [`FORMAT-IMPORT.md`](./FORMAT-IMPORT.md) — Format attendu
- [`KPI-EXPLICATION.md`](./KPI-EXPLICATION.md) — Explication des KPI

---

**✅ Avec cette checklist, vous avez toutes les clés pour être certain qu'aucun événement n'est oublié lors de l'import !**
