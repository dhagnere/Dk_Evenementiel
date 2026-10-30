import { Tag } from 'antd';
import { estBrouillon, estValide, type Evenement } from '../types';

/** Pastille « Brouillon », affichée en plus du statut de validation dans toutes les vues de l'application. */
export function BrouillonBadge({ evenement }: { evenement: Evenement }) {
  return estBrouillon(evenement) ? <Tag color="default">Brouillon</Tag> : null;
}

export function ValidationBadge({ evenement }: { evenement: Evenement }) {
  return (
    <>
      <BrouillonBadge evenement={evenement} />
      {evenement.validParDateClef ? (
        <Tag color="blue">Date Clef</Tag>
      ) : (
        <Tag color={estValide(evenement) ? 'green' : 'red'}>{estValide(evenement) ? 'Validée' : 'Non validée'}</Tag>
      )}
    </>
  );
}
