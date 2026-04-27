# SESSION_LOG — Format Template

Each build session is saved as a **separate file** in this directory using the naming convention:

```
YYYY-MM-DD-HH:MM_<action_word>.md
```

## Action word guide

| Word | When to use |
|------|-------------|
| `init` | Initial setup — CLAUDE.md, scaffolding, directory structure |
| `build` | Active feature development against a BR |
| `fix` | Bug fix or gate failure resolution |
| `review` | QA, security review, or forge-qa session |
| `deploy` | Deployment, environment setup, infra provisioning |
| `config` | Configuration changes — env vars, Railway, Supabase settings |
| `refactor` | Code restructuring without behaviour change |
| `test` | Writing or running test suites |
| `migrate` | Database migrations |
| `hotfix` | Production issue fix |

---

## Session file format

```markdown
# Session: YYYY-MM-DD HH:MM — <action_word>

**Duration:** ~X hours
**Starting state:** [what was true before this session started]
**Goal:** [what you set out to accomplish]
**BR focus:** BR-XX, BR-XX

---

## What was done

- [completed item — file path if code was written]
- [completed item]

## What was NOT done

- [deferred item] — reason: [why deferred]

## BR status at end of session

| BR | Status | Notes |
|----|--------|-------|
| BR-XX | Complete ✓ / In progress / Not started | [any notes] |

## Gate results

- [ ] Gate name — PASS / FAIL / NOT RUN

## Start here next session

1. [first concrete action]
2. [second action]
3. Estimated time needed: X hours

## Open decisions / blockers

- [item] → This is a Prime question / blocked on [X]
```

---

## Log index

| File | Date | Action | BRs touched | Outcome |
|------|------|--------|-------------|---------|
| [2026-04-27-07:47_init.md](2026-04-27-07:47_init.md) | 2026-04-27 | init | — | CLAUDE.md created, repo structured |
