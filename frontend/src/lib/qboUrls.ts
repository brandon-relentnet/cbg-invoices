/**
 * Deep-link helpers for QuickBooks Online.
 *
 * The sandbox and production environments are on different hostnames, so we
 * always route through a helper that reads the environment from /api/qbo/status.
 */
import type { QboStatus } from "@/types";

const HOSTS: Record<QboStatus["environment"], string> = {
  sandbox: "https://app.sandbox.qbo.intuit.com",
  production: "https://qbo.intuit.com",
};

/** URL to view a specific bill in QBO, or null if any required piece is missing. */
export function qboBillUrl(
  qbo: QboStatus | undefined | null,
  billId: string | null | undefined,
): string | null {
  if (!qbo || !billId) return null;
  const host = HOSTS[qbo.environment] ?? HOSTS.sandbox;
  return `${host}/app/bill?txnId=${encodeURIComponent(billId)}`;
}
