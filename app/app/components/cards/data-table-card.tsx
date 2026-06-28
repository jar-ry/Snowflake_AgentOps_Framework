"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Typography from "@mui/material/Typography";

import { InfoTip, AlertGuidance, QualityFlagGuidance, AccuracyGuidance } from "../mui-tooltips";

export type ColumnType = "text" | "number" | "severity" | "datetime" | "guidance-alert" | "guidance-quality" | "guidance-accuracy";

export interface ColumnDef {
  key: string;
  label: string;
  type?: ColumnType;
  align?: "left" | "right" | "center";
  headerInfo?: string;
  /** for guidance columns: which row field holds the lookup key (defaults to key) */
  guidanceField?: string;
}

export interface DataTableCardProps {
  title: string;
  subheader?: string;
  columns: ColumnDef[];
  rows: Record<string, unknown>[];
  pageSize?: number;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  emptyMessage?: string;
}

function severityColor(sev: string): "error" | "warning" | "info" | "success" | "default" {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL" || s === "FAIL" || s === "NEGATIVE") return "error";
  if (s === "WARNING" || s === "NEUTRAL") return "warning";
  if (s === "INFO") return "info";
  if (s === "PASS" || s === "HEALTHY" || s === "OK" || s === "POSITIVE") return "success";
  return "default";
}

// Lower number = more severe. Mirrors severityColor's tiers so sort order
// matches the chip colors. Unknown values sort last.
function severityRank(sev: string): number {
  const s = (sev || "").toUpperCase();
  if (s === "CRITICAL" || s === "FAIL" || s === "NEGATIVE") return 0;
  if (s === "WARNING" || s === "NEUTRAL") return 1;
  if (s === "INFO") return 2;
  if (s === "PASS" || s === "HEALTHY" || s === "OK" || s === "POSITIVE") return 3;
  return 99;
}

export function DataTableCard({
  title,
  subheader,
  columns,
  rows,
  pageSize,
  defaultSortKey,
  defaultSortDir = "desc",
  emptyMessage = "No data.",
}: DataTableCardProps) {
  const [orderBy, setOrderBy] = React.useState<string | null>(defaultSortKey ?? null);
  const [order, setOrder] = React.useState<"asc" | "desc">(defaultSortDir);
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(pageSize ?? 10);

  const sortColType = orderBy ? columns.find((c) => c.key === orderBy)?.type : undefined;

  const sorted = React.useMemo(() => {
    if (!orderBy) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[orderBy] as never;
      const bv = b[orderBy] as never;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (sortColType === "severity") cmp = severityRank(String(av)) - severityRank(String(bv));
      else if (typeof av === "number" && typeof bv === "number") cmp = av - bv;
      else cmp = String(av).localeCompare(String(bv));
      return order === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, orderBy, order, sortColType]);

  const paginated = pageSize ? sorted.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage) : sorted;

  function handleSort(key: string) {
    if (orderBy === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setOrderBy(key);
      setOrder("asc");
    }
  }

  function renderCell(col: ColumnDef, row: Record<string, unknown>) {
    const raw = row[col.key];
    switch (col.type) {
      case "severity":
        return <Chip size="small" color={severityColor(String(raw))} label={String(raw ?? "")} variant="outlined" />;
      case "guidance-alert":
        return <AlertGuidance alertType={String(row[col.guidanceField ?? col.key] ?? "")} />;
      case "guidance-quality":
        return <QualityFlagGuidance flag={String(row[col.guidanceField ?? col.key] ?? "")} />;
      case "guidance-accuracy":
        return <AccuracyGuidance passed={Boolean(row["passed_threshold"])} delta={row["accuracy_delta"] == null ? null : Number(row["accuracy_delta"])} />;
      case "number":
        return <span>{raw == null ? "" : String(raw)}</span>;
      default:
        return <span>{raw == null ? "" : String(raw)}</span>;
    }
  }

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} />
      <Divider />
      {rows.length === 0 ? (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary" variant="body2">
            {emptyMessage}
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 640 }}>
              <TableHead>
                <TableRow>
                  {columns.map((col) => {
                    const isGuidance = col.type === "guidance-alert" || col.type === "guidance-quality" || col.type === "guidance-accuracy";
                    return (
                      <TableCell key={col.key} align={col.align ?? (col.type === "number" ? "right" : "left")} sortDirection={orderBy === col.key ? order : false}>
                        {isGuidance ? (
                          col.label
                        ) : (
                          <TableSortLabel active={orderBy === col.key} direction={orderBy === col.key ? order : "asc"} onClick={() => handleSort(col.key)}>
                            {col.label}
                            {col.headerInfo ? <InfoTip text={col.headerInfo} /> : null}
                          </TableSortLabel>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((row, i) => (
                  <TableRow hover key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key} align={col.align ?? (col.type === "number" ? "right" : "left")}>
                        {renderCell(col, row)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          {pageSize ? (
            <>
              <Divider />
              <TablePagination
                component="div"
                count={sorted.length}
                page={page}
                onPageChange={(_, p) => setPage(p)}
                rowsPerPage={rowsPerPage}
                onRowsPerPageChange={(e) => {
                  setRowsPerPage(parseInt(e.target.value, 10));
                  setPage(0);
                }}
                rowsPerPageOptions={[5, 10, 25, 50]}
              />
            </>
          ) : null}
        </>
      )}
    </Card>
  );
}
