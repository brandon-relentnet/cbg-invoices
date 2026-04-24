import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/assets/css/main.css";

// Phase 2+ replaces this with <App /> containing the TanStack Router + Logto provider.
function Boot() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone">
      <div className="text-center">
        <h1 className="font-display text-4xl text-navy">
          Cambridge <span className="text-amber">Invoice Portal</span>
        </h1>
        <p className="mt-4 text-slate-600">Scaffold ready.</p>
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");
createRoot(rootEl).render(
  <StrictMode>
    <Boot />
  </StrictMode>,
);
