# ⚠️ MANDATORY REVIEW — 2 JUNE 2026

**Created:** 2026-05-03 by Sachin
**Trigger date:** 2026-06-02 (first work session of June 2026)
**Status:** OPEN — must be processed and this file deleted/updated by end of June

---

## What you must do on 2 June 2026

Before any code changes, work through this list:

### 1. Verify Upstash actual burn for May 2026
Open https://console.upstash.com/redis/f39ea940-98ea-41ea-9ccf-1f1e971b1404 → Usage tab → note total commands consumed in May.

| Outcome | Action |
|---------|--------|
| <500K commands (free tier) | Panic was overestimated. Adopt always-on workers from June. |
| 500K–2M commands | Modest PAYG cost (~$1–4). Reasonable; consider if pause routine still warranted. |
| >2M commands | Pause routine clearly justified; fix scripts and adopt daily pause. |

### 2. Check current worker state — TWO LAYERS

**A. Env-var pause control (added 2026-05-03 — primary kill switch)**
1. Open https://railway.app/project/3e27e7ad-f120-4958-b8f6-c1be42032914
2. For each of `scheduler`, `escalation`, `notifier`: open service → **Variables** tab
3. Look for `WORKERS_PAUSED`:
   - If `=true` → service is paused via env var. Set to `false` or delete to resume.
   - If absent or `=false` → service is in normal mode.

**B. Service replica state (fallback check)**
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
./scripts/worker-status.sh
```
- All RUNNING + no `WORKERS_PAUSED` → workers were never paused; full burn ran for May.
- All RUNNING + `WORKERS_PAUSED=true` set on services → workers were paused via env var (silent on the deploy state). Check Upstash usage to confirm low burn.
- Some PAUSED/FAILED → workers got paused via the (broken) script or manual numReplicas change at some point.

### 3. Read the session log
`report-gen/2026-05-03-22:00_config.md` — full context for the May 3 decision.

### 4. Fix the broken scripts (if still wanted — env-var method may have replaced need)
The `WORKERS_PAUSED` env var added 2026-05-03 is now the primary kill switch (no auth-token friction). The legacy scripts in `scripts/pause-workers.sh` and `scripts/resume-workers.sh` use `numReplicas: 0` which Railway rejects. **You may not need the scripts anymore** — the env-var method covers all the use cases without script maintenance.

If you still want CLI scripts: update them to either set `WORKERS_PAUSED` env var via GraphQL, OR use `sleepApplication: true` mutation.

### 5. Resume deferred work
Sprint 3 work was paused mid-stream. Priority order when budget freeze lifts:

1. **Mobile responsive dashboard** — fully analyzed and approved. Plan in conversation history of 2026-05-03 session.
   - Choices made: hamburger menu (slide-over drawer with 5 categories), Pattern C floor-zone hierarchy, table→card on mobile
   - 5 phases planned, ~4 hours total, human-in-the-loop validation per phase
2. **BR-15 GM Broadcast** — completes GM dashboard from read-only → actionable
3. **BR-12 Shift Handover** — operational protocol
4. **Custom domain** `app.safecommand.in` once registrar acquired

### 6. Decide long-term stance
Always-on workers (production-class, $3-5/mo, no daily routine) vs on-demand pause (cost-class, $0-1/mo, daily routine). Pick one and document in `AWS-process-doc-IMP.md` decision log.

### 7. Delete this file
Once processed, **delete `JUNE-2026-REVIEW-REQUIRED.md`** so it doesn't linger as stale guidance.

Also update or delete the related memory file: `~/.claude/projects/-Volumes-Crucial-X9-claude-code/memory/project_safecommand_budget_may2026.md`

---

## Why this exists at the product root

Discoverability. `report-gen/` is gitignored (local-only). `nexus/decisions/` is for strategic decisions, not operational reminders. This file at the product root is impossible to miss — it'll show in any directory listing, any git status, any IDE file tree, every time the project is opened in June.

---

## Companion artifacts

- `report-gen/2026-05-03-22:00_config.md` — full session log with technical detail (local-only)
- `~/.claude/projects/-Volumes-Crucial-X9-claude-code/memory/project_safecommand_budget_may2026.md` — auto-loaded memory in Claude sessions
- `AWS-process-doc-IMP.md` decision log — Section 12 has the architectural context

---

**Last updated:** 2026-05-03 22:00 IST. Update this section if any worker pause action does happen between now and 2-June-2026.
