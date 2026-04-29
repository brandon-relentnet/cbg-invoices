/**
 * Team management page — list members, invite, remove, resend invite,
 * change roles.
 *
 * Role rules (enforced by the backend; UI mirrors for clarity):
 *   - Only admins and owners can see the "Invite member" button
 *   - Only admins and owners can invite, resend invites, or change roles
 *   - Only the owner can promote anyone to admin or demote an admin
 *   - The owner can't be removed; admins can only remove members
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  PaperAirplaneIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { PageHeader } from "@/components/layout/AppShell";
import { useMobileAppBar } from "@/components/layout/MobileAppBar";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  memberInitials,
  memberLabel,
  roleRankDelta,
  useChangeRole,
  useInviteUser,
  useMe,
  useRemoveUser,
  useUsers,
  type AppRole,
  type TeamMember,
} from "@/lib/users";
import {
  useAccessRequests,
  useApproveAccessRequest,
  useDismissAccessRequest,
} from "@/lib/accessRequests";
import type { AccessRequest } from "@/types";

export const Route = createFileRoute("/_authed/team")({
  component: TeamPage,
});

interface InviteResult {
  email: string;
  name: string | null;
  invite_link: string;
  email_sent: boolean;
  fallback_notice: string | null;
  was_resend: boolean;
}

function TeamPage() {
  const meQuery = useMe();
  const me = meQuery.data ?? null;
  const { data, isLoading, error } = useUsers();
  const invite = useInviteUser();
  const remove = useRemoveUser();
  const changeRole = useChangeRole();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const canManage = me?.role === "owner" || me?.role === "admin";
  const isOwner = me?.role === "owner";

  useMobileAppBar({
    title: "Team",
    action: canManage ? (
      <button
        type="button"
        onClick={() => setInviteOpen(true)}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-xs font-bold uppercase tracking-wider text-navy hover:text-amber"
        aria-label="Invite member"
      >
        <UserPlusIcon className="h-4 w-4" />
        Invite
      </button>
    ) : null,
  });

  async function handleInvite(payload: { email: string; name: string }) {
    const res = await invite.mutateAsync({
      email: payload.email,
      name: payload.name || undefined,
    });
    setInviteOpen(false);
    setLastInvite({
      email: res.user.email ?? payload.email,
      name: res.user.name ?? payload.name ?? null,
      invite_link: res.invite_link,
      email_sent: res.email_sent,
      fallback_notice: res.fallback_notice,
      was_resend: false,
    });
  }

  async function handleResend(member: TeamMember) {
    if (!member.email) return;
    setResendingId(member.id);
    try {
      const res = await invite.mutateAsync({
        email: member.email,
        name: member.name ?? undefined,
      });
      setLastInvite({
        email: member.email,
        name: member.name,
        invite_link: res.invite_link,
        email_sent: res.email_sent,
        fallback_notice: res.fallback_notice,
        was_resend: true,
      });
    } finally {
      setResendingId(null);
    }
  }

  async function handleRemove() {
    if (!memberToRemove) return;
    await remove.mutateAsync(memberToRemove.id);
    setMemberToRemove(null);
  }

  async function handleRoleChange(member: TeamMember, role: AppRole) {
    if (role === member.role) return;
    await changeRole.mutateAsync({ userId: member.id, role });
  }

  return (
    <>
      <PageHeader
        title="Team"
        accent="Members"
        subtitle={
          canManage
            ? "Invite Cambridge staff and manage access to the invoice portal."
            : "Your team's members. Ask an admin if you need to invite someone."
        }
        actions={
          canManage ? (
            <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlusIcon className="h-4 w-4" />
              Invite member
            </Button>
          ) : undefined
        }
      />

      {/* Pending access requests — visible only to admins+ when count > 0 */}
      {canManage && <AccessRequestsSection />}

      {lastInvite && (
        <InviteResultBanner
          invite={lastInvite}
          onDismiss={() => setLastInvite(null)}
        />
      )}

      {!canManage && me && (
        <div className="mb-4 p-3 bg-white border-l-2 border-slate-300 text-xs text-slate-500">
          You're signed in as a <strong className="text-graphite">member</strong> — you can
          see the team but not make changes. Ask an admin to adjust roles or invite
          new people.
        </div>
      )}

      <div className="bg-white border-t-4 border-amber">
        {isLoading && (
          <div className="px-6 py-10 text-center text-sm text-slate-500">
            Loading team…
          </div>
        )}
        {error && (
          <div className="px-6 py-10 text-sm text-red-700">
            Failed to load team: {(error as Error).message}
            {(error as Error).message.includes("not configured") && (
              <div className="text-xs text-slate-500 mt-2">
                Set <code>LOGTO_M2M_APP_ID</code> / <code>LOGTO_M2M_APP_SECRET</code> in
                the backend environment, then <code>make restart</code>.
              </div>
            )}
          </div>
        )}
        {!isLoading && !error && (data?.users.length ?? 0) === 0 && (
          <EmptyState
            Icon={UsersIcon}
            title="No team members yet"
            body={
              canManage
                ? "You're the first one in. Invite teammates and they'll get a magic-link sign-in."
                : "An admin will need to invite teammates."
            }
            cta={
              canManage ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setInviteOpen(true)}
                >
                  <UserPlusIcon className="h-4 w-4" />
                  Invite member
                </Button>
              ) : undefined
            }
          />
        )}
        {!isLoading && !error && (data?.users.length ?? 0) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-stone/50">
                <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Email</th>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Last sign-in</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {data?.users.map((m) => (
                  <MemberRow
                    key={m.id}
                    member={m}
                    me={me}
                    canManage={canManage}
                    isOwner={isOwner}
                    onRemove={() => setMemberToRemove(m)}
                    onResend={() => handleResend(m)}
                    onChangeRole={(role) => handleRoleChange(m, role)}
                    resending={resendingId === m.id}
                    roleChangePending={changeRole.isPending}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <InviteModal
        open={inviteOpen}
        loading={invite.isPending}
        error={invite.error as Error | null}
        onClose={() => setInviteOpen(false)}
        onSubmit={handleInvite}
      />

      <RemoveModal
        open={memberToRemove !== null}
        member={memberToRemove}
        loading={remove.isPending}
        onClose={() => setMemberToRemove(null)}
        onConfirm={handleRemove}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Member row
// ──────────────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  me,
  canManage,
  isOwner,
  onRemove,
  onResend,
  onChangeRole,
  resending,
  roleChangePending,
}: {
  member: TeamMember;
  me: TeamMember | null;
  canManage: boolean;
  isOwner: boolean;
  onRemove: () => void;
  onResend: () => void;
  onChangeRole: (role: AppRole) => void;
  resending: boolean;
  roleChangePending: boolean;
}) {
  const isYou = member.id === me?.id;
  const memberIsOwner = member.role === "owner";
  const memberIsAdmin = member.role === "admin";

  // Role-change gate: admins can only touch members (not other admins, not owner).
  // Owner can touch anyone except themselves.
  const canChangeRole =
    canManage &&
    !isYou &&
    (isOwner ? !memberIsOwner : !memberIsOwner && !memberIsAdmin);

  // Remove gate mirrors the backend:
  //   - can't remove self
  //   - can't remove owner
  //   - admins can only remove members (not other admins)
  const canRemove =
    canManage &&
    !isYou &&
    !memberIsOwner &&
    (isOwner || !memberIsAdmin);

  const canResend = canManage && Boolean(member.email) && !isYou;

  return (
    <tr className="border-b border-stone/60 hover:bg-amber/5 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="inline-flex items-center justify-center h-8 w-8 bg-navy text-stone text-xs font-semibold tracking-wider"
          >
            {memberInitials(member)}
          </span>
          <div>
            <div className="text-sm font-semibold text-graphite">
              {memberLabel(member)}
              {isYou && (
                <span className="ml-2 text-[10px] uppercase tracking-widest text-amber font-bold">
                  · You
                </span>
              )}
            </div>
            {member.needs_password && (
              <div className="text-[10px] uppercase tracking-wider text-amber mt-0.5">
                Password not set yet
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 truncate max-w-[22ch]">
        {member.email || <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3">
        {canChangeRole ? (
          <RoleSelect
            current={member.role}
            onChange={onChangeRole}
            disabled={roleChangePending}
            canPromoteToOwner={isOwner}
          />
        ) : (
          <RoleStaticBadge role={member.role} />
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {member.last_sign_in_at
          ? formatEpochMs(member.last_sign_in_at)
          : <span className="text-slate-400 italic">Never signed in</span>}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <div className="flex items-center gap-3 justify-end">
          {canResend && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-navy disabled:opacity-50"
              title="Send a fresh invite email with a new magic link"
            >
              {resending ? (
                <span
                  aria-hidden
                  className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                />
              ) : (
                <PaperAirplaneIcon className="h-3.5 w-3.5" />
              )}
              {resending ? "Sending…" : "Resend invite"}
            </button>
          )}
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              title="Remove from team"
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700"
            >
              <TrashIcon className="h-3.5 w-3.5" />
              Remove
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

function RoleSelect({
  current,
  onChange,
  disabled,
  canPromoteToOwner,
}: {
  current: AppRole | null;
  onChange: (role: AppRole) => void;
  disabled?: boolean;
  canPromoteToOwner: boolean;
}) {
  return (
    <Select
      labelTone="quiet"
      size="sm"
      value={current ?? "member"}
      onChange={(e) => onChange(e.target.value as AppRole)}
      disabled={disabled}
      className="min-w-[9rem]"
    >
      <option value="member">Member</option>
      <option value="admin">Admin</option>
      {canPromoteToOwner && <option value="owner">Owner (hand off)</option>}
    </Select>
  );
}

function RoleStaticBadge({ role }: { role: AppRole | null }) {
  const cfg: Record<AppRole, { label: string; cls: string }> = {
    owner: { label: "Owner", cls: "bg-amber/20 text-navy border-amber" },
    admin: { label: "Admin", cls: "bg-navy text-stone border-navy" },
    member: { label: "Member", cls: "bg-slate-100 text-slate-700 border-slate-300" },
  };
  const key = role ?? "member";
  return (
    <span
      className={`inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 border ${cfg[key].cls}`}
    >
      {cfg[key].label}
    </span>
  );
}

function formatEpochMs(ms: number | null): string {
  if (!ms) return "—";
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Access requests section (admin-only; hidden when no pending)
// ──────────────────────────────────────────────────────────────────────────

function AccessRequestsSection() {
  const { data, error } = useAccessRequests();

  // 403 means the current user isn't admin enough to see the queue — that's
  // expected for member accounts (the parent already gates on canManage so
  // this is just defense in depth).
  if (error) {
    const e = error as { status?: number };
    if (e.status === 403) return null;
  }

  const pending = data?.requests ?? [];
  if (!data || pending.length === 0) return null;

  return (
    <div className="mb-6 bg-white border-t-4 border-amber">
      <div className="px-5 py-4 border-b border-stone/60 flex items-baseline justify-between">
        <div>
          <h3 className="font-display text-lg text-navy leading-none">
            Pending access {pending.length === 1 ? "request" : "requests"}
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Submitted from the public landing page. Approve to send an
            invite link, or dismiss to discard.
          </p>
        </div>
        <span className="inline-block bg-amber text-navy text-xs font-bold uppercase tracking-widest px-2 py-1">
          {pending.length}
        </span>
      </div>
      <ul className="divide-y divide-stone/60">
        {pending.map((req) => (
          <AccessRequestRow key={req.id} request={req} />
        ))}
      </ul>
    </div>
  );
}

function AccessRequestRow({ request }: { request: AccessRequest }) {
  const approve = useApproveAccessRequest();
  const dismiss = useDismissAccessRequest();
  const busy = approve.isPending || dismiss.isPending;
  const errorMsg =
    (approve.error as Error | null)?.message ??
    (dismiss.error as Error | null)?.message ??
    null;

  return (
    <li className="px-4 sm:px-5 py-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-graphite break-words">
          {request.name ? `${request.name} · ` : ""}
          <span className="font-mono text-graphite/85 break-all">
            {request.email}
          </span>
        </div>
        {request.message && (
          <p className="text-sm text-slate-600 mt-1 leading-relaxed whitespace-pre-line">
            {request.message}
          </p>
        )}
        <div className="text-[10px] uppercase tracking-widest text-slate-400 mt-2">
          Submitted {formatRelative(request.created_at)}
        </div>
        {errorMsg && (
          <div className="mt-2 text-xs text-red-700">{errorMsg}</div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 sm:justify-end">
        <button
          type="button"
          onClick={() => dismiss.mutate(request.id)}
          disabled={busy}
          className="text-xs text-slate-500 hover:text-red-700 px-2 py-1 disabled:opacity-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={() => approve.mutate(request.id)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 bg-amber text-navy text-xs font-semibold px-3 py-1.5 hover:bg-amber/90 disabled:opacity-50 disabled:cursor-wait"
        >
          {approve.isPending && (
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full border-2 border-current border-r-transparent animate-spin"
            />
          )}
          Approve & invite
        </button>
      </div>
    </li>
  );
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// ──────────────────────────────────────────────────────────────────────────
// Modals / banners (unchanged from previous)
// ──────────────────────────────────────────────────────────────────────────

function InviteModal({
  open,
  loading,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  loading: boolean;
  error: Error | null;
  onClose: () => void;
  onSubmit: (payload: { email: string; name: string }) => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    onSubmit({ email: email.trim(), name: name.trim() });
  }

  function handleClose() {
    setEmail("");
    setName("");
    onClose();
  }

  return (
    <BottomSheet open={open} onClose={handleClose} ariaLabel="Invite member">
      <form onSubmit={handleSubmit}>
        <header className="p-5 flex items-start justify-between border-b border-stone/60">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-navy">Invite member</h2>
            <p className="text-xs text-slate-500 mt-1">
              We'll email them a one-click sign-in link valid for 7 days. They
              start as a Member — promote them later if needed.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 -mr-2 text-slate-500 hover:text-graphite flex-shrink-0"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>
        <div className="p-5 space-y-4">
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="teammate@cambridgebg.com"
          />
          <Input
            label="Name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex Smith"
          />
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border-l-2 border-red-700 px-3 py-2">
              {error.message}
            </p>
          )}
        </div>
        <footer className="px-5 py-4 bg-stone/40 border-t border-stone/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <Button type="button" variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            <PlusIcon className="h-4 w-4" />
            Send invite
          </Button>
        </footer>
      </form>
    </BottomSheet>
  );
}

function InviteResultBanner({
  invite,
  onDismiss,
}: {
  invite: InviteResult;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(invite.invite_link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  const success = invite.email_sent;
  const verb = invite.was_resend ? "Fresh link sent" : "Invite sent";

  return (
    <div
      className={`mb-4 p-4 border-l-2 flex items-start gap-3 ${
        success ? "bg-green-50 border-green-700" : "bg-amber/10 border-amber"
      }`}
    >
      {success ? (
        <CheckCircleIcon className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
      ) : (
        <ExclamationTriangleIcon className="h-5 w-5 text-amber flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm font-semibold ${
            success ? "text-green-900" : "text-navy"
          }`}
        >
          {success
            ? `${verb} to ${invite.name || invite.email}`
            : "Couldn't send the email automatically"}
        </p>
        {invite.fallback_notice && (
          <p className="text-xs text-graphite mt-1">{invite.fallback_notice}</p>
        )}
        {!success && (
          <p className="text-xs text-graphite mt-1">
            Share the link below with {invite.name || invite.email} via any
            channel — they'll land on the portal already signed in.
          </p>
        )}
        <div className="mt-2 bg-white border border-slate-300 p-2 font-mono text-xs break-all">
          {invite.invite_link}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleCopy}>
            <ClipboardDocumentIcon className="h-4 w-4" />
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  );
}

function RemoveModal({
  open,
  member,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  member: TeamMember | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open && !!member} onClose={onClose} ariaLabel="Remove team member">
      {member && (
        <>
          <div className="p-5">
            <h2 className="font-display text-xl text-navy">Remove team member?</h2>
            <p className="text-sm text-slate-600 mt-2">
              <span className="font-semibold">{memberLabel(member)}</span> will
              lose access to the invoice portal immediately. Any invoices they
              were assigned to remain in the system.
            </p>
          </div>
          <footer className="px-5 py-4 bg-stone/40 border-t border-stone/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirm}
              loading={loading}
            >
              Remove
            </Button>
          </footer>
        </>
      )}
    </BottomSheet>
  );
}
