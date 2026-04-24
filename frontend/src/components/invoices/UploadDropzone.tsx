import { useRef, useState, type DragEvent, type ChangeEvent } from "react";
import { DocumentArrowUpIcon } from "@heroicons/react/24/outline";
import { useUploadInvoice } from "@/lib/invoices";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

export function UploadDropzone({ onUploaded }: { onUploaded?: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useUploadInvoice();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (file.type !== "application/pdf") {
        setError(`"${file.name}" is not a PDF`);
        continue;
      }
      try {
        await upload.mutateAsync(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }
    onUploaded?.();
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    void handleFiles(e.dataTransfer.files);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    void handleFiles(e.target.files);
    e.target.value = "";
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        "relative border-2 border-dashed p-8 text-center transition-colors",
        dragOver ? "border-amber bg-amber/5" : "border-slate-300 bg-white",
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
      <DocumentArrowUpIcon className="mx-auto h-10 w-10 text-slate-400" aria-hidden />
      <div className="mt-2">
        <p className="text-sm text-graphite">
          <span className="font-semibold text-navy">Drop a PDF here</span> or
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => fileInput.current?.click()}
          loading={upload.isPending}
        >
          Choose file
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        We'll extract the fields automatically. You'll review before posting to QBO.
      </p>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
