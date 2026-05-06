import { Link, useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";

export function AdminNavTabs() {
  const { t } = useLanguage();
  const [currentPath] = useLocation();

  const tabs = [
    { label: t('overview'), href: "/admin" },
    { label: t('locations'), href: "/admin/locations" },
    { label: t('transactions'), href: "/admin/transactions" },
    { label: t('applications'), href: "/admin/applications" },
    { label: t('inboxTitle'), href: "/admin/inbox" },
  ];

  const isActive = (href: string) => {
    if (href === "/admin") {
      return currentPath === "/admin" || currentPath === "/admin/dashboard";
    }
    return currentPath.startsWith(href);
  };

  const tabClass = (active: boolean) =>
    `whitespace-nowrap px-3 inline-flex items-center justify-center rounded-sm py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:bg-muted/50 ${
      active ? "bg-background text-foreground shadow-sm" : ""
    }`;

  return (
    <div className="w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mb-8">
      <div className="inline-flex h-10 items-center justify-start rounded-md bg-muted p-1 text-muted-foreground w-max min-w-full sm:grid sm:w-full sm:grid-cols-5">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={tabClass(isActive(tab.href))}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
