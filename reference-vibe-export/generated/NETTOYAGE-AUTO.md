# 🧹 Nettoyage automatique lors de l'import

## Fonctionnalités

Le système d'import inclut maintenant **deux options de nettoyage automatique** qui s'exécutent **AVANT** l'import des nouvelles données :

### 1️⃣ Nettoyer les doublons existants 🧹

**Activé par défaut**

Cette option détecte et archive tous les doublons qui existent déjà dans le board.

#### Critères de détection :
Un événement est considéré comme doublon s'il a :
- Le même **Nom** (insensible à la casse)
- La même **Date de début**
- Le même **Lieu**
- Le même **Organisateur**

#### Comportement :
- Pour chaque groupe de doublons, le système **garde l'événement le plus récent** (par date de création)
- Les autres sont **archivés automatiquement**
- Les doublons archivés restent accessibles dans la vue "Archives" de monday.com

#### Exemple :
```
Board avant nettoyage :
- EVT-2026-0001 : Carnaval | 15/02/2026 | Centre-ville | Asso A (créé le 01/01/2026)
- EVT-2026-0023 : Carnaval | 15/02/2026 | Centre-ville | Asso A (créé le 15/01/2026)
- EVT-2026-0045 : Carnaval | 15/02/2026 | Centre-ville | Asso A (créé le 20/01/2026)

Board après nettoyage :
- EVT-2026-0045 : Carnaval | 15/02/2026 | Centre-ville | Asso A ✅ GARDÉ (plus récent)
- EVT-2026-0001 : ARCHIVÉ
- EVT-2026-0023 : ARCHIVÉ
```

### 2️⃣ Renuméroter les identifiants 🔢

**Activé par défaut**

Cette option renumérotise tous les identifiants `EVT-YYYY-NNNN` pour qu'ils soient **consécutifs et ordonnés**.

#### Comportement :
- Tous les événements sont **triés par date de début**
- Puis par année
- Puis renumérotés séquentiellement : `EVT-2026-0001`, `EVT-2026-0002`, `EVT-2026-0003`, etc.
- Les identifiants sont **répartis par année**

#### Exemple :
```
Board avant renumérotation (avec trous et désordre) :
- EVT-2026-0001 : Fête | 20/06/2026
- EVT-2026-0023 : Carnaval | 15/02/2026
- EVT-2026-0045 : Concert | 30/08/2026
- EVT-2025-0002 : Noël | 25/12/2025

Board après renumérotation (consécutif et ordonné) :
- EVT-2025-0001 : Noël | 25/12/2025
- EVT-2026-0001 : Carnaval | 15/02/2026
- EVT-2026-0002 : Fête | 20/06/2026
- EVT-2026-0003 : Concert | 30/08/2026
```

---

## 🎯 Ordre d'exécution

Lors de l'import, le système exécute les étapes dans cet ordre :

```
1. 🧹 Nettoyer les doublons (si activé)
   → Archive les doublons existants dans le board
   
2. 🔢 Renuméroter les identifiants (si activé)
   → Rend tous les EVT-YYYY-NNNN consécutifs
   
3. 📋 Analyser le fichier uploadé
   → Parse le CSV/Excel
   
4. 🔍 Charger les items existants
   → Pour détecter les doublons fichier/board
   
5. ➕ Créer les nouveaux événements
   → Batch de 10 items avec pause de 500ms
   
6. 🔄 Mettre à jour les événements existants
   → Batch de 10 items avec pause de 500ms
   
7. ✅ Afficher le rapport
   → Nettoyage + Import
```

---

## 📊 Rapport de nettoyage

À la fin de l'import, le dialog de résultats affiche :

### Section "Nettoyage automatique" :
```
🧹 Nettoyage automatique
━━━━━━━━━━━━━━━━━━━━━━━━
Doublons archivés : 47
Identifiants renumérotés : 153 / 153
```

### Section "Import" :
```
✅ Nouveau(x) : 12
🔄 Mis à jour : 3
❌ Erreur(s) : 0
```

---

## ⚙️ Paramétrage

### Activer/Désactiver les options

Dans le dialog d'import, vous pouvez cocher/décocher :

✅ **Nettoyer les doublons existants**  
Recommandé si vous suspectez des doublons dans le board

✅ **Renuméroter les identifiants**  
Recommandé après un nettoyage ou si les numéros sont désordonnés

### Quand désactiver ?

#### Désactiver le nettoyage si :
- Vous savez qu'il n'y a **aucun doublon** dans le board
- Vous voulez **gagner du temps** (le nettoyage peut prendre 1-2 minutes sur un gros board)
- Vous importez juste **quelques nouveaux événements**

#### Désactiver la renumérotation si :
- Les identifiants actuels sont **déjà corrects**
- Vous ne voulez **pas changer les EVT-YYYY-NNNN** existants
- Vous voulez **préserver les références** externes

---

## 🔒 Permissions

Ces opérations nécessitent le **rôle Administrateur**.

Les utilisateurs en mode **Consultant** (lecture seule) ne peuvent pas :
- Nettoyer les doublons
- Renuméroter les identifiants
- Importer des données

---

## ⚡ Performance

### Temps estimés (pour 500 événements) :

| Opération | Temps |
|-----------|-------|
| Nettoyage des doublons | ~30-60 secondes |
| Renumérotation | ~45-90 secondes |
| Import de 100 nouveaux | ~30-60 secondes |

**Total pour un import complet avec nettoyage :** ~2-4 minutes

### Optimisations appliquées :
- ✅ Pauses de 200-500ms entre chaque opération API
- ✅ Traitement séquentiel pour éviter les erreurs HTTP 429
- ✅ Affichage en temps réel de la progression
- ✅ Logs détaillés dans la console

---

## 🐛 Dépannage

### "Erreur : Too Many Requests (429)"
→ Le système gère automatiquement les pauses. Si l'erreur persiste, attendez 1 minute et relancez.

### "Aucun doublon détecté alors que j'en vois"
→ Vérifiez que les **4 critères** (nom + date + lieu + organisateur) sont **strictement identiques**.

### "La renumérotation n'a rien fait"
→ Les identifiants étaient peut-être déjà corrects. Vérifiez le rapport.

### "L'import est très lent"
→ C'est normal avec le nettoyage activé sur un gros board. Désactivez-le si vous n'en avez pas besoin.

---

## 📝 Notes importantes

1. **Les doublons sont ARCHIVÉS, pas supprimés**  
   Vous pouvez les restaurer depuis la vue Archives de monday.com

2. **La renumérotation ne change QUE le champ "Name"**  
   Toutes les autres données (colonnes personnalisées) restent intactes

3. **Les validations sont préservées**  
   Les colonnes "Validation Technique" et "Validation Politique" ne sont JAMAIS touchées

4. **L'historique est préservé**  
   Les dates de création et modification sont conservées
