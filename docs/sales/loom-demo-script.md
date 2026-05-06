# Loom Demo Script — SafeCommand Hero Demo

> **Length target:** 90 seconds (acceptable: 75–110s)
> **Recording app:** Loom
> **Audience:** Indian venue prospects (security heads, GMs, ops directors at malls/hotels/clinics)
> **Hero claim (Plan §22 Rec #1):** *"Who owns Zone B right now?"* — answered in under one second
>
> Companion: `loom-demo-setup-checklist.md` for pre-recording prep (run that first)

---

## Pre-flight (do these BEFORE pressing record)

1. ✅ Demo seed re-run within last hour: `./scripts/reset-hyderabad-demo.sh && ./scripts/seed-hyderabad-demo.sh` — keeps incident timestamps fresh ("30 min ago" / "2hr ago")
2. ✅ Browser tab order (left-to-right):
   - **Tab 1:** `http://localhost:3000/accountability` (Dashboard — Zone Accountability)
   - **Tab 2:** `http://localhost:3000/zones` (Dashboard — Zone Status Board)
   - **Tab 3:** `http://localhost:3000/incidents` (Dashboard — Incidents feed)
3. ✅ Mobile (Expo Go on phone or simulator): logged in as **TEST_DEMO_Security_S01** (phone `+919000012301`) — this staff has 1 zone assignment + working OTP via TEST_PHONE_PAIRS bypass
4. ✅ Loom recording window: laptop screen + small mobile device frame in corner (or screen mirror via QuickTime)
5. ✅ Microphone tested; no notifications; quiet room

---

## The 90-second arc

### Beat 1 — Set the problem (0:00–0:10) — 10s

**Show:** desktop wallpaper or a closed laptop briefly.

**Say:**
> "Right now, if you ask any security manager — *'who's covering parking level B?'* — they'd call someone, check WhatsApp, ask around. Three minutes pass. The moment's gone. SafeCommand answers in one second."

---

### Beat 2 — Open the live operating venue (0:10–0:25) — 15s

**Show:** click into Tab 1 — `localhost:3000/accountability`

**Say (while clicking):**
> "Here's a 28-zone Hyderabad supermall — operating right now. Six staff on shift. Mid-afternoon. Day shift activated four hours ago."

**Highlight (cursor hover):**
- The owner cards across the page — Rajesh Kumar (Shift Commander) covers 3 zones; Priya Sharma (Floor Supervisor) covers 2 stairwells; etc.
- The "Coverage gaps" stat at the top showing **2** in red

**Say:**
> "Every named owner. Every zone. Refreshed every minute."

---

### Beat 3 — The hero answer (0:25–0:40) — 15s

**Show:** scroll down the same `/accountability` page so the **red coverage-gap callout card** is prominent.

**Say (pause for impact, then point):**
> "Two zones have no staff right now. T1 Restroom Basement. T2 Restroom Basement. *That* is the conversation a security head should be having — not 'who's covering what.'"

**Optional sub-beat (skip if pressed for time):** Hover over Rajesh Kumar's owner card.
> "Rajesh covers T1 Reception — and right there, T1 Reception is in ATTENTION state. So Rajesh is on the call for it. We know the responsible person. In real-time."

---

### Beat 4 — Operator perspective (mobile) (0:40–0:58) — 18s

**Show:** switch to mobile device. The **My Shift** screen is already open.

**Say (while showing):**
> "Now flip to a guard's phone. Open the app. They don't see all 28 zones — they don't need to. They see one thing. *Their* zone."

**Highlight:**
- The identity header (avatar with initials + role)
- The single zone tile for **T2-Parking-Entrance**
- The status pill showing **All Clear**

**Say:**
> "T2 Parking Entrance. All clear. That's their job. No noise. No 'check the WhatsApp group.' No paper checklist."

---

### Beat 5 — Command surface + cross-link (0:58–1:15) — 17s

**Show:** switch to Tab 2 — `localhost:3000/zones` (Zone Status Board)

**Say:**
> "Security head sees the big picture. Severity-coded. T1 Reception in ATTENTION yellow. Two historical incidents from earlier today — one fire alarm test, one security check, both contained."

**Show:** click the "View accountability →" link in the top right.

**Say:**
> "Need to know who's responsible for an alert? One click. Back to the names. Back to the people."

---

### Beat 6 — Close (1:15–1:30) — 15s

**Show:** end on `/accountability` page (back where we started).

**Say:**
> "This isn't WhatsApp groups. It's not paper checklists. It's *operating reality*. Built for Indian venues. Audit trails compliant with NABH and Fire NOC. DPDP-compliant. Live infrastructure today."
>
> "[Optional close: 'Want a 15-minute walkthrough? Reply with a slot.']"

---

## Dashboard-only fallback (if mobile is unavailable)

Skip Beat 4. Replace with:

### Beat 4-alt — Dashboard depth (0:40–0:58) — 18s

**Show:** Tab 3 — `/incidents`

**Say:**
> "Every incident — declared, escalated, contained, resolved — every action timestamped. Every responder named. Compliance-grade audit trail without anyone having to *write* it."

This loses the operator-perspective beat but tells the audit-trail story instead. Total length ~88 seconds.

---

## Recording tips

- **Cursor speed:** slow + deliberate. Faster cursors look chaotic on Loom.
- **Don't read the script verbatim** — internalise the beats and speak conversationally. A few "ums" are fine; sounding scripted is the kill switch.
- **Silence is OK** — leave 0.5s after each transition for the viewer's brain to catch up.
- **Click cross-links don't go in the same window** if you opened them as new tabs. Best UX for the viewer: stay in one browser window, switch tabs explicitly.
- **Re-take threshold:** if you say "let me try that again" — start over. Don't try to splice in Loom.
- **Length tolerance:** 75–110s acceptable. Under 75s = too rushed. Over 110s = audience drops off.

---

## What the script demonstrates (mapped to spec)

| Beat | BR / NFR | Spec ref |
|---|---|---|
| 2 | BR-19 — Zone Accountability Map | Plan §22 Rec #1 (THE hero demo) |
| 3 | NFR-01 multi-tenant isolation visible (only this venue's zones); BR-19 coverage-gap callout | Plan §3 differentiation vs WhatsApp |
| 4 | BR-04 (8-role permission model) — staff sees own slice; NFR-04 (≤3 taps to action) | EC-17 ThemeProvider — same brand on staff screen |
| 5 | BR-18 Zone Status Board + cross-link UX | Phase 5.4 |
| 6 | EC-08 India residency + Hard Rule 12 + EC-10 audit immutability | Plan §16 compliance posture |

---

## Variants to record (one each, ~5 min each)

| Variant | Audience | Length | What changes |
|---|---|---|---|
| **A — Hero (this doc)** | Cold prospects, generic | 90s | Default — don't change unless you must |
| **B — Hospital pilot** | NABH-conscious clinic GMs | 90s | Replace Beat 6 close with: "Built for NABH compliance. Currently in pilot prep with [referenceable name when available]" |
| **C — Multi-building (MBV)** | Apollo or Hyderabad supermall directly | 100s | Beat 2 emphasises "T1 / T2 are two TOWERS in one venue — building-scoped roles for SH per tower" (gates June MBV ship) |
| **D — Investor / partner** | VC, advisor, partner | 75s | Trim Beat 1 problem-set; add quick mention of Apollo path (₹3.34 Cr ARR potential) and 91 BR roadmap depth |

Record A first. B/C/D are quick re-records once you're comfortable with A.

---

## Watch-out checklist (post-record review)

Before you publish the Loom, watch it once and confirm:

- [ ] Zero `localhost` URLs visible in the address bar (some prospects flag this; consider screen-cropping)
- [ ] No "[DEMO]" labels anywhere visible (check incident descriptions, shift names)
- [ ] No personal data leaks (your real phone, your real email)
- [ ] Audio is clear, no background hum
- [ ] Length is between 75–110s
- [ ] Cursor doesn't jitter; transitions are smooth
- [ ] You don't say "Claude" or "Loom" or technical implementation details
- [ ] You sound confident, not rushed

If any fails, re-record. Loom views are scarce — make the ones you spend count.
