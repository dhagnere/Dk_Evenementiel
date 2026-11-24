# Onglet Assistant

L'onglet **Administration → Assistant**, réservé aux super-administrateurs, suit le courrier du service événementiel :
chaque mail utile devient une ligne du registre et rejoint un dossier, que l'on relie ensuite aux projets.

## Principe

Le chef de service **transfère à la main** les mails utiles de sa messagerie professionnelle vers une **adresse Gmail
dédiée** au service (la redirection automatique vers l'extérieur est bloquée par Microsoft 365). Cette adresse ne sert
qu'à l'application ; les réponses partent toujours de la messagerie professionnelle.

**L'application lit elle-même cette boîte** : toutes les 15 minutes, et à la demande avec le bouton **Mettre à jour
l'assistant**. Aucun fichier à déposer, aucun poste à laisser allumé. La boîte est lue sans rien y modifier (ni marquer, ni
déplacer, ni supprimer) ; le serveur retient seulement le dernier message lu.

## Mise en place (une fois)

1. Créer l'adresse Gmail du service et activer la **validation en deux étapes** sur ce compte Google.
2. Créer un **mot de passe d'application** : compte Google → Sécurité → Validation en deux étapes → Mots de passe des
   applications. Google affiche 16 caractères, à coller directement dans Scalingo.
3. Dans Scalingo, onglet Environnement de l'application, ajouter :

   | Variable | Valeur |
   |---|---|
   | `GMAIL_ADRESSE` | adresse Gmail du service |
   | `GMAIL_MOT_DE_PASSE_APPLI` | mot de passe d'application (jamais ailleurs que dans Scalingo) |
   | `ASSISTANT_ADRESSES_SERVICE` | adresse professionnelle du chef de service et de la boîte du service, séparées par des virgules |
   | `ASSISTANT_RELEVE_MINUTES` | facultatif : intervalle du relevé automatique (15 par défaut, 0 = à la demande seulement) |

4. Redémarrer l'application. L'onglet affiche alors « Boîte … · automatique toutes les 15 min ».

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
- **Pièces jointes** : leur nom et leur taille sont notés dans la fiche ; le fichier reste dans Gmail (lien « ouvrir dans
  Gmail » sur chaque mail).

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
  ou dans un nouveau dossier.

### Analyse complète (facultative)

Le relevé peut confier chaque transfert à un service d'analyse de texte, qui rédige le résumé du dossier, les actions à
mener, les points de vigilance et les échéances, et propose le classement. Il suffit d'ajouter dans Scalingo
`ANALYSE_API_CLE` (clé du service, facturé à l'usage) et, au besoin, `ANALYSE_MODELE`. La consigne du chef de service
l'emporte toujours sur l'analyse. Si le service ne répond pas ou répond mal, le mail est classé par les règles et l'erreur
apparaît dans l'historique des relevés.

Avant de l'activer : accord de la DSI, et inscription au registre RGPD (le texte des mails part chez un prestataire).

## Ce que montre l'onglet

- **Bandeau** : dossiers ouverts, à traiter, échéances à 7 jours, points de vigilance (chaque chiffre filtre la liste),
  boîte relevée, date du dernier relevé et lien « état et réglages ». Un avertissement signale un relevé en erreur ou
  aucun relevé réussi depuis plus de 7 jours.
- **Dossiers** : cartes groupées par événement, dossiers à classer en tête, puis du plus proche au plus lointain.
- **Échéances**, **Suivi budgétaire**, **Registre des mails** (↘ reçu, ↗ envoyé, ✉ relevé dans Gmail), **Annuaire
  prestataires**, **Rattachement aux projets**.
- **État et réglages** : boîte relevée, relevé immédiat, aide au transfert, dix derniers relevés (messages lus, mails
  ajoutés, dossiers ouverts, doublons, erreurs).

## Ancien mode : import d'un index de l'assistant

L'import d'un `donnees.json` produit par l'assistant de messagerie reste possible (« état et réglages » → « Importer un
index de l'assistant »). Il remplace les fiches de l'assistant (D01…) et leurs mails, mais conserve :

- les dossiers et mails du relevé Gmail (les mails relevés sont raccrochés aux fiches réécrites) ;
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
associations). C'est pourquoi l'onglet est réservé aux super-administrateurs. La boîte Gmail dédiée est hébergée par
Google, hors du système d'information de la collectivité : n'y transférer que le courrier utile au suivi des dossiers. Ce traitement est à inscrire au registre
RGPD de la collectivité, avec le délégué à la protection des données.
