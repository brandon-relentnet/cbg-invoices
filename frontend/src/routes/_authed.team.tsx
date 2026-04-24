/**
 * Team management page — list members, invite, remove, resend invite.
 *
 * Flat auth model: any signed-in user can manage the team. The backend uses
 * the Logto Management API (via the configured M2M app) to add/remove users,
 * and sends invite emails via Resend.
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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useUser } from "@/lib/auth";
import {
  memberInitials,
  memberLabel,
  useInviteUser,
  useRemoveUser,
  useUsers,
  type TeamMember,
} from "@/lib/users";

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
  const currentUser = useUser();
  const { data, isLoading, error } = useUsers();
  const invite = useInviteUser();
  const remove = useRemoveUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [lastInvite, setLastInvite] = useState<InviteResult | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);

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

  return (
    <>
      <PageHeader
        title="Team"
        accent="Members"
        subtitle="Invite Cambridge staff and manage access to the invoice portal."
        actions={
          <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlusIcon className="h-4 w-4" />
            Invite member
          </Button>
        }
      />

      {/* Invite-result banner (shown after invite or resend) */}
      {lastInvite && (
        <InviteResultBanner
          invite={lastInvite}
          onDismiss={() => setLastInvite(null)}
        />
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
          <div className="px-6 py-14 text-center">
            <p className="font-display text-lg text-navy">No team members yet.</p>
            <p className="text-sm text-slate-500 mt-1">
              Invite your first teammate using the button above.
            </p>
          </div>
        )}
        {!isLoading && !error && (data?.users.length ?? 0) > 0 && (
          <table className="w-full">
            <thead className="bg-stone/50">
              <tr className="border-b border-stone/60 text-xs font-bold uppercase tracking-widest text-amber">
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Added</th>
                <th className="px-4 py-3 text-left">Last sign-in</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data?.users.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  isYou={m.id === currentUser?.id}
                  onRemove={() => setMemberToRemove(m)}
                  onResend={() => handleResend(m)}
                  resending={resendingId === m.id}
                />
              ))}
            </tbody>
          </table>
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
  isYou,
  onRemove,
  onResend,
  resending,
}: {
  member: TeamMember;
  isYou: boolean;
  onRemove: () => void;
  onResend: () => void;
  resending: boolean;
}) {
  const canResend = Boolean(member.email) && !isYou;
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
            {member.username && (
              <div className="text-xs text-slate-500 font-mono">
                @{member.username}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-600 truncate max-w-[22ch]">
        {member.email || <span className="text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {formatEpochMs(member.created_at)}
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
          <button
            type="button"
            onClick={onRemove}
            disabled={isYou}
            title={isYou ? "You can't remove yourself" : "Remove from team"}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Remove
          </button>
        </div>
      </td>
    </tr>
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
// Invite modal
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
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-graphite/60 flex items-center justify-center z-50 p-4"
          onClick={handleClose}
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="bg-white w-full max-w-md border-t-4 border-amber"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-5 flex items-start justify-between border-b border-stone/60">
              <div>
                <h2 className="font-display text-xl text-navy">Invite member</h2>
                <p className="text-xs text-slate-500 mt-1">
                  We'll email them a one-click sign-in link valid for 7 days.
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="p-1 text-slate-500 hover:text-graphite"
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
                autoFocus
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
            <footer className="px-5 py-4 bg-stone/40 border-t border-stone/60 flex items-center justify-end gap-2">
              <Button type="button" variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={loading}>
                <PlusIcon className="h-4 w-4" />
                Send invite
              </Button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Invite result banner — replaces the old one-time-password banner
// ──────────────────────────────────────────────────────────────────────────

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
      // clipboard unavailable — no-op
    }
  }

  const success = invite.email_sent;
  const verb = invite.was_resend ? "Fresh link sent" : "Invite sent";

  return (
    <div
      className={`mb-4 p-4 border-l-2 flex items-start gap-3 ${
        success
          ? "bg-green-50 border-green-700"
          : "bg-amber/10 border-amber"
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

// ──────────────────────────────────────────────────────────────────────────
// Remove confirmation modal
// ──────────────────────────────────────────────────────────────────────────

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
    <AnimatePresence>
      {open && member && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-graphite/60 flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 16, opacity: 0 }}
            className="bg-white w-full max-w-md border-t-4 border-red-700"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5">
              <h2 className="font-display text-xl text-navy">Remove team member?</h2>
              <p className="text-sm text-slate-600 mt-2">
                <span className="font-semibold">{memberLabel(member)}</span> will lose
                access to the invoice portal immediately. Any invoices they were
                assigned to remain in the system.
              </p>
            </div>
            <footer className="px-5 py-4 bg-stone/40 border-t border-stone/60 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={onConfirm} loading={loading}>
                Remove
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
