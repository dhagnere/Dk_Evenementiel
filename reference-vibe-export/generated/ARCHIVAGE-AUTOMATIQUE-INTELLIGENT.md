# 🗃️ Archivage Automatique Intelligent

**Fonctionnalité :** Archivage automatique des événements passés avec gestion intelligente des séries contiguës.

---

## 🎯 Objectif

Lors de l'import d'un fichier contenant toutes les dates depuis janvier 2026 :
- **Archiver automatiquement** tous les événements dont la date est passée
- **MAIS préserver** les séries multi-jours en cours (même si certaines dates sont passées)

---

## 🧠 Logique Intelligente

### Règle 1 : Événement Isolé

Un événement **seul** (pas de série) est archivé si sa `dateDeFin < aujourd'hui`.

**Exemple :**
```
Marché de Noël : 01/12/2025
Aujourd'hui : 31/08/2026
→ ARCHIVÉ ✅ (événement isolé terminé)
```

---

### Règle 2 : Série Contiguë en Cours

Une **série** (même nom + lieu) est archivée **UNIQUEMENT** si **TOUTES ses dates** sont passées.

**Exemple 1 : Série en cours**
```
DUCASSE DE ROSENDAEL (Rosendaël) :
  - 29/08/2026
  - 30/08/2026
  - 31/08/2026
  - 01/09/2026
  - ...
  - 06/09/2026

Aujourd'hui : 31/08/2026

→ PAS ARCHIVÉ ❌
Raison : La série continue jusqu'au 06/09 (dates futures)
```

**Exemple 2 : Série terminée**
```
DUCASSE DE ROSENDAEL (Rosendaël) :
  - 29/08/2026
  - 30/08/2026
  - ...
  - 06/09/2026

Aujourd'hui : 07/09/2026

→ ARCHIVÉ ✅
Raison : Toutes les dates sont passées (dernière date = 06/09 < 07/09)
```

---

### Règle 3 : Événements Annulés

Les événements avec `statut = "Annulée"` sont **toujours ignorés** (jamais archivés automatiquement).

---

## 🔧 Fonctionnement Technique

### Détection de Série

Deux événements appartiennent à la **même série** s'ils ont :
- Le même **nom** (normalisé : minuscules, sans accents)
- Le même **lieu** (normalisé : minuscules, sans accents)

**Clé de série :** `nom|lieu`

**Exemple :**
```
"ducasse de rosendael|rosendael"
"marche de noel|centre ville"
```

---

### Vérification de Date

Pour chaque série, on extrait la **dernière date de fin** :
```javascript
const lastDate = series
  .map(event => event.dateDeFin)
  .sort((a, b) => b - a)[0]; // Trier par ordre décroissant

const aujourdhui = new Date();
aujourdhui.setHours(0, 0, 0, 0);

if (lastDate < aujourdhui) {
  // Toutes les dates sont passées → archiver
} else {
  // Certaines dates sont futures → conserver
}
```

---

## 📊 Exemple Complet

### Situation

**Fichier Excel importé le 31/08/2026 :**
- 200 événements depuis janvier 2026
- DUCASSE : 31 lignes (29/08 → 06/09)
- Carnaval : 3 lignes (15/03 → 17/03)
- 150 autres événements isolés (50 passés, 100 futurs)

---

### Résultat de l'Analyse

```
📊 AUTO-ARCHIVAGE DES ÉVÉNEMENTS PASSÉS

📋 200 événements à analyser
📋 152 séries détectées

📊 RÉSULTAT DE L'ANALYSE:
   • À archiver : 53 événements
   • À conserver : 147 événements

📋 DÉTAIL PAR SÉRIE:
   ✅ Conservé (série en cours : 29/08/2026 → 06/09/2026) - "DUCASSE" (Rosendaël): 31 événements
   🗃️ À archiver (série terminée le 17/03/2026) - "Carnaval" (Centre): 3 événements
   🗃️ À archiver (terminé) - "Marché Noël" (Place): 1 événement
   ✅ Conservé (futur) - "Fête Musique" (Kiosque): 1 événement
   ...
```

---

### Archivage Effectif

```
🗃️ ARCHIVAGE EN COURS...
   ✅ Archivé : "Carnaval" (Série complètement terminée - 3 événements)
   ✅ Archivé : "Marché Noël" (Événement isolé terminé)
   ✅ Archivé : "Foire" (Événement isolé terminé)
   ...

✅ ARCHIVAGE TERMINÉ : 53/53 événements archivés

📊 Résultat final :
   • 53 archivés automatiquement
   • 147 conservés (futurs ou séries en cours)
```

---

## 🎨 Interface Utilisateur

### Option d'Import

Dans le dialog d'import, une nouvelle checkbox :

```
☑️ Archiver automatiquement les événements passés

Après l'import, archive les événements dont la date est passée 
(sauf les séries contiguës en cours)

✨ Intelligent : une série multi-jours (ex: DUCASSE 29/08→06/09) 
   n'est archivée que si TOUTES les dates sont passées
```

**Par défaut :** ✅ Activé (recommandé pour garder le board propre)

---

### Dialog de Résultats

Après l'import, une nouvelle section :

```
┌─────────────────────────────────────────┐
│ 🗃️ Archivage automatique              │
├─────────────────────────────────────────┤
│ Événements archivés : 53                │
│ Événements conservés : 147              │
│                                         │
│ Détail par série :                      │
│ • DUCASSE (Rosendaël)                  │
│   ✅ Conservé (série en cours : 29/08  │
│      → 06/09)                          │
│ • Carnaval (Centre)                    │
│   🗃️ À archiver (série terminée le    │
│      17/03)                            │
│                                         │
│ ✨ Archivage intelligent : Les séries  │
│ multi-jours en cours sont conservées   │
│ jusqu'à ce que TOUTES leurs dates      │
│ soient passées.                        │
└─────────────────────────────────────────┘
```

---

## 🚀 Utilisation

### Scénario 1 : Import Mensuel

**Contexte :**
Vous importez chaque mois un fichier Excel complet avec toutes les dates.

**Processus :**
1. Cochez "Archiver automatiquement les événements passés"
2. Importez le fichier
3. Le système archive automatiquement les événements terminés
4. Les séries en cours restent visibles

**Avantage :**
Le board reste propre sans intervention manuelle.

---

### Scénario 2 : Import Annuel

**Contexte :**
Vous importez un fichier avec toutes les dates de l'année (janvier → décembre 2026).

**Date d'import :** 31/08/2026

**Résultat :**
- Janvier → Août : archivés automatiquement (sauf séries en cours)
- DUCASSE (29/08→06/09) : conservée (série en cours)
- Septembre → Décembre : tous conservés (futurs)

---

### Scénario 3 : Mode Dry-Run (Test)

Si vous voulez **prévisualiser** sans archiver :

```javascript
await autoArchivePassedEvents({ data: { dryRun: true } });
```

**Résultat :**
```
🔍 DRY RUN : 53 événements SERAIENT archivés
   • "Carnaval" - Série complètement terminée (3 événements)
   • "Marché Noël" - Événement isolé terminé
   ... et 51 autres
```

Aucun événement n'est archivé, juste un rapport.

---

## 🔍 Logs de Debug

### Console Logs

```
🗂️ AUTO-ARCHIVAGE DES ÉVÉNEMENTS PASSÉS

📊 200 événements à analyser
📋 152 séries détectées

📊 RÉSULTAT DE L'ANALYSE:
   • À archiver : 53 événements
   • À conserver : 147 événements

📋 DÉTAIL PAR SÉRIE:
   ✅ Conservé (série en cours : 29/08/2026 → 06/09/2026) - "DUCASSE" (Rosendaël): 31 événements
   🗃️ À archiver (série terminée le 17/03/2026) - "Carnaval" (Centre): 3 événements
   ...

🗃️ ARCHIVAGE EN COURS...
   ✅ Archivé : "Carnaval" (Série complètement terminée (3 événements))
   ✅ Archivé : "Marché Noël" (Événement isolé terminé (01/12/2025 < 31/08/2026))
   ...

✅ ARCHIVAGE TERMINÉ : 53/53 événements archivés
```

---

## ⚙️ API

### Fonction Serveur

**Fichier :** `server/auto-archive.ts`

#### `autoArchivePassedEvents`

```typescript
await autoArchivePassedEvents({ 
  data: { 
    dryRun: false,           // true = simulation, false = archivage réel
    estLectureSeule: false   // true = bloqué (utilisateur sans permission)
  } 
});
```

**Retour :**
```typescript
{
  archived: number;          // Nombre d'événements archivés
  kept: number;              // Nombre d'événements conservés
  toArchiveCount: number;    // Nombre total à archiver (= archived si dryRun = false)
  series: Array<{            // Détail par série
    nom: string;
    lieu: string;
    count: number;
    status: string;          // "🗃️ À archiver..." ou "✅ Conservé..."
  }>;
  dryRun: boolean;
}
```

---

#### `previewAutoArchive`

Alias pour `autoArchivePassedEvents` avec `dryRun: true`.

```typescript
await previewAutoArchive();
```

---

## 🛡️ Sécurité

### Permissions

L'archivage automatique est **bloqué** si :
- Mode lecture seule activé (`estLectureSeule = true`)
- Utilisateur sans permission d'écriture (`!garderEcriture()`)

**Message :**
```
❌ Auto-archivage bloqué : mode lecture seule
❌ Auto-archivage bloqué : permissions insuffisantes
```

---

### Événements Annulés

Les événements avec `statut = "Annulée"` sont **toujours ignorés** :
```javascript
if (event.statut === 'Annulée') continue; // Ne jamais archiver
```

**Raison :** Les événements annulés peuvent avoir été annulés pour des raisons autres que leur date.

---

## 💡 Cas Particuliers

### Événement sans Date de Fin

Si `dateDeFin = null` :
```
→ PAS ARCHIVÉ ❌
Raison : Pas de date de fin
```

---

### Série avec Dates Non Contiguës

**Exemple :**
```
Festival de Musique (Place) :
  - 15/03/2026
  - 16/03/2026
  - 22/03/2026 (gap de 6 jours)
```

**Traitement :**
- Tous considérés comme la **même série** (même nom + lieu)
- Archivés UNIQUEMENT si la dernière date (22/03) est passée

**Note :** La fusion automatique ne les fusionne pas (gap > 1 jour), mais l'archivage les traite comme une série.

---

## 🎯 Avantages

### 1. Board Propre Automatiquement

Plus besoin d'archiver manuellement les événements passés après chaque import.

---

### 2. Séries Protégées

Les événements multi-jours en cours restent visibles même si leurs premières dates sont passées.

**Exemple concret :**
```
DUCASSE du 29/08 au 06/09
Aujourd'hui = 31/08

Sans l'archivage intelligent :
❌ Les items du 29/08 et 30/08 seraient archivés
❌ La série apparaît incomplète dans le calendrier
❌ Confusion pour les utilisateurs

Avec l'archivage intelligent :
✅ Toute la série reste visible jusqu'au 06/09
✅ Le calendrier affiche l'événement complet
✅ Pas de confusion
```

---

### 3. Performance

Archiver les vieux événements améliore les performances du board :
- Moins d'items à charger
- Requêtes plus rapides
- Interface plus réactive

---

## 📅 Planning d'Archivage

### Automatique à l'Import

**Quand :** Juste après la création des événements

**Déclencheur :** Checkbox activée dans le dialog d'import

---

### Manuel à la Demande

Vous pouvez aussi déclencher l'archivage manuellement :

1. Dans le dialog d'import
2. Cochez "Archiver automatiquement"
3. NE sélectionnez PAS de fichier
4. Cliquez "Exécuter les traitements"

**Résultat :** Les événements passés sont archivés sans importer de nouveau fichier.

---

## ✅ Checklist de Vérification

Avant d'activer l'archivage automatique, vérifiez :

- [ ] Toutes les dates de fin sont renseignées correctement
- [ ] Les séries multi-jours ont bien le même nom + lieu
- [ ] Vous avez les permissions d'archiver
- [ ] Vous n'êtes pas en mode lecture seule
- [ ] Vous comprenez que les événements archivés ne seront plus visibles par défaut

---

## 🔄 Désarchivage

Si vous archivez par erreur, vous pouvez désarchiver depuis monday.com :

1. Aller dans le board
2. Filtres → "Afficher les éléments archivés"
3. Sélectionner l'événement
4. Menu → "Désarchiver"

**Note :** L'application n'a pas de fonction de désarchivage automatique.

---

## 🎉 Conclusion

L'archivage automatique intelligent vous permet de :

✅ Garder un board propre automatiquement  
✅ Protéger les séries en cours  
✅ Améliorer les performances  
✅ Gagner du temps  

**Activez-le par défaut lors de vos imports mensuels ! 🚀**
