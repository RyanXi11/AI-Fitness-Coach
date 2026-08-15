# Design Decisions Log

Running record of real design forks hit while building the AI Fitness Coach app — what we considered, what we chose, and why. One section per milestone.

---

## Milestone 1 — Data model, API skeleton, multi-user auth

### Decision: Reference, don't embed, across Users / Workouts / MealLogs / FormFeedback

**Considered:**
- Embed each user's workouts/meal logs/form feedback directly as arrays inside their User document.
- Reference: keep Workouts, MealLogs, and FormFeedback as their own collections, each pointing back to a `userId`.

**Chose:** Referencing (foreign-key-style `userId` fields), with one exception — `sets` are embedded *inside* each Workout document, not their own collection.

**Why:** The rule that generalizes: embed when the child data is small, bounded, and always read together with its parent (a workout's sets — always read together, never queried on their own). Reference when the child data grows unbounded and gets queried independently of the parent (workouts over months of training, queried by exercise + date range for the progression algorithm). Embedding everything into User would hit MongoDB's 16MB document cap eventually and make even a simple profile load drag in a user's entire history.

---

### Decision: Users stats aggregation — compute on read

**Considered:**
- Precompute on write: update counters (`totalWorkouts`, `currentStreak`, etc.) on the User doc every time a workout is logged.
- Compute on read: run an aggregation pipeline (`$match` → `$group` → `$sort`) over Workouts every time the dashboard loads.
- Hybrid: precompute the cheap/frequent stats, compute the rest on demand.

**Chose:** Compute on read.

**Why:** At 3-5 users logging a few hundred workouts a year each, an aggregation pipeline runs in single-digit milliseconds — the performance problem precomputed counters solve doesn't exist at this scale. Precomputing introduces a real bug class (counter drifting out of sync with the actual data if a write fails partway) for zero benefit here. It's also the stronger, more specific thing to defend in an interview.

---

### Decision: FormFeedback storage — lean (no video)

**Considered:**
- Lean: store only the detected issue(s) and a timestamp per flagged rep.
- Store raw video frames alongside the detected issues, so a rep can be reviewed later.

**Chose:** Lean.

**Why:** Matches the reason pose estimation runs client-side in the first place (free-tier constraint) — uploading video anyway would erase that savings. Video storage/upload is real infrastructure surface area added to Milestone 4, which is already the tightest, "sprint mode" milestone. None of the resume-relevant technical depth (pose landmarks, angle math, real-time detection) depends on whether the video is kept afterward. This is a YAGNI call, not a permanent one — revisit if the app is still in active use after the deadline.

---

### Decision: Auth — JWT over session-based

**Considered:**
- JWT: server signs a stateless token on login; every later request proves identity via signature check, no DB lookup.
- Session-based: server stores a session record; client holds a session ID cookie; every request requires a server-side lookup.

**Chose:** JWT.

**Why:** At this scale (3-5 users), session-based auth would work completely fine — the performance argument for JWT's statelessness is invisible at this traffic level. The real reason to pick JWT here is resume signal: it's the more commonly expected pattern in MERN-stack interviews and job postings. Real tradeoff acknowledged: JWTs can't be revoked early without extra machinery (short expiry + refresh token), whereas killing a session is instant. Not a concern for an app used by close friends, but worth being able to name.

---

## Milestone 2 — Workout logging core + progression algorithm

### Decision: Progression algorithm — multi-session consistency rule

**Considered:**
- Simple double progression: fixed weight increase after any single hit session (classic novice lifting scheme).
- Estimated 1RM trend: Epley formula (`1RM ≈ weight × (1 + reps/30)`), suggest progression based on trend direction.
- Multi-session consistency rule: evaluate hits/misses across recent sessions, not just the most recent one.

**Chose:** Multi-session consistency rule.

**Why:** Every threshold in this approach is self-defined and fully defensible from first principles — unlike the 1RM option, which rests on an empirically-fit constant (`reps/30`) that can't be derived, only cited. It's more sophisticated than simple double progression (filters out one bad session from looking like a real plateau) without requiring new math. It also naturally surfaces the same-day-duplicate edge case that's this milestone's own quiz question.

### Decision: Strict vs. lenient consistency rule

**Considered:**
- Strict: last 2 consecutive sessions at a weight must both be hits.
- Lenient: 2 of the last 3 sessions are hits.

**Chose:** Strict.

**Why:** The lenient version has a real logical flaw — a hit/miss/hit sequence would recommend a weight increase immediately after the most recent session failed, which is incoherent and would need a patch rule to fix. Strict avoids this entirely, is simpler to reason about, and matches how real beginner programs (e.g. GreySkull LP) are structured.

### Decision: Algorithm mechanics — baseline, same-weight filtering, same-day handling

- **Baseline-relative hit/miss:** no separate "target reps" field. The first session logged at a given weight becomes the baseline; later sessions at that weight are compared set-by-set (position-by-position, not just total reps).
- **Same-weight filtering:** hit/miss comparisons only happen between sessions at the same weight — a rep drop after a weight increase isn't a real miss.
- **Same-day duplicate handling:** workouts are grouped by calendar date before evaluation. Only the earliest log per date counts toward progression (later same-day logs aren't deleted, just excluded from this calculation) — otherwise, logging the same exercise multiple times in one day could manufacture false "consistency" out of a single real training day, or none at all. The user can still delete an unwanted duplicate via the existing DELETE route if they want a different log to count.

### Bug found: non-deterministic same-day tiebreaking

Sorting workouts by `date` alone doesn't guarantee order between documents that tie on that field — MongoDB makes no such promise. Two same-day logs could return in either order, so "keep the earliest log" wasn't reliably correct until `_id` was added as a secondary sort key (`.sort({ date: 1, _id: 1 })`), since ObjectIds are monotonically increasing by creation time. Found through testing, not anticipated in the original design.

### Bug found: aggregation pipeline silently returning empty results

Mongoose auto-casts query filters to the correct type for `.find()`/`.findOne()` based on the schema, but raw aggregation `$match` stages bypass that casting layer. Comparing a plain string `userId` against stored ObjectIds silently matched nothing. Fixed by explicitly casting: `new mongoose.Types.ObjectId(req.user.id)` inside `$match`. Relevant for any future aggregation work (Milestone 5's leaderboard will need this same cast).

---

## Milestone 3 — React frontend + form checking setup

### Decision: JWT storage location — localStorage

**Considered:**
- `localStorage`: simple, survives page refresh, but readable by any JS running on the page (real risk only if an XSS vulnerability exists).
- In-memory only (React state, never persisted): closes the XSS-read risk, but logs the user out on every page refresh.
- httpOnly cookie: closes the XSS-read risk without sacrificing persistence, but requires cookie-based auth wiring, CORS-with-credentials, and CSRF mitigation.

**Chose:** localStorage.

**Why:** The realistic threat model for a 3-5 person app with no untrusted user-generated content rendered as raw HTML is low — the specific risk localStorage carries has little actual attack surface here. httpOnly cookies solve a problem this app doesn't currently have, at real implementation cost (more backend plumbing, harder cross-origin cookie handling once frontend/backend deploy to separate hosts in Milestone 5). Also the pattern most MERN tutorials and interview discussions assume by default. Flagged as worth revisiting if a future feature ever renders unsanitized user content.

### Decision: Camera permission pattern — explicit button, not auto-request

**Considered:**
- Auto-request camera access the moment the component mounts.
- Explicit "Enable camera" button; nothing happens until clicked.

**Chose:** Explicit button.

**Why:** Browsers increasingly suppress auto-triggered permission prompts after repeated denials, with no easy in-page reset. An explicit button matches real video-calling apps (Zoom, Meet), gives a natural moment to explain why camera access is needed, and provides a clean retry path on denial.

### Architecture: Context for auth state, axios interceptor for JWT attachment

`AuthProvider` (React Context) holds login state so any component can call `useAuth()` directly, avoiding prop-drilling through the component tree — appropriate at this app's scale; a state library like Redux would be overkill. A single axios interceptor in `api/axios.js` attaches the JWT to every outgoing request automatically, rather than adding it manually to each API call.

### Decision: `ProtectedRoute` is a UX layer, not a security boundary

The actual security guarantee is entirely server-side — every backend route already filters by `req.user.id` from the verified JWT (Milestone 1/2). `ProtectedRoute` only prevents an unauthenticated user from seeing a broken page: without it, a logged-out user hitting `/dashboard` would have the page render, its API calls fail with 401s, and — due to how the `try/catch` in `Dashboard.jsx` is structured — silently display "0 workouts logged" instead of a clean redirect to `/login`. Backend enforces security; frontend enforces a correct, honest experience.

### Bug found: missing CSS import silently lost during a routing rewrite

`App.jsx` was rewritten to add React Router setup, and the original `import './App.css'` line was dropped in the process — resulting in completely unstyled, default-browser-look pages with no error. Fixed by re-adding the import. Lesson: a full-file rewrite risks silently dropping unrelated lines that weren't the focus of the change.

### Bug found: no route matched `/`, producing a blank white screen

`<Routes>` only defined `/login`, `/register`, `/dashboard` — nothing matched the bare root path, so nothing rendered (confirmed via React Router's own console warning, not a thrown error). Fixed by adding `<Route path="/" element={<Navigate to="/dashboard" replace />} />`, which chains correctly into `ProtectedRoute`'s own redirect to `/login` for logged-out users.

### Bug found: camera stream not released after navigating away

The `useEffect` cleanup function read `videoRef.current?.srcObject` to find and stop the active MediaStream. But React clears a DOM ref back to `null` synchronously during unmount — *before* `useEffect` cleanup functions run (which fire asynchronously, after paint). By the time cleanup executed, `videoRef.current` was already `null`, so the stream was never actually stopped — confirmed visually via the laptop's camera indicator light staying on after leaving `/session`. Fixed by storing the `MediaStream` itself in a separate, plain ref (`streamRef`) with no DOM lifecycle tied to it, so cleanup could reliably access and stop it regardless of `videoRef`'s state. General lesson: don't rely on a DOM ref to still hold meaningful data inside its own component's unmount cleanup.

---

## Milestone 4 — Form checking with pose estimation

### Decision: Exercise scope — squat only

**Considered:** squat vs. push-up (both named in the original plan), and whether to attempt both in this milestone.

**Chose:** squat only; push-up deferred to a possible Milestone 6-7 bonus.

**Why:** Camera-positioning reasoning weakened once phone-at-gym became the realistic context (a phone can be propped for either exercise). The real deciding factor: squat is already the exercise the whole app is built around (progression algorithm, all Milestone 2 test data) — pairing pose-checking with the same lift creates one cohesive feature story. Building both exercises in this milestone was explicitly rejected given it's the tightest, "sprint mode" window — doubling scope risked doing both halfway.

*Clarified: the progression algorithm already generalizes to any exercise (`getProgressionSuggestion(userId, exercise)` was never hardcoded) — only pose-estimation form-checking is squat-specific and would need real, non-trivial work per additional exercise.*

### Decision: Depth threshold — fixed, not calibrated per user

**Considered:** a single fixed angle threshold for everyone vs. a calibration step (user performs one known-good rep to set their own baseline).

**Chose:** fixed threshold.

**Why:** Consistent with how the RPE/effort limitation was handled in Milestone 2 — name a real, honest limitation rather than over-build under a tight deadline. Calibration is a legitimate stronger approach, explicitly logged as a "what I'd improve next" item.

### Algorithm: rep detection state machine

Checking the angle against a threshold on every frame produces continuous false warnings throughout a rep's descent and ascent, since shallow angles are passed through on the way to and from the bottom. Instead: a state machine (`standing → descending → bottom → ascending → standing`) evaluates depth exactly once per rep, at the moment the angle stops decreasing and starts increasing — the actual bottom of the movement. Landmarks used: left hip (23), left knee (25), left ankle (27); angle computed via `atan2` at the knee vertex.

### Depth threshold — tuned against real data, not guessed

A genuine good-depth rep measured ~70°; a deliberately shallow rep measured ~140°. Initial threshold set to 100° — leaning strict of the exact midpoint (105°) deliberately, since for a coaching tool, a false "good depth!" on a shallow rep is worse than an overly cautious "not deep enough" on a good one (the former reinforces bad form). Later tightened further to 95° after additional testing, staying within the standard "parallel squat" convention (~90-100°) rather than pushing stricter than that range.

### Bug found: uncaught error inside a useEffect crashed the entire app

Calling `detectForVideo()` before the video element had real frame data throws. This happened on the very first, synchronous call inside a `useEffect` — and an uncaught error inside a `useEffect`, with no error boundary anywhere in the app, causes React to unmount the *entire* component tree, not just the offending component. Symptom: a completely blank page (no header, no button) immediately after granting camera permission, with the camera light turning back off as every cleanup function fired during the crash-unmount. Fixed by guarding against calling detection until `video.readyState >= 2 && video.videoWidth > 0`, plus wrapping the detection call in `try/catch` so no single bad frame can take down the app again. General lesson: any code that can throw and runs synchronously inside an effect needs its own guard/error handling — the failure blast radius is the whole app, not just that feature, without an error boundary.

### Bug found: noisy single-frame comparisons caused inconsistent rep detection

Bottom-detection compared only two consecutive raw frames (`angle >= prevAngle`). Pose landmark detection is noisy frame-to-frame — even during a real, continuous descent, per-frame jitter can make the angle briefly tick upward, which the code treated as a full direction reversal. Symptom: phase flipping to "ascending" mid-descent; inconsistent good/bad depth verdicts on visually similar reps. Fixed with a simple moving-average smoothing filter (5-frame window) applied to the raw angle before it reaches the state machine — a basic low-pass filter, trading a small amount of lag for much more reliable direction detection.

### Bug found: silent tracking loss looked identical to a frozen UI

When `result.landmarks` came back empty (person out of frame, occlusion, marginal lighting), the code simply skipped updating state, leaving stale numbers on screen with no signal anything had changed — indistinguishable from a genuine freeze. Fixed by adding an explicit `trackingLost` state, surfaced as a real, permanent user-facing message rather than silently displaying stale data.

### Bug found: postural sway logged false reps seconds apart

Discovered by inspecting real logged timestamps — multiple `FormFeedback` documents only a few hundred milliseconds to a couple seconds apart, physically impossible for real squats. The state machine had no minimum duration or depth requirement for something to count as "a rep" — ordinary sway near the standing threshold (standing ~170°, threshold 160°, only a 10° gap) could dip below it and back, triggering a complete, logged (almost always "not deep enough") false rep. Fixed with two complementary safeguards: an 800ms minimum cooldown between logged reps, and a separate, stricter `DESCENT_CONFIRM_THRESHOLD` (140°, not 160°) required to even begin tracking a new rep attempt — a real hysteresis margin against sway. General lesson: discrete events derived from a continuous, noisy real-world signal need explicit debouncing, not just a single clean threshold.

### Named limitation: camera angle affects measured depth

The same real squat depth produces different measured angles depending on camera height/angle, since only 2D (x, y) landmark coordinates are used, not MediaPipe's noisier depth (z) estimate — a known limitation of monocular pose estimation generally. Mitigation: use a consistent camera position in practice. Logged as future work rather than solved now (would require incorporating z, or a multi-camera setup).

### Confidence thresholds lowered from defaults

`minPoseDetectionConfidence`, `minPosePresenceConfidence`, `minTrackingConfidence` lowered from their 0.5 defaults to 0.3, to reduce false "no person detected" dropouts in marginal framing conditions. Explicit tradeoff: accepts slightly noisier landmark data on marginal frames in exchange for fewer dropouts — the moving-average smoothing already in place helps absorb the added noise.

### Gap found (via review, not live testing): hardcoded left side broke if the user faced the other way

The code hardcoded `LEFT_HIP`/`LEFT_KNEE`/`LEFT_ANKLE` as an implementation default, never presented as a deliberate decision. Filming from the side, one side of the body is naturally occluded by the torso and near leg — MediaPipe infers those landmarks rather than seeing them directly, making them less reliable. Hardcoding "left" implicitly assumed a fixed body orientation; facing the other way would silently trust the occluded, less accurate side with nothing to notice or correct for it. Caught by direct scrutiny of the code, not live bug reproduction. Fixed using MediaPipe's per-landmark `visibility` confidence score to dynamically select whichever side has higher combined visibility each frame. General lesson: an unstated implementation default is still a design decision — just one nobody reviewed.

### Decision: FormFeedback documents auto-expire after 30 days (MongoDB TTL index)

**Considered:** keep all documents forever; a MongoDB TTL index (auto-delete past a set age, in the background); a manual/periodic cleanup script.

**Chose:** TTL index, 30-day retention — `timestamp: { type: Date, default: Date.now, expires: '30d' }` in the Mongoose schema.

**Why:** every completed rep during a form-check session creates its own document — over months of real 5x/week use, this could accumulate to thousands of entries. Nothing in the app currently reads or aggregates FormFeedback over a long time horizon, so most of a rep's value is in the moment right after that set. A TTL index requires zero application code and directly extends the lean-storage philosophy already locked for this collection in Milestone 1. 30 days balances still being able to glance back at recent sessions against keeping the collection genuinely bounded.

---

## Milestone 5 — Meal photo calorie estimation + deployment

### Decision: Meal photos are not persisted

**Considered:** don't persist (analyze via Gemini Vision, discard immediately); store in cloud storage (Cloudinary free tier); store as base64 in MongoDB.

**Chose:** don't persist — this revisited an implicit assumption baked into Milestone 1's schema (`photoUrl` field assumed a stored photo).

**Why:** No verify criteria for this milestone required browsing old meal photos, only getting a calorie estimate. Directly extends the lean-storage philosophy already applied to `FormFeedback`. Base64-in-MongoDB was rejected outright — photos are large relative to every other document type in this app and would burn through the 512MB Atlas free tier fastest of any collection. `MealLog` schema revised: dropped `photoUrl`, added `foodDescription` (Gemini identifies the food, not just a bare calorie number).

### Decision: MealLog documents do NOT get a TTL (unlike FormFeedback)

**Considered:** applying the same 30-day TTL pattern used for FormFeedback, for consistency.

**Chose:** no expiry — kept forever, like `Workouts`.

**Why:** Ran the actual storage math rather than assuming the FormFeedback pattern transfers. FormFeedback's TTL was justified by extreme write volume (every rep) and low long-term value (rep-level detail isn't useful later). MealLog has neither property: realistic write volume (~15 documents/day across 5 users) works out to roughly 2.7MB/year — over a century before it threatened the 512MB free tier even combined with other unbounded collections. Nutrition data also has real foreseeable long-term value (a future "calorie trend over time" feature), making it architecturally closer to `Workouts` (kept forever, needed for progression history) than to `FormFeedback`. Lesson: don't apply a storage pattern just for consistency — verify the actual constraint it was solving still applies.

### Decision: Barcode scanning and the friend layer deferred to future work

Barcode scanning (reading a product barcode + Open Food Facts lookup for exact nutrition data) was raised as a genuinely feasible, separate feature — a different pipeline entirely from Gemini Vision's photo-based estimation. Deferred given this milestone was already substantial (photo pipeline + deployment).

The friend layer (see friends' workouts/streaks, a leaderboard) was deferred entirely, not merely descoped. The person building this stated directly they don't personally care about seeing friends' progress. Per the project's own rule — "a feature I can't defend is worse than not having it" — a feature without genuine personal investment is unlikely to get the same real dogfooding that produced this project's strongest material (e.g., every Milestone 4 pose-detection bug was found through actually squatting in front of the camera repeatedly). Building it anyway risked a shallow, undertested feature added purely for milestone-completeness. Noted explicitly: the "multi-user auth with data isolation" resume claim was already fully earned in Milestone 1 and doesn't depend on this feature existing.

### Gemini Vision integration: structured output + rate-limit handling

Used `@google/genai` (the current Interactions API), with an explicit JSON schema passed via `response_format` to guarantee parseable structured output, rather than hoping a plain-text prompt returns clean JSON.

### Bug found: Express default body size limit rejected photo uploads

Default `express.json()` limit (100kb) rejected base64-encoded photo payloads. Fixed with `express.json({ limit: '10mb' })`.

### Real-world constraint found: Gemini free-tier rate limits, and the fix

Hit `429` errors during testing. Initial assumption (short retry-after in the error meant a brief per-minute limit) was wrong — checked the actual live usage dashboard and confirmed both the 5 RPM *and* the 20 RPD (daily) limits were exhausted; only a day-based reset would clear it, not waiting a few minutes.

**Fix — multi-model fallback pooling:** each Gemini model carries its own separate quota. Built a fallback chain trying multiple models in order (highest daily quota first: two Lite variants at 500 RPD each, then several 20 RPD models, with the already-exhausted model last), pooling several independent daily budgets into one effective ~1,080 requests/day — not just retry-on-failure, genuine quota pooling. Only `429` errors trigger fallback; any other error re-throws immediately, since it would fail identically on every model. Added explicit 429 handling returning a clear "try again shortly" message (a real, confirmed scenario given the quota is shared across every friend using the app) instead of a generic failure, plus logging which model actually served each request for visibility into the fallback chain's behavior.

### Bug found: premature page reload hid the meal analysis result

`onLogged={() => window.location.reload()}` was copied directly from `WorkoutForm` without re-checking whether the reasoning applied. `setResult()` only schedules a re-render; the reload fired in the same instant, wiping the page before React ever painted the result. Unlike `WorkoutForm` (where reloading served a real purpose — refreshing dashboard stats elsewhere on the page), this component's entire job is showing the result, and nothing on the dashboard depends on meal log data. Fixed by removing the reload entirely. General lesson: reusing a working pattern without re-asking "why did this exist there, and does that reason hold here" is exactly how this class of bug happens.

### Improvement: client-side image resizing before upload

Downscaled photos to a 1024px max dimension (canvas re-encode, JPEG quality 0.8) before sending to the backend. Food/portion identification depends on overall shape and proportion, not fine pixel detail — a modern phone photo carries far more resolution than the task needs, adding real network transfer time and likely model latency for no benefit. Only scales down, never up (upscaling a smaller image adds no real detail).

### Deployment: Render (backend) + Vercel (frontend)

**Considered for backend:** Render, Railway, Fly.io. **Chose:** Render — confirmed via live research that Railway removed its free tier in 2024 (billed from the first minute), and Fly.io's current free-tier status is genuinely contested across sources (some report it requires a credit card with no lasting free option). Render was the only option with no card requirement and no conflicting reports, directly satisfying the project's founding "must stay free-tier" constraint. Known tradeoff accepted: free-tier services spin down after inactivity, adding ~50+ seconds to the first request after idle time — reasonable for a personal app used by a few friends, not a public product.

**Region:** matched to MongoDB Atlas's existing region (N. Virginia) rather than optimizing purely for user proximity — the backend-to-database round-trip happens on every single request, making it the dominant latency factor over backend-to-user distance.

### Bug found: SPA routes returned Vercel's 404 on page refresh

Refreshing on a nested client-side route (e.g. `/login`) returned Vercel's own 404 page — confirmed via DevTools showing the failed request's `Type: Document` (a real browser navigation request, not client-side routing) and the response ID matching Vercel's own infrastructure format. Client-side routing (React Router) only intercepts navigation *within* a running app; a refresh sends a fresh HTTP request straight to the host for that literal path, and no file exists there in a Vite SPA build (only `index.html` plus static assets). Fixed with `client/vercel.json`, adding a rewrite rule serving `index.html` for any unmatched path, letting React Router take over once it loads — a near-universal requirement for any SPA deployed to a static host, not an edge case specific to this app.

### Bug found: CORS blocked the deployed frontend

`"No 'Access-Control-Allow-Origin' header is present"` — confirmed via the exact browser Console error rather than guessed at. Caused by `FRONTEND_URL` (Render's environment variable feeding the backend's CORS allowlist) either being unset or not exactly matching the real Vercel URL — `Origin` header comparisons are exact-match, so a trailing slash or `http` vs `https` mismatch fails silently. Fixed by setting `FRONTEND_URL` to the precise deployed Vercel URL and redeploying.

### Two Vite/environment-variable facts worth remembering

- Variables exposed to Vite's client-side bundle must be prefixed `VITE_` — a deliberate safety boundary preventing accidental leakage of server-only secrets into browser-shipped code.
- Vite bakes environment variables in at **build time**, not runtime — changing an env var after a deploy already ran requires triggering a fresh build for it to take effect, not just a restart.

---

## Milestone 6 — Barcode scanning (deferred from Milestone 5)

Product barcode → Open Food Facts lookup, using `@zxing/browser` for client-side decoding. A separate pipeline from Gemini Vision's photo estimation: exact manufacturer-published nutrition data rather than a model's estimate, at the cost of only working on packaged food.

### Bug found: barcodes decoded successfully but the app did nothing

Symptom: camera opened, video previewed fine, and pointing it at a barcode produced no reaction at all — while the console filled with `NotFoundException` warnings from ZXing's `MultiFormatReader`.

Two separate things had to be untangled here. The console warnings were a **red herring**: ZXing logs one per frame where nothing decodes, which is what normal scanning looks like, so the most visible signal was also the least relevant one. (Those messages read "non-ReaderException" even for `NotFoundException`, which *is* a `ReaderException` — the library is compiled to ES5, and subclassing built-in `Error` through TypeScript's `__extends` downlevel breaks `instanceof` across its own exception hierarchy. Cosmetic; the retry loop `continue`s either way.)

The real cause was `codeReader.reset()`. That's the v0.1.x API — in `@zxing/browser` v0.2.x the reader has no `reset()` or `stop()` at all, and a scan is ended through the `IScannerControls` object that `decodeFromConstraints` returns. Verified by grepping the installed package: zero occurrences of `reset` in `BrowserCodeReader`.

**Why it was invisible rather than a loud crash** — the interesting half. The decode callback was declared `async`, so the resulting `TypeError` became a rejected promise instead of a synchronous throw. ZXing invokes that callback *inside its own `try/catch`* (`BrowserCodeReader.scan`), so had the callback been synchronous the library would have caught the error and surfaced it. Being `async`, the rejection escaped that catch entirely and landed as an unhandled promise rejection, while the statements after the throwing line — `setStatus('found')` and the product lookup — simply never ran. The scan loop kept spinning happily. A failure that should have been a hard crash on the first successful decode instead looked identical to "the scanner just doesn't work."

Fixed by capturing the returned controls and calling `scanControls.stop()`. Used the `controls` passed as the callback's third argument rather than the awaited return value, because ZXing runs the first decode iteration *synchronously* inside `scan()`, before the `decodeFromConstraints` promise resolves — a ref assigned from the return value would still be `null` for an instant scan. The ref is still kept for unmount cleanup.

### Real-world constraint found: camera features can't be tested over a LAN IP

`getUserMedia` is only available in a secure context — HTTPS or `localhost`. The obvious way to test on a phone (`vite --host`, then browse to `http://192.168.x.x:5173`) therefore can't work: the camera never opens at all, which is easy to misread as the scanner being broken rather than the transport. Camera work has to be tested against the deployed HTTPS build or an HTTPS tunnel. Confirmed by testing on an iPhone against the Vercel deployment, where scanning worked immediately.

### Decode reliability tuning (the actual reason it failed on a laptop)

Once the `reset()` bug was fixed, desktop scanning still struggled while the phone succeeded on the first try. Laptop webcams are fixed-focus and low-resolution; the `ChecksumException`/`FormatException` entries mixed into the console were the tell — ZXing *was* locating bar patterns and failing to resolve them, i.e. an image-quality problem, not a logic one. Three changes, all of which help on any device:

- **Restricted formats** to `EAN_13`, `EAN_8`, `UPC_A`, `UPC_E` via `DecodeHintType.POSSIBLE_FORMATS`. By default ZXing attempts every symbology it knows — QR, Micro QR, Aztec, PDF417, Data Matrix — on every frame, spending most of the per-frame budget on readers that could never match retail packaging. This is also what produced the "No Micro QR finder pattern found" noise.
- **Requested 1280x720.** At the browser default of 640x480 an EAN-13's narrow bars are only a couple of pixels wide, which is precisely what produces near-miss checksum failures.
- **`TRY_HARDER` hint, and `delayBetweenScanAttempts` 500ms → 100ms.** The default gives only two decode attempts per second of the user holding steady; ten is a far wider window to land a readable frame.

### Decision: debug affordance gated behind `?debug=1`, not `import.meta.env.DEV`

An on-screen readout (negotiated camera resolution, running decode-attempt count, last exception type) was added to diagnose the phone failure, since there's no devtools console on a phone. It distinguishes the failure modes that otherwise look identical: a climbing attempt count means the loop is alive and the camera isn't producing a readable frame, a frozen count means the loop itself died, and a resolution of 640x480 means the camera refused the requested 720p.

Kept rather than deleted, but gated on a `?debug=1` query parameter. `import.meta.env.DEV` was the obvious choice and is the wrong one here: it's `false` in production builds, which — since camera testing requires HTTPS and therefore the deployed build — would hide the tool in the only environment where it can be used. General lesson: "dev-only" gating assumes local development is where you debug, which isn't true for anything that depends on device hardware or a secure context.

