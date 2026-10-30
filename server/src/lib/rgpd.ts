import { z } from 'zod';
import { executer, pool, requete, requeteUne, transaction } from '../db.js';
import { consigner, type IdentiteJournal } from './journal.js';

/**
 * Durées de conservation des données personnelles, en jours (0 = règle désactivée). Stockées dans
 * la table parametres, modifiables par un super-administrateur.
 */
export const schemaConservation = z.object({
  journalJours: z.number().int().min(0).max(3650),
  demandesAccesTraiteesJours: z.number().int().min(0).max(3650),
  comptesInactifsSuspensionJours: z.number().int().min(0).max(3650),
  comptesSuspendusSuppressionJours: z.number().int().min(0).max(3650),
});
export type Conservation = z.infer<typeof schemaConservation>;

const CONSERVATION_PAR_DEFAUT: Conservation = {
  journalJours: 365,
  demandesAccesTraiteesJours: 90,
  comptesInactifsSuspensionJours: 365,
  comptesSuspendusSuppressionJours: 730,
};

export async function lireConservation(): Promise<Conservation> {
  const ligne = await requeteUne<{ valeur: unknown }>("SELECT valeur FROM parametres WHERE cle = 'conservation'");
  const lu = schemaConservation.safeParse({ ...CONSERVATION_PAR_DEFAUT, ...(ligne?.valeur as object) });
  return lu.success ? lu.data : CONSERVATION_PAR_DEFAUT;
}

export async function ecrireConservation(conservation: Conservation): Promise<void> {
  await executer(
    `INSERT INTO parametres (cle, valeur) VALUES ('conservation', $1)
     ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
    [JSON.stringify(conservation)]
  );
}

export interface BilanPurge {
  journal: number;
  demandesAcces: number;
  comptesSuspendus: number;
  comptesSupprimes: number;
}

/**
 * Applique les durées de conservation. Les super-administrateurs ne sont jamais suspendus ni
 * supprimés automatiquement, pour ne pas priver l'application de tout administrateur.
 */
export async function purger(identite: IdentiteJournal): Promise<BilanPurge> {
  const c = await lireConservation();
  const bilan: BilanPurge = { journal: 0, demandesAcces: 0, comptesSuspendus: 0, comptesSupprimes: 0 };
  const avant = (jours: number) => `now() - make_interval(days => ${Number(jours)})`;

  await transaction(async (client) => {
    if (c.journalJours > 0) {
      bilan.journal = await executer(`DELETE FROM journal_actions WHERE created_at < ${avant(c.journalJours)}`, [], client);
    }
    if (c.demandesAccesTraiteesJours > 0) {
      bilan.demandesAcces = await executer(
        `DELETE FROM demandes_acces WHERE statut <> 'En attente' AND updated_at < ${avant(c.demandesAccesTraiteesJours)}`,
        [],
        client
      );
    }
    if (c.comptesInactifsSuspensionJours > 0) {
      bilan.comptesSuspendus = await executer(
        `UPDATE utilisateurs SET statut = 'Suspendu'
          WHERE NOT super_admin AND statut <> 'Suspendu'
            AND COALESCE(derniere_connexion, created_at) < ${avant(c.comptesInactifsSuspensionJours)}`,
        [],
        client
      );
    }
    if (c.comptesSuspendusSuppressionJours > 0) {
      bilan.comptesSupprimes = await executer(
        `DELETE FROM utilisateurs
          WHERE NOT super_admin AND statut = 'Suspendu'
            AND COALESCE(derniere_connexion, created_at) < ${avant(c.comptesSuspendusSuppressionJours)}`,
        [],
        client
      );
    }
    await executer(
      `INSERT INTO parametres (cle, valeur) VALUES ('derniere_purge', $1)
       ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur`,
      [JSON.stringify({ date: new Date().toISOString(), bilan })],
      client
    );
  });

  await consigner(identite, 'purge_rgpd', '', bilan);
  return bilan;
}

export async function dernierePurge(): Promise<{ date: string; bilan: BilanPurge } | null> {
  const ligne = await requeteUne<{ valeur: { date: string; bilan: BilanPurge } }>(
    "SELECT valeur FROM parametres WHERE cle = 'derniere_purge'"
  );
  return ligne?.valeur ?? null;
}

const SYSTEME: IdentiteJournal = { userId: null, nom: 'Purge automatique', email: '' };
const UNE_HEURE_MS = 60 * 60 * 1000;

/** Lance la purge une fois par jour (vérification toutes les heures, comme la sauvegarde quotidienne). */
export function demarrerPurgeQuotidienne(): void {
  const verifier = async () => {
    try {
      const derniere = await dernierePurge();
      const debutAujourdhui = new Date();
      debutAujourdhui.setHours(0, 0, 0, 0);
      if (!derniere || new Date(derniere.date) < debutAujourdhui) {
        const bilan = await purger(SYSTEME);
        console.log('[rgpd] Purge quotidienne effectuée :', bilan);
      }
    } catch (err) {
      console.error('[rgpd] Échec de la purge quotidienne :', err);
    }
  };
  verifier();
  setInterval(verifier, UNE_HEURE_MS);
}

/**
 * Toutes les données détenues sur une personne, identifiée par son adresse électronique (droit
 * d'accès, article 15 du RGPD). Les événements dont elle est indiquée comme pilote sont retrouvés
 * par son nom.
 */
export async function exporterPersonne(email: string) {
  const adresse = email.trim().toLowerCase();
  const compte = await requeteUne(
    `SELECT u.id, u.nom, u.email, u.statut, u.super_admin, u.derniere_connexion, u.created_at, u.updated_at,
            d.nom AS direction
       FROM utilisateurs u LEFT JOIN directions d ON d.id = u.direction_id
      WHERE u.email = $1`,
    [adresse]
  );
  const [droits, demandesAcces, journal] = await Promise.all([
    compte
      ? requete('SELECT module, niveau, created_at, updated_at FROM droits_modules WHERE utilisateur_id = $1', [compte._id])
      : Promise.resolve([]),
    requete('SELECT nom, email, organisation, motif, statut, motif_rejet, created_at, updated_at FROM demandes_acces WHERE email = $1', [adresse]),
    requete(
      `SELECT action, cible, details, created_at FROM journal_actions
        WHERE lower(utilisateur_email) = $1 OR lower(cible) = $1 ORDER BY created_at`,
      [adresse]
    ),
  ]);
  const noms = [...new Set([compte?.nom, ...demandesAcces.map((d) => d.nom)].filter((n): n is string => typeof n === 'string' && n.trim() !== ''))];
  const evenementsPilotes =
    noms.length > 0
      ? await requete(
          `SELECT id, nom, date_de_debut, date_de_fin, lieu, pilote, direction_pilote FROM evenements
            WHERE lower(btrim(pilote)) = ANY($1) ORDER BY date_de_debut`,
          [noms.map((n) => n.trim().toLowerCase())]
        )
      : [];
  return {
    personne: adresse,
    exporteLe: new Date().toISOString(),
    compte,
    droits,
    demandesAcces,
    journal,
    evenementsPilotes,
  };
}

export interface BilanEffacement {
  compte: number;
  demandesAcces: number;
  journalAnonymise: number;
  sauvegardesNettoyees: number;
  evenementsPilotes: number;
}

/**
 * Efface les données d'une personne (droit à l'effacement, article 17) : compte et droits supprimés,
 * demandes d'accès supprimées, journal anonymisé, compte retiré des sauvegardes. Les événements
 * dont elle est pilote ne sont pas modifiés (donnée de service) : ils sont comptés pour que le
 * super-administrateur puisse les revoir.
 */
export async function effacerPersonne(email: string, identite: IdentiteJournal): Promise<BilanEffacement> {
  const adresse = email.trim().toLowerCase();
  const { evenementsPilotes } = await exporterPersonne(adresse);
  const bilan = await transaction(async (client) => {
    const compte = await executer('DELETE FROM utilisateurs WHERE email = $1', [adresse], client);
    const demandesAcces = await executer('DELETE FROM demandes_acces WHERE email = $1', [adresse], client);
    const parAuteur = await executer(
      `UPDATE journal_actions SET utilisateur_id = NULL, utilisateur_nom = 'Personne effacée', utilisateur_email = ''
        WHERE lower(utilisateur_email) = $1`,
      [adresse],
      client
    );
    const parCible = await executer(
      "UPDATE journal_actions SET cible = 'Personne effacée' WHERE lower(cible) = $1",
      [adresse],
      client
    );
    const sauvegardesNettoyees = await executer(
      `UPDATE sauvegardes s
          SET utilisateurs = filtre.reste, nombre_utilisateurs = jsonb_array_length(filtre.reste)
         FROM (SELECT id, COALESCE((SELECT jsonb_agg(u) FROM jsonb_array_elements(utilisateurs) u
                                     WHERE lower(u->>'email') <> $1), '[]'::jsonb) AS reste
                 FROM sauvegardes) filtre
        WHERE s.id = filtre.id AND jsonb_array_length(s.utilisateurs) <> jsonb_array_length(filtre.reste)`,
      [adresse],
      client
    );
    return {
      compte,
      demandesAcces,
      journalAnonymise: parAuteur + parCible,
      sauvegardesNettoyees,
      evenementsPilotes: evenementsPilotes.length,
    };
  });
  // L'adresse effacée n'est pas reprise dans le journal : seule la trace de l'opération est gardée.
  await consigner(identite, 'effacement_rgpd', 'Personne effacée', bilan);
  return bilan;
}

/** Vérifie qu'on n'efface pas le dernier super-administrateur actif. */
export async function estDernierSuperAdmin(email: string): Promise<boolean> {
  const ligne = await requeteUne<{ dernier: boolean }>(
    `SELECT bool_and(email = $1) IS TRUE AS dernier FROM utilisateurs WHERE super_admin AND statut <> 'Suspendu'`,
    [email.trim().toLowerCase()],
    pool
  );
  return ligne?.dernier ?? false;
}
