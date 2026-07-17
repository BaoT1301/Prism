import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthApp } from "./auth/AuthApp";
import "./features/teacher/teacher.css";
import "./sandbox-demo/styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><AuthApp /></StrictMode>);
