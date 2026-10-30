import { config } from '../config.js';
import { requete } from '../db.js';
import type { Evenement } from '../modeles.js';
import { stringifyEventsCsv } from './csv.js';

const API_BASE = 'https://api.github.com';

interface ContenuFichierGithub {
  sha: string;
  contenu: string;
}

/** Récupère le SHA et le contenu actuels d'un fichier sur GitHub (nécessaire pour le mettre à jour). */
async function lireFichier(chemin: string): Promise<ContenuFichierGithub | null> {
  const url = `${API_BASE}/repos/${config.github.repo}/contents/${chemin}?ref=${config.github.branch}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`GitHub a répondu ${res.status} en lisant ${chemin}`);
  }
  const data = (await res.json()) as { sha: string; content: string };
  return { sha: data.sha, contenu: Buffer.from(data.content, 'base64').toString('utf-8') };
}

/** Crée ou met à jour un fichier sur GitHub. */
async function ecrireFichier(chemin: string, contenu: string, sha: string | null, message: string): Promise<void> {
  const url = `${API_BASE}/repos/${config.github.repo}/contents/${chemin}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${config.github.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(contenu, 'utf-8').toString('base64'),
      branch: config.github.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`GitHub a répondu ${res.status} en écrivant ${chemin} : ${detail.slice(0, 300)}`);
  }
}

/**
 * Exporte l'état actuel de tous les événements (avec leurs attributs à jour — validations, statut,
 * etc.) et le pousse vers data/evenements.csv sur GitHub, pour que ce fichier serve de seed à jour
 * en cas de nouveau déploiement. Best-effort : ne lance jamais d'exception vers l'appelant (un import
 * CSV réussi ne doit jamais échouer à cause d'une panne de synchronisation GitHub) — retourne un
 * simple indicateur de succès pour le journal d'audit.
 */
export async function synchroniserEvenementsVersGithub(): Promise<{ ok: boolean; message: string }> {
  if (!config.github.token) {
    return { ok: false, message: 'GITHUB_TOKEN non configuré — synchronisation ignorée' };
  }

  try {
    const events = await requete<Evenement>('SELECT * FROM evenements ORDER BY nom');
    const csv = stringifyEventsCsv(events);

    const chemin = config.github.cheminEvenements;
    const existant = await lireFichier(chemin);

    if (existant && existant.contenu === csv) {
      return { ok: true, message: 'Déjà à jour, aucun changement à pousser' };
    }

    await ecrireFichier(
      chemin,
      csv,
      existant?.sha ?? null,
      `Synchronise ${chemin} depuis l'application (${events.length} événement(s))`
    );

    console.log(`[github] ${chemin} synchronisé (${events.length} événements)`);
    return { ok: true, message: `${events.length} événement(s) synchronisé(s)` };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'erreur inconnue';
    console.error('[github] Échec de la synchronisation :', err);
    return { ok: false, message };
  }
}
