"use client";

import * as React from "react";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TablePagination from "@mui/material/TablePagination";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

import { InfoTip, QualityFlagGuidance } from "./mui-tooltips";

export interface FlagRef {
  key: string;
  label: string;
}

export interface FlaggedRow {
  severity: string;
  agent: string;
  query: string;
  duration: string;
  tokens: string;
  flags: FlagRef[];
}

function sevColor(s: string): "error" | "warning" | "info" | "default" {
  const u = (s || "").toUpperCase();
  if (u === "CRITICAL") return "error";
  if (u === "WARNING") return "warning";
  if (u === "INFO") return "info";
  return "default";
}

export function FlaggedInteractionsTable({ rows, title, subheader, pageSize = 10 }: { rows: FlaggedRow[]; title: string; subheader?: string; pageSize?: number }) {
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(pageSize);
  const paginated = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Card sx={{ height: "100%" }}>
      <CardHeader title={title} subheader={subheader} />
      <Divider />
      {rows.length === 0 ? (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary" variant="body2">
            No flagged interactions found.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ overflowX: "auto" }}>
            <Table sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Severity<InfoTip text="CRITICAL = planning error or compounding signals; WARNING = a single quality signal." /></TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>Query</TableCell>
                  <TableCell align="right">Duration</TableCell>
                  <TableCell align="right">Tokens</TableCell>
                  <TableCell>Flags<InfoTip text="Which quality signals fired. Click a badge for remediation steps." /></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((r, i) => (
                  <TableRow hover key={i}>
                    <TableCell>
                      <Chip size="small" variant="outlined" color={sevColor(r.severity)} label={r.severity} />
                    </TableCell>
                    <TableCell>{r.agent}</TableCell>
                    <TableCell sx={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.query}</TableCell>
                    <TableCell align="right">{r.duration}</TableCell>
                    <TableCell align="right">{r.tokens}</TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                        {r.flags.map((f) => (
                          <Stack key={f.key} direction="row" sx={{ alignItems: "center" }}>
                            <Chip size="small" label={f.label} />
                            <QualityFlagGuidance flag={f.key} />
                          </Stack>
                        ))}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Divider />
          <TablePagination
            component="div"
            count={rows.length}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25]}
          />
        </>
      )}
    </Card>
  );
}
