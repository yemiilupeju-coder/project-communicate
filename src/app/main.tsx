import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./app.css";

// iOS: let speech play even when the ring/silent switch is on.
const audioSession = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
if (audioSession) {
  try {
    audioSession.type = "playback";
  } catch {
    // Not supported here; speech still works with the switch off.
  }
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
