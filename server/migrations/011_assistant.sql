-- Onglet Assistant (super-administrateur) : index produit par l'assistant de messagerie du service.
-- L'assistant lit la boîte Outlook du service et produit un index complet (événements, dossiers, mails,
-- prestataires). Chaque import remplace le contenu de l'index ; seules les décisions prises dans
-- l'application sont conservées d'un import à l'autre : le projet rattaché à un événement et les tâches
-- créées à partir d'un dossier.

CREATE TABLE assistant_imports (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  genere_le    text NOT NULL DEFAULT '',          -- horodatage écrit par l'assistant
  periode      text NOT NULL DEFAULT '',
  compte       jsonb NOT NULL DEFAULT '{}'::jsonb, -- nombre d'événements, dossiers, mails, prestataires
  par          text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_evenements (
  code         text PRIMARY KEY,                  -- identifiant de l'assistant, ex. FEERIQUE26
  nom          text NOT NULL DEFAULT '',
  date_jour    date,
  lieu         text NOT NULL DEFAULT '',
  projet_id    text REFERENCES projets (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assistant_dossiers (
  code             text PRIMARY KEY,              -- identifiant de l'assistant, ex. D01
  evenement_code   text NOT NULL DEFAULT '',
  branche          text NOT NULL DEFAULT '',
  titre            text NOT NULL DEFAULT '',
  statut           text NOT NULL DEFAULT '',
  priorite         text NOT NULL DEFAULT '',
  donnees          jsonb NOT NULL DEFAULT '{}'::jsonb, -- fiche complète telle que produite par l'assistant
  converties       jsonb NOT NULL DEFAULT '{}'::jsonb, -- échéances et actions déjà transformées en tâches
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_dossiers_evenement_idx ON assistant_dossiers (evenement_code);

CREATE TABLE assistant_mails (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  numero         integer NOT NULL DEFAULT 0,
  date           text NOT NULL DEFAULT '',
  expediteur     text NOT NULL DEFAULT '',
  objet          text NOT NULL DEFAULT '',
  dossier_code   text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_mails_dossier_idx ON assistant_mails (dossier_code);

CREATE TABLE assistant_prestataires (
  nom          text PRIMARY KEY,
  domaine      text NOT NULL DEFAULT '',
  donnees      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
