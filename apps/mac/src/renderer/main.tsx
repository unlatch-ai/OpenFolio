import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

async function startRenderer() {
  if (import.meta.env.DEV) {
    const { installDevPreviewBridge } = await import("./dev-preview");
    installDevPreviewBridge();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
}

void startRenderer();
