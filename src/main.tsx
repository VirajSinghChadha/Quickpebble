import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/globals.css";

// Development only (the Vite dev server): the screenshot script sets sample states through the app's own stores.
// import.meta.env.DEV is false in release builds, so this whole block is removed from them.
if (import.meta.env.DEV) {
  void Promise.all([import("./store/useStore"), import("./store/useChat"), import("./store/useReview"), import("./store/useRoutines"), import("./store/useAccount"), import("./store/useTaskManager"), import("./lib/ipc")]).then(([a, b, c, d, e, f, g]) => {
    Object.assign(window, { __qpDev: { useStore: a.useStore, useChat: b.useChat, useReview: c.useReview, useRoutines: d.useRoutines, useAccount: e.useAccount, useTaskManager: f.useTaskManager, ipc: g.ipc } });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
