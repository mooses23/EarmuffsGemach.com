import { Link, useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AdminNavTabs() {
  const { t } = useLanguage();
  const [currentPath] = useLocation();

  const primaryTabs = [
    { label: t('overview'), href: "/admin" },
    { label: t('locations'), href: "/admin/locations" },
    { label: t('transactions'), href: "/admin/transactions" },
    { label: t('applications'), href: "/admin/applications" },
    { label: t('analytics'), href: "/admin/analytics" },
  ];

  const secondaryTabs = [
    { label: t('inboxTitle'), href: "/admin/inbox" },
    { label: t('paymentConfirmations'), href: "/admin/payment-confirmations" },
    { label: t('paymentMethodsLabel'), href: "/admin/payment-methods" },
    { label: t('paymentStatusMonitor'), href: "/admin/payment-status" },
    { label: t('docsTab'), href: "/admin/glossary" },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") {
      return currentPath === "/admin" || currentPath === "/admin/dashboard";
    }
    return currentPath === href;
  };

  const isSecondaryActive = secondaryTabs.some((tab) => isActive(tab.href));

  const tabClass = (active: boolean) =>
    `whitespace-nowrap px-3 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${
      active ? "bg-background text-foreground shadow-sm" : ""
    }`;

  return (
    <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-8">
      <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-max min-w-full sm:grid sm:w-full sm:grid-cols-6">
        {primaryTabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={tabClass(isActive(tab.href))}
          >
            {tab.label}
          </Link>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger className={tabClass(isSecondaryActive)}>
            <span>{t('morePages')}</span>
            <ChevronDown className="h-3 w-3 ml-1 shrink-0" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            {secondaryTabs.map((tab) => (
              <DropdownMenuItem key={tab.href} asChild>
                <Link
                  href={tab.href}
                  className={`w-full cursor-pointer ${isActive(tab.href) ? "font-semibold" : ""}`}
                >
                  {tab.label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
