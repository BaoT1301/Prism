import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell, PrismBrand } from "../../components/AppChrome";
import type { AccessTokenProvider, ApiError } from "../../lib/api-client";
import { createTeacherApi, type Assignment, type AssignmentInput, type ClassInput } from "./teacher-api";

type TeacherApi = ReturnType<typeof createTeacherApi>;
type Route =
  | { page: "dashboard" | "new-class" }
  | { page: "class" | "new-assignment"; classId: string }
  | { page: "assignment"; assignmentId: string };

const routeFor = (): Route => {
  const parts = location.hash.replace(/^#\//, "").split("/");
  if (parts[0] === "classes" && parts[1] === "new") return { page: "new-class" };
  if (parts[0] === "classes" && parts[2] === "assignments" && parts[3] === "new") return { page: "new-assignment", classId: parts[1] };
  if (parts[0] === "classes" && parts[1]) return { page: "class", classId: parts[1] };
  if (parts[0] === "assignments" && parts[1]) return { page: "assignment", assignmentId: parts[1] };
  return { page: "dashboard" };
};

const go = (path: string) => { location.hash = path; };
const message = (reason: unknown) => {
  const error = reason as ApiError;
  return `${error.code ? `[${error.code}] ` : ""}${error.message ?? "Something went wrong."}${error.requestId ? ` (Support ID: ${error.requestId})` : ""}`;
};
const date = (value?: string | null) => value
  ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Not submitted";

function useResource<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void loadRef.current().then(setData).catch((reason) => setError(message(reason))).finally(() => setLoading(false));
  }, [key]);
  useEffect(reload, [reload]);
  return { data, error, loading, reload };
}

function Notice({ error }: { error?: string }) {
  return error ? <p className="notice" role="alert">{error}</p> : null;
}

function Loading({ label = "Loading your workspace..." }: { label?: string }) {
  return <div className="content-loading" role="status"><span aria-hidden="true" /><p>{label}</p></div>;
}

function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="empty-state"><span aria-hidden="true">—</span><div><h3>{title}</h3><p>{children}</p></div></div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function PageBack({ href, children }: { href: string; children: ReactNode }) {
  return <a className="breadcrumb" href={href}><span aria-hidden="true">←</span>{children}</a>;
}

function AssignmentForm({ initial, onSubmit, saving }: { initial?: Assignment; onSubmit: (value: AssignmentInput) => void; saving: boolean }) {
  return (
    <form className="form form-surface" onSubmit={(event) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      onSubmit({
        title: String(form.get("title")),
        topic: String(form.get("topic")),
        learning_objective: String(form.get("learning_objective")),
        grade_level: String(form.get("grade_level")),
        instructions: String(form.get("instructions")),
        sandbox_type: "parameter_explorer",
      });
    }}>
      <div className="form-section-heading"><span>01</span><div><h2>Assignment essentials</h2><p>Start with the academic goal. Prism will personalize the context, never the objective.</p></div></div>
      <div className="form-grid">
        <Field label="Assignment title"><input name="title" placeholder="Newton's Second Law Lab" required defaultValue={initial?.title} /></Field>
        <Field label="Lesson topic"><input name="topic" placeholder="Newton's Second Law" required defaultValue={initial?.topic} /></Field>
        <Field label="Grade level"><input name="grade_level" placeholder="10" required defaultValue={initial?.grade_level} /></Field>
        <Field label="Experience type" hint="The supported interactive MVP renderer."><input value="Parameter explorer" disabled /></Field>
      </div>
      <Field label="Learning objective" hint="This exact objective is preserved for every student."><textarea name="learning_objective" rows={4} placeholder="Apply F = ma to calculate force, mass, or acceleration." required defaultValue={initial?.learning_objective} /></Field>
      <Field label="Teacher instructions"><textarea name="instructions" rows={5} placeholder="Invite students to change mass and acceleration, observe the force, and explain the pattern." defaultValue={initial?.instructions ?? ""} /></Field>
      <div className="form-submit-row"><p>Saved assignments begin as private drafts.</p><button disabled={saving}>{saving ? "Saving draft..." : "Save draft"}</button></div>
    </form>
  );
}

export function TeacherApp({ getAccessToken, onSignOut }: { getAccessToken: AccessTokenProvider; onSignOut: () => Promise<unknown> }) {
  const api = useMemo(() => createTeacherApi(getAccessToken), [getAccessToken]);
  const [route, setRoute] = useState(routeFor());
  const profile = useResource(api.me, "profile");

  useEffect(() => {
    const update = () => setRoute(routeFor());
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);

  if (profile.loading) return <main className="loading-screen"><span className="loading-mark" aria-hidden="true" /><p>Opening your teaching studio...</p></main>;
  if (profile.error?.includes("PROFILE_NOT_PROVISIONED")) return <Bootstrap api={api} />;
  if (profile.error) return <main className="system-message"><PrismBrand /><h1>We could not open your teacher profile.</h1><Notice error={profile.error} /></main>;
  if (profile.data?.role !== "teacher") return <main className="system-message"><PrismBrand /><h1>This is a teacher workspace.</h1><p>Your current Prism profile is registered as a student.</p></main>;

  return (
    <AppShell role="Teacher" name={profile.data.display_name} onSignOut={onSignOut}>
      {route.page === "dashboard" && <Dashboard api={api} name={profile.data.display_name} />}
      {route.page === "new-class" && <NewClass api={api} />}
      {route.page === "class" && <ClassPage api={api} classId={route.classId} />}
      {route.page === "new-assignment" && <NewAssignment api={api} classId={route.classId} />}
      {route.page === "assignment" && <AssignmentPage api={api} assignmentId={route.assignmentId} />}
    </AppShell>
  );
}

function Bootstrap({ api }: { api: TeacherApi }) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  return (
    <main className="system-message setup-card">
      <PrismBrand />
      <p className="eyebrow">Teacher setup</p>
      <h1>Create your teaching studio.</h1>
      <form className="form" onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        void api.bootstrap(String(new FormData(event.currentTarget).get("name"))).then(() => location.reload()).catch((reason) => setError(message(reason))).finally(() => setSaving(false));
      }}>
        <Notice error={error} />
        <Field label="Display name"><input name="name" required /></Field>
        <button disabled={saving}>{saving ? "Creating..." : "Continue"}</button>
      </form>
    </main>
  );
}

function Dashboard({ api, name }: { api: TeacherApi; name: string }) {
  const resource = useResource(api.classes, "classes");
  const classes = resource.data?.items ?? [];
  const studentTotal = classes.reduce((total, item) => total + item.student_count, 0);
  const assignmentTotal = classes.reduce((total, item) => total + item.assignment_count, 0);
  const firstName = name.trim().split(/\s+/)[0];

  return (
    <>
      <section className="dashboard-hero teacher-hero">
        <div className="hero-copy"><p className="eyebrow">Good to see you, {firstName}</p><h1>Teach one idea.<br /><em>Open many doors.</em></h1><p>Build a shared learning objective, then let Prism meet each student in a world they already understand.</p><button onClick={() => go("/classes/new")}>Create a class <span aria-hidden="true">→</span></button></div>
        <div className="hero-composition teacher-composition" aria-hidden="true"><span className="lesson-sheet"><i>OBJECTIVE</i><b>F = ma</b><small>same destination</small></span><span className="student-path path-one">sport</span><span className="student-path path-two">space</span><span className="student-path path-three">speed</span></div>
      </section>
      <section className="metric-strip" aria-label="Classroom overview">
        <div><strong>{classes.length}</strong><span>Active classes</span></div>
        <div><strong>{studentTotal}</strong><span>Students reached</span></div>
        <div><strong>{assignmentTotal}</strong><span>Learning missions</span></div>
        <p>Personalization changes the way in—not the rigor, goal, or standard.</p>
      </section>
      <Notice error={resource.error} />
      <section className="content-section">
        <div className="section-title-row"><div><p className="eyebrow">Classroom index</p><h2>Your classes</h2></div><button className="secondary-button" onClick={() => go("/classes/new")}>New class</button></div>
        {resource.loading ? <Loading /> : classes.length ? (
          <div className="class-grid">{classes.map((item, index) => (
            <article className="class-card" key={item.id}>
              <div className="class-card-index">{String(index + 1).padStart(2, "0")}</div>
              <p className="class-subject">{item.subject}</p><h3>{item.name}</h3><p>Grade {item.grade_level}</p>
              <div className="class-meta"><span>{item.student_count} students</span><span>{item.assignment_count} assignments</span></div>
              <button className="card-link" onClick={() => go(`/classes/${item.id}`)}>Open class <span aria-hidden="true">→</span></button>
            </article>
          ))}</div>
        ) : <Empty title="Your first classroom starts here.">Create a class, share its code, and begin building a personalized learning mission.</Empty>}
      </section>
    </>
  );
}

function NewClass({ api }: { api: TeacherApi }) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  return (
    <section className="page-stack narrow-page">
      <PageBack href="#/">Classes</PageBack>
      <div className="page-intro"><p className="eyebrow">A new learning space</p><h1>Create a class.</h1><p>Give students a clear home for assignments, experiments, and progress.</p></div>
      <Notice error={error} />
      <form className="form form-surface" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const value: ClassInput = { name: String(form.get("name")), subject: String(form.get("subject")), grade_level: String(form.get("grade_level")), description: String(form.get("description")) };
        setSaving(true);
        void api.createClass(value).then((created) => go(`/classes/${created.id}`)).catch((reason) => setError(message(reason))).finally(() => setSaving(false));
      }}>
        <div className="form-grid">
          <Field label="Class name"><input name="name" placeholder="Physics 101" required /></Field>
          <Field label="Subject"><input name="subject" placeholder="Physics" required /></Field>
          <Field label="Grade level"><input name="grade_level" placeholder="10" required /></Field>
        </div>
        <Field label="Description"><textarea name="description" rows={5} placeholder="A short note about what this class will explore." /></Field>
        <div className="form-submit-row"><p>Prism creates a unique join code automatically.</p><button disabled={saving}>{saving ? "Creating class..." : "Create class"}</button></div>
      </form>
    </section>
  );
}

function ClassPage({ api, classId }: { api: TeacherApi; classId: string }) {
  const classResource = useResource(() => api.classDetail(classId), `class-${classId}`);
  const members = useResource(() => api.members(classId), `members-${classId}`);
  const assignments = useResource(() => api.assignments(classId), `assignments-${classId}`);
  const [copied, setCopied] = useState(false);
  if (classResource.loading) return <Loading label="Opening class..." />;
  if (!classResource.data) return <Notice error={classResource.error} />;
  const currentClass = classResource.data;

  return (
    <section className="page-stack">
      <PageBack href="#/">All classes</PageBack>
      <div className="class-detail-hero">
        <div><p className="eyebrow">{currentClass.subject} · Grade {currentClass.grade_level}</p><h1>{currentClass.name}</h1><p>{currentClass.description || "A shared space for personalized learning."}</p></div>
        <button onClick={() => go(`/classes/${classId}/assignments/new`)}>Create assignment <span aria-hidden="true">→</span></button>
      </div>
      <div className="join-code-panel">
        <div><p className="eyebrow">Student entry</p><h2>Share this class code.</h2><p>Students enter it once to join this classroom.</p></div>
        <strong>{currentClass.join_code}</strong>
        <button className="secondary-button" onClick={() => {
          void navigator.clipboard?.writeText(currentClass.join_code);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        }}>{copied ? "Copied" : "Copy code"}</button>
      </div>
      <div className="two-col resource-columns">
        <section className="resource-panel">
          <div className="panel-heading"><div><p className="eyebrow">People</p><h2>Students</h2></div><span>{members.data?.total ?? 0}</span></div>
          <Notice error={members.error} />
          {members.loading ? <Loading /> : members.data?.items.length ? <ul className="resource-list">{members.data.items.map((member, index) => <li key={member.student_id}><span className="person-index">{String(index + 1).padStart(2, "0")}</span><strong>{member.display_name}</strong><small>Joined {date(member.joined_at)}</small></li>)}</ul> : <Empty title="No students yet.">Share the class code above to invite your first student.</Empty>}
        </section>
        <section className="resource-panel">
          <div className="panel-heading"><div><p className="eyebrow">Curriculum</p><h2>Assignments</h2></div><span>{assignments.data?.total ?? 0}</span></div>
          <Notice error={assignments.error} />
          {assignments.loading ? <Loading /> : assignments.data?.items.length ? <ul className="resource-list assignment-resource-list">{assignments.data.items.map((assignment) => <li key={assignment.id}><button className="resource-link" onClick={() => go(`/assignments/${assignment.id}`)}><span><small>{assignment.topic}</small><strong>{assignment.title}</strong></span><span className={`status-pill ${assignment.status}`}>{assignment.status}</span></button></li>)}</ul> : <Empty title="No assignments yet.">Create a draft, check the objective, then publish it when ready.</Empty>}
        </section>
      </div>
    </section>
  );
}

function NewAssignment({ api, classId }: { api: TeacherApi; classId: string }) {
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);
  return (
    <section className="page-stack narrow-page">
      <PageBack href={`#/classes/${classId}`}>Class</PageBack>
      <div className="page-intro"><p className="eyebrow">New learning mission</p><h1>Design the objective.<br /><em>Prism shapes the journey.</em></h1><p>Create one rigorous assignment. Each student receives a familiar context at the same level of difficulty.</p></div>
      <Notice error={error} />
      <AssignmentForm saving={saving} onSubmit={(value) => {
        setSaving(true);
        void api.createAssignment(classId, value).then((created) => go(`/assignments/${created.id}`)).catch((reason) => setError(message(reason))).finally(() => setSaving(false));
      }} />
    </section>
  );
}

function AssignmentPage({ api, assignmentId }: { api: TeacherApi; assignmentId: string }) {
  const resource = useResource(() => api.assignment(assignmentId), `assignment-${assignmentId}`);
  const progress = useResource(() => api.progress(assignmentId), `progress-${assignmentId}`);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  if (resource.loading) return <Loading label="Opening assignment..." />;
  const assignment = resource.data;
  if (!assignment) return <Notice error={resource.error} />;
  const save = (value: AssignmentInput) => {
    setSaving(true);
    void api.updateAssignment(assignment.id, value).then(() => { setEditing(false); resource.reload(); }).catch((reason) => setError(message(reason))).finally(() => setSaving(false));
  };
  const publish = () => {
    setSaving(true);
    void api.publishAssignment(assignment.id).then(resource.reload).catch((reason) => setError(message(reason))).finally(() => setSaving(false));
  };

  return (
    <section className="page-stack">
      <PageBack href={`#/classes/${assignment.class_id}`}>Class</PageBack>
      <div className="assignment-detail-hero">
        <div><p className="eyebrow">{assignment.topic}</p><h1>{assignment.title}</h1><span className={`status-pill ${assignment.status}`}>{assignment.status}</span></div>
        {assignment.status === "draft" && <div className="button-group"><button className="secondary-button" onClick={() => setEditing(!editing)}>{editing ? "Close editor" : "Edit draft"}</button><button disabled={saving} onClick={publish}>{saving ? "Publishing..." : "Publish assignment"}</button></div>}
      </div>
      <Notice error={error} />
      {editing ? <AssignmentForm initial={assignment} saving={saving} onSubmit={save} /> : (
        <section className="assignment-brief">
          <div className="brief-lead"><p className="eyebrow">Protected learning objective</p><blockquote>{assignment.learning_objective}</blockquote></div>
          <dl className="details"><div><dt>Grade</dt><dd>{assignment.grade_level}</dd></div><div><dt>Experience</dt><dd>Parameter explorer</dd></div><div><dt>Version</dt><dd>{assignment.content_version}</dd></div><div><dt>Status</dt><dd>{assignment.status}{assignment.published_at ? ` · ${date(assignment.published_at)}` : ""}</dd></div><div className="detail-wide"><dt>Teacher instructions</dt><dd>{assignment.instructions || "No additional instructions."}</dd></div></dl>
        </section>
      )}
      <section className="content-section submission-section">
        <div className="section-title-row"><div><p className="eyebrow">Class pulse</p><h2>Student progress</h2></div><span className="count-badge">{progress.data?.items.filter((student) => student.status === "submitted").length ?? 0} completed</span></div>
        <Notice error={progress.error} />
        {progress.loading ? <Loading /> : progress.data?.items.length ? <ul className="progress-roster">{progress.data.items.map((student, index) => {
          const completion = student.total_steps ? Math.round((student.completed_steps / student.total_steps) * 100) : 0;
          const statusLabel = student.status === "not_started" ? "Not started" : student.status === "in_progress" ? "In progress" : "Submitted";
          return <li key={student.student_id}><span className="person-index">{String(index + 1).padStart(2, "0")}</span><div className="progress-student"><strong>{student.student_name}</strong><small>{student.hints_used === 1 ? "1 hint used" : `${student.hints_used} hints used`}</small>{student.feedback?.teacher_summary && <small>{student.feedback.teacher_summary.mastery ?? "Feedback ready"} · {student.feedback.teacher_summary.attempts ?? 0} attempts</small>}</div><div className="roster-progress"><div><span style={{ width: `${completion}%` }} /></div><small>{student.total_steps ? `${student.completed_steps}/${student.total_steps} steps` : "No activity yet"}</small></div><span className={`status-pill ${student.status}`}>{statusLabel}</span></li>;
        })}</ul> : <Empty title="No students yet.">Share the class code to begin seeing progress here.</Empty>}
      </section>
    </section>
  );
}
