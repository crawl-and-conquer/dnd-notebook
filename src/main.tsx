import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { ErrorBoundary } from "./app/ErrorBoundary";
import { useNotebook } from "./store/notebook";
import { useTools } from "./store/tools";
import { backend } from "./storage/backend";
import "./styles/app.css";
import "./styles/shell.css";
import "./styles/panels.css";

// Dev builds only: lets end-to-end scripts and the browser preview reach the stores.
if (import.meta.env.DEV) {
  (window as unknown as { __dnd: unknown }).__dnd = { useNotebook, useTools, backend };
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
