import React from "react";
import { createRoot } from "react-dom/client";
import "./sidebar.css";
import SidePanel from "./SidePanel";

createRoot(document.getElementById("root")!).render(<SidePanel />);
