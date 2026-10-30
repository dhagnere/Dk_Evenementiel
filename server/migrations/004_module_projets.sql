-- Module Projets événementiels, repris de l'artefact « Balise événementielle » : projets avec
-- rétroplanning (tâches et démarches exprimées en jours par rapport au jour J), matériel
-- logistique, prestataires, budget, bilan, plan d'implantation, et demandes d'événement.

-- Matériel logistique prêté puis rendu (barrières, tentes…). code : rattachement aux éléments du
-- plan d'implantation (a01 = barrières Vauban, a05 = tentes 3×3…).
CREATE TABLE materiel_articles (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code       text UNIQUE,
  nom        text NOT NULL,
  unite      text NOT NULL DEFAULT 'u.',
  total      integer NOT NULL DEFAULT 0 CHECK (total >= 0),
  actif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER materiel_articles_updated_at BEFORE UPDATE ON materiel_articles
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

INSERT INTO materiel_articles (code, nom, unite, total) VALUES
  ('a01', 'Barrières Vauban', 'u.', 300),
  ('a02', 'Podium modulaire', 'm²', 60),
  ('a03', 'Tables', 'u.', 120),
  ('a04', 'Chaises', 'u.', 800),
  ('a05', 'Tentes 3×3', 'u.', 40),
  ('a06', 'Grilles d''exposition', 'u.', 80),
  ('a07', 'Kits sonorisation', 'kit', 4),
  ('a08', 'Groupes électrogènes', 'u.', 3),
  ('a09', 'Conteneurs à déchets', 'u.', 50);

-- Demandes d'événement déposées par les directions, mairies de quartier et élus.
CREATE TABLE projet_demandes (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  intitule       text NOT NULL,
  demandeur_id   text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  demandeur_nom  text NOT NULL,
  structure      text NOT NULL,
  contact        text NOT NULL DEFAULT '',
  date_souhaitee date NOT NULL,
  lieu           text NOT NULL DEFAULT '',
  type           text NOT NULL CHECK (type IN ('festif', 'protocolaire', 'quartier')),
  jauge          integer CHECK (jauge >= 0),
  besoins        jsonb NOT NULL DEFAULT '[]'::jsonb,
  description    text NOT NULL DEFAULT '',
  statut         text NOT NULL DEFAULT 'nouvelle' CHECK (statut IN ('nouvelle', 'instruction', 'acceptee', 'refusee')),
  reponse        text NOT NULL DEFAULT '',
  projet_id      text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER projet_demandes_updated_at BEFORE UPDATE ON projet_demandes
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

CREATE TABLE projets (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  titre        text NOT NULL,
  type         text NOT NULL CHECK (type IN ('festif', 'protocolaire', 'quartier')),
  date_jour    date NOT NULL,                  -- jour J : toutes les échéances en dépendent
  date_fin     date,
  lieu         text NOT NULL DEFAULT '',
  jauge        integer CHECK (jauge >= 0),
  demandeur    text NOT NULL DEFAULT '',
  referent     text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  statut       text NOT NULL DEFAULT 'preparation' CHECK (statut IN ('preparation', 'realise', 'cloture', 'annule')),
  inscrit_le   date NOT NULL DEFAULT CURRENT_DATE,  -- sert au contrôle de l'échéance des 6 mois
  demande_id   text REFERENCES projet_demandes (id) ON DELETE SET NULL,
  -- Lien avec le calendrier (phase des liaisons entre modules).
  evenement_id text REFERENCES evenements (id) ON DELETE SET NULL,
  -- Planning du jour J et implantation.
  montage      text NOT NULL DEFAULT '',
  ouverture    text NOT NULL DEFAULT '',
  fermeture    text NOT NULL DEFAULT '',
  demontage    text NOT NULL DEFAULT '',
  implantation text NOT NULL DEFAULT '',
  -- Bilan J+7 : { frequentation, forts, ameliorer, incidents }.
  bilan        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (date_fin IS NULL OR date_fin >= date_jour)
);

CREATE INDEX projets_date_idx ON projets (date_jour);

CREATE TRIGGER projets_updated_at BEFORE UPDATE ON projets
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

ALTER TABLE projet_demandes ADD FOREIGN KEY (projet_id) REFERENCES projets (id) ON DELETE SET NULL;

-- Tâches du rétroplanning. decalage : jours par rapport au jour J (-180 = six mois avant).
CREATE TABLE projet_taches (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  decalage   integer NOT NULL,
  branche    text NOT NULL DEFAULT '',
  libelle    text NOT NULL,
  fait       boolean NOT NULL DEFAULT false,
  fait_par   text NOT NULL DEFAULT '',
  fait_le    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projet_taches_projet_idx ON projet_taches (projet_id);

CREATE TRIGGER projet_taches_updated_at BEFORE UPDATE ON projet_taches
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Démarches de sécurité et réglementaires.
CREATE TABLE projet_demarches (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  decalage   integer NOT NULL,
  libelle    text NOT NULL,
  statut     text NOT NULL DEFAULT 'a_faire' CHECK (statut IN ('a_faire', 'depose', 'obtenu', 'na')),
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projet_demarches_projet_idx ON projet_demarches (projet_id);

CREATE TRIGGER projet_demarches_updated_at BEFORE UPDATE ON projet_demarches
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Prestataires. pieces : { devis, assurance, urssaf, conformite } → reçue ou non.
CREATE TABLE projet_prestataires (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  nom        text NOT NULL,
  prestation text NOT NULL DEFAULT '',
  contact    text NOT NULL DEFAULT '',
  arrivee    text NOT NULL DEFAULT '',
  depart     text NOT NULL DEFAULT '',
  montant    numeric(12, 2),
  lien       text NOT NULL DEFAULT '',
  pieces     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projet_prestataires_projet_idx ON projet_prestataires (projet_id);

CREATE TRIGGER projet_prestataires_updated_at BEFORE UPDATE ON projet_prestataires
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

CREATE TABLE projet_budget (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  poste      text NOT NULL,
  prevu      numeric(12, 2) NOT NULL DEFAULT 0,
  realise    numeric(12, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX projet_budget_projet_idx ON projet_budget (projet_id);

CREATE TRIGGER projet_budget_updated_at BEFORE UPDATE ON projet_budget
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Matériel réservé : bloqué du jour J − 1 au jour de fin + 1 (montage et démontage).
CREATE TABLE projet_materiel (
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  article_id text NOT NULL REFERENCES materiel_articles (id),
  quantite   integer NOT NULL CHECK (quantite >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (projet_id, article_id)
);

CREATE TRIGGER projet_materiel_updated_at BEFORE UPDATE ON projet_materiel
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Plan d'implantation : le plan courant (version NULL) et les versions figées aux réunions jalon.
CREATE TABLE projet_plans (
  id         text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  projet_id  text NOT NULL REFERENCES projets (id) ON DELETE CASCADE,
  libelle    text,                             -- NULL : plan courant ; sinon nom de la version figée
  document   jsonb NOT NULL,
  auteur_nom text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX projet_plans_courant_idx ON projet_plans (projet_id) WHERE libelle IS NULL;

CREATE TRIGGER projet_plans_updated_at BEFORE UPDATE ON projet_plans
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Modèles de rétroplanning (types : f = festif, p = protocolaire, q = quartier).
INSERT INTO parametres (cle, valeur) VALUES ('projets_modeles', '{
  "branches": ["Chef de service", "VSL", "KIOSC", "Protocole", "Animation", "Logistique", "Affichage"],
  "taches": [
    {"o": -180, "b": "Chef de service", "l": "Inscription au calendrier et arbitrage de la date", "t": "fpq"},
    {"o": -180, "b": "Chef de service", "l": "Note de cadrage : objectifs, publics, jauge prévisionnelle", "t": "fp"},
    {"o": -175, "b": "Logistique", "l": "Pré-réservation du site et contrôle des occupations concurrentes", "t": "fpq"},
    {"o": -170, "b": "Chef de service", "l": "Désignation d''un référent par branche", "t": "f"},
    {"o": -120, "b": "Animation", "l": "Validation du programme par l''élu référent", "t": "fq"},
    {"o": -120, "b": "Chef de service", "l": "Budget prévisionnel validé", "t": "fp"},
    {"o": -110, "b": "Logistique", "l": "Lancement des consultations prestataires", "t": "f"},
    {"o": -100, "b": "KIOSC", "l": "Plan de communication arrêté", "t": "f"},
    {"o": -90, "b": "Chef de service", "l": "Dépôt des dossiers réglementaires", "t": "fq"},
    {"o": -90, "b": "Logistique", "l": "Plan d''implantation, version 1", "t": "f"},
    {"o": -90, "b": "Protocole", "l": "Liste des invités, version 1", "t": "fp"},
    {"o": -60, "b": "Chef de service", "l": "Tenue de la réunion jalon 1", "t": "fpq"},
    {"o": -60, "b": "Logistique", "l": "Réservation du matériel", "t": "fpq"},
    {"o": -55, "b": "Logistique", "l": "Bons de commande prestataires notifiés", "t": "f"},
    {"o": -45, "b": "Affichage", "l": "BAT des supports d''affichage validés", "t": "fq"},
    {"o": -30, "b": "Chef de service", "l": "Tenue de la réunion jalon 2", "t": "fpq"},
    {"o": -30, "b": "Protocole", "l": "Envoi des invitations", "t": "fp"},
    {"o": -25, "b": "Affichage", "l": "Diffusion de l''affichage", "t": "fq"},
    {"o": -21, "b": "Logistique", "l": "Fiche technique transmise aux prestataires", "t": "f"},
    {"o": -15, "b": "Chef de service", "l": "Tenue de la réunion jalon 3", "t": "fp"},
    {"o": -15, "b": "Logistique", "l": "Planning montage et démontage figé", "t": "fq"},
    {"o": -12, "b": "Animation", "l": "Conducteur minute par minute", "t": "fp"},
    {"o": -10, "b": "Protocole", "l": "Plan de placement et ordre des discours", "t": "p"},
    {"o": -7, "b": "Chef de service", "l": "Tenue de la réunion jalon 4 (brief des équipes)", "t": "fpq"},
    {"o": -5, "b": "Logistique", "l": "Pièces prestataires complètes et vérifiées", "t": "f"},
    {"o": -3, "b": "Logistique", "l": "Kit jour J : badges, radios, annuaire de crise", "t": "fp"},
    {"o": -2, "b": "Chef de service", "l": "Point météo et activation éventuelle du plan de repli", "t": "fq"},
    {"o": 0, "b": "Logistique", "l": "Montage et réception des installations", "t": "fpq"},
    {"o": 0, "b": "Chef de service", "l": "Visite de sécurité et levée des réserves", "t": "f"},
    {"o": 0, "b": "Logistique", "l": "Démontage et remise en état du site", "t": "fpq"},
    {"o": 7, "b": "Chef de service", "l": "Tenue de la réunion jalon 5 (bilan)", "t": "fpq"},
    {"o": 7, "b": "Chef de service", "l": "Bilan financier réalisé", "t": "fp"},
    {"o": 7, "b": "Logistique", "l": "Retours prestataires et factures", "t": "f"},
    {"o": 7, "b": "KIOSC", "l": "Archivage photos et revue de presse", "t": "fp"}
  ],
  "reglementaire": [
    {"o": -90, "l": "Autorisation d''occupation du domaine public", "t": "fpq"},
    {"o": -90, "l": "Dossier de sécurité et plan d''implantation", "t": "f"},
    {"o": -60, "l": "Dimensionnement du DPS (grille RNMSC)", "t": "f"},
    {"o": -30, "l": "Arrêté municipal de circulation et stationnement", "t": "fq"},
    {"o": -30, "l": "Autorisation temporaire de débit de boissons", "t": "fq"},
    {"o": -30, "l": "Déclaration SACEM", "t": "fq"},
    {"o": -30, "l": "Attestation d''assurance RC organisateur", "t": "fpq"},
    {"o": -30, "l": "Mesures de sûreté validées (Vigipirate)", "t": "fp"},
    {"o": -15, "l": "Visite des structures temporaires (CTS, tribunes, podium)", "t": "f"},
    {"o": -15, "l": "Accessibilité PMR vérifiée", "t": "fpq"}
  ],
  "budgetPostes": ["Prestations techniques", "Sécurité et secours", "Communication et impression", "Artistes et animation", "Réception et protocole", "Location de matériel"]
}'::jsonb);
