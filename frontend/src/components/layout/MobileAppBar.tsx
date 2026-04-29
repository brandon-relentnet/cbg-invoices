/**
 * Sticky top bar for mobile (<md) only.
 *
 * The page registers its title + optional primary action via
 * `useMobileAppBar({ title, action })`. AppShell renders a single
 * MobileAppBar that reads from the same context, so we don't have to
 * remount the bar between routes.
 *
 * On md+ this component does nothing — desktop uses the sidebar + the
 * existing PageHeader inside the page content for hierarchy.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface MobileAppBarState {
  title: string | null;
  /** Optional element rendered on the right (typically an icon button). */
  action: ReactNode | null;
}

interface MobileAppBarContextValue extends MobileAppBarState {
  set: (state: MobileAppBarState) => void;
  reset: () => void;
}

const Ctx = createContext<MobileAppBarContextValue | null>(null);

export function MobileAppBarProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MobileAppBarState>({
    title: null,
    action: null,
  });
  return (
    <Ctx.Provider
      value={{
        ...state,
        set: setState,
        reset: () => setState({ title: null, action: null }),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

/**
 * Pages call this to drive the mobile top bar.
 *
 * Usage:
 *   useMobileAppBar({
 *     title: "Invoices",
 *     action: <button>Upload</button>,
 *   });
 */
export function useMobileAppBar({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}): void {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error("useMobileAppBar must be used inside MobileAppBarProvider");
  }
  useEffect(() => {
    ctx.set({ title, action: action ?? null });
    return () => ctx.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, action]);
}

/**
 * Renders the actual sticky bar. Read-only consumer of the context.
 */
export function MobileAppBar() {
  const ctx = useContext(Ctx);
  const title = ctx?.title;
  const action = ctx?.action;

  return (
    <header className="md:hidden sticky top-0 z-20 h-14 bg-white border-b border-stone/80 flex items-center justify-between px-4 flex-shrink-0">
      <div className="min-w-0 flex items-baseline gap-2">
        {title ? (
          <span className="font-display text-xl text-navy leading-none truncate">
            {title}
          </span>
        ) : (
          // Fallback wordmark when a route forgets to set a title
          <>
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber">
              Cambridge
            </span>
            <span className="font-display text-base text-navy leading-none">
              Portal
            </span>
          </>
        )}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  );
}
