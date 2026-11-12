import { useEffect, useState } from "react";
import { captureEnvironment, type EnvironmentSnapshot } from "../shared/environment";
import { mount } from "../shared/mount";

function Hub() {
  const [env, setEnv] = useState<EnvironmentSnapshot | null>(null);
  useEffect(() => {
    void captureEnvironment().then(setEnv);
  }, []);

  return (
    <main>
      <h1>Project Communicate — Phase 0 device spikes</h1>
      <p className="lead">
        Two tests that decide whether the web-first plan holds on real tablets. Neither uses real
        student data.
      </p>

      <div className="panel">
        <strong>Before you start:</strong> open this page in Safari, tap Share →{" "}
        <strong>Add to Home Screen</strong>, then open it from the new icon.
        {env && (
          <p className="quiet">
            Right now:{" "}
            {env.standalone ? "opened from the Home Screen ✓" : "opened in a browser tab"}
            {" · "}
            {env.online ? "online" : "offline"}
            {" · "}
            WebGPU {env.webgpu ? "available" : "not available"}
          </p>
        )}
      </div>

      <h2>
        <a href="./storage/">1. Storage spike</a>
      </h2>
      <p>
        Saves a SQLite database in the browser and checks, on every launch over days and weeks,
        whether every byte is still there.
      </p>

      <h2>
        <a href="./voice/">2. Voice spike</a>
      </h2>
      <p>
        Renders 200 AAC phrases with an open neural voice, stores them as audio clips, and measures
        how quickly a tap produces sound, online and offline.
      </p>

      <p className="quiet">Build {__BUILD_ID__}</p>
    </main>
  );
}

mount(Hub);
