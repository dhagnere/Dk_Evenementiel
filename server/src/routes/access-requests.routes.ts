import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { insererUn, requete, requeteUne, transaction } from '../db.js';
import type { DemandeAcces } from '../modeles.js';
import { genererHash } from '../lib/password.js';
import { notifierNouvelleDemandeAcces } from '../lib/email.js';
import { requireAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';

export const accessRequestsRouter = Router();

/** Limite les dépôts de demandes : 5 par IP et par heure (formulaire public, sans authentification). */
const limiteurDemandeAcces = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Trop de demandes envoyées, réessayez plus tard' },
});

/** Dépose une demande d'accès. Public : aucune authentification requise. */
accessRequestsRouter.post('/', limiteurDemandeAcces, async (req, res) => {
  const schema = z.object({
    nom: z.string().min(1),
    email: z.string().email(),
    organisation: z.string().optional(),
    motif: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const email = parsed.data.email.toLowerCase();

  const compteExistant = await requeteUne('SELECT 1 FROM utilisateurs WHERE email = $1', [email]);
  if (compteExistant) {
    res.json({ ok: false, message: 'Un compte existe déjà avec cette adresse e-mail' });
    return;
  }

  const demandeExistante = await requeteUne("SELECT 1 FROM demandes_acces WHERE email = $1 AND statut = 'En attente'", [
    email,
  ]);
  if (demandeExistante) {
    res.json({ ok: false, message: 'Une demande est déjà en attente pour cette adresse e-mail' });
    return;
  }

  await insererUn('demandes_acces', {
    nom: parsed.data.nom,
    email,
    organisation: parsed.data.organisation ?? '',
    motif: parsed.data.motif ?? '',
  });

  console.log(`[demandes-acces] Nouvelle demande d'accès : ${email} (${parsed.data.nom})`);

  notifierNouvelleDemandeAcces({
    nom: parsed.data.nom,
    email,
    organisation: parsed.data.organisation,
    motif: parsed.data.motif,
  }).catch((err) => console.error("[demandes-acces] Échec de la notification par email :", err));
  res.json({ ok: true, message: 'Votre demande a été envoyée. Un administrateur vous contactera.' });
});

// Tout ce qui suit est réservé aux administrateurs.
accessRequestsRouter.use(requireAdmin);

/** Liste les demandes en attente. */
accessRequestsRouter.get('/', async (_req, res) => {
  const demandes = await requete("SELECT * FROM demandes_acces WHERE statut = 'En attente' ORDER BY created_at");
  res.json({ demandes });
});

/** Approuve une demande : crée le compte utilisateur avec le rôle choisi par l'administrateur. */
accessRequestsRouter.post('/:id/approuver', async (req, res) => {
  const schema = z.object({
    role: z.enum(['Administrateur', 'Consultant']),
    motDePasseTemporaire: z.string().min(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const demande = await requeteUne<DemandeAcces>('SELECT * FROM demandes_acces WHERE id = $1', [req.params.id]);
  if (!demande || demande.statut !== 'En attente') {
    res.status(404).json({ ok: false, message: 'Demande introuvable ou déjà traitée' });
    return;
  }

  const marquerApprouvee = (executant?: Parameters<typeof requete>[2]) =>
    requete("UPDATE demandes_acces SET statut = 'Approuvée' WHERE id = $1", [demande._id], executant);

  const compteExistant = await requeteUne('SELECT 1 FROM utilisateurs WHERE email = $1', [demande.email]);
  if (compteExistant) {
    await marquerApprouvee();
    res.json({ ok: false, message: 'Un compte existe déjà avec cette adresse e-mail' });
    return;
  }

  // Création du compte et clôture de la demande vont ensemble : jamais l'un sans l'autre.
  const { hash, sel } = await genererHash(parsed.data.motDePasseTemporaire);
  await transaction(async (client) => {
    await insererUn(
      'utilisateurs',
      { nom: demande.nom, email: demande.email, role: parsed.data.role, statut: 'Mot de passe à définir', hash, sel },
      client
    );
    await marquerApprouvee(client);
  });

  console.log(`[demandes-acces] Demande approuvée pour ${demande.email} (${parsed.data.role}) — mot de passe temporaire : ${parsed.data.motDePasseTemporaire}`);
  await consigner(identiteDeRequete(req), 'approbation_demande_acces', demande.email, { role: parsed.data.role });
  res.json({ ok: true, message: 'Compte créé avec succès', email: demande.email });
});

/** Rejette une demande d'accès. */
accessRequestsRouter.post('/:id/rejeter', async (req, res) => {
  const schema = z.object({ motifRejet: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Données invalides' });
    return;
  }

  const demande = await requeteUne<DemandeAcces>(
    "UPDATE demandes_acces SET statut = 'Rejetée', motif_rejet = $2 WHERE id = $1 RETURNING email",
    [req.params.id, parsed.data.motifRejet ?? '']
  );
  if (!demande) {
    res.status(404).json({ ok: false, message: 'Demande introuvable' });
    return;
  }

  await consigner(identiteDeRequete(req), 'rejet_demande_acces', demande.email);
  res.json({ ok: true, message: 'Demande rejetée' });
});
