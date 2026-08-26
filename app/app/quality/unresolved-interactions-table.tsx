"use client"

import * as React from "react"
import Card from "@mui/material/Card"
import CardHeader from "@mui/material/CardHeader"
import Divider from "@mui/material/Divider"
import Box from "@mui/material/Box"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import TablePagination from "@mui/material/TablePagination"
import Chip from "@mui/material/Chip"
import Tooltip from "@mui/material/Tooltip"
import Typography from "@mui/material/Typography"

export interface UnresolvedRow {
  date: string
  agent: string
  query: string
  response: string
  verdict: string
  explanation: string
  model: string
}

/** Truncate for table display, full text available via tooltip. */
function clip(s: string, n: number): string {
  if (!s) return ""
  return s.length > n ? `${s.slice(0, n)}…` : s
}

export function UnresolvedInteractionsTable({
  rows,
  title,
  subheader,
  pageSize = 10,
}: {
  rows: UnresolvedRow[]
  title: string
  subheader?: string
  pageSize?: number
}) {
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(pageSize)
  const paginated = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  return (
    <Card>
      <CardHeader title={title} subheader={subheader} />
      <Divider />
      {rows.length === 0 ? (
        <Box sx={{ p: 3 }}>
          <Typography color="text.secondary" variant="body2">
            No unresolved interactions in this period — every scored query was judged resolved.
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Agent</TableCell>
                  <TableCell>User query</TableCell>
                  <TableCell>Agent response</TableCell>
                  <TableCell>Verdict</TableCell>
                  <TableCell sx={{ minWidth: 280 }}>Why (LLM explanation)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((r, i) => (
                  <TableRow key={`${r.date}-${i}`} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{r.date}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{r.agent}</TableCell>
                    <TableCell>
                      <Tooltip title={r.query}>
                        <span>{clip(r.query, 60)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={r.response}>
                        <span>{clip(r.response, 60)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Chip label={r.verdict || "NO"} size="small" color="error" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {r.explanation}
                      </Typography>
                      {r.model ? (
                        <Typography variant="caption" color="text.disabled">
                          judged by {r.model}
                        </Typography>
                      ) : null}
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
            rowsPerPage={rowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            onPageChange={(_, p) => setPage(p)}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10))
              setPage(0)
            }}
          />
        </>
      )}
    </Card>
  )
}
