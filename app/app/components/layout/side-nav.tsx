"use client";

import * as React from "react";
import RouterLink from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";

import { navItems } from "./nav-config";

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SideNav() {
  const pathname = usePathname();

  return (
    <Box
      sx={{
        "--SideNav-background": "var(--mui-palette-neutral-950)",
        "--SideNav-color": "var(--mui-palette-common-white)",
        "--NavItem-color": "var(--mui-palette-neutral-300)",
        "--NavItem-hover-background": "rgba(255, 255, 255, 0.04)",
        "--NavItem-active-background": "var(--mui-palette-primary-main)",
        "--NavItem-active-color": "var(--mui-palette-primary-contrastText)",
        "--NavItem-icon-color": "var(--mui-palette-neutral-400)",
        "--NavItem-icon-active-color": "var(--mui-palette-primary-contrastText)",
        bgcolor: "var(--SideNav-background)",
        color: "var(--SideNav-color)",
        display: { xs: "none", lg: "flex" },
        flexDirection: "column",
        height: "100%",
        left: 0,
        maxWidth: "100%",
        position: "fixed",
        scrollbarWidth: "none",
        top: 0,
        width: "var(--SideNav-width)",
        zIndex: "var(--SideNav-zIndex)",
        "&::-webkit-scrollbar": { display: "none" },
      }}
    >
      <Stack spacing={2} sx={{ p: 3 }}>
        <Box component={RouterLink} href="/" sx={{ display: "inline-flex", textDecoration: "none" }}>
          <Stack spacing={0}>
            <Typography color="var(--mui-palette-common-white)" variant="h6" sx={{ lineHeight: 1.2 }}>
              AgentOps
            </Typography>
            <Typography color="var(--mui-palette-neutral-400)" variant="caption">
              Monitoring
            </Typography>
          </Stack>
        </Box>
      </Stack>
      <Divider sx={{ borderColor: "var(--mui-palette-neutral-700)" }} />
      <Box component="nav" sx={{ flex: "1 1 auto", p: "12px" }}>
        <Stack component="ul" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
          {navItems.map((item) => {
            const active = isActive(item.href, pathname);
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <Box
                  component={RouterLink}
                  href={item.href}
                  sx={{
                    alignItems: "center",
                    borderRadius: 1,
                    color: active ? "var(--NavItem-active-color)" : "var(--NavItem-color)",
                    bgcolor: active ? "var(--NavItem-active-background)" : "transparent",
                    cursor: "pointer",
                    display: "flex",
                    gap: 1,
                    p: "8px 16px",
                    textDecoration: "none",
                    "&:hover": { bgcolor: active ? "var(--NavItem-active-background)" : "var(--NavItem-hover-background)" },
                  }}
                >
                  <Icon
                    fontSize="var(--icon-fontSize-md)"
                    weight={active ? "fill" : undefined}
                    color={active ? "var(--NavItem-icon-active-color)" : "var(--NavItem-icon-color)"}
                  />
                  <Typography component="span" sx={{ color: "inherit", fontSize: "0.875rem", fontWeight: 500, lineHeight: "28px" }}>
                    {item.title}
                  </Typography>
                </Box>
              </li>
            );
          })}
        </Stack>
      </Box>
      <Divider sx={{ borderColor: "var(--mui-palette-neutral-700)" }} />
      <Stack spacing={1} sx={{ p: "16px 24px" }}>
        <Typography color="var(--mui-palette-neutral-400)" variant="caption">
          Snowflake AgentOps Framework
        </Typography>
      </Stack>
    </Box>
  );
}
