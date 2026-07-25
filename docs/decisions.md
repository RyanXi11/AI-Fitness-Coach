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