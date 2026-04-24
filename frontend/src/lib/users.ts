/**
 * Team management hooks — wraps the /api/users endpoints which proxy to
 * Logto's Management API.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApi } from "@/lib/api";

export type AppRole = "owner" | "admin" | "member";

export const ROLE_RANK: Record<AppRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export interface TeamMember {
  id: string;
  email: string | null;
  name: string | null;
  username: string | null;
  role: AppRole | null;
  needs_password: boolean;
  created_at: number;
  last_sign_in_at: number | null;
}

export interface MeInfo extends TeamMember {}

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

const ME_KEY = ["users", "me"] as const;

export function useMe() {
  const { request } = useApi();
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => request<MeInfo>("/api/users/me"),
    staleTime: 30_000,
    // 410 = stale session (user deleted). Don't retry, let _authed.tsx
    // detect the status and sign out.
    retry: (count, error) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 410 || status === 401 || status === 403) return false;
      return count < 1;
    },
  });
}

export function useSetMyPassword() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      request<null>("/api/users/me/password", {
        method: "POST",
        body: { password } as unknown as BodyInit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ME_KEY });
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

export function useChangeRole() {
  const { request } = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; role: AppRole }) =>
      request<TeamMember>(`/api/users/${args.userId}/role`, {
        method: "POST",
        body: { role: args.role } as unknown as BodyInit,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}

/** Compare two roles — returns positive when a outranks b. */
export function roleRankDelta(a: AppRole | null, b: AppRole | null): number {
  const av = a ? ROLE_RANK[a] : 0;
  const bv = b ? ROLE_RANK[b] : 0;
  return av - bv;
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
