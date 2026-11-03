import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Bell, Boxes, ChevronRight, ClipboardList, LayoutDashboard, LogOut, Menu, ReceiptText, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "@/lib/auth";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Customers", href: "/admin/users", icon: Users },
  { label: "Transactions", href: "/admin/transactions", icon: ReceiptText },
  { label: "Orders", href: "/admin/orders", icon: ClipboardList },
  { label: "Catalog", href: "/admin/products", icon: Boxes },
  { label: "Staff access", href: "/admin/staff", icon: ShieldCheck },
  { label: "Notifications", href: "/admin/notifications", icon: Bell },
];

const TITLES: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Customer accounts",
  "/admin/transactions": "Transactions",
  "/admin/orders": "Order fulfillment",
  "/admin/products": "Catalog connection",
  "/admin/staff": "Staff access",
  "/admin/notifications": "Customer notifications",
};

export function AdminShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerRef.current?.focus();
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        window.requestAnimationFrame(() => menuButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen) setMenuOpen(false);
  }, [location]);

  const closeMenu = () => {
    setMenuOpen(false);
    window.requestAnimationFrame(() => menuButtonRef.current?.focus());
  };

  return (
    <div className="admin-frame">
      <div className="admin-layout">
        <main className="admin-main">
          <header className="admin-topbar">
            <div className="admin-topbar-start">
              <button
                ref={menuButtonRef}
                type="button"
                className="admin-menu-trigger"
                onClick={() => setMenuOpen(true)}
                aria-label={menuOpen ? "Close admin navigation" : "Open admin navigation"}
                aria-expanded={menuOpen}
                aria-controls="admin-navigation-drawer"
                data-testid="button-admin-menu"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>
              <Link href="/admin" className="admin-header-brand" aria-label="Milmarts admin overview">
                <img src="/milmarts-wordmark.png" alt="Milmarts Stores" />
                <span>ADMIN</span>
              </Link>
              <div className="admin-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{TITLES[location] ?? "Operations"}</strong></div>
            </div>
            <div className="admin-top-meta"><span className="admin-online-dot" /> <span className="admin-user-label">{user ? `${user.firstName} ${user.lastName}` : "Secure staff session"}</span><button type="button" onClick={() => void logout()} className="admin-button admin-signout" data-testid="button-admin-logout"><LogOut className="h-3.5 w-3.5" /> <span>Sign out</span></button></div>
          </header>
          <div className="admin-content">{children}</div>
        </main>
      </div>
      <div className={`admin-drawer-layer ${menuOpen ? "is-open" : ""}`} hidden={!menuOpen} onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}>
          <aside
            id="admin-navigation-drawer"
            ref={drawerRef}
            className="admin-drawer"
            role="dialog"
            aria-modal={menuOpen}
            aria-label="Admin navigation"
            tabIndex={-1}
            data-testid="admin-navigation-drawer"
          >
            <div className="admin-drawer-head">
              <Link href="/admin" className="admin-drawer-logo" onClick={closeMenu}>
                <img src="/milmarts-wordmark.png" alt="Milmarts Stores" />
              </Link>
              <button type="button" className="admin-drawer-close" onClick={closeMenu} aria-label="Close admin navigation" data-testid="button-admin-menu-close">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="admin-drawer-caption">
              <span className="admin-drawer-caption-mark"><Activity className="h-4 w-4" aria-hidden="true" /></span>
              <span><strong>Operations desk</strong><small>Local marketplace control</small></span>
            </div>
            <p className="admin-nav-label">Workspace</p>
            <nav className="admin-nav" aria-label="Admin navigation">
              {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
                const active = href === "/admin" ? location === href : location.startsWith(href);
                return (
                  <Link key={href} href={href} onClick={closeMenu} className={`admin-nav-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined} data-testid={`link-admin-${label.toLowerCase().replaceAll(" ", "-")}`}>
                    <Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>{active && <ChevronRight className="admin-nav-chevron h-4 w-4" aria-hidden="true" />}
                  </Link>
                );
              })}
            </nav>
            <div className="admin-sidebar-bottom">
              <div className="admin-local-status"><Activity className="h-4 w-4" aria-hidden="true" /><span>Local operations</span><i aria-hidden="true" /></div>
              <Link href="/account" onClick={closeMenu}>Return to customer account</Link>
            </div>
          </aside>
      </div>
    </div>
  );
}
