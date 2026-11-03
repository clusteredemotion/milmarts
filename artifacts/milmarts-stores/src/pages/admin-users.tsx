import { useState, type FormEvent } from "react";
import { CircleAlert, Edit3, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminDashboardQueryKey, getListAdminUsersQueryKey, useListAdminUsers, useUpdateAdminUser, type AdminUserRecord, type AdminUserUpdateInput, type ListAdminUsersParams } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const formatMoney = (kobo: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 2 }).format(kobo / 100);
const formatDate = (value: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value));

function UserEditDialog({ user, onClose, onSaved }: { user: AdminUserRecord; onClose: () => void; onSaved: (name: string) => void }) {
  const [values, setValues] = useState<AdminUserUpdateInput>({ firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const client = useQueryClient();
  const update = useUpdateAdminUser();
  const change = (key: keyof AdminUserUpdateInput, value: string) => setValues((current) => ({ ...current, [key]: value }));
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(""); setMessage("");
    if (!window.confirm(`Save profile changes for ${user.firstName} ${user.lastName}? The wallet balance will not be changed.`)) return;
    try {
      await update.mutateAsync({ userId: user.id, data: values });
      await Promise.all([
        client.invalidateQueries({ queryKey: getListAdminUsersQueryKey() }),
        client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }),
      ]);
      onSaved(`${user.firstName} ${user.lastName} profile saved.`);
      onClose();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Profile changes could not be saved.");
    }
  };
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !update.isPending) onClose(); }}>
    <section className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-user-edit-title">
      <div className="admin-modal-head"><div><p className="admin-eyebrow">Customer record · #{user.id}</p><h2 id="admin-user-edit-title">Edit account details</h2></div><button className="admin-button" type="button" aria-label="Close edit dialog" onClick={onClose}><X className="h-4 w-4" /></button></div>
      <form onSubmit={(event) => void submit(event)}>
        <div className="admin-form-grid">
          <label>First name<input className="admin-input" required maxLength={80} value={values.firstName} onChange={(event) => change("firstName", event.target.value)} data-testid="input-user-first-name" /></label>
          <label>Last name<input className="admin-input" required maxLength={80} value={values.lastName} onChange={(event) => change("lastName", event.target.value)} data-testid="input-user-last-name" /></label>
          <label className="admin-field-wide">Email<input className="admin-input" type="email" required maxLength={254} value={values.email} onChange={(event) => change("email", event.target.value)} data-testid="input-user-email" /></label>
          <label className="admin-field-wide">Phone<input className="admin-input" type="tel" maxLength={40} value={values.phone} onChange={(event) => change("phone", event.target.value)} data-testid="input-user-phone" /></label>
        </div>
        <div className="admin-readonly-balance" style={{ marginTop: ".85rem" }}><span>Wallet balance <small style={{ display: "block", color: "#7c8982", marginTop: ".2rem" }}>Read-only · profile edits never affect funds</small></span><strong className="mono">{formatMoney(user.walletBalanceKobo)}</strong></div>
        {error && <p className="admin-notice is-error" role="alert">{error}</p>}
        {message && <p className="admin-notice" role="status">{message}</p>}
        <div className="admin-modal-actions"><button type="button" className="admin-button" onClick={onClose} disabled={update.isPending}>Cancel</button><button type="submit" className="admin-button admin-button--primary" disabled={update.isPending} data-testid="button-save-user">{update.isPending ? "Saving…" : "Confirm changes"}</button></div>
      </form>
    </section>
  </div>;
}

export default function AdminUsers() {
  const { user, isLoading: authLoading } = useAuth();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<AdminUserRecord | null>(null);
  const [successMessage, setSuccessMessage] = useState("");
  const params: ListAdminUsersParams = { search: search || undefined, limit: 20, offset };
  const query = useListAdminUsers(params, { query: { queryKey: getListAdminUsersQueryKey(params), enabled: Boolean(user) } });
  if (authLoading || (user && query.isLoading)) return <><header className="admin-page-heading"><div><p className="admin-eyebrow">Accounts / local</p><h1>Customer accounts</h1><p>Loading registered customers…</p></div></header><section className="admin-table-card"><div className="admin-record-head">Customer directory</div>{[1, 2, 3, 4].map((row) => <div className="admin-skeleton-row" key={row} />)}</section></>;
  if (!user) return <section className="admin-state"><ShieldCheck /><h2>Sign in to continue</h2><p>Customer records are restricted to authenticated Milmarts staff.</p></section>;
  if (query.isError || !query.data) return <section className="admin-state"><CircleAlert /><h2>Customer accounts unavailable</h2><p>{query.error instanceof Error ? query.error.message : "Your account may not have permission to view customer records."}</p><button className="admin-button" onClick={() => void query.refetch()}>Retry customer list</button></section>;
  const accounts = query.data.users;
  const applySearch = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); setOffset(0); setSearch(input.trim()); };
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Accounts / local</p><h1>Customer accounts</h1><p>Search and update customer contact details. Wallet funds stay read-only in this workspace.</p></div><span className="admin-date-chip"><UserRound className="h-3.5 w-3.5" /> {query.data.total.toLocaleString("en-NG")} accounts</span></header>
    <form className="admin-toolbar" onSubmit={applySearch}>
      <div className="admin-search"><Search className="h-4 w-4" /><input className="admin-input" placeholder="Search name, email or phone" value={input} onChange={(event) => setInput(event.target.value)} aria-label="Search customer accounts" data-testid="input-search-users" /></div>
      <button className="admin-button admin-button--primary" type="submit" data-testid="button-search-users"><Search className="h-4 w-4" /> Search accounts</button>
    </form>
    {successMessage && <p className="admin-notice" role="status">{successMessage}</p>}
    <section className="admin-table-card">
      <div className="admin-record-head"><span>Customer directory</span><span>Wallet shown for reference only</span></div>
      {accounts.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Contact</th><th>Wallet balance</th><th>Joined</th><th>Action</th></tr></thead><tbody>
        {accounts.map((account) => <tr key={account.id} data-testid={`row-customer-${account.id}`}><td><div className="admin-person"><span className="admin-avatar">{`${account.firstName.slice(0, 1)}${account.lastName.slice(0, 1)}`.toUpperCase()}</span><span><strong>{account.firstName} {account.lastName}</strong><small>Local ID {account.id}</small></span></div></td><td>{account.email}<small style={{ display: "block", color: "#82908a", marginTop: ".2rem" }}>{account.phone || "No phone listed"}</small></td><td className="mono">{formatMoney(account.walletBalanceKobo)}</td><td>{formatDate(account.createdAt)}</td><td><button className="admin-button" type="button" onClick={() => setEditing(account)} data-testid={`button-edit-user-${account.id}`}><Edit3 className="h-3.5 w-3.5" /> Edit</button></td></tr>)}
      </tbody></table></div> : <div className="admin-empty"><Search className="h-6 w-6" /><h2>No matching customers</h2><p>Try another name, email address or phone number.</p></div>}
      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".7rem", padding: ".75rem .85rem", borderTop: "1px solid var(--ops-line)", color: "#748078", fontSize: ".7rem" }}><span>{query.data.total ? `${offset + 1}–${Math.min(offset + 20, query.data.total)} of ${query.data.total}` : "0 customers"}</span><div style={{ display: "flex", gap: ".45rem" }}><button className="admin-button" type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous</button><button className="admin-button" type="button" disabled={offset + 20 >= query.data.total} onClick={() => setOffset(offset + 20)}>Next</button></div></footer>
    </section>
    {editing && <UserEditDialog user={editing} onClose={() => setEditing(null)} onSaved={setSuccessMessage} />}
  </>;
}
