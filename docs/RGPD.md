# Fiche de traitement — DK Événementiel

Fiche à reporter dans le registre des activités de traitement de la collectivité (article 30 du RGPD). Les mentions
entre crochets sont à compléter avec le délégué à la protection des données (DPO).

## 1. Identification

| Rubrique | Contenu |
|---|---|
| Nom du traitement | DK Événementiel — gestion des événements, du stock et du protocole |
| Responsable de traitement | [Collectivité : Ville de Dunkerque / Communauté urbaine de Dunkerque] |
| Service gestionnaire | Service Événementiel |
| Délégué à la protection des données | [Nom, adresse électronique] |
| Sous-traitants | Scalingo SAS (hébergement de l'application et de la base, France) ; [hébergeur du stockage objet, France] ; [prestataire d'envoi de courriels] |
| Date de mise en service | [À compléter] |

## 2. Finalités

1. Tenir le calendrier des manifestations du territoire et en organiser l'arbitrage.
2. Gérer le stock de goodies et de cadeaux protocolaires, ainsi que les demandes des directions et les stocks confiés
   aux directions (module Stock & Protocole).
3. Tenir le registre des cadeaux protocolaires remis (module Stock & Protocole).
4. Piloter la préparation des événements : demandes d'événement, rétroplanning, prestataires, sécurité, budget (module
   Projets événementiels).
5. Gérer les comptes d'accès à l'application et tracer les actions (sécurité).

**Base légale** : exécution d'une mission d'intérêt public (article 6.1.e du RGPD), pour l'ensemble des finalités.

## 3. Personnes concernées et données

| Personnes | Données | Source |
|---|---|---|
| Agents utilisateurs de l'application | Nom, adresse électronique professionnelle, direction, droits, date de dernière connexion, empreinte du mot de passe | Saisie par un super-administrateur ou demande d'accès |
| Demandeurs d'accès | Nom, adresse électronique, organisation, motif | Formulaire de demande d'accès |
| Pilotes d'événements | Nom (champ « pilote »), direction | Fiches de renseignement, imports CSV |
| Demandeurs de goodies | Nom, direction, demandes déposées et leur historique | Demandes saisies dans l'application |
| Bénéficiaires de cadeaux protocolaires | Nom, organisme, occasion, élu remettant, objet remis | Saisie par le service lors de la demande |
| Demandeurs d'événement | Nom, structure, téléphone ou courriel, demandes déposées | Formulaire de demande d'événement |
| Contacts des prestataires | Raison sociale, nom et coordonnées professionnelles du contact | Saisie par le service Événementiel |

Aucune donnée sensible au sens de l'article 9 du RGPD. Aucun mot de passe n'est conservé en clair (PBKDF2-SHA256
avec sel).

## 4. Destinataires

- Agents habilités, selon leur niveau de droits sur chaque module et leur direction de rattachement.
- Super-administrateurs de l'application (service Événementiel) : accès à l'ensemble.
- Aucun transfert hors de l'Union européenne.

## 5. Durées de conservation

Durées appliquées automatiquement chaque jour, modifiables dans **Administration → RGPD**. Valeurs par défaut à valider
avec le DPO :

| Données | Durée par défaut | Règle |
|---|---|---|
| Journal d'audit | 365 jours | Suppression des entrées plus anciennes |
| Demandes d'accès traitées | 90 jours après approbation ou rejet | Suppression |
| Comptes inactifs | 365 jours sans connexion | Suspension (sauf super-administrateurs) |
| Comptes suspendus | 730 jours sans connexion | Suppression (sauf super-administrateurs) |
| Instantanés de l'application | 30 derniers | Rotation automatique |
| Événements du calendrier | Durée d'utilité administrative | [À fixer avec les Archives] |
| Registre protocolaire | 3 650 jours (10 ans) après la remise | Anonymisation du nom du bénéficiaire |
| Demandes de stock | Durée d'utilité administrative | [À fixer avec les Archives] |
| Projets événementiels (dont contacts des prestataires) et demandes d'événement | Durée d'utilité administrative | [À fixer avec les Archives] |
| Suivi de formation des pilotes (étapes, autonomie, notes de suivi) | Durée d'emploi de l'agent dans le service | Supprimé avec le compte |

## 6. Droits des personnes

Un super-administrateur traite les demandes depuis **Administration → RGPD → Droits des personnes**, à partir de
l'adresse électronique de la personne :

- **Accès (article 15)** : export JSON de toutes les données la concernant (compte, droits, demandes d'accès,
  traces au journal, événements dont elle est pilote, demandes de stock, cadeaux protocolaires reçus, demandes
  d'événement). L'export est inscrit au journal.
- **Effacement (article 17)** : suppression du compte, des droits et des demandes d'accès ; anonymisation de ses traces
  au journal ; retrait de son compte des instantanés de l'application. Les événements dont elle est pilote ne sont pas
  modifiés automatiquement (donnée de service) : leur nombre est indiqué pour une revue manuelle. Même chose pour les
  lignes du registre protocolaire, dont l'effacement relève d'une décision au cas par cas. Ses demandes d'événement sont
  conservées sans son nom ni son contact.
- **Rectification (article 16)** : modification du compte par un super-administrateur.

Les sauvegardes de la base faites par l'hébergeur suivent leur propre rotation : une donnée effacée en disparaît à
l'expiration de la dernière sauvegarde qui la contient ([durée selon l'offre Scalingo retenue]).

## 7. Sécurité

- Hébergement en France (Scalingo, région osc-fr1), connexions chiffrées (HTTPS).
- Authentification par mot de passe d'au moins 10 caractères ; limitation des tentatives de connexion.
- Droits par module et par niveau, contrôlés côté serveur à chaque requête ; une suspension prend effet immédiatement.
- Journal d'audit des actions sensibles (connexions, changements de droits, imports, suppressions, exports et
  effacements RGPD) ; chaque consultation et chaque export du registre protocolaire y est inscrit.
- Registre protocolaire visible seulement à partir du niveau Validation du module Stock.
- Pièces jointes sur un stockage objet privé, sans accès public ; les noms de fichiers d'origine ne figurent pas dans
  les clés de stockage.
- Instantanés quotidiens de l'application, en plus des sauvegardes de l'hébergeur.

## 8. Analyse d'impact

[À apprécier avec le DPO. Le traitement ne semble pas relever des critères imposant une AIPD : pas de données
sensibles, pas de traitement à grande échelle de personnes vulnérables, pas de profilage.]
