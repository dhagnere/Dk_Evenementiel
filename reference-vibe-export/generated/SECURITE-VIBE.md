# 🔒 Sécurité Vibe — Protection de l'éditeur

## Vue d'ensemble

Le système de sécurité Vibe empêche les **consultants** (utilisateurs en lecture seule) d'accéder au framework Vibe et à l'éditeur de code via la pastille Monday.

---

## 🎯 Objectif

**Protéger l'application contre les modifications non autorisées** en bloquant l'accès au framework Vibe pour les utilisateurs qui n'ont que des permissions de consultation.

---

## 🛡️ Niveaux de protection

### **1. Protection CSS** (Client-side)
```css
/* Masque la pastille Monday et tous les contrôles d'édition */
.monday-app-pill,
.monday-vibe-pill,
.vibe-edit-button {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
```

### **2. Protection JavaScript** (Client-side)
- ✅ Bloque les clics sur la pastille Monday
- ✅ Désactive les raccourcis clavier d'édition (Ctrl+E, Cmd+E)
- ✅ Désactive le menu contextuel (clic droit)
- ✅ Observe le DOM pour supprimer dynamiquement les éléments Vibe
- ✅ Supprime les iframes d'édition ajoutées dynamiquement

### **3. Protection API Monday** (SDK)
```typescript
mondaySdk.execute('closeAppFeatureModal');
mondaySdk.execute('valueCreatedForUser');
```

### **4. Protection serveur** (Server-side)
- ✅ Log toutes les tentatives d'accès non autorisées
- ✅ Endpoint `verifierAccesVibe` pour valider les permissions
- ✅ Middleware de sécurité sur toutes les opérations d'écriture

---

## 📊 Détection des rôles utilisateur

### **Administrateur** 🔑
```typescript
// Conditions pour être admin
user.id exists
isViewOnly = false
kind ≠ 'viewer' / 'guest'
```

**Permissions :**
- ✅ Accès complet au framework Vibe
- ✅ Modification du code source
- ✅ Édition des données (statuts, validations, dates)
- ✅ Import/Export
- ✅ Nettoyage du board

### **Consultant** 👁️
```typescript
// Conditions pour être consultant
user.id exists
isViewOnly = true
OU kind = 'viewer' / 'guest'
```

**Permissions :**
- ✅ Consultation des événements
- ✅ Filtrage et recherche
- ✅ Export PDF
- ❌ **Aucune modification**
- ❌ **Aucun accès à Vibe**

---

## 🚨 Logs de sécurité

### **Console navigateur**
```
🔒 [SECURITE VIBE] Mode consultation activé — Désactivation de la pastille Monday
✅ [SECURITE VIBE] Protection activée — Pastille Monday et raccourcis désactivés
🚫 [SECURITE VIBE] Tentative d'accès à l'éditeur bloquée
🚫 [SECURITE VIBE] Raccourci clavier d'édition bloqué: e
```

### **Console serveur**
```
🚨 [ALERTE SECURITE] Tentative d'accès non autorisée au framework Vibe
   Action : click_vibe_pill
   Date   : 2026-08-13T14:32:00.000Z
   Mode   : Consultation (lecture seule)
```

---

## 🧪 Tests de sécurité

### **Scénario 1 : Consultant clique sur la pastille**
1. ❌ La pastille est masquée (CSS)
2. ❌ Le clic est bloqué (JavaScript)
3. 📝 Tentative loggée côté serveur

### **Scénario 2 : Consultant utilise Ctrl+E**
1. ❌ Raccourci intercepté et bloqué
2. 📝 Tentative loggée côté serveur

### **Scénario 3 : Consultant ouvre la console DevTools**
1. ✅ Peut inspecter le DOM (pas de restriction)
2. ❌ Ne peut pas modifier le code source (pas d'accès à Vibe)
3. ❌ Toute tentative de manipulation est loggée

### **Scénario 4 : iframe Vibe ajoutée dynamiquement**
1. 🔍 MutationObserver détecte l'iframe
2. ❌ iframe supprimée automatiquement
3. 📝 Tentative loggée

---

## 🔧 Configuration

### **Activer la protection**
```tsx
import { SecuriteVibe } from '@generated/components/SecuriteVibe';
import { useEstLectureSeule } from '@generated/utils/access';

function App() {
  const lectureSeule = useEstLectureSeule();
  
  return (
    <>
      <SecuriteVibe lectureSeule={lectureSeule} />
      {/* Reste de l'app */}
    </>
  );
}
```

### **Vérifier les permissions côté serveur**
```typescript
import { verifierAccesVibe } from '@generated/server/vibe-security';

// Dans une fonction serveur
await verifierAccesVibe({ 
  data: { 
    action: 'edit_code', 
    estLectureSeule 
  } 
});
```

---

## ⚠️ Limitations connues

### **Ce que la sécurité NE fait PAS :**
- ❌ Ne bloque pas l'accès aux DevTools du navigateur
- ❌ Ne chiffre pas le code source (il reste visible dans le navigateur)
- ❌ Ne protège pas contre les utilisateurs qui modifient le localStorage

### **Pourquoi ?**
Ces protections sont **suffisantes** car :
1. **L'accès au code source n'est pas un problème** — il est déjà visible dans le navigateur
2. **Les modifications locales n'affectent pas le serveur** — le code source est hébergé côté Monday
3. **Les opérations d'écriture sont protégées côté serveur** — même si un consultant contourne le client, le serveur refusera les modifications

---

## 🎓 Bonnes pratiques

### **Pour les administrateurs**
1. ✅ Toujours vérifier le badge "Consultation seule" en haut à droite
2. ✅ Ne jamais partager les identifiants administrateur
3. ✅ Créer des comptes "Consultant" pour les utilisateurs externes

### **Pour les consultants**
1. ✅ Vous pouvez consulter librement tous les événements
2. ✅ Utilisez les filtres et la recherche pour trouver l'information
3. ✅ Exportez en PDF si vous avez besoin de partager
4. ❌ Vous ne pouvez pas modifier les données (c'est normal)

---

## 📞 Support

Si vous voyez ce message d'erreur :
```
Accès non autorisé : cette action nécessite des permissions d'administrateur
```

**C'est normal !** Vous êtes en mode consultation et ne pouvez pas effectuer cette action. 

Si vous pensez que vous devriez avoir accès, contactez votre administrateur pour demander une promotion de compte via le bouton **"Demander un accès Administrateur"** en haut à droite.

---

## 📝 Changelog

### Version 1.0 (13 août 2026)
- ✅ Protection CSS complète
- ✅ Blocage des clics sur la pastille
- ✅ Blocage des raccourcis clavier
- ✅ MutationObserver pour les éléments dynamiques
- ✅ Logs serveur des tentatives d'accès
- ✅ Documentation complète

---

**🔒 Sécurité Vibe active — Votre application est protégée.**
