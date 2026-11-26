# Onglet Assistant

L'onglet **Administration → Assistant**, réservé aux super-administrateurs, suit le courrier du service événementiel :
chaque mail utile devient une ligne du registre et rejoint un dossier, que l'on relie ensuite aux projets.

## Méthode principale : lecture d'Outlook Web (depuis le 25 novembre 2026)

Comme l'assistant de bureau d'origine, la mise à jour lit directement la messagerie professionnelle dans Outlook Web,
depuis le Chrome du chef de service (poste allumé, Chrome ouvert, connecté à Microsoft 365). Une tâche planifiée passe
**toutes les heures à hh:07, de 7 h à 19 h, tous les jours** ; hors semaine de bureau (week-end, avant 8 h, après 18 h)
elle ne lit que si un lancement a été demandé. À chaque passage :

1. nouveaux mails d'abord, puis **rattrapage** : une trentaine de conversations plus anciennes, en remontant jusqu'à la
   date de départ réglée à l'écran (1er janvier 2026 par défaut) ;
2. compréhension du texte et des pièces jointes ; pièces enregistrées dans OneDrive → Mes fichiers → Assistant →
   dossier de l'événement ;
3. dépôt dans l'application, conversation par conversation (`POST /api/assistant/outlook/depot`) : mails, dossier
   (existant ou nouveau), résumé, échéances, actions, vigilance, **lignes budgétaires**, brouillon de réponse,
   emplacement OneDrive des pièces. Rien n'est remplacé ; un mail déjà présent (y compris par l'ancien index, même
   minute et même objet) est ignoré ;
4. catégorie Outlook « DK traité » sur chaque mail lu ; les mails déposés sont **déplacés de la boîte de réception vers
   le dossier Outlook réglé à l'écran (DKEVENTS par défaut)**, dans le sous-dossier de leur événement (mêmes noms que
   dans OneDrive : DKEVENTS → La Féerique 2026, DKEVENTS → Fonctionnement du service…), créé au besoin. Les mails sans rapport avec le service restent dans la
   boîte de réception, marqués « DK traité » ;
5. bilan du passage (`POST /api/assistant/outlook/passage`) : mails examinés, déposés, dossiers créés, pièces rangées,
   mails déplacés, avancement du rattrapage. La demande de lancement en cours est soldée.

### État et réglages (onglet Assistant)

- **Mettre à jour maintenant** (en-tête et panneau) : lance tout de suite la tâche de lecture par son déclencheur
  API (`POST /api/assistant/outlook/demande`, variables `ASSISTANT_TACHE_URL` et `ASSISTANT_TACHE_JETON`). Un second
  clic est refusé tant que la lecture lancée depuis moins de 15 minutes n'a pas déposé son bilan ; **Annuler la
  demande** (`DELETE /api/assistant/outlook/demande`) libère le bouton ;
- **Passages** : automatiques (toutes les heures en semaine de 8 h à 18 h, plus les demandes) ou à la demande
  seulement ;
- **Déplacer vers le dossier Outlook** : case à cocher et nom du dossier (vide = les mails restent dans la boîte),
  option « un sous-dossier par événement » (cochée par défaut). Le nom du sous-dossier est celui de la colonne
  « Dossier OneDrive et Outlook » du rattachement aux projets ;
- **Reprendre les mails reçus depuis le** : date de départ du rattrapage, avec une jauge d'avancement ;
- **Derniers passages** : tableau des douze derniers bilans.

`GET /api/assistant/outlook/contexte` fournit à la lecture ces réglages, les événements et leur dossier OneDrive, les
dossiers ouverts, les branches et les adresses du service.

Aucun mail ne quitte la messagerie professionnelle, aucune clé payante n'est nécessaire. Les réglages de la messagerie
de secours et de l'analyse payante ont été retirés de l'écran ; le relevé de secours décrit ci-dessous ne tourne plus
que si la variable `ASSISTANT_RELEVE_SECOURS=oui` est posée sur le serveur.

## Principe du relevé de secours

Le chef de service **transfère à la main** les mails utiles de sa messagerie professionnelle vers une **messagerie
dédiée à l'assistant**. Cette adresse ne sert qu'à l'application ; les réponses partent toujours de la messagerie
professionnelle.

**L'application lit elle-même cette messagerie** : toutes les 15 minutes (réglable), et à la demande avec le bouton
**Mettre à jour l'assistant**. Aucun fichier à déposer, aucun poste à laisser allumé. La messagerie est lue sans rien y
modifier ; le serveur retient seulement le dernier message lu.

Les écrans ne nomment jamais la messagerie utilisée ni la façon dont les mails arrivent : on y parle de « mise à jour
automatique ». L'adresse configurée n'apparaît que masquée (« se•••@••• »).

## Mise en place (une fois)

1. Activer la validation en deux étapes sur le compte de la messagerie de l'assistant et y créer un **mot de passe
   d'application** (accès par protocole IMAP).
2. Dans l'onglet Assistant, cliquer sur **état et réglages** et remplir : adresse de la messagerie, mot de passe, vos
   adresses d'envoi (pour reconnaître vos propres messages), fréquence. **Tester et enregistrer** essaie la connexion
   avant d'enregistrer ; en cas de refus, rien n'est enregistré.
3. Le mot de passe est chiffré en base (AES-256-GCM, clé dérivée de `JWT_SECRET`) et ne s'affiche plus. Pour modifier
   les autres réglages, laisser le champ vide : l'ancien mot de passe est conservé. Si `JWT_SECRET` change, l'onglet
   demande de ressaisir les réglages.

Variante sans écran : les variables `MESSAGERIE_ADRESSE`, `MESSAGERIE_MOT_DE_PASSE`, `ASSISTANT_ADRESSES_SERVICE` et
`ASSISTANT_RELEVE_MINUTES` sur le serveur (voir `VARIABLES-SCALINGO.md`). Les réglages saisis à l'écran l'emportent.

Réglages techniques, sur le serveur seulement : `MESSAGERIE_SERVEUR` (serveur IMAP, valeur par défaut dans configuration.ts),
`MESSAGERIE_PORT` (993), `MESSAGERIE_TLS` (`non` pour désactiver le chiffrement, tests uniquement), `MESSAGERIE_DOSSIER`
(`INBOX`).

## Transférer un mail

- **Transfert simple** : l'expéditeur, la date, les destinataires et l'objet d'origine sont lus dans l'en-tête que le
  transfert recopie (« De : », « Envoyé : », « À : », « Objet : », ou leurs équivalents anglais). L'adresse qui transfère
  n'est jamais prise pour l'expéditeur. La date retenue est celle de l'envoi d'origine.
- **Conversation entière** : chaque en-tête recopié devient un mail distinct du registre, y compris les réponses citées
  (« Le mar. 24 nov. 2026 à 10:12, … a écrit : »).
- **Transfert en pièce jointe** : le mail joint (.eml) garde ses en-têtes complets, c'est la voie la plus sûre. Dans
  Outlook, sélectionner plusieurs mails puis « Transférer » les joint tous à un seul envoi.
- **Vos propres envois** : un mail d'origine parti d'une adresse de `ASSISTANT_ADRESSES_SERVICE` est classé « envoyé ».
- **Doublons** : un mail déjà au registre (même expéditeur, même date à la minute, même objet) n'est pas ajouté une
  seconde fois.
- **Pièces jointes** : quand le stockage de fichiers de l'application est configuré (variables `S3_*`), chaque pièce
  jointe (25 Mo au plus) y est copiée et s'ouvre d'un clic depuis la fiche du dossier ou depuis le mail. Le
  téléchargement est réservé aux super-administrateurs. Sans stockage, seuls le nom et la taille sont notés.

- **Signatures** : la signature de celui qui transfère et celles des correspondants sont retirées (formule de politesse,
  nom seul sur sa ligne, coordonnées, liens de signature, images intégrées, mentions de confidentialité). Les restes de
  mise en forme d'Outlook (« site<https://…> », « [cid:…] ») sont effacés.
- **Messages ignorés** : seuls comptent les messages transférés depuis une adresse d'envoi déclarée dans les réglages.
  Alertes de sécurité du compte, lettres d'information ou courriers envoyés directement à la messagerie de l'assistant
  sont ignorés (colonne « Ignorés » de l'historique).

### La consigne au-dessus du transfert

Le texte écrit au-dessus du transfert n'est pas un mail : c'est une consigne. La signature (« Cordialement… ») est ignorée.

| Consigne | Effet |
|---|---|
| `#feerique` ou `#FEERIQUE26` | rattache à l'événement (code exact, ou mot propre à son nom) |
| `#protocole`, `#logistique`, `#animation`, `#affichage`, `#kiosc`, `#vsl`, `#pilotage` | fixe la branche |
| `#D12`, `#M004` | range le mail dans ce dossier précis |
| `#urgent` ou `#prio` | priorité haute |
| tout autre texte | remarque reprise dans la fiche et sur la carte |

## Classement automatique

Sans consigne, chaque transfert est classé par règles, dans cet ordre :

1. **même conversation** : objet identique (sans RE, TR, Fwd) à celui d'un mail déjà classé, y compris les mails des
   fiches de l'assistant ;
2. **expéditeur connu** : son adresse figure dans les contacts d'un seul dossier ouvert ;
3. **événement cité** : le nom d'un événement apparaît dans l'objet ou le texte → nouveau dossier dans cet événement ;
4. sinon, **nouveau dossier à classer**, affiché en tête de l'onglet (« À classer – sans événement »).

Les dossiers ouverts par le relevé portent les codes M001, M002… Leur titre reprend l'objet, leur résumé le début du
mail, leurs échéances les dates citées dans le texte (« le 26/11 », « le 4 janvier »), à garder ou non.

Un dossier clos qui reçoit un nouveau mail repasse « À traiter ». Une carte qui a reçu un mail depuis moins de 48 heures
porte l'étiquette « nouveau mail ».

### Corriger un classement

Dans la fiche d'un dossier :

- **Classement** : événement, branche et priorité se changent par listes déroulantes ;
- **Mails du dossier** : un clic sur un mail relevé affiche son texte ; « déplacer vers… » l'envoie dans un autre dossier
  ou dans un nouveau dossier ; « supprimer » le retire du registre.

### Supprimer des mails

Dans le **Registre des mails**, cochez les mails puis **Supprimer la sélection** (ou « supprimer » sur un mail de la
fiche). Un mail supprimé ne revient pas, même transféré à nouveau : son empreinte est gardée. Ses pièces jointes copiées
sont effacées, et un dossier ouvert automatiquement qui n'a plus aucun mail (ni tâche au rétroplanning) est retiré.

### Analyse complète (facultative, payante)

Le classement par règles repère des mots, des dates et des expéditeurs ; il ne comprend pas le texte. L'analyse complète
confie chaque transfert à un service d'analyse de texte, qui **lit le mail et ses pièces jointes** (PDF, y compris
scannés, et images : 4 au plus, 8 Mo chacune) et rédige :

- le titre et le résumé du dossier, la priorité, le statut ;
- les actions à mener, les points de vigilance, les échéances ;
- le **suivi budgétaire** (devis, bons de commande, factures, montants TTC lus) ;
- un **brouillon de réponse**, à copier depuis la fiche ;
- et propose le classement (dossier, événement, branche). La consigne du chef de service l'emporte toujours.

Activation : « état et réglages » → **Analyse complète** → clé du service → **Tester et enregistrer** (la clé est
essayée, puis chiffrée en base comme le mot de passe). Variante serveur : `ANALYSE_API_CLE`, `ANALYSE_MODELE`.

- Chaque nouveau transfert est analysé à la mise à jour.
- **Analyser les dossiers en attente** traite, par lots de 20, les dossiers ouverts automatiquement avant l'activation.
- Dans une fiche, **analyser ce dossier** / **analyser à nouveau** relit tous ses mails et ses pièces jointes copiées.
- Si le service ne répond pas, refuse la clé ou n'a plus de crédit, les règles prennent le relais et le message apparaît
  dans l'historique.

Avant de l'activer : accord de la DSI, et inscription au registre RGPD (le texte des mails et les pièces jointes partent
chez un prestataire).

## Pièces jointes rangées dans OneDrive

Les pièces jointes des mails arrivés automatiquement se rangent dans le OneDrive professionnel du chef de service,
comme le faisait l'assistant de bureau : **Mes fichiers → Assistant → dossier de l'événement** (« La Féerique 2026 »,
« Carnaval 2027 »…), ou **Fonctionnement du service** pour un dossier sans événement.

- Le rangement se fait **à la demande** (« range les pièces jointes »), dans le Chrome du chef de service, ouvert et
  connecté à Microsoft 365 : pour chaque pièce, le mail d'origine est retrouvé dans Outlook Web, la pièce est enregistrée
  par « Enregistrer sur OneDrive » dans le bon dossier (créé s'il manque), puis notée comme rangée dans l'application.
- L'application fournit la liste de ce qui attend (`GET /api/assistant/pieces/a-ranger`) et garde l'emplacement de
  chaque pièce rangée (`POST /api/assistant/pieces/rangement`) : la fiche du dossier affiche « OneDrive › Assistant ›
  La Féerique 2026 » avec un lien, le mail un nuage ☁.
- Le nom du dossier OneDrive d'un événement se règle dans l'onglet « Rattachement aux projets » (colonne « Dossier
  OneDrive ») ; vide, c'est le nom de l'événement avant le tiret.
- Le panneau « état et réglages » indique combien de pièces attendent et dans quels dossiers.

## Accueil et fiche projet

- **Accueil** (super-administrateurs) : encart « Courrier du service » avec mails reçus en 24 h, dossiers à traiter, en
  priorité haute, échéances à 7 jours, échéances de la semaine et derniers mails. Un clic ouvre la fiche du dossier.
- **Fiche projet**, onglet **Courrier** (super-administrateurs) : dossiers de l'événement relié au projet, avec statut,
  prochaine échéance, premier point de vigilance et nombre de mails, puis les derniers mails. Le lien se fait par
  l'onglet « Rattachement aux projets ».

## Ce que montre l'onglet

- **Bandeau** : dossiers ouverts, à traiter, échéances à 7 jours, points de vigilance (chaque chiffre filtre la liste),
  date de la dernière mise à jour et lien « état et réglages ». Un avertissement signale un relevé en erreur ou
  aucun relevé réussi depuis plus de 7 jours.
- **Dossiers** : cartes groupées par événement, dossiers à classer en tête, puis du plus proche au plus lointain.
- **Échéances**, **Suivi budgétaire**, **Registre des mails** (↘ reçu, ↗ envoyé, ✉ arrivé par la mise à jour automatique), **Annuaire
  prestataires**, **Rattachement aux projets**.
- **État et réglages** : réglages de la messagerie, mise à jour immédiate, consignes de classement, dix dernières mises à
  jour (messages lus, mails ajoutés, dossiers ouverts, doublons, erreurs).

## Ancien mode : import d'un index de l'assistant

L'import d'un `donnees.json` produit par l'assistant de messagerie reste possible (« état et réglages » → « Importer un
index de l'assistant »). Il remplace les fiches de l'assistant (D01…) et leurs mails, mais conserve :

- les dossiers et mails de la mise à jour automatique (raccrochés aux fiches réécrites) ;
- le projet rattaché à chaque événement ;
- les échéances et actions déjà transformées en tâches ;
- les notes, et les statuts corrigés tant que l'assistant ne les a pas repris.

Un nouvel import réécrit le classement et les échéances ajoutées par le relevé sur les fiches D01… ; les dossiers M001…
ne sont jamais touchés.

## Corrections

Le bouton **Exporter mes corrections** télécharge `corrections_dossiers_AAAA-MM-JJ.json` :

```json
{ "exporte_le": "2026-11-23T15:45:00Z",
  "corrections": { "D02": { "statut": "En cours", "note": "…", "par": "…", "maj": "…" } } }
```

C'est le même usage que dans l'index d'origine : on transmet ce fichier à l'assistant pour qu'il reprenne les statuts
et les remarques dans sa prochaine mise à jour. Les corrections sont enregistrées dans la base (colonne `corrections`
de `assistant_dossiers`, migration 012), et non plus dans le navigateur : elles suivent le compte et non le poste.

## Règles de transformation en tâche

- Une **échéance** garde sa date. Une **action**, sans date, tombe à la date du jour (ou au jour J s'il est passé).
- La tâche est portée par le rôle de la branche du dossier : Protocole → référent protocole, Animation → référent
  animation, Logistique → référent logistique, Affichage → référent affichage, KIOSC → référent KIOSC, VSL → référent
  VSL, Pilotage du service → chef de service, autres → pilote.
- Le libellé de la tâche se termine par le numéro du dossier, par exemple « (D01) ».
- Le jalon de rattachement suit la même règle que pour une tâche ajoutée à la main.

## Format attendu de l'index

```json
{
  "genere_le": "2026-11-20T23:40",
  "periode": "Novembre 2026 (du 1er au 20) – réception et envoyés",
  "evenements":   [{ "id": "FEERIQUE26", "nom": "…", "date": "2026-11-27", "lieu": "…" }],
  "dossiers":     [{ "id": "D01", "evenement": "FEERIQUE26", "branche": "…", "titre": "…", "statut": "…",
                     "priorite": "Haute", "echeances": [{ "date": "2026-11-24", "libelle": "…" }],
                     "actions": ["…"], "…": "autres champs conservés tels quels" }],
  "mails":        [{ "n": 1, "date": "2026-11-19 00:00", "de": "…", "objet": "…", "dossier": "D13" }],
  "prestataires": [{ "nom": "…", "domaine": "…", "contacts": ["…"], "documents": ["…"], "dossiers": ["D17"] }]
}
```

Seuls les champs qui servent aux liens sont contrôlés. Les autres champs d'un dossier (résumé, vigilance, pièces
jointes, budget, historique, brouillon…) sont conservés et affichés tels quels : l'assistant peut enrichir ses fiches
sans modification de l'application.

## Données personnelles

Le registre contient des noms, des adresses électroniques et le texte de mails de tiers (préfecture, prestataires,
associations). C'est pourquoi l'onglet est réservé aux super-administrateurs. La messagerie de l'assistant est hébergée
hors du système d'information de la collectivité : n'y transférer que le courrier utile au suivi des dossiers. Ce traitement est à inscrire au registre
RGPD de la collectivité, avec le délégué à la protection des données.

## Annuaire des prestataires

L'annuaire (onglet Assistant → Annuaire prestataires) reprend les fiches de l'ancien index et se complète tout seul
à chaque dépôt depuis Outlook : chaque devis, bon de commande, facture ou contrat relevé dans un dossier ajoute ou
complète la fiche de son fournisseur (domaine d'activité, contacts externes, événements, documents avec montant,
dossiers). Rien n'est retiré ; un nouvel import d'index conserve ces ajouts. Recalcul manuel :
`POST /api/assistant/prestataires/actualiser`.

## Bilan d'un événement

Onglet Assistant → Rattachement aux projets → lien **bilan** sous le nombre de dossiers. Calculé à partir des dossiers
et des mails de l'événement :

- chiffres clés : dossiers (ouverts), mails reçus et envoyés, délai médian de réponse, montants engagés ;
- **prestataires à recontacter pour l'édition suivante** : fournisseur, interlocuteur, dernier devis, bon de commande
  ou facture, montant, dossier ;
- montants engagés par fournisseur et par branche (montants lus sur les documents ; ceux non lus sont signalés) ;
- interlocuteurs : mails reçus, dossiers, délai médian de réponse, échanges restés sans réponse ;
- échéances passées (dont celles de dossiers encore ouverts) et points de vigilance ouverts ;
- export tableur (CSV, s'ouvre dans Excel).

Le délai de réponse est le temps entre le premier message reçu d'un échange et la réponse du service qui le suit,
dans le même dossier. Le bilan prend toute sa valeur une fois l'année 2026 reprise.

## Idées retenues pour la suite

- **Répondre dans ma messagerie** : bouton dans la fiche dossier qui ouvre le brouillon de réponse dans Outlook,
  prêt à relire et envoyer depuis la messagerie professionnelle.
