# 📄 Guide : Convertir Excel en CSV

## Pourquoi CSV ?

Le format CSV est beaucoup plus léger et simple à parser que Excel (.xlsx).  
Cela évite d'ajouter une grosse dépendance (500 KB) et rend l'import plus rapide.

---

## 🔄 Conversion Excel → CSV

### **Méthode 1 : Depuis Excel**

1. **Ouvrez** votre fichier `special_events_global.xlsx` dans Excel
2. **Fichier** → **Enregistrer sous**
3. **Type** → Sélectionnez **"CSV (délimiteur : point-virgule) (*.csv)"**
   - ⚠️ Ne choisissez PAS "CSV UTF-8" ni "CSV (virgule)"
   - Choisissez bien **"CSV (délimiteur : point-virgule)"**
4. **Enregistrez** → Un nouveau fichier `.csv` est créé
5. **Importez** ce fichier CSV dans l'application

---

### **Méthode 2 : Depuis Google Sheets**

1. **Ouvrez** votre fichier Excel dans Google Sheets
2. **Fichier** → **Télécharger** → **Valeurs séparées par des virgules (.csv)**
3. Le fichier CSV est téléchargé
4. **Importez** ce fichier CSV dans l'application

---

### **Méthode 3 : Depuis LibreOffice Calc**

1. **Ouvrez** votre fichier Excel dans LibreOffice Calc
2. **Fichier** → **Enregistrer sous**
3. **Type** → Sélectionnez **"Texte CSV (.csv)"**
4. Dans la fenêtre de paramètres :
   - **Séparateur de champ** : `;` (point-virgule)
   - **Jeu de caractères** : UTF-8
5. **OK** → **Enregistrer**
6. **Importez** ce fichier CSV dans l'application

---

## ✅ Vérification du fichier CSV

Ouvrez le fichier CSV avec un éditeur de texte (Notepad, TextEdit, VS Code).

**Bon format :**
```csv
Date;Date de début;Date de fin;Nom;Lieu;Quartier;Pilote;Direction pilote;Organisateur;Statut;Nature;Niveau;Type;Tardive;Reprog.
2026-08-12;2026-02-06;2026-08-31;HABITER LA MODERNITÉ À DUNKERQUE;Centre-ville;Dunkerque - Centre;Eva LELEU;Mission Patrimoine;Ville de Dunkerque;Validée;Culture;Ville;Exceptionnelle;Oui;Oui
```

**Mauvais format (virgule au lieu de point-virgule) :**
```csv
Date,Date de début,Date de fin,Nom,Lieu...
```

→ Si vous voyez des **virgules** au lieu de **points-virgules**, recommencez la conversion en choisissant le bon délimiteur.

---

## 🚀 Import

Une fois le fichier CSV créé :

1. **Ouvrez** le dialog d'import dans l'application
2. **Sélectionnez** votre fichier `.csv`
3. **Vérifiez** que toutes les colonnes sont reconnues (badges verts)
4. **Cliquez** sur **Importer**

---

## ⚠️ Problèmes courants

### **Erreur : "Colonnes manquantes"**

→ Les en-têtes de colonnes ne correspondent pas.  
→ Téléchargez le **modèle CSV** depuis l'application et copiez vos données dedans.

### **Erreur : "Fichier vide"**

→ Le fichier CSV ne contient que les en-têtes, pas de données.  
→ Vérifiez que toutes les lignes ont bien été exportées.

### **Accents bizarres (é → Ã©)**

→ Problème d'encodage.  
→ Lors de l'export, choisissez **UTF-8** comme encodage.

---

## 💡 Astuce

Si vous importez souvent, gardez une **version CSV** de votre extraction.  
Ainsi vous n'aurez plus besoin de convertir à chaque fois ! 🎯
