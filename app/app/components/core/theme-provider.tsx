"use client";

import * as React from "react";
import CssBaseline from "@mui/material/CssBaseline";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";

import { createAppTheme } from "../../theme";
import EmotionCache from "./emotion-cache";

const theme = createAppTheme();

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <EmotionCache options={{ key: "mui" }}>
      <MuiThemeProvider theme={theme} defaultMode="light" disableTransitionOnChange>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </EmotionCache>
  );
}
