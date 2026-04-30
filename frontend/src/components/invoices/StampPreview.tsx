/**
 * Live HTML preview of the AP coding stamp that gets baked into the PDF
 * at QBO post time. Mirrors the reportlab-drawn version: navy outline,
 * amber title band, mono values.
 *
 * Two modes:
 *
 *   - "static" — read-only render. Used in the InvoiceSummary card.
 *   - "interactive" — drag to move, bottom-right corner to resize.
 *     Used over the PDF viewer on the review screen so PMs can place
 *     the stamp where it makes sense for that vendor's layout.
 *
 * The interactive mode uses fractional (0–1) coordinates of its anchor
 * container so the position survives resize / zoom of the rendered PDF
 * without recalculation. The route page maps those fractions to PDF
 * points server-side at post time.
 *
 * Aspect ratio is locked to the natural ~2.29:1 the reportlab version
 * uses, so resizing only changes width — height tracks proportionally.
 */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ArrowsPointingInIcon } from "@heroicons/react/24/outline";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/format";

interface CodingFields {
  job_number: string | null | undefined;
  cost_code: string | null | undefined;
  coding_date: string | null | undefined;
  approver: string | null | undefined;
}

export interface StampPosition {
  x: number;
  y: number;
  width: number;
}

interface BaseProps {
  invoice: CodingFields;
  className?: string;
}

/** Read-only render — used in the InvoiceSummary card. */
export function StampPreview({ invoice, className }: BaseProps) {
  return (
    <StampBody
      invoice={invoice}
      style={{ width: 220 }}
      className={cn("shadow-lg", className)}
    />
  );
}

interface InteractiveProps extends BaseProps {
  /** Container the stamp is positioned relative to (the rendered PDF
   *  page). All position fractions are computed against this element. */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Current position. Null = render at default (top-right with margin). */
  position: StampPosition | null;
  /** Fired when the user finishes dragging or resizing. */
  onChange: (position: StampPosition | null) => void;
  /** Disabled in read-only modes. When false, no drag/resize handles
   *  appear and pointer events pass through to the PDF. */
  editable?: boolean;
}

const DEFAULT_WIDTH_FRAC = 0.32;     // 32% of page width = ~196pt on Letter
const DEFAULT_MARGIN_FRAC = 0.03;    // 3% page margin from top + right
const STAMP_ASPECT = 220 / 96;       // matches reportlab's _STAMP_ASPECT

const MIN_WIDTH_FRAC = 0.12;
const MAX_WIDTH_FRAC = 0.6;

function defaultPosition(): StampPosition {
  return {
    x: 1 - DEFAULT_WIDTH_FRAC - DEFAULT_MARGIN_FRAC,
    y: DEFAULT_MARGIN_FRAC,
    width: DEFAULT_WIDTH_FRAC,
  };
}

/**
 * Interactive draggable + resizable stamp overlay. Renders absolutely
 * within whatever container the caller scopes via containerRef.
 *
 * Position changes commit to onChange only on pointer-up so the parent
 * can debounce a server PATCH instead of firing on every move event.
 */
export function StampPreviewOverlay({
  invoice,
  containerRef,
  position,
  onChange,
  editable = true,
  className,
}: InteractiveProps) {
  const effective = position ?? defaultPosition();
  // Track pixel rect so the stamp doesn't lag behind drag events. We
  // re-derive from `effective` whenever the container size changes.
  const [rect, setRect] = useState<{ left: number; top: number; width: number } | null>(null);

  // Re-compute pixel rect whenever the container resizes or position
  // updates (from PATCH callback round-trips).
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    function recompute() {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      setRect({
        left: effective.x * r.width,
        top: effective.y * r.height,
        width: effective.width * r.width,
      });
    }
    recompute();
    const obs = new ResizeObserver(recompute);
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef, effective.x, effective.y, effective.width]);

  // Drag/resize gestures. Whichever pointer goes down first owns the
  // gesture until it goes up.
  const dragRef = useRef<{
    kind: "move" | "resize";
    startX: number;
    startY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);

  function clampToContainer(left: number, top: number, width: number) {
    if (!containerRef.current) return { left, top, width };
    const r = containerRef.current.getBoundingClientRect();
    const height = width / STAMP_ASPECT;
    const minW = r.width * MIN_WIDTH_FRAC;
    const maxW = r.width * MAX_WIDTH_FRAC;
    const w = Math.max(minW, Math.min(maxW, width));
    const h = w / STAMP_ASPECT;
    const l = Math.max(0, Math.min(r.width - w, left));
    const t = Math.max(0, Math.min(r.height - h, top));
    return { left: l, top: t, width: w };
  }

  function pixelsToFrac(px: { left: number; top: number; width: number }): StampPosition {
    if (!containerRef.current) return effective;
    const r = containerRef.current.getBoundingClientRect();
    return {
      x: px.left / r.width,
      y: px.top / r.height,
      width: px.width / r.width,
    };
  }

  function onPointerDown(e: ReactPointerEvent<HTMLElement>, kind: "move" | "resize") {
    if (!editable || !rect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      kind,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      pointerId: e.pointerId,
    };
  }

  function onPointerMove(e: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId || !rect) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (d.kind === "move") {
      const next = clampToContainer(
        d.startLeft + dx,
        d.startTop + dy,
        d.startWidth,
      );
      setRect(next);
    } else {
      // Resize: bottom-right corner. Width grows with dx + dy together,
      // proportionally so aspect stays locked.
      const proposed = d.startWidth + Math.max(dx, dy * STAMP_ASPECT);
      const next = clampToContainer(d.startLeft, d.startTop, proposed);
      setRect(next);
    }
  }

  function onPointerUp(e: ReactPointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (rect) {
      onChange(pixelsToFrac(rect));
    }
  }

  if (!rect) {
    // Container hasn't measured yet (PDF still rendering). Don't paint.
    return null;
  }

  return (
    <div
      className={cn(
        "absolute select-none",
        editable ? "cursor-move" : "pointer-events-none",
        className,
      )}
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        zIndex: 20,
      }}
      onPointerDown={(e) => onPointerDown(e, "move")}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <StampBody
        invoice={invoice}
        className={cn(
          "shadow-lg",
          editable && "ring-2 ring-amber/30 hover:ring-amber",
        )}
      />
      {editable && (
        <button
          type="button"
          aria-label="Resize stamp"
          onPointerDown={(e) => onPointerDown(e, "resize")}
          className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center bg-navy text-stone shadow border border-stone cursor-nwse-resize hover:bg-amber hover:text-navy"
          style={{ touchAction: "none" }}
        >
          <ArrowsPointingInIcon className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Visual body shared between static + interactive variants.
// ──────────────────────────────────────────────────────────────────────────

function StampBody({
  invoice,
  className,
  style,
}: {
  invoice: CodingFields;
  className?: string;
  style?: React.CSSProperties;
}) {
  const ready =
    !!invoice.job_number?.trim() &&
    !!invoice.cost_code?.trim() &&
    !!invoice.coding_date &&
    !!invoice.approver?.trim();

  return (
    <div
      className={cn(
        "bg-white border-2 select-none transition-colors",
        ready ? "border-navy" : "border-slate-300",
        className,
      )}
      style={style}
      aria-label="AP coding stamp preview"
      title="Preview of the stamp that will be baked into the QBO attachment"
    >
      <div className="bg-amber px-2 py-1 flex items-center justify-between text-[9px] font-bold tracking-widest text-navy">
        <span>CAMBRIDGE</span>
        <span>AP CODING</span>
      </div>
      <div className="px-2 py-1.5 space-y-0.5">
        <Row label="JOB #" value={invoice.job_number} ready={ready} />
        <Row label="COST CD" value={invoice.cost_code} ready={ready} />
        <Row
          label="DATE"
          value={invoice.coding_date ? formatDate(invoice.coding_date) : null}
          ready={ready}
        />
        <Row label="APPROVED" value={invoice.approver} ready={ready} />
      </div>
      {!ready && (
        <div className="px-2 py-1 border-t border-slate-200 text-[8px] uppercase tracking-wider text-slate-500">
          Fill all 4 to enable post
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  ready,
}: {
  label: string;
  value: string | null | undefined;
  ready: boolean;
}) {
  const filled = !!(value && String(value).trim());
  return (
    <div className="flex items-baseline gap-2 text-[10px]">
      <span className="font-bold text-navy w-[58px] flex-shrink-0">{label}</span>
      <span
        className={cn(
          "font-mono truncate",
          filled
            ? ready
              ? "text-navy"
              : "text-graphite"
            : "text-slate-300",
        )}
      >
        {filled ? value : "—"}
      </span>
    </div>
  );
}
