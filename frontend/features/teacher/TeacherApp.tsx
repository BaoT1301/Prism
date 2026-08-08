import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AppShell, PrismBrand, SessionExpired } from "../../components/AppChrome";
import { AsyncState, Empty, Loading, Notice, Skeleton } from "../../components/AsyncState";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { AssignmentAnalyticsPanel } from "../../components/teacher/AssignmentAnalyticsPanel";
import { SubmissionReview } from "../../components/teacher/SubmissionReview";
import { ApiError, isAbortError, type AccessTokenProvider } from "../../lib/api-client";
import { createTeacherApi, type Assignment, type AssignmentInput, type AuditEntry, type ClassInput, type ClassSummary, type Collection, type Member } from "./teacher-api";

type TeacherApi = ReturnType<typeof createTeacherApi>;
type Route =
  | { page: "dashboard" | "new-class" }
  | { page: "class" | "new-assignment"; classId: string }
  | { page: "assignment"; assignmentId: string }
  | { page: "submission"; submissionId: string };

const routeFor = (): Route => {
  const parts = location.hash.replace(/^#\//, "").split("/");
  if (parts[0] === "classes" && parts[1] === "new") return { page: "new-class" };
  if (parts[0] === "classes" && parts[2] === "assignments" && parts[3] === "new") return { page: "new-assignment", classId: parts[1] };
  if (parts[0] === "classes" && parts[1]) return { page: "class", classId: parts[1] };
  if (parts[0] === "assignments" && parts[1]) return { page: "assignment", assignmentId: parts[1] };
  if (parts[0] === "submissions" && parts[1]) return { page: "submission", submissionId: parts[1] };
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

type Resource<T> = { data: T | undefined; error?: string; loading: boolean; authExpired: boolean; reload: () => void };

function useResource<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [authExpired, setAuthExpired] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => {
    setLoading(true);
    setError(undefined);
    void loadRef.current()
      .then(setData)
      .catch((reason) => {
        if (isAbortError(reason)) return;
        if (reason instanceof ApiError && reason.isAuthError) { setAuthExpired(true); return; }
        setError(message(reason));
      })
      .finally(() => setLoading(false));
  }, [key]);
  useEffect(reload, [reload]);
  return { data, error, loading, authExpired, reload };
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

  if (profile.authExpired) return <SessionExpired onSignOut={onSignOut} />;
  if (profile.loading) return <main className="loading-screen"><span className="loading-mark" aria-hidden="true" /><p>Opening your teaching studio...</p></main>;
  if (profile.error?.includes("PROFILE_NOT_PROVISIONED")) return <Bootstrap api={api} />;
  if (profile.error) return <main className="system-message"><PrismBrand /><h1>We could not open your teacher profile.</h1><Notice error={profile.error} /></main>;
  if (profile.data?.role !== "teacher") return <main className="system-message"><PrismBrand /><h1>This is a teacher workspace.</h1><p>Your current Prism profile is registered as a student.</p></main>;

  return (
    <AppShell role="Teacher" name={profile.data.display_name} onSignOut={onSignOut} deleteAccount={api.deleteAccount}>
      {route.page === "dashboard" && <Dashboard api={api} name={profile.data.display_name} />}
      {route.page === "new-class" && <NewClass api={api} />}
      {route.page === "class" && <ClassPage key={route.classId} api={api} classId={route.classId} />}
      {route.page === "new-assignment" && <NewAssignment api={api} classId={route.classId} />}
      {route.page === "assignment" && <AssignmentPage api={api} assignmentId={route.assignmentId} />}
      {route.page === "submission" && <SubmissionReviewPage api={api} submissionId={route.submissionId} />}
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
  const [showArchived, setShowArchived] = useState(false);
  const resource = useResource(() => api.classes(showArchived), `classes-${showArchived}`);
  const classes = resource.data?.items ?? [];
  const activeCount = classes.filter((item) => !item.archived_at).length;
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
        <div><strong>{activeCount}</strong><span>Active classes</span></div>
        <div><strong>{studentTotal}</strong><span>Students reached</span></div>
        <div><strong>{assignmentTotal}</strong><span>Learning missions</span></div>
        <p>Personalization changes the way in—not the rigor, goal, or standard.</p>
      </section>
      <Notice error={resource.error} />
      <section className="content-section">
        <div className="section-title-row">
          <div><p className="eyebrow">Classroom index</p><h2>Your classes</h2></div>
          <div className="section-title-actions">
            <button type="button" className="secondary-button" data-testid="toggle-archived" aria-pressed={showArchived} onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Hide archived" : "Show archived"}</button>
            <button className="secondary-button" onClick={() => go("/classes/new")}>New class</button>
          </div>
        </div>
        <AsyncState loading={resource.loading} isEmpty={!classes.length} empty={<Empty title={showArchived ? "No classes to show." : "Your first classroom starts here."}>{showArchived ? "You have no active or archived classes yet." : "Create a class, share its code, and begin building a personalized learning mission."}</Empty>}>
          <div className="class-grid">{classes.map((item, index) => {
            const archived = Boolean(item.archived_at);
            return (
              <article className={`class-card ${archived ? "is-archived" : ""}`} key={item.id}>
                <div className="class-card-index"><span>{String(index + 1).padStart(2, "0")}</span>{archived && <span className="status-pill archived">Archived</span>}</div>
                <p className="class-subject">{item.subject}</p><h3>{item.name}</h3><p>Grade {item.grade_level}</p>
                <div className="class-meta"><span>{item.student_count} students</span><span>{item.assignment_count} assignments</span></div>
                <button className="card-link" onClick={() => go(`/classes/${item.id}`)}>Open class <span aria-hidden="true">→</span></button>
              </article>
            );
          })}</div>
        </AsyncState>
      </section>
      <RecentActivity api={api} />
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

/** Turns a machine audit action/target ("class.archived" / "class") into a readable phrase. */
function humanizeAudit(entry: AuditEntry): string {
  const action = entry.action.replace(/[._]+/g, " ").trim();
  const target = entry.target_type.replace(/[._]+/g, " ").trim();
  const label = action ? action.charAt(0).toUpperCase() + action.slice(1) : "Activity";
  return target ? `${label} · ${target}` : label;
}

function RecentActivity({ api }: { api: TeacherApi }) {
  const resource = useResource(api.audit, "audit");
  const entries = resource.data ?? [];
  // Audit is a supporting nicety — never let its absence or failure disrupt the dashboard.
  if (resource.error || (!resource.loading && entries.length === 0)) return null;

  return (
    <section className="content-section" data-testid="recent-activity">
      <div className="section-title-row"><div><p className="eyebrow">Behind the scenes</p><h2>Recent activity</h2></div><p>A running log of changes across your classes and account.</p></div>
      <AsyncState loading={resource.loading} isEmpty={!entries.length} skeleton={<Skeleton rows={2} className="assignment-skeleton" />} empty={<Empty title="No recent activity.">Changes you make will show up here.</Empty>}>
        <ul className="activity-list">{entries.map((entry, index) => (
          <li key={`${entry.action}-${entry.target_id}-${index}`}>
            <span className="person-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="activity-line"><strong>{humanizeAudit(entry)}</strong>{entry.target_id && <small>{entry.target_id}</small>}</div>
            <time>{date(entry.created_at)}</time>
          </li>
        ))}</ul>
      </AsyncState>
    </section>
  );
}

export function ClassSettings({ api, currentClass, onClassChange }: { api: Pick<TeacherApi, "updateClass" | "archiveClass" | "unarchiveClass">; currentClass: ClassSummary; onClassChange: (updated: ClassSummary) => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(currentClass.name);
  const [description, setDescription] = useState(currentClass.description ?? "");
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const archived = Boolean(currentClass.archived_at);

  // Reseed the rename fields if the class identity changes underneath us.
  useEffect(() => { setName(currentClass.name); setDescription(currentClass.description ?? ""); }, [currentClass.id]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError("A class needs a name."); return; }
    setError(undefined);
    setSaved(false);
    setSaving(true);
    void api.updateClass(currentClass.id, { name: trimmed, description: description.trim() || null })
      .then((updated) => { onClassChange(updated); setEditing(false); setSaved(true); })
      .catch((reason) => setError(message(reason)))
      .finally(() => setSaving(false));
  };

  const toggleArchive = () => {
    setError(undefined);
    setSaved(false);
    setArchiving(true);
    const request = archived ? api.unarchiveClass(currentClass.id) : api.archiveClass(currentClass.id);
    void request.then(onClassChange).catch((reason) => setError(message(reason))).finally(() => setArchiving(false));
  };

  return (
    <section className="class-settings" data-testid="class-settings">
      <div className="class-settings-head">
        <div><p className="eyebrow">Class settings</p><h2>Manage this class</h2></div>
        <div className="class-settings-actions">
          <button type="button" className="secondary-button" onClick={() => { setEditing((value) => !value); setSaved(false); setError(undefined); }}>{editing ? "Close editor" : "Rename"}</button>
          <button type="button" className="secondary-button" data-testid="archive-class" onClick={toggleArchive} disabled={archiving}>{archiving ? "Saving…" : archived ? "Unarchive class" : "Archive class"}</button>
        </div>
      </div>
      {error && <Notice error={error} />}
      {saved && !editing && <p className="success-note">Class updated.</p>}
      {archived && <p className="muted class-settings-note">This class is archived. Students can’t join or open its assignments until you unarchive it.</p>}
      {editing && (
        <form className="form class-settings-form" data-testid="rename-class" onSubmit={save}>
          <Field label="Class name"><input value={name} onChange={(event) => { setName(event.target.value); setSaved(false); }} required /></Field>
          <Field label="Description"><textarea rows={3} value={description} placeholder="A short note about what this class explores." onChange={(event) => { setDescription(event.target.value); setSaved(false); }} /></Field>
          <div className="form-submit-row"><p>Renaming updates the class everywhere instantly.</p><button disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
        </form>
      )}
    </section>
  );
}

export function RegenerateCode({ api, classId, onRegenerated }: { api: Pick<TeacherApi, "regenerateJoinCode">; classId: string; onRegenerated: (joinCode: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const regenerate = () => {
    setBusy(true);
    setError(undefined);
    void api.regenerateJoinCode(classId)
      .then(({ join_code }) => {
        if (!join_code) { setError("The server did not return a new code. Please try again."); return; }
        onRegenerated(join_code);
        setConfirming(false);
      })
      .catch((reason) => setError(message(reason)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <button type="button" className="secondary-button" data-testid="regenerate-code" onClick={() => { setError(undefined); setConfirming(true); }}>Regenerate code</button>
      <ConfirmDialog open={confirming} title="Regenerate the join code?" confirmLabel="Regenerate code" confirmTestId="confirm-regenerate-code" tone="danger" busy={busy} onConfirm={regenerate} onCancel={() => { if (!busy) { setConfirming(false); setError(undefined); } }}>
        <p>A new code is generated immediately and the current one stops working. Students who already joined stay enrolled, but anyone with the old code will need the new one.</p>
        {error && <Notice error={error} />}
      </ConfirmDialog>
    </>
  );
}

export function Roster({ api, classId, resource }: { api: Pick<TeacherApi, "removeMember">; classId: string; resource: Resource<Collection<Member>> }) {
  const [items, setItems] = useState<Member[]>();
  const [pending, setPending] = useState<Member>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // Mirror the loaded roster locally so an optimistic removal can be reverted.
  useEffect(() => { if (resource.data) setItems(resource.data.items); }, [resource.data]);
  const list = items ?? resource.data?.items ?? [];

  const remove = () => {
    if (!pending) return;
    const target = pending;
    const previous = list;
    setBusy(true);
    setError(undefined);
    setItems(list.filter((member) => member.student_id !== target.student_id)); // optimistic
    void api.removeMember(classId, target.student_id)
      .then(() => setPending(undefined))
      .catch((reason) => { setItems(previous); setError(message(reason)); })
      .finally(() => setBusy(false));
  };

  return (
    <section className="resource-panel">
      <div className="panel-heading"><div><p className="eyebrow">People</p><h2>Students</h2></div><span>{list.length}</span></div>
      <Notice error={resource.error} />
      {error && <Notice error={error} />}
      <AsyncState loading={resource.loading} isEmpty={!list.length} empty={<Empty title="No students yet.">Share the class code above to invite your first student.</Empty>}>
        <ul className="resource-list roster-list">{list.map((member, index) => (
          <li key={member.student_id}>
            <span className="person-index">{String(index + 1).padStart(2, "0")}</span>
            <div className="roster-person"><strong>{member.display_name}</strong><small>Joined {date(member.joined_at)}</small></div>
            <button type="button" className="text-button danger-link" data-testid={`remove-member-${member.student_id}`} onClick={() => { setError(undefined); setPending(member); }}>Remove</button>
          </li>
        ))}</ul>
      </AsyncState>
      <ConfirmDialog
        open={Boolean(pending)}
        title="Remove this student?"
        confirmLabel="Remove student"
        confirmTestId="confirm-remove-member"
        tone="danger"
        busy={busy}
        onConfirm={remove}
        onCancel={() => { if (!busy) { setPending(undefined); setError(undefined); } }}
      >
        <p>{pending ? `${pending.display_name} will lose access to this class and its assignments. They can rejoin later with the class code.` : ""}</p>
      </ConfirmDialog>
    </section>
  );
}

function ClassPage({ api, classId }: { api: TeacherApi; classId: string }) {
  const classResource = useResource(() => api.classDetail(classId), `class-${classId}`);
  const members = useResource(() => api.members(classId), `members-${classId}`);
  const assignments = useResource(() => api.assignments(classId), `assignments-${classId}`);
  const [override, setOverride] = useState<ClassSummary>();
  const [copied, setCopied] = useState(false);
  if (classResource.loading) return <Loading label="Opening class..." />;
  const currentClass = override ?? classResource.data;
  if (!currentClass) return <Notice error={classResource.error} />;
  const archived = Boolean(currentClass.archived_at);

  return (
    <section className="page-stack">
      <PageBack href="#/">All classes</PageBack>
      <div className={`class-detail-hero ${archived ? "is-archived" : ""}`}>
        <div>
          <p className="eyebrow">{currentClass.subject} · Grade {currentClass.grade_level}</p>
          <h1>{currentClass.name}</h1>
          <p>{currentClass.description || "A shared space for personalized learning."}</p>
          {archived && <span className="status-pill archived class-archived-flag">Archived</span>}
        </div>
        <button onClick={() => go(`/classes/${classId}/assignments/new`)}>Create assignment <span aria-hidden="true">→</span></button>
      </div>
      <ClassSettings api={api} currentClass={currentClass} onClassChange={setOverride} />
      <div className="join-code-panel">
        <div><p className="eyebrow">Student entry</p><h2>Share this class code.</h2><p>Students enter it once to join this classroom.</p></div>
        <strong>{currentClass.join_code}</strong>
        <div className="join-code-actions">
          <button className="secondary-button" onClick={() => {
            void navigator.clipboard?.writeText(currentClass.join_code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          }}>{copied ? "Copied" : "Copy code"}</button>
          <RegenerateCode api={api} classId={classId} onRegenerated={(join_code) => setOverride({ ...currentClass, join_code })} />
        </div>
      </div>
      <div className="two-col resource-columns">
        <Roster api={api} classId={classId} resource={members} />
        <section className="resource-panel">
          <div className="panel-heading"><div><p className="eyebrow">Curriculum</p><h2>Assignments</h2></div><span>{assignments.data?.total ?? 0}</span></div>
          <Notice error={assignments.error} />
          <AsyncState loading={assignments.loading} isEmpty={!assignments.data?.items.length} empty={<Empty title="No assignments yet.">Create a draft, check the objective, then publish it when ready.</Empty>}>
            <ul className="resource-list assignment-resource-list">{assignments.data?.items.map((assignment) => <li key={assignment.id}><button className="resource-link" onClick={() => go(`/assignments/${assignment.id}`)}><span><small>{assignment.topic}</small><strong>{assignment.title}</strong></span><span className={`status-pill ${assignment.status}`}>{assignment.status}</span></button></li>)}</ul>
          </AsyncState>
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
  const analytics = useResource(() => api.analytics(assignmentId), `analytics-${assignmentId}`);
  const submissions = useResource(() => api.submissions(assignmentId), `submissions-${assignmentId}`);
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
      <section className="content-section">
        <div className="section-title-row"><div><p className="eyebrow">Signal</p><h2>Assignment analytics</h2></div><span className="count-badge">{analytics.data ? `${Math.round(Math.min(1, Math.max(0, analytics.data.completion_rate)) * 100)}%` : "—"}</span></div>
        <AsyncState loading={analytics.loading} error={analytics.error} isEmpty={!analytics.data} empty={<Empty title="No analytics yet.">Analytics appear once students begin this assignment.</Empty>}>
          {analytics.data && <AssignmentAnalyticsPanel analytics={analytics.data} />}
        </AsyncState>
      </section>
      <section className="content-section submission-section">
        <div className="section-title-row"><div><p className="eyebrow">Class pulse</p><h2>Student progress</h2></div><span className="count-badge">{progress.data?.items.filter((student) => student.status === "submitted").length ?? 0} completed</span></div>
        <Notice error={progress.error} />
        <AsyncState loading={progress.loading} isEmpty={!progress.data?.items.length} empty={<Empty title="No students yet.">Share the class code to begin seeing progress here.</Empty>}>
          <ul className="progress-roster">{progress.data?.items.map((student, index) => {
            const completion = student.total_steps ? Math.round((student.completed_steps / student.total_steps) * 100) : 0;
            const statusLabel = student.status === "not_started" ? "Not started" : student.status === "in_progress" ? "In progress" : "Submitted";
            return <li key={student.student_id}><span className="person-index">{String(index + 1).padStart(2, "0")}</span><div className="progress-student"><strong>{student.student_name}</strong><small>{student.hints_used === 1 ? "1 hint used" : `${student.hints_used} hints used`}</small></div><div className="roster-progress"><div><span style={{ width: `${completion}%` }} /></div><small>{student.total_steps ? `${student.completed_steps}/${student.total_steps} steps` : "No activity yet"}</small></div><span className={`status-pill ${student.status}`}>{statusLabel}</span></li>;
          })}</ul>
        </AsyncState>
      </section>
      <section className="content-section submission-section">
        <div className="section-title-row"><div><p className="eyebrow">Submitted work</p><h2>Submissions</h2></div><span className="count-badge">{submissions.data?.total ?? 0}</span></div>
        <Notice error={submissions.error} />
        <AsyncState loading={submissions.loading} isEmpty={!submissions.data?.items.length} empty={<Empty title="No submissions yet.">When students submit their work, it appears here to open and review.</Empty>}>
          <ul className="submission-list">{submissions.data?.items.map((item, index) => (
            <li key={item.submission_id}>
              <span className="person-index">{String(index + 1).padStart(2, "0")}</span>
              <div className="progress-student"><strong>{item.student_name}</strong><small>{item.submitted_at ? `Submitted ${date(item.submitted_at)}` : "Not submitted"}</small></div>
              {item.review ? <span className="status-pill submitted">Reviewed{item.review.score != null ? ` · ${item.review.score}` : ""}</span> : <span className="status-pill in_progress">Needs review</span>}
              <button className="secondary-button" onClick={() => go(`/submissions/${item.submission_id}`)}>Review</button>
            </li>
          ))}</ul>
        </AsyncState>
      </section>
    </section>
  );
}

function SubmissionReviewPage({ api, submissionId }: { api: TeacherApi; submissionId: string }) {
  const resource = useResource(() => api.submissionDetail(submissionId), `submission-${submissionId}`);
  if (resource.loading) return <Loading label="Opening submission..." />;
  const detail = resource.data;
  if (!detail) return <Notice error={resource.error} />;
  const backHref = detail.assignment_id ? `#/assignments/${detail.assignment_id}` : "#/";
  return (
    <section className="page-stack">
      <PageBack href={backHref}>Assignment</PageBack>
      <div className="page-intro"><p className="eyebrow">Submission review</p><h1>Review &amp; respond.</h1><p>See exactly what this student explored, then leave a score and feedback they can act on.</p></div>
      <SubmissionReview detail={detail} onSave={(body) => api.saveReview(submissionId, body)} />
    </section>
  );
}
