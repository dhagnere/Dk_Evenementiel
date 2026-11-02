import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { executer, insererUn, requete, requeteUne, transaction } from '../db.js';
import { peut, requireModule, requireSuperAdmin } from '../middleware/auth.js';
import { analyserCatalogue, appliquerCatalogue, decoderFichier, exporterCatalogue, lireCsvCatalogue, modeleCatalogue } from '../lib/importCatalogue.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { queryString } from '../lib/queryString.js';
import { cleDeLigne, type CleSerie } from '../lib/liaisons.js';
import type { Evenement } from '../modeles.js';
import {
  ErreurMetier,
  STATUTS_EN_ATTENTE,
  arrondi,
  circuitDemande,
  creerMouvement,
  ecrireParametresStock,
  joursAvant,
  lireParametresStock,
  notifier,
  notifierDemandeAValider,
  notifierDemandeur,
  notifierRelanceDepot,
  nouveauPmp,
  numeroDemande,
  prochaineReference,
  schemaParametresStock,
  varierStockPhysique,
  verrouillerArticle,
  type Article,
  type Demande,
  type EtapeHistorique,
} from '../lib/stock.js';

export const stockRouter = Router();

const lecture = requireModule('stock', 'lecture');
const contribution = requireModule('stock', 'contribution');
const validation = requireModule('stock', 'validation');
const administration = requireModule('stock', 'administration');

/**
 * Exécute un traitement asynchrone : une ErreurMetier (règle de gestion non respectée) devient une
 * réponse { ok: false, message } lisible par l'utilisateur, toute autre erreur une erreur 500.
 */
function traiter(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch((err) => {
      if (err instanceof ErreurMetier) res.json({ ok: false, message: err.message });
      else next(err);
    });
  };
}

function invalide(res: Response, message = 'Données invalides'): void {
  res.status(400).json({ ok: false, message });
}

/** Les cadeaux protocolaires ne sont visibles qu'à partir du niveau validation (service Événementiel, Protocole). */
const voitProtocole = (req: Request) => peut(req.session, 'stock', 'validation');
const auteur = (req: Request) => ({ auteurId: req.session!.userId, auteurNom: req.session!.nom });
const etape = (req: Request, action: string, motif?: string): EtapeHistorique => ({
  date: new Date().toISOString(),
  action,
  par: req.session!.nom,
  ...(motif ? { motif } : {}),
});

// --- Paramètres ----------------------------------------------------------------------------------

stockRouter.get(
  '/parametres',
  lecture,
  traiter(async (_req, res) => {
    res.json({ parametres: await lireParametresStock() });
  })
);

stockRouter.put(
  '/parametres',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaParametresStock.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    if (!parsed.data.emplacements.includes(parsed.data.emplacementProtocole)) {
      return invalide(res, "L'emplacement des cadeaux protocolaires doit figurer dans la liste des emplacements");
    }
    const avant = await lireParametresStock();
    await ecrireParametresStock(parsed.data);
    await consigner(identiteDeRequete(req), 'stock_parametres', '', { avant, apres: parsed.data });
    res.json({ ok: true, message: 'Paramètres enregistrés' });
  })
);

// --- Catalogue -----------------------------------------------------------------------------------

stockRouter.get(
  '/articles',
  lecture,
  traiter(async (req, res) => {
    const articles = await requete<Article>(
      `SELECT * FROM stock_articles WHERE ($1 OR categorie = 'Goodies') ORDER BY categorie, reference`,
      [voitProtocole(req)]
    );
    res.json({ articles });
  })
);

const schemaFicheArticle = z.object({
  libelle: z.string().trim().min(1).max(200),
  famille: z.string().trim().min(1).max(100),
  emplacement: z.string().trim().min(1).max(100),
  fournisseur: z.string().trim().max(200).default(''),
  delaiJours: z.number().int().min(0).max(365).default(0),
  seuil: z.number().int().min(0).max(1_000_000),
});

/**
 * Crée un article, avec son stock initial. Le prix d'achat TTC fixe le PMP de départ ; sans prix, l'article reste
 * « à valoriser » jusqu'à ce qu'on le renseigne dans sa fiche ou à la première réception.
 */
stockRouter.post(
  '/articles',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaFicheArticle
      .extend({
        categorie: z.enum(['Goodies', 'Protocole']),
        stockInitial: z.number().int().min(0).max(1_000_000),
        prix: z.number().min(0).max(1_000_000).nullable(),
      })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const d = parsed.data;
    const parametres = await lireParametresStock();
    if (d.categorie === 'Protocole' && d.emplacement !== parametres.emplacementProtocole) {
      throw new ErreurMetier(`Un cadeau protocolaire se range en « ${parametres.emplacementProtocole} »`);
    }

    const article = await transaction(async (client) => {
      // Verrou de session sur la numérotation, pour que deux créations simultanées n'obtiennent pas la même référence.
      await executer('SELECT pg_advisory_xact_lock(714231)', [], client);
      const reference = await prochaineReference(d.categorie, client);
      const cree = await insererUn<Article>(
        'stock_articles',
        {
          reference,
          libelle: d.libelle,
          famille: d.famille,
          categorie: d.categorie,
          emplacement: d.emplacement,
          fournisseur: d.fournisseur,
          delaiJours: d.delaiJours,
          seuil: d.seuil,
          stockPhysique: d.stockInitial,
          pmp: d.prix ?? 0,
          prixAchat: d.prix,
          aValoriser: d.prix === null,
        },
        client
      );
      await creerMouvement(
        {
          type: 'Création',
          articleId: cree._id,
          quantite: d.stockInitial,
          valeur: d.stockInitial * (d.prix ?? 0),
          detail: `Stock initial${d.fournisseur ? ` — ${d.fournisseur}` : ''}`,
          statut: 'Appliqué',
          ...auteur(req),
        },
        client
      );
      return cree;
    });
    await consigner(identiteDeRequete(req), 'stock_creation_article', `${article.reference} · ${article.libelle}`);
    res.json({ ok: true, message: `Article ${article.reference} créé`, article });
  })
);

/**
 * Modifie la fiche d'un article. Les quantités ne bougent que par mouvement, et le PMP que par réception : le prix
 * d'achat saisi ici ne valorise le stock que pour un article encore « à valoriser ».
 */
stockRouter.put(
  '/articles/:id',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaFicheArticle
      .extend({ actif: z.boolean(), prixAchat: z.number().min(0).max(1_000_000).nullable().optional() })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const article = await requeteUne<Article>('SELECT * FROM stock_articles WHERE id = $1', [req.params.id]);
    if (!article) return void res.status(404).json({ ok: false, message: 'Article introuvable' });
    const parametres = await lireParametresStock();
    if (article.categorie === 'Protocole' && parsed.data.emplacement !== parametres.emplacementProtocole) {
      throw new ErreurMetier(`Un cadeau protocolaire se range en « ${parametres.emplacementProtocole} »`);
    }
    const d = parsed.data;
    const prixAchat = d.prixAchat === undefined ? article.prixAchat : d.prixAchat;
    // Un article sans valorisation la reçoit de son prix d'achat ; ailleurs, le PMP reste celui des réceptions.
    const valorise = article.aValoriser && prixAchat !== null && prixAchat > 0;
    await executer(
      `UPDATE stock_articles SET libelle = $2, famille = $3, emplacement = $4, fournisseur = $5, delai_jours = $6,
              seuil = $7, actif = $8, prix_achat = $9,
              pmp = CASE WHEN $10 THEN $9 ELSE pmp END, a_valoriser = a_valoriser AND NOT $10
        WHERE id = $1`,
      [article._id, d.libelle, d.famille, d.emplacement, d.fournisseur, d.delaiJours, d.seuil, d.actif, prixAchat, valorise]
    );
    await consigner(identiteDeRequete(req), 'stock_modification_article', `${article.reference} · ${d.libelle}`, {
      avant: { libelle: article.libelle, seuil: article.seuil, emplacement: article.emplacement, actif: article.actif, prixAchat: article.prixAchat, pmp: article.pmp },
      apres: { ...d, prixAchat, ...(valorise ? { pmp: prixAchat } : {}) },
    });
    res.json({
      ok: true,
      message: valorise ? `Article mis à jour et valorisé : PMP fixé à ${prixAchat!.toFixed(2).replace('.', ',')} € TTC` : 'Article mis à jour',
    });
  })
);

// --- Tableau de bord -----------------------------------------------------------------------------

stockRouter.get(
  '/tableau-de-bord',
  lecture,
  traiter(async (req, res) => {
    const protocole = voitProtocole(req);
    const service = peut(req.session, 'stock', 'validation');
    const parametres = await lireParametresStock();

    const sousLeSeuil = await requete(
      `SELECT id, reference, libelle, stock_physique - stock_reserve AS disponible, seuil FROM stock_articles
        WHERE actif AND ($1 OR categorie = 'Goodies') AND stock_physique - stock_reserve <= seuil
        ORDER BY reference`,
      [protocole]
    );
    // Un demandeur ne voit que les demandes de sa direction.
    const filtreDirection = service ? '' : 'AND direction_id IS NOT DISTINCT FROM $2';
    const paramsDemandes: unknown[] = [STATUTS_EN_ATTENTE];
    if (!service) paramsDemandes.push(req.session!.directionId);
    const demandesEnAttente = await requete(
      `SELECT id, numero, statut, direction_nom FROM stock_demandes WHERE statut = ANY($1) ${filtreDirection} ORDER BY created_at`,
      paramsDemandes
    );

    const reponse: Record<string, unknown> = { sousLeSeuil, demandesEnAttente };
    if (service) {
      const [valeur] = await requete<{ valeur: number }>(
        'SELECT COALESCE(sum(stock_physique * pmp), 0) AS valeur FROM stock_articles WHERE NOT a_valoriser'
      );
      reponse.valeurStock = arrondi(valeur.valeur);
      reponse.mouvementsEnAttente = await requete(
        `SELECT m.id, m.numero, m.type, m.detail, a.reference FROM stock_mouvements m
           JOIN stock_articles a ON a.id = m.article_id
          WHERE m.statut IN ('À valider', 'À traiter') ORDER BY m.created_at`
      );
      reponse.depotsARelancer = await requete(
        `SELECT p.id, d.nom AS direction, COALESCE(p.derniere_declaration, p.created_at) AS depuis
           FROM stock_depots p JOIN directions d ON d.id = p.direction_id
          WHERE p.actif AND COALESCE(p.derniere_declaration, p.created_at) < now() - make_interval(days => $1)
            AND (p.derniere_relance IS NULL OR p.derniere_relance < COALESCE(p.derniere_declaration, p.created_at))
          ORDER BY depuis`,
        [parametres.relanceDeportJours]
      );
      reponse.consommationMois = await requete(
        `SELECT dm.direction_nom AS direction, sum(m.valeur) AS valeur
           FROM stock_mouvements m JOIN stock_demandes dm ON dm.id = m.demande_id
          WHERE m.type = 'Sortie' AND m.created_at >= date_trunc('month', now())
          GROUP BY dm.direction_nom ORDER BY valeur DESC`
      );
    }
    res.json(reponse);
  })
);

// --- Demandes ------------------------------------------------------------------------------------

/** Demandes visibles : toutes pour le service, celles de sa direction (ou les siennes) pour un demandeur. */
stockRouter.get(
  '/demandes',
  contribution,
  traiter(async (req, res) => {
    const service = peut(req.session, 'stock', 'validation');
    const enAttente = queryString(req.query.statut) === 'en-attente';
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (!service) {
      params.push(req.session!.directionId, req.session!.userId);
      conditions.push(`(d.direction_id = $1 OR d.demandeur_id = $2)`);
    }
    if (enAttente) {
      params.push(STATUTS_EN_ATTENTE);
      conditions.push(`d.statut = ANY($${params.length})`);
    }
    const demandes = await requete(
      `SELECT d.*, a.reference, a.libelle, a.categorie, p.titre AS projet_titre FROM stock_demandes d
         JOIN stock_articles a ON a.id = d.article_id
         LEFT JOIN projets p ON p.id = d.projet_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY d.created_at DESC LIMIT 500`,
      params
    );
    res.json({ demandes });
  })
);

/**
 * Dépose une demande et réserve aussitôt la quantité. Un demandeur demande pour sa direction ; le
 * service (validation et au-delà) peut demander pour n'importe quelle direction, et seul il peut
 * demander un cadeau protocolaire.
 */
stockRouter.post(
  '/demandes',
  contribution,
  traiter(async (req, res) => {
    const parsed = z
      .object({
        directionId: z.string().min(1).nullable(),
        evenement: z.string().trim().min(1).max(300),
        articleId: z.string().min(1),
        quantite: z.number().int().min(1).max(1_000_000),
        dateBesoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        motifTardif: z.string().trim().max(1000).default(''),
        beneficiaire: z.string().trim().max(300).default(''),
        occasion: z.string().trim().max(300).default(''),
        elu: z.string().trim().max(300).default(''),
        // Rattachement facultatif à un projet ou à un événement du calendrier.
        projetId: z.string().min(1).nullable().default(null),
        evenementId: z.string().min(1).nullable().default(null),
      })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const d = parsed.data;
    const service = peut(req.session, 'stock', 'validation');
    const parametres = await lireParametresStock();

    const directionId = service ? d.directionId : req.session!.directionId;
    if (!directionId) {
      throw new ErreurMetier(
        service ? 'Choisissez la direction demandeuse' : "Votre compte n'est rattaché à aucune direction : contactez un super-administrateur"
      );
    }
    const direction = await requeteUne<{ nom: string }>('SELECT nom FROM directions WHERE id = $1', [directionId]);
    if (!direction) return invalide(res, 'Direction inconnue');

    // Lien vers le projet (et l'événement du calendrier auquel il est relié), ou directement vers un événement.
    let lien: CleSerie = { evenementId: null, evenementNom: null, evenementDebut: null, evenementFin: null };
    if (d.projetId) {
      const projet = await requeteUne<CleSerie>('SELECT evenement_id, evenement_nom, evenement_debut, evenement_fin FROM projets WHERE id = $1', [d.projetId]);
      if (!projet) return invalide(res, 'Projet inconnu');
      lien = projet;
    } else if (d.evenementId) {
      const ligne = await requeteUne<Evenement>('SELECT * FROM evenements WHERE id = $1', [d.evenementId]);
      if (!ligne) return invalide(res, 'Événement inconnu');
      lien = cleDeLigne(ligne);
    }

    const jours = joursAvant(d.dateBesoin);
    if (jours < 0) throw new ErreurMetier('La date de besoin est passée');
    if (jours < parametres.delaiDemandeTardiveJours && !d.motifTardif) {
      throw new ErreurMetier(`Demande tardive (moins de ${parametres.delaiDemandeTardiveJours} jours) : indiquez le motif`);
    }

    const { demande, article } = await transaction(async (client) => {
      const article = await verrouillerArticle(d.articleId, client);
      if (!article || !article.actif) throw new ErreurMetier('Article introuvable ou retiré du catalogue');
      // Sans PMP, la demande serait estimée à 0 € et échapperait au circuit de validation.
      if (article.aValoriser) {
        throw new ErreurMetier(
          `${article.reference} n'est pas encore valorisé : il ne peut pas être demandé tant que son prix d'achat n'est pas renseigné (Stock → Catalogue)`
        );
      }
      if (article.categorie === 'Protocole') {
        if (!service) throw new ErreurMetier('Les cadeaux protocolaires sont demandés par le service Événementiel ou le Protocole');
        if (!d.beneficiaire || !d.occasion || !d.elu) {
          throw new ErreurMetier("Cadeau protocolaire : bénéficiaire, occasion et élu remettant sont obligatoires");
        }
      }
      const disponible = article.stockPhysique - article.stockReserve;
      if (d.quantite > disponible) throw new ErreurMetier(`Stock insuffisant : ${disponible} disponible(s)`);

      const valeur = arrondi(d.quantite * article.pmp);
      const { circuit, statut } = circuitDemande(article, valeur, parametres);
      await executer('UPDATE stock_articles SET stock_reserve = stock_reserve + $2 WHERE id = $1', [article._id, d.quantite], client);
      const historique: EtapeHistorique[] = [etape(req, 'Dépôt de la demande', d.motifTardif ? `Demande tardive : ${d.motifTardif}` : undefined)];
      if (statut === 'Validée auto') historique.push({ ...etape(req, 'Validation automatique'), par: 'Application' });
      const demande = await insererUn<Demande>(
        'stock_demandes',
        {
          numero: await numeroDemande(client),
          directionId,
          directionNom: direction.nom,
          evenement: d.evenement,
          articleId: article._id,
          quantite: d.quantite,
          dateBesoin: d.dateBesoin,
          motifTardif: d.motifTardif,
          beneficiaire: article.categorie === 'Protocole' ? d.beneficiaire : '',
          occasion: article.categorie === 'Protocole' ? d.occasion : '',
          elu: article.categorie === 'Protocole' ? d.elu : '',
          valeur,
          circuit,
          statut,
          demandeurId: req.session!.userId,
          demandeurNom: req.session!.nom,
          historique,
          projetId: d.projetId,
          ...lien,
        },
        client
      );
      return { demande, article };
    });

    await consigner(identiteDeRequete(req), 'stock_demande', demande.numero, { statut: demande.statut, quantite: demande.quantite });
    if (STATUTS_EN_ATTENTE.includes(demande.statut)) notifier(notifierDemandeAValider(demande, article));
    res.json({
      ok: true,
      demande,
      message:
        demande.statut === 'Validée auto'
          ? `Demande ${demande.numero} validée automatiquement et réservée.`
          : `Demande ${demande.numero} enregistrée et réservée. Les valideurs sont prévenus.`,
    });
  })
);

/**
 * Décision sur une demande en attente. Circuit protocole : l'avis du Protocole la transmet au
 * Cabinet, dont la validation l'inscrit au registre. Un refus libère la réservation.
 */
stockRouter.post(
  '/demandes/:id/decision',
  validation,
  traiter(async (req, res) => {
    const parsed = z
      .object({ decision: z.enum(['valider', 'refuser']), motif: z.string().trim().max(1000).default('') })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { decision, motif } = parsed.data;
    if (decision === 'refuser' && !motif) throw new ErreurMetier('Indiquez le motif du refus');

    const { demande, message } = await transaction(async (client) => {
      const demande = await requeteUne<Demande>('SELECT * FROM stock_demandes WHERE id = $1 FOR UPDATE', [req.params.id], client);
      if (!demande) throw new ErreurMetier('Demande introuvable');
      if (!STATUTS_EN_ATTENTE.includes(demande.statut)) throw new ErreurMetier(`Demande déjà traitée (${demande.statut})`);
      if (demande.demandeurId === req.session!.userId && !req.session!.superAdmin) {
        throw new ErreurMetier('Vous ne pouvez pas décider de votre propre demande');
      }
      const article = (await verrouillerArticle(demande.articleId, client))!;
      const historique = [...demande.historique];
      let statut: string;
      let message: string;

      if (decision === 'refuser') {
        statut = 'Refusée';
        await executer('UPDATE stock_articles SET stock_reserve = stock_reserve - $2 WHERE id = $1', [article._id, demande.quantite], client);
        historique.push(etape(req, `Refus (${demande.statut.replace('En attente ', '')})`, motif));
        message = `${demande.numero} refusée. Réservation libérée.`;
      } else if (demande.statut === 'En attente Protocole') {
        statut = 'En attente Cabinet';
        historique.push(etape(req, 'Avis favorable du Protocole', motif || undefined));
        message = `${demande.numero} : avis favorable du Protocole, transmise au Cabinet.`;
      } else {
        statut = 'Validée';
        historique.push(etape(req, demande.statut === 'En attente Cabinet' ? 'Validation du Cabinet' : 'Validation du chef de service', motif || undefined));
        message = `${demande.numero} validée.`;
        if (demande.circuit === 'protocole') {
          await insererUn(
            'stock_registre',
            {
              dateRemise: demande.dateBesoin,
              beneficiaire: demande.beneficiaire,
              organisme: demande.directionNom,
              occasion: demande.occasion || demande.evenement,
              elu: demande.elu,
              articleId: article._id,
              quantite: demande.quantite,
              valeur: demande.valeur,
              demandeId: demande._id,
            },
            client
          );
          message = `${demande.numero} validée par le Cabinet et inscrite au registre protocolaire.`;
        }
      }

      const [maj] = await requete<Demande>(
        'UPDATE stock_demandes SET statut = $2, motif_refus = $3, historique = $4 WHERE id = $1 RETURNING *',
        [demande._id, statut, decision === 'refuser' ? motif : '', JSON.stringify(historique)],
        client
      );
      return { demande: maj, message, article };
    });

    await consigner(identiteDeRequete(req), 'stock_decision_demande', demande.numero, { decision, statut: demande.statut, motif });
    if (STATUTS_EN_ATTENTE.includes(demande.statut)) {
      const article = await requeteUne<Article>('SELECT * FROM stock_articles WHERE id = $1', [demande.articleId]);
      if (article) notifier(notifierDemandeAValider(demande, article));
    } else {
      notifier(
        notifierDemandeur(
          demande,
          demande.statut === 'Refusée'
            ? `Votre demande ${demande.numero} est refusée. Motif : ${motif}`
            : `Votre demande ${demande.numero} est validée. Le service Événementiel prépare la remise.`
        )
      );
    }
    res.json({ ok: true, message });
  })
);

/**
 * Remise d'une demande validée : sortie du stock central. Pour des goodies remis à une direction
 * dotée d'un stock déporté, la quantité y est versée ; le référent en déclarera l'usage.
 */
stockRouter.post(
  '/demandes/:id/remise',
  validation,
  traiter(async (req, res) => {
    const { demande, verseAuDepot } = await transaction(async (client) => {
      const demande = await requeteUne<Demande>('SELECT * FROM stock_demandes WHERE id = $1 FOR UPDATE', [req.params.id], client);
      if (!demande) throw new ErreurMetier('Demande introuvable');
      if (demande.statut !== 'Validée' && demande.statut !== 'Validée auto') {
        throw new ErreurMetier(`Seule une demande validée peut être remise (statut : ${demande.statut})`);
      }
      const article = (await verrouillerArticle(demande.articleId, client))!;
      if (article.aValoriser) {
        throw new ErreurMetier(
          `${article.reference} n'est pas valorisé : renseignez son prix d'achat dans la fiche article (Stock → Catalogue) avant la remise`
        );
      }
      // La livraison reprend le PMP TTC du moment, figé sur la demande.
      const prixUnitaire = article.pmp;
      const valeurLivree = arrondi(demande.quantite * prixUnitaire);
      await executer(
        'UPDATE stock_articles SET stock_physique = stock_physique - $2, stock_reserve = stock_reserve - $2 WHERE id = $1',
        [article._id, demande.quantite],
        client
      );
      const depot =
        article.categorie === 'Goodies' && demande.directionId
          ? await requeteUne<{ _id: string }>('SELECT id FROM stock_depots WHERE direction_id = $1 AND actif', [demande.directionId], client)
          : null;
      if (depot) {
        await executer(
          `INSERT INTO stock_depot_lignes (depot_id, article_id, quantite) VALUES ($1, $2, $3)
           ON CONFLICT (depot_id, article_id) DO UPDATE SET quantite = stock_depot_lignes.quantite + EXCLUDED.quantite`,
          [depot._id, article._id, demande.quantite],
          client
        );
      }
      await creerMouvement(
        {
          type: 'Sortie',
          articleId: article._id,
          quantite: -demande.quantite,
          valeur: valeurLivree,
          detail: `${demande.numero} — ${demande.directionNom} — ${demande.evenement}${depot ? ' (versé au stock déporté)' : ''}`,
          statut: 'Appliqué',
          demandeId: demande._id,
          depotId: depot?._id,
          ...auteur(req),
        },
        client
      );
      const historique = [...demande.historique, etape(req, depot ? 'Remise (versée au stock déporté)' : 'Remise')];
      const [maj] = await requete<Demande>(
        `UPDATE stock_demandes SET statut = 'Remise', historique = $2, prix_unitaire_livre = $3, valeur_livree = $4, remise_le = now()
          WHERE id = $1 RETURNING *`,
        [demande._id, JSON.stringify(historique), prixUnitaire, valeurLivree],
        client
      );
      return { demande: maj, verseAuDepot: Boolean(depot) };
    });
    await consigner(identiteDeRequete(req), 'stock_remise', demande.numero);
    res.json({
      ok: true,
      message: `${demande.numero} remise : ${Number(demande.valeurLivree).toFixed(2).replace('.', ',')} € TTC au PMP, stock central mis à jour${verseAuDepot ? ', quantité versée au stock déporté de la direction' : ''}.`,
      demande,
    });
  })
);

/** Annulation par le demandeur (tant que la demande n'est pas remise) ou par le service. Libère la réservation. */
stockRouter.post(
  '/demandes/:id/annuler',
  contribution,
  traiter(async (req, res) => {
    const demande = await transaction(async (client) => {
      const demande = await requeteUne<Demande>('SELECT * FROM stock_demandes WHERE id = $1 FOR UPDATE', [req.params.id], client);
      if (!demande) throw new ErreurMetier('Demande introuvable');
      const service = peut(req.session, 'stock', 'validation');
      if (!service && demande.demandeurId !== req.session!.userId) throw new ErreurMetier('Seul le demandeur peut annuler sa demande');
      if (![...STATUTS_EN_ATTENTE, 'Validée', 'Validée auto'].includes(demande.statut)) {
        throw new ErreurMetier(`Demande non annulable (statut : ${demande.statut})`);
      }
      await executer('UPDATE stock_articles SET stock_reserve = stock_reserve - $2 WHERE id = $1', [demande.articleId, demande.quantite], client);
      // Une demande protocolaire déjà validée a été inscrite au registre : l'inscription est retirée.
      await executer('DELETE FROM stock_registre WHERE demande_id = $1', [demande._id], client);
      const historique = [...demande.historique, etape(req, 'Annulation')];
      const [maj] = await requete<Demande>(
        "UPDATE stock_demandes SET statut = 'Annulée', historique = $2 WHERE id = $1 RETURNING *",
        [demande._id, JSON.stringify(historique)],
        client
      );
      return maj;
    });
    await consigner(identiteDeRequete(req), 'stock_annulation_demande', demande.numero);
    res.json({ ok: true, message: `${demande.numero} annulée. Réservation libérée.` });
  })
);

// --- Réceptions ----------------------------------------------------------------------------------

/**
 * Réception d'une livraison : chaque ligne contrôlée met à jour le stock et le PMP. Un écart
 * (non-conformité, manque ou excédent) crée une anomalie « À traiter » pour le suivi fournisseur.
 */
stockRouter.post(
  '/receptions',
  administration,
  traiter(async (req, res) => {
    const parsed = z
      .object({
        origine: z.enum(['bon de commande', 'marché', 'achat ponctuel']),
        fournisseur: z.string().trim().min(1).max(200),
        reference: z.string().trim().min(1).max(200),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        lignes: z
          .array(
            z.object({
              articleId: z.string().min(1),
              attendu: z.number().int().min(1).max(1_000_000),
              recu: z.number().int().min(0).max(1_000_000),
              nonConforme: z.number().int().min(0).max(1_000_000),
              prix: z.number().min(0).max(1_000_000),
            })
          )
          .min(1)
          .max(200),
      })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const d = parsed.data;
    if (d.lignes.some((l) => l.recu + l.nonConforme === 0)) throw new ErreurMetier('Chaque ligne doit compter au moins un article reçu');

    const libelleOrigine = { 'bon de commande': 'Bon de commande n° ', marché: 'Marché ', 'achat ponctuel': 'Facture ' }[d.origine];
    const anomalies = await transaction(async (client) => {
      const reception = await insererUn<{ _id: string }>('stock_receptions', { ...d, ...auteur(req) }, client);
      let anomalies = 0;
      for (const l of d.lignes) {
        const article = await verrouillerArticle(l.articleId, client);
        if (!article) throw new ErreurMetier('Article introuvable');
        if (l.recu > 0) {
          await executer(
            'UPDATE stock_articles SET stock_physique = stock_physique + $2, pmp = $3, prix_achat = $4, a_valoriser = false WHERE id = $1',
            [article._id, l.recu, nouveauPmp(article, l.recu, l.prix), l.prix],
            client
          );
          await creerMouvement(
            {
              type: 'Entrée',
              articleId: article._id,
              quantite: l.recu,
              valeur: l.recu * l.prix,
              detail: `${libelleOrigine}${d.reference} — ${d.fournisseur}`,
              statut: 'Appliqué',
              receptionId: reception._id,
              ...auteur(req),
            },
            client
          );
        }
        if (l.nonConforme > 0 || l.recu + l.nonConforme !== l.attendu) {
          anomalies++;
          await creerMouvement(
            {
              type: 'Anomalie',
              articleId: article._id,
              quantite: 0,
              detail: `Commandé ${l.attendu}, conforme ${l.recu}, non conforme ${l.nonConforme} — ${d.fournisseur} (${d.reference})`,
              statut: 'À traiter',
              receptionId: reception._id,
              ...auteur(req),
            },
            client
          );
        }
      }
      return anomalies;
    });
    await consigner(identiteDeRequete(req), 'stock_reception', `${d.fournisseur} — ${d.reference}`, { lignes: d.lignes.length, anomalies });
    res.json({
      ok: true,
      message: `Réception enregistrée : ${d.lignes.length} ligne(s), stock et PMP mis à jour.${anomalies ? ` ${anomalies} anomalie(s) à traiter avec le fournisseur.` : ''}`,
    });
  })
);

// --- Ajustements et journal des mouvements -------------------------------------------------------

export const MOTIFS_AJUSTEMENT = ['Casse', 'Perte', "Écart d'inventaire", 'Erreur de saisie', 'Échantillon / don', 'Autre'] as const;

/** Ajustement d'inventaire : immédiat sous le seuil, soumis à validation au-delà ou pour un cadeau protocolaire. */
stockRouter.post(
  '/ajustements',
  administration,
  traiter(async (req, res) => {
    const parsed = z
      .object({
        articleId: z.string().min(1),
        variation: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0),
        motif: z.enum(MOTIFS_AJUSTEMENT),
        commentaire: z.string().trim().max(1000).default(''),
      })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const d = parsed.data;
    const parametres = await lireParametresStock();

    const { mouvement, aValider } = await transaction(async (client) => {
      const article = await verrouillerArticle(d.articleId, client);
      if (!article) throw new ErreurMetier('Article introuvable');
      if (d.variation < 0 && -d.variation > article.stockPhysique - article.stockReserve) {
        throw new ErreurMetier('Impossible : le stock réservé serait entamé');
      }
      const valeur = Math.abs(d.variation) * article.pmp;
      const aValider = valeur > parametres.seuilValidationAjustement || article.categorie === 'Protocole';
      if ((aValider || d.motif === 'Autre') && !d.commentaire) throw new ErreurMetier('Commentaire obligatoire pour cet ajustement');
      if (!aValider) await varierStockPhysique(article._id, d.variation, client);
      const mouvement = await creerMouvement(
        {
          type: 'Ajustement',
          articleId: article._id,
          quantite: d.variation,
          valeur: d.variation * article.pmp,
          detail: `${d.motif}${d.commentaire ? ` — ${d.commentaire}` : ''}`,
          motif: d.motif,
          statut: aValider ? 'À valider' : 'Appliqué',
          ...auteur(req),
        },
        client
      );
      return { mouvement, aValider };
    });
    await consigner(identiteDeRequete(req), 'stock_ajustement', mouvement.numero, { ...d, aValider });
    res.json({
      ok: true,
      message: aValider ? `Ajustement ${mouvement.numero} soumis à validation.` : `Ajustement ${mouvement.numero} appliqué au stock.`,
    });
  })
);

stockRouter.get(
  '/mouvements',
  validation,
  traiter(async (req, res) => {
    const enAttente = queryString(req.query.statut) === 'en-attente';
    const articleId = queryString(req.query.article);
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (enAttente) conditions.push("m.statut IN ('À valider', 'À traiter')");
    if (articleId) {
      params.push(articleId);
      conditions.push(`m.article_id = $${params.length}`);
    }
    const mouvements = await requete(
      `SELECT m.*, a.reference, a.libelle FROM stock_mouvements m JOIN stock_articles a ON a.id = m.article_id
        ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
        ORDER BY m.created_at DESC LIMIT 500`,
      params
    );
    res.json({ mouvements });
  })
);

/** Validation ou rejet d'un ajustement soumis ; clôture d'une anomalie de réception. */
stockRouter.post(
  '/mouvements/:id/decision',
  validation,
  traiter(async (req, res) => {
    const parsed = z.object({ decision: z.enum(['valider', 'rejeter']) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const valider = parsed.data.decision === 'valider';

    const mouvement = await transaction(async (client) => {
      const m = await requeteUne<{ _id: string; numero: string; type: string; statut: string; articleId: string; quantite: number; auteurId: string | null }>(
        'SELECT * FROM stock_mouvements WHERE id = $1 FOR UPDATE',
        [req.params.id],
        client
      );
      if (!m) throw new ErreurMetier('Mouvement introuvable');
      if (m.statut !== 'À valider' && m.statut !== 'À traiter') throw new ErreurMetier('Mouvement déjà traité');
      if (m.type === 'Ajustement' && m.auteurId === req.session!.userId && !req.session!.superAdmin) {
        throw new ErreurMetier('Vous ne pouvez pas valider votre propre ajustement');
      }
      if (valider && m.type === 'Ajustement') {
        await verrouillerArticle(m.articleId, client);
        await varierStockPhysique(m.articleId, m.quantite, client);
      }
      const statut = m.type === 'Anomalie' ? 'Traitée' : valider ? 'Appliqué' : 'Rejeté';
      await executer('UPDATE stock_mouvements SET statut = $2, decideur_nom = $3, decide_le = now() WHERE id = $1', [m._id, statut, req.session!.nom], client);
      return { ...m, statut };
    });
    await consigner(identiteDeRequete(req), 'stock_decision_mouvement', mouvement.numero, { statut: mouvement.statut });
    res.json({
      ok: true,
      message:
        mouvement.statut === 'Rejeté' ? `${mouvement.numero} rejeté : le stock reste inchangé.` : `${mouvement.numero} : ${mouvement.statut.toLowerCase()}.`,
    });
  })
);

// --- Registre protocolaire -----------------------------------------------------------------------

/** Registre des cadeaux remis. Chaque consultation est inscrite au journal (données personnelles). */
stockRouter.get(
  '/registre',
  validation,
  traiter(async (req, res) => {
    const recherche = queryString(req.query.recherche)?.trim();
    const params: unknown[] = [];
    let filtre = '';
    if (recherche) {
      params.push(`%${recherche.toLowerCase()}%`);
      filtre = 'WHERE lower(r.beneficiaire) LIKE $1 OR lower(r.organisme) LIKE $1';
    }
    const registre = await requete(
      `SELECT r.*, a.reference, a.libelle FROM stock_registre r JOIN stock_articles a ON a.id = r.article_id
        ${filtre} ORDER BY r.date_remise DESC LIMIT 1000`,
      params
    );
    await consigner(identiteDeRequete(req), 'stock_consultation_registre', recherche ?? '');
    res.json({ registre });
  })
);

/** Cadeaux déjà remis à un bénéficiaire : évite d'offrir deux fois le même objet. */
stockRouter.get(
  '/registre/beneficiaire',
  validation,
  traiter(async (req, res) => {
    const nom = queryString(req.query.nom)?.trim() ?? '';
    if (nom.length < 3) return void res.json({ cadeaux: [] });
    const cadeaux = await requete(
      `SELECT r.date_remise, r.beneficiaire, r.occasion, r.article_id, a.libelle FROM stock_registre r
         JOIN stock_articles a ON a.id = r.article_id
        WHERE NOT r.anonymise AND lower(r.beneficiaire) LIKE $1 ORDER BY r.date_remise DESC LIMIT 20`,
      [`%${nom.toLowerCase()}%`]
    );
    res.json({ cadeaux });
  })
);

stockRouter.get(
  '/registre/export',
  validation,
  traiter(async (req, res) => {
    const lignes = await requete<{
      dateRemise: string;
      beneficiaire: string;
      organisme: string;
      occasion: string;
      elu: string;
      reference: string;
      libelle: string;
      quantite: number;
      valeur: number;
    }>(
      `SELECT r.*, a.reference, a.libelle FROM stock_registre r JOIN stock_articles a ON a.id = r.article_id ORDER BY r.date_remise`
    );
    const cellule = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [
      ['Date', 'Bénéficiaire', 'Organisme', 'Occasion', 'Élu remettant', 'Référence', 'Article', 'Quantité', 'Valeur (€)'].map(cellule).join(';'),
      ...lignes.map((l) =>
        [
          l.dateRemise.split('-').reverse().join('/'),
          l.beneficiaire,
          l.organisme,
          l.occasion,
          l.elu,
          l.reference,
          l.libelle,
          l.quantite,
          String(l.valeur).replace('.', ','),
        ]
          .map(cellule)
          .join(';')
      ),
    ].join('\r\n');
    await consigner(identiteDeRequete(req), 'stock_export_registre', `${lignes.length} ligne(s)`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="registre-protocolaire.csv"');
    res.send(`﻿${csv}`);
  })
);

// --- Stocks déportés -----------------------------------------------------------------------------

const SELECT_DEPOTS = `
  SELECT p.*, d.nom AS direction, u.nom AS referent, u.email AS referent_email,
         COALESCE(sum(l.quantite), 0) AS nombre_articles,
         COALESCE(sum(l.quantite * a.pmp), 0) AS valeur
    FROM stock_depots p
    JOIN directions d ON d.id = p.direction_id
    LEFT JOIN utilisateurs u ON u.id = p.referent_id
    LEFT JOIN stock_depot_lignes l ON l.depot_id = p.id
    LEFT JOIN stock_articles a ON a.id = l.article_id`;

async function lignesDepot(depotId: string) {
  return requete(
    `SELECT l.article_id, l.quantite, a.reference, a.libelle, a.pmp FROM stock_depot_lignes l
       JOIN stock_articles a ON a.id = l.article_id WHERE l.depot_id = $1 ORDER BY a.reference`,
    [depotId]
  );
}

stockRouter.get(
  '/depots',
  administration,
  traiter(async (_req, res) => {
    const parametres = await lireParametresStock();
    const depots = await requete(`${SELECT_DEPOTS} GROUP BY p.id, d.nom, u.nom, u.email ORDER BY d.nom`);
    res.json({ depots, relanceDeportJours: parametres.relanceDeportJours });
  })
);

/** Stock déporté dont le compte connecté est le référent. */
stockRouter.get(
  '/depots/mien',
  contribution,
  traiter(async (req, res) => {
    const depot = await requeteUne<{ _id: string }>(
      `${SELECT_DEPOTS} WHERE p.referent_id = $1 AND p.actif GROUP BY p.id, d.nom, u.nom, u.email`,
      [req.session!.userId]
    );
    res.json({ depot, lignes: depot ? await lignesDepot(depot._id) : [] });
  })
);

stockRouter.get(
  '/depots/:id',
  administration,
  traiter(async (req, res) => {
    const depot = await requeteUne<{ _id: string }>(`${SELECT_DEPOTS} WHERE p.id = $1 GROUP BY p.id, d.nom, u.nom, u.email`, [req.params.id]);
    if (!depot) return void res.status(404).json({ ok: false, message: 'Stock déporté introuvable' });
    res.json({ depot, lignes: await lignesDepot(depot._id) });
  })
);

const schemaDepot = z.object({ referentId: z.string().min(1).nullable(), actif: z.boolean().default(true) });

stockRouter.post(
  '/depots',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaDepot.extend({ directionId: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const existant = await requeteUne('SELECT 1 FROM stock_depots WHERE direction_id = $1', [parsed.data.directionId]);
    if (existant) throw new ErreurMetier('Cette direction a déjà un stock déporté');
    if (!(await requeteUne('SELECT 1 FROM directions WHERE id = $1', [parsed.data.directionId]))) return invalide(res, 'Direction inconnue');
    if (parsed.data.referentId && !(await requeteUne('SELECT 1 FROM utilisateurs WHERE id = $1', [parsed.data.referentId]))) {
      return invalide(res, 'Référent inconnu');
    }
    await insererUn('stock_depots', parsed.data);
    await consigner(identiteDeRequete(req), 'stock_creation_depot', parsed.data.directionId);
    res.json({ ok: true, message: 'Stock déporté créé' });
  })
);

stockRouter.put(
  '/depots/:id',
  administration,
  traiter(async (req, res) => {
    const parsed = schemaDepot.safeParse(req.body);
    if (!parsed.success) return invalide(res);
    if (parsed.data.referentId && !(await requeteUne('SELECT 1 FROM utilisateurs WHERE id = $1', [parsed.data.referentId]))) {
      return invalide(res, 'Référent inconnu');
    }
    const modifies = await executer('UPDATE stock_depots SET referent_id = $2, actif = $3 WHERE id = $1', [
      req.params.id,
      parsed.data.referentId,
      parsed.data.actif,
    ]);
    if (modifies === 0) return void res.status(404).json({ ok: false, message: 'Stock déporté introuvable' });
    await consigner(identiteDeRequete(req), 'stock_modification_depot', req.params.id, parsed.data);
    res.json({ ok: true, message: 'Stock déporté mis à jour' });
  })
);

const schemaLignes = z
  .array(z.object({ articleId: z.string().min(1), quantite: z.number().int().min(1).max(1_000_000) }))
  .min(1)
  .max(200);

/**
 * Déclaration du référent : sortie (distribué lors d'un événement) ou retour (non distribué,
 * réintégré au stock déporté). Le stock central n'est pas touché.
 */
stockRouter.post(
  '/depots/:id/declaration',
  contribution,
  traiter(async (req, res) => {
    const parsed = z
      .object({ type: z.enum(['sortie', 'retour']), evenement: z.string().trim().min(1).max(300), lignes: schemaLignes })
      .safeParse(req.body);
    if (!parsed.success) return invalide(res);
    const { type, evenement, lignes } = parsed.data;

    const total = await transaction(async (client) => {
      const depot = await requeteUne<{ _id: string; referentId: string | null; actif: boolean }>(
        'SELECT * FROM stock_depots WHERE id = $1 FOR UPDATE',
        [req.params.id],
        client
      );
      if (!depot || !depot.actif) throw new ErreurMetier('Stock déporté introuvable');
      if (depot.referentId !== req.session!.userId && !peut(req.session, 'stock', 'administration')) {
        throw new ErreurMetier("Seul le référent de ce stock déporté peut déclarer");
      }
      let total = 0;
      for (const l of lignes) {
        const article = await requeteUne<Article>('SELECT * FROM stock_articles WHERE id = $1', [l.articleId], client);
        if (!article) throw new ErreurMetier('Article introuvable');
        const variation = type === 'sortie' ? -l.quantite : l.quantite;
        if (type === 'sortie') {
          const modifies = await executer(
            'UPDATE stock_depot_lignes SET quantite = quantite - $3 WHERE depot_id = $1 AND article_id = $2 AND quantite >= $3',
            [depot._id, article._id, l.quantite],
            client
          );
          if (modifies === 0) throw new ErreurMetier(`Quantité supérieure au stock déporté pour ${article.libelle}`);
        } else {
          await executer(
            `INSERT INTO stock_depot_lignes (depot_id, article_id, quantite) VALUES ($1, $2, $3)
             ON CONFLICT (depot_id, article_id) DO UPDATE SET quantite = stock_depot_lignes.quantite + EXCLUDED.quantite`,
            [depot._id, article._id, l.quantite],
            client
          );
        }
        total += l.quantite;
        await creerMouvement(
          {
            type: type === 'sortie' ? 'Sortie déportée' : 'Retour déporté',
            articleId: article._id,
            quantite: variation,
            valeur: variation * article.pmp,
            detail: evenement,
            statut: 'Appliqué',
            depotId: depot._id,
            ...auteur(req),
          },
          client
        );
      }
      await executer('UPDATE stock_depots SET derniere_declaration = now() WHERE id = $1', [depot._id], client);
      return total;
    });
    await consigner(identiteDeRequete(req), 'stock_declaration_depot', evenement, { type, total });
    res.json({ ok: true, message: `${type === 'sortie' ? 'Sortie' : 'Retour'} de ${total} article(s) enregistré(e) pour « ${evenement} ».` });
  })
);

/** Réintégration au stock central de quantités détenues par un stock déporté. */
stockRouter.post(
  '/depots/:id/reintegration',
  administration,
  traiter(async (req, res) => {
    const parsed = z.object({ lignes: schemaLignes }).safeParse(req.body);
    if (!parsed.success) return invalide(res);
    await transaction(async (client) => {
      for (const l of parsed.data.lignes) {
        const modifies = await executer(
          'UPDATE stock_depot_lignes SET quantite = quantite - $3 WHERE depot_id = $1 AND article_id = $2 AND quantite >= $3',
          [req.params.id, l.articleId, l.quantite],
          client
        );
        if (modifies === 0) throw new ErreurMetier('Quantité supérieure au stock déporté');
        const article = (await verrouillerArticle(l.articleId, client))!;
        await varierStockPhysique(article._id, l.quantite, client);
        await creerMouvement(
          {
            type: 'Réintégration',
            articleId: article._id,
            quantite: l.quantite,
            valeur: l.quantite * article.pmp,
            detail: 'Retour au stock central depuis un stock déporté',
            statut: 'Appliqué',
            depotId: req.params.id,
            ...auteur(req),
          },
          client
        );
      }
    });
    await consigner(identiteDeRequete(req), 'stock_reintegration', req.params.id, { lignes: parsed.data.lignes.length });
    res.json({ ok: true, message: 'Quantités réintégrées au stock central' });
  })
);

/** Relance du référent d'un stock déporté sans déclaration récente (courriel). */
stockRouter.post(
  '/depots/:id/relance',
  administration,
  traiter(async (req, res) => {
    const depot = await requeteUne<{ _id: string; direction: string; referentEmail: string | null; derniereDeclaration: Date | null; createdAt: Date }>(
      `${SELECT_DEPOTS} WHERE p.id = $1 GROUP BY p.id, d.nom, u.nom, u.email`,
      [req.params.id]
    );
    if (!depot) return void res.status(404).json({ ok: false, message: 'Stock déporté introuvable' });
    if (!depot.referentEmail) throw new ErreurMetier("Aucun référent n'est désigné pour ce stock déporté");
    const jours = depot.derniereDeclaration ? Math.floor((Date.now() - new Date(depot.derniereDeclaration).getTime()) / 86_400_000) : null;
    await executer('UPDATE stock_depots SET derniere_relance = now() WHERE id = $1', [depot._id]);
    notifier(notifierRelanceDepot(depot.referentEmail, depot.direction, jours));
    await consigner(identiteDeRequete(req), 'stock_relance_depot', depot.direction);
    res.json({ ok: true, message: `Relance envoyée au référent (${depot.referentEmail}).` });
  })
);

/** Comptes pouvant être désignés référents (au moins contribution sur le module). */
stockRouter.get(
  '/referents-possibles',
  administration,
  traiter(async (_req, res) => {
    const comptes = await requete(
      `SELECT u.id, u.nom, u.email FROM utilisateurs u
        WHERE u.statut <> 'Suspendu' AND (u.super_admin OR EXISTS (
          SELECT 1 FROM droits_modules d WHERE d.utilisateur_id = u.id AND d.module = 'stock'
             AND d.niveau IN ('contribution', 'validation', 'administration')))
        ORDER BY u.nom`
    );
    res.json({ comptes });
  })
);

// --- Import et export du catalogue ---------------------------------------------------------------

const televersement = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function envoyerCsv(res: Response, nom: string, contenu: string) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.send(contenu);
}

/** Modèle CSV à remplir pour un import. */
stockRouter.get('/catalogue/modele', requireSuperAdmin, (_req, res) => {
  envoyerCsv(res, 'modele-catalogue.csv', modeleCatalogue());
});

/** Catalogue complet au format d'import (sauvegarde, travail dans un tableur, réimport). */
stockRouter.get(
  '/catalogue/export',
  administration,
  traiter(async (req, res) => {
    const articles = await requete<Article>('SELECT * FROM stock_articles ORDER BY categorie, reference');
    await consigner(identiteDeRequete(req), 'stock_export_catalogue', `${articles.length} article(s)`);
    envoyerCsv(res, 'catalogue.csv', exporterCatalogue(articles));
  })
);

/**
 * Import d'un catalogue depuis un CSV, réservé aux super-administrateurs. mode=analyse contrôle le
 * fichier sans rien écrire ; mode=import écrit, seulement si l'analyse est sans anomalie.
 */
stockRouter.post(
  '/catalogue/import',
  requireSuperAdmin,
  televersement.single('fichier'),
  traiter(async (req, res) => {
    if (!req.file) return invalide(res, 'Aucun fichier reçu');
    const ajouterEmplacements = req.body?.ajouterEmplacements === 'true';
    let lecture;
    try {
      lecture = lireCsvCatalogue(decoderFichier(req.file.buffer));
    } catch (err) {
      throw new ErreurMetier(`Fichier illisible : ${err instanceof Error ? err.message : 'format inattendu'}`);
    }
    const analyse = await analyserCatalogue(lecture.lignes, { ajouterEmplacements, ecartes: lecture.ecartes, erreurs: lecture.erreurs });
    // Aperçu limité aux 500 premières lignes pour l'écran ; les totaux portent sur tout le fichier.
    const rapport = { ...analyse, articles: analyse.articles.slice(0, 500) };
    if (req.query.mode !== 'import') return void res.json({ ok: true, rapport });
    if (analyse.anomalies.length) throw new ErreurMetier(`${analyse.anomalies.length} anomalie(s) : corrigez le fichier avant l'import`);
    const crees = await appliquerCatalogue(analyse, {
      source: `Import du catalogue (${req.file.originalname})`,
      auteurId: req.session!.userId,
      auteurNom: req.session!.nom,
    });
    await consigner(identiteDeRequete(req), 'stock_import_catalogue', req.file.originalname, {
      crees,
      existants: analyse.existants.length,
      ecartes: analyse.ecartes.length,
      emplacementsAjoutes: analyse.emplacementsInconnus,
    });
    res.json({ ok: true, message: `${crees} article(s) créé(s)${analyse.existants.length ? `, ${analyse.existants.length} déjà présent(s) laissé(s) tels quels` : ''}.`, rapport });
  })
);
