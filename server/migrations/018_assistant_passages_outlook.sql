-- Passages de lecture d'Outlook Web : pièces rangées dans OneDrive et mails déplacés vers le dossier Outlook
-- de classement (DKEVENTS), en plus des compteurs existants.
ALTER TABLE assistant_releves
  ADD COLUMN pieces   integer NOT NULL DEFAULT 0,
  ADD COLUMN deplaces integer NOT NULL DEFAULT 0;
