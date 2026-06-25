import { ChartPieIcon } from "@phosphor-icons/react/dist/ssr/ChartPie";
import { TargetIcon } from "@phosphor-icons/react/dist/ssr/Target";
import { SealCheckIcon } from "@phosphor-icons/react/dist/ssr/SealCheck";
import { CurrencyDollarIcon } from "@phosphor-icons/react/dist/ssr/CurrencyDollar";
import { WarningIcon } from "@phosphor-icons/react/dist/ssr/Warning";
import { ChatCircleTextIcon } from "@phosphor-icons/react/dist/ssr/ChatCircleText";
import type { Icon } from "@phosphor-icons/react/dist/lib/types";

export interface NavItem {
  key: string;
  title: string;
  href: string;
  icon: Icon;
}

export const navItems: NavItem[] = [
  { key: "overview", title: "Overview", href: "/", icon: ChartPieIcon },
  { key: "accuracy", title: "Accuracy", href: "/accuracy", icon: TargetIcon },
  { key: "quality", title: "Quality", href: "/quality", icon: SealCheckIcon },
  { key: "cost", title: "Cost", href: "/cost", icon: CurrencyDollarIcon },
  { key: "feedback", title: "Feedback", href: "/feedback", icon: ChatCircleTextIcon },
  { key: "alerts", title: "Alerts", href: "/alerts", icon: WarningIcon },
];
