import { useState, useMemo } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import {
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ArrowTopRightOnSquareIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/Button";

// Configure pdfjs worker (uses the ESM build shipped with pdfjs-dist)
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface PdfViewerProps {
  url: string;
}

export function PdfViewer({ url }: PdfViewerProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1.0);

  // Memoize options to avoid unnecessary reloads
  const options = useMemo(
    () => ({
      cMapUrl: "https://unpkg.com/pdfjs-dist/cmaps/",
      cMapPacked: true,
    }),
    [],
  );

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
          <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="p-1.5 hover:bg-white/10"
            aria-label="Open in new tab"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>
      </div>

      {/* Viewer */}
      <div className="flex-1 overflow-auto bg-graphite flex items-start justify-center py-4">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setPageCount(numPages)}
          onLoadError={(err) => console.error("PDF load error", err)}
          loading={<div className="text-stone py-12">Loading PDF…</div>}
          error={
            <ErrorFallback url={url} />
          }
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
      </div>
    </div>
  );
}

function ErrorFallback({ url }: { url: string }) {
  return (
    <div className="p-8 text-center">
      <p className="text-stone mb-4">Couldn't render the PDF inline.</p>
      <Button
        variant="primary"
        size="sm"
        onClick={() => window.open(url, "_blank", "noopener")}
      >
        Open in new tab
      </Button>
    </div>
  );
}
