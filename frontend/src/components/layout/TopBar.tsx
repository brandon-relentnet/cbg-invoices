/**
 * Desktop-only section banner. Mobile uses MobileAppBar instead.
 */
export function TopBar() {
  return (
    <header className="hidden md:flex h-14 bg-white border-b border-stone/80 items-center justify-between px-6 flex-shrink-0">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Accounts Payable
      </div>
    </header>
  );
}
