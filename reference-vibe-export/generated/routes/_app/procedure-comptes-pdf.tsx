import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { Button } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import { FileDown, FileText, Users, Lock, CheckCircle, AlertTriangle } from 'lucide-react';

export const Route = createFileRoute('/_app/procedure-comptes-pdf')({ component: ProcedureComptesPDF });

// Styles PDF
const styles = StyleSheet.create({
  page: {
    padding: 50,
    fontSize: 11,
    fontFamily: 'Helvetica',
    color: '#333333',
  },
  cover: {
    padding: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#003D7A',
  },
  coverTitle: {
    fontSize: 32,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 20,
  },
  coverSubtitle: {
    fontSize: 18,
    color: '#E0E0E0',
    textAlign: 'center',
    marginBottom: 40,
  },
  coverInfo: {
    fontSize: 12,
    color: '#CCCCCC',
    textAlign: 'center',
  },
  h1: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#003D7A',
    marginTop: 20,
    marginBottom: 10,
  },
  h2: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0066CC',
    marginTop: 15,
    marginBottom: 8,
  },
  h3: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#333333',
    marginTop: 10,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 11,
    lineHeight: 1.6,
    marginBottom: 8,
    textAlign: 'justify',
  },
  bold: {
    fontFamily: 'Helvetica-Bold',
  },
  bullet: {
    fontSize: 11,
    lineHeight: 1.6,
    marginLeft: 20,
    marginBottom: 4,
  },
  numbered: {
    fontSize: 11,
    lineHeight: 1.6,
    marginLeft: 20,
    marginBottom: 4,
  },
  callout: {
    padding: 12,
    marginVertical: 10,
    borderLeftWidth: 4,
    borderRadius: 4,
  },
  calloutInfo: {
    backgroundColor: '#E3F2FD',
    borderLeftColor: '#2196F3',
  },
  calloutWarning: {
    backgroundColor: '#FFF3E0',
    borderLeftColor: '#FF9800',
  },
  calloutTip: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#4CAF50',
  },
  calloutNote: {
    backgroundColor: '#F5F5F5',
    borderLeftColor: '#9E9E9E',
  },
  calloutText: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  table: {
    marginVertical: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#003D7A',
    padding: 8,
  },
  tableHeaderText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: '#FFFFFF',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    padding: 8,
  },
  tableCell: {
    fontSize: 10,
    lineHeight: 1.4,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    textAlign: 'center',
    fontSize: 9,
    color: '#999999',
  },
  pageNumber: {
    position: 'absolute',
    bottom: 50,
    right: 50,
    fontSize: 9,
    color: '#999999',
  },
});

// Composant Callout
const Callout = ({ type, children }: { type: 'info' | 'warning' | 'tip' | 'note'; children: string }) => {
  const calloutStyles = {
    info: styles.calloutInfo,
    warning: styles.calloutWarning,
    tip: styles.calloutTip,
    note: styles.calloutNote,
  };

  return (
    <View style={[styles.callout, calloutStyles[type]]}>
      <Text style={styles.calloutText}>{children}</Text>
    </View>
  );
};

// Composant Table
const Table = ({ headers, rows }: { headers: string[]; rows: string[][] }) => (
  <View style={styles.table}>
    <View style={styles.tableHeader}>
      {headers.map((header, i) => (
        <Text key={i} style={[styles.tableHeaderText, { flex: 1 }]}>
          {header}
        </Text>
      ))}
    </View>
    {rows.map((row, i) => (
      <View key={i} style={styles.tableRow}>
        {row.map((cell, j) => (
          <Text key={j} style={[styles.tableCell, { flex: 1 }]}>
            {cell}
          </Text>
        ))}
      </View>
    ))}
  </View>
);

// Document PDF
const ProcedureDocument = () => (
  <Document>
    {/* Page de couverture */}
    <Page size="A4" style={styles.cover}>
      <View style={{ padding: 50 }}>
        <Text style={styles.coverTitle}>Calendrier Événements{'\n'}Dunkerque</Text>
        <Text style={styles.coverSubtitle}>Procédure de Gestion des Comptes Utilisateurs</Text>
        <Text style={styles.coverInfo}>Direction Mutualisée Communication</Text>
        <Text style={styles.coverInfo}>
          {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        </Text>
      </View>
    </Page>

    {/* Page 1 : Introduction et Rôles */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Introduction</Text>
      <Text style={styles.paragraph}>
        Ce document décrit la procédure complète pour créer et gérer des comptes utilisateurs dans l'application
        "Calendrier Événements Dunkerque". L'application dispose de deux niveaux d'accès : Administrateur (lecture et
        écriture) et Consultant (lecture seule).
      </Text>

      <Callout type="info">
        Cette procédure est destinée aux administrateurs de l'application qui doivent créer et gérer les accès des
        utilisateurs.
      </Callout>

      <Text style={styles.h1}>1. Rôles et Permissions</Text>

      <Text style={styles.h2}>1.1 Rôle Administrateur</Text>
      <Text style={[styles.paragraph, styles.bold]}>Permissions complètes :</Text>
      <Text style={styles.bullet}>✓ Visualiser tous les événements (calendrier, liste, carte, conflits)</Text>
      <Text style={styles.bullet}>✓ Modifier et valider des événements</Text>
      <Text style={styles.bullet}>✓ Importer et exporter des fichiers</Text>
      <Text style={styles.bullet}>✓ Nettoyer et gérer le board</Text>
      <Text style={styles.bullet}>✓ Créer et gérer les comptes utilisateurs</Text>

      <Text style={styles.h2}>1.2 Rôle Consultant</Text>
      <Text style={[styles.paragraph, styles.bold]}>Permissions en lecture seule :</Text>
      <Text style={styles.bullet}>✓ Visualiser tous les événements (calendrier, liste, carte, conflits)</Text>
      <Text style={styles.bullet}>✓ Exporter en PDF et Excel</Text>
      <Text style={styles.bullet}>✗ Aucune modification possible</Text>
      <Text style={styles.bullet}>✗ Aucun import/nettoyage</Text>
      <Text style={styles.bullet}>✗ Aucune gestion de comptes</Text>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 2 : Création de compte */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>2. Créer un Nouveau Compte Utilisateur</Text>

      <Callout type="warning">
        Cette étape doit être réalisée par un Administrateur AVANT que l'utilisateur puisse demander l'accès.
      </Callout>

      <Text style={styles.h2}>2.1 Accéder au Board</Text>
      <Text style={styles.numbered}>1. Ouvrir monday.com</Text>
      <Text style={styles.numbered}>2. Naviguer vers le workspace "David Hagnere Vibes"</Text>
      <Text style={styles.numbered}>3. Ouvrir le board "Comptes utilisateurs — Calendrier Événements"</Text>

      <Text style={styles.h2}>2.2 Créer l'Élément</Text>
      <Text style={styles.numbered}>1. Cliquer sur "+ Ajouter un élément" en bas du board</Text>
      <Text style={styles.numbered}>2. Remplir les colonnes suivantes :</Text>

      <Table
        headers={['Colonne', 'Valeur à saisir', 'Exemple']}
        rows={[
          ['Name', 'Nom complet de la personne', 'Jean Dupont'],
          ['E-mail', 'Adresse email EXACTE', 'jean.dupont@dunkerque.fr'],
          ['Rôle', 'Consultant OU Administrateur', 'Consultant'],
          ['Statut du compte', 'Mot de passe à définir', 'Mot de passe à définir'],
          ['Empreinte mot de passe', 'LAISSER VIDE', ''],
          ['Sel', 'LAISSER VIDE', ''],
          ['Dernière connexion', 'LAISSER VIDE', ''],
        ]}
      />

      <Callout type="warning">
        IMPORTANT : L'adresse email doit être saisie EXACTEMENT comme l'utilisateur la tapera lors de sa demande
        d'accès. Toute différence (majuscules, espaces, tirets) empêchera la connexion.
      </Callout>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 3 : Demande d'accès */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>3. Demande d'Accès par l'Utilisateur</Text>

      <Text style={styles.h2}>3.1 Partage du Lien</Text>
      <Text style={styles.paragraph}>
        Communiquer à l'utilisateur le lien de l'application. L'utilisateur doit avoir été{' '}
        <Text style={styles.bold}>préalablement déclaré</Text> dans le board (étape 2).
      </Text>

      <Text style={styles.h2}>3.2 Procédure pour l'Utilisateur</Text>
      <Text style={styles.numbered}>1. Ouvrir le lien de l'application</Text>
      <Text style={styles.numbered}>2. Sur la page de connexion, cliquer sur "Demander l'accès"</Text>
      <Text style={styles.numbered}>3. Remplir le formulaire :</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>
        • Email : Saisir EXACTEMENT l'email déclaré dans le board
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>
        • Mot de passe : Choisir un mot de passe (minimum 8 caractères)
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Confirmer le mot de passe : Retaper le même mot de passe</Text>
      <Text style={styles.numbered}>4. Cliquer sur "Envoyer la demande"</Text>
      <Text style={styles.numbered}>5. Un message de confirmation s'affiche : "Demande envoyée"</Text>

      <Callout type="note">
        L'utilisateur NE PEUT PAS encore se connecter. Il doit attendre l'approbation par un Administrateur (étape 4).
      </Callout>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 4 : Approbation */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>4. Approbation de la Demande (Administrateur)</Text>

      <Text style={styles.h2}>4.1 Accéder à la Page Comptes</Text>
      <Text style={styles.numbered}>1. Se connecter à l'application en tant qu'Administrateur</Text>
      <Text style={styles.numbered}>2. Dans le menu de gauche, cliquer sur "Comptes"</Text>
      <Text style={styles.numbered}>3. La section "Demandes d'accès en attente" affiche les nouvelles demandes</Text>

      <Text style={styles.h2}>4.2 Approuver ou Rejeter</Text>
      <Text style={styles.paragraph}>Pour chaque demande, deux boutons sont disponibles :</Text>

      <Text style={[styles.h3, { color: '#2E7D32' }]}>Option 1 : Approuver</Text>
      <Text style={styles.bullet}>✓ Cliquer sur le bouton vert "Approuver"</Text>
      <Text style={styles.bullet}>✓ Le système génère automatiquement l'empreinte sécurisée du mot de passe</Text>
      <Text style={styles.bullet}>✓ Le compte passe au statut "Actif"</Text>
      <Text style={styles.bullet}>✓ L'utilisateur peut maintenant se connecter</Text>

      <Text style={[styles.h3, { color: '#C62828', marginTop: 15 }]}>Option 2 : Rejeter</Text>
      <Text style={styles.bullet}>✗ Cliquer sur le bouton rouge "Rejeter"</Text>
      <Text style={styles.bullet}>✗ La demande d'accès est archivée</Text>
      <Text style={styles.bullet}>✗ L'utilisateur ne reçoit aucune notification</Text>

      <Callout type="tip">
        Une fois approuvée, l'utilisateur peut se connecter immédiatement avec l'email et le mot de passe qu'il a choisis
        lors de sa demande.
      </Callout>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 5 : Connexion */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>5. Connexion de l'Utilisateur</Text>

      <Text style={styles.h2}>5.1 Procédure de Connexion</Text>
      <Text style={styles.numbered}>1. Ouvrir l'application</Text>
      <Text style={styles.numbered}>2. Sur la page de connexion, saisir :</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Email : L'adresse email utilisée lors de la demande</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>
        • Mot de passe : Le mot de passe choisi lors de la demande
      </Text>
      <Text style={styles.numbered}>3. Cliquer sur "Se connecter"</Text>
      <Text style={styles.numbered}>4. L'utilisateur accède à l'application selon son rôle</Text>

      <Callout type="note">
        Si l'utilisateur a oublié son mot de passe, il doit contacter un Administrateur qui réinitialisera le compte (voir
        section 6.3).
      </Callout>

      <Text style={styles.h1}>6. Gestion des Comptes Existants</Text>

      <Text style={styles.h2}>6.1 Modifier le Rôle</Text>
      <Text style={styles.numbered}>1. Dans l'application, aller sur la page "Comptes"</Text>
      <Text style={styles.numbered}>2. Dans la liste des comptes actifs, localiser l'utilisateur</Text>
      <Text style={styles.numbered}>3. Dans le board monday.com, modifier la colonne "Rôle"</Text>
      <Text style={styles.numbered}>4. Le changement prend effet à la prochaine connexion de l'utilisateur</Text>

      <Text style={styles.h2}>6.2 Suspendre un Compte</Text>
      <Text style={styles.numbered}>
        1. Dans l'application, page "Comptes", cliquer sur le bouton "Suspendre" (orange)
      </Text>
      <Text style={styles.numbered}>2. Le statut passe à "Suspendu"</Text>
      <Text style={styles.numbered}>3. L'utilisateur ne peut plus se connecter (même avec un mot de passe correct)</Text>
      <Text style={styles.numbered}>4. Pour réactiver, cliquer sur "Activer" (vert)</Text>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 6 : Gestion suite et Sécurité */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h2}>6.3 Réinitialiser un Mot de Passe</Text>
      <Text style={styles.paragraph}>Si un utilisateur a oublié son mot de passe :</Text>
      <Text style={styles.numbered}>1. Dans le board monday.com, localiser le compte de l'utilisateur</Text>
      <Text style={styles.numbered}>2. Changer le "Statut du compte" en "Mot de passe à définir"</Text>
      <Text style={styles.numbered}>3. Informer l'utilisateur qu'il doit refaire une demande d'accès</Text>
      <Text style={styles.numbered}>4. L'utilisateur suit la procédure de demande (section 3)</Text>
      <Text style={styles.numbered}>5. L'administrateur approuve la nouvelle demande (section 4)</Text>

      <Text style={styles.h1}>7. Sécurité et Confidentialité</Text>

      <Text style={styles.h2}>7.1 Stockage des Mots de Passe</Text>
      <Text style={styles.paragraph}>
        Les mots de passe ne sont JAMAIS stockés en clair dans le board. Seule une empreinte cryptographique (hash SHA-256
        avec sel unique) est conservée. Même les administrateurs ne peuvent pas voir les mots de passe des utilisateurs.
      </Text>

      <Text style={styles.h2}>7.2 Recommandations</Text>
      <Text style={styles.bullet}>• Exiger des mots de passe robustes (minimum 8 caractères)</Text>
      <Text style={styles.bullet}>• Ne jamais partager les identifiants par email non sécurisé</Text>
      <Text style={styles.bullet}>• Suspendre immédiatement les comptes en cas de départ de personnel</Text>
      <Text style={styles.bullet}>• Auditer régulièrement la liste des comptes actifs</Text>
      <Text style={styles.bullet}>• Ne créer que le nombre minimum de comptes Administrateur nécessaire</Text>

      <Callout type="warning">
        Le board "Comptes utilisateurs — Calendrier Événements" ne doit JAMAIS être rendu public. Il contient des données
        sensibles d'authentification.
      </Callout>

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>

    {/* Page 7 : Dépannage */}
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>8. Dépannage</Text>

      <Table
        headers={['Problème', 'Cause probable', 'Solution']}
        rows={[
          [
            'Message "Email non autorisé"',
            "L'email n'existe pas dans le board",
            'Créer le compte dans le board (section 2)',
          ],
          [
            'Message "Le compte n\'a pas encore été approuvé"',
            "La demande n'a pas été approuvée",
            'Aller dans "Comptes" et approuver la demande',
          ],
          [
            'Message "Identifiants incorrects"',
            'Mot de passe erroné ou compte suspendu',
            'Vérifier le statut. Si oublié, réinitialiser (section 6.3)',
          ],
          [
            'L\'utilisateur ne voit pas "Importer"',
            'Le rôle est Consultant (lecture seule)',
            "Changer le rôle en Administrateur si besoin d'édition",
          ],
          [
            "La demande d'accès n'apparaît pas",
            "L'email ne correspond pas",
            "Vérifier l'orthographe exacte de l'email",
          ],
        ]}
      />

      <Text style={styles.h1}>Annexe : Récapitulatif du Workflow</Text>

      <Text style={[styles.paragraph, styles.bold]}>Workflow complet de création d'un compte :</Text>

      <Text style={styles.numbered}>
        <Text style={styles.bold}>Étape 1 :</Text> Administrateur crée le compte dans le board monday.com
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Name : Nom complet</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• E-mail : Adresse exacte</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Rôle : Consultant ou Administrateur</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Statut : Mot de passe à définir</Text>

      <Text style={styles.numbered}>
        <Text style={styles.bold}>Étape 2 :</Text> Utilisateur demande l'accès
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Ouvre l'application → "Demander l'accès"</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Saisit email + mot de passe choisi</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Envoie la demande</Text>

      <Text style={styles.numbered}>
        <Text style={styles.bold}>Étape 3 :</Text> Administrateur approuve
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Va dans "Comptes" → "Demandes en attente"</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Clique sur "Approuver"</Text>

      <Text style={styles.numbered}>
        <Text style={styles.bold}>Étape 4 :</Text> Utilisateur se connecte
      </Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Email + mot de passe → "Se connecter"</Text>
      <Text style={[styles.numbered, { marginLeft: 40 }]}>• Accès selon le rôle attribué</Text>

      <Text
        style={styles.footer}
        render={() =>
          `Document généré le ${new Date().toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}\nCalendrier Événements Dunkerque — Direction Mutualisée Communication`
        }
        fixed
      />

      <Text style={styles.pageNumber} render={({ pageNumber }) => `Page ${pageNumber}`} fixed />
    </Page>
  </Document>
);

function ProcedureComptesPDF() {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      const blob = await pdf(<ProcedureDocument />).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'Procedure-Gestion-Comptes-Dunkerque-Events.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Erreur lors de la génération du PDF:', error);
      alert('Erreur lors de la génération du document PDF');
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
          <h1 className="text-4xl font-bold text-slate-900">Documentation Officielle</h1>
          <p className="text-lg text-slate-600">Procédure de Gestion des Comptes Utilisateurs</p>
        </div>

        {/* Carte principale */}
        <Card className="border-2 shadow-lg">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-3">
              <Users className="h-6 w-6 text-blue-600" />
              Télécharger la Procédure Complète (PDF)
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Document PDF professionnel avec toutes les étapes pour créer et gérer les comptes utilisateurs
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
              <p className="text-sm font-medium text-blue-900">📄 Format : PDF haute qualité</p>
              <p className="text-sm font-medium text-blue-900">📊 Contenu : 7 pages + couverture</p>
              <p className="text-sm font-medium text-blue-900">🎨 Présentation : Couverture professionnelle + mise en page structurée</p>
              <p className="text-sm font-medium text-blue-900">
                🔒 Usage : Documentation interne - À archiver et partager avec les administrateurs
              </p>
            </div>

            {/* Bouton de téléchargement */}
            <Button onClick={handleDownload} disabled={generating} size="lg" className="w-full gap-3 text-lg h-14">
              {generating ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <FileDown className="h-6 w-6" />
                  Télécharger la Procédure (PDF)
                </>
              )}
            </Button>

            <p className="text-xs text-center text-slate-500">
              Le document sera téléchargé au format PDF et peut être ouvert avec n'importe quel lecteur PDF
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
