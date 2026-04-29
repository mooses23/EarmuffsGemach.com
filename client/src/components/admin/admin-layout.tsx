import { AdminNavTabs } from "./admin-nav-tabs";

interface AdminLayoutProps {
  children: React.ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className="py-10">
      <div className="container mx-auto px-4">
        <AdminNavTabs />
        {children}
      </div>
    </div>
  );
}
