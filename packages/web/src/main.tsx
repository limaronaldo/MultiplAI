import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { DashboardCustomizationProvider } from "@/components/dashboard/DashboardCustomization";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <DashboardCustomizationProvider>
          <App />
        </DashboardCustomizationProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
