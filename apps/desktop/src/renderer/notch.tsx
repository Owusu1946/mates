import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Notch } from "./notch/Notch.tsx";
import "./styles.css";

// The notch is always black, whatever the app's theme, so it reads as part of the camera housing.
// Its page sets Nightly dark in notch.html and never touches the shared appearance.
document.documentElement.dataset.platform = window.mates.platform;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Notch />
  </StrictMode>,
);
