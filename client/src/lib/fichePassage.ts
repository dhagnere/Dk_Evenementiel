import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { FicheProjetComplete, JalonPilotage, ReferentielRetroplanning, TacheProjet } from '../types';
import { chargerLogoPourPdf } from './logosPdf';
import { libelleModule, libelleRole } from './projets';

const MARGE = 36;
const date = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');

function finalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGE;
}

/**
 * Fiche de passage d'un jalon, sur une page : ce qui est fait, ce qui reste, ce qui bloque, puis la
 * décision de passage. Support des réunions jalon et des points de suivi avec le pilote.
 */
export async function imprimerFichePassage(fiche: FicheProjetComplete, jalon: JalonPilotage, ref: ReferentielRetroplanning): Promise<void> {
  const { projet, pilotage } = fiche;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const largeur = doc.internal.pageSize.getWidth();
  const logo = await chargerLogoPourPdf();
  if (logo) {
    const l = 26 * (logo.largeur / logo.hauteur || 1);
    doc.addImage(logo.dataUrl, 'PNG', largeur - MARGE - l, MARGE - 18, l, 26);
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`Fiche de passage — ${jalon.code} ${jalon.libelle}`, MARGE, MARGE);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${projet.titre} · jour J le ${date(projet.dateJour)} · N${pilotage.niveau} ${pilotage.niveauLibelle}`, MARGE, MARGE + 16);
  doc.setDrawColor(220);
  doc.line(MARGE, MARGE + 26, largeur - MARGE, MARGE + 26);

  autoTable(doc, {
    startY: MARGE + 34,
    theme: 'plain',
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 130 } },
    body: [
      ['Date du jalon', date(jalon.date)],
      ['Question de passage', jalon.question],
      ['Livrable attendu', jalon.livrable],
      ['Valide', `${libelleRole(ref, jalon.valideurTenu)}${jalon.valideurNom ? ` — ${jalon.valideurNom}` : ''}`],
      ['Modules', pilotage.modules.map((m) => m.libelle).join(', ')],
    ],
  });

  const lot = fiche.taches.filter((t) => t.jalonActif === jalon.code);
  const ligne = (t: TacheProjet) => [
    t.libelle,
    libelleModule(ref, t.module),
    date(t.echeance),
    `${libelleRole(ref, t.porteTenu)}${t.portePar ? ` (${t.portePar})` : ''}`,
    t.livrable || '—',
  ];
  const section = (titre: string, taches: TacheProjet[], couleur: [number, number, number]) => {
    autoTable(doc, {
      startY: finalY(doc) + 12,
      head: [[`${titre} (${taches.length})`, 'Module', 'Échéance', 'Porte (P)', 'Livrable']],
      body: taches.length ? taches.map(ligne) : [['—', '', '', '', '']],
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: couleur },
      columnStyles: { 0: { cellWidth: 190 }, 2: { cellWidth: 58 } },
    });
  };
  const bloquent = pilotage.bloquants.filter((t) => t.jalonActif === jalon.code || t.echeance <= jalon.date);
  section('Fait', lot.filter((t) => t.fait), [44, 122, 75]);
  section('Reste à faire', lot.filter((t) => !t.fait && !bloquent.some((b) => b._id === t._id)), [0, 74, 153]);
  section('Bloque', bloquent, [190, 51, 39]);

  let y = finalY(doc) + 22;
  if (y > doc.internal.pageSize.getHeight() - 110) {
    doc.addPage();
    y = MARGE;
  }
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Décision de passage', MARGE, y);
  doc.setFont('helvetica', 'normal');
  doc.text('[   ] Oui, le jalon est franchi          [   ] Non, à revoir le : ____ / ____ / ________', MARGE, y + 18);
  doc.text('Par : ______________________________        Signature :', MARGE, y + 40);
  doc.rect(largeur - MARGE - 170, y + 28, 170, 50);
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`Édité le ${new Date().toLocaleDateString('fr-FR')} depuis DK Événementiel`, MARGE, doc.internal.pageSize.getHeight() - 20);
  doc.save(`fiche-passage-${jalon.code}-${projet.titre.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.pdf`);
}
