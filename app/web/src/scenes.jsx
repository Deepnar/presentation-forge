import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import SceneViewer from "./components/SceneViewer.jsx";
import { startAppearance } from "./lib/appearance.js";
import "./styles.css";

startAppearance();

// Deep-link initialization (?deck=&slide=&select=&zoom=): the smoke
// test drives viewer states through URLs, and V2-5 will reuse slide
// links. All values are validated inside the viewer contracts.
function initialFromQuery() {
  const q = new URLSearchParams(window.location.search);
  return {
    deck: q.get("deck") ?? undefined,
    slide: q.get("slide") ?? undefined,
    select: q.get("select") ?? undefined,
    zoom: q.get("zoom") ?? undefined,
  };
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <SceneViewer initial={initialFromQuery()} />
  </React.StrictMode>,
);
