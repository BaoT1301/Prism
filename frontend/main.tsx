import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TeacherApp } from "./features/teacher/TeacherApp";
import "./features/teacher/teacher.css";

/** Person 6's auth client can expose this provider without coupling teacher screens to Supabase. */
declare global { interface Window { prismAuth?: { getAccessToken: () => Promise<string | null>; signOut?: () => Promise<void> } } }
createRoot(document.getElementById("root")!).render(<StrictMode><TeacherApp getAccessToken={() => window.prismAuth?.getAccessToken() ?? Promise.resolve(null)} /></StrictMode>);
