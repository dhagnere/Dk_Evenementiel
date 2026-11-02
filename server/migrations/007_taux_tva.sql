-- Taux de TVA par article. Les prix restent saisis et valorisés TTC ; le taux sert à en déduire le HT
-- (fiche article, bon de livraison). Il est figé sur la demande au moment de la remise.

ALTER TABLE stock_articles
  ADD COLUMN taux_tva numeric(4,2) NOT NULL DEFAULT 20
  CHECK (taux_tva IN (0, 2.1, 5.5, 10, 20));

ALTER TABLE stock_demandes ADD COLUMN taux_tva_livre numeric(4,2);
UPDATE stock_demandes SET taux_tva_livre = 20 WHERE statut = 'Remise';
