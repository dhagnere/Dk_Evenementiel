import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { DemandeStock } from '../types';
import { formatJour } from './formatStock';
import { chargerLogoPourPdf } from './logosPdf';

const MARGE = 40;

/** Montant pour le PDF : les espaces insécables d'Intl ne passent pas dans la police Helvetica de jsPDF. */
const euros = (montant: number, decimales = 2) => {
  const [entier, decimal] = montant.toFixed(decimales).split('.');
  return `${entier.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${decimal} €`;
};

/**
 * Bon de livraison d'une demande remise : article, quantité, PMP TTC figé à la remise et total.
 * Deux zones de signature (service Événementiel, direction destinataire).
 */
export async function imprimerBonLivraison(demande: DemandeStock): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const largeur = doc.internal.pageSize.getWidth();
  const logo = await chargerLogoPourPdf();
  if (logo) {
    const l = 28 * (logo.largeur / logo.hauteur || 1);
    doc.addImage(logo.dataUrl, 'PNG', largeur - MARGE - l, MARGE - 20, l, 28);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Bon de livraison', MARGE, MARGE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Service Événementiel — demande ${demande.numero}`, MARGE, MARGE + 18);
  doc.setDrawColor(220);
  doc.line(MARGE, MARGE + 30, largeur - MARGE, MARGE + 30);

  const remiseLe = demande.remiseLe ? new Date(demande.remiseLe).toLocaleDateString('fr-FR') : '—';
  autoTable(doc, {
    startY: MARGE + 44,
    theme: 'plain',
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 140 } },
    body: [
      ['Direction destinataire', demande.directionNom],
      ['Événement', demande.evenement],
      ...(demande.beneficiaire ? [['Bénéficiaire', demande.beneficiaire]] : []),
      ['Besoin le', formatJour(demande.dateBesoin)],
      ['Remise le', remiseLe],
      ['Demandeur', demande.demandeurNom],
    ],
  });

  const prix = demande.prixUnitaireLivre ?? 0;
  const total = demande.valeurLivree ?? 0;
  const taux = demande.tauxTvaLivre ?? 20;
  // Prix TTC enregistrés : le HT et la TVA s'en déduisent, arrondis au centime sur le total.
  const totalHt = Math.round((total / (1 + taux / 100)) * 100) / 100;
  const unitaire = (v: number) => (Number.isInteger(Math.round(v * 1e4) / 100) ? euros(v) : euros(v, 4));
  const tauxTexte = `${String(taux).replace('.', ',')} %`;
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16,
    head: [['Référence', 'Article', 'Qté', 'PMP unit. HT', 'TVA', 'PMP unit. TTC', 'Total TTC']],
    body: [
      [
        demande.reference,
        demande.libelle,
        String(demande.quantite),
        unitaire(Math.round((prix / (1 + taux / 100)) * 1e4) / 1e4),
        tauxTexte,
        unitaire(prix),
        euros(total),
      ],
    ],
    foot: [
      ['', '', '', '', '', 'Total HT', euros(totalHt)],
      ['', '', '', '', '', `TVA ${tauxTexte}`, euros(Math.round((total - totalHt) * 100) / 100)],
      ['', '', '', '', '', 'Total TTC', euros(total)],
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 74, 153] },
    footStyles: { fillColor: [240, 240, 240], textColor: 20, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;
  doc.setFontSize(8.5);
  doc.setTextColor(110);
  doc.text(
    'Valorisation au prix moyen pondéré (PMP) TTC de l’article à la date de remise. Document sans valeur de facture.',
    MARGE,
    y
  );
  doc.setTextColor(0);

  y += 40;
  doc.setFontSize(10);
  const milieu = largeur / 2;
  doc.text('Remis par (service Événementiel)', MARGE, y);
  doc.text('Reçu par (direction destinataire)', milieu + 10, y);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text('Nom, date et signature', MARGE, y + 14);
  doc.text('Nom, date et signature', milieu + 10, y + 14);
  doc.setTextColor(0);
  doc.rect(MARGE, y + 22, milieu - MARGE - 10, 70);
  doc.rect(milieu + 10, y + 22, largeur - MARGE - milieu - 10, 70);

  doc.save(`bon-livraison-${demande.numero}.pdf`);
}
