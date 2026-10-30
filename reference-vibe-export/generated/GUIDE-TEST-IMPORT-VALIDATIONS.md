# 🧪 Guide de Test Complet — Import Excel & Protection des Validations

## 🎯 Objectif du Test

**Vérifier que toutes les validations manuelles sont préservées lors de l'import Excel**, notamment :
- ✅ Validation Technique
- ✅ Validation Politique  
- 🔵 **Validation par Date Clef** (nouveau système)

**Scénario** : Nettoyer le board → Importer des données → Valider manuellement → Réimporter le même fichier → Vérifier que les validations sont intactes.

---

## 📋 Protocole de Test Complet

### **Phase 1 : Préparation du Board**

#### **1.1 Nettoyage Initial**

1. **Vue Liste** → Onglet **"Import"**
2. Cliquez sur **"🗑️ Nettoyer le board"**
3. Confirmez la suppression de tous les éléments
4. Attendez la confirmation : "Board nettoyé avec succès"

**Résultat attendu** : Board vide, prêt pour un import propre

---

#### **1.2 Import Initial du Fichier**

1. **Préparez votre fichier Excel** avec au minimum ces colonnes :
   - `Nom` (nom de l'événement)
   - `Date de début`
   - `Date de fin` (optionnel)
   - `Lieu`
   - `Quartier`
   - `Nature`
   - `Organisateur`
   - `Pilote`

2. **Exemple de structure** :

| Nom | Date de début | Date de fin | Lieu | Quartier | Nature | Organisateur | Pilote |
|-----|---------------|-------------|------|----------|--------|--------------|--------|
| Concert de Noël | 24/12/2026 | 24/12/2026 | Place Centrale | Dunkerque - Centre | Culture | Ville | Culture |
| Défilé du 14 Juillet | 14/07/2027 | 14/07/2027 | Avenue République | Dunkerque - Centre | Patriotique | CUD | Protocole |
| Marché de Printemps | 15/03/2027 | 17/03/2027 | Place du Marché | Malo-les-Bains | Animation "Grand Public" | Association | Animation |
| Festival d'Été | 01/07/2027 | 05/07/2027 | Plage | Station Balnéaire | Culture | Ville | Culture |
| Cérémonie 11 Novembre | 11/11/2026 | 11/11/2026 | Monument aux Morts | Rosendaël | Patriotique | Ville | Protocole |

3. **Import du fichier** :
   - Vue Liste → Onglet **"Import"**
   - Cliquez **"Parcourir"**
   - Sélectionnez votre fichier Excel
   - Cliquez **"Importer"**
   - Attendez la fin de l'import

**Résultat attendu** : 
- 5 événements créés
- Message : "✅ Import terminé : 5 créés, 0 mis à jour, 0 échecs"
- Tous les événements visibles dans la vue Liste

---

### **Phase 2 : Validation Manuelle (Test Critique)**

**But** : Créer des états de validation variés pour tester la protection.

#### **2.1 Validation Standard (Pastille Rouge)**

1. **Vue Liste** → Trouvez **"Concert de Noël"**
2. Cliquez sur la **pastille rouge** (statut)
3. Sélectionnez **"Validée"**
4. Le statut passe à "Validée" → Archive automatique

**État attendu** :
- Concert de Noël : ✅ Technique + ✅ Politique
- Badge : 🟢 Validée (vert)
- Colonne "Date Clef" : vide

---

#### **2.2 Validation par Date Clef (Pastille Bleue)**

1. **Vue Liste** → Trouvez **"Défilé du 14 Juillet"**
2. Cliquez sur la **pastille bleue** (Date Clef)
3. Confirmez la validation
4. Le statut passe à "Validée" → Archive automatique

**État attendu** :
- Défilé du 14 Juillet : ✅ Technique + ✅ Politique + 🔵 Date Clef
- Badge Liste : 🟢 ✓ Date Clef (bleu)
- Badge Calendrier : 🟢 Validée + 🔵 ✓ Date Clef

---

#### **2.3 Validation Partielle**

1. **Vue Liste** → Trouvez **"Marché de Printemps"**
2. Cliquez sur la **pastille rouge**
3. Sélectionnez **"À valider"** (non validée)
4. Manuellement, cochez **"Validation Technique"** uniquement

**État attendu** :
- Marché de Printemps : ✅ Technique, ❌ Politique
- Badge : ✗ Non validée (rouge)

---

#### **2.4 Non Validé**

1. **Vue Liste** → Laissez **"Festival d'Été"** et **"Cérémonie 11 Novembre"** **non validés**

**État attendu** :
- Festival d'Été : ❌ Technique, ❌ Politique
- Cérémonie 11 Novembre : ❌ Technique, ❌ Politique
- Badge : ✗ Non validée (rouge)

---

### **Phase 3 : Vérification Avant Réimport**

**Créez un tableau de référence** avant de réimporter :

| Événement | Technique | Politique | Date Clef | Badge Attendu |
|-----------|-----------|-----------|-----------|---------------|
| Concert de Noël | ✅ | ✅ | ❌ | 🟢 Validée |
| Défilé du 14 Juillet | ✅ | ✅ | ✅ | 🟢 Validée + 🔵 Date Clef |
| Marché de Printemps | ✅ | ❌ | ❌ | ✗ Non validée |
| Festival d'Été | ❌ | ❌ | ❌ | ✗ Non validée |
| Cérémonie 11 Novembre | ❌ | ❌ | ❌ | ✗ Non validée |

**→ Notez ce tableau, il servira de référence après le réimport !** 📝

---

### **Phase 4 : Modification du Fichier Excel**

**But** : Simuler une mise à jour de données métier sans toucher aux validations.

#### **4.1 Modifications à Apporter**

**Modifiez le fichier Excel** :

| Changement | Avant | Après |
|------------|-------|-------|
| Concert de Noël → Lieu | Place Centrale | **Salle des Fêtes** |
| Défilé du 14 Juillet → Organisateur | CUD | **Ville de Dunkerque** |
| Marché de Printemps → Date de début | 15/03/2027 | **20/03/2027** |
| Festival d'Été → Quartier | Station Balnéaire | **Malo-les-Bains** |
| Cérémonie 11 Novembre → Nature | Patriotique | **Protocole** |

**Sauvegardez** le fichier modifié (même nom ou nouveau nom).

---

### **Phase 5 : Réimport (Test Critique)**

#### **5.1 Réimport du Fichier Modifié**

1. **Vue Liste** → Onglet **"Import"**
2. Cliquez **"Parcourir"**
3. Sélectionnez le fichier **modifié**
4. Cliquez **"Importer"**
5. Attendez la fin de l'import

**Résultat attendu** :
- Message : "✅ Import terminé : 0 créés, 5 mis à jour, 0 échecs"
- Les 5 événements existent déjà, donc ils sont **mis à jour**

---

#### **5.2 Vérification des Données Métier**

**Vérifiez que les modifications sont bien appliquées** :

| Événement | Champ Modifié | Nouvelle Valeur Attendue |
|-----------|---------------|--------------------------|
| Concert de Noël | Lieu | Salle des Fêtes |
| Défilé du 14 Juillet | Organisateur | Ville de Dunkerque |
| Marché de Printemps | Date de début | 20/03/2027 |
| Festival d'Été | Quartier | Malo-les-Bains |
| Cérémonie 11 Novembre | Nature | Protocole |

**✅ Si les données sont mises à jour → OK**  
**❌ Si les données ne sont pas mises à jour → Problème d'import**

---

### **Phase 6 : Vérification des Validations (Test Final)**

**Vérifiez que TOUTES les validations sont préservées** :

#### **6.1 Vue Liste**

| Événement | Technique | Politique | Date Clef | Badge Attendu |
|-----------|-----------|-----------|-----------|---------------|
| Concert de Noël | ✅ | ✅ | ❌ | 🟢 Validée |
| Défilé du 14 Juillet | ✅ | ✅ | ✅ | 🟢 ✓ Date Clef |
| Marché de Printemps | ✅ | ❌ | ❌ | ✗ Non validée |
| Festival d'Été | ❌ | ❌ | ❌ | ✗ Non validée |
| Cérémonie 11 Novembre | ❌ | ❌ | ❌ | ✗ Non validée |

**→ Les validations doivent être IDENTIQUES au tableau de Phase 3 !** ✅

---

#### **6.2 Vue Calendrier**

1. **Accédez au Calendrier**
2. **Trouvez chaque événement** dans le calendrier
3. **Vérifiez les badges** :

| Événement | Badge Calendrier Attendu |
|-----------|--------------------------|
| Concert de Noël | 🟢 Validée |
| Défilé du 14 Juillet | 🟢 Validée + 🔵 ✓ Date Clef |
| Marché de Printemps | Pas de badge (non validée) |
| Festival d'Été | Pas de badge |
| Cérémonie 11 Novembre | Pas de badge |

---

#### **6.3 Vue Conflits**

1. **Accédez à la Vue Conflits**
2. **Si vous avez des conflits** (événements le même jour) :
   - Vérifiez que les événements **arbitrés** (validés) affichent **"Arbitré — ressources bloquées"**
   - Vérifiez que le badge **"✓ Date Clef"** est affiché pour **"Défilé du 14 Juillet"**

---

#### **6.4 Export PDF**

**Test final : Export PDF des conflits**

1. **Vue Conflits** → Cliquez **"Exporter en PDF"**
2. **Ouvrez le PDF**
3. **Vérifiez** :
   - Concert de Noël : Badge "Arbitré"
   - Défilé du 14 Juillet : Badge "Arbitré" + **"📅 Date Clef"**
   - Événements non validés : Pas de badge "Arbitré"

**→ Le badge "📅 Date Clef" doit être visible dans le PDF !** 📄🔵

---

## ✅ Critères de Succès

### **1. Données Métier Mises à Jour**

✅ Lieu du Concert de Noël = "Salle des Fêtes"  
✅ Organisateur du Défilé = "Ville de Dunkerque"  
✅ Date du Marché = "20/03/2027"  
✅ Quartier du Festival = "Malo-les-Bains"  
✅ Nature de la Cérémonie = "Protocole"  

**→ Les modifications Excel sont bien appliquées !** ✅

---

### **2. Validations Préservées**

✅ Concert de Noël : Validation Technique + Politique **préservées**  
✅ Défilé du 14 Juillet : Validation Technique + Politique + **Date Clef préservées**  
✅ Marché de Printemps : Validation Technique seule **préservée**  
✅ Festival d'Été : Non validé **préservé**  
✅ Cérémonie 11 Novembre : Non validé **préservé**  

**→ Aucune validation n'a été écrasée par l'import !** ✅

---

### **3. Badges Cohérents**

✅ **Vue Liste** : Badges corrects (vert pour validée, bleu pour Date Clef)  
✅ **Vue Calendrier** : Badges corrects (vert + bleu si Date Clef)  
✅ **Vue Conflits** : Badge "Arbitré" + "Date Clef" si applicable  
✅ **Export PDF** : Badge "📅 Date Clef" visible dans le document  

**→ Cohérence visuelle totale dans toutes les vues !** ✅

---

## ❌ Signaux d'Échec

### **Problème 1 : Validations Écrasées**

**Symptôme** : Après le réimport, toutes les validations sont **décochées**

**Cause** : Le code ne protège pas les colonnes `validationTechnique`, `validationPolitique`, `validParDateClef`

**Solution** : Vérifier `src/generated/server/import.ts` ligne ~303 :
```typescript
if (key === 'validationTechnique' || key === 'validationPolitique' || key === 'validParDateClef') continue;
```

---

### **Problème 2 : Badge Date Clef Disparu**

**Symptôme** : Le badge bleu "Date Clef" disparaît après le réimport

**Cause** : La colonne `validParDateClef` n'est pas protégée

**Solution** : Ajouter `validParDateClef` à la liste des colonnes protégées (déjà fait dans cette version)

---

### **Problème 3 : Données Non Mises à Jour**

**Symptôme** : Les modifications Excel ne sont pas appliquées

**Cause** : La logique de déduplication ne trouve pas les items existants

**Solution** : Vérifier la clé de déduplication dans `import.ts` (basée sur `nom`, `dateDeDbut`, `lieu`, `organisateur`)

---

## 🔧 Code de Protection (Référence)

**Fichier** : `src/generated/server/import.ts`

**Ligne ~303** : Protection des validations

```typescript
for (const [key, value] of Object.entries(item.rowData)) {
  if (key === 'name') continue;
  
  // NEVER update validations (preserve existing values)
  if (key === 'validationTechnique' || 
      key === 'validationPolitique' || 
      key === 'validParDateClef') continue;
  
  // ... rest of the update logic
}
```

**→ Les 3 colonnes de validation sont strictement préservées !** 🛡️

---

## 📊 Tableau Récapitulatif des Tests

| Phase | Action | Résultat Attendu | Statut |
|-------|--------|------------------|--------|
| 1.1 | Nettoyer le board | Board vide | ⬜ À tester |
| 1.2 | Import initial | 5 événements créés | ⬜ À tester |
| 2.1 | Validation standard | Concert validé (vert) | ⬜ À tester |
| 2.2 | Validation Date Clef | Défilé validé (bleu) | ⬜ À tester |
| 2.3 | Validation partielle | Marché partiellement validé | ⬜ À tester |
| 2.4 | Non validé | Festival et Cérémonie non validés | ⬜ À tester |
| 4.1 | Modification Excel | Fichier modifié sauvegardé | ⬜ À tester |
| 5.1 | Réimport | 5 mis à jour, 0 créés | ⬜ À tester |
| 6.1 | Données métier | Modifications appliquées | ⬜ À tester |
| 6.2 | Validations préservées | Aucune validation écrasée | ⬜ À tester |
| 6.3 | Badges Liste | Badges corrects | ⬜ À tester |
| 6.4 | Badges Calendrier | Badges corrects | ⬜ À tester |
| 6.5 | Vue Conflits | Badge Date Clef visible | ⬜ À tester |
| 6.6 | Export PDF | Badge "📅 Date Clef" dans PDF | ⬜ À tester |

**Marquez ✅ ou ❌ après chaque test.**

---

## 🎉 Conclusion

**Ce test vérifie** :
- ✅ Protection totale des validations manuelles
- ✅ Mise à jour correcte des données métier
- ✅ Cohérence des badges dans toutes les vues
- ✅ Export PDF avec badge Date Clef

**Durée estimée** : ~15 minutes

**Si tous les tests passent** : Le système de protection est opérationnel et robuste ! 🚀

**Si un test échoue** : Référez-vous à la section "Signaux d'Échec" pour diagnostiquer et corriger.

---

## 📄 Fichier Exemple

**Téléchargez un fichier Excel d'exemple** avec la structure attendue :

| Nom | Date de début | Date de fin | Lieu | Quartier | Nature | Organisateur | Pilote |
|-----|---------------|-------------|------|----------|--------|--------------|--------|
| Concert de Noël | 24/12/2026 | 24/12/2026 | Place Centrale | Dunkerque - Centre | Culture | Ville | Culture |
| Défilé du 14 Juillet | 14/07/2027 | 14/07/2027 | Avenue République | Dunkerque - Centre | Patriotique | CUD | Protocole |
| Marché de Printemps | 15/03/2027 | 17/03/2027 | Place du Marché | Malo-les-Bains | Animation "Grand Public" | Association | Animation |
| Festival d'Été | 01/07/2027 | 05/07/2027 | Plage | Station Balnéaire | Culture | Ville | Culture |
| Cérémonie 11 Novembre | 11/11/2026 | 11/11/2026 | Monument aux Morts | Rosendaël | Patriotique | Ville | Protocole |

**Enregistrez ce fichier au format `.xlsx` et utilisez-le pour vos tests !** 📄

---

**Bonne chance pour vos tests !** 🚀✨
