import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

// Internal helper to safely initialize pdfMake fonts inside server function handlers
function ensurePdfMakeFonts() {
  if (!(pdfMake as any).vfs && (pdfFonts as any)?.pdfMake?.vfs) {
    (pdfMake as any).vfs = (pdfFonts as any).pdfMake.vfs;
  }
}

const EventSchema = z.object({
  id: z.string(),
  nom: z.string().nullable(),
  name: z.string(),
  lieu: z.string().nullable(),
  quartier: z.string().nullable(),
  nature: z.string().nullable(),
  type: z.string().nullable(),
  organisateur: z.string().nullable(),
  pilote: z.union([z.string(), z.array(z.string())]).nullable(),
  statut: z.string().nullable(),
  validationTechnique: z.boolean().nullable(),
  validationPolitique: z.boolean().nullable(),
  validParDateClef: z.boolean().nullable(),
  dateDeDbut: z.string().nullable(),
  dateDeFin: z.string().nullable(),
});

export const generateDayEventsPdf = createServerFn({ method: 'POST' })
  .validator(z.object({
    date: z.string(),
    events: z.array(EventSchema),
  }))
  .handler(async ({ data }) => {
    ensurePdfMakeFonts();
    const { date, events } = data;

    // Parse date for header — use UTC to avoid timezone shifts with YYYY-MM-DD input
    const parts = date.split('-').map(Number);
    const eventDate = new Date(parts[0], parts[1] - 1, parts[2]);
    const dateString = eventDate.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Build PDF document definition
    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 70, 40, 60],
      
      // Header on every page (simplified without logos)
      header: (_currentPage: number, _pageCount: number) => {
        return {
          stack: [
            {
              columns: [
                {
                  text: 'Ville de Dunkerque - Calendrier des événements',
                  style: 'headerText',
                  margin: [40, 20, 0, 0],
                },
                {
                  text: `Page ${_currentPage} / ${_pageCount}`,
                  alignment: 'right',
                  style: 'pageNumber',
                  margin: [0, 20, 40, 0],
                },
              ],
            },
            // Ligne de séparation
            {
              canvas: [
                {
                  type: 'line',
                  x1: 40,
                  y1: 0,
                  x2: 555,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: '#e5e7eb',
                },
              ],
              margin: [0, 5, 0, 0],
            },
          ],
        };
      },

      // Footer on every page
      footer: () => {
        return {
          text: `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
          alignment: 'center',
          style: 'footer',
          margin: [0, 20, 0, 0],
        };
      },

      content: [
        // Title banner
        {
          stack: [
            { text: `Événements du ${dateString}`, style: 'title' },
            { text: `${events.length} manifestation(s) au programme`, style: 'subtitle', margin: [0, 4, 0, 0] },
          ],
        },

        // Legend
        {
          margin: [0, 10, 0, 15],
          table: {
            widths: ['auto', '*', 'auto', '*'],
            body: [
              [
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#9333ea'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé technique et politique',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 15, 0]
                },
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#22c55e'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé technique uniquement',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 0, 0]
                }
              ],
              [
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#3b82f6'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé politique uniquement',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 15, 0]
                },
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#ef4444'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Non validé',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 0, 0]
                }
              ]
            ]
          },
          layout: 'noBorders'
        },

        // Events list
        ...events.map((event, index) => {
          const hasTechnique = event.validationTechnique === true;
          const hasPolitique = event.validationPolitique === true;
          const hasDateClef = event.validParDateClef === true;
          
          // Determine status color
          let statusColor = '#ef4444'; // Red - no validation
          if (hasTechnique && hasPolitique) statusColor = '#9333ea'; // Purple - both
          else if (hasTechnique) statusColor = '#22c55e'; // Green - tech only
          else if (hasPolitique) statusColor = '#3b82f6'; // Blue - political only

          const piloteText = event.pilote 
            ? Array.isArray(event.pilote) 
              ? event.pilote.join(', ') 
              : event.pilote
            : null;

          const startDateStr = event.dateDeDbut ? new Date(event.dateDeDbut).toLocaleDateString('fr-FR') : null;
          const endDateStr = event.dateDeFin ? new Date(event.dateDeFin).toLocaleDateString('fr-FR') : null;

          return {
            unbreakable: true, // Prevents card from splitting across pages
            stack: [
              {
                table: {
                  widths: ['*'],
                  dontBreakRows: true,
                  body: [
                    [
                      {
                        stack: [
                          // Header with status indicator and title
                          {
                            columns: [
                              {
                                canvas: [
                                  {
                                    type: 'ellipse',
                                    x: 6,
                                    y: 6,
                                    r1: 6,
                                    r2: 6,
                                    color: statusColor,
                                  },
                                ],
                                width: 20,
                              },
                              {
                                stack: [
                                  {
                                    text: event.nom || event.name,
                                    style: 'eventTitle',
                                  },
                                  event.organisateur ? {
                                    text: `Organisé par : ${event.organisateur}`,
                                    style: 'organizer',
                                    margin: [0, 2, 0, 0],
                                  } : null,
                                ].filter(Boolean),
                                width: '*',
                              },
                              {
                                text: event.statut || '—',
                                style: 'statusBadge',
                                alignment: 'right',
                              },
                            ],
                            margin: [0, 0, 0, 8],
                          },

                          // Details grid
                          {
                            table: {
                              widths: ['auto', '*'],
                              body: [
                                startDateStr ? [
                                  { text: '📅 Dates :', style: 'detailLabel' },
                                  { text: endDateStr && endDateStr !== startDateStr ? `Du ${startDateStr} au ${endDateStr}` : startDateStr, style: 'detailValue' },
                                ] : null,
                                event.lieu ? [
                                  { text: '📍 Lieu :', style: 'detailLabel' },
                                  { text: event.lieu, style: 'detailValue' },
                                ] : null,
                                event.quartier ? [
                                  { text: '🏘️ Quartier :', style: 'detailLabel' },
                                  { text: event.quartier, style: 'detailValue' },
                                ] : null,
                                event.nature ? [
                                  { text: '🎯 Nature :', style: 'detailLabel' },
                                  { text: event.nature, style: 'detailValue' },
                                ] : null,
                                event.type ? [
                                  { text: '📋 Type :', style: 'detailLabel' },
                                  { text: event.type, style: 'detailValue' },
                                ] : null,
                                piloteText ? [
                                  { text: '👤 Pilote :', style: 'detailLabel' },
                                  { text: piloteText, style: 'detailValue' },
                                ] : null,
                              ].filter(Boolean) as any,
                            },
                            layout: 'noBorders',
                            margin: [0, 0, 0, 8],
                          },

                          // Validation badges
                          {
                            columns: [
                              {
                                text: hasTechnique ? 'Validation Technique : OK' : 'Validation Technique : EN ATTENTE',
                                style: hasTechnique ? 'validationYes' : 'validationNo',
                              },
                              {
                                text: hasPolitique ? 'Validation Politique : OK' : 'Validation Politique : EN ATTENTE',
                                style: hasPolitique ? 'validationYes' : 'validationNo',
                                margin: [10, 0, 0, 0],
                              },
                              ...(hasDateClef ? [{
                                text: '📅 Date Clef',
                                style: 'dateClefBadge',
                                margin: [10, 0, 0, 0],
                              }] : []),
                            ],
                          },
                        ],
                        margin: 10,
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 1,
                  vLineWidth: () => 1,
                  hLineColor: () => '#e5e7eb',
                  vLineColor: () => '#e5e7eb',
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                },
              },
            ],
            margin: [0, 0, 0, index < events.length - 1 ? 12 : 0],
          };
        }),
      ],

      styles: {
        headerText: {
          fontSize: 10,
          color: '#6b7280',
        },
        headerTitle: {
          fontSize: 14,
          bold: true,
          color: '#1f2937',
        },
        headerSubtitle: {
          fontSize: 9,
          color: '#6b7280',
        },
        pageNumber: {
          fontSize: 9,
          color: '#6b7280',
          margin: [0, 5, 0, 0],
        },
        footer: {
          fontSize: 8,
          color: '#9ca3af',
          italics: true,
        },
        title: {
          fontSize: 20,
          bold: true,
          color: '#111827',
        },
        subtitle: {
          fontSize: 12,
          color: '#6b7280',
        },
        eventTitle: {
          fontSize: 13,
          bold: true,
          color: '#111827',
        },
        organizer: {
          fontSize: 9,
          color: '#6b7280',
        },
        statusBadge: {
          fontSize: 10,
          color: '#3b82f6',
          bold: true,
        },
        detailLabel: {
          fontSize: 9,
          color: '#6b7280',
          margin: [0, 2, 8, 2],
        },
        detailValue: {
          fontSize: 9,
          color: '#111827',
          bold: true,
          margin: [0, 2, 0, 2],
        },
        validationYes: {
          fontSize: 9,
          color: '#16a34a',
          bold: true,
        },
        validationNo: {
          fontSize: 9,
          color: '#dc2626',
          bold: true,
        },
        dateClefBadge: {
          fontSize: 9,
          color: '#2563eb',
          bold: true,
        },
      },
    };

    // Generate PDF and return as base64
    return new Promise<string>((resolve) => {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      pdfDocGenerator.getBase64((base64) => {
        resolve(base64);
      });
    });
  });

// Schema for conflicts PDF export
const ConflictDaySchema = z.object({
  date: z.string(),
  severity: z.enum(['none', 'moderate', 'high', 'critical']),
  events: z.array(z.object({
    id: z.string(),
    nom: z.string().nullable(),
    name: z.string(),
    lieu: z.string().nullable(),
    organisateur: z.string().nullable(),
    dateDeDbut: z.string().nullable(),
    dateDeFin: z.string().nullable(),
    statut: z.string().nullable(),
    validationTechnique: z.boolean().nullable(),
    validationPolitique: z.boolean().nullable(),
    validParDateClef: z.boolean().nullable(),
  })),
});

export const generateConflictsPdf = createServerFn({ method: 'POST' })
  .validator(z.object({
    conflictDays: z.array(ConflictDaySchema),
    includePast: z.boolean(),
  }))
  .handler(async ({ data }) => {
    ensurePdfMakeFonts();
    const { conflictDays, includePast } = data;

    // Helper pour vérifier si un événement est arbitré
    const estArbitre = (event: any) => event.validationTechnique === true && event.validationPolitique === true;

    // Ne compter que les événements NON arbitrés
    const totalConflictEvents = new Set(
      conflictDays.flatMap(day => 
        day.events.filter(e => !estArbitre(e)).map(e => e.id)
      )
    ).size;

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 70, 40, 60],

      header: (_currentPage: number, _pageCount: number) => {
        return {
          stack: [
            {
              columns: [
                {
                  text: 'Ville de Dunkerque - Rapport des conflits',
                  style: 'headerText',
                  margin: [40, 20, 0, 0],
                },
                {
                  text: `Page ${_currentPage} / ${_pageCount}`,
                  alignment: 'right',
                  style: 'pageNumber',
                  margin: [0, 20, 40, 0],
                },
              ],
            },
            // Ligne de séparation
            {
              canvas: [
                {
                  type: 'line',
                  x1: 40,
                  y1: 0,
                  x2: 555,
                  y2: 0,
                  lineWidth: 0.5,
                  lineColor: '#e5e7eb',
                },
              ],
              margin: [0, 5, 0, 0],
            },
          ],
        };
      },

      footer: () => {
        return {
          text: `Document généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
          alignment: 'center',
          style: 'footer',
          margin: [0, 20, 0, 0],
        };
      },

      content: [
        // Title & Summary KPI
        {
          stack: [
            { text: 'Rapport des Conflits de Calendrier', style: 'title' },
            { 
              text: `${conflictDays.length} jour(s) en conflit — ${totalConflictEvents} événement(s) à arbitrer${includePast ? ' (dates passées incluses)' : ' (dates futures uniquement)'}`, 
              style: 'subtitle', 
              margin: [0, 4, 0, 0] 
            },
          ],
        },

        // Legend
        {
          margin: [0, 10, 0, 15],
          table: {
            widths: ['auto', '*', 'auto', '*'],
            body: [
              [
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#9333ea'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé technique et politique',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 15, 0]
                },
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#22c55e'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé technique uniquement',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 0, 0]
                }
              ],
              [
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#3b82f6'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Validé politique uniquement',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 15, 0]
                },
                {
                  canvas: [{
                    type: 'ellipse',
                    x: 5,
                    y: 5,
                    r1: 4,
                    r2: 4,
                    color: '#ef4444'
                  }],
                  border: [false, false, false, false],
                  margin: [0, 0, 5, 0]
                },
                {
                  text: 'Non validé',
                  fontSize: 8,
                  color: '#6b7280',
                  border: [false, false, false, false],
                  margin: [0, 1, 0, 0]
                }
              ]
            ]
          },
          layout: 'noBorders'
        },

        // List of conflict days
        ...conflictDays.map((day, index) => {
          const parts = day.date.split('-').map(Number);
          const dayDate = new Date(parts[0], parts[1] - 1, parts[2]);
          const dateFormatted = dayDate.toLocaleDateString('fr-FR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          });

          let severityLabel = 'Modéré';
          let severityColor = '#fdab3d';
          if (day.severity === 'high') {
            severityLabel = 'Élevé';
            severityColor = '#e44258';
          } else if (day.severity === 'critical') {
            severityLabel = 'Critique';
            severityColor = '#bb3354';
          }

          return {
            unbreakable: true,
            stack: [
              {
                table: {
                  widths: ['*'],
                  dontBreakRows: true,
                  body: [
                    [
                      {
                        stack: [
                          // Header: Date & Severity Badge
                          {
                            columns: [
                              {
                                text: dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1),
                                style: 'dayHeaderTitle',
                              },
                              {
                                text: (() => {
                                  const aArbitrer = day.events.filter(e => !estArbitre(e)).length;
                                  return `${aArbitrer} à arbitrer sur ${day.events.length} événements (${severityLabel})`;
                                })(),
                                style: 'severityBadge',
                                color: severityColor,
                                alignment: 'right',
                              },
                            ],
                            margin: [0, 0, 0, 8],
                          },

                          // List of events on that day — separate arbitrated / to arbitrate
                          ...(() => {
                            const aArbitrer = day.events.filter(e => !(e.validationTechnique === true && e.validationPolitique === true));
                            const arbitres = day.events.filter(e => e.validationTechnique === true && e.validationPolitique === true);
                            
                            const allEvents = [...aArbitrer, ...arbitres];
                            
                            return allEvents.map((event) => {
                              const startDateStr = event.dateDeDbut ? new Date(event.dateDeDbut).toLocaleDateString('fr-FR') : '';
                              const endDateStr = event.dateDeFin ? new Date(event.dateDeFin).toLocaleDateString('fr-FR') : '';
                              const isMultiDay = startDateStr && endDateStr && startDateStr !== endDateStr;

                              const hasTech = event.validationTechnique === true;
                              const hasPol = event.validationPolitique === true;
                              const isArbitre = hasTech && hasPol;
                              const hasDateClef = event.validParDateClef === true;

                              return {
                                stack: [
                                  {
                                    columns: [
                                      {
                                        stack: [
                                          { 
                                            text: event.nom || event.name, 
                                            style: isArbitre ? 'eventTitleArbitre' : 'eventTitle' 
                                          },
                                          isArbitre ? { text: '→ Arbitré — ressources bloquées', style: 'arbitreLabel' } : null,
                                          event.lieu ? { text: `📍 ${event.lieu}`, style: 'eventSubDetail' } : null,
                                          event.organisateur ? { text: `👤 ${event.organisateur}`, style: 'eventSubDetail' } : null,
                                          isMultiDay ? { text: `📅 Du ${startDateStr} au ${endDateStr}`, style: 'eventSubDetail' } : null,
                                        ].filter(Boolean),
                                        width: '*',
                                      },
                                      {
                                        stack: [
                                          { text: event.statut || '—', style: 'statusBadge', alignment: 'right' },
                                          { 
                                            text: isArbitre ? 'Arbitré' : 'À arbitrer', 
                                            style: isArbitre ? 'valOk' : 'valPending', 
                                            alignment: 'right' 
                                          },
                                          ...(hasDateClef && isArbitre ? [{ 
                                            text: '📅 Date Clef', 
                                            style: 'dateClefSmall', 
                                            alignment: 'right',
                                            margin: [0, 2, 0, 0]
                                          }] : []),
                                        ],
                                        width: 100,
                                      },
                                    ],
                                    margin: [0, 4, 0, 4],
                                  },
                                ],
                              };
                            });
                          })(),
                        ],
                        margin: 10,
                      },
                    ],
                  ],
                },
                layout: {
                  hLineWidth: () => 1,
                  vLineWidth: () => 1,
                  hLineColor: () => '#e5e7eb',
                  vLineColor: () => '#e5e7eb',
                  paddingLeft: () => 0,
                  paddingRight: () => 0,
                  paddingTop: () => 0,
                  paddingBottom: () => 0,
                },
              },
            ],
            margin: [0, 0, 0, index < conflictDays.length - 1 ? 12 : 0],
          };
        }),
      ],

      styles: {
        headerTitle: { fontSize: 14, bold: true, color: '#1f2937' },
        headerSubtitle: { fontSize: 9, color: '#6b7280' },
        pageNumber: { fontSize: 9, color: '#6b7280', margin: [0, 5, 0, 0] },
        footer: { fontSize: 8, color: '#9ca3af', italics: true },
        title: { fontSize: 20, bold: true, color: '#111827' },
        subtitle: { fontSize: 12, color: '#6b7280' },
        dayHeaderTitle: { fontSize: 13, bold: true, color: '#111827' },
        severityBadge: { fontSize: 11, bold: true },
        eventTitle: { fontSize: 11, bold: true, color: '#1f2937' },
        eventTitleArbitre: { fontSize: 11, bold: true, color: '#6b7280' },
        arbitreLabel: { fontSize: 9, color: '#16a34a', italics: true, margin: [0, 1, 0, 0] },
        eventSubDetail: { fontSize: 9, color: '#6b7280', margin: [0, 1, 0, 0] },
        statusBadge: { fontSize: 9, color: '#3b82f6', bold: true },
        valOk: { fontSize: 9, color: '#16a34a', bold: true, margin: [0, 2, 0, 0] },
        valPending: { fontSize: 9, color: '#dc2626', bold: true, margin: [0, 2, 0, 0] },
        dateClefSmall: { fontSize: 8, color: '#2563eb', bold: true },
      },
    };

    return new Promise<string>((resolve) => {
      const pdfDocGenerator = pdfMake.createPdf(docDefinition);
      pdfDocGenerator.getBase64((base64) => {
        resolve(base64);
      });
    });
  });
