/**
 * Upload-with-progress hook.
 *
 * Swaps fetch for XHR so we get `progress` events during the network transfer.
 * After the upload completes, the hook flips to a "processing" state and the
 * UI polls the invoice detail endpoint to surface extraction status. Both
 * live inside the same state machine so the UploadCard can render one thing.
 */
import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLogto } from "@logto/react";
import type { Invoice } from "@/types";
import { qk } from "@/lib/queryKeys";

export type UploadStage =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number; file: File }
  | { kind: "processing"; file: File; invoice: Invoice }
  | { kind: "extracting"; file: File; invoice: Invoice; elapsedSeconds: number }
  | { kind: "done"; file: File; invoice: Invoice }
  | { kind: "error"; file: File; message: string };

export interface UploadTask {
  id: string;
  stage: UploadStage;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";
const RESOURCE = (import.meta.env.VITE_LOGTO_RESOURCE as string) || "";

/** Rotating status messages for the extracting phase. */
const EXTRACTING_MESSAGES = [
  "Rendering PDF pages…",
  "Reading the invoice…",
  "Parsing vendor and dates…",
  "Pulling line items…",
  "Cross-checking totals…",
];

export function extractionMessageAt(elapsedSeconds: number): string {
  if (elapsedSeconds < 2) return EXTRACTING_MESSAGES[0];
  const idx = Math.min(
    Math.floor(elapsedSeconds / 3),
    EXTRACTING_MESSAGES.length - 1,
  );
  return EXTRACTING_MESSAGES[idx];
}

// ──────────────────────────────────────────────────────────────────────────
// Public hook
// ──────────────────────────────────────────────────────────────────────────

export function useUploadQueue() {
  const { getAccessToken } = useLogto();
  const qc = useQueryClient();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  // A ref-based updater so we can write from async callbacks without stale
  // closures.
  const setTasksRef = useRef(setTasks);
  setTasksRef.current = setTasks;

  const updateTask = useCallback((id: string, stage: UploadStage) => {
    setTasksRef.current((prev) =>
      prev.map((t) => (t.id === id ? { ...t, stage } : t)),
    );
  }, []);

  const enqueue = useCallback(
    (files: File[]) => {
      const accepted = files.filter((f) => f.type === "application/pdf");
      if (accepted.length === 0) return;
      const newTasks: UploadTask[] = accepted.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        stage: { kind: "uploading", percent: 0, file },
      }));
      setTasksRef.current((prev) => [...prev, ...newTasks]);
      // Kick off each in parallel
      for (const t of newTasks) {
        const file = (t.stage as Extract<UploadStage, { kind: "uploading" }>).file;
        void runUpload(t.id, file, { updateTask, getAccessToken, qc });
      }
    },
    [updateTask, getAccessToken, qc],
  );

  const dismiss = useCallback((id: string) => {
    setTasksRef.current((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { tasks, enqueue, dismiss };
}

// ──────────────────────────────────────────────────────────────────────────
// Internals
// ──────────────────────────────────────────────────────────────────────────

interface RunContext {
  updateTask: (id: string, stage: UploadStage) => void;
  getAccessToken: (resource: string) => Promise<string | undefined>;
  qc: ReturnType<typeof useQueryClient>;
}

async function runUpload(taskId: string, file: File, ctx: RunContext): Promise<void> {
  let token: string | undefined;
  try {
    token = await ctx.getAccessToken(RESOURCE);
  } catch (exc) {
    ctx.updateTask(taskId, {
      kind: "error",
      file,
      message: exc instanceof Error ? exc.message : "Auth failed",
    });
    return;
  }

  try {
    const invoice = await xhrUpload(file, token, (percent) => {
      ctx.updateTask(taskId, { kind: "uploading", percent, file });
    });
    ctx.updateTask(taskId, { kind: "processing", file, invoice });
    void ctx.qc.invalidateQueries({ queryKey: qk.invoices.root() });
    await pollUntilDone(taskId, invoice.id, token, file, ctx);
  } catch (exc) {
    ctx.updateTask(taskId, {
      kind: "error",
      file,
      message: exc instanceof Error ? exc.message : "Upload failed",
    });
  }
}

function xhrUpload(
  file: File,
  token: string | undefined,
  onProgress: (pct: number) => void,
): Promise<Invoice> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/invoices`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as Invoice);
        } catch {
          reject(new Error("Server returned malformed JSON"));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText) as { detail?: string };
          if (body.detail) msg = body.detail;
        } catch {
          /* ignore */
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.send(fd);
  });
}

async function pollUntilDone(
  taskId: string,
  invoiceId: string,
  token: string | undefined,
  file: File,
  ctx: RunContext,
): Promise<void> {
  const start = performance.now();
  const maxDurationMs = 120_000;
  while (performance.now() - start < maxDurationMs) {
    await sleep(1500);

    let current: Invoice;
    try {
      const resp = await fetch(`${API_BASE}/api/invoices/${invoiceId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!resp.ok) throw new Error(`Poll HTTP ${resp.status}`);
      current = (await resp.json()) as Invoice;
    } catch {
      continue;
    }

    ctx.qc.setQueryData(qk.invoices.detail(invoiceId), current);
    const elapsedSeconds = Math.floor((performance.now() - start) / 1000);

    if (current.status === "extracting") {
      ctx.updateTask(taskId, {
        kind: "extracting",
        file,
        invoice: current,
        elapsedSeconds,
      });
      continue;
    }
    if (current.status === "received") {
      ctx.updateTask(taskId, { kind: "processing", file, invoice: current });
      continue;
    }
    if (
      current.status === "ready_for_review" ||
      current.status === "approved" ||
      current.status === "posted_to_qbo"
    ) {
      ctx.updateTask(taskId, { kind: "done", file, invoice: current });
      void ctx.qc.invalidateQueries({ queryKey: qk.invoices.root() });
      return;
    }
    if (current.status === "extraction_failed") {
      ctx.updateTask(taskId, {
        kind: "error",
        file,
        message: current.extraction_error || "Extraction failed",
      });
      return;
    }
    if (current.status === "rejected") {
      ctx.updateTask(taskId, {
        kind: "error",
        file,
        message: "Invoice was rejected (possibly no PDF attached)",
      });
      return;
    }
  }
  // Timed out waiting — don't error; just let the user pick it up in the queue.
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
