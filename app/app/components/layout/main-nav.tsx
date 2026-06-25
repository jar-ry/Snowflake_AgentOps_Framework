"use client";

import * as React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import IconButton from "@mui/material/IconButton";
import Drawer from "@mui/material/Drawer";
import Typography from "@mui/material/Typography";
import { ListIcon } from "@phosphor-icons/react/dist/ssr/List";

import { navItems } from "./nav-config";
import { EnvironmentFilter } from "../environment-filter";

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ envOptions = [] }: { envOptions?: string[] }) {
  const pathname = usePathname();
  const [openNav, setOpenNav] = React.useState(false);

  return (
    <>
      <Box
        component="header"
        sx={{
          borderBottom: "1px solid var(--mui-palette-divider)",
          bgcolor: "var(--mui-palette-background-paper)",
          position: "sticky",
          top: 0,
          zIndex: "var(--MainNav-zIndex)",
        }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: "center", justifyContent: "space-between", minHeight: "var(--MainNav-height)", px: 2 }}
        >
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <IconButton onClick={() => setOpenNav(true)} sx={{ display: { lg: "none" } }}>
              <ListIcon />
            </IconButton>
            <Typography variant="subtitle1" sx={{ display: { xs: "none", sm: "block" } }}>
              Agent &amp; Semantic View Monitoring
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <React.Suspense fallback={null}>
              <EnvironmentFilter options={envOptions} />
            </React.Suspense>
          </Stack>
        </Stack>
      </Box>

      <Drawer
        open={openNav}
        onClose={() => setOpenNav(false)}
        PaperProps={{
          sx: {
            bgcolor: "var(--mui-palette-neutral-950)",
            color: "var(--mui-palette-common-white)",
            width: "var(--MobileNav-width)",
            p: 2,
          },
        }}
      >
        <Typography variant="h6" sx={{ px: 1, py: 2 }}>
          AgentOps Monitoring
        </Typography>
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {navItems.map((item) => {
            const active = isActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Box
                  component={RouterLink}
                  href={item.href}
                  onClick={() => setOpenNav(false)}
                  sx={{
                    alignItems: "center",
                    borderRadius: 1,
                    color: active ? "var(--mui-palette-primary-contrastText)" : "var(--mui-palette-neutral-300)",
                    bgcolor: active ? "var(--mui-palette-primary-main)" : "transparent",
                    display: "flex",
                    gap: 1,
                    p: "8px 16px",
                    textDecoration: "none",
                  }}
                >
                  <Icon fontSize="var(--icon-fontSize-md)" weight={active ? "fill" : undefined} />
                  <Typography component="span" sx={{ color: "inherit", fontSize: "0.875rem", fontWeight: 500 }}>
                    {item.title}
                  </Typography>
                </Box>
              </li>
            );
          })}
        </Stack>
      </Drawer>
    </>
  );
}
