import { useEffect, useMemo, useState } from "react";
import { useLogto } from "@logto/react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
// Vite's `?url` asset import gives us the resolved URL of the worker from
// node_modules. The bare `new URL("pdfjs-dist/...", import.meta.url)` pattern
// does NOT work here: Vite treats it as relative to the importing file, not
// as a bare module specifier.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error — pdfjs-dist is a transitive dep and has no bundled types
// for ?url imports
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string) || "http://localhost:8000";
const RESOURCE = (import.meta.env.VITE_LOGTO_RESOURCE as string) || "";

interface PdfViewerProps {
  invoiceId: string;
  /** Signed R2 URL used only for "open in new tab" (no auth needed). */
  downloadUrl?: string;
}

export function PdfViewer({ invoiceId, downloadUrl }: PdfViewerProps) {
  const { getAccessToken } = useLogto();
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Memoize options to avoid unnecessary reloads
  const options = useMemo(
    () => ({
      cMapUrl: "https://unpkg.com/pdfjs-dist/cmaps/",
      cMapPacked: true,
    }),
    [],
  );

  // Fetch the PDF as an authenticated blob and hand react-pdf an object URL.
  // We proxy through the backend to avoid needing CORS config on R2.
  useEffect(() => {
    let cancelled = false;
    let createdUrl: string | null = null;

    async function load() {
      setFetchError(null);
      setBlobUrl(null);
      try {
        const token = await getAccessToken(RESOURCE);
        const resp = await fetch(`${API_BASE}/api/invoices/${invoiceId}/pdf/content`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!resp.ok) {
          throw new Error(`Server returned ${resp.status}`);
        }
        const blob = await resp.blob();
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setBlobUrl(createdUrl);
      } catch (exc) {
        if (!cancelled) {
          setFetchError(exc instanceof Error ? exc.message : String(exc));
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [invoiceId, getAccessToken]);

  return (
    <div className="flex flex-col h-full bg-graphite">
      {/* Controls */}
      <div className="bg-navy text-stone px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1.5 hover:bg-white/10 disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono px-2">
            {page} / {pageCount ?? "—"}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount ?? p, p + 1))}
            disabled={pageCount !== null && page >= pageCount}
            className="p-1.5 hover:bg-white/10 disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="p-1.5 hover:bg-white/10"
            aria-label="Zoom out"
          >
            <MagnifyingGlassMinusIcon className="h-4 w-4" />
          </button>
          <span className="text-xs font-mono px-2">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="p-1.5 hover:bg-white/10"
            aria-label="Zoom in"
          >
            <MagnifyingGlassPlusIcon className="h-4 w-4" />
          </button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="p-1.5 hover:bg-white/10"
              aria-label="Open in new tab"
            >
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-auto bg-graphite flex items-start justify-center py-4">
        {fetchError ? (
          <ErrorFallback message={fetchError} downloadUrl={downloadUrl} />
        ) : blobUrl ? (
          <Document
            file={blobUrl}
            onLoadSuccess={({ numPages }) => setPageCount(numPages)}
            onLoadError={(err) => {
              console.error("PDF load error", err);
              setFetchError(err instanceof Error ? err.message : String(err));
            }}
            loading={<div className="text-stone py-12">Loading PDF…</div>}
            error={<ErrorFallback downloadUrl={downloadUrl} />}
            options={options}
          >
            <Page
              pageNumber={page}
              scale={scale}
              renderAnnotationLayer={false}
              renderTextLayer={false}
              className="shadow-2xl"
            />
          </Document>
        ) : (
          <div className="text-stone py-12">Loading PDF…</div>
        )}
      </div>
    </div>
  );
}

function ErrorFallback({
  message,
  downloadUrl,
}: {
  message?: string;
  downloadUrl?: string;
}) {
  return (
    <div className="p-8 text-center">
      <p className="text-stone mb-2">Couldn't render the PDF inline.</p>
      {message && <p className="text-stone/60 text-xs mb-4 font-mono">{message}</p>}
      {downloadUrl && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.open(downloadUrl, "_blank", "noopener")}
        >
          Open in new tab
        </Button>
      )}
    </div>
  );
}
