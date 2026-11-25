import { executer, requete } from '../../db.js';

/**
 * Annuaire des prestataires : complété à partir des documents financiers (devis, bons de commande, factures,
 * contrats) relevés dans les dossiers, en plus des fiches venues de l'index de l'assistant de bureau.
 *
 * Fusion sans perte : une fiche existante (même nom, à la casse et aux accents près) reçoit les contacts,
 * événements, documents et dossiers nouveaux ; rien n'est retiré. Peut être relancé autant de fois que voulu.
 */

const cle = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € TTC`;
const INTERNE = /@(cud|ville-dunkerque|dunkerque-grandlittoral)\.fr/i;

interface Fiche {
  nom: string;
  domaine: string;
  contacts: string[];
  evenements: string[];
  documents: string[];
  dossiers: string[];
  [k: string]: unknown;
}

/** Contacts d'un dossier qui se rattachent au fournisseur (nom ou adresse qui le rappelle). */
function contactsDuFournisseur(contacts: string[], fournisseur: string, seul: boolean): string[] {
  const externes = contacts.filter((c) => !INTERNE.test(c));
  const mots = cle(fournisseur).split(' ').filter((m) => m.length >= 3);
  const proches = externes.filter((c) => mots.some((m) => cle(c).replace(/ /g, '').includes(m)));
  // Un seul fournisseur dans le dossier : ses contacts externes avec adresse lui reviennent.
  return proches.length ? proches : seul ? externes.filter((c) => c.includes('@')) : [];
}

export async function actualiserPrestataires(): Promise<{ crees: number; completes: number }> {
  const dossiers = await requete<{ code: string; donnees: Record<string, unknown> }>('SELECT code, donnees FROM assistant_dossiers');
  const derives = new Map<string, Fiche>();
  for (const d of dossiers) {
    const budget = (Array.isArray(d.donnees.budget) ? d.donnees.budget : []) as Record<string, unknown>[];
    const fournisseurs = [...new Set(budget.map((b) => String(b.fournisseur ?? '').trim()).filter(Boolean))];
    for (const b of budget) {
      const nom = String(b.fournisseur ?? '').trim();
      if (!nom || /non pr[ée]cis/i.test(nom)) continue;
      const k = cle(nom);
      const f = derives.get(k) ?? { nom, domaine: '', contacts: [], evenements: [], documents: [], dossiers: [] };
      if (!f.domaine && b.domaine) f.domaine = String(b.domaine);
      const montant = typeof b.montant_ttc === 'number' ? euros(b.montant_ttc) : 'montant non lu';
      f.documents.push([b.type || 'Document', b.reference, montant].filter(Boolean).join(' – ') + ` (${d.code})`);
      f.dossiers.push(d.code);
      if (d.donnees.evenement) f.evenements.push(String(d.donnees.evenement));
      f.contacts.push(...contactsDuFournisseur((d.donnees.contacts as string[]) ?? [], nom, fournisseurs.length === 1));
      derives.set(k, f);
    }
  }

  const existants = await requete<{ nom: string; domaine: string; donnees: Record<string, unknown> }>(
    'SELECT nom, domaine, donnees FROM assistant_prestataires'
  );
  const parCle = new Map(existants.map((e) => [cle(e.nom), e]));
  const union = (a: unknown, b: string[]) => [...new Set([...(Array.isArray(a) ? (a as string[]) : []), ...b].map((x) => x.trim()).filter(Boolean))];
  let crees = 0;
  let completes = 0;
  for (const [k, f] of derives) {
    const e = parCle.get(k);
    if (!e) {
      await executer('INSERT INTO assistant_prestataires (nom, domaine, donnees) VALUES ($1, $2, $3) ON CONFLICT (nom) DO NOTHING', [
        f.nom,
        f.domaine,
        JSON.stringify({ ...f, contacts: union([], f.contacts), evenements: union([], f.evenements), documents: union([], f.documents), dossiers: union([], f.dossiers), source: 'documents' }),
      ]);
      crees++;
      continue;
    }
    const donnees = {
      ...e.donnees,
      contacts: union(e.donnees.contacts, f.contacts),
      evenements: union(e.donnees.evenements, f.evenements),
      documents: union(e.donnees.documents, f.documents),
      dossiers: union(e.donnees.dossiers, f.dossiers),
    };
    if (JSON.stringify(donnees) !== JSON.stringify(e.donnees) || (!e.domaine && f.domaine)) {
      await executer('UPDATE assistant_prestataires SET donnees = $2, domaine = $3, updated_at = now() WHERE nom = $1', [
        e.nom,
        JSON.stringify(donnees),
        e.domaine || f.domaine,
      ]);
      completes++;
    }
  }
  return { crees, completes };
}
