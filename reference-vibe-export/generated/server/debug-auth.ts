import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { ComptesUtilisateursCalendrierEvenementsBoard } from '@api/BoardSDK';

/**
 * Dérivation PBKDF2-SHA256 pour hacher un mot de passe
 */
async function hasherMotDePasse(motDePasse: string, sel: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(motDePasse),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBuffer = new Uint8Array(
    sel.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  return Array.from(new Uint8Array(derivedBits))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Fonction de debug pour tester un mot de passe
 */
export const testerMotDePasse = createServerFn({ method: 'POST' })
  .validator(z.object({
    email: z.string().email(),
    motDePasse: z.string()
  }))
  .handler(async ({ data }) => {
    try {
      const board = new ComptesUtilisateursCalendrierEvenementsBoard();
      const result = await board.items()
        .withColumns(['identifiantTexte', 'empreinteMotDePasse', 'sel', 'statutTexte', 'rleTexte'])
        .execute();

      const compte = result.items.find((item: any) => 
        item.identifiantTexte?.toLowerCase() === data.email.toLowerCase() &&
        !item.name?.startsWith('[DEMANDE]')
      );

      if (!compte) {
        return {
          ok: false,
          message: 'Compte non trouvé',
          debug: {
            totalItems: result.items.length,
            comptesNonDemande: result.items.filter((i: any) => !i.name?.startsWith('[DEMANDE]')).length
          }
        };
      }

      if (!compte.sel || !compte.empreinteMotDePasse) {
        return {
          ok: false,
          message: 'Hash ou sel manquant',
          debug: {
            name: compte.name,
            email: compte.identifiantTexte,
            hasSel: !!compte.sel,
            hasHash: !!compte.empreinteMotDePasse
          }
        };
      }

      const hashCalcule = await hasherMotDePasse(data.motDePasse, compte.sel);
      const correspond = hashCalcule === compte.empreinteMotDePasse;

      return {
        ok: correspond,
        message: correspond ? 'Mot de passe correct !' : 'Mot de passe incorrect',
        debug: {
          name: compte.name,
          email: compte.identifiantTexte,
          role: compte.rleTexte,
          statut: compte.statutTexte,
          selLength: compte.sel.length,
          hashLength: compte.empreinteMotDePasse.length,
          selPreview: compte.sel.substring(0, 20) + '...',
          hashStockePreview: compte.empreinteMotDePasse.substring(0, 20) + '...',
          hashCalculePreview: hashCalcule.substring(0, 20) + '...',
          correspond
        }
      };
    } catch (error) {
      console.error('Erreur test mot de passe:', error);
      return {
        ok: false,
        message: 'Erreur lors du test',
        error: error instanceof Error ? error.message : 'Unknown'
      };
    }
  });
