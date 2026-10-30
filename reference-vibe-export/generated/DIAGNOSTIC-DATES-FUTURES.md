# 🔍 Diagnostic : Tous les Événements Sont Futurs

## ❌ Problème Identifié

```
[Calendar] Events with dateDeFin < today: 0/900
[Filter] Split into: 755 active events + 0 archived events
```

**Traduction :** Sur 900 événements, **AUCUN** n'a une `dateDeFin` antérieure à aujourd'hui.

---

## 🧐 Pourquoi C'est un Problème

La logique d'archivage fonctionne ainsi :

```javascript
function estArchive(event) {
  const aujourdhui = new Date(); // Ex: 1er septembre 2026
  const dateFin = new Date(event.dateDeFin);
  
  return dateFin < aujourdhui;
}
```

**Si tous vos événements ont des dates >= 1er septembre 2026, aucun ne sera détecté comme "archivé".**

---

## 🔍 Vérification Immédiate

### **Panneau de Debug Étendu**

Un nouveau panneau orange est maintenant visible en haut du calendrier :

```
🔍 DEBUG COMPLET : Date & Événements (0 archivés détectés) [ouvert par défaut]

┌─────────────────────────────────────────────┐
│ 📅 Date actuelle du système                 │
│ lundi 1er septembre 2026                    │
│                                             │
│ Un événement est archivé si :               │
│ dateDeFin < 01/09/2026                      │
└─────────────────────────────────────────────┘

📋 Exemples d'événements (5 premiers) :

┌─────────────────────────────────────────────┐
│ Événement 1 : DUCASSE                       │
│ ✅ ACTIF (futur)                            │
│ Date fin: 2026-09-06                        │
│ dateFin (06/09/2026) >= aujourd'hui (01/09) │
│ Lieu: Centre-ville                          │
├─────────────────────────────────────────────┤
│ Événement 2 : Marché de Noël                │
│ ✅ ACTIF (futur)                            │
│ Date fin: 2026-12-24                        │
│ dateFin (24/12/2026) >= aujourd'hui (01/09) │
│ Lieu: Place Jean Bart                       │
└─────────────────────────────────────────────┘
```

**Ce que vous devez voir :**
- La date actuelle du système
- 5 exemples d'événements
- Pour chaque événement : est-il PASSÉ (🗃️) ou ACTIF (✅) ?

---

## 📊 Résultats Attendus

### **Cas 1 : Tous les événements sont futurs (situation actuelle)**

```
5 exemples affichés
✅ Tous marqués "ACTIF (futur)"
✅ Toutes les dates > 01/09/2026
```

**Diagnostic :** Normal si vous êtes en septembre 2026 et que vos événements sont pour octobre-décembre 2026.

**Solution :** Attendez que les dates passent, OU importez des événements de janvier-août 2026.

---

### **Cas 2 : Certains événements DEVRAIENT être passés**

```
Exemple :
│ Carnaval - Date fin: 2026-03-15            │
│ ✅ ACTIF (futur) ← PROBLÈME!                │
│ dateFin (15/03/2026) >= aujourd'hui (01/09) │ ← IMPOSSIBLE!
```

**Diagnostic :** La date système est incorrecte, OU la date de l'événement est mal formatée.

**Solution :** Vérifiez :
1. La date de votre ordinateur (Windows : barre des tâches, macOS : menu)
2. Dans Monday.com, ouvrez l'événement et vérifiez la colonne "Date de fin"

---

## 🧪 Test Simple

### **Créez un événement passé manuellement :**

1. Allez dans **Monday.com** → Board "extraction-kiosk"
2. Créez un nouvel item :
   ```
   Nom : TEST ARCHIVE MANUEL
   Date début : 28/08/2026
   Date fin : 29/08/2026 (HIER)
   Lieu : Test
   Statut : Validée
   ```
3. **Sauvegardez**
4. Revenez dans l'app → Rafraîchissez (F5)
5. **Regardez** le panneau de debug

**Résultat attendu :**
```
│ TEST ARCHIVE MANUEL                         │
│ 🗃️ PASSÉ (archivé)                         │
│ Date fin: 2026-08-29                        │
│ dateFin (29/08/2026) < aujourd'hui (01/09)  │
```

**Si vous voyez "🗃️ PASSÉ (archivé)" → La logique fonctionne !**

Cela signifie que vos autres événements sont simplement tous futurs.

---

## 🎯 Solutions Possibles

### **Solution 1 : Importez des événements passés**

Si vous voulez tester l'archivage :

1. Préparez un fichier CSV avec des événements passés :
   ```csv
   Nom,Date de début,Date de fin,Lieu,Statut
   Carnaval 2025,15/03/2026,17/03/2026,Centre,Validée
   Marché Noël 2025,01/12/2025,24/12/2025,Place,Validée
   ```

2. Importez-le via le bouton "Import CSV"

3. Rafraîchissez

4. Le panneau de debug devrait montrer :
   ```
   🗃️ PASSÉ (archivé) × 2
   ```

---

### **Solution 2 : Archivez manuellement dans Monday.com**

Si des événements passés existent déjà dans votre board :

1. Allez dans **Monday.com**
2. Vérifiez que ces événements ont bien une "Date de fin" < aujourd'hui
3. Si oui, ils apparaîtront automatiquement dans le panneau de debug comme "🗃️ PASSÉ"
4. Cliquez sur "Archiver tous les passés" pour les archiver

---

### **Solution 3 : Vérifiez la date système**

Dans la **console** (F12), tapez :

```javascript
new Date()
```

**Résultat attendu :**
```
Mon Sep 01 2026 14:32:15 GMT+0200
```

Si la date affichée n'est PAS septembre 2026, votre horloge système est mal réglée.

---

## 📋 Checklist de Vérification

Avant de rapporter un problème, cochez :

- [ ] J'ai ouvert le **panneau de debug orange** en haut du calendrier
- [ ] J'ai lu la **date actuelle** affichée (📅)
- [ ] J'ai regardé les **5 exemples d'événements**
- [ ] J'ai vérifié si au moins 1 événement est marqué "🗃️ PASSÉ (archivé)"
- [ ] Si TOUS sont marqués "✅ ACTIF (futur)", j'ai vérifié leurs dates dans Monday.com
- [ ] J'ai créé un événement de test avec une date passée (29/08/2026)
- [ ] J'ai rafraîchi (F5) et vérifié qu'il apparaît comme "🗃️ PASSÉ"

---

## ✅ Résumé

**Votre situation actuelle :**
- Date système : 1er septembre 2026
- Tous les événements ont des dates >= 1er septembre 2026
- **Résultat logique : 0 événements archivés**

**Ce n'est PAS un bug !** C'est le comportement attendu si tous vos événements sont futurs.

**Pour voir des archives :**
1. Importez des événements passés (janvier-août 2026)
2. OU attendez que vos événements actuels passent
3. OU créez un événement de test avec une date passée

---

**Ouvrez le panneau orange dans l'app et partagez une capture des 5 premiers événements ! 📸**
