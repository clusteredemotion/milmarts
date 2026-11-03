import { useState, type FormEvent } from "react";
import { CircleAlert, ShieldCheck, UserPlus, UserRoundX } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetAdminDashboardQueryKey, getListAdminStaffQueryKey, useAssignAdminStaff, useListAdminStaff, useRevokeAdminStaff } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";

const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export default function AdminStaff() {
  const { user, isLoading: authLoading } = useAuth();
  const client = useQueryClient();
  const [idInput, setIdInput] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const staffQuery = useListAdminStaff({ query: { queryKey: getListAdminStaffQueryKey(), enabled: Boolean(user) } });
  const assign = useAssignAdminStaff();
  const revoke = useRevokeAdminStaff();
  const refresh = async () => Promise.all([
    client.invalidateQueries({ queryKey: getListAdminStaffQueryKey() }),
    client.invalidateQueries({ queryKey: getGetAdminDashboardQueryKey() }),
  ]);
  const assignUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setFeedback(""); setError("");
    const userId = Number(idInput);
    if (!Number.isSafeInteger(userId) || userId < 1) { setError("Enter a valid existing local user ID."); return; }
    if (!window.confirm(`Assign admin access to local user ${userId}? This gives the account access to staff operations.`)) return;
    try {
      await assign.mutateAsync({ data: { userId } });
      setIdInput(""); setFeedback(`Admin access assigned to local user ${userId}.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Staff access could not be assigned."); }
  };
  const revokeUser = async (staffUserId: number, name: string) => {
    setFeedback(""); setError("");
    if (!window.confirm(`Revoke admin access for ${name} (local user ${staffUserId})?\n\nThis only removes admin access. The customer account and its wallet and transaction history remain intact.`)) return;
    try {
      await revoke.mutateAsync({ userId: staffUserId });
      setFeedback(`Admin access removed for ${name}. The user account remains intact.`);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Admin access could not be revoked."); }
  };
  if (authLoading || (user && staffQuery.isLoading)) return <><header className="admin-page-heading"><div><p className="admin-eyebrow">Access control / local IDs</p><h1>Staff access</h1><p>Loading staff assignments…</p></div></header><section className="admin-table-card"><div className="admin-record-head">Current assignments</div>{[1, 2, 3].map((i) => <div className="admin-skeleton-row" key={i} />)}</section></>;
  if (!user) return <section className="admin-state"><ShieldCheck /><h2>Sign in to continue</h2><p>Staff access requires an authenticated Milmarts account.</p></section>;
  if (staffQuery.isError || !staffQuery.data) return <section className="admin-state"><CircleAlert /><h2>Staff access unavailable</h2><p>{staffQuery.error instanceof Error ? staffQuery.error.message : "Your account may not have permission to view staff assignments."}</p><button className="admin-button" onClick={() => void staffQuery.refetch()}>Retry staff list</button></section>;
  const { staff, canManageStaff } = staffQuery.data;
  return <>
    <header className="admin-page-heading"><div><p className="admin-eyebrow">Access control / local IDs</p><h1>Staff access</h1><p>Admin access is an assignment on an existing Milmarts user. It is separate from the customer account.</p></div><span className="admin-tag"><ShieldCheck className="h-3.5 w-3.5" /> {canManageStaff ? "Primary admin controls" : "View only"}</span></header>
    {feedback && <p className="admin-notice" role="status">{feedback}</p>}
    {error && <p className="admin-notice is-error" role="alert">{error}</p>}
    {canManageStaff ? <section className="admin-panel" style={{ marginBottom: ".9rem" }}>
      <div className="admin-panel-head"><div><h2>Assign staff access</h2><p>Enter the numeric ID of an existing local user account.</p></div><UserPlus className="h-5 w-5" style={{ color: "var(--ops-green)" }} /></div>
      <form onSubmit={(event) => void assignUser(event)} className="admin-toolbar" style={{ margin: 0 }}>
        <div style={{ flex: "1 1 260px", maxWidth: "420px" }}><input className="admin-input" inputMode="numeric" pattern="[0-9]+" min="1" required value={idInput} onChange={(event) => setIdInput(event.target.value)} placeholder="Existing local user ID" aria-label="Local user ID" data-testid="input-staff-user-id" /></div>
        <button type="submit" className="admin-button admin-button--primary" disabled={assign.isPending} data-testid="button-assign-staff"><UserPlus className="h-4 w-4" /> {assign.isPending ? "Assigning…" : "Assign admin access"}</button>
      </form>
    </section> : <div className="admin-callout" style={{ marginBottom: ".9rem" }}><ShieldCheck className="h-4 w-4" /><span><strong>Permission required</strong>Only the primary admin can assign or revoke staff access. You can review the current access list here.</span></div>}
    <section className="admin-table-card">
      <div className="admin-record-head"><span>Staff assignments</span><span>{staff.filter((person) => person.isActive).length} active / {staff.length} total</span></div>
      {staff.length ? <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Staff member</th><th>Local user ID</th><th>Access</th><th>Primary admin</th><th>Assigned</th><th>Action</th></tr></thead><tbody>{staff.map((person) => <tr key={person.userId} data-testid={`row-staff-${person.userId}`}><td><div className="admin-person"><span className="admin-avatar">{`${person.firstName.slice(0, 1)}${person.lastName.slice(0, 1)}`.toUpperCase()}</span><span><strong>{person.firstName} {person.lastName}</strong><small>{person.email}</small></span></div></td><td className="mono">{person.userId}</td><td><span className={`admin-status ${person.isActive ? "" : "admin-status--inactive"}`}>{person.isActive ? "Active" : "Revoked"}</span></td><td>{person.isPrimaryAdmin ? <span className="admin-tag">Primary</span> : "—"}</td><td>{date(person.assignedAt)}</td><td>{canManageStaff && person.isActive && !person.isPrimaryAdmin ? <button className="admin-button admin-button--danger" type="button" onClick={() => void revokeUser(person.userId, `${person.firstName} ${person.lastName}`)} disabled={revoke.isPending} data-testid={`button-revoke-staff-${person.userId}`}><UserRoundX className="h-3.5 w-3.5" /> Revoke</button> : !person.isActive ? <small style={{ color: "#82908a" }}>Access removed {date(person.revokedAt)}</small> : person.isPrimaryAdmin ? <small style={{ color: "#82908a" }}>Protected assignment</small> : "—"}</td></tr>)}</tbody></table></div> : <div className="admin-empty"><ShieldCheck /><h2>No staff assignments</h2><p>Admin access assignments will be listed here.</p></div>}
      <p style={{ margin: 0, padding: ".75rem .85rem", borderTop: "1px solid var(--ops-line)", color: "#77847d", fontSize: ".68rem" }}>Revoking admin access does not delete a customer account. Account, wallet and transaction records are retained.</p>
    </section>
  </>;
}
