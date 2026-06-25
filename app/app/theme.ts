import { createTheme as muiCreateTheme } from "@mui/material/styles";
import { paperClasses } from "@mui/material/Paper";

// --- Devias Kit color scales (ported from material-kit-react) ---
const neonBlue = {
  50: "#ecf0ff", 100: "#dde3ff", 200: "#c2cbff", 300: "#9ca7ff", 400: "#7578ff",
  500: "#635bff", 600: "#4e36f5", 700: "#432ad8", 800: "#3725ae", 900: "#302689", 950: "#1e1650",
};
const stormGrey = {
  50: "#f9fafb", 100: "#f1f1f4", 200: "#dcdfe4", 300: "#b3b9c6", 400: "#8a94a6",
  500: "#667085", 600: "#565e73", 700: "#434a60", 800: "#313749", 900: "#212636", 950: "#121621",
};
const kepple = {
  50: "#f0fdfa", 100: "#ccfbef", 200: "#9af5e1", 300: "#5fe9ce", 400: "#2ed3b8",
  500: "#15b79f", 600: "#0e9382", 700: "#107569", 800: "#115e56", 900: "#134e48", 950: "#042f2c",
};
const redOrange = {
  50: "#fef3f2", 100: "#fee4e2", 200: "#ffcdc9", 300: "#fdaaa4", 400: "#f97970",
  500: "#f04438", 600: "#de3024", 700: "#bb241a", 800: "#9a221a", 900: "#80231c", 950: "#460d09",
};
const california = {
  50: "#fffaea", 100: "#fff3c6", 200: "#ffe587", 300: "#ffd049", 400: "#ffbb1f",
  500: "#fb9c0c", 600: "#de7101", 700: "#b84d05", 800: "#953b0b", 900: "#7b310c", 950: "#471701",
};
const shakespeare = {
  50: "#ecfdff", 100: "#cff7fe", 200: "#a4eefd", 300: "#66e0fa", 400: "#10bee8",
  500: "#04aad6", 600: "#0787b3", 700: "#0d6d91", 800: "#145876", 900: "#154964", 950: "#082f44",
};

const typography = {
  fontFamily:
    '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
  body1: { fontSize: "1rem", fontWeight: 400, lineHeight: 1.5 },
  body2: { fontSize: "0.875rem", fontWeight: 400, lineHeight: 1.57 },
  button: { fontWeight: 500 },
  caption: { fontSize: "0.75rem", fontWeight: 400, lineHeight: 1.66 },
  subtitle1: { fontSize: "1rem", fontWeight: 500, lineHeight: 1.57 },
  subtitle2: { fontSize: "0.875rem", fontWeight: 500, lineHeight: 1.57 },
  overline: { fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.5px", lineHeight: 2.5, textTransform: "uppercase" as const },
  h1: { fontSize: "3.5rem", fontWeight: 500, lineHeight: 1.2 },
  h2: { fontSize: "3rem", fontWeight: 500, lineHeight: 1.2 },
  h3: { fontSize: "2.25rem", fontWeight: 500, lineHeight: 1.2 },
  h4: { fontSize: "2rem", fontWeight: 500, lineHeight: 1.2 },
  h5: { fontSize: "1.5rem", fontWeight: 500, lineHeight: 1.2 },
  h6: { fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.2 },
};

export function createAppTheme() {
  return muiCreateTheme({
    breakpoints: { values: { xs: 0, sm: 600, md: 900, lg: 1200, xl: 1440 } },
    cssVariables: { colorSchemeSelector: "class" },
    shape: { borderRadius: 8 },
    typography,
    colorSchemes: {
      light: {
        palette: {
          primary: { ...neonBlue, light: neonBlue[400], main: neonBlue[500], dark: neonBlue[600], contrastText: "#ffffff" },
          secondary: { ...stormGrey, light: stormGrey[600], main: stormGrey[700], dark: stormGrey[800], contrastText: "#ffffff" },
          success: { ...kepple, light: kepple[400], main: kepple[500], dark: kepple[600], contrastText: "#ffffff" },
          error: { ...redOrange, light: redOrange[400], main: redOrange[500], dark: redOrange[600], contrastText: "#ffffff" },
          warning: { ...california, light: california[400], main: california[500], dark: california[600], contrastText: "#ffffff" },
          info: { ...shakespeare, light: shakespeare[400], main: shakespeare[500], dark: shakespeare[600], contrastText: "#ffffff" },
          neutral: { ...stormGrey },
          common: { black: "#000000", white: "#ffffff" },
          divider: stormGrey[200],
          background: { default: "#f8f9fc", paper: "#ffffff" },
          text: { primary: stormGrey[900], secondary: stormGrey[500], disabled: stormGrey[400] },
        },
      },
    },
    components: {
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: "20px",
            [`&.${paperClasses.elevation1}`]: {
              boxShadow: "0 5px 22px 0 rgba(0, 0, 0, 0.04), 0 0 0 1px rgba(0, 0, 0, 0.06)",
            },
          },
        },
      },
      MuiCardHeader: {
        defaultProps: { titleTypographyProps: { variant: "h6" }, subheaderTypographyProps: { variant: "body2" } },
        styleOverrides: { root: { padding: "24px 24px 8px" } },
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: "12px", textTransform: "none" } },
      },
    },
  });
}
