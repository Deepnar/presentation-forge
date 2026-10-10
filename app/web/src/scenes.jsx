import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import SceneViewer from "./components/SceneViewer.jsx";
import { startAppearance } from "./lib/appearance.js";
import "./styles.css";

startAppearance();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SceneViewer />
  </React.StrictMode>,
);
