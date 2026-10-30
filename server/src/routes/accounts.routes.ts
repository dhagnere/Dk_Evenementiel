import { Router } from 'express';
import { z } from 'zod';
import { insererUn, requeteUne, transaction } from '../db.js';
import type { Utilisateur } from '../modeles.js';
import { genererHash } from '../lib/password.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { chargerCompte, compterSuperAdminsActifs, ecrireDroits, listerComptes } from '../lib/comptes.js';
import { NIVEAUX, CODES_MODULES } from '../lib/droits.js';

export const accountsRouter = Router();

// Toutes les routes de gestion des comptes sont réservées aux super-administrateurs.
accountsRouter.use(requireSuperAdmin);

/** Profil d'accès saisi à la création d'un compte, à l'approbation d'une demande ou dans l'écran des droits. */
export const schemaProfil = z.object({
  superAdmin: z.boolean(),
  directionId: z.string().min(1).nullable(),
  droits: z.record(z.enum(CODES_MODULES as [string, ...string[]]), z.enum(NIVEAUX)),
});

/** La direction choisie existe-t-elle ? (null = aucune direction, toujours accepté) */
export async function directionValide(directionId: string | null): Promise<boolean> {
  if (directionId === null) return true;
  return (await requeteUne('SELECT 1 FROM directions WHERE id = $1', [directionId])) !== null;
}

accountsRouter.get('/', async (_req, res) => {
  res.json({ comptes: await listerComptes() });
});

accountsRouter.post('/', async (req, res) => {
  const schema = schemaProfil.extend({
    nom: z.string().min(1),
    email: z.string().email(),
    motDePasseTemporaire: z.string().min(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success || !(await directionValide(parsed.data.directionId))) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const existant = await requeteUne('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
  if (existant) {
    res.json({ ok: false, message: 'Un compte existe déjà avec cette adresse e-mail' });
    return;
  }

  const { superAdmin, directionId, droits } = parsed.data;
  const { hash, sel } = await genererHash(parsed.data.motDePasseTemporaire);
  await transaction(async (client) => {
    const compte = await insererUn<Utilisateur>(
      'utilisateurs',
      { nom: parsed.data.nom, email, superAdmin, directionId, statut: 'Mot de passe à définir', hash, sel },
      client
    );
    if (!superAdmin) await ecrireDroits(compte._id, droits, client);
  });

  console.log(`[accounts] Compte créé pour ${email} — mot de passe temporaire : ${parsed.data.motDePasseTemporaire}`);
  await consigner(identiteDeRequete(req), 'creation_compte', email, { superAdmin, directionId, droits: superAdmin ? {} : droits });
  res.json({ ok: true, message: 'Compte créé avec succès', email });
});

/** Modifie le profil d'accès d'un compte : super-administrateur, direction et droits par module. */
accountsRouter.put('/:id/droits', async (req, res) => {
  const parsed = schemaProfil.safeParse(req.body);
  if (!parsed.success || !(await directionValide(parsed.data.directionId))) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const avant = await chargerCompte(req.params.id);
  if (!avant) {
    res.status(404).json({ ok: false, message: 'Compte introuvable' });
    return;
  }

  const { superAdmin, directionId, droits } = parsed.data;
  if (avant.superAdmin && !superAdmin && (await compterSuperAdminsActifs(avant._id)) === 0) {
    res.json({ ok: false, message: 'Impossible : ce compte est le dernier super-administrateur actif' });
    return;
  }

  await transaction(async (client) => {
    await requeteUne('UPDATE utilisateurs SET super_admin = $2, direction_id = $3 WHERE id = $1', [avant._id, superAdmin, directionId], client);
    await ecrireDroits(avant._id, superAdmin ? {} : droits, client);
  });

  await consigner(identiteDeRequete(req), 'modification_droits', avant.email, {
    avant: { superAdmin: avant.superAdmin, directionId: avant.directionId, droits: avant.droits },
    apres: { superAdmin, directionId, droits: superAdmin ? {} : droits },
  });
  res.json({ ok: true, message: 'Droits mis à jour' });
});

accountsRouter.post('/:id/statut', async (req, res) => {
  const schema = z.object({ statut: z.enum(['Actif', 'Suspendu']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  if (parsed.data.statut === 'Suspendu') {
    if (req.session?.userId === req.params.id) {
      res.status(400).json({ ok: false, message: 'Vous ne pouvez pas suspendre votre propre compte' });
      return;
    }
    const cible = await chargerCompte(req.params.id);
    if (cible?.superAdmin && (await compterSuperAdminsActifs(cible._id)) === 0) {
      res.json({ ok: false, message: 'Impossible : ce compte est le dernier super-administrateur actif' });
      return;
    }
  }
  const updated = await requeteUne<Utilisateur>('UPDATE utilisateurs SET statut = $2 WHERE id = $1 RETURNING email', [
    req.params.id,
    parsed.data.statut,
  ]);
  if (!updated) {
    res.status(404).json({ ok: false, message: 'Compte introuvable' });
    return;
  }
  await consigner(
    identiteDeRequete(req),
    parsed.data.statut === 'Suspendu' ? 'suspension_compte' : 'activation_compte',
    updated.email
  );
  res.json({ ok: true, message: `Compte ${parsed.data.statut === 'Suspendu' ? 'suspendu' : 'activé'}` });
});

/** Supprime un compte. On ne peut supprimer ni son propre compte ni le dernier super-administrateur. */
accountsRouter.delete('/:id', async (req, res) => {
  if (req.session?.userId === req.params.id) {
    res.status(400).json({ ok: false, message: 'Vous ne pouvez pas supprimer votre propre compte' });
    return;
  }
  const cible = await chargerCompte(req.params.id);
  if (cible?.superAdmin && (await compterSuperAdminsActifs(cible._id)) === 0) {
    res.json({ ok: false, message: 'Impossible : ce compte est le dernier super-administrateur actif' });
    return;
  }
  const supprime = await requeteUne<Utilisateur>('DELETE FROM utilisateurs WHERE id = $1 RETURNING email', [req.params.id]);
  if (!supprime) {
    res.status(404).json({ ok: false, message: 'Compte introuvable' });
    return;
  }
  console.log(`[accounts] Compte supprimé : ${supprime.email}`);
  await consigner(identiteDeRequete(req), 'suppression_compte', supprime.email);
  res.json({ ok: true, message: 'Compte supprimé' });
});

accountsRouter.post('/:id/reinitialiser-mot-de-passe', async (req, res) => {
  const schema = z.object({ nouveauMotDePasseTemporaire: z.string().min(10) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }
  const { hash, sel } = await genererHash(parsed.data.nouveauMotDePasseTemporaire);
  const compte = await requeteUne<Utilisateur>(
    "UPDATE utilisateurs SET hash = $2, sel = $3, statut = 'Mot de passe à définir' WHERE id = $1 RETURNING email",
    [req.params.id, hash, sel]
  );
  if (!compte) {
    res.status(404).json({ ok: false, message: 'Compte introuvable' });
    return;
  }

  console.log(`[accounts] Mot de passe réinitialisé pour ${compte.email} — temporaire : ${parsed.data.nouveauMotDePasseTemporaire}`);
  await consigner(identiteDeRequete(req), 'reinitialisation_mot_de_passe', compte.email);
  res.json({ ok: true, message: 'Mot de passe réinitialisé' });
});
