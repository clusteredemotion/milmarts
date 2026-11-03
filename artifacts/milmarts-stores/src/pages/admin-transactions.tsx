import { useState } from "react";
import { ArrowDownToLine, CircleAlert, CreditCard, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { getGetAdminTransactionsQueryKey, useGetAdminTransactions } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

type LedgerTab = "wallet" | "funding" | "orders";
const money = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(kobo / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusClass = (status: string) => /paid|success|completed/i.test(status) ? "admin-status" : /pending|initiated/i.test(status) ? "admin-status admin-status--pending" : "admin-status admin-status--inactive";

export default function AdminTransactions() {
  const { user, isLoading: authLoading } = useAuth();
  const query = useGetAdminTransactions({ query: { queryKey: getGetAdminTransactionsQueryKey(), enabled: Boolean(user) } });
  const [tab, setTab] = useState<LedgerTab>("wallet");
  if (authLoading || (user && query.isLoading)) return <><header className="admin-page-heading"><div><p className="admin-eyebrow">Money movement / read-only</p><h1>Transactions</h1><p>Loading payment records…</p></div></header><div className="admin-skeleton" style={{ height: "310px" }} /></>;
  if (!user) return <section className="admin-state"><ShieldCheck /><h2>Sign in to continue</h2><p>Payment records are restricted to authenticated Milmarts staff.</p></section>;
  if (query.isError || !query.data) return <section className="admin-state"><CircleAlert /><h2>Transactions unavailable</h2><p>{query.error instanceof Error ? query.error.message : "Your account may not have permission to view payment records."}</p><button className="admin-button" onClick={() => void query.refetch()}>Retry transactions</button></section>;
  const info = query.data;
  const counts = { wallet: info.walletTransactions.length, funding: info.fundingPayments.length, orders: info.orderPayments.length };
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Money movement / read-only</p><h1>Transactions</h1><p>Wallet ledger entries, Flutterwave funding attempts and local order payments. This view does not change financial records.</p></div><span className="admin-tag"><ShieldCheck className="h-3.5 w-3.5" /> Read-only ledger</span></header>
    <div className="admin-tabs" role="tablist" aria-label="Transaction record type">
      <button role="tab" aria-selected={tab === "wallet"} className={`admin-tab ${tab === "wallet" ? "is-active" : ""}`} onClick={() => setTab("wallet")} data-testid="tab-wallet-ledger"><Wallet className="h-4 w-4" /> Wallet ledger <span>({counts.wallet})</span></button>
      <button role="tab" aria-selected={tab === "funding"} className={`admin-tab ${tab === "funding" ? "is-active" : ""}`} onClick={() => setTab("funding")} data-testid="tab-funding"><ArrowDownToLine className="h-4 w-4" /> Funding attempts <span>({counts.funding})</span></button>
      <button role="tab" aria-selected={tab === "orders"} className={`admin-tab ${tab === "orders" ? "is-active" : ""}`} onClick={() => setTab("orders")} data-testid="tab-order-payments"><CreditCard className="h-4 w-4" /> Order payments <span>({counts.orders})</span></button>
    </div>
    <section className="admin-table-card">
      {tab === "wallet" && <>
        <div className="admin-record-head"><span>Wallet ledger entries</span><span>{counts.wallet} records</span></div>
        {counts.wallet ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Movement</th><th>Amount</th><th>Reference</th><th>Recorded</th></tr></thead><tbody>{info.walletTransactions.map((item) => <tr key={item.id}><td><strong>{item.userName}</strong><small style={{ display: "block", color: "#82908a", marginTop: ".2rem" }}>{item.email}</small></td><td><span className="admin-tag">{item.type}</span></td><td className="mono">{money(item.amountKobo)}</td><td className="mono">{item.reference || "—"}</td><td>{date(item.createdAt)}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><Wallet /><h2>No wallet entries yet</h2><p>Wallet movements will appear here when recorded.</p></div>}
      </>}
      {tab === "funding" && <>
        <div className="admin-record-head"><span>Flutterwave wallet funding</span><span>{counts.funding} records</span></div>
        {counts.funding ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Amount</th><th>Payment status</th><th>Transaction reference</th><th>Started</th><th>Completed</th></tr></thead><tbody>{info.fundingPayments.map((item) => <tr key={item.id}><td><strong>{item.userName}</strong><small style={{ display: "block", color: "#82908a", marginTop: ".2rem" }}>{item.email}</small></td><td className="mono">{money(item.amountKobo)}</td><td><span className={statusClass(item.status)}>{item.status}</span></td><td className="mono">{item.txRef}<small style={{ display: "block", color: "#82908a", marginTop: ".2rem" }}>{item.flutterwaveTransactionId ? `Flutterwave ${item.flutterwaveTransactionId}` : "No provider ID"}</small></td><td>{date(item.createdAt)}</td><td>{item.completedAt ? date(item.completedAt) : "—"}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><ArrowDownToLine /><h2>No funding attempts yet</h2><p>Customer wallet funding attempts will be listed here.</p></div>}
      </>}
      {tab === "orders" && <>
        <div className="admin-record-head"><span>Local order payment records</span><span>{counts.orders} records</span></div>
        {counts.orders ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Method</th><th>Payment status</th><th>Total</th><th>Created</th><th>Paid</th></tr></thead><tbody>{info.orderPayments.map((item) => <tr key={item.id}><td className="mono"><strong>{item.orderNumber}</strong></td><td><strong>{item.userName}</strong><small style={{ display: "block", color: "#82908a", marginTop: ".2rem" }}>{item.email}</small></td><td>{item.paymentMethod}</td><td><span className={statusClass(item.paymentStatus)}>{item.paymentStatus}</span></td><td className="mono">{money(item.totalKobo)}</td><td>{date(item.createdAt)}</td><td>{item.paidAt ? date(item.paidAt) : "—"}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><ReceiptText /><h2>No local order payments yet</h2><p>Customer payments attached to local Milmarts orders will appear here.</p></div>}
      </>}
    </section>
    <p style={{ margin: ".75rem .15rem", color: "#77847d", fontSize: ".69rem" }}>For review only. Users, transaction records and wallet balances remain unchanged.</p>
  </>;
}
