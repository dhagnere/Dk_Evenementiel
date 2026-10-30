import { Router } from 'express';
import multer from 'multer';
import { inserer, insererUn, requete, requeteUne, transaction } from '../db.js';
import type { Evenement, Utilisateur } from '../modeles.js';
import { genererHash, genererSel } from '../lib/password.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import {
  parseEventsCsv,
  stringifyEventsCsv,
  parseUsersCsv,
  stringifyUsersCsv,
} from '../lib/csv.js';
import { creerSauvegarde } from '../lib/backup.js';
import { cleIdentite } from '../lib/identiteEvenement.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { synchroniserEvenementsVersGithub } from '../lib/github.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

export const importRouter = Router();

/**
 * Importe des événements depuis un fichier CSV. Un événement de plusieurs jours a une ligne par
 * jour occupé (même nom, même dateDeDebut/dateDeFin, mais dateClef différente) : l'identité d'une
 * ligne se détermine donc par eventId si présent, sinon par (nom, dateClef).
 *
 * Une ligne au statut « Brouillon » est désormais importée comme n'importe quelle autre : elle
 * devient visible dans le Calendrier et la Liste, avec une pastille « Brouillon » pour la
 * distinguer partout dans l'application. Seul un filtre s'applique donc avant toute écriture en
 * base : une ligne dont l'identité correspond à un événement déjà présent (en base, ou déjà
 * rencontrée plus tôt dans le même fichier) est un doublon — elle est ignorée sans rien modifier,
 * pour ne jamais écraser le statut, les validations ou toute autre donnée déjà saisie dans
 * l'application.
 *
 * Les identités déjà en base sont chargées en une seule requête et les nouveaux événements insérés
 * en un seul lot (au lieu de deux allers-retours base par ligne) : avec un gros fichier, la version
 * ligne par ligne pouvait dépasser le délai d'attente du serveur (erreur 502).
 */
importRouter.post('/evenements', requireAdmin, upload.single('fichier'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, message: 'Aucun fichier reçu' });
    return;
  }

  try {
    const { rows, errors } = parseEventsCsv(req.file.buffer.toString('utf-8'));

    await creerSauvegarde('avant-import-evenements');

    const existants = await requete<Evenement>('SELECT event_id, nom, lieu, date_clef, date_de_debut FROM evenements');
    const clesExistantes = new Set(existants.map(cleIdentite));

    const clesVues = new Set<string>();
    const aCreer: typeof rows = [];
    let doublons = 0;

    for (const row of rows) {
      const cle = cleIdentite(row);
      if (clesVues.has(cle) || clesExistantes.has(cle)) {
        doublons++;
        continue;
      }
      clesVues.add(cle);
      aCreer.push(row);
    }

    // Tout le fichier est inséré, ou rien : pas d'import à moitié fait en cas d'erreur.
    if (aCreer.length > 0) {
      await transaction((client) => inserer('evenements', aCreer, client));
    }

    const created = aCreer.length;
    console.log(
      `[import] Événements : ${created} créés, ${doublons} doublons ignorés, ${errors.length} lignes ignorées`
    );
    await consigner(identiteDeRequete(req), 'import_evenements', `${created} créé(s)`, {
      created,
      doublons,
    });
    res.json({ ok: true, created, doublons, errors, total: rows.length });

    // Après avoir répondu au client : pousse l'état complet et à jour des événements (avec leurs
    // attributs actuels — validations, statut…) vers data/evenements.csv sur GitHub, pour que ce
    // fichier serve de seed à jour en cas de futur déploiement. Best-effort, ne bloque jamais
    // l'import lui-même (déjà répondu ci-dessus) ni ne le fait échouer en cas de panne GitHub.
    const resultatSync = await synchroniserEvenementsVersGithub();
    await consigner(identiteDeRequete(req), 'synchronisation_github', resultatSync.message, {
      ok: resultatSync.ok,
    });
  } catch (err) {
    console.error("[import] Échec de l'import événements :", err);
    res.status(500).json({
      ok: false,
      message: `Échec de l'import : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    });
  }
});

/** Exporte tous les événements au format CSV. */
importRouter.get('/evenements/export', requireAuth, async (_req, res) => {
  const events = await requete<Evenement>('SELECT * FROM evenements ORDER BY nom');
  const csv = stringifyEventsCsv(events);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evenements.csv"');
  res.send(csv);
});

/** Importe (upsert) des utilisateurs depuis un fichier CSV. */
importRouter.post('/utilisateurs', requireAdmin, upload.single('fichier'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ ok: false, message: 'Aucun fichier reçu' });
    return;
  }

  try {
    const { rows, errors } = parseUsersCsv(req.file.buffer.toString('utf-8'));

    await creerSauvegarde('avant-import-utilisateurs');

    let created = 0;
    let updated = 0;
    const motsDePasseGeneres: Array<{ email: string; motDePasse: string }> = [];

    // Une seule transaction pour tout le fichier : une ligne en erreur annule l'ensemble.
    await transaction(async (client) => {
      for (const row of rows) {
        const existant = await requeteUne<Utilisateur>('SELECT id FROM utilisateurs WHERE email = $1', [row.email], client);

        if (existant) {
          if (row.motDePasseInitial) {
            const { hash, sel } = await genererHash(row.motDePasseInitial);
            await requete(
              "UPDATE utilisateurs SET nom = $2, role = $3, statut = 'Mot de passe à définir', hash = $4, sel = $5 WHERE id = $1",
              [existant._id, row.nom, row.role, hash, sel],
              client
            );
          } else {
            await requete(
              'UPDATE utilisateurs SET nom = $2, role = $3, statut = $4 WHERE id = $1',
              [existant._id, row.nom, row.role, row.statut],
              client
            );
          }
          updated++;
        } else {
          const motDePasse = row.motDePasseInitial || genererSel().slice(0, 12);
          const { hash, sel } = await genererHash(motDePasse);
          await insererUn(
            'utilisateurs',
            { nom: row.nom, email: row.email, role: row.role, statut: 'Mot de passe à définir', hash, sel },
            client
          );
          motsDePasseGeneres.push({ email: row.email, motDePasse });
          created++;
        }
      }
    });

    if (motsDePasseGeneres.length > 0) {
      console.log('[import] Mots de passe temporaires générés :', motsDePasseGeneres);
    }
    console.log(`[import] Utilisateurs : ${created} créés, ${updated} mis à jour, ${errors.length} lignes ignorées`);
    await consigner(identiteDeRequete(req), 'import_utilisateurs', `${created} créé(s), ${updated} mis à jour`, {
      created,
      updated,
    });
    res.json({ ok: true, created, updated, errors, total: rows.length, motsDePasseGeneres });
  } catch (err) {
    console.error("[import] Échec de l'import utilisateurs :", err);
    res.status(500).json({
      ok: false,
      message: `Échec de l'import : ${err instanceof Error ? err.message : 'erreur inconnue'}`,
    });
  }
});

/** Exporte tous les utilisateurs (sans mot de passe) au format CSV. */
importRouter.get('/utilisateurs/export', requireAdmin, async (_req, res) => {
  const users = await requete<Utilisateur>('SELECT * FROM utilisateurs ORDER BY nom');
  const csv = stringifyUsersCsv(users);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="utilisateurs.csv"');
  res.send(csv);
});
