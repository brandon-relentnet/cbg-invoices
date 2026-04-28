/**
 * PasswordSetupModal — shown when the signed-in user has `needs_password`
 * set on their Logto custom data (i.e., they were invited via magic link and
 * haven't chosen a password yet).
 *
 * Non-dismissable: the user must set a password before they can continue.
 * This is enforced visually (no close button, ESC doesn't close, backdrop
 * click does nothing) but not backend-enforced — our API still honors their
 * session.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useSetMyPassword } from "@/lib/users";

const POLICY_RULES = [
  "At least 8 characters",
  "Include 3 of: lowercase, UPPERCASE, number, symbol",
];

export function PasswordSetupModal({ open }: { open: boolean }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const set = useSetMyPassword();

  const pw = password;
  const lengthOk = pw.length >= 8;
  const classes = [
    /[a-z]/.test(pw),
    /[A-Z]/.test(pw),
    /\d/.test(pw),
    /[^\w\s]/.test(pw),
  ];
  const classesOk = classes.filter(Boolean).length >= 3;
  const canSubmit =
    lengthOk && classesOk && password.length > 0 && password === confirm && !set.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    await set.mutateAsync(password);
    setPassword("");
    setConfirm("");
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-graphite/75 flex items-center justify-center z-50 p-4"
        >
          <motion.form
            onSubmit={handleSubmit}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="bg-white w-full max-w-md border-t-4 border-amber max-h-[90vh] overflow-y-auto"
          >
            <header className="p-6 pb-4 border-b border-stone/60">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-9 w-9 bg-amber/20 text-amber rounded-none">
                  <LockClosedIcon className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="font-display text-xl text-navy leading-tight">
                    Set your password
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    One last step before you start using the portal.
                  </p>
                </div>
              </div>
            </header>

            <div className="p-6 space-y-4">
              <p className="text-sm text-graphite">
                You signed in via an invite link. Choose a password so you can
                sign in directly next time — you can always use another magic
                link later if you forget it.
              </p>

              <Input
                label="New password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setMismatch(false);
                }}
                autoComplete="new-password"
              />

              <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setMismatch(false);
                }}
                autoComplete="new-password"
                error={mismatch ? "Passwords don't match" : undefined}
              />

              {/* Policy checklist */}
              <ul className="text-xs space-y-1 border-l-2 border-slate-200 pl-3">
                <PolicyItem ok={lengthOk}>{POLICY_RULES[0]}</PolicyItem>
                <PolicyItem ok={classesOk}>{POLICY_RULES[1]}</PolicyItem>
              </ul>

              {set.error && (
                <p className="text-sm text-red-700 bg-red-50 border-l-2 border-red-700 px-3 py-2">
                  {(set.error as Error).message}
                </p>
              )}
            </div>

            <footer className="px-6 py-4 bg-stone/40 border-t border-stone/60 flex items-center justify-end">
              <Button
                type="submit"
                variant="primary"
                loading={set.isPending}
                disabled={!canSubmit}
              >
                Set password &amp; continue
              </Button>
            </footer>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PolicyItem({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className={ok ? "text-green-700" : "text-slate-500"}>
      <span aria-hidden className="inline-block mr-1.5 w-3 text-center">
        {ok ? "✓" : "·"}
      </span>
      {children}
    </li>
  );
}
