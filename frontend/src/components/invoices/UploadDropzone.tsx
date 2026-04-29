import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import {
  extractionMessageAt,
  useUploadQueue,
  type UploadStage,
  type UploadTask,
} from "@/lib/upload";

export function UploadDropzone() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { tasks, enqueue, dismiss } = useUploadQueue();

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    enqueue(Array.from(e.dataTransfer.files));
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    enqueue(Array.from(e.target.files ?? []));
    e.target.value = "";
  }

  const hasActive = tasks.some(
    (t) => t.stage.kind !== "done" && t.stage.kind !== "error",
  );

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInput.current?.click();
          }
        }}
        className={cn(
          "relative border-2 border-dashed p-5 sm:p-6 text-center transition-colors cursor-pointer",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2",
          dragOver ? "border-amber bg-amber/5" : "border-slate-300 bg-white hover:border-amber/60",
        )}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="sr-only"
          onChange={onChange}
          multiple
        />
        <DocumentArrowUpIcon
          className="mx-auto h-10 w-10 sm:h-9 sm:w-9 text-amber/70"
          aria-hidden
        />
        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2">
          <p className="text-sm sm:text-base text-graphite">
            <span className="font-semibold text-navy hidden sm:inline">
              Drop a PDF here
            </span>
            <span className="font-semibold text-navy sm:hidden">Tap to upload</span>{" "}
            <span className="hidden sm:inline">or</span>
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              fileInput.current?.click();
            }}
            loading={hasActive}
            className="hidden sm:inline-flex"
          >
            Choose file
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500 max-w-xs mx-auto">
          We'll extract the fields automatically. You'll review before posting
          to QBO.
        </p>
      </div>

      <AnimatePresence>
        {tasks.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="space-y-2"
          >
            {tasks.map((task) => (
              <UploadTaskCard key={task.id} task={task} onDismiss={() => dismiss(task.id)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Task card
// ──────────────────────────────────────────────────────────────────────────

function UploadTaskCard({
  task,
  onDismiss,
}: {
  task: UploadTask;
  onDismiss: () => void;
}) {
  const { stage } = task;
  const file = (stage as Exclude<UploadStage, { kind: "idle" }>).file;
  const label = file?.name ?? "PDF";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className={cn(
        "bg-white border-l-2 relative overflow-hidden",
        stage.kind === "error"
          ? "border-red-700"
          : stage.kind === "done"
            ? "border-green-600"
            : "border-amber",
      )}
    >
      <div className="p-4 flex items-start gap-3">
        <StageIcon stage={stage} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-sm font-medium text-graphite truncate">{label}</div>
              <StageCaption stage={stage} />
            </div>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className="flex-shrink-0 p-0.5 text-slate-400 hover:text-graphite"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <StageBar stage={stage} />
          <StageAction stage={stage} onDismiss={onDismiss} />
        </div>
      </div>
    </motion.div>
  );
}

function StageIcon({ stage }: { stage: UploadStage }) {
  const iconClass = "h-5 w-5 flex-shrink-0 mt-0.5";
  if (stage.kind === "error") {
    return <ExclamationTriangleIcon className={cn(iconClass, "text-red-700")} />;
  }
  if (stage.kind === "done") {
    return <CheckCircleIcon className={cn(iconClass, "text-green-600")} />;
  }
  // Spinner for uploading/processing/extracting
  return (
    <span
      aria-hidden
      className={cn(
        iconClass,
        "inline-block rounded-full border-2 border-navy border-r-transparent animate-spin",
      )}
    />
  );
}

function StageCaption({ stage }: { stage: UploadStage }) {
  let text = "";
  switch (stage.kind) {
    case "uploading":
      text = `Uploading… ${stage.percent}%`;
      break;
    case "processing":
      text = "Saved. Queuing extraction…";
      break;
    case "extracting":
      text = extractionMessageAt(stage.elapsedSeconds);
      break;
    case "done":
      text = "Ready for review.";
      break;
    case "error":
      text = stage.message;
      break;
    default:
      return null;
  }
  return (
    <div
      className={cn(
        "text-xs mt-0.5 truncate",
        stage.kind === "error" ? "text-red-700" : "text-slate-500",
      )}
    >
      {text}
    </div>
  );
}

function StageBar({ stage }: { stage: UploadStage }) {
  if (stage.kind === "uploading") {
    return (
      <div className="mt-2 h-1 bg-stone/80 overflow-hidden">
        <motion.div
          className="h-full bg-amber"
          initial={false}
          animate={{ width: `${stage.percent}%` }}
          transition={{ duration: 0.1 }}
        />
      </div>
    );
  }
  if (stage.kind === "processing" || stage.kind === "extracting") {
    return (
      <div className="mt-2 h-1 bg-stone/80 overflow-hidden">
        {/* Indeterminate shimmer */}
        <motion.div
          className="h-full w-1/3 bg-gradient-to-r from-transparent via-amber to-transparent"
          animate={{ x: ["-100%", "300%"] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }
  return null;
}

function StageAction({
  stage,
  onDismiss,
}: {
  stage: UploadStage;
  onDismiss: () => void;
}) {
  if (stage.kind === "done") {
    return (
      <div className="mt-2">
        <Link
          to="/invoices/$id"
          params={{ id: stage.invoice.id }}
          className="text-xs font-semibold text-navy hover:text-amber"
        >
          Review →
        </Link>
      </div>
    );
  }
  if (stage.kind === "error") {
    return (
      <div className="mt-2">
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-slate-600 hover:text-graphite"
        >
          Dismiss
        </button>
      </div>
    );
  }
  return null;
}
