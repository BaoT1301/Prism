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
      signInUrl="/#/sign-in"
      signUpUrl="/#/sign-up"
      appearance={{
        variables: {
          colorPrimary: "#2922a8",
          colorPrimaryForeground: "#fffdf5",
          colorBackground: "#fffdf5",
          colorForeground: "#171712",
          colorMuted: "#f1eee3",
          colorMutedForeground: "#68675f",
          colorNeutral: "#8d8a7e",
          colorInput: "#fffdf5",
          colorInputForeground: "#171712",
          colorBorder: "#aaa69a",
          colorRing: "#d8ed72",
          colorShadow: "#171712",
          borderRadius: "0.8rem",
          fontFamily: "DM Sans, ui-sans-serif, system-ui, sans-serif",
          fontFamilyButtons: "DM Sans, ui-sans-serif, system-ui, sans-serif",
          fontSize: "0.9rem",
        },
        options: { elevation: "flush" },
        elements: {
          rootBox: { width: "100%" },
          cardBox: { width: "100%", boxShadow: "none" },
          card: {
            width: "100%",
            padding: "1.65rem",
            border: "1px solid #171712",
            borderRadius: "1.3rem",
            boxShadow: "7px 7px 0 #d8ed72",
          },
          header: { marginBottom: "1.4rem" },
          headerTitle: {
            color: "#171712",
            fontFamily: "DM Serif Display, Georgia, serif",
            fontSize: "2rem",
            fontWeight: 400,
            letterSpacing: "-0.035em",
          },
          headerSubtitle: { color: "#68675f", fontSize: "0.9rem" },
          socialButtonsBlockButton: {
            minHeight: "2.9rem",
            border: "1px solid #171712",
            borderRadius: "0.75rem",
            boxShadow: "none",
          },
          socialButtonsBlockButtonText: { color: "#171712", fontWeight: 700 },
          dividerLine: { background: "#aaa69a" },
          dividerText: { color: "#68675f", fontSize: "0.74rem", fontWeight: 700, textTransform: "uppercase" },
          formFieldLabel: { color: "#171712", fontWeight: 700 },
          formFieldInput: {
            minHeight: "2.9rem",
            border: "1px solid #8d8a7e",
            borderRadius: "0.75rem",
            boxShadow: "none",
          },
          formFieldInputShowPasswordButton: { color: "#2922a8" },
          formFieldAction: { color: "#2922a8", fontWeight: 700 },
          formButtonPrimary: {
            minHeight: "3rem",
            border: "1px solid #171712",
            borderRadius: "0.75rem",
            boxShadow: "3px 3px 0 #171712",
            fontWeight: 700,
          },
          footer: { marginTop: "1.4rem", background: "transparent" },
          footerActionText: { color: "#68675f" },
          footerActionLink: { color: "#2922a8", fontWeight: 700 },
          identityPreviewText: { color: "#171712" },
          identityPreviewEditButton: { color: "#2922a8", fontWeight: 700 },
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
