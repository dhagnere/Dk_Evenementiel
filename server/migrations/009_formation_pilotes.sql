-- Formation des pilotes : progression en quatre étapes avant l'autonomie.
--   1. un N1 en binôme avec un formateur ;   2. un N1 seul ;
--   3. un N2 en binôme ;                       4. un N3 en copilote.
-- Une étape est acquise quand le pilote a mené un projet du niveau et du mode voulus jusqu'au bilan
-- (dernier jalon franchi). Les pilotes déjà expérimentés sont déclarés autonomes directement.

ALTER TABLE projets
  ADD COLUMN formation_mode text CHECK (formation_mode IN ('binome', 'seul', 'copilote')),
  ADD COLUMN formateur      jsonb;   -- { "utilisateurId": "…", "nom": "…" }

CREATE TABLE pilotes_formation (
  utilisateur_id text PRIMARY KEY REFERENCES utilisateurs (id) ON DELETE CASCADE,
  autonome       boolean NOT NULL DEFAULT false,
  autonome_le    date,
  decide_par     text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER pilotes_formation_updated_at BEFORE UPDATE ON pilotes_formation
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();
