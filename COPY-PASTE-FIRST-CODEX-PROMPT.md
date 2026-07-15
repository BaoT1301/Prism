# First Codex Prompt

Copy this entire context pack into the root of the Git repository and commit it. Then start Codex from the repository root and send:

```text
Read AGENTS.md, README-START-HERE.md, all files under docs/, the sandbox contract under contracts/, and codex-tasks/00-repository-assessment.md.

Inspect the current repository carefully. Complete Task 00 only: assess the repository and produce the implementation plan for Task 01. Do not change files, install dependencies, create migrations, or begin implementation. Explicitly report any conflict between the existing repository and the documented architecture.
```

After reviewing that assessment, send:

```text
Read AGENTS.md, all relevant files under docs/ and contracts/, codex-tasks/01-backend-foundation.md, and your Task 00 assessment. Implement Task 01 exactly. Preserve existing teammate code, run all required checks, report the results honestly, and stop when Task 01 acceptance criteria are met. Do not begin Task 02.
```

Do not combine Tasks 01â€“05 into one request.
