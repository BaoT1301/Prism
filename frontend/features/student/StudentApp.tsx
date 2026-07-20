import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "../../components/AppChrome";
import { apiRequest, resolveApiBaseUrl, type AccessTokenProvider } from "../../lib/api-client";
import { createSandboxApi } from "../../lib/sandbox/sandbox-api";
import { SandboxRenderer } from "../sandbox/SandboxRenderer";
import type { SandboxLaunch } from "../sandbox/sandbox-types";

type ClassItem = { id: string; name: string; subject: string; grade_level: string };
type Assignment = { id: string; title: string; topic: string; status: string; sandbox_type: "parameter_explorer" | "graph_lab" | "guided_activity" };
type InterestKey = "sports" | "games" | "movies" | "hobbies" | "career_interests" | "favorite_animals" | "favorite_subjects" | "additional_interests";
type Interests = Record<InterestKey, string[]>;
type InterestDrafts = Record<InterestKey, string>;

const emptyInterests: Interests = {
  sports: [], games: [], movies: [], hobbies: [], career_interests: [],
  favorite_animals: [], favorite_subjects: [], additional_interests: [],
};
const emptyDrafts: InterestDrafts = {
  sports: "", games: "", movies: "", hobbies: "", career_interests: "",
  favorite_animals: "", favorite_subjects: "", additional_interests: "",
};

const interestFields: { key: InterestKey; label: string; placeholder: string }[] = [
  { key: "sports", label: "Sports", placeholder: "Basketball, swimming" },
  { key: "games", label: "Games", placeholder: "Minecraft, chess" },
  { key: "hobbies", label: "Hobbies", placeholder: "Drawing, cooking" },
  { key: "favorite_subjects", label: "Favorite subjects", placeholder: "Physics, history" },
  { key: "movies", label: "Stories & movies", placeholder: "Sci-fi, mysteries" },
  { key: "career_interests", label: "Future interests", placeholder: "Engineering, medicine" },
  { key: "favorite_animals", label: "Favorite animals", placeholder: "Dogs, dolphins" },
  { key: "additional_interests", label: "Anything else", placeholder: "Space, music production" },
];

const splitList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const normalizeInterests = (value: Interests) => Object.fromEntries(interestFields.map(({ key }) => [key, value[key] ?? []])) as Interests;
const experienceLabel: Record<Assignment["sandbox_type"], string> = {
  parameter_explorer: "Parameter Explorer",
  graph_lab: "Graph Lab",
  guided_activity: "Guided Investigation",
};

export function StudentApp({ getAccessToken, onSignOut }: { getAccessToken: AccessTokenProvider; onSignOut: () => Promise<unknown> }) {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [interests, setInterests] = useState<Interests>(emptyInterests);
  const [interestDrafts, setInterestDrafts] = useState<InterestDrafts>(emptyDrafts);
  const [selected, setSelected] = useState<string>();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [launch, setLaunch] = useState<SandboxLaunch>();
  const [error, setError] = useState<string>();
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [savingInterests, setSavingInterests] = useState(false);
  const [interestsSaved, setInterestsSaved] = useState(false);
  const [launchingId, setLaunchingId] = useState<string>();
  const apiBaseUrl = resolveApiBaseUrl();
  const sandboxApi = useMemo(() => createSandboxApi(apiBaseUrl, getAccessToken), [apiBaseUrl, getAccessToken]);

  const load = useCallback(() => {
    setError(undefined);
    void Promise.all([
      apiRequest<{ items: ClassItem[] }>("/api/v1/classes", {}, getAccessToken),
      apiRequest<Interests>("/api/v1/me/interests", {}, getAccessToken).catch(() => emptyInterests),
    ]).then(([classData, saved]) => {
      const normalized = normalizeInterests(saved);
      setClasses(classData.items);
      setInterests(normalized);
      setInterestDrafts(Object.fromEntries(interestFields.map(({ key }) => [key, normalized[key].join(", ")])) as InterestDrafts);
    }).catch((reason: Error) => setError(reason.message));
  }, [getAccessToken]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!selected) return;
    setError(undefined);
    void apiRequest<{ items: Assignment[] }>(`/api/v1/classes/${selected}/assignments`, {}, getAccessToken)
      .then((data) => setAssignments(data.items))
      .catch((reason: Error) => setError(reason.message));
  }, [getAccessToken, selected]);

  if (launch) {
    return (
      <SandboxRenderer
        spec={launch.assignment.sandbox_spec}
        session={launch.session}
        api={sandboxApi}
        onExit={() => setLaunch(undefined)}
      />
    );
  }

  const interestCount = Object.values(interests).reduce((total, items) => total + items.length, 0);
  const selectedClass = classes.find((item) => item.id === selected);

  return (
    <AppShell role="Student" onSignOut={onSignOut}>
      <section className="dashboard-hero student-hero">
        <div className="hero-copy">
          <p className="eyebrow">Your learning studio</p>
          <h1>Learn it through<br /><em>what you love.</em></h1>
          <p>Join a class, tell Prism what lights you up, and turn every assignment into an experience that feels made for you.</p>
        </div>
        <div className="hero-composition student-composition" aria-hidden="true">
          <span className="composition-ring ring-a" />
          <span className="composition-ring ring-b" />
          <span className="composition-card card-a">F = ma</span>
          <span className="composition-card card-b">your world</span>
          <span className="composition-dot" />
        </div>
      </section>

      <section className="metric-strip" aria-label="Workspace overview">
        <div><strong>{classes.length}</strong><span>Classes joined</span></div>
        <div><strong>{assignments.length}</strong><span>Assignments in view</span></div>
        <div><strong>{interestCount}</strong><span>Personal signals</span></div>
        <p>Every signal helps Prism choose examples that feel familiar while keeping your learning objective exactly the same.</p>
      </section>

      {error && <p className="notice" role="alert">{error}</p>}

      <section className="student-setup-grid">
        <article className="surface join-surface">
          <div className="surface-number">01</div>
          <div className="surface-heading">
            <p className="eyebrow">Find your classroom</p>
            <h2>Join with a class code.</h2>
            <p>Your teacher will share a short code. Enter it once and the class stays in your workspace.</p>
          </div>
          <form className="inline-form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setError(undefined);
            setJoining(true);
            void apiRequest("/api/v1/classes/join", {
              method: "POST",
              body: JSON.stringify({ join_code: joinCode }),
            }, getAccessToken).then(() => {
              setJoinCode("");
              load();
            }).catch((reason: Error) => setError(reason.message)).finally(() => setJoining(false));
          }}>
            <label className="field"><span>Class code</span><input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="E.G. F7K29Q" maxLength={12} required /></label>
            <button disabled={joining}>{joining ? "Joining..." : "Join class"}</button>
          </form>
        </article>

        <article className="surface interest-surface">
          <div className="surface-number">02</div>
          <div className="surface-heading">
            <p className="eyebrow">Tune your Prism</p>
            <h2>What makes you curious?</h2>
            <p>Add a few things you genuinely enjoy. Separate multiple ideas with commas—you can change these anytime.</p>
          </div>
          <form className="interest-form" onSubmit={(event) => {
            event.preventDefault();
            const next = Object.fromEntries(interestFields.map(({ key }) => [key, splitList(interestDrafts[key])])) as Interests;
            setError(undefined);
            setInterestsSaved(false);
            setSavingInterests(true);
            void apiRequest<Interests>("/api/v1/me/interests", {
              method: "PUT",
              body: JSON.stringify(next),
            }, getAccessToken).then((saved) => {
              const normalized = normalizeInterests(saved);
              setInterests(normalized);
              setInterestDrafts(Object.fromEntries(interestFields.map(({ key }) => [key, normalized[key].join(", ")])) as InterestDrafts);
              setInterestsSaved(true);
            }).catch((reason: Error) => setError(reason.message)).finally(() => setSavingInterests(false));
          }}>
            <div className="interest-grid">
              {interestFields.map((field) => (
                <label className="field compact-field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    value={interestDrafts[field.key]}
                    placeholder={field.placeholder}
                    onChange={(event) => setInterestDrafts((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="form-footer">
              <p className={interestsSaved ? "success-note" : "muted"}>{interestsSaved ? "Your Prism is tuned." : `${interestCount} interests saved to your profile`}</p>
              <button disabled={savingInterests}>{savingInterests ? "Saving..." : "Save interests"}</button>
            </div>
          </form>
        </article>
      </section>

      <section className="content-section">
        <div className="section-title-row">
          <div><p className="eyebrow">Your spaces</p><h2>Classes</h2></div>
          <p>Choose a class to see what is ready for you.</p>
        </div>
        {classes.length ? (
          <div className="class-grid">
            {classes.map((item, index) => (
              <article className={`class-card ${selected === item.id ? "is-selected" : ""}`} key={item.id}>
                <div className="class-card-index">{String(index + 1).padStart(2, "0")}</div>
                <p className="class-subject">{item.subject}</p>
                <h3>{item.name}</h3>
                <p>Grade {item.grade_level}</p>
                <button className="card-link" type="button" onClick={() => setSelected(item.id)}>
                  {selected === item.id ? "Assignments open" : "View assignments"}<span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state"><span aria-hidden="true">01</span><div><h3>Your first class will appear here.</h3><p>Ask your teacher for a class code, then use the join panel above.</p></div></div>
        )}
      </section>

      {selected && (
        <section className="content-section assignment-section">
          <div className="section-title-row">
            <div><p className="eyebrow">Now learning</p><h2>{selectedClass?.name ?? "Published assignments"}</h2></div>
            <button className="text-button" type="button" onClick={() => setSelected(undefined)}>Close</button>
          </div>
          {assignments.length ? (
            <div className="assignment-list">
              {assignments.map((assignment) => (
                <article className="assignment-row" key={assignment.id}>
                  <span className="assignment-icon" aria-hidden="true">↗</span>
                  <div><p>{assignment.topic} <span className="assignment-format">{experienceLabel[assignment.sandbox_type]}</span></p><h3>{assignment.title}</h3></div>
                  <span className="status-pill published">Ready</span>
                  <button type="button" disabled={launchingId === assignment.id} onClick={() => {
                    setError(undefined);
                    setLaunchingId(assignment.id);
                    void sandboxApi.launchAssignment(assignment.id).then(setLaunch).catch((reason: Error) => setError(reason.message)).finally(() => setLaunchingId(undefined));
                  }}>{launchingId === assignment.id ? "Personalizing..." : "Start assignment"}</button>
                </article>
              ))}
            </div>
          ) : <div className="empty-state"><span aria-hidden="true">—</span><div><h3>No published assignments yet.</h3><p>When your teacher publishes one, it will be ready here.</p></div></div>}
        </section>
      )}
    </AppShell>
  );
}
