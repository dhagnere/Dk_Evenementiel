-- Les écrans ne disent rien de la messagerie utilisée pour la mise à jour automatique :
-- valeur interne neutre pour l'origine des mails, liens et messages d'erreur techniques effacés.
UPDATE assistant_mails SET source = 'releve', lien = '' WHERE source = 'gmail';
UPDATE assistant_releves SET erreur = 'Erreur de connexion à la messagerie' WHERE erreur <> '' AND erreur ~* '(gmail|google|imap)';
UPDATE assistant_releves SET par = 'mise à jour automatique' WHERE par = 'relevé automatique';
UPDATE assistant_dossiers
   SET donnees = jsonb_set(donnees, '{pieces_jointes}',
         (SELECT coalesce(jsonb_agg(CASE WHEN p->>'emplacement' ~* 'gmail'
                                         THEN jsonb_set(p, '{emplacement}', to_jsonb('Messagerie de l''assistant'::text)) ELSE p END), '[]'::jsonb)
            FROM jsonb_array_elements(donnees->'pieces_jointes') p))
 WHERE jsonb_typeof(donnees->'pieces_jointes') = 'array' AND donnees::text ~* 'gmail';
