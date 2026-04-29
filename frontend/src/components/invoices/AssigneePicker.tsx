import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useUsers, memberLabel, type TeamMember } from "@/lib/users";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  onClose: () => void;
  onSelect: (user: TeamMember | null) => void;
  loading?: boolean;
}

export function AssigneePicker({
  open,
  title,
  description,
  confirmLabel = "Assign",
  onClose,
  onSelect,
  loading,
}: Props) {
  const { data, isLoading, error } = useUsers({ enabled: open });
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const members = (data?.users ?? []).filter((m) => {
    if (!query) return true;
    const needle = query.toLowerCase();
    return (
      m.email?.toLowerCase().includes(needle) ||
      m.name?.toLowerCase().includes(needle) ||
      m.username?.toLowerCase().includes(needle)
    );
  });

  function handleConfirm() {
    if (!selectedId) return;
    const member = data?.users.find((m) => m.id === selectedId);
    if (member) onSelect(member);
  }

  return (
    <BottomSheet open={open} onClose={onClose} ariaLabel={title} maxWidth="max-w-lg">
      <div className="flex flex-col">
        <header className="p-5 flex items-start justify-between border-b border-stone/60">
          <div className="min-w-0">
            <h2 className="font-display text-xl text-navy">{title}</h2>
            {description && (
              <p className="text-xs text-slate-500 mt-1">{description}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-2 text-slate-500 hover:text-graphite flex-shrink-0"
            aria-label="Close"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </header>

        <div className="p-5 pb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or email…"
            className="block w-full min-h-[44px] p-3 text-base md:text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
          />
        </div>

        <div className="px-5 pb-2 max-h-[55vh] overflow-y-auto">
          {isLoading && (
            <div className="py-8 text-center text-sm text-slate-500">
              Loading team…
            </div>
          )}
          {error && (
            <div className="py-4 text-sm text-red-700">
              Failed to load team: {(error as Error).message}
            </div>
          )}
          {!isLoading && !error && members.length === 0 && (
            <div className="py-6 text-center text-sm text-slate-500">
              {query ? "No team members match." : "No team members yet."}
            </div>
          )}
          <ul className="divide-y divide-stone/60">
            {members.map((m) => {
              const isSelected = selectedId === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(m.id)}
                    className={`w-full text-left min-h-[56px] py-3 px-3 flex items-center gap-3 transition-colors ${
                      isSelected
                        ? "bg-amber/10 border-l-2 border-amber"
                        : "hover:bg-stone/40 border-l-2 border-transparent"
                    }`}
                  >
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-graphite truncate">
                        {memberLabel(m)}
                      </span>
                      {m.email && m.name && (
                        <span className="block text-xs text-slate-500 truncate">
                          {m.email}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="p-5 bg-stone/40 border-t border-stone/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!selectedId || loading}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </footer>
      </div>
    </BottomSheet>
  );
}
