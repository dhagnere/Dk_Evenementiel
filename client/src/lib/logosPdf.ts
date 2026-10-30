import { LOGO_DUNKERQUE_CUD } from '../logos';

export interface LogoCharge {
  dataUrl: string;
  largeur: number;
  hauteur: number;
}

function blobVersDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(lecteur.result as string);
    lecteur.onerror = () => reject(lecteur.error);
    lecteur.readAsDataURL(blob);
  });
}

function dimensionsImage(dataUrl: string): Promise<{ largeur: number; hauteur: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ largeur: img.naturalWidth || img.width, hauteur: img.naturalHeight || img.height });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

let promesseLogo: Promise<LogoCharge | null> | null = null;

/**
 * Charge (et met en cache pour la session) le logo officiel, auto-hébergé dans client/public/logos/,
 * sous forme de data URL pour l'insérer dans les PDF générés. En cas d'échec, il est simplement omis
 * du PDF plutôt que de faire échouer tout l'export.
 */
export function chargerLogoPourPdf(): Promise<LogoCharge | null> {
  if (!promesseLogo) {
    promesseLogo = (async () => {
      try {
        const reponse = await fetch(LOGO_DUNKERQUE_CUD);
        if (!reponse.ok) return null;
        const blob = await reponse.blob();
        const dataUrl = await blobVersDataUrl(blob);
        const dimensions = await dimensionsImage(dataUrl);
        return dimensions ? { dataUrl, ...dimensions } : null;
      } catch {
        return null;
      }
    })();
  }
  return promesseLogo;
}
