import { Router } from 'express';
import { config } from '../config.js';
import { requireSuperAdmin } from '../middleware/auth.js';
import { consigner, identiteDeRequete } from '../lib/journal.js';
import { stockageActif, testerStockage } from '../lib/stockage.js';

export const systemeRouter = Router();

systemeRouter.use(requireSuperAdmin);

/** État des services externes, pour vérifier la configuration d'un déploiement. */
systemeRouter.get('/etat', (_req, res) => {
  res.json({
    environnement: config.isProduction ? 'production' : 'développement',
    stockage: {
      actif: stockageActif(),
      bucket: config.s3.bucket ?? null,
      endpoint: config.s3.endpoint ?? null,
      prefixe: config.s3.prefixe,
    },
    email: { actif: Boolean(config.smtp.host), expediteur: config.emailFrom },
    synchronisationGithub: { active: Boolean(config.github.token), depot: config.github.repo },
  });
});

/** Écrit, relit et efface un objet de test sur le stockage S3. */
systemeRouter.post('/test-stockage', async (req, res) => {
  if (!stockageActif()) {
    res.json({ ok: false, message: 'Stockage non configuré : renseignez les variables S3_*' });
    return;
  }
  try {
    await testerStockage();
    await consigner(identiteDeRequete(req), 'test_stockage', config.s3.bucket ?? '');
    res.json({ ok: true, message: 'Écriture, lecture et suppression réussies' });
  } catch (err) {
    console.error('[stockage] Échec du test :', err);
    res.json({ ok: false, message: `Échec du test : ${err instanceof Error ? err.message : 'erreur inconnue'}` });
  }
});
