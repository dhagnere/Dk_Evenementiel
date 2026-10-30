# Stock Goodies & Cadeaux protocolaires — Maquette

Maquette interactive du logiciel de gestion du stock de goodies et de cadeaux protocolaires.

Source : artefact Claude « Stock Goodies & Protocole — Maquette »
https://claude.ai/artifact/AiJnymZJanDX4rC3qtv7EX (version du 17/09/2026).

## Contenu

| Fichier | Rôle |
|---|---|
| `Main.dc.html` | Application, poste de travail (1440 × 900) |
| `Referent.dc.html` | Écran mobile du référent de stock déporté : sorties et retours (390 × 844) |
| `canvas.json` | Index du canevas : disposition des écrans, titre |

Les fichiers `.dc.html` sont au format Design Component de Claude. Ils s'affichent dans l'artefact, pas directement dans un navigateur : ils dépendent du script `support.js` fourni par l'éditeur.

## Pages HTML autonomes

Le dossier `html/` contient les deux écrans en pages autonomes, à ouvrir directement dans un navigateur, sans serveur :

- `html/application.html` : poste de travail ;
- `html/referent.html` : écran mobile du référent.

Les données sont fictives et les saisies ne sont pas conservées : un rechargement de la page remet la maquette à zéro. Les liens entre les deux écrans fonctionnent.

Pour régénérer les pages après une modification des fichiers `.dc.html` :

```bash
node outils/dc-vers-html.mjs maquettes/stock-goodies/Main.dc.html maquettes/stock-goodies/html/application.html "Stock & Protocole — Application"
node outils/dc-vers-html.mjs maquettes/stock-goodies/Referent.dc.html maquettes/stock-goodies/html/referent.html "Stock déporté — Référent"
```

Le moteur d'affichage utilisé (`outils/dc-runtime.js`) est intégré à chaque page.
