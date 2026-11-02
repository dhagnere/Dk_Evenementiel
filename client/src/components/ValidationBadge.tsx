import { Tag } from 'antd';
import { estBrouillon, estValide, type Evenement } from '../types';

/** Pastille « Brouillon », affichée en plus du statut de validation dans toutes les vues de l'application. */
export function BrouillonBadge({ evenement }: { evenement: Evenement }) {
  return estBrouillon(evenement) ? <Tag color="default">Brouillon</Tag> : null;
}

/**
 * Pastille d'une série d'événements (accueil, fiche événement unique), avec les mêmes libellés et couleurs que
 * la liste du calendrier : Date Clef (bleu), sinon Validé (vert) ou À valider (orange), précédée de Brouillon.
 */
export function ValidationSerieBadge({ valide, dateClef, statut }: { valide?: boolean; dateClef?: boolean; statut?: string }) {
  return (
    <>
      {statut === 'Brouillon' && <Tag color="default">Brouillon</Tag>}
      {dateClef ? <Tag color="blue">Date Clef</Tag> : <Tag color={valide ? 'green' : 'orange'}>{valide ? 'Validé' : 'À valider'}</Tag>}
    </>
  );
}

export function ValidationBadge({ evenement }: { evenement: Evenement }) {
  return (
    <>
      <BrouillonBadge evenement={evenement} />
      {evenement.validParDateClef ? (
        <Tag color="blue">Date Clef</Tag>
      ) : (
        <Tag color={estValide(evenement) ? 'green' : 'orange'}>{estValide(evenement) ? 'Validé' : 'À valider'}</Tag>
      )}
    </>
  );
}
