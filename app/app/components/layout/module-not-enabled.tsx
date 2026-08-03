import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import { PlugsConnectedIcon } from "@phosphor-icons/react/dist/ssr/PlugsConnected"

import { PageHeader } from "./page-header"

// Rendered when a page is navigated to directly but its backing framework
// module is not installed (page key absent from ENABLED_PAGES). Keeps the app
// from erroring on a missing table/view and tells the operator how to enable it.
export function ModuleNotEnabled({ title, module }: { title: string; module: string }) {
  return (
    <Box>
      <PageHeader title={title} subtitle="Module not installed" />
      <Stack
        spacing={2}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          border: "1px dashed",
          borderColor: "divider",
          borderRadius: 2,
          py: 8,
          px: 3,
        }}
      >
        <PlugsConnectedIcon size={40} />
        <Typography variant="h6">This page isn&apos;t enabled</Typography>
        <Typography color="text.secondary" variant="body2" sx={{ maxWidth: 520 }}>
          The <strong>{module}</strong> module that powers this page is not part of
          this deployment. Install it with{" "}
          <code>python setup/install.py --modules {module}</code> (or re-run{" "}
          <code>/agentops-configure</code>), then add this page to{" "}
          <code>ENABLED_PAGES</code> in <code>app/lib/agentops.config.ts</code> and redeploy.
        </Typography>
      </Stack>
    </Box>
  )
}
