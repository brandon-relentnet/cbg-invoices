/**
 * Team management page — list members, invite, remove.
 *
 * Flat auth model: any signed-in user can manage the team. The backend uses
 * the Logto Management API (via the configured M2M app) to add/remove users.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ClipboardDocumentIcon,
  PlusIcon,
  ShieldCheckIcon,
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

function TeamPage() {
  const currentUser = useUser();
  const { data, isLoading, error } = useUsers();
  const invite = useInviteUser();
  const remove = useRemoveUser();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);
  const [lastInvite, setLastInvite] = useState<
    | { email: string; name: string | null; password: string }
    | null
  >(null);

  async function handleInvite(payload: { email: string; name: string }) {
    const res = await invite.mutateAsync({
      email: payload.email,
      name: payload.name || undefined,
    });
    setInviteOpen(false);
    setLastInvite({
      email: res.user.email ?? payload.email,
      name: res.user.name ?? payload.name ?? null,
      password: res.temporary_password,
    });
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

      {/* Fresh-invite credentials banner */}
      {lastInvite && (
        <InviteCredentialsBanner
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
}: {
  member: TeamMember;
  isYou: boolean;
  onRemove: () => void;
}) {
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
        {formatEpochMs(member.last_sign_in_at)}
      </td>
      <td className="px-4 py-3 text-right">
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

  // Reset fields when closed
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
                  We'll generate a one-time password you can share with them.
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
// Credentials banner (shown after successful invite)
// ──────────────────────────────────────────────────────────────────────────

function InviteCredentialsBanner({
  invite,
  onDismiss,
}: {
  invite: { email: string; name: string | null; password: string };
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const snippet = [
    `Email: ${invite.email}`,
    `Temporary password: ${invite.password}`,
    "Sign in at the portal and change your password on first login.",
  ].join("\n");

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  }

  return (
    <div className="mb-4 bg-green-50 border-l-2 border-green-700 p-4">
      <div className="flex items-start gap-3">
        <ShieldCheckIcon className="h-5 w-5 text-green-700 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-green-900">
            Invited {invite.name || invite.email}. Share these credentials securely:
          </p>
          <div className="mt-2 bg-white border border-green-700/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {snippet}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              <ClipboardDocumentIcon className="h-4 w-4" />
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
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
