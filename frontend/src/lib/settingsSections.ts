/**
 * The settings page is one scrollable page of sections. This shared list
 * drives the in-sidebar jump nav (shown while on /settings) and matches the
 * anchor ids set on each section's <Card> in the settings route.
 */
export interface SettingsSection {
  /** Matches the `id` on the section's Card in the settings page. */
  id: string;
  label: string;
  /** Only rendered (and only worth linking) when QuickBooks is connected. */
  requiresQbo?: boolean;
}

export const SETTINGS_SECTIONS: SettingsSection[] = [
  { id: "account", label: "Account" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "sync", label: "Sync settings", requiresQbo: true },
  { id: "coding", label: "AP coding" },
  { id: "domains", label: "Trusted senders" },
  { id: "my-notifications", label: "My notifications" },
  { id: "notifications", label: "Notifications" },
];
