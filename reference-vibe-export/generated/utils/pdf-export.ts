import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Configuration des fonts
if (typeof pdfMake !== 'string') {
  (pdfMake as any).vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : pdfFonts;
}

type Event = {
  id: string;
  name: string;
  nom: string | null;
  dateDeDbut: Date | null;
  dateDeFin: Date | null;
  lieu: string | null;
  quartier: string | null;
  nature: string | null;
  statut: string | null;
  validationTechnique: boolean | null;
  validationPolitique: boolean | null;
  validParDateClef: boolean | null;
};

interface ExportOptions {
  filterDateDebut?: string;
  filterDateFin?: string;
  searchTerm?: string;
  filterQuartier?: string;
  filterNature?: string;
  filterStatut?: string;
}

export const exportEventsToPdf = (
  events: Event[],
  getSeriesDateRange: (eventName: string) => { start: Date; end: Date } | null,
  options: ExportOptions = {}
) => {
  // En-tête du document
  const headerContent: any[] = [
    { text: 'Calendrier des Événements - Dunkerque', style: 'header' },
    { text: `Date d'export : ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' })}`, style: 'subheader' }
  ];

  // Ajouter les filtres actifs
  if (options.filterDateDebut || options.filterDateFin) {
    const periode = options.filterDateDebut && options.filterDateFin
      ? `du ${new Date(options.filterDateDebut).toLocaleDateString('fr-FR')} au ${new Date(options.filterDateFin).toLocaleDateString('fr-FR')}`
      : options.filterDateDebut
      ? `à partir du ${new Date(options.filterDateDebut).toLocaleDateString('fr-FR')}`
      : `jusqu'au ${new Date(options.filterDateFin!).toLocaleDateString('fr-FR')}`;
    headerContent.push({ text: `Période : ${periode}`, style: 'filter' });
  }

  if (options.searchTerm) {
    headerContent.push({ text: `Recherche : "${options.searchTerm}"`, style: 'filter' });
  }

  if (options.filterQuartier && options.filterQuartier !== 'ALL') {
    headerContent.push({ text: `Quartier : ${options.filterQuartier}`, style: 'filter' });
  }

  if (options.filterNature && options.filterNature !== 'ALL') {
    headerContent.push({ text: `Nature : ${options.filterNature}`, style: 'filter' });
  }

  if (options.filterStatut && options.filterStatut !== 'ALL') {
    headerContent.push({ text: `Statut : ${options.filterStatut}`, style: 'filter' });
  }

  headerContent.push({ 
    text: `Total : ${events.length} événement${events.length !== 1 ? 's' : ''}`, 
    style: 'total',
    margin: [0, 5, 0, 10]
  });

  // Préparer les lignes du tableau
  const tableBody: any[][] = [
    // En-tête
    [
      { text: 'ID', style: 'tableHeader' },
      { text: 'Événement', style: 'tableHeader' },
      { text: 'Dates', style: 'tableHeader' },
      { text: 'Lieu', style: 'tableHeader' },
      { text: 'Quartier', style: 'tableHeader' },
      { text: 'Nature', style: 'tableHeader' },
      { text: 'Val. Tech', style: 'tableHeader' },
      { text: 'Val. Pol', style: 'tableHeader' },
      { text: 'Date Clef', style: 'tableHeader' }
    ]
  ];

  // Lignes de données
  events.forEach(event => {
    const seriesRange = getSeriesDateRange(event.nom || event.name);
    const startDate = seriesRange?.start ? seriesRange.start.toLocaleDateString('fr-FR') : '—';
    const endDate = seriesRange?.end ? seriesRange.end.toLocaleDateString('fr-FR') : '—';
    const dateRange = startDate === endDate ? startDate : `${startDate} → ${endDate}`;

    tableBody.push([
      { text: event.name, style: 'tableCell', fontSize: 7, bold: true },
      { text: event.nom || event.name, style: 'tableCell' },
      { text: dateRange, style: 'tableCell', fontSize: 7 },
      { text: event.lieu || '—', style: 'tableCell' },
      { text: event.quartier || '—', style: 'tableCell' },
      { text: event.nature || '—', style: 'tableCell' },
      { 
        text: event.validationTechnique ? '●' : '○', 
        style: 'tableCell',
        alignment: 'center',
        fontSize: 14,
        color: event.validationTechnique ? '#16a34a' : '#e5e7eb'
      },
      { 
        text: event.validationPolitique ? '●' : '○', 
        style: 'tableCell',
        alignment: 'center',
        fontSize: 14,
        color: event.validationPolitique ? '#16a34a' : '#e5e7eb'
      },
      { 
        text: event.validParDateClef ? '●' : '○', 
        style: 'tableCell', 
        alignment: 'center',
        fontSize: 14,
        color: event.validParDateClef ? '#2563eb' : '#e5e7eb'
      }
    ]);
  });

  // Définition du document PDF
  const docDefinition: any = {
    pageSize: 'A4',
    pageOrientation: 'landscape',
    pageMargins: [40, 60, 40, 60],
    
    header: (currentPage: number, pageCount: number) => {
      return {
        text: `Page ${currentPage} / ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#666',
        margin: [0, 20, 0, 0]
      };
    },

    footer: (_currentPage: number, _pageCount: number) => {
      return {
        text: 'Ville de Dunkerque - Calendrier des Événements',
        alignment: 'center',
        fontSize: 8,
        color: '#666',
        margin: [0, 0, 0, 20]
      };
    },

    content: [
      ...headerContent,
      {
        table: {
          headerRows: 1,
          widths: [40, '*', 65, 75, 65, 75, 35, 35, 35],
          body: tableBody
        },
        layout: {
          fillColor: (rowIndex: number) => {
            return rowIndex === 0 ? '#0F4C81' : (rowIndex % 2 === 0 ? '#F5F7FA' : null);
          },
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => '#E5E7EB',
          vLineColor: () => '#E5E7EB'
        }
      }
    ],

    styles: {
      header: {
        fontSize: 18,
        bold: true,
        alignment: 'center',
        margin: [0, 0, 0, 10]
      },
      subheader: {
        fontSize: 10,
        alignment: 'center',
        margin: [0, 0, 0, 5]
      },
      filter: {
        fontSize: 9,
        margin: [0, 2, 0, 2]
      },
      total: {
        fontSize: 10,
        bold: true,
        margin: [0, 5, 0, 10]
      },
      tableHeader: {
        bold: true,
        fontSize: 9,
        color: 'white',
        fillColor: '#0F4C81',
        alignment: 'center'
      },
      tableCell: {
        fontSize: 8,
        margin: [2, 2, 2, 2]
      }
    },

    defaultStyle: {
      font: 'Roboto'
    }
  };

  // Générer et télécharger le PDF
  const filename = `evenements${options.filterDateDebut ? `-${options.filterDateDebut}` : ''}${options.filterDateFin ? `-${options.filterDateFin}` : ''}.pdf`;
  pdfMake.createPdf(docDefinition).download(filename);
};
