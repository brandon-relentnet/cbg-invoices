/**
 * Live HTML preview of the AP coding stamp that gets baked into the PDF
 * at QBO post time. Mirrors the reportlab-drawn version: navy outline,
 * amber title band, mono values.
 *
 * Two modes:
 *
 *   - "static" — read-only render. Used in the InvoiceSummary card.
 *   - "interactive" — drag to move (Motion's drag system, GPU-accelerated
 *     transforms, smooth at 60fps even on modest hardware). Resize via
 *     a corner handle that drives motion values for width + height
 *     directly. Aspects are FREE — width and height move independently
 *     so the user can make tall/skinny or wide/short stamps as needed.
 *
 * The interactive mode portals into the rendered PDF page element so
 * its `position: absolute` coordinates map 1:1 to page coordinates.
 * Every value persisted is a fraction of the page so the position
 * survives PDF zoom / browser resize / etc. The route page maps those
 * fractions to PDF points server-side at post time.
 */
import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue, useTransform } from "motion/react";
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
  height?: number;
}

interface BaseProps {
  invoice: CodingFields;
  className?: string;
}

/** Read-only render — used in the InvoiceSummary card. */
export function StampPreview({ invoice, className }: BaseProps) {
  return (
    <StaticStampBody
      invoice={invoice}
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

const DEFAULT_WIDTH_FRAC = 0.32;
const DEFAULT_MARGIN_FRAC = 0.03;
const STAMP_ASPECT = 220 / 96; // matches the reportlab default
const DEFAULT_HEIGHT_FRAC_FALLBACK = 0.08; // used when we can't derive

const MIN_WIDTH_FRAC = 0.1;
const MAX_WIDTH_FRAC = 0.7;
const MIN_HEIGHT_FRAC = 0.04;
const MAX_HEIGHT_FRAC = 0.5;

function defaultPosition(pageWidth: number, pageHeight: number): StampPosition {
  // Default size: 32% page width × ratio-derived height.
  const width = DEFAULT_WIDTH_FRAC;
  const heightPx = (DEFAULT_WIDTH_FRAC * pageWidth) / STAMP_ASPECT;
  const height = pageHeight > 0 ? heightPx / pageHeight : DEFAULT_HEIGHT_FRAC_FALLBACK;
  return {
    x: 1 - width - DEFAULT_MARGIN_FRAC,
    y: DEFAULT_MARGIN_FRAC,
    width,
    height,
  };
}

/**
 * Interactive draggable + resizable stamp overlay. Renders absolutely
 * inside the page element via portal so positioning is in true page-
 * coordinate space. Uses Motion for the drag (smooth, hardware-
 * accelerated, takes care of bounds via dragConstraints) and a custom
 * pointer-event handler on the corner for resize.
 */
export function StampPreviewOverlay({
  invoice,
  containerRef,
  position,
  onChange,
  editable = true,
  className,
}: InteractiveProps) {
  // Container size, tracked so we can convert between pixel + fractional.
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  // Motion values for x/y/width/height in PIXELS (relative to the page
  // element). These drive the rendered transform/size every frame. They
  // are kept in sync with `position` (parent prop) when it changes via
  // a useEffect below; user gestures push values into them imperatively.
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const width = useMotionValue(0);
  const height = useMotionValue(0);

  // Observe the container so we can size the stamp + reset on PDF zoom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setContainerSize({ w: r.width, h: r.height });
      }
    }
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, [containerRef]);

  // Sync motion values from the persisted position (or default) when
  // the position prop changes or the container resizes. This is what
  // makes the stamp follow PDF zoom + restore correctly on page load.
  useEffect(() => {
    if (!containerSize) return;
    const { w, h } = containerSize;
    const eff = position ?? defaultPosition(w, h);
    const pixWidth = eff.width * w;
    const pixHeight =
      eff.height !== undefined ? eff.height * h : pixWidth / STAMP_ASPECT;
    x.set(eff.x * w);
    y.set(eff.y * h);
    width.set(pixWidth);
    height.set(pixHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    containerSize?.w,
    containerSize?.h,
    position?.x,
    position?.y,
    position?.width,
    position?.height,
  ]);

  function commitPosition() {
    if (!containerSize) return;
    onChange({
      x: x.get() / containerSize.w,
      y: y.get() / containerSize.h,
      width: width.get() / containerSize.w,
      height: height.get() / containerSize.h,
    });
  }

  // Resize handle — uses raw pointer events with window listeners
  // because Motion's drag is for the parent container only.
  function startResize(e: ReactPointerEvent<HTMLElement>) {
    if (!editable || !containerSize) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = width.get();
    const startH = height.get();
    const curX = x.get();
    const curY = y.get();
    const minW = containerSize.w * MIN_WIDTH_FRAC;
    const maxW = containerSize.w * MAX_WIDTH_FRAC;
    const minH = containerSize.h * MIN_HEIGHT_FRAC;
    const maxH = containerSize.h * MAX_HEIGHT_FRAC;

    function onMove(ev: PointerEvent) {
      ev.preventDefault();
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      // Clamp width so right edge doesn't run past the page
      const nextW = Math.max(
        minW,
        Math.min(maxW, Math.min(startW + dx, containerSize!.w - curX)),
      );
      // Same for height
      const nextH = Math.max(
        minH,
        Math.min(maxH, Math.min(startH + dy, containerSize!.h - curY)),
      );
      width.set(nextW);
      height.set(nextH);
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      commitPosition();
    }
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // The body's font/spacing scales with the box width via a transform
  // ratio. Keeps the stamp legible at every size.
  const fontScale = useTransform(width, (w) => w / 220);

  if (!containerSize || !containerRef.current) return null;

  // Drag constraints — keep the stamp inside the page bounds. Motion
  // computes max - element size for us when constraints is a ref, but
  // we get tighter control passing the literal rect.
  const constraints = {
    left: 0,
    top: 0,
    right: Math.max(0, containerSize.w - width.get()),
    bottom: Math.max(0, containerSize.h - height.get()),
  };

  const overlay = (
    <motion.div
      drag={editable}
      dragConstraints={constraints}
      dragElastic={0}
      dragMomentum={false}
      onDragEnd={commitPosition}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        x,
        y,
        width,
        height,
        zIndex: 20,
        touchAction: editable ? "none" : "auto",
      }}
      className={cn(
        "select-none",
        editable ? "cursor-move" : "pointer-events-none",
        className,
      )}
    >
      <MotionStampBody
        invoice={invoice}
        scale={fontScale}
        className={cn(
          "shadow-lg h-full",
          editable && "ring-2 ring-amber/30 hover:ring-amber",
        )}
      />
      {editable && (
        <button
          type="button"
          aria-label="Resize stamp"
          onPointerDown={startResize}
          className="absolute -bottom-2 -right-2 flex h-5 w-5 items-center justify-center bg-navy text-stone shadow border border-stone cursor-nwse-resize hover:bg-amber hover:text-navy z-10"
          style={{ touchAction: "none" }}
        >
          <ArrowsPointingInIcon className="h-3 w-3" />
        </button>
      )}
    </motion.div>
  );

  return createPortal(overlay, containerRef.current);
}

// ──────────────────────────────────────────────────────────────────────────
// Visual body — two variants so we don't conditionally call hooks.
// ──────────────────────────────────────────────────────────────────────────

/** Static (no motion values), fixed 220px wide, intrinsic height.
 *  Used by the read-only StampPreview in InvoiceSummary cards. */
function StaticStampBody({
  invoice,
  className,
}: {
  invoice: CodingFields;
  className?: string;
}) {
  const ready = isReady(invoice);
  return (
    <div
      style={{ width: 220 }}
      className={cn(
        "bg-white border-2 select-none transition-colors flex flex-col",
        ready ? "border-navy" : "border-slate-300",
        className,
      )}
      aria-label="AP coding stamp preview"
    >
      <div className="bg-amber px-2 py-1 flex items-center justify-between font-bold tracking-widest text-navy text-[9px]">
        <span>CAMBRIDGE</span>
        <span>AP CODING</span>
      </div>
      <div className="px-2 py-1.5 space-y-0.5 text-[10px]">
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

/** Motion-driven body — fills its container, font sizes track a scale
 *  motion value so the stamp stays legible at any user-chosen width.
 *  Used by the interactive StampPreviewOverlay. */
function MotionStampBody({
  invoice,
  className,
  scale,
}: {
  invoice: CodingFields;
  className?: string;
  scale: ReturnType<typeof useMotionValue<number>>;
}) {
  const ready = isReady(invoice);
  // Hooks must run unconditionally — useTransform reads `scale`
  // unconditionally here.
  const titleSize = useTransform(scale, (s) => `${9 * s}px`);
  const labelSize = useTransform(scale, (s) => `${10 * s}px`);

  return (
    <motion.div
      className={cn(
        "bg-white border-2 select-none transition-colors flex flex-col h-full overflow-hidden",
        ready ? "border-navy" : "border-slate-300",
        className,
      )}
      aria-label="AP coding stamp preview"
      title="Preview of the stamp that will be baked into the QBO attachment"
    >
      <motion.div
        className="bg-amber px-2 py-1 flex items-center justify-between font-bold tracking-widest text-navy flex-shrink-0"
        style={{ fontSize: titleSize }}
      >
        <span>CAMBRIDGE</span>
        <span>AP CODING</span>
      </motion.div>
      <motion.div
        className="px-2 py-1.5 flex-1 flex flex-col justify-around"
        style={{ fontSize: labelSize }}
      >
        <Row label="JOB #" value={invoice.job_number} ready={ready} />
        <Row label="COST CD" value={invoice.cost_code} ready={ready} />
        <Row
          label="DATE"
          value={invoice.coding_date ? formatDate(invoice.coding_date) : null}
          ready={ready}
        />
        <Row label="APPROVED" value={invoice.approver} ready={ready} />
      </motion.div>
    </motion.div>
  );
}

function isReady(invoice: CodingFields): boolean {
  return (
    !!invoice.job_number?.trim() &&
    !!invoice.cost_code?.trim() &&
    !!invoice.coding_date &&
    !!invoice.approver?.trim()
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
    <div className="flex items-baseline gap-2 leading-tight">
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
