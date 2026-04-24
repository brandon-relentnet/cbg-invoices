import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { useUsers, memberLabel, type TeamMember } from "@/lib/users";

interface Props {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Allow "no one" to be submitted. Useful for pending-without-assignee. */
  allowEmpty?: boolean;
  onClose: () => void;
  onSelect: (user: TeamMember | null) => void;
  loading?: boolean;
}

export function AssigneePicker({
  open,
  title,
  description,
  confirmLabel = "Assign",
  allowEmpty = false,
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
    if (!selectedId) {
      if (allowEmpty) {
        onSelect(null);
      }
      return;
    }
    const member = data?.users.find((m) => m.id === selectedId);
    if (member) onSelect(member);
  }

  return (
    <AnimatePresence>
      {open && (
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
            transition={{ duration: 0.15 }}
            className="bg-white w-full max-w-lg border-t-4 border-amber flex flex-col max-h-[80vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="p-5 flex items-start justify-between border-b border-stone/60">
              <div>
                <h2 className="font-display text-xl text-navy">{title}</h2>
                {description && (
                  <p className="text-xs text-slate-500 mt-1">{description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-500 hover:text-graphite"
                aria-label="Close"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </header>

            <div className="p-5 pb-2">
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email…"
                className="block w-full p-2 text-sm border border-slate-300 bg-stone/50 focus:outline-none focus:border-amber focus:ring-1 focus:ring-amber"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-2">
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
                        className={`w-full text-left py-2.5 px-2 flex items-center gap-3 transition-colors ${
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

            <footer className="p-5 bg-stone/40 border-t border-stone/60 flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              {allowEmpty && (
                <Button
                  variant="secondary"
                  onClick={() => onSelect(null)}
                  disabled={loading}
                >
                  Skip assignment
                </Button>
              )}
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={!selectedId || loading}
                loading={loading}
              >
                {confirmLabel}
              </Button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
