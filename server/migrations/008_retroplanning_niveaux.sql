-- Rétroplanning à squelette unique : niveau N1 à N4, critères (modules et majorations), rôles P/F/V/I,
-- jalons franchis. Le référentiel (jalons, niveaux, modules, tâches types) est un paramètre
-- 'projets_referentiel', créé au premier usage avec ses valeurs par défaut.

-- Le type (festif, protocolaire, quartier) ne génère plus de rétroplanning : il reste pour les projets existants.
ALTER TABLE projets ALTER COLUMN type DROP NOT NULL;
ALTER TABLE projets
  ADD COLUMN criteres jsonb NOT NULL DEFAULT '[]'::jsonb,   -- codes des critères cochés
  ADD COLUMN niveau   integer NOT NULL DEFAULT 1 CHECK (niveau BETWEEN 1 AND 4),
  -- Personnes tenant les rôles : { "pilote": { "utilisateurId": "…", "nom": "…" }, … }
  ADD COLUMN roles    jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE projet_demandes ALTER COLUMN type DROP NOT NULL;
ALTER TABLE projet_demandes ADD COLUMN criteres jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Niveau des projets existants, d'après la jauge et les seuils par défaut (300, 1 500, 5 000).
UPDATE projets SET niveau = CASE
  WHEN jauge >= 5000 THEN 4 WHEN jauge >= 1500 THEN 3 WHEN jauge >= 300 THEN 2 ELSE 1 END;

-- Tâches : origine (tâche type, module, jalon) et rôles.
ALTER TABLE projet_taches
  ADD COLUMN code                 text,                          -- tâche type d'origine ; NULL pour une tâche ajoutée à la main
  ADD COLUMN module               text NOT NULL DEFAULT 'socle',
  ADD COLUMN jalon                text NOT NULL DEFAULT 'J+7',   -- jalon d'origine ; rattachée au jalon actif suivant
  ADD COLUMN porte                text NOT NULL DEFAULT 'pilote',
  ADD COLUMN fait_role            text NOT NULL DEFAULT '',
  ADD COLUMN valide_role          text NOT NULL DEFAULT '',
  ADD COLUMN informe              jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN livrable             text NOT NULL DEFAULT '',
  ADD COLUMN bloquante            boolean NOT NULL DEFAULT false,
  ADD COLUMN incompressible_jours integer,
  ADD COLUMN relance_le           timestamptz;

CREATE UNIQUE INDEX projet_taches_code_idx ON projet_taches (projet_id, code) WHERE code IS NOT NULL;

-- Reprise des tâches existantes : jalon = premier jalon du squelette dont l'échéance suit la tâche.
UPDATE projet_taches SET jalon = CASE
  WHEN decalage <= -180 THEN 'T-180' WHEN decalage <= -120 THEN 'T-120' WHEN decalage <= -90 THEN 'T-90'
  WHEN decalage <= -60 THEN 'T-60' WHEN decalage <= -30 THEN 'T-30' WHEN decalage <= -7 THEN 'T-7' ELSE 'J+7' END;
UPDATE projet_taches SET porte = CASE branche
  WHEN 'Chef de service' THEN 'chef_service' WHEN 'Logistique' THEN 'ref_logistique' WHEN 'Animation' THEN 'ref_animation'
  WHEN 'Protocole' THEN 'ref_protocole' WHEN 'Affichage' THEN 'ref_affichage' WHEN 'KIOSC' THEN 'ref_kiosc'
  WHEN 'VSL' THEN 'ref_vsl' ELSE CASE WHEN branche LIKE 'Prestataire%' THEN 'prestataire' ELSE 'pilote' END END;

-- Passage des jalons : une ligne par jalon franchi.
CREATE TABLE projet_jalons (
  projet_id   text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  code        text NOT NULL,
  decide_par  text NOT NULL,
  commentaire text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projet_id, code)
);

CREATE TRIGGER projet_jalons_updated_at BEFORE UPDATE ON projet_jalons
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();
