import { FormEvent, useEffect, useState } from "react";
import { SignIn, useAuth } from "@clerk/react";

import { StudentApp } from "../features/student/StudentApp";
import { TeacherApp } from "../features/teacher/TeacherApp";
import { apiRequest } from "../lib/api-client";

type AccessTokenProvider = () => Promise<string | null>;

export function AuthApp() {
  const { getToken, isLoaded, isSignedIn, signOut } = useAuth();

  if (!isLoaded) return <main className="auth"><p>Loading session...</p></main>;
  if (!isSignedIn) return <main className="auth"><h1>Prism</h1><p>Sign in or create an account to continue.</p><SignIn withSignUp fallbackRedirectUrl="/" signUpFallbackRedirectUrl="/" /></main>;
  return <Workspace getAccessToken={getToken} onSignOut={signOut} />;
}

function Workspace({ getAccessToken, onSignOut }: { getAccessToken: AccessTokenProvider; onSignOut: () => Promise<void> }) {
  const [profile, setProfile] = useState<{ role: "teacher" | "student" }>();
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string>();
  const [bootstrapError, setBootstrapError] = useState<string>();

  useEffect(() => {
    void apiRequest<{ role: "teacher" | "student" }>("/api/v1/me", {}, getAccessToken)
      .then(setProfile)
      .catch((reason: Error & { code?: string }) => {
        if (reason.code === "PROFILE_NOT_PROVISIONED") setMissing(true);
        else setError(reason.message);
      });
  }, [getAccessToken]);

  if (error) return <main className="auth"><h1>Unable to load your profile</h1><p className="notice" role="alert">{error}</p><button onClick={() => location.reload()}>Try again</button></main>;
  if (missing) return <main className="auth"><h1>Set up your profile</h1><form className="form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBootstrapError(undefined); void apiRequest("/api/v1/profiles/bootstrap", { method: "POST", body: JSON.stringify({ display_name: String(form.get("name")), role: String(form.get("role")) }) }, getAccessToken).then(() => location.reload()).catch((reason: Error) => setBootstrapError(reason.message)); }}><label className="field">Display name<input name="name" required /></label><label className="field">I am a<select name="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label>{bootstrapError && <p className="notice" role="alert">{bootstrapError}</p>}<button>Continue</button></form></main>;
  if (!profile) return <main className="auth"><p>Loading profile...</p></main>;
  return profile.role === "student" ? <StudentApp getAccessToken={getAccessToken} onSignOut={onSignOut} /> : <TeacherApp getAccessToken={getAccessToken} onSignOut={onSignOut} />;
}
