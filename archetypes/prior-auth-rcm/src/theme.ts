import type { Palette, Typefaces } from "@kit";

// Starter placeholder only — a real build replaces this with the brief's
// design.palette / design.typefaces. The builder may never touch this file
// once a brief has been applied (see builder.md's "theme" constraint).
export const theme: { palette: Palette; typefaces: Typefaces } = {
  palette: {
    surface: "#FFFFFF",
    ink: "#1A1A1A",
    primary: "#2B2B2B",
    accent: "#8A8A8A",
    muted: "#6B6B6B",
  },
  typefaces: {
    heading: "Public Sans",
    body: "Public Sans",
  },
};
