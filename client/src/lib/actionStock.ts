import { message } from 'antd';

/**
 * Exécute une action du module et affiche son résultat : message de succès, ou motif du refus
 * renvoyé par le serveur (règle de gestion non respectée, droits insuffisants…).
 */
export async function lancer(appel: Promise<{ ok: boolean; message?: string }>): Promise<boolean> {
  try {
    const res = await appel;
    if (res.ok) message.success(res.message ?? 'Enregistré');
    else message.error(res.message ?? 'Action impossible');
    return res.ok;
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Erreur inconnue');
    return false;
  }
}
