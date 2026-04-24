/**
 * Simple top bar. Account info + sign-out now live in the sidebar's
 * AccountCard so this bar is just a section banner.
 */

export function TopBar() {
  return (
    <header className="h-14 bg-white border-b border-stone/80 flex items-center justify-between px-6 flex-shrink-0">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Accounts Payable
      </div>
    </header>
  );
}
