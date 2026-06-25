import * as React from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";

import { InfoTip } from "./mui-tooltips";

export function SeverityLegend() {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent>
        <Stack spacing={1.5}>
          <Typography variant="subtitle1">
            How severity is assigned
            <InfoTip text="Severity is derived from which quality signals fired on a request. Compounding signals or a planning error escalate an interaction to CRITICAL." />
          </Typography>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Chip size="small" color="error" variant="outlined" label="Critical" sx={{ minWidth: 76 }} />
            <Typography variant="body2" color="text.secondary">
              A <strong>planning error</strong>, or <strong>tool-looping combined with high token burn</strong> — compounding signals that indicate the agent is stuck or burning cost.
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Chip size="small" color="warning" variant="outlined" label="Warning" sx={{ minWidth: 76 }} />
            <Typography variant="body2" color="text.secondary">
              A <strong>single</strong> quality signal — tool looping, excessive planning steps, a slow request, or high token burn — that warrants attention but isn&apos;t yet critical.
            </Typography>
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
            <Chip size="small" color="info" variant="outlined" label="Info" sx={{ minWidth: 76 }} />
            <Typography variant="body2" color="text.secondary">
              No qualifying signal fired; these interactions are healthy and aren&apos;t listed below.
            </Typography>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}
