import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyStoredAppearance } from "./appearance";
import { App } from "./App";
import "./index.css";
import "./styles/folder-icons.css";
import "./styles/motion.css";

applyStoredAppearance();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
