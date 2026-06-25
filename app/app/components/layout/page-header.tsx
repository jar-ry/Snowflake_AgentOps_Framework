import * as React from "react";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Box from "@mui/material/Box";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", mb: 3 }}>
      <Box>
        <Typography variant="h4">{title}</Typography>
        {subtitle ? (
          <Typography color="text.secondary" variant="body2">
            {subtitle}
          </Typography>
        ) : null}
      </Box>
      {actions ? (
        <Stack direction="row" spacing={2} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          {actions}
        </Stack>
      ) : null}
    </Stack>
  );
}
