-- Module Stock & Protocole : catalogue, mouvements, réceptions, demandes, registre protocolaire et
-- stocks déportés. Règles de gestion issues de la maquette (maquettes/stock-goodies).

-- Catalogue. disponible = stock_physique - stock_reserve (quantités réservées par les demandes en cours).
CREATE TABLE stock_articles (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  reference      text NOT NULL UNIQUE,            -- G-001 (goodies), P-101 (protocole)
  libelle        text NOT NULL,
  famille        text NOT NULL DEFAULT '',
  categorie      text NOT NULL CHECK (categorie IN ('Goodies', 'Protocole')),
  emplacement    text NOT NULL DEFAULT '',
  fournisseur    text NOT NULL DEFAULT '',
  delai_jours    integer NOT NULL DEFAULT 0 CHECK (delai_jours >= 0),
  stock_physique integer NOT NULL DEFAULT 0 CHECK (stock_physique >= 0),
  stock_reserve  integer NOT NULL DEFAULT 0 CHECK (stock_reserve >= 0),
  seuil          integer NOT NULL DEFAULT 0 CHECK (seuil >= 0),
  -- Prix moyen pondéré, recalculé à chaque réception. a_valoriser : prix encore inconnu.
  pmp            numeric(12, 4) NOT NULL DEFAULT 0 CHECK (pmp >= 0),
  a_valoriser    boolean NOT NULL DEFAULT false,
  actif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (stock_reserve <= stock_physique)
);

CREATE TRIGGER stock_articles_updated_at BEFORE UPDATE ON stock_articles
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Stocks déportés : stock confié à une direction, suivi par un référent qui déclare sorties et retours.
CREATE TABLE stock_depots (
  id                   text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  direction_id         text NOT NULL UNIQUE REFERENCES directions (id),
  referent_id          text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  derniere_declaration timestamptz,
  derniere_relance     timestamptz,
  actif                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER stock_depots_updated_at BEFORE UPDATE ON stock_depots
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

CREATE TABLE stock_depot_lignes (
  depot_id   text NOT NULL REFERENCES stock_depots (id) ON DELETE CASCADE,
  article_id text NOT NULL REFERENCES stock_articles (id),
  quantite   integer NOT NULL DEFAULT 0 CHECK (quantite >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (depot_id, article_id)
);

CREATE TRIGGER stock_depot_lignes_updated_at BEFORE UPDATE ON stock_depot_lignes
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Demandes de sortie déposées par les directions.
CREATE SEQUENCE stock_demandes_numero;

CREATE TABLE stock_demandes (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  numero         text NOT NULL UNIQUE,            -- D-2026-0042
  direction_id   text REFERENCES directions (id) ON DELETE SET NULL,
  direction_nom  text NOT NULL,                   -- copie, lisible même si la direction est renommée
  evenement      text NOT NULL,
  -- Lien futur avec le calendrier (phase des liaisons entre modules).
  evenement_id   text REFERENCES evenements (id) ON DELETE SET NULL,
  article_id     text NOT NULL REFERENCES stock_articles (id),
  quantite       integer NOT NULL CHECK (quantite > 0),
  date_besoin    date NOT NULL,
  motif_tardif   text NOT NULL DEFAULT '',
  -- Demandes protocolaires uniquement.
  beneficiaire   text NOT NULL DEFAULT '',
  occasion       text NOT NULL DEFAULT '',
  elu            text NOT NULL DEFAULT '',
  valeur         numeric(12, 2) NOT NULL DEFAULT 0,
  circuit        text NOT NULL CHECK (circuit IN ('automatique', 'chef de service', 'protocole')),
  statut         text NOT NULL CHECK (statut IN (
                   'En attente chef de service', 'En attente Protocole', 'En attente Cabinet',
                   'Validée', 'Validée auto', 'Refusée', 'Remise', 'Annulée')),
  motif_refus    text NOT NULL DEFAULT '',
  demandeur_id   text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  demandeur_nom  text NOT NULL DEFAULT '',
  -- Étapes successives : [{ date, action, par, motif }].
  historique     jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_demandes_statut_idx ON stock_demandes (statut);
CREATE INDEX stock_demandes_direction_idx ON stock_demandes (direction_id);

CREATE TRIGGER stock_demandes_updated_at BEFORE UPDATE ON stock_demandes
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Réceptions de livraison (bon de commande, marché, achat ponctuel), avec leurs lignes contrôlées.
CREATE TABLE stock_receptions (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  origine     text NOT NULL CHECK (origine IN ('bon de commande', 'marché', 'achat ponctuel')),
  fournisseur text NOT NULL,
  reference   text NOT NULL,
  date        date NOT NULL,
  -- [{ articleId, attendu, recu, nonConforme, prix }]
  lignes      jsonb NOT NULL,
  auteur_id   text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  auteur_nom  text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Journal des mouvements : toute variation de stock y laisse une trace.
CREATE SEQUENCE stock_mouvements_numero;

CREATE TABLE stock_mouvements (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  numero       text NOT NULL UNIQUE,              -- M-0001
  type         text NOT NULL CHECK (type IN (
                 'Création', 'Entrée', 'Sortie', 'Ajustement', 'Anomalie', 'Réintégration',
                 'Sortie déportée', 'Retour déporté')),
  article_id   text NOT NULL REFERENCES stock_articles (id),
  quantite     integer NOT NULL DEFAULT 0,
  valeur       numeric(12, 2) NOT NULL DEFAULT 0,
  detail       text NOT NULL DEFAULT '',
  motif        text NOT NULL DEFAULT '',
  statut       text NOT NULL CHECK (statut IN ('Appliqué', 'À valider', 'Rejeté', 'À traiter', 'Traitée')),
  demande_id   text REFERENCES stock_demandes (id) ON DELETE SET NULL,
  reception_id text REFERENCES stock_receptions (id) ON DELETE SET NULL,
  depot_id     text REFERENCES stock_depots (id) ON DELETE SET NULL,
  auteur_id    text REFERENCES utilisateurs (id) ON DELETE SET NULL,
  auteur_nom   text NOT NULL DEFAULT '',
  decideur_nom text NOT NULL DEFAULT '',
  decide_le    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_mouvements_article_idx ON stock_mouvements (article_id);
CREATE INDEX stock_mouvements_statut_idx ON stock_mouvements (statut);
CREATE INDEX stock_mouvements_created_at_idx ON stock_mouvements (created_at DESC);

CREATE TRIGGER stock_mouvements_updated_at BEFORE UPDATE ON stock_mouvements
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Registre des cadeaux protocolaires remis (alimenté à la validation par le Cabinet).
CREATE TABLE stock_registre (
  id           text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  date_remise  date NOT NULL,
  beneficiaire text NOT NULL,
  organisme    text NOT NULL DEFAULT '',
  occasion     text NOT NULL DEFAULT '',
  elu          text NOT NULL DEFAULT '',
  article_id   text NOT NULL REFERENCES stock_articles (id),
  quantite     integer NOT NULL CHECK (quantite > 0),
  valeur       numeric(12, 2) NOT NULL DEFAULT 0,
  demande_id   text REFERENCES stock_demandes (id) ON DELETE SET NULL,
  -- Vrai une fois la durée de conservation dépassée : le nom du bénéficiaire est effacé.
  anonymise    boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX stock_registre_beneficiaire_idx ON stock_registre (lower(beneficiaire));

CREATE TRIGGER stock_registre_updated_at BEFORE UPDATE ON stock_registre
  FOR EACH ROW EXECUTE FUNCTION maj_updated_at();

-- Paramètres du module (seuils en euros, délais en jours, emplacements du local).
INSERT INTO parametres (cle, valeur) VALUES ('stock', '{
  "seuilValidationAutomatique": 150,
  "seuilValidationAjustement": 50,
  "delaiDemandeTardiveJours": 10,
  "relanceDeportJours": 30,
  "emplacements": ["Central · A1", "Central · A2", "Central · B1", "Central · B2", "Central · B3", "Central · Coffre"],
  "emplacementProtocole": "Central · Coffre"
}'::jsonb);

-- Durée de conservation du registre protocolaire avant anonymisation (10 ans par défaut, à valider).
UPDATE parametres SET valeur = valeur || '{"registreProtocolaireJours": 3650}'::jsonb WHERE cle = 'conservation';
