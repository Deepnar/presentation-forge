import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import App from "./App.jsx";
import { startAppearance } from "./lib/appearance.js";
import "./styles.css";

// Before render: the pre-paint script in index.html has already put a theme on
// the root, this re-applies it from the same source and starts listening for
// OS and cross-tab changes.
startAppearance();

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
