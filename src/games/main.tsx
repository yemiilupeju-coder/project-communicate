import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import HereALittleGame, { type HereALittleEvent } from "../features/games/HereALittleGame";
import { registerServiceWorker } from "../shared/registerServiceWorker";
import "./games.css";

/**
 * The Fun zone: games for students, kept apart from the communicator.
 * Nothing here imports from the communicator or reads student data.
 */
function FunZone() {
  const [apply, setApply] = useState<(() => void) | null>(null);
  const [cheer, setCheer] = useState("");

  useEffect(() => {
    registerServiceWorker((applyUpdate) => setApply(() => applyUpdate));
  }, []);

  const onEvent = useCallback((e: HereALittleEvent) => {
    if (e.type === "round-start") setCheer("");
    if (e.type === "round-complete") {
      setCheer(
        e.perfect
          ? "A perfect painting! You followed the hand all 12 times."
          : `Picture finished. You followed the hand ${e.followed} of 12 times.`,
      );
    }
  }, []);

  return (
    <main className="fun">
      <header className="fun-header">
        <a className="back" href={import.meta.env.BASE_URL}>
          ← Back to Communicate
        </a>
        <h1>Fun zone</h1>
      </header>
      {apply && (
        <p className="fun-update" role="status">
          A new version is ready.{" "}
          <button type="button" onClick={apply}>
            Update now
          </button>
        </p>
      )}
      <section aria-labelledby="hal-title">
        <h2 id="hal-title">Here a Little, There a Little</h2>
        <p className="fun-lead">
          Paint where the glowing hand points, one stroke at a time, and watch a hidden picture
          appear. Space or Enter paints too, so it works with a switch.
        </p>
        <HereALittleGame onEvent={onEvent} />
        <p className="fun-cheer" role="status" aria-live="polite">
          {cheer}
        </p>
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
createRoot(container).render(
  <StrictMode>
    <FunZone />
  </StrictMode>,
);
