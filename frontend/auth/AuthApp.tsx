import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { SignIn, useAuth } from "@clerk/react";

import { PrismBrand, SessionExpired } from "../components/AppChrome";
import { LandingPage } from "../components/LandingPage";
import { StudentApp } from "../features/student/StudentApp";
import { TeacherApp } from "../features/teacher/TeacherApp";
import { apiRequest, ApiError, isAbortError, type AccessTokenProvider } from "../lib/api-client";

function AuthLayout({ children, eyebrow = "Learning, made personal" }: { children: ReactNode; eyebrow?: string }) {
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <PrismBrand />
        <div className="auth-copy">
          <p className="eyebrow">{eyebrow}</p>
          <h1>One objective.<br /><em>Infinite ways in.</em></h1>
          <p>Prism shapes every lesson around what a student already loves—without changing what they need to learn.</p>
        </div>
        <div className="orbit-art" aria-hidden="true">
          <span className="orbit orbit-one" />
          <span className="orbit orbit-two" />
          <span className="orbit orbit-three" />
          <span className="orbit-core">P</span>
          <span className="orbit-note note-one">interest</span>
          <span className="orbit-note note-two">objective</span>
          <span className="orbit-note note-three">discovery</span>
        </div>
        <p className="auth-footnote">A personal learning studio for every classroom.</p>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-inner">{children}</div>
      </section>
    </main>
  );
}

export function AuthApp() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();
  // Keep a stable token accessor so downstream memos/effects keyed on it do not
  // re-run (and refetch) every time Clerk hands back a new getToken identity.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const getAccessToken = useCallback<AccessTokenProvider>(() => getTokenRef.current(), []);
  const [route, setRoute] = useState(() => location.hash);

  useEffect(() => {
    const updateRoute = () => setRoute(location.hash);
    addEventListener("hashchange", updateRoute);
    addEventListener("popstate", updateRoute);
    return () => {
      removeEventListener("hashchange", updateRoute);
      removeEventListener("popstate", updateRoute);
    };
  }, []);

  if (!isLoaded) {
    return <main className="loading-screen"><span className="loading-mark" aria-hidden="true" /><p>Opening your Prism workspace...</p></main>;
  }

  const authRoute = new URLSearchParams(location.search).get("auth");
  const isAuthRoute = authRoute === "sign-in" || authRoute === "sign-up";
  const isLandingRoute = !isSignedIn ? !isAuthRoute : route === "#/welcome";

  if (isLandingRoute) {
    return <LandingPage isSignedIn={Boolean(isSignedIn)} onEnter={() => {
      if (isSignedIn) location.hash = "#/";
      else location.assign("/?auth=sign-in");
    }} />;
  }

  if (!isSignedIn) {
    return (
      <AuthLayout>
        <div className="auth-panel-heading">
          <p className="eyebrow">Welcome to Prism</p>
          <h2>Step into your classroom.</h2>
          <p>Sign in or create an account. Your work will be right where you left it.</p>
        </div>
        <SignIn
          withSignUp
          signUpUrl="/?auth=sign-in"
          fallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
        />
      </AuthLayout>
    );
  }

  return <Workspace getAccessToken={getAccessToken} onSignOut={signOut} />;
}

function Workspace({ getAccessToken, onSignOut }: { getAccessToken: AccessTokenProvider; onSignOut: () => Promise<void> }) {
  const [profile, setProfile] = useState<{ role: "teacher" | "student" }>();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();
  const [authExpired, setAuthExpired] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<{ role: "teacher" | "student" }>("/api/v1/me", { signal: controller.signal }, getAccessToken)
      .then((data) => { if (!controller.signal.aborted) setProfile(data); })
      .catch((reason: unknown) => {
        if (isAbortError(reason)) return;
        if (reason instanceof ApiError && reason.isAuthError) { setAuthExpired(true); return; }
        if (reason instanceof ApiError && reason.code === "PROFILE_NOT_PROVISIONED") setMissing(true);
        else setError(reason instanceof Error ? reason.message : "We could not open your profile.");
      });
    return () => controller.abort();
  }, [getAccessToken]);

  if (authExpired) return <SessionExpired onSignOut={onSignOut} />;

  if (error) {
    return (
      <AuthLayout eyebrow="Something got crossed">
        <div className="auth-panel-heading"><h2>We could not open your profile.</h2></div>
        <p className="notice" role="alert">{error}</p>
        <button type="button" onClick={() => location.reload()}>Try again</button>
      </AuthLayout>
    );
  }

  if (missing) {
    return (
      <AuthLayout eyebrow="A quick introduction">
        <div className="auth-panel-heading">
          <p className="eyebrow">Almost there</p>
          <h2>Make this space yours.</h2>
          <p>Tell us how you use Prism. Your role is permanent for this account.</p>
        </div>
        <form className="form onboarding-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          setBootstrapError(undefined);
          setSaving(true);
          void apiRequest("/api/v1/profiles/bootstrap", {
            method: "POST",
            body: JSON.stringify({ display_name: String(form.get("name")), role: String(form.get("role")) }),
          }, getAccessToken).then(() => location.reload()).catch((reason: unknown) => {
            if (reason instanceof ApiError && reason.isAuthError) { setAuthExpired(true); return; }
            setBootstrapError(reason instanceof Error ? reason.message : "We could not create your space.");
          }).finally(() => setSaving(false));
        }}>
          <label className="field"><span>What should we call you?</span><input name="name" autoComplete="name" placeholder="Your display name" required /></label>
          <fieldset className="role-picker">
            <legend>I am joining as a...</legend>
            <label><input type="radio" name="role" value="student" defaultChecked /><span><strong>Student</strong><small>Join classes and explore assignments</small></span></label>
            <label><input type="radio" name="role" value="teacher" /><span><strong>Teacher</strong><small>Create classes and learning missions</small></span></label>
          </fieldset>
          {bootstrapError && <p className="notice" role="alert">{bootstrapError}</p>}
          <button disabled={saving}>{saving ? "Creating your space..." : "Enter Prism"}</button>
        </form>
      </AuthLayout>
    );
  }

  if (!profile) return <main className="loading-screen"><span className="loading-mark" aria-hidden="true" /><p>Preparing your workspace...</p></main>;

  return profile.role === "student"
    ? <StudentApp getAccessToken={getAccessToken} onSignOut={onSignOut} />
    : <TeacherApp getAccessToken={getAccessToken} onSignOut={onSignOut} />;
}
