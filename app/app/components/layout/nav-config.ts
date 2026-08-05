import { ChartPieIcon } from "@phosphor-icons/react/dist/ssr/ChartPie";
import { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
import { SealCheckIcon } from "@phosphor-icons/react/dist/ssr/SealCheck";
import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/ssr/CurrencyDollar";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import { GearIcon } from "@phosphor-icons/react/dist/ssr/Gear";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";
import { ENABLED_PAGES, type PageKey } from "@/lib/agentops.config";

export interface NavItem {
  key: PageKey;
  title: string;
  href: string;
  icon: Icon;
}

// Full catalog of pages. The exported `navItems` is filtered to only the pages
// enabled in app/lib/agentops.config.ts (ENABLED_PAGES), so the sidebar/topnav
// reflect which framework modules are installed.
const allNavItems: NavItem[] = [
  { key: "overview", title: "Overview", href: "/", icon: ChartPieIcon },
  { key: "accuracy", title: "Accuracy", href: "/accuracy", icon: TargetIcon },
  { key: "quality", title: "Quality", href: "/quality", icon: SealCheckIcon },
  { key: "cost", title: "Cost", href: "/cost", icon: CurrencyDollarIcon },
  { key: "feedback", title: "Feedback", href: "/feedback", icon: ChatCircleTextIcon },
  { key: "alerts", title: "Alerts", href: "/alerts", icon: WarningIcon },
  { key: "settings", title: "Settings", href: "/settings", icon: GearIcon },
];

export const navItems: NavItem[] = allNavItems.filter((item) =>
  ENABLED_PAGES.includes(item.key)
);

