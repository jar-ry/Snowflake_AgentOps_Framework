import "@mui/material/styles";

// Allow a custom `neutral` color scale on the MUI palette (used by the side nav).
declare module "@mui/material/styles" {
  interface Palette {
    neutral: Record<number, string>;
  }
  interface PaletteOptions {
    neutral?: Record<number, string>;
  }
}
