import { ArrowDownToLine, ArrowRight, Bell, Boxes, CircleAlert, ClipboardList, CreditCard, ShieldCheck, Users, Wallet } from "lucide-react";
import { Link } from "wouter";
import { getGetAdminDashboardQueryKey, useGetAdminDashboard } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const money = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);

export default function AdminOverview() {
  const { user, isLoading: authLoading } = useAuth();
  const query = useGetAdminDashboard({ query: { queryKey: getGetAdminDashboardQueryKey(), enabled: Boolean(user) } });
  if (authLoading || (user && query.isLoading)) {
    return <><header className="admin-page-heading"><div><p className="admin-eyebrow">Daily control</p><h1>Operations overview</h1><p>Loading current marketplace activity…</p></div></header><div className="admin-metric-grid">{[1, 2, 3, 4].map((item) => <div className="admin-skeleton" key={item} />)}</div></>;
  }
  if (!user) return <section className="admin-state"><ShieldCheck /><h2>Sign in to continue</h2><p>Admin tools are available to authenticated Milmarts staff only.</p><Link className="admin-button admin-button--primary" href="/login">Sign in</Link></section>;
  if (query.isError || !query.data) return <section className="admin-state"><CircleAlert /><h2>Overview unavailable</h2><p>{query.error instanceof Error ? query.error.message : "We could not retrieve the admin summary. Your session may not have staff access."}</p><button className="admin-button" onClick={() => void query.refetch()}>Retry summary</button></section>;

  const data = query.data;
  const metrics = [
    { label: "Customer accounts", value: data.userCount.toLocaleString("en-NG"), note: "Local Milmarts accounts", icon: Users },
    { label: "Paid local orders", value: data.paidOrderCount.toLocaleString("en-NG"), note: "Payment confirmed", icon: ClipboardList },
    { label: "Wallet ledger entries", value: data.walletTransactionCount.toLocaleString("en-NG"), note: "Recorded movements", icon: Wallet },
    { label: "Total wallet balance", value: money(data.walletBalanceTotalKobo), note: "Customer funds held", icon: CreditCard },
  ];
  return (
    <>
      <header className="admin-page-heading">
        <div><p className="admin-eyebrow">Daily control / Nigeria</p><h1>Operations overview</h1><p>A clear read on local accounts, customer funds and paid orders.</p></div>
        <span className="admin-date-chip">{new Intl.DateTimeFormat("en-NG", { dateStyle: "full" }).format(new Date())}</span>
      </header>
      <div className="admin-metric-grid">
        {metrics.map(({ label, value, note, icon: Icon }) => <article className="admin-metric" key={label} data-testid={`metric-${label.toLowerCase().replaceAll(" ", "-")}`}><div className="admin-metric-top"><span>{label}</span><span className="admin-metric-icon"><Icon className="h-4 w-4" /></span></div><strong>{value}</strong><small>{note}</small></article>)}
      </div>
      <div className="admin-dashboard-lower">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><h2>Today’s control points</h2><p>Jump straight into the work that moves orders forward.</p></div><ArrowDownToLine className="h-5 w-5" style={{ color: "var(--ops-green)" }} /></div>
          <div className="admin-ops-list">
            <div className="admin-ops-row"><span className="admin-ops-icon"><ArrowDownToLine className="h-4 w-4" /></span><div><strong>Wallet funding attempts</strong><small>Payment records awaiting a completed state</small></div><span className="admin-ops-value">{data.pendingFundingCount}<small>pending</small></span></div>
            <div className="admin-ops-row"><span className="admin-ops-icon"><ShieldCheck className="h-4 w-4" /></span><div><strong>Active staff</strong><small>People with admin access right now</small></div><span className="admin-ops-value">{data.activeStaffCount}<small>active</small></span></div>
            <div className="admin-ops-row"><span className="admin-ops-icon"><Wallet className="h-4 w-4" /></span><div><strong>Wallet funds in circulation</strong><small>Combined customer wallet balance</small></div><span className="admin-ops-value">{money(data.walletBalanceTotalKobo)}<small>NGN</small></span></div>
          </div>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><div><h2>Quick access</h2><p>Local operations, not Shopify catalog tools.</p></div></div>
          <div className="admin-ops-list">
            <Link href="/admin/users" className="admin-ops-row admin-link"><span className="admin-ops-icon"><Users className="h-4 w-4" /></span><strong>Find a customer account</strong><ArrowRight className="h-4 w-4" /></Link>
            <Link href="/admin/transactions" className="admin-ops-row admin-link"><span className="admin-ops-icon"><CreditCard className="h-4 w-4" /></span><strong>Review the payment ledger</strong><ArrowRight className="h-4 w-4" /></Link>
            <Link href="/admin/orders" className="admin-ops-row admin-link"><span className="admin-ops-icon"><ClipboardList className="h-4 w-4" /></span><strong>Track local fulfillment</strong><ArrowRight className="h-4 w-4" /></Link>
            <Link href="/admin/notifications" className="admin-ops-row admin-link"><span className="admin-ops-icon"><Bell className="h-4 w-4" /></span><strong>Compose a customer broadcast</strong><ArrowRight className="h-4 w-4" /></Link>
          </div>
          <div className="admin-callout" style={{ marginTop: ".9rem" }}><Boxes className="h-4 w-4" /><span><strong>Catalog editing is unavailable</strong>Shopify connection was declined. No local product copy is maintained here.</span></div>
        </section>
      </div>
    </>
  );
}
