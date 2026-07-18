import { StrictMode } from "react";
import { ClerkProvider } from "@clerk/react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/dm-serif-display/latin-400.css";
import "@fontsource/dm-serif-display/latin-400-italic.css";
import { AuthApp } from "./auth/AuthApp";
import "./styles.css";

const clerkKey = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_CLERK_PUBLISHABLE_KEY;

function App() {
  if (!clerkKey || clerkKey.includes("YOUR_CLERK_PUBLISHABLE_KEY")) {
    return <main className="system-message"><p className="eyebrow">Configuration</p><h1>Prism needs a Clerk key.</h1><p>Set <code>VITE_CLERK_PUBLISHABLE_KEY</code> and restart the frontend.</p></main>;
  }

  return (
    <ClerkProvider
      publishableKey={clerkKey}
      appearance={{
        variables: {
          colorPrimary: "#2922a8",
          colorBackground: "#fffdf5",
          colorForeground: "#171712",
          colorMutedForeground: "#68675f",
          colorNeutral: "#171712",
          borderRadius: "0.9rem",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        },
        options: { elevation: "flush" },
        elements: {
          rootBox: { width: "100%" },
          cardBox: { width: "100%", boxShadow: "none" },
          card: { width: "100%", boxShadow: "none", border: "0", padding: "0" },
          footer: { background: "transparent" },
          footerActionLink: { fontWeight: 700 },
          formButtonPrimary: { boxShadow: "none", fontWeight: 700 },
        },
      }}
    >
      <AuthApp />
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
