# ADR 0002 — Use `safecommand_v7` Branch for v7 Phase A Scaffold Work

**Status:** Accepted
**Date:** 2026-05-05
**Deciders:** Sachin Sablok (Founder), Nexus Prime (claude-opus-4-7)
**Supersedes:** Implicit "always commit to main" pattern used through Sprint 1
**Related:** ADR 0001 (migration renumbering), ADR 0003 (Supabase publishable + secret keys)

---

## Context

The new Business Plan v2 (2026-05-10) and Architecture v7 (2026-05-10) introduce a substantial scope expansion to SafeCommand: 91 BRs, 37 NFRs, 22 ECs, 22 Hard Rules, plus four new architectural layers (Multi-Building Venue, Roaming Authority, Enterprise Brand Enablement, Corporate Governance). Phase A of the transition involves ~13–16 hours of scaffold work spanning ~30+ files: theme tokens, ThemeProvider, semantic colours, layout primitives, hamburger drawer, screen retrofits across mobile / dashboard / ops-console, plus CLAUDE.md rewrite, Apollo mockup spec, and ADR drafting.

Architecture v7 §16 explicitly anchors itself on the SESSION_LOG and confirms Sprint 1 work (BR-01 through BR-09) stands. The Phase A scaffold is the bridge between "v6 build live" and "v7 transition complete." Working on `main` directly mixes a multi-day refactor with the existing pilot-readiness state — the diff is harder to review, harder to roll back, and risks accidental Railway redeploys via auto-deploy hooks that monitor `main`.

A branching decision was required: continue on `main` or isolate Phase A work on a feature branch.

---

## Decision

**Create branch `safecommand_v7` from cleaned `main` (post-history-rewrite, commit `96594ad`) and execute all Phase A scaffold work on it.**

Branch structure:

```
main (production-ready, paused for budget freeze)
└── safecommand_v7 (Phase A v7 transition work)
    ├── ADR 0001 — migration renumbering
    ├── ADR 0002 — this branching decision
    ├── ADR 0003 — Supabase publishable + secret keys
    ├── AWS-process-doc-IMP.md updates (§3.3 Supabase key model)
    ├── CLAUDE.md rewrite (91 BRs / 37 NFRs / 22 ECs / 22 Hard Rules)
    ├── Mobile theme scaffold + responsive Phase 1 (~12–15 hrs)
    ├── Dashboard + Ops Console ThemeProvider + Tailwind brand-vars
    └── docs/sales/apollo-mockup-spec.md
```

When Phase A is complete and validated, merge `safecommand_v7` → `main` (squash or fast-forward at your preference) before June 2026 unfreeze. Phase B engineering then proceeds on `main` with v7 scaffold landed.

---

## Considered Alternatives

### Option A — Continue on `main` (rejected)
- **Pros:** simplest; no merge later; matches solo-founder, non-team workflow.
- **Cons rejected:** mixing in-progress refactor with bug fixes loses isolation; no clean rollback if June review changes a Phase A decision; Railway auto-deploy on `main` push triggers worker redeploys for theme-only changes (unwanted during budget freeze); single linear chain of "v6 build" + "v7 retrofit" with no separator makes future archaeology harder.

### Option B — `safecommand_v7` branch (chosen) ✓
- **Pros:**
  - Clean separator — `main` reflects "live pilot-ready Phase 1 v6"; `safecommand_v7` is "v7 transition in progress."
  - Reviewable in one diff — `git diff main...safecommand_v7` shows the complete scaffold as a single reviewable surface.
  - Safe rollback — if June review changes a Phase A decision, `git checkout main` returns to a known-working state instantly.
  - Railway insulated — auto-deploys are tied to `main` (pending verification); working on `safecommand_v7` keeps scaffold commits from triggering Railway redeploys during budget freeze.
  - Mental model match — Architecture v7 explicitly frames this as a "v7 transition"; branch name aligns with spec versioning.
- **Cons accepted:**
  - Merge conflict risk later (mitigated: `main` is paused, no active Sprint 2 commits expected during May).
  - One extra context-switch per session (`git checkout safecommand_v7`) — acceptable.
  - If a hotfix needs to land on `main` during May, cherry-pick or rebase required (unlikely — workers paused).

### Option C — Branch only for theme retrofit screens, not for CLAUDE.md / ADR (rejected)
- **Why rejected:** splits scaffold work artificially. ADRs are part of the same architectural transition as the code; separating them produces a confusing review surface. All-or-nothing branching is cleaner.

---

## Sequencing — Critical Constraint

**The branch must be created AFTER the security history rewrite, NOT before.** Branches share the git object database; creating `safecommand_v7` from `main` while `main` still contained leaked credentials would mean both branches inherit the leak. The rewrite of `main` had to land first.

Executed sequence (2026-05-05):

1. ✅ Stage 1 — 4 cleanup commits to `main` (workers railway.toml fix, mobile bug fixes, BR-11 incident screen, .gitignore commented-block removal). Pushed `5db013e..772fd85`.
2. ✅ Stage 2a — Backup tag `backup/pre-history-rewrite-2026-05-04` pushed to origin (preserves pre-rewrite SHA `772fd85` for recovery).
3. ✅ Stage 2b — `git-filter-repo` v2.47.0 installed via Homebrew; full history sweep performed. 4 distinct secret patterns identified: Firebase RSA key, Supabase service_role JWT, Supabase anon JWT, Upstash TLS password (plus Firebase private_key_id).
4. ✅ Stage 2c — Patterns file built; `git filter-repo --replace-text` executed against a fresh clone. Pre-rewrite secret counts (6/6/6/4/2) → post-rewrite (0/0/0/0 — only docstring references to `BEGIN PRIVATE KEY` remain, which are not actual keys). 22 `<REDACTED-*>` markers confirm replacement.
5. ✅ Stage 2d — `git push --force-with-lease=main:772fd85f2d8d29121847b963f30a6ce915d2b970 origin main` succeeded. New `main` HEAD = `96594ad`. Old SHAs orphaned but reachable via backup tag.
6. ✅ Stage 3 — `git checkout -b safecommand_v7` from cleaned `main`. Branch created at `96594ad`. This ADR captures the decision.

---

## Consequences

### Positive

- **History rewrite is complete and contained on `main`** — `safecommand_v7` starts from a clean object database with zero leaked credentials.
- **Phase A scaffold work is isolated** from production state; experiments cost nothing.
- **Apollo mockup, theme retrofit, ADR drafts, CLAUDE.md rewrite** all land on the same branch — atomic scope.
- **Future archaeology is clearer** — the `safecommand_v7` branch in git log will be the single locator for "everything that changed for v7 transition."

### Negative

- **Phase A must merge before June 2 unfreeze** — a long-lived branch accumulates merge-conflict surface. ~13–16 hours of scaffold work is the upper bound; merge-back is targeted within May 2026.
- **Two-place navigation during May** — work happens on `safecommand_v7`, infra ops still reference `main`. Manageable for solo founder.

### Neutral

- **Local backup tag `backup/pre-history-rewrite-2026-05-04`** preserved on both local and remote pointing at pre-rewrite SHA `772fd85`. Recovery point retained for ~30 days; suggested deletion target 2026-06-04.

---

## Implementation Notes

### Branch creation (executed 2026-05-05)

```
git fetch origin                              # pulled rewritten main
git reset --hard origin/main                  # working repo at 96594ad
git stash pop                                 # restored AWS-process-doc-IMP.md edit + docs/
git checkout -b safecommand_v7                # branch from 96594ad
```

### Phase A commit cadence (planned)

Logical commit boundaries (each pushed to `safecommand_v7`):

1. `docs(adr): add ADR 0001 (migrations) + 0002 (branch) + 0003 (supabase keys)` — captures all foundational decisions
2. `docs(infra): update AWS-process-doc-IMP.md §3.3 for Supabase opaque-token key model`
3. `docs(claude): rewrite product CLAUDE.md for v7 spec (91 BRs / 37 NFRs / 22 ECs / 22 Hard Rules)`
4. `feat(theme): scaffold mobile theme tokens — spacing, typography, radii (responsive Phase 1)`
5. `feat(theme): mobile ThemeProvider + useBrand + useLabel hooks (EC-17 / Rule 19)`
6. `feat(theme): mobile semantic colours + WCAG 2.1 AA contrast guard (NFR-35)`
7. `feat(layout): mobile layout primitives + viewport meta + safe-area`
8. `feat(layout): mobile hamburger drawer (responsive Phase 1 deliverable)`
9. `refactor(mobile): retrofit existing screens to use theme tokens (PhoneScreen / OtpScreen / HomeScreen / TasksScreen / TaskDetailScreen / IncidentScreen)`
10. `feat(theme): dashboard ThemeProvider + Tailwind brand-var integration`
11. `feat(theme): ops-console ThemeProvider (always SafeCommand brand per EC-14)`
12. `docs(sales): Apollo mockup spec (Path C — live working software via brand config row)`
13. `docs(session): Phase A completion log + plan amendment`

### Phase A → main merge plan (when complete)

When all 13 commit boundaries land cleanly + `tsc --noEmit` passes on touched packages + visual verification on physical device:

```
git checkout main
git merge --no-ff safecommand_v7              # preserve branch history; OR --squash if cleaner
git push origin main
git branch -d safecommand_v7                  # local cleanup
git push origin --delete safecommand_v7       # remote cleanup (optional — keep for audit)
```

Squash-merge is acceptable if the 13-commit chain feels noisy on `main`'s log. Decision made at merge time.

### Recovery procedure (if needed)

If `safecommand_v7` becomes unrecoverable mid-flight:

```
git checkout main                                                        # safe state
git branch -D safecommand_v7                                             # delete broken branch
git checkout -b safecommand_v7 origin/main                               # restart from clean main
```

If history rewrite of `main` itself ever needs to be reverted (extreme case):

```
git push origin --force backup/pre-history-rewrite-2026-05-04:main
```

---

## Validation

This ADR is considered satisfied when:

- [x] `safecommand_v7` branch exists locally at HEAD = `96594ad` (this commit)
- [x] Backup tag `backup/pre-history-rewrite-2026-05-04` preserved on local + remote
- [x] `origin/main` post-rewrite shows zero leaked secrets across all reachable commits
- [ ] `safecommand_v7` pushed to remote at first commit
- [ ] All 13 planned commit boundaries land on `safecommand_v7`
- [ ] Phase A scaffold validated (`tsc --noEmit` clean on `apps/api`, `apps/mobile`, `apps/dashboard`, `apps/ops-console`)
- [ ] Merge to `main` executed before June 2 unfreeze gate
- [ ] Backup tag deleted ≥30 days post-merge (target 2026-06-04 or later, founder discretion)

---

## References

- ADR 0001 (`docs/adr/0001-migration-renumbering.md`) — migration numbering offset between repo and spec
- ADR 0003 (`docs/adr/0003-supabase-publishable-secret-keys.md`) — Supabase opaque-token migration
- Plan: `report-gen/2026-05-04-22:30_plan.md` — Phase A / B / C sequencing; security incident triage 2026-05-05 amendment
- Architecture v7 §16 — Build State; explicitly preserves Sprint 1 work
- SESSION_LOG: `report-gen/SESSION_LOG.md` — sequence of build sessions through 2026-05-05
- Memory: `~/.claude/projects/.../memory/project_safecommand_v7_phase_a.md`

---

*ADR captured 2026-05-05 · Status: Accepted · Branch HEAD at creation: 96594ad*
