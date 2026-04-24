import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { ArrowRightEndOnRectangleIcon } from "@heroicons/react/24/outline";

export function TopBar() {
  const { user, signOut } = useAuth();

  return (
    <header className="h-14 bg-white border-b border-stone/80 flex items-center justify-between px-6 flex-shrink-0">
      <div className="text-xs font-bold uppercase tracking-widest text-slate-500">
        Accounts Payable
      </div>

      <div className="flex items-center gap-4">
        {user?.email && (
          <div className="text-sm">
            <span className="text-slate-500">Signed in as </span>
            <span className="text-navy font-semibold">{user.name ?? user.email}</span>
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={signOut} title="Sign out">
          <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
          Sign out
        </Button>
      </div>
    </header>
  );
}
