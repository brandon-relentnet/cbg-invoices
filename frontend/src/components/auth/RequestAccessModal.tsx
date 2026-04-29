/**
 * Public "Request access" modal shown from the landing page.
 *
 * Submits {email, name?, message?} to POST /api/access-requests.
 * On success: shows a friendly confirmation and offers to close.
 *
 * Uses BottomSheet so on mobile it slides up from the bottom; on desktop
 * it renders as a centered modal card.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useSubmitAccessRequest } from "@/lib/accessRequests";

export function RequestAccessModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const submit = useSubmitAccessRequest();
  const emailRef = useRef<HTMLInputElement>(null);

  // Reset form when reopened
  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setMessage("");
      submit.reset();
      // Focus first field after the sheet has had a frame to mount.
      // Skip on touch devices to avoid the iOS keyboard popping up
      // immediately and disrupting the slide-up animation.
      const isTouch = typeof window !== "undefined" && "ontouchstart" in window;
      if (!isTouch) {
        requestAnimationFrame(() => emailRef.current?.focus());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    submit.mutate({
      email: email.trim(),
      name: name.trim() || undefined,
      message: message.trim() || undefined,
    });
  };

  const success = submit.isSuccess;
  const errorMsg = submit.error instanceof Error ? submit.error.message : null;

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel="Request access">
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 p-2 text-graphite/60 hover:text-navy transition-colors"
        >
          <XMarkIcon className="h-5 w-5" />
        </button>

        <div className="px-6 sm:px-8 pt-6 pb-6 sm:pt-8 sm:pb-8">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber">
            Cambridge
          </div>
          <h2 className="font-display text-2xl text-navy mt-1">
            {success ? "Request received" : "Request access"}
          </h2>

          {success ? (
            <div className="mt-6 space-y-4">
              <div className="flex items-start gap-3 text-sm text-graphite">
                <CheckCircleIcon
                  className="h-5 w-5 text-green-700 mt-0.5 flex-shrink-0"
                  aria-hidden
                />
                <p>
                  Thanks — an admin will review your request and email an invite
                  link if approved.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-navy text-stone font-semibold min-h-[44px] px-4 py-2.5 text-sm hover:bg-navy/90 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <p className="text-sm text-graphite/85 leading-relaxed">
                Tell us who you are and an admin will get back to you with an
                invite link.
              </p>

              <Field label="Email" required>
                <input
                  ref={emailRef}
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full min-h-[44px] p-3 border border-slate-300 bg-stone/50 text-graphite text-base md:text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                />
              </Field>

              <Field label="Your name (optional)">
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full min-h-[44px] p-3 border border-slate-300 bg-stone/50 text-graphite text-base md:text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
                />
              </Field>

              <Field label="Why do you need access? (optional)">
                <textarea
                  rows={3}
                  maxLength={2000}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="e.g. PM on the Davidson project, need to review subcontractor invoices."
                  className="block w-full p-3 border border-slate-300 bg-stone/50 text-graphite text-base md:text-sm focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber resize-none"
                />
              </Field>

              {errorMsg && (
                <div
                  role="alert"
                  className="text-sm text-red-800 bg-red-50 border-l-2 border-red-700 px-3 py-2"
                >
                  {errorMsg}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-transparent text-navy border-2 border-navy font-semibold min-h-[44px] px-4 py-2.5 text-sm hover:bg-navy hover:text-stone transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!email.trim() || submit.isPending}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-amber text-navy font-semibold min-h-[44px] px-4 py-2.5 text-sm hover:bg-amber/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submit.isPending && (
                    <span
                      aria-hidden
                      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-r-transparent animate-spin"
                    />
                  )}
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-graphite mb-1">
        {label}
        {required && <span className="text-amber"> *</span>}
      </div>
      {children}
    </label>
  );
}
