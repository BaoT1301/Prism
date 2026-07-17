import { FormEvent, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { TeacherApp } from "../features/teacher/TeacherApp";
import { StudentApp } from "../features/student/StudentApp";
import { apiRequest } from "../lib/api-client";
import { supabase } from "../lib/supabase";

export function AuthApp() {
  const [session, setSession] = useState<Session | null>();
  const [mode, setMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [error, setError] = useState<string>();
  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!supabase) return <main className="auth"><h1>Prism configuration required</h1><p>Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.</p></main>;
  const client = supabase;
  if (session === undefined) return <main className="auth"><p>Loading session…</p></main>;
  if (!session) return <main className="auth"><h1>Prism</h1><p>{mode === "sign_in" ? "Sign in to continue." : "Create your account."}</p><form className="form" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const email = String(form.get("email")); const password = String(form.get("password")); const request = mode === "sign_in" ? client.auth.signInWithPassword({ email, password }) : client.auth.signUp({ email, password }); void request.then(({ error: reason, data }) => setError(reason?.message ?? (mode === "sign_up" && !data.session ? "Check your email to confirm the account." : undefined))); }}><label className="field">Email<input name="email" type="email" required /></label><label className="field">Password<input name="password" type="password" minLength={8} required /></label>{error && <p className="notice" role="alert">{error}</p>}<button>{mode === "sign_in" ? "Sign in" : "Create account"}</button></form><button className="link" onClick={() => setMode(mode === "sign_in" ? "sign_up" : "sign_in")}>{mode === "sign_in" ? "Need an account? Sign up" : "Already have an account? Sign in"}</button></main>;
  return <Workspace client={client} />;
}

function Workspace({ client }: { client: NonNullable<typeof supabase> }) {
  const getAccessToken = async () => (await client.auth.getSession()).data.session?.access_token ?? null;
  const [profile, setProfile] = useState<{ role: "teacher" | "student" }>(); const [missing, setMissing] = useState(false); const [error, setError] = useState<string>(); const [bootstrapError, setBootstrapError] = useState<string>();
  useEffect(() => { void apiRequest<{ role: "teacher" | "student" }>("/api/v1/me", {}, getAccessToken).then(setProfile).catch((reason: Error & { code?: string }) => { if (reason.code === "PROFILE_NOT_PROVISIONED") setMissing(true); else setError(reason.message); }); }, []);
  if (error) return <main className="auth"><h1>Unable to load your profile</h1><p className="notice" role="alert">{error}</p><button onClick={() => location.reload()}>Try again</button></main>;
  if (missing) return <main className="auth"><h1>Set up your profile</h1><form className="form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setBootstrapError(undefined); void apiRequest("/api/v1/profiles/bootstrap", { method: "POST", body: JSON.stringify({ display_name: String(form.get("name")), role: String(form.get("role")) }) }, getAccessToken).then(() => location.reload()).catch((reason: Error) => setBootstrapError(reason.message)); }}><label className="field">Display name<input name="name" required /></label><label className="field">I am a<select name="role"><option value="student">Student</option><option value="teacher">Teacher</option></select></label>{bootstrapError && <p className="notice" role="alert">{bootstrapError}</p>}<button>Continue</button></form></main>;
  if (!profile) return <main className="auth"><p>Loading profile…</p></main>;
  return profile.role === "student" ? <StudentApp getAccessToken={getAccessToken} onSignOut={() => client.auth.signOut()} /> : <TeacherApp getAccessToken={getAccessToken} onSignOut={() => client.auth.signOut()} />;
}
