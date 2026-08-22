import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App.tsx";
import "./index.css";
import { applyZoomLevel, getZoomLevel } from "./lib/user-prefs";

// Restore the user's zoom level before first paint.
applyZoomLevel(getZoomLevel());


createRoot(document.getElementById("root")!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>
);
