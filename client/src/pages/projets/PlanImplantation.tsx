import { useEffect, useRef, useState } from 'react';
import { Alert, Empty, message } from 'antd';
import { api } from '../../api';
import type { ArticleMateriel, FicheProjetComplete, ReferentielsProjets } from '../../types';
import { aujourdhui, ecart, formatLong, jalonDe } from '../../lib/projets';
import { BalisePlan } from '../../projets/balisePlan';
import '../../projets/balisePlan.css';

interface ReponsePlans {
  courant: Record<string, unknown> | null;
  versions: (Record<string, unknown> & { _id: string })[];
}

/**
 * Plan d'implantation 2D et maquette 3D. L'éditeur, repris de l'artefact Balise, attend une petite
 * base de documents (lecture avec abonnement, écriture) : cet adaptateur la fournit sur l'API.
 */
export function PlanImplantation({
  fiche,
  referentiels,
  peutModifier,
  onMaterielModifie,
}: {
  fiche: FicheProjetComplete;
  referentiels: ReferentielsProjets;
  peutModifier: boolean;
  onMaterielModifie: () => void;
}) {
  const racine = useRef<HTMLDivElement>(null);
  const ficheCourante = useRef(fiche);
  ficheCourante.current = fiche;
  const [planSeul, setPlanSeul] = useState<string | null | undefined>(undefined);
  // Catalogue du matériel rattaché au plan (code a01, a05…), pour comparer plan, réservation et stock.
  const catalogue = useRef<ArticleMateriel[]>([]);
  const id = fiche.projet._id;

  useEffect(() => {
    if (!peutModifier) {
      api.get<ReponsePlans>(`/projets/${id}/plans`).then((d) => setPlanSeul(d.courant ? BalisePlan.staticSVG(d.courant) : null));
      return;
    }
    if (!racine.current) return;
    api.get<{ articles: ArticleMateriel[] }>('/projets/materiel').then((d) => {
      catalogue.current = d.articles;
    });

    type Instantane = { docs: { id: string; data: () => unknown }[] };
    let abonnes: ((s: Instantane) => void)[] = [];
    const diffuser = async () => {
      const d = await api.get<ReponsePlans>(`/projets/${id}/plans`);
      const instantane: Instantane = {
        docs: [
          ...(d.courant ? [{ id: 'courant', data: () => d.courant }] : []),
          ...d.versions.map((v) => ({ id: v._id, data: () => v })),
        ],
      };
      abonnes.forEach((f) => f(instantane));
    };
    const ecrire = async (appel: Promise<{ ok: boolean; message?: string }>) => {
      const res = await appel;
      if (!res.ok) throw Object.assign(new Error(res.message ?? 'Enregistrement refusé'), { code: 'refus' });
    };
    const db = {
      collection: () => ({
        onSnapshot: (cb: (s: Instantane) => void, erreur: () => void) => {
          abonnes.push(cb);
          diffuser().catch(erreur);
          return () => {
            abonnes = abonnes.filter((f) => f !== cb);
          };
        },
        doc: () => ({
          set: async (donnees: unknown) => {
            await ecrire(api.post(`/projets/${id}/plans/versions`, donnees));
            await diffuser();
          },
        }),
      }),
      doc: () => ({ set: (donnees: unknown) => ecrire(api.put(`/projets/${id}/plans/courant`, donnees)) }),
    };
    const assets = {
      upload: async (blob: Blob) => {
        const form = new FormData();
        form.append('fichier', blob, blob instanceof File ? blob.name : 'fond-de-plan.png');
        const res = await api.postForm<{ ok: boolean; message?: string; id?: string; url?: string }>(`/projets/${id}/fichiers`, form);
        if (!res.ok) throw new Error(res.message ?? 'Dépôt du fichier impossible');
        return { id: res.id, url: res.url };
      },
    };
    const downloads = {
      save: async ({ filename, data }: { filename: string; data: Blob }) => {
        const url = URL.createObjectURL(data);
        const lien = document.createElement('a');
        lien.href = url;
        lien.download = filename;
        lien.click();
        URL.revokeObjectURL(url);
      },
    };

    // Bibliothèques lourdes chargées à la demande (maquette 3D, import d'un PDF), exposées comme
    // l'éditeur d'origine les attend.
    const fenetre = window as unknown as Record<string, unknown>;
    const chargerTroisD = async () => {
      if (fenetre.THREE) return;
      const [three, { OrbitControls }] = await Promise.all([import('three'), import('three/examples/jsm/controls/OrbitControls.js')]);
      fenetre.THREE = { ...three, OrbitControls };
    };
    const chargerPdf = async () => {
      if (fenetre.pdfjsLib) return;
      const pdfjs = await import('pdfjs-dist');
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).href;
      fenetre.pdfjsLib = pdfjs;
    };

    BalisePlan.mount(racine.current, {
      chargerTroisD,
      chargerPdf,
      db,
      assets,
      downloads,
      evId: id,
      pilot: true,
      toast: (texte: string) => message.info(texte),
      fmtD: formatLong,
      today: aujourdhui(),
      getEvent: () => {
        const f = ficheCourante.current;
        return {
          titre: f.projet.titre,
          date: f.projet.dateJour,
          lieu: f.projet.lieu,
          jauge: f.projet.jauge,
          materiel: f.materiel.filter((m) => m.code).map((m) => ({ a: m.code, q: m.quantite })),
        };
      },
      articles: () => catalogue.current.filter((a) => a.code).map((a) => ({ id: a.code, nom: a.nom, total: a.total })),
      currentJalon: () => {
        const o = Math.max(-180, Math.min(7, ecart(aujourdhui(), ficheCourante.current.projet.dateJour)));
        return jalonDe(referentiels.jalons, o).c;
      },
      applyQuantities: async (quantites: Record<string, number>) => {
        const res = await api.post<{ ok: boolean; message?: string }>(`/projets/${id}/materiel/depuis-plan`, { quantites });
        if (res.ok) onMaterielModifie();
        else message.error(res.message ?? 'Mise à jour refusée');
      },
    });
    return () => BalisePlan.unmount();
    // L'éditeur est monté une fois par projet ; les données à jour passent par ficheCourante.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, peutModifier]);

  if (!peutModifier) {
    if (planSeul === undefined) return null;
    return planSeul ? (
      <div className="balise-plan" style={{ maxWidth: 960 }} dangerouslySetInnerHTML={{ __html: planSeul }} />
    ) : (
      <Empty description="Le plan d'implantation n'est pas encore dessiné." />
    );
  }
  return (
    <>
      {!referentiels.stockageActif && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="Le stockage des fichiers n'est pas configuré : l'import d'un fond de plan (PDF, photo aérienne) sera possible une fois le stockage S3 en place."
        />
      )}
      <div className="balise-plan" ref={racine} />
    </>
  );
}
