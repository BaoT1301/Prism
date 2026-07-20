# Product Context

## Product summary

We are building a lightweight AI-powered learning platform for teachers and students. It is inspired by the workflow simplicity of classroom software, but it is not intended to reproduce a complete learning-management system.

The central product idea is:

> A teacher creates one assignment with one educational objective. The platform personalizes only the scenario and presentation for each student based on that student's interests while preserving the same objective and approximate difficulty.

Students complete the personalized assignment inside an interactive AI sandbox rather than a static worksheet.

## Primary users

### Teacher

A teacher needs to:

1. Sign up or sign in.
2. Create a class.
3. Share a join code.
4. Create an assignment.
5. Specify title, topic, learning objective, grade level, instructions, and sandbox type.
6. Preview the non-personalized assignment template.
7. Publish the assignment.
8. See whether students submitted it.

### Student

A student needs to:

1. Sign up or sign in.
2. Join a class with a code.
3. Create or update an interest profile.
4. Open a published assignment.
5. Receive a personalized version.
6. Interact with the sandbox.
7. Ask questions and request progressive hints.
8. Complete guided steps.
9. Submit the work.

## Product innovation

The educational objective and approximate difficulty must remain constant for all students. The contextual wrapper changes.

Example:

- Learning objective: apply Newton's Second Law, `F = ma`.
- Basketball student: calculate the force involved in accelerating a basketball.
- Formula 1 student: calculate force or acceleration in a racing scenario.
- Space student: calculate thrust or acceleration in a rocket scenario.

The system must make the experiences visibly different while keeping the academic target equivalent.

## Interactive sandbox

The sandbox is the centerpiece of the MVP. It combines:

- A guided activity
- A small interactive simulation
- An AI tutor
- Progressive hints
- A progress tracker
- Student reflection
- Submission

The AI does not generate executable code. It returns a validated configuration for a finite set of sandbox templates implemented by the frontend.

Supported sandbox templates:

- `parameter_explorer`: manipulate visible variables and observe the deterministic result.
- `graph_lab`: record and compare controlled trials in a lightweight force chart.
- `guided_activity`: follow a sequenced investigation with a next-step prompt.

All three formats use the same validated formula registry and progress, hint, reflection, and submission flow. New types remain opt-in until a renderer, contract validation, and tests ship together.

## Golden demo

The primary demo should be stable and rehearsed:

1. A teacher creates a Physics class.
2. The teacher creates and publishes a Newton's Second Law assignment.
3. Three students have Basketball, Formula 1, and Space interest profiles.
4. Each student starts the same assignment.
5. The backend generates or retrieves a distinct personalized assignment for each student.
6. Each assignment has the same learning objective and comparable difficulty.
7. One student changes variables in the sandbox, requests a progressive hint, completes the steps, and submits.
8. The teacher sees the student's completion status.

## MVP capabilities

Required:

- Teacher/student authentication
- Role-aware authorization
- Class creation
- Class joining
- Assignment creation and publishing
- Student interest profile
- Personalized assignment generation
- Three reliable, schema-driven sandbox formats
- Progressive hints
- Progress persistence
- Submission
- Teacher completion status
- Production deployment
- Seeded demo data
- Failure fallback for AI generation

## Non-goals

Do not build during the hackathon:

- Grading or gradebook
- Rubrics
- Announcements
- Messaging
- Calendar
- Attendance
- Quizzes
- File storage or uploads
- Parent portal
- Full LMS functionality
- Google Classroom synchronization
- Real-time multiplayer collaboration
- Native mobile apps
- Universal simulation generation
- Arbitrary code execution
- Retrieval-augmented generation
- Vector database
- Background job infrastructure unless a measured blocker requires it

## Product invariants

These are not optional:

1. The original learning objective remains unchanged in the personalized result.
2. Personalization changes context, examples, labels, or framingâ€”not the underlying standard.
3. The personalized output uses a supported sandbox template.
4. Model output is validated before storage and rendering.
5. A student cannot access an unpublished assignment.
6. A student must belong to the class before starting an assignment.
7. A teacher can manage only classes and assignments they own.
8. A student cannot see another student's personalized assignment, session, or submission.
9. Reopening the same assignment should return the cached generated version unless the source assignment or interest profile version changed.
10. The system must have a deterministic demo fallback if AI generation fails.

## Success criteria

The project is successful when:

- The full teacher-to-student vertical slice works in the deployed environment.
- Three students receive meaningfully personalized versions of the same assignment.
- The objective and difficulty remain comparable.
- The sandbox renders from validated structured data.
- A student can request a hint and submit.
- The system survives an OpenAI timeout or invalid output with a controlled fallback.
- The team can explain the architecture and trade-offs clearly to judges.
