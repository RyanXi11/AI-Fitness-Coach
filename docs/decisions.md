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

