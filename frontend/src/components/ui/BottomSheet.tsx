/**
 * Responsive sheet/modal primitive.
 *
 * - On <md: slides up from the bottom of the screen as a bottom sheet
 *   with a drag handle. max-h-[85dvh] with internal scroll. Honors
 *   env(safe-area-inset-bottom) so the content doesn't crowd the
 *   iPhone home indicator.
 *
 * - On md+: renders as a centered modal card with the same chrome
 *   (header / body / drag-handle suppressed).
 *
 * Click backdrop / Esc / drag-down past 80px closes. Body scroll is
 * locked while open.
 *
 * Existing modal contents move inside <BottomSheet>{children}</BottomSheet>
 * with no other code changes — the close button + title chrome lives in
 * the children, the wrapper handles animation, dismiss, and layout.
 */
import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Optional max-width for desktop centered layout. Defaults to `max-w-md`. */
  maxWidth?: string;
  /** ARIA label for the dialog (use a clear short string). */
  ariaLabel?: string;
  /**
   * If false, Esc / backdrop / drag-down won't close the sheet. The owning
   * component is fully responsible for any dismiss UX. Useful for forced
   * flows like the password setup modal.
   */
  dismissable?: boolean;
  children: ReactNode;
}

const DRAG_DISMISS_PX = 80;

export function BottomSheet({
  open,
  onClose,
  maxWidth = "max-w-md",
  ariaLabel,
  dismissable = true,
  children,
}: BottomSheetProps) {
  // Esc closes
  useEffect(() => {
    if (!open || !dismissable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, dismissable]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function onDragEnd(_e: unknown, info: PanInfo) {
    if (!dismissable) return;
    if (info.offset.y > DRAG_DISMISS_PX || info.velocity.y > 500) {
      onClose();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // Mobile: bottom-anchored. Desktop: centered.
          className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center md:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          {dismissable ? (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="absolute inset-0 bg-graphite/40 md:bg-graphite/60"
            />
          ) : (
            <div
              aria-hidden
              className="absolute inset-0 bg-graphite/40 md:bg-graphite/60"
            />
          )}

          {/* Sheet/Modal container */}
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={ariaLabel}
            initial={{ y: "100%", opacity: 0, scale: 1 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "tween", duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            // Drag-down dismiss on mobile only — Motion's drag prop respects
            // touchAction so it doesn't interfere with vertical scrolling
            // inside the sheet.
            drag={dismissable ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={onDragEnd}
            className={[
              // Mobile: bottom sheet. Full width, max-h with internal scroll.
              "relative w-full bg-white border-t-4 border-amber",
              "max-h-[85dvh] overflow-y-auto",
              "md:rounded-none",
              // Desktop: centered card.
              `md:max-w-md md:w-full md:max-h-[90vh] md:${maxWidth.replace("max-w-", "max-w-")}`,
              maxWidth,
            ].join(" ")}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Drag handle — mobile only, hidden when not dismissable */}
            {dismissable && (
              <div className="md:hidden pt-2 pb-1 flex items-center justify-center">
                <span className="block h-1 w-10 bg-slate-300 rounded-full" />
              </div>
            )}

            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
