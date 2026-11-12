import { StrictMode, useEffect, useState, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import { registerServiceWorker } from "./registerServiceWorker";
import "./spike.css";

/** Shows a non-blocking "update ready" banner; the update applies only on tap. */
function UpdateBanner() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  useEffect(() => {
    registerServiceWorker((applyUpdate) => setApply(() => applyUpdate));
  }, []);
  if (!apply) return null;
  return (
    <div className="banner" role="status">
      A new version is ready.{" "}
      <button type="button" onClick={apply}>
        Update now
      </button>
    </div>
  );
}

export function mount(Page: ComponentType): void {
  const container = document.getElementById("root");
  if (!container) throw new Error("Missing #root element");
  createRoot(container).render(
    <StrictMode>
      <UpdateBanner />
      <Page />
    </StrictMode>,
  );
}
