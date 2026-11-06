import React from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/ui/theme-provider";
import App from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ThemeProvider defaultMode="system" storageKey="kratonos-ui-theme-session">
        <App />
      </ThemeProvider>
    </React.StrictMode>
  );
}
