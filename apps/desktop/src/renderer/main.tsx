import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { startAppearance } from "./theme/appearance.ts";
import "./styles.css";

// Platform and appearance go on <html> first, so the right title bar and colours paint on the first frame.
document.documentElement.dataset.platform = window.mates.platform;
startAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
