"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CardHeader from "@mui/material/CardHeader";
import { useTheme } from "@mui/material/styles";
import type { ApexOptions } from "apexcharts";

import { Chart } from "../core/chart";

export interface ValueFormat {
  prefix?: string;
  suffix?: string;
  decimals?: number;
  divide?: number;
}

function makeFormatter(fmt?: ValueFormat) {
  const prefix = fmt?.prefix ?? "";
  const suffix = fmt?.suffix ?? "";
  const decimals = fmt?.decimals ?? 0;
  const divide = fmt?.divide ?? 1;
  return (val: number) => {
    if (val == null || !Number.isFinite(val)) return "";
    const n = divide !== 1 ? val / divide : val;
    return `${prefix}${n.toFixed(decimals)}${suffix}`;
  };
}

export interface LineSeries {
  name: string;
  data: (number | null)[];
  dashed?: boolean;
}

export interface LineChartCardProps {
  title: string;
  subheader?: string;
  action?: React.ReactNode;
  categories: string[];
  series: LineSeries[];
  format?: ValueFormat;
  threshold?: { value: number; label?: string };
  height?: number;
  yMin?: number;
  yMax?: number;
  /**
   * Set for irregular / discrete time series (e.g. eval runs that don't occur
   * every day). Uses a real datetime x-axis, plots each series through only its
   * actual points (gaps no longer break the line), draws straight segments
   * instead of an overshooting spline, and shows a marker per data point.
   */
  sparse?: boolean;
  /**
   * When provided, data points become clickable and this is called with the
   * clicked point's date as `YYYY-MM-DD`. Enables drill-down (e.g. click a dip
   * to filter a table to that day). Requires a client component to pass it.
   */
  onPointClick?: (isoDate: string) => void;
  /**
   * Changing this value remounts the chart. Needed when a click on the chart
   * drives a soft navigation: ApexCharts' incremental update path drops the
   * x/y axis label groups on re-render, leaving an axis-less plot.
   */
  redrawKey?: string;
}

export function LineChartCard({ title, subheader, action, categories, series, format, threshold, height = 320, yMin, yMax, sparse = false, onPointClick, redrawKey }: LineChartCardProps) {
  const theme = useTheme();
  const palette = [
    theme.palette.primary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.secondary.main,
  ];
  const fmt = makeFormatter(format);

  // For sparse series, ApexCharts (no connectNulls support) breaks the line at
  // every null. Instead emit per-series {x,y} points (nulls dropped) on a real
  // time axis so each line is continuous through its own actual eval points.
  const toTime = (d: string) => new Date(`${d}T00:00:00`).getTime();
  const chartSeries = sparse
    ? series.map((s) => ({
        name: s.name,
        data: categories
          .map((c, i) => ({ x: toTime(c), y: s.data[i] }))
          .filter((p) => p.y != null && Number.isFinite(p.y as number)),
      }))
    : series.map((s) => ({ name: s.name, data: s.data }));

  // Resolve the date of a clicked point. In sparse mode points are {x: epoch, y},
  // so the date travels with the point; otherwise fall back to the category.
  const resolveClickedDate = (seriesIndex: number, dataPointIndex: number): string | null => {
    if (dataPointIndex == null || dataPointIndex < 0) return null;
    if (sparse) {
      const point = (chartSeries as { data: { x: number; y: number | null }[] }[])[seriesIndex]?.data?.[dataPointIndex];
      if (!point) return null;
      const d = new Date(point.x);
      const pad = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }
    return categories[dataPointIndex] ?? null;
  };

  const clickEvents = onPointClick
    ? {
        markerClick: (
          _e: unknown,
          _ctx: unknown,
          { seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number },
        ) => {
          const iso = resolveClickedDate(seriesIndex, dataPointIndex);
          if (iso) onPointClick(iso);
        },
        dataPointSelection: (
          _e: unknown,
          _ctx: unknown,
          { seriesIndex, dataPointIndex }: { seriesIndex: number; dataPointIndex: number },
        ) => {
          const iso = resolveClickedDate(seriesIndex, dataPointIndex);
          if (iso) onPointClick(iso);
        },
      }
    : undefined;

  const options: ApexOptions = {
    chart: {
      background: "transparent",
      toolbar: { show: false },
      zoom: { enabled: false },
      ...(clickEvents ? { events: clickEvents } : {}),
    },
    theme: { mode: "light" },
    colors: palette,
    stroke: { width: 3, curve: sparse ? "straight" : "smooth", dashArray: series.map((s) => (s.dashed ? 5 : 0)) },
    markers: sparse
      ? { size: 5, strokeWidth: 0, hover: { size: 7 } }
      : { size: onPointClick ? 4 : 0, strokeWidth: 0, hover: { size: onPointClick ? 6 : 0 } },
    dataLabels: { enabled: false },
    legend: { show: series.length > 1, position: "top", horizontalAlign: "right" },
    grid: { borderColor: theme.palette.divider, strokeDashArray: 2 },
    xaxis: sparse
      ? {
          type: "datetime",
          axisBorder: { color: theme.palette.divider },
          axisTicks: { color: theme.palette.divider },
          labels: { style: { colors: theme.palette.text.secondary }, datetimeUTC: false, format: "dd MMM" },
          tooltip: { enabled: false },
        }
      : {
          categories,
          axisBorder: { color: theme.palette.divider },
          axisTicks: { color: theme.palette.divider },
          labels: { style: { colors: theme.palette.text.secondary }, rotate: -45, rotateAlways: false, hideOverlappingLabels: true },
          tooltip: { enabled: false },
        },
    yaxis: { min: yMin, max: yMax, labels: { formatter: fmt, style: { colors: theme.palette.text.secondary } } },
    tooltip: sparse ? { x: { format: "dd MMM yyyy" }, y: { formatter: fmt } } : { y: { formatter: fmt } },
    annotations: threshold
      ? {
          yaxis: [
            {
              y: threshold.value,
              borderColor: theme.palette.error.main,
              strokeDashArray: 4,
              label: {
                text: threshold.label ?? `Threshold ${fmt(threshold.value)}`,
                style: { color: "#fff", background: theme.palette.error.main },
              },
            },
          ],
        }
      : undefined,
  };

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} action={action} />
      <CardContent>
        <Chart key={redrawKey} type="line" height={height} width="100%" options={options} series={chartSeries} />
      </CardContent>
    </Card>
  );
}

export interface BarChartCardProps {
  title: string;
  subheader?: string;
  action?: React.ReactNode;
  categories: string[];
  data: number[];
  seriesName?: string;
  format?: ValueFormat;
  anomalyIndices?: number[];
  baseline?: { value: number; label?: string };
  height?: number;
}

export function BarChartCard({ title, subheader, action, categories, data, seriesName = "Value", format, anomalyIndices = [], baseline, height = 320 }: BarChartCardProps) {
  const theme = useTheme();
  const fmt = makeFormatter(format);
  const anomalySet = new Set(anomalyIndices);
  const points = data.map((y, i) => (anomalySet.has(i) ? { x: categories[i], y, fillColor: theme.palette.error.main } : { x: categories[i], y }));

  const options: ApexOptions = {
    chart: { background: "transparent", toolbar: { show: false } },
    theme: { mode: "light" },
    colors: [theme.palette.primary.main],
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 4 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: { borderColor: theme.palette.divider, strokeDashArray: 2 },
    xaxis: {
      type: "category",
      axisBorder: { color: theme.palette.divider },
      axisTicks: { color: theme.palette.divider },
      labels: { style: { colors: theme.palette.text.secondary }, rotate: -45, rotateAlways: false, hideOverlappingLabels: true },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { formatter: fmt, style: { colors: theme.palette.text.secondary } } },
    tooltip: { y: { formatter: fmt } },
    annotations: baseline
      ? {
          yaxis: [
            {
              y: baseline.value,
              borderColor: theme.palette.warning.main,
              strokeDashArray: 4,
              label: { text: baseline.label ?? `Baseline ${fmt(baseline.value)}`, style: { color: "#fff", background: theme.palette.warning.main } },
            },
          ],
        }
      : undefined,
  };

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} action={action} />
      <CardContent>
        <Chart type="bar" height={height} width="100%" options={options} series={[{ name: seriesName, data: points as never }]} />
      </CardContent>
    </Card>
  );
}

export interface StackedBarChartCardProps {
  title: string;
  subheader?: string;
  action?: React.ReactNode;
  categories: string[];
  series: { name: string; data: number[] }[];
  format?: ValueFormat;
  height?: number;
}

export function StackedBarChartCard({ title, subheader, action, categories, series, format, height = 320 }: StackedBarChartCardProps) {
  const theme = useTheme();
  const fmt = makeFormatter(format);
  const palette = [theme.palette.primary.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.info.main, theme.palette.error.main, theme.palette.secondary.main];

  const options: ApexOptions = {
    chart: { background: "transparent", stacked: true, toolbar: { show: false } },
    theme: { mode: "light" },
    colors: palette,
    plotOptions: { bar: { columnWidth: "55%", borderRadius: 4 } },
    dataLabels: { enabled: false },
    legend: { show: true, position: "top", horizontalAlign: "right" },
    grid: { borderColor: theme.palette.divider, strokeDashArray: 2 },
    xaxis: {
      categories,
      axisBorder: { color: theme.palette.divider },
      axisTicks: { color: theme.palette.divider },
      labels: { style: { colors: theme.palette.text.secondary }, rotate: -45, rotateAlways: false, hideOverlappingLabels: true },
      tooltip: { enabled: false },
    },
    yaxis: { labels: { formatter: fmt, style: { colors: theme.palette.text.secondary } } },
    tooltip: { y: { formatter: fmt } },
  };

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} action={action} />
      <CardContent>
        <Chart type="bar" height={height} width="100%" options={options} series={series} />
      </CardContent>
    </Card>
  );
}

export interface DonutCardProps {
  title: string;
  subheader?: string;
  labels: string[];
  series: number[];
  format?: ValueFormat;
  height?: number;
}

export function DonutCard({ title, subheader, labels, series, format, height = 300 }: DonutCardProps) {
  const theme = useTheme();
  const fmt = makeFormatter(format);
  const palette = [theme.palette.primary.main, theme.palette.success.main, theme.palette.warning.main, theme.palette.info.main, theme.palette.error.main, theme.palette.secondary.main];

  const options: ApexOptions = {
    chart: { background: "transparent" },
    theme: { mode: "light" },
    colors: palette,
    labels,
    legend: { position: "bottom" },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { y: { formatter: fmt } },
  };

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} />
      <CardContent>
        <Chart type="donut" height={height} width="100%" options={options} series={series} />
      </CardContent>
    </Card>
  );
}
