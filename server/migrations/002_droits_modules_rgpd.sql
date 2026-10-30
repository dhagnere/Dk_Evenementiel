-- Socle de l'application unifiée : super-administrateur, droits par module, directions,
-- paramètres (dont les durées de conservation RGPD) et métadonnées des fichiers stockés sur S3.
--
-- Reprise des comptes existants :
--   * Administrateur → super-administrateur (accès complet à tous les modules) ;
--   * Consultant     → niveau « contribution » sur le module Calendrier (consultation et dépôt d'une
--                      fiche de renseignement, exactement ce qu'un consultant pouvait faire avant).

-- Directions de la collectivité : servent à délimiter le périmètre d'un compte.
CREATE TABLE directions (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nom        text NOT NULL UNIQUE,
  actif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER directions_updated_at BEFORE UPDATE ON directions
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

ALTER TABLE utilisateurs
  ADD COLUMN super_admin  boolean NOT NULL DEFAULT false,
  ADD COLUMN direction_id text REFERENCES directions (id) ON DELETE SET NULL;

UPDATE utilisateurs SET super_admin = (role = 'Administrateur');

-- Un niveau par compte et par module ; l'absence de ligne vaut « aucun accès ». Un super-administrateur
-- n'a besoin d'aucune ligne : il a tous les droits sur tous les modules.
CREATE TABLE droits_modules (
  utilisateur_id text NOT NULL REFERENCES utilisateurs (id) ON DELETE CASCADE,
  module         text NOT NULL,
  niveau         text NOT NULL CHECK (niveau IN ('lecture', 'contribution', 'validation', 'administration')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (utilisateur_id, module)
);

CREATE TRIGGER droits_modules_updated_at BEFORE UPDATE ON droits_modules
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

INSERT INTO droits_modules (utilisateur_id, module, niveau)
  SELECT id, 'calendrier', 'contribution' FROM utilisateurs WHERE role = 'Consultant';

ALTER TABLE utilisateurs DROP COLUMN role;

-- Paramètres de l'application, modifiables par le super-administrateur.
CREATE TABLE parametres (
  cle        text PRIMARY KEY,
  valeur     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER parametres_updated_at BEFORE UPDATE ON parametres
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Durées de conservation en jours (0 = règle désactivée). Valeurs par défaut à valider avec le DPO.
INSERT INTO parametres (cle, valeur) VALUES ('conservation', '{
  "journalJours": 365,
  "demandesAccesTraiteesJours": 90,
  "comptesInactifsSuspensionJours": 365,
  "comptesSuspendusSuppressionJours": 730
}'::jsonb);

-- Fichiers déposés sur le stockage objet (S3) : seules les métadonnées sont en base.
CREATE TABLE fichiers (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  cle_stockage text NOT NULL UNIQUE,
  nom_origine  text NOT NULL,
  type_mime    text NOT NULL DEFAULT 'application/octet-stream',
  taille       bigint NOT NULL DEFAULT 0,
  -- Module propriétaire (calendrier, stock, projets…) et objet auquel le fichier est rattaché.
  module       text NOT NULL,
  rattachement text NOT NULL DEFAULT '',
  depose_par   text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX fichiers_rattachement_idx ON fichiers (module, rattachement);

CREATE TRIGGER fichiers_updated_at BEFORE UPDATE ON fichiers
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();
