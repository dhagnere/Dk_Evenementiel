# 📋 Résumé : Logique d'Import

## Règle Simple

```
┌─────────────────────────────────────────────┐
│  LORS DE L'IMPORT D'UN FICHIER EXCEL/CSV   │
└─────────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Pour chaque ligne :   │
        └────────────────────────┘
                     │
                     ▼
     ┌───────────────────────────────┐
     │ L'événement existe déjà dans  │
     │ le board ?                    │
     │ (même nom + date + lieu)      │
     └───────────────────────────────┘
              │           │
         OUI  │           │  NON
              │           │
              ▼           ▼
    ┌──────────────┐  ┌──────────────┐
    │   IGNORÉ     │  │    CRÉÉ      │
    │  ⏭️ Orange   │  │   ✅ Vert    │
    └──────────────┘  └──────────────┘
         │                   │
         ▼                   ▼
    ┌──────────────┐  ┌──────────────┐
    │ AUCUNE       │  │ Nouvel item  │
    │ modification │  │ ajouté au    │
    │              │  │ board        │
    │ Validations  │  │              │
    │ préservées   │  │ ID auto      │
    │              │  │ généré       │
    └──────────────┘  └──────────────┘
```

---

## 🎯 En Pratique

### Scénario 1 : Import initial
```
Fichier Excel : 500 événements
Board vide

→ Résultat : 500 nouveaux créés ✅
```

### Scénario 2 : Mise à jour mensuelle
```
Mois suivant :
Fichier Excel : 550 événements (500 anciens + 50 nouveaux)
Board : 500 événements validés

→ Résultat :
  • 50 nouveaux créés ✅
  • 500 ignorés (validations préservées) ⏭️
```

### Scénario 3 : Réimport accidentel
```
Fichier Excel : 500 événements (déjà importés)
Board : 500 événements

→ Résultat :
  • 0 nouveaux créés
  • 500 ignorés ⏭️
  • Board strictement identique
```

---

## ✅ Avantages

| Avantage | Description |
|----------|-------------|
| 🛡️ **Protection** | Les validations et modifications ne sont jamais écrasées |
| 🚫 **Pas de doublons** | Le board reste propre et gérable |
| ♻️ **Imports multiples** | Vous pouvez réimporter sans risque |
| 📊 **Traçabilité** | 100% des lignes comptabilisées |

---

## 🔑 Clé de Déduplication

Un événement est considéré comme **identique** si :

```javascript
Nom (minuscule) + Date de début + Lieu (minuscule) = IDENTIQUES
```

**Exemples :**
```
✅ DOUBLON DÉTECTÉ :
  "Carnaval" + "15/03/2026" + "Place Jean Bart"
  "CARNAVAL" + "15/03/2026" + "place jean bart"
  → Même événement (casse ignorée)

❌ ÉVÉNEMENTS DIFFÉRENTS :
  "Concert Jazz" + "15/06/2026" + "Kiosque"
  "Concert Jazz" + "16/06/2026" + "Kiosque"
  → Dates différentes → 2 événements distincts
```

---

## 📞 Support

- 📖 Documentation complète : `REGLE-IMPORT-EVENEMENTS.md`
- 🔍 Logs détaillés : Console navigateur (F12)
- 📊 Résumé après import : Dialog avec traçabilité 100%
