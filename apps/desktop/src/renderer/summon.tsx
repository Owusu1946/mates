import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SummonBar } from "./summon/SummonBar.tsx";
import { startAppearance } from "./theme/appearance.ts";
import "./styles.css";

// The summon bar's page: the same appearance as the app, on a see-through window.
document.documentElement.dataset.platform = window.mates.platform;
startAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SummonBar />
  </StrictMode>,
);
