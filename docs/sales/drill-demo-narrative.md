# Drill demo narrative — sales / investor / board talking points

> **Purpose:** field-tested narrative for walking client buyers, VC investors, and corporate boards through SafeCommand's drill audit-grade detail surface. Keyed to the data seeded by `scripts/seed-drill-participants-demo.sh` in Hyderabad Demo Supermall.
>
> **Audience tiers covered:** hospital CISO / NABH compliance officer, mall facility head, hotel GM, corporate safety director, VC / institutional investor, corporate board director, NABH / Fire NOC / Telangana Fire Service auditor.
>
> **Companion docs:**
> - `docs/research/drill-participant-reason-taxonomy.md` — backing industry research (18 sources)
> - `docs/adr/0004-drill-participant-reason-codes.md` — architectural decision record
> - Phase 5.18 implementation in `apps/api/src/routes/drills.ts` + `apps/dashboard/app/drills/[id]/page.tsx` + `apps/mobile/src/screens/DrillDetailScreen.tsx`

---

## 1. The setup (60-second venue context)

> *"This is Hyderabad Demo Supermall — 4 floors, 12 zones, 17 active staff. Mid-size Indian supermall, comparable in scale to Sarath City Capital Mall or GVK One. Like every Indian venue with a Fire NOC, they're required to run quarterly fire drills and maintain auditable records. Let me show you what their last two drills look like in our system."*

Open: dashboard → `/drills` → see two completed drills:
- 🔥 **Fire Evacuation** (60 days ago) — quarterly mandated
- 🚨 **Full Evacuation** (240 days ago) — annual mandated

> *"Both drills completed inside their target windows. But aggregate counts don't pass an audit — let me click into one."*

---

## 2. Drill A — Recent Fire Evacuation (the operational realism story)

Click into the **Fire Evacuation** drill (60d ago).

### Header card — what the auditor sees first

> *"Quarterly fire drill, Tower 1. Started 14:35 IST on a Tuesday. Target: full evacuation in under 15 minutes. Achieved 13:22 — well within target. Compliance score: 79% safe-confirmed. But the headline number isn't 79 — it's right here:"*

[Point to: `excused_count` and `unexcused_count` tiles]

> *"100% audit-classified. Zero unexcused. Every staff member who didn't make it to the assembly point in the drill window was classified with a structured reason and a verifiable note."*

### Timeline (left column on desktop, scroll on mobile)

> *"Here's the timeline — every event in chronological order. Drill scheduled, drill started by Pradeep Kumar the Security Head, individual acknowledgements as they came in. Notice the metadata on 'Drill Started' — `STARTED_FROM_SHIFT_ROSTER`. The system used the active shift roster to determine who's on duty. If no shift was active, it'd fall back to all staff. Either way, the path is logged."*

### Participation matrix — the heart of the demo

> *"14 staff expected. 11 reached the assembly point and tapped 'I'm safe' on their phones. The remaining 3 — let me filter."*

Click the **"Needs reason"** filter. Then click **"All"** again to show everyone classified.

#### The 3 stories (in order — these are what your audience remembers)

**Story 1 — Sanjay Verma — Longest time-to-safe (4m18s) — but classified SAFE**

> *"Sanjay reached safety in 4 minutes 18 seconds. Slowest of the 11 safe-confirmed staff. But that's not a problem — see the timeline note? He was 'assisting mobility-impaired visitor via service ramp'. The system records the slow time honestly but the audit reads it as legitimate operational excellence — accommodation was prioritised over speed."*

**Story 2 — Kavita Nair — `ON_DUTY_ELSEWHERE` — the cash vault case**

> *"Kavita is the floor 1 jewellery zone staff member. She received the drill alert at 14:35:00 and tapped Acknowledge 35 seconds later — but never reached the perimeter assembly. Why? Click the row."*

[Show the reason chip + notes]

> *"'Cash counter handover at Floor 1 jewellery zone — locked vault per Bank Note Bureau (BNB) protocol before evacuation.' She finished securing the vault, reached the perimeter at 14:42 — six minutes after the drill window closed. Without this taxonomy, she'd show up as 'missed' — an HR conversation. With it, she's classified `ON_DUTY_ELSEWHERE` by Pradeep the SH after the drill, with a specific note that any auditor can read. Compliance preserved. HR liability removed."*
>
> **Sales bridge to hospital pilot:**
> *"This same pattern — `ON_DUTY_ELSEWHERE` — is exactly what NABH inspectors ask for in hospital drill records. Replace 'cash vault' with 'ICU patient on ventilator' and 'BNB protocol' with 'horizontal evacuation per NABH §EM.4.2'. Same shape, same audit-defensibility."*

**Story 3 — Faisal Ahmed — `DEVICE_OR_NETWORK_ISSUE` — the dead zone case**

> *"Faisal was in basement parking zone P-3 during the drill. P-3 is a documented signal dead zone — no 4G, no Wi-Fi, no FCM delivery. He was evacuated and accounted-for via radio at 14:34:18 by FS Meera Joshi — that's the radio-based accountability protocol. Most safety platforms would just mark him 'missed' and move on. We mark him `DEVICE_OR_NETWORK_ISSUE` — and look at the note:"*

[Read aloud:]
> *"'IT signal-survey action raised post-drill — recommendation: deploy cellular booster or Wi-Fi extender in P-3.'"*

> *"This category turns a discipline conversation into an infrastructure improvement. Three months from now, when P-3 is signal-equipped, the next drill compliance for that zone is 100%. The taxonomy is generating action items — that's the value-add to the venue, not just the compliance officer."*
>
> **Board talking point:**
> *"Notice the system bias: not 'who failed?' but 'what's the systemic gap?' That's the governance posture you want at scale. Punishing individuals for infrastructure problems doesn't fix the infrastructure."*

**Story 4 — Imran Hussain — `ON_LEAVE` — the DPDP story**

> *"Imran was on approved sick leave from 13:00 IST. Left the venue at 12:55 — 1h35m before the drill. But he was in the participant list because the HRIS sync was lagging. Pradeep classified him as `ON_LEAVE` after cross-referencing the HRIS leave register. Look at the classification note — there's no medical detail, no leave sub-type. Just 'approved leave, HRIS verified by HR Manager Asha N.'"*

[Pause for emphasis]

> *"That's deliberate. Indian Digital Personal Data Protection Act treats sick leave as sensitive personal data. We don't store the leave sub-type in SafeCommand — the HRIS owns that. We store enough for the audit, no more. DPDP-conservative by design. When you sell into a DPO-led organisation, this is the conversation that wins the deal."*

### Print page

[Click "Print" affordance]

> *"And here's the thing — auditor opens this URL on their tablet, prints to PDF, hands it to the inspector. Or in Phase B, our PDFKit rendering pulls the same data structure into a Fire NOC-formatted report. The detail page IS the report — single source of truth."*

---

## 3. Drill B — Older Full Evacuation (the maturity story)

Back to `/drills` → click into the **Full Evacuation** drill (240d ago).

> *"Annual full-venue drill from 8 months ago. Smaller team back then — 10 staff. Compliance: 70% safe-confirmed. 100% classified — zero unexcused, just like the recent drill. Three different reason codes show up here, completing the full taxonomy."*

### The 3 stories in Drill B

**Karthik Iyer — `OTHER` — the rare-edge-case story**

> *"Karthik was at off-prem product training at a vendor warehouse — pre-approved by the GM. He acknowledged the drill remotely on his phone but obviously couldn't return to the venue assembly point. The reason code is `OTHER` — and look at the system constraint: when SH chose 'Other', the system required at least 10 characters of context. He couldn't drive-by classify with 'x' or 'busy'. The notes are real: 'Off-prem product-training session at vendor warehouse, pre-approved by GM Mohanlal V on 2025-08-22.'"*
>
> **Investor talking point:**
> *"This is data quality at the schema level. We don't trust user input — we constrain it. The DB rejects empty 'Other' classifications. When you're building the compliance moat, schema-level guardrails are what auditors trust."*

**Suresh Reddy — `ON_BREAK` — the labour law story**

> *"Suresh was on a statutory tea break in the canteen — 10:55 to 11:25 IST, per Factories Act 1948 §55. Confirmed in canteen via CCTV at 11:02. The Factories Act mandates that statutory breaks cannot be made into discipline events. We respect that explicitly with this code. Indian labour law isn't a footnote in our compliance — it's a built-in classification."*

**Manjusha Pillai — `OFF_DUTY` — the auto-classification story**

> *"Manjusha was off-shift Saturday weekly off — at home. The system enrolled her in the participant set via the 'all-staff fallback' path (this drill ran before shift management was active in their setup). Pradeep then auto-applied `OFF_DUTY` at end-of-drill review. This is the gracefully-degrade story: even when shift management isn't fully configured, every staff gets classified. Nobody falls through the cracks."*

---

## 4. Cross-drill — the complete taxonomy

> *"Together, those two drills demonstrate all six reason codes — `OFF_DUTY`, `ON_LEAVE`, `ON_BREAK`, `ON_DUTY_ELSEWHERE`, `DEVICE_OR_NETWORK_ISSUE`, and `OTHER`. We adopted this taxonomy after a deep industry survey covering ISO 22398, NFPA 1600/1561, FEMA NIMS, OSHA, NABH (India), Telangana Fire Service Form FF-3, NDMA, BIS, DPDP Act 2023, and six industry SaaS comparisons including Drillster and SafetyCulture. The full research is in our reference doc — happy to walk you through the methodology."*

---

## 5. Audience-specific closes

### To a **hospital CISO / NABH compliance officer**

> *"Three things matter for NABH §DM (Disaster Management): (1) per-staff drill records with timestamps, (2) classification of every absence with audit attribution, (3) data-residency posture aligned with DPDP Act. We deliver all three out of the box. The `ON_DUTY_ELSEWHERE` code maps directly to your 'on clinical duty' use case — your nurse-on-ICU-patient scenario is the canonical example we built this for. Want to walk through how this would look at your venue?"*

### To a **mall facility head**

> *"What you saw here is exactly what your Saturday quarterly fire drill log should look like. Right now, you probably have a paper register where the SH writes 'Kavita Nair — at jewellery counter' — and that's it. No timestamp, no protocol citation, no audit trail of who classified the absence and when. When the Fire Service inspector visits, that paper register is not enough. This system is — and your team can run a drill, classify exceptions, and have the report ready before the inspector finishes their tea."*

### To a **corporate safety director (multi-venue)**

> *"At 65 venues, you have 65 separate paper registers, no consistent classification, no comparability across venues. With us, one taxonomy across every venue you own. You can compare your Mumbai drill compliance to your Bangalore drill compliance directly. And when one zone in one venue keeps showing `DEVICE_OR_NETWORK_ISSUE`, your facility ops team gets an action item — at the corporate level — to fix the signal coverage. That's your governance dashboard, not your safety system."*

### To a **VC / institutional investor**

> *"Three layers of moat in what you just saw: (1) the schema — `CHECK` constraints at the database level mean data quality is enforced not advised; (2) the taxonomy — backed by an 18-source industry survey + NABH/Fire NOC/DPDP alignment, hard for a copycat to reproduce in a few weekends; (3) the workflow — auto-classification, RLS-enforced PII scoping, audit-trail attribution — these are the kinds of features that take a year to retrofit but a sprint to build first-time-right. The compliance moat compounds — every additional venue we onboard adds historical drill data that becomes the comparable benchmark for the next venue we sell into."*

### To a **board director (governance lens)**

> *"Three things this gives your governance committee: (1) 100% audit defensibility — every drill is a complete record, every absence is classified, every classification is attributed to the SH who made it with timestamp; (2) no individual liability creep — the system bias is 'what's the systemic issue' not 'who failed', so HR / labour-law disputes are pre-empted by structured classification; (3) cross-venue comparability — when you're reviewing safety risk across 65 venues, the same taxonomy means you can spot the outlier zones, schedule extra drills there, and demonstrate proactive risk management to insurers and regulators. This is the safety governance dashboard you've always wanted, finally instrumented."*

### To an **auditor (Telangana Fire Service / NABH)**

> *"Sir / madam, this is the drill register your annual inspection requires, in digital form. Every drill has a timeline, every participant has a status, every absence has a structured reason with an attributed setter and timestamp. The format mirrors Form FF-3 — Leave / Off-duty / Site duty / Other (specified) — with two additional categories that handle device-failure and break-entitlement cases that are real but not covered in the paper format. I can print any drill record on demand. I can also show you the audit log — what happened, who did it, when. Anything I can clarify for your file?"*

---

## 6. Data behind the demo (for technical follow-ups)

| Drill | Date | Type | Participants | Safe | Acknowledged | Missed | Reasons used |
|---|---|---|---|---|---|---|---|
| A | 60 days ago | Fire Evacuation | 14 | 11 | 1 | 2 | ON_DUTY_ELSEWHERE / DEVICE_OR_NETWORK_ISSUE / ON_LEAVE |
| B | 240 days ago | Full Evacuation | 10 | 7 | 1 | 2 | OTHER / ON_BREAK / OFF_DUTY |

Total: 24 participants, 18 SAFE_CONFIRMED, 2 ACKNOWLEDGED-with-reason, 4 MISSED-with-reason. **All 6 reason codes from ADR 0004 represented.** **0 unexcused** across both drills.

To re-seed: `./scripts/seed-drill-participants-demo.sh`. Idempotent — DELETE + INSERT pattern; staff additions use ON CONFLICT DO NOTHING.

---

## 7. Demo flow checklist (60-second arc)

For investor / board demos with a strict time box:

- [ ] **00:00** — Open `/drills` list, point out 2 completed + 1 scheduled
- [ ] **00:10** — Click recent Fire Evacuation row → detail page
- [ ] **00:20** — Header: "13:22 evac time, 100% audit-classified"
- [ ] **00:30** — Walk to Kavita Nair row — `ON_DUTY_ELSEWHERE` cash vault story
- [ ] **00:45** — Faisal Ahmed row — `DEVICE_OR_NETWORK_ISSUE` dead zone → IT action raised
- [ ] **00:55** — "Print page" — auditor handoff path
- [ ] **01:00** — Close: "100% audit-defensible. Zero unexcused. NABH-ready, Fire NOC-ready, DPDP-conservative."

Extended demo (~3 min) adds the `ON_LEAVE` DPDP story + a dive into Drill B's `OFF_DUTY` auto-classification + comparison-vs-prior-drill comment.

---

## 8. Field-tested objections + responses

### *"How do we know SH won't just classify everyone as `OFF_DUTY` to game the score?"*

> *"Three guardrails. (1) `OFF_DUTY` and `ON_LEAVE` and `ON_BREAK` are auto-classifiable from shift roster + HRIS — no SH judgment needed for those. (2) `ON_DUTY_ELSEWHERE` and `OTHER` require SH to fill in notes — the audit log shows what they wrote. (3) Audit log is append-only — if SH later changes the classification, the change is logged with timestamp and old value retained. You can detect gaming, and the auditor will see the pattern."*

### *"What if a staff has a reason that doesn't fit the 6 codes?"*

> *"That's exactly why `OTHER` exists. SH selects 'Other' and types a real explanation — minimum 10 characters, enforced at the DB level. After 6 months of pilot data, if the same edge-case shows up frequently, we promote it to a dedicated code in a future migration. The taxonomy evolves with field reality."*

### *"Why no `SICK_LEAVE` as a distinct code?"*

> *"Two reasons. (1) DPDP Act 2023 treats health information as sensitive personal data — singling out 'sick' creates audit-trail bias and unnecessary privacy exposure. (2) HRIS already tracks the leave sub-type. SafeCommand stays coarse: 'on leave' is sufficient for compliance. The HRIS holds the why. Cleaner data model, no privacy debt."*

### *"Doesn't 'Did not acknowledge' shame employees?"*

> *"That's why we display 'Did not acknowledge' on the screen but store `MISSED` in the database. The screen language is HR-safe. The data layer is auditor-precise. Two layers, one record. And the `EXCUSED` chip on classified rows tells the room: this isn't a discipline event, it's a properly handled exception."*

---

## 9. Maintenance

- **Owner:** SafeCommand sales / product (active until pilot go-live; SafeCommand customer success thereafter)
- **Update cadence:** review after every demo for narrative refinements; refresh per major Phase 5+ feature additions
- **Companion data refresh:** `./scripts/seed-drill-participants-demo.sh` refreshes the demo data on demand (idempotent)
