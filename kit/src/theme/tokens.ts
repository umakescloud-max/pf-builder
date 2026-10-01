export interface Palette {
  surface: string;
  ink: string;
  primary: string;
  accent: string;
  muted: string;
}

export interface Typefaces {
  heading: string;
  body: string;
}

// The complete bundled font list (see KIT.md). A brief's design.typefaces
// may only name one of these for `heading` and `body`.
export const BUNDLED_FONTS = [
  "IBM Plex Sans",
  "Public Sans",
  "Atkinson Hyperlegible",
  "Figtree",
  "Instrument Sans",
  "Manrope",
  "Work Sans",
  "Source Serif 4",
  "Newsreader",
  "Spectral",
  "Fraunces",
] as const;

export const FONT_STACKS: Record<(typeof BUNDLED_FONTS)[number], string> = {
  "IBM Plex Sans": "'IBM Plex Sans', sans-serif",
  "Public Sans": "'Public Sans', sans-serif",
  "Atkinson Hyperlegible": "'Atkinson Hyperlegible', sans-serif",
  Figtree: "'Figtree', sans-serif",
  "Instrument Sans": "'Instrument Sans', sans-serif",
  Manrope: "'Manrope', sans-serif",
  "Work Sans": "'Work Sans', sans-serif",
  "Source Serif 4": "'Source Serif 4', serif",
  Newsreader: "'Newsreader', serif",
  Spectral: "'Spectral', serif",
  Fraunces: "'Fraunces', serif",
};

/**
 * Returns a CSS custom-property declaration block for :root, consumed by
 * every kit component via var(--pf-*). An app sets this once in its entry
 * point from its brief's design.palette / design.typefaces.
 */
export function cssVariablesFor(palette: Palette, typefaces: Typefaces): string {
  const headingStack = FONT_STACKS[typefaces.heading as keyof typeof FONT_STACKS] ?? typefaces.heading;
  const bodyStack = FONT_STACKS[typefaces.body as keyof typeof FONT_STACKS] ?? typefaces.body;
  return `:root {
  --pf-surface: ${palette.surface};
  --pf-ink: ${palette.ink};
  --pf-primary: ${palette.primary};
  --pf-accent: ${palette.accent};
  --pf-muted: ${palette.muted};
  --pf-font-heading: ${headingStack};
  --pf-font-body: ${bodyStack};
}`;
}
