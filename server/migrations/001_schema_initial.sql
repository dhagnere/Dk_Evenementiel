-- Schéma initial de DK_Calendar sous PostgreSQL (reprise des 5 collections MongoDB).
--
-- Conventions :
--   * colonnes en snake_case ; le serveur les renvoie en camelCase dans l'API (voir src/db.ts) ;
--   * clé primaire `id` en texte : UUID généré par défaut, mais un identifiant MongoDB (ObjectId en
--     hexadécimal) reste accepté, ce qui permet de reprendre les données et les sauvegardes existantes
--     sans renuméroter ;
--   * created_at / updated_at tenus à jour automatiquement (trigger maj_updated_at).
--
-- Nécessite PostgreSQL 13 ou plus (gen_random_uuid() intégré).

CREATE OR REPLACE FUNCTION maj_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Les emails sont stockés en minuscules et sans espaces autour, comme le faisait Mongoose.
CREATE OR REPLACE FUNCTION normaliser_email() RETURNS trigger AS $$
BEGIN
  NEW.email := lower(btrim(NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Événements : une ligne par jour occupé (date_clef) ; une « série » partage nom, date_de_debut et
-- date_de_fin.
CREATE TABLE evenements (
  id                    text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id              text,
  nom                   text NOT NULL,
  date_clef             timestamptz,
  date_de_debut         timestamptz,
  date_de_fin           timestamptz,
  lieu                  text NOT NULL DEFAULT '',
  latitude              double precision,
  longitude             double precision,
  -- 'attente' (jamais tenté), 'ok' (géocodé), 'echec' (adresse non trouvée)
  statut_geocodage      text NOT NULL DEFAULT 'attente',
  quartier              text NOT NULL DEFAULT '',
  pilote                text NOT NULL DEFAULT '',
  direction_pilote      text NOT NULL DEFAULT '',
  organisateur          text NOT NULL DEFAULT '',
  nature                text NOT NULL DEFAULT '',
  niveau                text NOT NULL DEFAULT '',
  type                  text NOT NULL DEFAULT '',
  statut                text NOT NULL DEFAULT 'Brouillon',
  tardive               text NOT NULL DEFAULT 'Non',
  reprog                text NOT NULL DEFAULT 'Non',
  validation_technique  boolean NOT NULL DEFAULT false,
  validation_politique  boolean NOT NULL DEFAULT false,
  valid_par_date_clef   boolean NOT NULL DEFAULT false,
  statut_dimport        text NOT NULL DEFAULT '',
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX evenements_event_id_idx         ON evenements (event_id);
CREATE INDEX evenements_nom_idx              ON evenements (nom);
CREATE INDEX evenements_date_clef_idx        ON evenements (date_clef);
CREATE INDEX evenements_date_de_debut_idx    ON evenements (date_de_debut);
CREATE INDEX evenements_quartier_idx         ON evenements (quartier);
CREATE INDEX evenements_statut_idx           ON evenements (statut);
CREATE INDEX evenements_nature_idx           ON evenements (nature);
CREATE INDEX evenements_statut_geocodage_idx ON evenements (statut_geocodage);

CREATE TRIGGER evenements_updated_at BEFORE UPDATE ON evenements
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Comptes utilisateurs.
CREATE TABLE utilisateurs (
  id                 text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nom                text NOT NULL,
  email              text NOT NULL UNIQUE,
  role               text NOT NULL CHECK (role IN ('Administrateur', 'Consultant')),
  -- Actif | Suspendu | Mot de passe à définir
  statut             text NOT NULL DEFAULT 'Actif',
  hash               text NOT NULL,
  sel                text NOT NULL,
  derniere_connexion timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER utilisateurs_email BEFORE INSERT OR UPDATE OF email ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION normaliser_email();
CREATE TRIGGER utilisateurs_updated_at BEFORE UPDATE ON utilisateurs
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Demandes d'accès déposées depuis la page publique.
CREATE TABLE demandes_acces (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nom          text NOT NULL,
  email        text NOT NULL,
  organisation text NOT NULL DEFAULT '',
  motif        text NOT NULL DEFAULT '',
  statut       text NOT NULL DEFAULT 'En attente' CHECK (statut IN ('En attente', 'Approuvée', 'Rejetée')),
  motif_rejet  text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX demandes_acces_email_idx ON demandes_acces (email);

CREATE TRIGGER demandes_acces_email BEFORE INSERT OR UPDATE OF email ON demandes_acces
  FOR EACH ROW EXECUTE FUNCTION normaliser_email();
CREATE TRIGGER demandes_acces_updated_at BEFORE UPDATE ON demandes_acces
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Instantanés complets des événements et des comptes (rollback après un import, etc.).
-- Le contenu est conservé en JSON, au même format que l'export de l'API (camelCase, `_id`).
CREATE TABLE sauvegardes (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- quotidienne | manuelle | avant-import-evenements | avant-import-utilisateurs |
  -- avant-restauration | avant-fusion-doublons
  type                text NOT NULL,
  nombre_evenements   integer NOT NULL,
  nombre_utilisateurs integer NOT NULL,
  evenements          jsonb NOT NULL,
  utilisateurs        jsonb NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sauvegardes_created_at_idx ON sauvegardes (created_at DESC);

CREATE TRIGGER sauvegardes_updated_at BEFORE UPDATE ON sauvegardes
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Journal d'audit : qui a fait quoi et quand. L'identité est recopiée (et non référencée) pour
-- rester lisible après la suppression d'un compte.
CREATE TABLE journal_actions (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  utilisateur_id    text,
  utilisateur_nom   text NOT NULL DEFAULT '',
  utilisateur_email text NOT NULL DEFAULT '',
  action            text NOT NULL,
  cible             text NOT NULL DEFAULT '',
  details           jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX journal_actions_created_at_idx        ON journal_actions (created_at DESC);
CREATE INDEX journal_actions_utilisateur_email_idx ON journal_actions (utilisateur_email);
CREATE INDEX journal_actions_action_idx            ON journal_actions (action);
