-- Mails supprimés du registre par le chef de service : leur empreinte est gardée pour qu'un nouveau
-- transfert du même mail ne le fasse pas revenir. Messages ignorés à la mise à jour (expéditeur hors service).
CREATE TABLE assistant_mails_supprimes (
  empreinte    text PRIMARY KEY,
  objet        text NOT NULL DEFAULT '',
  par          text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assistant_releves ADD COLUMN ignores integer NOT NULL DEFAULT 0;
