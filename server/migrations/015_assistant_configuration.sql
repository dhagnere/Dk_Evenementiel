-- Réglages de la mise à jour automatique saisis à l'écran par un super-administrateur (adresse de la
-- messagerie de l'assistant, fréquence, adresses du service). Le mot de passe est chiffré (AES-256-GCM,
-- clé dérivée de JWT_SECRET) et n'est jamais renvoyé à l'écran.
CREATE TABLE assistant_config (
  cle          text PRIMARY KEY,
  valeur       jsonb NOT NULL DEFAULT '{}'::jsonb,
  par          text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
