import * as React from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";
import GlobalStyles from "@mui/material/GlobalStyles";

import { SideNav } from "./side-nav";
import { MainNav } from "./main-nav";

export function DashboardShell({ children, envOptions = [] }: { children: React.ReactNode; envOptions?: string[] }) {
  return (
    <>
      <GlobalStyles
        styles={{
          body: {
            "--MainNav-height": "56px",
            "--MainNav-zIndex": 1000,
            "--SideNav-width": "260px",
            "--SideNav-zIndex": 1100,
            "--MobileNav-width": "300px",
            "--MobileNav-zIndex": 1100,
          },
        }}
      />
      <Box sx={{ bgcolor: "var(--mui-palette-background-default)", display: "flex", flexDirection: "column", position: "relative", minHeight: "100%" }}>
        <SideNav />
        <Box sx={{ display: "flex", flex: "1 1 auto", flexDirection: "column", pl: { lg: "var(--SideNav-width)" } }}>
          <MainNav envOptions={envOptions} />
          <Box component="main" sx={{ flex: "1 1 auto" }}>
            <Container maxWidth="xl" sx={{ py: "32px" }}>
              {children}
            </Container>
          </Box>
        </Box>
      </Box>
    </>
  );
}
