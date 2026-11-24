-- Relevé direct de la boîte Gmail du service : l'application lit elle-même les mails transférés,
-- sans passer par l'index de l'assistant.
--
-- Les mails relevés s'ajoutent au registre (source « gmail ») ; un import d'index ne remplace plus que
-- les lignes venues de l'index (source « index »). Les dossiers ouverts par le relevé (codes M001, M002…)
-- ne sont jamais supprimés par un import.

ALTER TABLE assistant_mails
  ADD COLUMN source          text NOT NULL DEFAULT 'index',   -- 'index' | 'gmail'
  ADD COLUMN empreinte       text,                            -- expéditeur + date + objet : un mail transféré deux fois n'est compté qu'une fois
  ADD COLUMN sens            text NOT NULL DEFAULT '',        -- 'reçu' | 'envoyé'
  ADD COLUMN destinataires   text NOT NULL DEFAULT '',
  ADD COLUMN date_envoi      timestamptz,
  ADD COLUMN corps           text NOT NULL DEFAULT '',
  ADD COLUMN consigne        text NOT NULL DEFAULT '',        -- texte ajouté au-dessus du transfert
  ADD COLUMN pieces_jointes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN lien            text NOT NULL DEFAULT '',        -- lien vers la conversation dans Gmail
  ADD COLUMN classement      text NOT NULL DEFAULT '';        -- comment le mail a été rattaché à son dossier
CREATE UNIQUE INDEX assistant_mails_empreinte_idx ON assistant_mails (empreinte) WHERE empreinte IS NOT NULL;

ALTER TABLE assistant_dossiers ADD COLUMN source text NOT NULL DEFAULT 'index';   -- 'index' | 'releve'

-- Où en est la lecture de la boîte : dernier message lu (UID IMAP), remis à zéro si la boîte change.
CREATE TABLE assistant_releve_etat (
  cle            text PRIMARY KEY,
  uid_validity   text NOT NULL DEFAULT '',
  dernier_uid    bigint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Historique des relevés, pour l'onglet et le diagnostic.
CREATE TABLE assistant_releves (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  debut          timestamptz NOT NULL DEFAULT now(),
  fin            timestamptz,
  lus            integer NOT NULL DEFAULT 0,       -- messages lus dans la boîte
  nouveaux       integer NOT NULL DEFAULT 0,       -- mails ajoutés au registre
  doublons       integer NOT NULL DEFAULT 0,
  dossiers_crees integer NOT NULL DEFAULT 0,
  analyses       integer NOT NULL DEFAULT 0,
  erreur         text NOT NULL DEFAULT '',
  par            text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assistant_releves_debut_idx ON assistant_releves (debut DESC);
