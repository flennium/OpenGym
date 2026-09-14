import React from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "./app/runtime";
import { App } from "./features/app";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
);
