# Loom Demo — Pre-Recording Setup Checklist

> **Time required:** 5 minutes if everything's working; 15 if cold-starting from a fresh machine.
> **Do this each time** before pressing record. Skipping a step almost always shows up in the recording.
> Companion: `loom-demo-script.md` for the actual 90-second arc.

---

## A. Infrastructure check (1 minute)

### A1. Railway api is awake

```bash
curl -sS https://api-production-9f9dd.up.railway.app/health
# Expect: {"status":"ok","service":"safecommand-api","checks":{"database":"ok","firebase":"ok"}}
```

If the response hangs >5s or returns 503, the api is sleeping. **Fix:** Railway Console → `api` service → toggle off Sleep, or hit any endpoint twice (the second call wakes it).

### A2. Supabase is up

The api/health response above includes `database:"ok"` — that's the Supabase round-trip check. If it's `error`, check Supabase Status Dashboard. Loom recording is a no-go until both are green.

### A3. Local dev servers running

In separate terminal windows:

```bash
# Dashboard (Tab 1, 2, 3)
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand/apps/dashboard"
npm run dev
# Expect: ▲ Next.js 14.x.x — Local: http://localhost:3000

# Ops Console (only if recording Variant C — MBV pilot — otherwise skip)
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand/apps/ops-console"
npm run dev
# Expect: ▲ Next.js 16.x.x — Local: http://localhost:3001
```

---

## B. Demo data — fresh seed (2 minutes)

**Critical:** the demo seed embeds incident timestamps as `NOW() - 30min` and `NOW() - 2hr`. After 2-3 hours of aging, the incidents read as "5h ago" / "8h ago" — breaks the "live operating venue" feel. **Re-seed every time you record**.

```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"

# Reset (clears any prior seed run)
./scripts/reset-hyderabad-demo.sh

# Re-seed (idempotency-guarded; refuses to double-seed)
./scripts/seed-hyderabad-demo.sh
```

**Expected output (final summary table):**

```
           item           | count
--------------------------+-------
 staff (new)              |     6
 shifts ([DEMO])          |     2
 shift_instances (active) |     1
 staff_zone_assignments   |    10
 zones in ATTENTION       |     1
 incidents ([DEMO])       |     2
```

If counts differ, investigate before recording — something has drifted.

---

## C. Mobile preparation (1 minute)

### C1. Login as `TEST_DEMO_Security_S01`

The seed assigns this staff to **T2-Parking-Entrance** specifically so the mobile demo works without touching Railway env vars. Phone: `+919000012301`. OTP: per `TEST_PHONE_PAIRS` env — typically `123456`.

If your Loom variant skips mobile (Variant A dashboard-only path), you can skip this section.

```
1. Open Expo Go on phone (iOS or Android)
2. Scan QR from `apps/mobile && npx expo start`
3. App loads — phone screen
4. Enter +919000012301 → tap Send OTP
5. Enter the configured TEST_PHONE_PAIRS OTP (e.g., 123456)
6. Lands on Tasks screen; tap drawer (☰) → My Shift
7. Should see: 1 zone — T2-Parking-Entrance, All Clear
```

If any step fails:
- "OTP_INVALID" → wrong OTP for this phone in TEST_PHONE_PAIRS env. Check Railway api env.
- "STAFF_NOT_FOUND" → seed didn't run, or staff is inactive. Re-run seed.
- App stuck on splash → Expo metro bundler error; restart `expo start`.

### C2. Recording the mobile screen

Three options, easy → polished:

| Option | Setup | Result |
|---|---|---|
| **iPhone:** QuickTime Movie Recording → choose iPhone as source | 30 sec | Crisp screen capture, big preview |
| **Android:** `scrcpy` over USB | 1 min | Crisp screen capture |
| **Either:** physical phone in frame next to laptop | 5 sec | Hand-held, less polished but feels real |

For the Loom, QuickTime/scrcpy is recommended — clean, large, every interaction visible.

---

## D. Browser tabs (30 seconds)

Open these IN THIS ORDER (tab 1 leftmost):

```
Tab 1 → http://localhost:3000/accountability
Tab 2 → http://localhost:3000/zones
Tab 3 → http://localhost:3000/incidents
```

You should already be logged in to the dashboard (Supabase Auth cookie). If logged out:

- Click "Sign in" link → log in with venue credentials (your founder account or a TEST_DEMO_Security_Head)
- Verify the venue selected is `Hyderabad Demo Supermall`

---

## E. Final pre-record validation (30 seconds)

Click through each tab and confirm:

### Tab 1 — `/accountability`
- ✅ Page header: "Zone Accountability"
- ✅ Stats strip: **Zones: 12** · **Owners: 7** · **Coverage gaps: 2** (red dot)
- ✅ Coverage-gap callout: red border, lists T1-Restroom-Basement and T2-Restroom-Basement
- ✅ Owner cards: 7 staff (Rajesh Kumar, Priya Sharma, Anil Reddy, Lakshmi Iyer, Vikram Singh, **TEST_DEMO_Security_S01**)
- ✅ Cross-link "View status board →" in top-right

### Tab 2 — `/zones`
- ✅ Page header: "Zone Status Board" with subtitle "Severity-coded · refreshes every 5 seconds"
- ✅ One zone in ATTENTION (T1-Reception, yellow)
- ✅ Cross-link "View accountability →" in top-right

### Tab 3 — `/incidents`
- ✅ Two incidents:
  - SECURITY SEV3 CONTAINED (~30 min ago) on T2-Parking-Entrance
  - FIRE SEV2 RESOLVED (~2h ago) on T1-Stair

### Mobile (if recording Variant A)
- ✅ Logged in as TEST_DEMO_Security_S01
- ✅ Drawer → My Shift opens
- ✅ Identity header: "TEST_DEMO_Security_S01" / "GROUND_STAFF"
- ✅ One zone tile: T2-Parking-Entrance — All Clear

If ANY of these fail, **do not record yet** — fix first. Use the Common Issues section below.

---

## F. Loom settings (30 seconds)

| Setting | Recommended |
|---|---|
| Recording mode | Screen + Camera (small bubble) OR Screen-only |
| Camera | Top-right corner, small (focus is the app, not your face) |
| Microphone | External mic if you have one; Mac built-in is acceptable |
| Resolution | 1920×1080 (your laptop probably) |
| Length cap | Loom free tier: 5 min — you only need 90s |
| Notifications | Mac: System Settings → Focus → Do Not Disturb → ON |
| Browser zoom | 100% — don't zoom in (causes weird hover states) |

---

## G. Press record

You're ready. Open Loom, choose "Screen + Cam" (or "Screen only"), select the browser window with Tab 1 visible. Hit Start.

Internalise the script — don't read it. Speak naturally. Pause for impact at the coverage-gap callout.

---

## Common issues + fixes

### Issue: api/health returns 503

**Cause:** Railway api service is sleeping (cost-optimization mode).

**Fix:**
1. Railway Console → `api` service → Settings → Sleep mode → toggle off (or click "Wake")
2. Wait 30 seconds, retry `curl /health`
3. If still down, check Railway logs for crashes; redeploy if needed

### Issue: dashboard shows "Failed to set session context" or empty zone list

**Cause:** This was the mig 009 PostgREST PGRST203 issue. Should be fixed in production.

**Fix:** Verify mig 009 hotfix is in production:
```bash
cd "/Volumes/Crucial X9/claude_code/NEXUS_system/products/Safecommand"
PWD_RAW=$(grep '^DATABASE_URL=' .env | head -1 | sed 's|.*postgres:||' | sed 's|@db.*||')
psql "postgresql://postgres.exrewpsjrtevsicmullp:${PWD_RAW}@aws-1-ap-northeast-1.pooler.supabase.com:5432/postgres" -c "SELECT pronargs FROM pg_proc WHERE proname='set_tenant_context';"
# Should return ONE row with pronargs=4 (not two rows)
```

If it returns two rows (3 and 4), mig 009 hotfix didn't apply. Re-run hotfix manually.

### Issue: mobile login fails — "OTP_INVALID"

**Cause:** TEST_PHONE_PAIRS doesn't include `+919000012301`, or the OTP value is different.

**Fix options:**
- A. Check Railway env: `TEST_PHONE_PAIRS` should include `+919000012301:<OTP>`. Add it if missing.
- B. Use a different known-working phone from existing TEST_DEMO_* staff. The seed assigns TEST_DEMO_Security_S01 — if you change to e.g. TEST_DEMO_Security_Head, modify the seed first.

### Issue: incidents show "5h ago" or "1d ago"

**Cause:** seed wasn't re-run recently. Incident timestamps are anchored to `NOW() - 30 min` / `NOW() - 2hr` AT SEED TIME, so they age.

**Fix:** `./scripts/reset-hyderabad-demo.sh && ./scripts/seed-hyderabad-demo.sh` — re-anchors timestamps.

### Issue: dashboard /accountability shows "0 owners, 0 zones, 0 coverage gaps"

**Cause:** The session is set to a different venue (not Hyderabad Demo Supermall).

**Fix:** Sign out and back in; verify venue dropdown selects "Hyderabad Demo Supermall".

### Issue: weird text rendering, fonts look broken

**Cause:** Geist font hasn't loaded (network glitch, dev server cache).

**Fix:** Hard-refresh tab (Cmd+Shift+R). Restart `npm run dev` if persistent.

### Issue: dashboard at production Amplify URL still shows "Zone Board" not "Zone Status"

**Cause:** Amplify production serves `main` branch; the rename + new pages live only on `safecommand_v7` (local dev).

**Fix:** Record from `localhost:3000`, not Amplify. Production parity comes at June merge.

---

## Post-record checklist

After recording, before sharing:

- [ ] Watched the recording end-to-end at 1.0× speed
- [ ] Confirmed no `localhost:` URLs visible (or: cropped them out)
- [ ] Confirmed no `[DEMO]` text visible anywhere
- [ ] Confirmed no personal data leaks (real phone in TEST_DEMO doesn't matter — it's a test number)
- [ ] Length 75–110s
- [ ] Audio clear, no household sounds
- [ ] Cursor smooth
- [ ] Title: "SafeCommand — 90-second walkthrough" (or similar; not "Loom Recording 2026-05-06")
- [ ] Description: short, includes link to your Calendly for next steps
- [ ] Sharing: link-only (not "anyone with link can comment")

---

## Variant-specific overrides

### Variant B — Hospital pilot prospect

Extra checklist items:
- [ ] Mention NABH compliance explicitly in Beat 6
- [ ] Skip "DPDP" mention (already implied for India healthcare)
- [ ] Add note about Phase 2 GCP migration unlocking hospital pilots (Hard Rule 12)

### Variant C — Multi-building (MBV) — Apollo / Hyderabad pilot

Extra checklist items:
- [ ] Beat 2 emphasis: "T1 / T2 = two towers, one venue, separate building-scoped SH"
- [ ] Show shift template building scope (Phase B — currently single-building only)
- [ ] Note: full MBV UI ships in June Phase B per `JUNE-2026-REVIEW-REQUIRED.md`

### Variant D — Investor / partner

Extra checklist items:
- [ ] Trim Beat 1 problem-set to 5s (audience already understands)
- [ ] Add Beat 6: "₹3.34 Cr ARR potential at 65 venues — Apollo path"
- [ ] Mention Plan §16 corporate brand layer + multi-country roadmap
