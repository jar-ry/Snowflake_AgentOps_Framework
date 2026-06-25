"use client";

import * as React from "react";
import Avatar from "@mui/material/Avatar";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { TrendUpIcon } from "@phosphor-icons/react/dist/ssr/TrendUp";
import { TrendDownIcon } from "@phosphor-icons/react/dist/ssr/TrendDown";
import type { ApexOptions } from "apexcharts";

import { Chart } from "../core/chart";

export interface KpiDelta {
  value: number;
  suffix?: string;
  decimals?: number;
  goodWhenUp?: boolean;
}

export interface KpiCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  accent?: string;
  delta?: KpiDelta;
  spark?: number[];
  valueColor?: string;
}

export function KpiCard({ label, value, icon, accent = "var(--mui-palette-primary-main)", delta, spark, valueColor }: KpiCardProps) {
  const theme = useTheme();
  let deltaNode: React.ReactNode = null;
  if (delta && Number.isFinite(delta.value)) {
    const decimals = delta.decimals ?? 0;
    const goodWhenUp = delta.goodWhenUp ?? true;
    const rounded = Number(delta.value.toFixed(decimals));
    let color = "text.secondary";
    if (rounded > 0) color = goodWhenUp ? "success.main" : "error.main";
    else if (rounded < 0) color = goodWhenUp ? "error.main" : "success.main";
    const TrendIcon = rounded >= 0 ? TrendUpIcon : TrendDownIcon;
    const sign = rounded > 0 ? "+" : "";
    deltaNode = (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
        <TrendIcon color={`var(--mui-palette-${rounded > 0 ? (goodWhenUp ? "success" : "error") : rounded < 0 ? (goodWhenUp ? "error" : "success") : "text"}-main)`} fontSize="var(--icon-fontSize-sm)" />
        <Typography color={color} variant="body2">
          {sign}
          {rounded.toFixed(decimals)}
          {delta.suffix ?? ""}
        </Typography>
        <Typography color="text.secondary" variant="caption">
          vs prev
        </Typography>
      </Stack>
    );
  }

  const sparkOptions: ApexOptions | null = spark && spark.length > 1
    ? {
        chart: { sparkline: { enabled: true }, background: "transparent" },
        stroke: { width: 2, curve: "smooth" },
        fill: { type: "gradient", gradient: { opacityFrom: 0.4, opacityTo: 0 } },
        colors: [accent.startsWith("var(") ? theme.palette.primary.main : accent],
        tooltip: { enabled: false },
      }
    : null;

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start", justifyContent: "space-between" }}>
            <Stack spacing={1}>
              <Typography color="text.secondary" variant="overline">
                {label}
              </Typography>
              <Typography variant="h4" sx={valueColor ? { color: valueColor } : undefined}>{value}</Typography>
            </Stack>
            {icon ? (
              <Avatar sx={{ bgcolor: accent, height: 48, width: 48 }}>{icon}</Avatar>
            ) : null}
          </Stack>
          {deltaNode}
          {sparkOptions ? (
            <Chart type="area" height={48} width="100%" options={sparkOptions} series={[{ name: label, data: spark! }]} />
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}
