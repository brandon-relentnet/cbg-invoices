/**
 * Team management hooks — wraps the /api/users endpoints which proxy to
 * Logto's Management API.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export interface TeamMember {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  created_at: number;
  last_sign_in_at: number | null;
}

interface UsersResponse {
  users: TeamMember[];
}

interface InviteResponse {
  user: TeamMember;
  /** Magic-link URL. Always returned. */
  invite_link: string;
  /** True when Resend accepted the email. */
  email_sent: boolean;
  email_message_id: string | null;
  /** Populated when email couldn't send and admin needs to share the link manually. */
  fallback_notice: string | null;
}

const USERS_KEY = ["users"] as const;

export function useUsers(opts?: { enabled?: boolean }) {
  const { request } = useApi();
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: () => request<UsersResponse>("/api/users"),
    staleTime: 60_000,
    enabled: opts?.enabled ?? true,
  });
}

export function useInviteUser() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { email: string; name?: string }) =>
      request<InviteResponse>("/api/users/invite", {
        method: "POST",
        body: payload as unknown as BodyInit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

export function useRemoveUser() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      request<null>(`/api/users/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

/** Convenience label that falls back sensibly across missing fields. */
export function memberLabel(m: TeamMember): string {
  return m.name?.trim() || m.email || m.username || m.id;
}

export function memberInitials(m: TeamMember): string {
  const source = m.name?.trim() || m.email || m.username || "??";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
