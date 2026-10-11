import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../styles/folder-icons.css";
import "../styles/motion.css";
import { IconGallery } from "./IconGallery";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <IconGallery />
  </StrictMode>,
);
