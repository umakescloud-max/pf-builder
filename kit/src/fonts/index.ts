// Fonts are bundled via @fontsource at the app level, not here, so a demo
// only ships the two typefaces its brief actually uses instead of all
// eleven. An archetype's main.tsx imports exactly:
//
//   import "@fontsource/<package-name>/400.css";
//   import "@fontsource/<package-name>/600.css";
//
// for each of design.typefaces.heading and design.typefaces.body. The
// package name for each bundled display name is listed here so the
// builder (or a human implementing a starter by hand) never has to guess:

export const FONTSOURCE_PACKAGE: Record<string, string> = {
  "IBM Plex Sans": "ibm-plex-sans",
  "Public Sans": "public-sans",
  "Atkinson Hyperlegible": "atkinson-hyperlegible",
  Figtree: "figtree",
  "Instrument Sans": "instrument-sans",
  Manrope: "manrope",
  "Work Sans": "work-sans",
  "Source Serif 4": "source-serif-4",
  Newsreader: "newsreader",
  Spectral: "spectral",
  Fraunces: "fraunces",
};

export { FONT_STACKS, BUNDLED_FONTS } from "../theme/tokens";
