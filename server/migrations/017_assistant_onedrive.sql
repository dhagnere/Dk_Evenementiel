-- Rangement des pièces jointes dans OneDrive (Mes fichiers → Assistant → <dossier de l'événement>) :
-- nom du dossier OneDrive de chaque événement. L'emplacement de chaque pièce rangée est noté dans
-- assistant_mails.pieces_jointes (clé « onedrive »).
ALTER TABLE assistant_evenements ADD COLUMN dossier_onedrive text NOT NULL DEFAULT '';
