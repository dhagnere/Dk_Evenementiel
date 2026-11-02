-- Prix d'achat des articles et valorisation des livraisons.
--
-- prix_achat : dernier prix unitaire TTC payé (création, réception ou saisie dans la fiche). Information d'achat :
-- la valorisation du stock reste le PMP.
-- prix_unitaire_livre / valeur_livree : PMP TTC figé au moment de la remise, et total livré. Les remises antérieures
-- sont reprises avec la valeur de leur mouvement de sortie.

ALTER TABLE stock_articles ADD COLUMN prix_achat numeric(12,4);
-- Reprise : prix de la dernière réception s'il y en a une, sinon PMP actuel.
UPDATE stock_articles SET prix_achat = pmp WHERE NOT a_valoriser;
UPDATE stock_articles a
   SET prix_achat = round(m.valeur / m.quantite, 4)
  FROM (SELECT DISTINCT ON (article_id) article_id, valeur, quantite FROM stock_mouvements
         WHERE type = 'Entrée' AND quantite > 0 ORDER BY article_id, created_at DESC) m
 WHERE m.article_id = a.id;

ALTER TABLE stock_demandes
  ADD COLUMN prix_unitaire_livre numeric(12,4),
  ADD COLUMN valeur_livree numeric(12,2),
  ADD COLUMN remise_le timestamptz;

UPDATE stock_demandes d
   SET valeur_livree = round(abs(m.valeur), 2),
       prix_unitaire_livre = round(abs(m.valeur) / NULLIF(d.quantite, 0), 4),
       remise_le = m.created_at
  FROM stock_mouvements m
 WHERE m.demande_id = d.id AND m.type = 'Sortie' AND d.statut = 'Remise';
