-- Liaisons entre modules : un événement du calendrier, son projet et ses demandes de goodies.
--
-- Un événement du calendrier est une « série » (une ligne par jour, même nom, même date de début et
-- de fin), et un report de date recrée ses lignes. Le lien garde donc la clé de la série en plus de
-- l'identifiant d'une ligne : l'identifiant sert tant que la ligne existe, la clé ensuite.

ALTER TABLE projets
  ADD COLUMN evenement_nom   text,
  ADD COLUMN evenement_debut timestamptz,
  ADD COLUMN evenement_fin   timestamptz;

ALTER TABLE stock_demandes
  ADD COLUMN projet_id       text REFERENCES projets (id) ON DELETE SET NULL,
  ADD COLUMN evenement_nom   text,
  ADD COLUMN evenement_debut timestamptz,
  ADD COLUMN evenement_fin   timestamptz;

CREATE INDEX projets_evenement_idx ON projets (evenement_nom, evenement_debut);
CREATE INDEX stock_demandes_projet_idx ON stock_demandes (projet_id);
CREATE INDEX stock_demandes_evenement_idx ON stock_demandes (evenement_nom, evenement_debut);
