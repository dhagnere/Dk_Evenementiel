-- Corrections du chef de service sur les dossiers de l'assistant (statut, notes), conservées d'un import à l'autre
-- et exportables pour la mise à jour suivante de l'assistant.
ALTER TABLE assistant_dossiers ADD COLUMN corrections jsonb NOT NULL DEFAULT '{}'::jsonb;
