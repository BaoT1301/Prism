import { StrictMode } from "react";
import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import { AuthApp } from "./auth/AuthApp";
import "./features/teacher/teacher.css";
import "./sandbox-demo/styles.css";

const clerkKey = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  if (!clerkKey || clerkKey.includes("YOUR_CLERK_PUBLISHABLE_KEY")) return <main className="auth"><h1>Prism configuration required</h1><p>Set VITE_CLERK_PUBLISHABLE_KEY.</p></main>;
  return <ClerkProvider publishableKey={clerkKey}><AuthApp /></ClerkProvider>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
