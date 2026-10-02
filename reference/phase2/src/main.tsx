import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/public-sans/400.css";
import "@fontsource/public-sans/600.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import { ActivityProvider, cssVariablesFor } from "@kit";
import { theme } from "./theme";
import "./index.css";
import App from "./App";

const styleEl = document.createElement("style");
styleEl.textContent = cssVariablesFor(theme.palette, theme.typefaces);
document.head.appendChild(styleEl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <ActivityProvider>
        <App />
      </ActivityProvider>
    </HashRouter>
  </React.StrictMode>
);
