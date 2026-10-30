import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { estValide, type Evenement } from '../types';
import { formatTitreEvenement } from './formatTitre';
import { formatDate, majusculeInitiale } from './formatDate';
import { formatDuree } from './formatDuree';
import { chargerLogoPourPdf, type LogoCharge } from './logosPdf';

const TITRE_APP = 'Calendrier Événements Dunkerque';
const MARGE = 40;
const HAUTEUR_LOGO = 28;

/**
 * jspdf-autotable pose `finalY` sur `doc.lastAutoTable` en effet de bord (non typé dans ses .d.ts,
 * `jsPDFDocument` y est déclaré `any`) : c'est le seul moyen documenté de savoir où reprendre après
 * un tableau pour enchaîner le suivant sans les superposer.
 */
function finalYDe(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? MARGE;
}

/**
 * En-tête commun : titre de l'app et sous-titre à gauche, logo officiel dans le coin haut droit
 * (comme dans l'UI) avec la date/heure d'impression juste en dessous.
 */
function entete(doc: jsPDF, sousTitre: string, logo: LogoCharge | null): number {
  const largeurPage = doc.internal.pageSize.getWidth();

  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(TITRE_APP, MARGE, MARGE - 4);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(sousTitre, MARGE, MARGE + 16);

  let yApresLogo = MARGE - 4;
  if (logo) {
    const largeurLogo = HAUTEUR_LOGO * (logo.largeur / logo.hauteur || 1);
    const yLogo = MARGE - 24;
    doc.addImage(logo.dataUrl, 'PNG', largeurPage - MARGE - largeurLogo, yLogo, largeurLogo, HAUTEUR_LOGO);
    yApresLogo = yLogo + HAUTEUR_LOGO + 12;
  }

  const maintenant = new Date();
  const texteImpression = `Imprimé le ${maintenant.toLocaleDateString('fr-FR')} à ${maintenant.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
  doc.setFontSize(9);
  doc.setTextColor(140);
  doc.text(texteImpression, largeurPage - MARGE, yApresLogo, { align: 'right' });
  doc.setTextColor(0);

  const yLigne = MARGE + 26;
  doc.setDrawColor(220);
  doc.line(MARGE, yLigne, largeurPage - MARGE, yLigne);

  return yLigne + 20;
}

/**
 * Exporte en PDF les fiches détaillées de tous les événements d'un jour donné (une fiche par
 * événement, avec ses champs comme dans la pop-up du Calendrier), utile pour imprimer la journée.
 */
export async function exporterFicheJourPdf(jour: Date, evenements: Evenement[]): Promise<void> {
  const logo = await chargerLogoPourPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const largeurPage = doc.internal.pageSize.getWidth();

  const titreJour = majusculeInitiale(
    jour.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  );
  let y = entete(doc, titreJour, logo);

  if (evenements.length === 0) {
    doc.setFontSize(11);
    doc.text('Aucun événement ce jour.', MARGE, y);
  }

  for (const e of evenements) {
    autoTable(doc, {
      startY: y,
      margin: { left: MARGE, right: MARGE },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 5 },
      columnStyles: { 0: { cellWidth: 130, fontStyle: 'bold' }, 1: { cellWidth: largeurPage - 2 * MARGE - 130 } },
      head: [
        [
          {
            content: formatTitreEvenement(e.nom),
            colSpan: 2,
            styles: {
              fillColor: estValide(e) ? [220, 245, 224] : [255, 235, 235],
              textColor: [20, 20, 20],
              fontStyle: 'bold',
              fontSize: 11,
              halign: 'left',
            },
          },
        ],
      ],
      body: [
        ['Lieu', e.lieu || '—'],
        ['Quartier', e.quartier || '—'],
        ['Nature', e.nature || '—'],
        ['Pilote', e.pilote || '—'],
        ['Direction pilote', e.directionPilote || '—'],
        ['Organisateur', e.organisateur || '—'],
        ['Type', e.type || '—'],
        ['Période', formatDuree(e) ?? formatDate(e.dateDeDebut)],
        ['Validation', estValide(e) ? 'Validée' : 'Non validée'],
      ],
    });
    y = finalYDe(doc) + 16;
  }

  doc.save(`fiches-${jour.toISOString().slice(0, 10)}.pdf`);
}

/** Ligne de la Liste à exporter : soit un en-tête de semaine, soit un événement. */
export type LigneExportPdf = { type: 'entete'; label: string } | { type: 'evenement'; evenement: Evenement };

/** Exporte en PDF la Liste telle qu'affichée à l'écran (mêmes filtres, mêmes en-têtes de semaine). */
export async function exporterListePdf(lignes: LigneExportPdf[]): Promise<void> {
  const logo = await chargerLogoPourPdf();
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });
  const y = entete(doc, 'Liste des événements', logo);

  const body = lignes.map((ligne) => {
    if (ligne.type === 'entete') {
      return [
        {
          content: ligne.label,
          colSpan: 5,
          styles: {
            fillColor: [230, 244, 255] as [number, number, number],
            textColor: [25, 88, 217] as [number, number, number],
            fontStyle: 'bold' as const,
            halign: 'left' as const,
          },
        },
      ];
    }
    const e = ligne.evenement;
    return [
      formatTitreEvenement(e.nom),
      e.quartier || '—',
      e.nature || '—',
      estValide(e) ? 'Validée' : 'Non validée',
      formatDuree(e) ?? formatDate(e.dateDeDebut),
    ];
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGE, right: MARGE },
    styles: { fontSize: 9 },
    headStyles: { fillColor: [29, 78, 216] },
    head: [['Nom', 'Quartier', 'Nature', 'Validation', 'Période']],
    body,
  });

  doc.save('liste-evenements.pdf');
}
