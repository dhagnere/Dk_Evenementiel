import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { 
  useDocxExport, 
  createTheme,
  coverPage,
  toc,
  p,
  table,
  callout,
  richParagraph,
  createMultiSectionDocument,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Paragraph
} from '@skills/docx-export.jsx';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { FileDown, FileText, Users, Lock, CheckCircle, AlertTriangle } from 'lucide-react';

export const Route = createFileRoute('/_app/procedure-comptes')({ component: ProcedureComptes });

function ProcedureComptes() {
  const { exportToDocx, isExporting } = useDocxExport();
  const [generating, setGenerating] = useState(false);

  const handleExport = async () => {
    setGenerating(true);
    try {
      // Thème personnalisé Ville de Dunkerque
      const theme = createTheme({
        primary: '003D7A', // Bleu marine Dunkerque
        secondary: '0066CC',
        accent: 'E63946',
        neutral: '333333',
        font: 'Calibri'
      });

      // Page de couverture
      const cover = coverPage({
        title: 'Calendrier Événements Dunkerque',
        subtitle: 'Procédure de Gestion des Comptes Utilisateurs',
        author: 'Direction Mutualisée Communication',
        date: new Date().toLocaleDateString('fr-FR', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric' 
        }),
        colors: { primary: '003D7A' }
      });

      // Corps du document
      const body = [
        // Introduction
        p('Introduction', { heading: HeadingLevel.HEADING_1 }),
        p(
          'Ce document décrit la procédure complète pour créer et gérer des comptes utilisateurs dans l\'application "Calendrier Événements Dunkerque". L\'application dispose de deux niveaux d\'accès : Administrateur (lecture et écriture) et Consultant (lecture seule).',
          { spacing: { after: 400 } }
        ),
        
        callout(
          'Cette procédure est destinée aux administrateurs de l\'application qui doivent créer et gérer les accès des utilisateurs.',
          { type: 'info' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 1 : Rôles et permissions
        p('1. Rôles et Permissions', { heading: HeadingLevel.HEADING_1 }),
        
        p('1.1 Rôle Administrateur', { heading: HeadingLevel.HEADING_2 }),
        p('Permissions complètes :', { bold: true }),
        p('✓ Visualiser tous les événements (calendrier, liste, carte, conflits)', { bullet: true }),
        p('✓ Modifier et valider des événements', { bullet: true }),
        p('✓ Importer et exporter des fichiers', { bullet: true }),
        p('✓ Nettoyer et gérer le board', { bullet: true }),
        p('✓ Créer et gérer les comptes utilisateurs', { bullet: true }),

        p('1.2 Rôle Consultant', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('Permissions en lecture seule :', { bold: true }),
        p('✓ Visualiser tous les événements (calendrier, liste, carte, conflits)', { bullet: true }),
        p('✓ Exporter en PDF et Excel', { bullet: true }),
        p('✗ Aucune modification possible', { bullet: true }),
        p('✗ Aucun import/nettoyage', { bullet: true }),
        p('✗ Aucune gestion de comptes', { bullet: true }),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 2 : Création d'un compte
        p('2. Créer un Nouveau Compte Utilisateur', { heading: HeadingLevel.HEADING_1 }),
        
        callout(
          'Cette étape doit être réalisée par un Administrateur AVANT que l\'utilisateur puisse demander l\'accès.',
          { type: 'warning' }
        ),

        p('2.1 Accéder au Board', { heading: HeadingLevel.HEADING_2 }),
        p('1. Ouvrir monday.com', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Naviguer vers le workspace "David Hagnere Vibes"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. Ouvrir le board "Comptes utilisateurs — Calendrier Événements"', { numbered: true, numberingReference: 'default', level: 0 }),

        p('2.2 Créer l\'Élément', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('1. Cliquer sur "+ Ajouter un élément" en bas du board', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Remplir les colonnes suivantes :', { numbered: true, numberingReference: 'default', level: 0 }),

        new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),
        
        table([
          ['Colonne', 'Valeur à saisir', 'Exemple'],
          ['Name', 'Nom complet de la personne', 'Jean Dupont'],
          ['E-mail', 'Adresse email EXACTE', 'jean.dupont@dunkerque.fr'],
          ['Rôle', 'Consultant OU Administrateur', 'Consultant'],
          ['Statut du compte', 'Mot de passe à définir', 'Mot de passe à définir'],
          ['Empreinte mot de passe', 'LAISSER VIDE', ''],
          ['Sel', 'LAISSER VIDE', ''],
          ['Dernière connexion', 'LAISSER VIDE', '']
        ], {
          headerColor: '003D7A',
          headerTextColor: 'FFFFFF',
          borderColor: 'CCCCCC'
        }),

        new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),

        callout(
          'IMPORTANT : L\'adresse email doit être saisie EXACTEMENT comme l\'utilisateur la tapera lors de sa demande d\'accès. Toute différence (majuscules, espaces, tirets) empêchera la connexion.',
          { type: 'warning' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 3 : Demande d'accès par l'utilisateur
        p('3. Demande d\'Accès par l\'Utilisateur', { heading: HeadingLevel.HEADING_1 }),
        
        p('3.1 Partage du Lien', { heading: HeadingLevel.HEADING_2 }),
        richParagraph(
          { text: 'Communiquer à l\'utilisateur le lien de l\'application. L\'utilisateur doit avoir été ' },
          { text: 'préalablement déclaré', bold: true },
          { text: ' dans le board (étape 2).' }
        ),

        p('3.2 Procédure pour l\'Utilisateur', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('1. Ouvrir le lien de l\'application', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Sur la page de connexion, cliquer sur "Demander l\'accès"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. Remplir le formulaire :', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Email : Saisir EXACTEMENT l\'email déclaré dans le board', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Mot de passe : Choisir un mot de passe (minimum 8 caractères)', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Confirmer le mot de passe : Retaper le même mot de passe', { numbered: true, numberingReference: 'default', level: 1 }),
        p('4. Cliquer sur "Envoyer la demande"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('5. Un message de confirmation s\'affiche : "Demande envoyée"', { numbered: true, numberingReference: 'default', level: 0 }),

        callout(
          'L\'utilisateur NE PEUT PAS encore se connecter. Il doit attendre l\'approbation par un Administrateur (étape 4).',
          { type: 'note' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 4 : Approbation
        p('4. Approbation de la Demande (Administrateur)', { heading: HeadingLevel.HEADING_1 }),
        
        p('4.1 Accéder à la Page Comptes', { heading: HeadingLevel.HEADING_2 }),
        p('1. Se connecter à l\'application en tant qu\'Administrateur', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Dans le menu de gauche, cliquer sur "Comptes"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. La section "Demandes d\'accès en attente" affiche les nouvelles demandes', { numbered: true, numberingReference: 'default', level: 0 }),

        p('4.2 Approuver ou Rejeter', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('Pour chaque demande, deux boutons sont disponibles :', { spacing: { after: 200 } }),
        
        p('Option 1 : Approuver', { bold: true, color: '2E7D32' }),
        p('✓ Cliquer sur le bouton vert "Approuver"', { bullet: true }),
        p('✓ Le système génère automatiquement l\'empreinte sécurisée du mot de passe', { bullet: true }),
        p('✓ Le compte passe au statut "Actif"', { bullet: true }),
        p('✓ L\'utilisateur peut maintenant se connecter', { bullet: true }),

        new Paragraph({ text: '', spacing: { before: 200, after: 200 } }),

        p('Option 2 : Rejeter', { bold: true, color: 'C62828' }),
        p('✗ Cliquer sur le bouton rouge "Rejeter"', { bullet: true }),
        p('✗ La demande d\'accès est archivée', { bullet: true }),
        p('✗ L\'utilisateur ne reçoit aucune notification', { bullet: true }),

        callout(
          'Une fois approuvée, l\'utilisateur peut se connecter immédiatement avec l\'email et le mot de passe qu\'il a choisis lors de sa demande.',
          { type: 'tip' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 5 : Connexion
        p('5. Connexion de l\'Utilisateur', { heading: HeadingLevel.HEADING_1 }),
        
        p('5.1 Procédure de Connexion', { heading: HeadingLevel.HEADING_2 }),
        p('1. Ouvrir l\'application', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Sur la page de connexion, saisir :', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Email : L\'adresse email utilisée lors de la demande', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Mot de passe : Le mot de passe choisi lors de la demande', { numbered: true, numberingReference: 'default', level: 1 }),
        p('3. Cliquer sur "Se connecter"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('4. L\'utilisateur accède à l\'application selon son rôle', { numbered: true, numberingReference: 'default', level: 0 }),

        callout(
          'Si l\'utilisateur a oublié son mot de passe, il doit contacter un Administrateur qui réinitialisera le compte (voir section 6.3).',
          { type: 'note' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 6 : Gestion des comptes
        p('6. Gestion des Comptes Existants', { heading: HeadingLevel.HEADING_1 }),
        
        p('6.1 Modifier le Rôle', { heading: HeadingLevel.HEADING_2 }),
        p('1. Dans l\'application, aller sur la page "Comptes"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Dans la liste des comptes actifs, localiser l\'utilisateur', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. Dans le board monday.com, modifier la colonne "Rôle"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('4. Le changement prend effet à la prochaine connexion de l\'utilisateur', { numbered: true, numberingReference: 'default', level: 0 }),

        p('6.2 Suspendre un Compte', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('1. Dans l\'application, page "Comptes", cliquer sur le bouton "Suspendre" (orange)', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Le statut passe à "Suspendu"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. L\'utilisateur ne peut plus se connecter (même avec un mot de passe correct)', { numbered: true, numberingReference: 'default', level: 0 }),
        p('4. Pour réactiver, cliquer sur "Activer" (vert)', { numbered: true, numberingReference: 'default', level: 0 }),

        p('6.3 Réinitialiser un Mot de Passe', { heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
        p('Si un utilisateur a oublié son mot de passe :', { spacing: { after: 200 } }),
        p('1. Dans le board monday.com, localiser le compte de l\'utilisateur', { numbered: true, numberingReference: 'default', level: 0 }),
        p('2. Changer le "Statut du compte" en "Mot de passe à définir"', { numbered: true, numberingReference: 'default', level: 0 }),
        p('3. Informer l\'utilisateur qu\'il doit refaire une demande d\'accès', { numbered: true, numberingReference: 'default', level: 0 }),
        p('4. L\'utilisateur suit la procédure de demande (section 3)', { numbered: true, numberingReference: 'default', level: 0 }),
        p('5. L\'administrateur approuve la nouvelle demande (section 4)', { numbered: true, numberingReference: 'default', level: 0 }),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 7 : Sécurité
        p('7. Sécurité et Confidentialité', { heading: HeadingLevel.HEADING_1 }),
        
        p('7.1 Stockage des Mots de Passe', { heading: HeadingLevel.HEADING_2 }),
        p('Les mots de passe ne sont JAMAIS stockés en clair dans le board. Seule une empreinte cryptographique (hash SHA-256 avec sel unique) est conservée. Même les administrateurs ne peuvent pas voir les mots de passe des utilisateurs.', { spacing: { after: 300 } }),

        p('7.2 Recommandations', { heading: HeadingLevel.HEADING_2 }),
        p('Exiger des mots de passe robustes (minimum 8 caractères)', { bullet: true }),
        p('Ne jamais partager les identifiants par email non sécurisé', { bullet: true }),
        p('Suspendre immédiatement les comptes en cas de départ de personnel', { bullet: true }),
        p('Auditer régulièrement la liste des comptes actifs', { bullet: true }),
        p('Ne créer que le nombre minimum de comptes Administrateur nécessaire', { bullet: true }),

        callout(
          'Le board "Comptes utilisateurs — Calendrier Événements" ne doit JAMAIS être rendu public. Il contient des données sensibles d\'authentification.',
          { type: 'warning' }
        ),

        new Paragraph({ children: [new PageBreak()] }),

        // Partie 8 : Dépannage
        p('8. Dépannage', { heading: HeadingLevel.HEADING_1 }),
        
        new Paragraph({ text: '', spacing: { after: 200 } }),
        
        table([
          ['Problème', 'Cause probable', 'Solution'],
          [
            'Message "Email non autorisé"',
            'L\'email n\'existe pas dans le board',
            'Créer le compte dans le board (section 2)'
          ],
          [
            'Message "Le compte n\'a pas encore été approuvé"',
            'La demande n\'a pas été approuvée',
            'Aller dans "Comptes" et approuver la demande'
          ],
          [
            'Message "Identifiants incorrects"',
            'Mot de passe erroné ou compte suspendu',
            'Vérifier le statut dans le board. Si mot de passe oublié, réinitialiser (section 6.3)'
          ],
          [
            'L\'utilisateur ne voit pas le bouton "Importer"',
            'Le rôle est Consultant (lecture seule)',
            'Si l\'utilisateur doit modifier, changer le rôle en Administrateur'
          ],
          [
            'La demande d\'accès n\'apparaît pas',
            'L\'email ne correspond pas à celui du board',
            'Vérifier l\'orthographe exacte de l\'email (casse, espaces, points)'
          ]
        ], {
          headerColor: '003D7A',
          headerTextColor: 'FFFFFF',
          borderColor: 'CCCCCC'
        }),

        new Paragraph({ children: [new PageBreak()] }),

        // Annexe
        p('Annexe : Récapitulatif du Workflow', { heading: HeadingLevel.HEADING_1 }),
        
        p('Workflow complet de création d\'un compte :', { bold: true, spacing: { after: 200 } }),
        
        p('Étape 1 : Administrateur crée le compte dans le board monday.com', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Name : Nom complet', { numbered: true, numberingReference: 'default', level: 1 }),
        p('E-mail : Adresse exacte', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Rôle : Consultant ou Administrateur', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Statut : Mot de passe à définir', { numbered: true, numberingReference: 'default', level: 1 }),

        new Paragraph({ text: '', spacing: { before: 200 } }),

        p('Étape 2 : Utilisateur demande l\'accès', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Ouvre l\'application → "Demander l\'accès"', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Saisit email + mot de passe choisi', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Envoie la demande', { numbered: true, numberingReference: 'default', level: 1 }),

        new Paragraph({ text: '', spacing: { before: 200 } }),

        p('Étape 3 : Administrateur approuve', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Va dans "Comptes" → "Demandes en attente"', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Clique sur "Approuver"', { numbered: true, numberingReference: 'default', level: 1 }),

        new Paragraph({ text: '', spacing: { before: 200 } }),

        p('Étape 4 : Utilisateur se connecte', { numbered: true, numberingReference: 'default', level: 0 }),
        p('Email + mot de passe → "Se connecter"', { numbered: true, numberingReference: 'default', level: 1 }),
        p('Accès selon le rôle attribué', { numbered: true, numberingReference: 'default', level: 1 }),

        new Paragraph({ text: '', spacing: { before: 400, after: 400 } }),

        p('─────────────────────────────────────────────────────', { alignment: AlignmentType.CENTER, color: 'CCCCCC' }),

        new Paragraph({ text: '', spacing: { before: 200 } }),

        p('Document généré le ' + new Date().toLocaleDateString('fr-FR', { 
          day: 'numeric', 
          month: 'long', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }), { alignment: AlignmentType.CENTER, size: 18, color: '888888' }),

        p('Calendrier Événements Dunkerque — Direction Mutualisée Communication', { 
          alignment: AlignmentType.CENTER, 
          size: 18, 
          color: '888888' 
        }),
      ];

      // Document multi-sections avec couverture + table des matières + contenu
      const doc = createMultiSectionDocument({
        title: 'Procédure de Gestion des Comptes - Calendrier Événements Dunkerque',
        styles: theme.styles,
        numbering: theme.numbering,
        features: { updateFields: true },
        sections: [
          cover,
          {
            properties: {
              page: {
                margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
              }
            },
            children: [
              ...toc({ heading: 'Table des Matières', maxLevel: 2 }),
              new Paragraph({ children: [new PageBreak()] }),
              ...body
            ]
          }
        ]
      });

      await exportToDocx(doc, 'Procedure-Gestion-Comptes-Dunkerque-Events.docx');
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du document');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-slate-50 p-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* En-tête */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full">
            <FileText className="h-12 w-12 text-blue-600" />
          </div>
          <h1 className="text-4xl font-bold text-slate-900">
            Documentation Officielle
          </h1>
          <p className="text-lg text-slate-600">
            Procédure de Gestion des Comptes Utilisateurs
          </p>
        </div>

        {/* Carte principale */}
        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-3">
              <Users className="h-6 w-6 text-blue-600" />
              Télécharger la Procédure Complète
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Document Word professionnel avec toutes les étapes pour créer et gérer les comptes utilisateurs
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Contenu du document */}
            <div className="space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <FileDown className="h-5 w-5 text-blue-600" />
                Contenu du document :
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Rôles et Permissions</p>
                    <p className="text-xs text-slate-600">Différences Administrateur vs Consultant</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Création de Compte</p>
                    <p className="text-xs text-slate-600">Étapes dans le board monday.com</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Demande d'Accès</p>
                    <p className="text-xs text-slate-600">Procédure pour l'utilisateur</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-amber-50 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Approbation</p>
                    <p className="text-xs text-slate-600">Valider les demandes en attente</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
                  <Lock className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Sécurité</p>
                    <p className="text-xs text-slate-600">Cryptage et confidentialité</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-slate-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Dépannage</p>
                    <p className="text-xs text-slate-600">Solutions aux problèmes courants</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Informations supplémentaires */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
              <p className="text-sm font-medium text-blue-900">📄 Format : Document Word (.docx)</p>
              <p className="text-sm font-medium text-blue-900">📊 Contenu : 8 sections + annexe + table des matières</p>
              <p className="text-sm font-medium text-blue-900">🎨 Présentation : Couverture professionnelle + mise en page structurée</p>
              <p className="text-sm font-medium text-blue-900">🔒 Usage : Documentation interne - À archiver et partager avec les administrateurs</p>
            </div>

            {/* Bouton de téléchargement */}
            <Button
              onClick={handleExport}
              disabled={generating || isExporting}
              size="lg"
              className="w-full gap-3 text-lg h-14"
            >
              {(generating || isExporting) ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <FileDown className="h-6 w-6" />
                  Télécharger la Procédure (Word)
                </>
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">
              Le document sera téléchargé au format .docx et peut être ouvert avec Microsoft Word, LibreOffice ou Google Docs
            </p>
          </CardContent>
        </Card>

        {/* Note de bas de page */}
        <div className="text-center text-sm text-slate-500">
          <p>Direction Mutualisée Communication — Ville de Dunkerque</p>
          <p className="mt-1">Calendrier Événements Dunkerque</p>
        </div>
      </div>
    </div>
  );
}
