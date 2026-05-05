# Validation Conversation Script

**Status:** Print-friendly conversation guide for the 31-May-2026 go/no-go gate
**Purpose:** Run 10 venue-level conversations in Hyderabad to confirm pain + managed-service framing + willingness to pay
**Companion:** `validation-tracker.md` (capture results per conversation); `apollo-mockup-spec.md` (corporate sales — different flow)
**Per:** Business Plan v2 §16.2 + §22

---

## Why this script exists

Per Plan §22 — without 7+ pain confirmations from 10 conversations, the 16-week build is unjustified. Critical to:
- Run all 10 conversations with the **same script** so results are comparable
- Resist the temptation to redesign the product in conversation (listen, don't sell)
- Capture verbatim quotes — they become marketing material AND validation artefacts
- Score consistently against the 4 GO/NO-GO dimensions (pain, managed-service acceptance, app-first acceptance, willingness to pay)

**Default conversation length: 45–60 minutes.** Don't compress. Most pain emerges in minutes 20–35.

---

## Pre-conversation checklist (5 min)

Before each meeting:
- [ ] Read the venue's last fire/safety incident (if public — newspaper / Google news search)
- [ ] Note the venue type (mall / hospital / hotel / corporate) — affects question wording
- [ ] Open mobile demo on phone — be ready to show Zone Accountability Map (the hero demo)
- [ ] Open `validation-tracker.md` in a notes app
- [ ] Bring a notepad — verbatim quotes are easier to capture by hand than typing

---

## Opening (5 min)

> "Thanks for taking the time. I'm working on a venue safety platform called SafeCommand. Before I show you anything, I want to understand how you do safety today — not what you wish you did, what you actually do. The answers help me decide whether I'm building the right thing. Some questions might feel obvious; I just need to hear them in your words."

Set the contract:
- "I'm not selling today. I won't ask you to sign or commit. I'm asking 5 questions."
- "If you say something that surprises me, I might pause and write it down. That's good."

---

## Question 1 — The 10-Minute Reality Check (Pain validation)

> *"Walk me through exactly what happens in your venue during the **first 10 minutes** of a fire alarm. Be specific — who calls who, on what channel, and what happens if that person doesn't answer?"*

### What you're listening for

| Signal | Score |
|---|---|
| Multiple people called by phone (not radio); WhatsApp groups mentioned | ✅ pain confirmed |
| "We have a procedure but..." followed by ad-hoc reality | ✅ pain confirmed |
| "PA announcement" without staff accountability backbone | ✅ pain confirmed |
| Specific 1–2 person dependency ("I call Rajesh, Rajesh handles it") | ✅ pain confirmed (Rajesh-resignation risk) |
| "We have a documented plan and follow it precisely" — and they describe specific roles by name with timing | ⚠️ Lower pain. Probe deeper: "When was the last time you ran this exactly like that?" |
| Smooth, rehearsed answer ("our system handles it") | 🚫 Likely defensive; ask Q2 to see if reality matches |

### Follow-up prompts (use as needed)

- *"What happens if the security supervisor's phone is on Do Not Disturb?"*
- *"How many minutes until everyone in your venue knows?"*
- *"Who calls the Fire Brigade — and how do you know they've been called?"*

### Capture in tracker

- Verbatim quote of pain moment
- Time-to-everyone-knows (estimate from their answer)
- Number of single-points-of-failure (Rajesh-equivalent)

---

## Question 2 — The Paper Audit (Pain + compliance pressure)

> *"How do you currently document your **daily safety checks** and **shift handovers**? Can you show me the actual form or register you use today?"*

### What you're listening for

| Signal | Score |
|---|---|
| Paper register, photographed at month-end | ✅ pain — manual, error-prone, lossy |
| Excel spreadsheet maintained by one person | ✅ pain — single-point-of-failure for compliance |
| "We don't really document it day-to-day" | ✅ pain — Fire NOC renewal is a panic month |
| WhatsApp messages screenshotted and saved | ✅ pain — no audit-quality storage |
| "Our safety officer handles documentation" — vague | ⚠️ Probe — ask to actually see the form/register |
| Detailed digital system (e.g., they have a working competitor) | 🚫 Lower pain. Note WHICH platform; that's competitive intelligence |

### Follow-up prompts

- *"When was your last Fire NOC renewal? How did you assemble the paperwork?"*
- *"If your safety officer left tomorrow, how long would it take their replacement to know what's been done this month?"*
- *"Have you ever had a Fire Brigade or NABH audit ask for evidence you couldn't produce?"*

### Capture in tracker

- Method (paper / Excel / WhatsApp / digital)
- Single-person dependency (Y/N)
- Last-renewal pain story (verbatim if possible)

---

## Question 3 — The Drill Reality (Compliance + insurance pressure)

> *"When was your **last fire drill** and how exactly did you **prove attendance and completion** to your Fire NOC authority?"*

### What you're listening for

| Signal | Score |
|---|---|
| "Last drill was X months ago" where X > 3 | ✅ Pain — overdue per most NOC requirements |
| "We did a drill but I'm not sure how I'd prove it now" | ✅ Pain — accountability gap |
| Vague answer ("we do them regularly") | ✅ Pain — likely behind |
| Date specific + photo evidence + signed sheet | ⚠️ Lower pain. They have a system. Probe insurance angle. |
| "Our insurance broker handles it" | ⚠️ Insurance pressure exists; explore that angle |

### Follow-up prompts

- *"What did your insurance carrier ask for at last renewal?"*
- *"If a Fire Brigade officer walked in today and asked for your evacuation plan + last 4 drill records, how long to produce?"*
- *"Has anyone in your venue (not necessarily safety) ever delayed an insurance renewal because of safety paperwork?"*

### Capture in tracker

- Last drill date
- Time-to-produce evacuation paperwork (their estimate)
- Insurance pressure signal (Y/N)

---

## Question 4 — The Managed-Service Question (Critical for go-to-market)

> *"If SafeCommand professionally **configured and maintained your entire safety infrastructure** — floors, zones, compliance schedules, escalation chains — while your **Security Head managed the team within that structure**, would that feel like a service you could trust with your venue's safety?"*

### Why this question is critical

This is the SafeCommand business model gate. If the venue strongly prefers self-configuration ("I want full control"), the model is wrong and we should reprice as self-serve SaaS. If they react positively ("you'd take that off my plate?"), the managed-setup pricing premium is justified.

### What you're listening for

| Signal | Score |
|---|---|
| "Yes — that would save me a quarter of my year" | ✅ Strong managed-service acceptance |
| "I'd trust that if you knew our industry" | ✅ Acceptance with proof requirement |
| "We'd want to keep some control over X" — specific dimensions named | ✅ Acceptance with negotiated boundary |
| "I'd need to involve our compliance team" | ⚠️ Acceptance with stakeholder process |
| "We prefer to configure ourselves" | 🚫 Self-serve preference. Probe — what's the resistance? Cost? Trust? |
| "Sounds like a vendor lock-in" | 🚫 Trust gap. Probe — what would change their mind? |

### Follow-up prompts (don't sell here, just listen)

- *"What do you imagine that arrangement would feel like in month 3?"*
- *"Where would you draw the line — what must your team always control?"*
- *"What would make you trust a vendor with this level of access?"*

### Capture in tracker

- Y / Conditional / N
- Specific boundaries they want to retain
- Trust signal score (1 = wants to self-serve / 5 = wants us to handle everything)

---

## Question 5 — The Pilot Commitment (Willingness to pay)

> *"If I **set up SafeCommand fully and trained your Security Head for free for 90 days**, would you pilot it? After the pilot, the platform is ₹25,000–35,000 per month. Would that price feel reasonable for what you'd see in those 90 days?"*

### Why this is the closing question

Not a selling moment — a sincerity check. Free 90 days lowers the commitment bar. If they say no even to that, the rest of the conversation was theatre. If they say yes, we have a pilot.

### What you're listening for

| Signal | Score |
|---|---|
| "Yes, I'd pilot. Send me the contract." | ✅ Strong WTP + pilot commitment |
| "Yes — but I need to bring it up with [GM/owner/board]" | ✅ Acceptance with stakeholder gate |
| "I'd pilot. The price feels right if I see the value." | ✅ Conditional WTP |
| "I'd pilot but ₹25–35K is too high — maybe ₹10–15K?" | ⚠️ Pilot interest + price objection. Note the number. |
| "I'd think about it" — vague | ⚠️ Soft no. Don't push. Note. |
| "We'd never pay for safety software" | 🚫 Hard no. Note + understand why (not their problem? not their budget? someone else owns it?) |

### Follow-up prompts

- *"Who would I work with at [venue] to set up the pilot?"*
- *"What would 'value seen' look like at day 90 for you?"*
- *"If the pilot succeeds and you stayed on, what would you tell another [mall/hotel/hospital] manager about it?"*

### Capture in tracker

- Pilot commitment: Yes / Conditional / No
- WTP at proposed price: Yes / Counter (number) / No
- Stakeholder gate (who else needs to approve)
- Pilot start date (if Yes)

---

## Hero Demo (only if conversation has gone well — Q1–Q3 ✅)

If the conversation's energy is good, demonstrate **Zone Accountability Map** before Q4 — Plan §22 Rec #1: lead with this, every time.

> *"Before I ask the next question, can I show you something on my phone? It's a 30-second demo."*

Open the app → Manage Staff list (or Zone Accountability if built). Ask:

> *"If I asked you right now who is responsible for **your parking level B** — who exactly is accountable at this moment — how long would it take you to answer?"*

**Wait for their answer.** It will involve a phone call, a check with someone, or an honest admission. That moment is your conversation.

Then show the demo:

> *"SafeCommand answers that question in under one second. For every zone. On every shift. With a permanent audit trail."*

This is the visceral demonstration. If they're surprised, the rest of the conversation gets easier. If they're not surprised ("we already do this"), probe how — they may have a system you should know about.

---

## Closing (3 min)

> "Thank you. Whether you pilot or not, your answers helped me understand the problem better. Can I send you a one-page summary of what we discussed — including any commitments — by end of week?"

Get their email.

If they said yes to a pilot:
> "I'll send you a pilot agreement by end of next week with the 90-day terms and your designated contact. Looking forward to it."

If they said no:
> "Thanks for being direct. If anything changes — or if you ever want to point a peer my way — please feel free to."

---

## Post-conversation (within 1 hour)

- Open `validation-tracker.md`
- Fill in the row for this venue immediately (memory fades fast)
- Capture verbatim quotes word-for-word — exact wording becomes marketing copy
- Mark scoring per dimension
- Note any surprises or new questions to add to future conversations

---

## GO / NO-GO decision tree (for after all 10 conversations)

Apply at end of 31-May-2026:

| Dimension | GO threshold | NO-GO threshold | Score from 10 conversations |
|---|---|---|---|
| **Pain validation** | ≥7 confirm coordination breakdown | <4 identify real coordination failure | __ / 10 |
| **Managed-service acceptance** | ≥5 react positively | majority strongly prefer self-config | __ / 10 |
| **App-first acceptance** | ≥6 say native app preferred or acceptable | majority insist WhatsApp-only | __ / 10 |
| **Willingness to pay** | ≥3 indicate ₹25–35K viable OR ≥2 commit to free pilot | zero willingness above ₹10K | __ / 10 |

**If 3 or 4 dimensions hit GO threshold:** GO — begin 16-week build June 2026 per `JUNE-2026-REVIEW-REQUIRED.md`.

**If 2 dimensions GO:** **PIVOT framing** — managed-service language may be wrong; reframe as e.g., "platform with white-glove onboarding"; rerun 5 quick re-conversations before deciding.

**If ≤1 dimension GO:** **NO-GO** — redesign product model. Likely candidates:
- Self-serve SaaS at lower price (₹5–10K/month) — different go-to-market entirely
- Defer to corporate-only sales motion (skip individual venue sales; go direct to Apollo/Infosys mandate-style)
- Defer SafeCommand entirely; pivot to a different venue safety problem

---

## What NOT to do during conversations

- **Don't show the deck or mockup before Q4** — it pre-frames the conversation and biases their answers
- **Don't argue with their pain story** — even if you disagree, capture and listen
- **Don't sell during questions 1–3** — selling kills validation; it converts the conversation into a sales pitch where they tell you what you want to hear
- **Don't promise features** to win the pilot ("yes we'll build that") — you commit to the build, not customisation
- **Don't ask "would you use this?"** — almost everyone says yes (politeness bias). Ask "would you pay for this?" — that's the real question
- **Don't take more than 60 minutes** — if the conversation goes longer it's drifting; politely close and follow up

---

## What good looks like

After 10 conversations:
- A pile of verbatim quotes that read like marketing copy (e.g., "It would take days — we would call each hospital individually")
- 7–8 venues confirmed coordination breakdown using paper + WhatsApp pattern
- 5–7 venues willing to pilot for free 90 days (if pricing is right)
- 2 named pilot venues with named SH contacts (per Plan §22 milestone — 31-May-2026 commitment)
- 1 multi-building venue identified for Pilot 2 (per Q4 decision: Hyderabad supermall with parking + retail + service blocks)
- A clear sense of what makes a venue NOT a fit (use this as future qualification criteria)

---

## Refs

- Business Plan v2 §16.2 (5-question script source)
- Business Plan v2 §22 (Prime recommendations)
- Business Plan v2 §22 Rec #1 (lead with Zone Accountability Map)
- `validation-tracker.md` — companion data capture template
- `apollo-mockup-spec.md` — separate corporate-sales flow (Apollo/Infosys), NOT used for these venue conversations

---

*Validation script captured 2026-05-05 · Use for May 2026 conversations · Decision gate: 31-May-2026*
