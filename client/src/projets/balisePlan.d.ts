/** Éditeur de plan repris de l'artefact Balise (JavaScript non typé, voir balisePlan.js). */
export const BalisePlan: {
  mount(racine: HTMLElement, contexte: Record<string, unknown>): void;
  unmount(): void;
  mountedFor(): string | null;
  staticSVG(document: unknown): string;
  counts(document: unknown): Record<string, number>;
  CAT: Record<string, { l: string; a?: string }>;
};
