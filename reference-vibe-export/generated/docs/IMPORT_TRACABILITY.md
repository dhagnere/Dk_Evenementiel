# 📊 Traçabilité de l'import - Dunkerque Events Calendar

## Garanties de traçabilité

### ✅ Chaque ligne du fichier est comptabilisée

Lors d'un import, **100% des lignes** du fichier sont traitées et classées dans **exactement une** de ces trois catégories :

| Statut | Description | Compteur |
|--------|-------------|----------|
| **✅ Créé** | Nouvelle ligne insérée dans le board | `totalCreated` |
| **⏭️ Ignoré** | Doublon (déjà présent dans le board OU dans le fichier) | `totalSkipped` |
| **❌ Échec** | Erreur technique lors de la création | `totalFailed` |

**Équation de traçabilité :**
```
totalCreated + totalSkipped + totalFailed = Nombre de lignes du fichier
```

Cette équation est **vérifiée automatiquement** à chaque import et affichée dans les logs.

---

## 🔍 Vérification manuelle

### Dans la console navigateur (F12)

Après chaque import, recherchez ces logs :

```
📊 VÉRIFICATION FINALE:
   • Lignes du fichier: 250
   • Créées: 180
   • Ignorées (doublons): 68
   • Échecs: 2
   • TOTAL COMPTABILISÉ: 250
✅ TRAÇABILITÉ OK: 100% des lignes comptabilisées
```

### Dans le dialog de résultats

Un bandeau bleu confirme :
```
✅ Traçabilité : 100% des lignes comptabilisées
250 lignes traitées
```

---

## 🚨 Que se passe-t-il en cas d'incohérence ?

Si `totalCreated + totalSkipped + totalFailed ≠ Lignes du fichier` :

1. **Log d'alerte dans la console** :
   ```
   ❌ ERREUR DE TRAÇABILITÉ: 5 lignes perdues !
   ```

2. **Action recommandée** :
   - Vérifiez la console pour identifier les lignes problématiques
   - Contactez le support technique avec le fichier d'import et les logs

---

## 📋 Détails des statuts

### ✅ **Créé** (`totalCreated`)

Une ligne est créée si :
- ✅ Elle a un **nom** (colonne obligatoire)
- ✅ Elle n'existe **pas déjà** dans le board (clé : nom + date début + lieu)
- ✅ Elle n'est **pas un doublon** dans le fichier lui-même

**Résultat :** Un nouvel item est inséré dans le board avec un ID auto-généré `EVT-YYYY-NNNN`.

---

### ⏭️ **Ignoré** (`totalSkipped`)

Une ligne est ignorée dans **trois cas** :

#### 1. Doublon dans le board
```
⏭️ DOUBLON EXISTANT (IGNORÉ - toutes les données préservées) :
   ID board: 5101295226
   Nom: "Carnaval de Dunkerque"
   Date début: 2026-03-15
   Lieu: Grand Place
   ✅ Validations et autres données conservées intactes
```

- L'événement **existe déjà** dans le board
- **Toutes ses données** (statut, validations, organisateur, etc.) sont **préservées intactes**
- La ligne est **comptée** mais **aucune modification** n'est apportée

#### 2. Doublon dans le fichier
```
⚠️ DOUBLON DANS LE FICHIER (ignoré) :
   Nom: "Concert de Jazz"
   Date début: 2026-06-10
   Lieu: Casino
   Clé de déduplication: concert_de_jazz_2026-06-10_casino
```

- Le fichier contient **deux lignes identiques** (même nom + date + lieu)
- Seule la **première occurrence** est traitée (créée ou ignorée selon qu'elle existe déjà)
- Les occurrences suivantes sont **ignorées et comptées**

#### 3. Ligne invalide (nom manquant)
```javascript
if (!eventName) { skipped++; continue; }
```

- La ligne n'a **pas de nom** (colonne vide ou absente)
- Elle est **comptée comme ignorée** (pas comme échec)

---

### ❌ **Échec** (`totalFailed`)

Une ligne est en échec si :
- ✅ Elle devait être créée (pas un doublon)
- ❌ Mais l'appel API Monday.com a échoué (erreur réseau, timeout, etc.)

**Résultat :** La ligne est **comptée mais PAS insérée** dans le board.

**Log d'erreur :**
```
❌ ERREURS D'IMPORT :
• Batch 3, item 0: API error: 500 Internal Server Error
• Batch 5, item 2: Network timeout
```

**Action recommandée :** Réimportez le fichier. Les lignes en échec seront créées, les autres seront détectées comme doublons.

---

## 🧮 Exemple concret

### Fichier : `events-janvier.csv` (250 lignes)

| Ligne | Contenu | Traitement | Statut |
|-------|---------|------------|--------|
| 1 | Carnaval (15/03) | Nouveau → Créé | ✅ Créé |
| 2 | Jazz Festival (10/06) | Nouveau → Créé | ✅ Créé |
| 3 | Carnaval (15/03) | Doublon fichier | ⏭️ Ignoré |
| 4-180 | Nouveaux événements | Créés | ✅ Créé (177) |
| 181-248 | Événements existants | Doublons board | ⏭️ Ignoré (68) |
| 249 | Marathon (01/05) | Erreur API | ❌ Échec |
| 250 | (nom vide) | Invalide | ⏭️ Ignoré |

**Résultat :**
```
✅ Créés:   180  (lignes 1, 2, 4-180)
⏭️ Ignorés:  68  (lignes 3, 181-248, 250)
❌ Échecs:    2  (ligne 249)
───────────────
TOTAL:      250  ✅ 100%
```

---

## 🛡️ Garanties système

### 1. Atomicité par ligne
- Chaque ligne est traitée **indépendamment**
- Un échec sur une ligne **n'affecte pas** les autres

### 2. Déduplication intelligente
- Clé composite : **Nom + Date début + Lieu**
- Permet plusieurs événements avec le même nom le même jour (si lieux différents)
- Exemples valides :
  ```
  ✅ "Concert" le 15/06 à "Casino"       → Item A
  ✅ "Concert" le 15/06 à "Grand Place"  → Item B (lieu différent, donc pas un doublon)
  ✅ "Concert" le 16/06 à "Casino"       → Item C (date différente)
  ```

### 3. Logs détaillés
- Chaque doublon → log avec détails (nom, date, lieu, clé)
- Chaque échec → log avec erreur et numéro de ligne
- Compteurs finaux → vérification mathématique

---

## 📞 Support

En cas de doute sur la traçabilité :
1. Ouvrez la console (F12) et copiez les logs
2. Notez les compteurs affichés dans le dialog
3. Comparez avec le nombre de lignes du fichier (visible dans Excel/LibreOffice)
4. Contactez le support avec ces informations

**La garantie de traçabilité à 100% est une priorité système.**
