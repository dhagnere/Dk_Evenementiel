# Onglet Assistant

L'onglet **Administration → Assistant**, réservé aux super-administrateurs, accueille le travail de l'assistant de
messagerie du service événementiel.

## Ce que fait l'assistant, et ce que fait l'application

L'assistant n'est pas un programme de l'application. C'est une conversation qui lit, à la demande (« mets à jour
l'assistant »), une **adresse Gmail dédiée** au service. Cette adresse ne sert qu'à l'assistant : le chef de service y
**transfère à la main** les mails utiles de la boîte Outlook (la redirection automatique vers l'extérieur est bloquée par
Microsoft 365). Les réponses se font toujours depuis la messagerie professionnelle. Aucun poste n'a besoin d'être allumé :
la mise à jour se lance depuis n'importe quel appareil.

1. Il lit les mails arrivés dans la boîte Gmail depuis la dernière mise à jour.
2. Il les regroupe en dossiers, par événement et par branche : résumé, actions, échéances, points de vigilance, contacts,
   pièces jointes, budget, historique, brouillon de réponse.
3. Il renvoie un index complet, `donnees.json`, à déposer dans l'onglet.

### Lecture des mails transférés

Le transfert n'est qu'un moyen de transport : l'assistant ne retient jamais l'adresse qui a transféré (messagerie
professionnelle du chef de service ou adresse Gmail) comme expéditeur.

- **Expéditeur, date, destinataires et objet** sont lus dans le bloc d'en-tête du message d'origine (« De : », « Envoyé :
  », « À : », « Cc : », « Objet : » dans Outlook en français ; « From: », « Sent: »… en anglais). La date retenue est
  celle de l'envoi d'origine, pas celle du transfert.
- **Une conversation transférée** contient plusieurs blocs d'en-tête : chaque bloc devient un mail distinct dans le
  registre, dans l'ordre chronologique.
- **Un mail transféré en pièce jointe** (fichier .eml ou .msg) est lu avec ses en-têtes complets : c'est la méthode la
  plus fiable. Dans Outlook, sélectionner plusieurs mails puis « Transférer » les joint tous à un seul envoi.
- **Un mail dont l'expéditeur d'origine est le chef de service ou la boîte du service** est classé comme mail envoyé.
- **Le texte ajouté au-dessus du transfert** n'est pas un mail : c'est une consigne pour l'assistant. On peut y forcer le
  classement, par exemple « #feerique26 #protocole » pour l'événement et la branche, ou y laisser une remarque reprise
  dans la fiche.
- Un mail transféré deux fois n'est compté qu'une fois (même expéditeur, même date, même objet).

L'application reçoit cet index et l'affiche comme l'index d'origine de l'assistant :

- **Bandeau** : dossiers ouverts, à traiter, échéances à 7 jours, points de vigilance (chaque chiffre filtre la liste),
  date de la dernière mise à jour et bouton **Mettre à jour l'assistant**. Un avertissement signale un index vieux de
  plus de 7 jours.
- **Dossiers** : cartes groupées par événement, du plus proche au plus lointain ; la bordure gauche indique la priorité.
  Filtres par mois, événement, branche, statut et point de vigilance, recherche libre.
- **Fiche dossier** (clic sur une carte) : tout ce que l'assistant a relevé, les mails du dossier, le statut corrigeable,
  une zone de notes et, si l'événement est rattaché à un projet, un lien « + en faire une tâche » sur chaque échéance
  et chaque action.
- **Échéances**, **Suivi budgétaire**, **Registre des mails**, **Annuaire prestataires** : mêmes onglets que l'index
  d'origine.
- **Rattachement aux projets** : chaque événement de l'assistant se relie à un projet. L'application propose le projet
  au titre le plus proche ; un projet absent se crée en un clic, avec son rétroplanning.

## Mettre à jour l'assistant

Le bouton **Mettre à jour l'assistant** ouvre un panneau en deux étapes.

1. **Lancer la lecture des mails.** Le panneau donne le message à envoyer à l'assistant (bouton copier), avec la date du
   dernier import. Si des statuts ont été corrigés ou des notes saisies, le message le signale et le panneau propose de
   télécharger le fichier de corrections à transmettre à l'assistant.
2. **Déposer le nouvel index.** Glisser le `donnees.json` (ou `donnees.js`) renvoyé par l'assistant dans la zone de
   dépôt.

Chaque import **remplace** l'index. Restent acquis d'un import à l'autre :

- le projet rattaché à chaque événement ;
- les échéances et actions déjà transformées en tâches (elles ne sont pas proposées une seconde fois) ;
- les notes saisies sur les dossiers ;
- les statuts corrigés, tant que l'assistant ne les a pas repris. Quand le nouvel index porte le même statut que la
  correction, celle-ci est retirée : l'assistant est à jour.

Un dossier retiré ou fusionné par l'assistant disparaît de l'onglet ; les tâches qu'il a produites restent dans le
rétroplanning du projet.

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

L'index contient des noms, des adresses électroniques et des résumés de mails de tiers (préfecture, prestataires,
associations). C'est pourquoi l'onglet est réservé aux super-administrateurs. Ce traitement est à inscrire au registre
RGPD de la collectivité, avec le délégué à la protection des données.
