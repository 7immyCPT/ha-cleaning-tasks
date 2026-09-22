# Session summary — HA Cleaning Tasks (for continuing in a new chat)

## Latest session (2026-09-22) — week preview catch-up, PIN, mobile TTS, scheduling fix
1. **Shipped (built last session, verified this one)**: ±7 day browsing;
   🔒 mark-all-done on today and past days (hidden on future days); header
   cleanup at kiosk width; masked password modal instead of
   `window.prompt`; PIN checked server-side (`cleaning_tasks/pin/verify`)
   and admin-editable (`pin/get` / `pin/set`, "Kiosk PIN" section in the
   task-editor card; default `6690`). Past-day rows toggle via
   `cleaning_tasks/task/mark_done_for_date`.
2. **`__init__.py` was NOT stale** - the local copy was byte-identical to
   the server (the `/local/cleaning_tasks` + `shutil.copyfile` approach).
3. **Mobile/tablet TTS fix** (`cleaning-today-card.js`): `_speak` awaited
   a Google translate fetch and `tts_get_url` before `speak()` /
   `audio.play()`, so mobile browsers treated the tap as expired and
   blocked the audio. Now: each tap synchronously plays a silent WAV on one
   shared `<audio>` element (unlocking it for the real HA Cloud clip) and
   the first tap speaks an empty utterance (iOS speechSynthesis unlock);
   cached translations are used without awaiting; devices with **no Web
   Speech voices** (Android WebView = HA Companion app / kiosk browsers)
   fall back to HA Cloud TTS, en-ZA `LeahNeural` for languages without
   their own cloud voice; an utterance `error` (e.g.
   `language-unavailable`) also falls back to HA Cloud. Verified in an
   emulated mobile viewport, including simulated zero-voices; still worth
   a real-device check.
4. **Scheduling bug**: with cleaning days Mon+Wed, a 2x/week task (interval
   3.5 days) was never due on Wednesday (only 2 days after Monday), so it
   silently became weekly - Wednesday showed nothing. `_is_due` now also
   makes a task due when doing it now is closer to the target interval
   than waiting for the next cleaning day (`_days_to_next_cleaning_day`).
   Simulated 5 weeks against live data: Wed = the 19 2x/week tasks, Mon =
   those + the 15 weekly ones, monthlies roughly monthly.
5. **Past-day preview bug**: a task done on that exact day stopped being
   "due" and vanished from the list instead of showing done - so ticking a
   past day emptied it out. `_preview_due_tasks` now keeps tasks whose
   `last_done == target`.
6. **Data note**: on 2026-09-22 the user ran mark-all-done for Monday
   2026-09-21. It only marked that day's list, but the list held 55 tasks
   because most (monthlies included) had never been ticked and a
   never-done task always counts as due. All those now have
   `last_done = 2026-09-21`.
7. Lovelace resource versions are now bumped via the websocket
   (`lovelace/resources/update`) from the logged-in browser page, not by
   clicking through Settings → Dashboards → Resources. `?v=` is the first
   12 characters of the file's sha256.
8. **Print any day**: 🖨️ now shows on every day and prints the list on
   screen (another day's list comes from `week_preview`, and future days
   get a "planned list" note). It used to be today only.
9. **Schedule balancing** (Mon was ~34 tasks, Wed ~19): once-a-week tasks
   get a fixed `slot.day`, once-a-month tasks a fixed `slot.day` +
   `slot.week` (week of month 1-4), assigned greedily to the lightest
   day/week, with a room's tasks kept together (`ensure_slots`, run on
   every refresh, so new tasks and cleaning-day changes are picked up).
   Slotted tasks are due on their slot (weekly once ≥ half the interval has
   passed, monthly once ≥14 days have), or on any cleaning day once clearly
   overdue (weekly ≥10 days, monthly ≥ ~37). A never-done slotted task
   waits for its slot instead of piling onto the next cleaning day. Admin
   "Schedule balance" card → `cleaning_tasks/schedule/rebalance`
   re-spreads everything. Simulated against live data: every cleaning day
   lands around 27-31 tasks.
10. **Mark-all checklist**: after the PIN, a dialog lists every still-open
    task for that day (grouped by room, all ticked, with an All toggle) so
    missed ones can be unticked; only ticked tasks get marked
    (`_promptChecklist`, replaces the old `window.confirm`).


## Latest session (2026-09-15) — language translation, voice pronunciation, multi-language support
Started from: "when I select a language I want it to translate the task and
voice to that language" — it wasn't.

1. **Root cause of "nothing translates"**: not a bug — the shared
   `translations` dict in the live store was completely empty (verified via
   SSH: `voice_names` also all blank). Task text falls back to English when
   there's no translation, which is what the user was seeing.
2. **First fix attempt was wrong and got silently reverted**: wrote
   Afrikaans/isiXhosa translations directly into
   `/config/.storage/cleaning_tasks` over SSH while HA was running, then
   asked for a restart. Between the edit and the restart, the user's kiosk
   toggled a task switch, which triggered `manager.py`'s `mark_done()` →
   `store.async_save()` using the **still-empty in-memory data**, clobbering
   the file edit. **Lesson: never hand-edit `.storage/*` files on a live HA
   instance — always go through the running integration (service call /
   websocket command) so the in-memory `manager.store.data` and the file
   stay in sync.**
3. **Correct fix**: user generated a Long-Lived Access Token from their HA
   profile page, which was used to open a raw WebSocket connection to
   `ws://localhost:8123/api/websocket` from the HA host (SSH) — no
   third-party `websockets` pip package was available/desired, so a ~90
   line dependency-free WS client (stdlib `socket`, handshake + frame
   parsing) was written and used to call `cleaning_tasks/translations/set`
   for all 31 distinct task names × Afrikaans/isiXhosa. This went through
   the live manager, so it saved correctly with no race. **This is the
   pattern to reuse for any future one-off bulk data push**: don't touch
   `.storage` directly, script the websocket API instead.
4. **Voice/pronunciation fix**: `SpeechSynthesisUtterance.lang` was never
   being set anywhere (only `.voice` when a voice name happened to be
   picked) — Afrikaans text was being read by whatever default voice the
   browser used for its own locale. Fixed in `cleaning-today-card.js`
   (`_speak`) and `cleaning-voice-picker-card.js` (`_test`) to always set
   `utterance.lang` (from a BCP-47 map, or from `voice.lang` when an actual
   voice is picked). The voice picker card was also changed to group
   available device voices into "Matches `<language>`" vs "Other voices
   (will mispronounce)" `<optgroup>`s, so it's obvious which ones are real.
   **Underlying accent quality is still capped by what TTS voices are
   actually installed at the OS level on the kiosk device** — HA can't fix
   a missing voice pack.
5. **Multi-language support (all 11 SA official languages) + admin
   enable/disable toggle**, per explicit user request ("choose south
   afrikaan supported languages" + "admin be able to mark which one are
   turned on and off as i dont want to many options displayed to the
   cleaner on the dash"):
   - `const.py`: `LANGUAGES` now lists all 11 (English, Afrikaans,
     isiXhosa, isiZulu, Sepedi, Setswana, Sesotho, Xitsonga, siSwati,
     Tshivenda, isiNdebele), plus `LANGUAGE_BCP47` and `LANGUAGE_CODE` (the
     short code used to build `task_name_<code>` attributes) and
     `DEFAULT_ENABLED_LANGUAGES` (English/Afrikaans/isiXhosa, to preserve
     prior behaviour for the kiosk).
   - `store.py`: new `enabled_languages` list in the store, with
     `enabled_languages()` / `set_language_enabled()` helpers. Always keeps
     at least one language enabled.
   - `switch.py`: `extra_state_attributes` now generates
     `task_name_<code>` generically for every non-English language from the
     shared translations dict (Afrikaans/isiXhosa keep their legacy
     per-task `name_af`/`name_xh` override field for back-compat; the other
     8 languages are shared-translation-only, no per-task field).
   - `select.py`: `select.cleaning_display_language` now exposes an
     `enabled_languages` attribute (read by every frontend card) and keeps
     a reference to itself on `manager.language_entity` so it can be
     refreshed immediately when the admin toggles a language.
   - `manager.py`: new `set_language_enabled()` that updates the store,
     refreshes the select entity's state, and saves.
   - `websocket_api.py`: new `cleaning_tasks/languages/list` and
     `cleaning_tasks/languages/set` (admin-only) commands.
   - `cleaning-today-card.js`: `STRINGS` (chrome text: instructions/
     nothingDue/do/done) now has all 11 languages; the language dropdown
     only lists whatever is in `enabled_languages` instead of hardcoding
     3 options.
   - `cleaning-voice-picker-card.js`: rows are now built dynamically from
     `enabled_languages` instead of a hardcoded 3-language list.
   - `cleaning-task-editor-card.js`: new **"Languages" admin section**
     (checkbox grid, all 11, calls `cleaning_tasks/languages/set`); the
     shared translations table now renders one column per *enabled*
     non-English language instead of hardcoded Afrikaans/isiXhosa columns.
   - **Translation quality caveat, told to the user explicitly**: only
     isiZulu chrome text is reasonably confident (close to isiXhosa); the
     other 7 (Sepedi, Setswana, Sesotho, Xitsonga, siSwati, Tshivenda,
     isiNdebele) are best-effort/machine-assisted and should be reviewed by
     a native speaker before being relied on. Task-name translations for
     these 8 languages were **not** pre-filled — only the infrastructure
     was built; a real translation still needs to be typed into the
     translations table per language once enabled (same flow already
     validated for Afrikaans/isiXhosa in step 3).
   - **CSV export/import was intentionally left untouched** (`store.py`'s
     `CSV_FIELDS` still only has `task_name_af`/`task_name_xh`) — not
     extended to all 11 languages, out of scope for this ask. The shared
     translations table is the supported way to add translations now.
   - All Python files were syntax-checked via `python3 -m py_compile` **on
     the HA host over SSH** (not locally — the local Windows machine's
     `python3` shell alias is broken/redirects to the Microsoft Store).
     Deployed via the usual `cat file | ssh ha "sudo tee ..."` pattern (see
     Dev workflow below), then a full HA restart was needed (new
     entities/attributes + new websocket commands + frontend hash change).
   - **Not yet pushed to GitHub** — still needs `git add -A && git commit
     && git push` per the "Dev workflow" section once the user has
     confirmed the Languages toggle and translations work correctly after
     restart.
6. **Manual "Task name translations" table REMOVED, replaced with
   automatic on-the-fly translation** — user feedback: "we cant transalte
   each task manually so there is no longer a need for that". The shared
   `translations` dict/table (added in step 3/5 above) was fully ripped
   out again: `store.py`'s `get_translation`/`set_translation`/
   `list_translations` and the `translations` dict in `_default_data()`,
   `websocket_api.py`'s `cleaning_tasks/translations/list`+`/set` commands,
   `switch.py`'s per-language `task_name_<code>` attribute generation (task
   switches now only expose English `task_name`), and the whole
   "Task name translations" `ha-card` + JS in `cleaning-task-editor-card.js`
   (`_loadTranslations`, `_setTranslation`, `_renderTranslations`,
   `_translatedLanguages`). Replaced with client-side auto-translation in
   `cleaning-today-card.js`: a `translateText()`/`_cachedTranslation()` pair
   that calls Google Translate's free, keyless public endpoint
   (`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=<code>&dt=t&q=<text>`
   — CORS-open, verified directly), caches results in that browser's
   `localStorage` (`cleaning_tasks_translation_cache_v1`) so each task name
   is only fetched once per language ever. `GOOGLE_LANG` in
   `cleaning-today-card.js` maps each of the 11 languages to Google's code,
   with `null` for the 3 Google doesn't support (siSwati, Tshivenda,
   isiNdebele — those silently stay in English). The Afrikaans/isiXhosa
   *legacy per-task* `name_af`/`name_xh` fields in `store.py`/`add_task`/
   `update_task`/CSV were left alone (harmless, no longer read by anything
   in the UI) rather than doing a second breaking data-model change in the
   same session.
7. **RESOLVED: the frontend-JS caching bug that blocked this entire
   session's UI changes from ever showing up** (this is the same "CDN
   cache inconsistency" issue the previous session hit and left
   unresolved, documented lower in this file - keeping that section below
   as the historical record of what was tried and ruled out first).
   Symptom: after every restart, `curl` to the HA host (both `localhost`
   and its own LAN IP) always returned the correct, current file - but
   **every external client** (a real browser on the user's own device,
   after a genuine hard refresh AND a full "clear site data" wipe
   including Service Worker + Cache Storage; a separate remote-automation
   browser; both the Nabu Casa remote-UI URL AND the raw local LAN IP)
   kept getting an old, shorter, wrong version of `cleaning-today-card.js`
   indefinitely, with a stale `Last-Modified` header that didn't match the
   real file's mtime on disk. Ruled out, in order, with hard evidence for
   each: browser HTTP cache (`fetch(..., {cache:'no-store'})` didn't help),
   a wrong/different HA instance (disproved conclusively - set
   `select.cleaning_display_language` to `Tshivenda` from the backend,
   user's own Developer Tools > States page showed it immediately,
   proving same live backend), a reverse proxy in front of HA (user
   confirmed none exists), URL-path reuse in the CDN (a brand-new,
   never-before-used content-hash+epoch-salted filename was *still*
   stale). **Actual fix**: stopped using a component-private URL
   (`/cleaning_tasks_frontend/...`, registered via `StaticPathConfig` +
   either `add_extra_js_url` or a manual Lovelace resource) entirely, and
   instead serve the 5 frontend files through Home Assistant's **built-in
   `/local/` static mount** - the same mechanism the user's already-working
   `f1-sensor-live-data-card` custom card uses. `__init__.py` now copies
   `custom_components/cleaning_tasks/www/*.js` into
   `/config/www/cleaning_tasks/` on every `async_setup_entry` (via
   `shutil.copyfile`), and the 5 Lovelace resources point at
   `/local/cleaning_tasks/<file>.js?v=<content-hash>` (see "Frontend
   deploy workflow" below for the script that updates those resource URLs
   after a content change) - `/local/` immediately worked where every
   variant of the custom static-path scheme failed, on the very first try,
   for reasons still not fully understood (some difference in how HA's
   `frontend` integration's own long-established `/local/` route vs. an
   ad-hoc `StaticPathConfig` interacts with Nabu Casa's remote-UI relay -
   not confirmed, just empirically the fix that worked). **Lesson for any
   future custom card in this integration: always serve frontend JS via
   `/config/www/<name>/` + a Lovelace resource, never a custom
   `StaticPathConfig`+`add_extra_js_url` path** — the latter is what
   caused this entire mess both this session and the previous one.

## Frontend deploy workflow (established this session, supersedes the old
## "Dev workflow" step 3-4 for *frontend .js files specifically* - Python
## backend files still use the plain SSH `tee` + restart flow below)
1. Edit `custom_components/cleaning_tasks/www/<file>.js` locally.
2. Deploy the source file (so it's still correct for the next HA restart's
   auto-copy, and for git/HACS): `cat <file> | ssh ha "sudo tee
   /config/custom_components/cleaning_tasks/www/<file> > /dev/null"`.
3. Also copy it straight to the actually-served location (no restart
   needed for this part): `cat <file> | ssh ha "sudo tee
   /config/www/cleaning_tasks/<file> > /dev/null"`.
4. Update that file's Lovelace resource to a fresh `?v=<hash>` so browsers
   that already cached the old query string pick up the change - compute
   `sha256(file)[:12]` and push a `lovelace/resources/update` websocket
   command (`res_type: "module"`, `url:
   "/local/cleaning_tasks/<file>.js?v=<hash>"`) using a Long-Lived Access
   Token (ask the user for one via their HA profile page if you don't
   already have one from this session) - see this session's transcript for
   the ~90-line dependency-free Python WebSocket client (stdlib `socket`,
   no `websockets` pip package needed/wanted) used to do this over SSH.
   The 5 resource ids from this session:
   `edd00bd77ad347fc9c496d0c5f3a9213` (today-card),
   `9b1d448310214d3488f92e118d81eb93` (task-editor-card),
   `2d3975c9e7734ad3ac4fa3aab0b1f79b` (settings-card),
   `7aff01ac1e9c42c9b829b2c2a7535814` (reports-card),
   `08a3ac1b2763450a9eef07ebe5c87ca8` (voice-picker-card).
5. No HA restart is needed for a pure frontend change once the resource
   points at `/local/...` — just have the user reload the dashboard tab.

8. **HA Cloud (Nabu Casa) text-to-speech wired in for Afrikaans/isiZulu**,
   replacing the earlier Google-Translate-audio-endpoint hack. User added
   two TTS integrations to HA (`tts.home_assistant_cloud` and
   `tts.google_translate_en_com`); queried both via
   `tts/engine/get`/`tts/engine/voices` websocket commands - HA Cloud
   (Azure-backed) has real neural voices for **exactly 2 of the 11
   languages**: Afrikaans (`af-ZA`: `AdriNeural`, `WillemNeural`) and
   isiZulu (`zu-ZA`: `ThandoNeural`, `ThembaNeural`) - confirmed by
   querying every language code directly, nothing else in the SA set
   exists on Azure. `cleaning-today-card.js` and
   `cleaning-voice-picker-card.js` both got a `HA_CLOUD_TTS` map + a
   `playHaCloudTts()` helper that calls HA's own REST endpoint
   `hass.callApi("POST", "tts_get_url", {engine_id:
   "tts.home_assistant_cloud", message, language, options: {voice}})`,
   which returns `{path: "/api/tts_proxy/<id>.mp3"}` - played via a plain
   `new Audio(result.path)` (the proxy URL isn't auth-gated, works as a
   relative `<audio src>` directly). The voice picker now shows an
   explicit **"HA Cloud (recommended)"** `<optgroup>` with named voices
   (Adri/Willem, Thando/Themba) for those two languages, and the speak
   button automatically prefers HA Cloud when nothing else is picked.
   isiZulu is not in `DEFAULT_ENABLED_LANGUAGES` yet - if the user wants
   it, they can flip it on in the task editor's Languages section and it
   already has both translation (Google Translate text endpoint, `zu` is
   supported) and voice (HA Cloud) working.

## What this project is
A Home Assistant custom integration (`custom_components/cleaning_tasks/`) that
replaced an earlier pyscript + generated-YAML version entirely. Repo:
https://github.com/7immyCPT/ha-cleaning-tasks (tag `v0.1.0` exists).
Installed on the live HA instance **via HACS** (added as a custom repository,
category Integration) — this is how the user wants updates delivered from
now on, not raw SSH file pushes (though SSH pushes are still used during
active development to iterate fast, then committed/pushed to GitHub so HACS
stays in sync — see "Dev workflow" below).

## Architecture
- **Backend** (`custom_components/cleaning_tasks/*.py`):
  - `store.py` — all data (rooms, tasks, cleaning days, room-used flags,
    display language, per-language voice names, shared name translations)
    persisted via HA's own `Store` helper (`hass.helpers.storage.Store`),
    not raw file I/O. This is deliberate: an earlier pyscript-based version
    of this project hit repeated, hard-to-debug file-I/O bugs.
  - `manager.py` — owns the store + live entities, due/done computation,
    entity lifecycle (create/remove switches when rooms/tasks change).
  - `switch.py` — `switch.cleaning_task_<id>` (done today?, `due` attribute
    drives kiosk visibility), `switch.cleaning_day_<mon..sun>`,
    `switch.cleaning_room_used_<room_id>`.
  - `text.py` — `text.cleaning_voice_name`, stores a JSON blob
    `{"English": "...", "Afrikaans": "...", "isiXhosa": "..."}` of chosen
    speech-synthesis voice per language.
  - `select.py` — `select.cleaning_display_language` (all 11 SA official
    languages are valid options; which ones actually show on the kiosk is
    controlled separately by `enabled_languages`, exposed as an attribute
    on this entity), shared across every card.
  - `websocket_api.py` — CRUD commands for rooms/tasks
    (`cleaning_tasks/room/*`, `/task/*`), shared translations
    (`cleaning_tasks/translations/list`, `/set`), and which languages are
    enabled (`cleaning_tasks/languages/list`, `/set`).
  - `http_views.py` — CSV export/import at `/api/cleaning_tasks/export`
    and `/import`.
  - `__init__.py` — sets everything up, registers the 5 frontend JS cards.
- **Frontend** (`custom_components/cleaning_tasks/www/*.js`, plain JS
  custom elements, no build step):
  - `cleaning-today-card.js` — the kiosk checklist. Reads every
    `switch.cleaning_task_*` from `hass.states` directly (no per-task YAML
    needed). Has the language dropdown in its header. Built-in compact
    speak button per row (Web Speech API).
  - `cleaning-task-editor-card.js` — search/add/edit/remove rooms & tasks,
    CSV export/import, **a "Languages" section** (checkbox grid to enable/
    disable which of the 11 SA official languages show on the kiosk/voice
    picker), **and a shared "Task name translations" table** (one column
    per *enabled* non-English language; translate each distinct English
    task name once, applies to every task using that name — this replaced
    earlier per-task Afrikaans/isiXhosa input fields, which was tedious
    since names repeat across rooms).
  - `cleaning-settings-card.js` — cleaning-day toggles (**should be sorted
    Monday-first**, fixed this session — see unresolved issue below) +
    "used since last clean?" toggles for tracked rooms.
  - `cleaning-reports-card.js` — small reset/refresh buttons + outstanding-
    this-month list (computed client-side).
  - `cleaning-voice-picker-card.js` — per-language voice dropdown + test
    button.
- No dedicated "admin dashboard" — these 4 admin-style cards were added to
  a new "Cleaning" view on the user's existing Overview dashboard (per
  their explicit request: cards, not a separate dashboard). The kiosk
  dashboard ("Cleaning - Today") has just `cleaning-today-card`.

## Dev workflow established this session
1. Edit files locally under `custom_components/cleaning_tasks/`.
2. `python -m py_compile <file>.py` to validate Python syntax.
3. Push directly to the live HA instance for fast iteration:
   `cat <file> | ssh ha "sudo tee /config/custom_components/cleaning_tasks/<path> > /dev/null"`
4. Restart HA (Settings → System/Tools → "Restart Home Assistant", or via
   `/config/tools/yaml` page → Restart button → confirm). Poll
   `curl -s -o /dev/null -w "%{http_code}" https://<nabu-casa-url>/` until
   200.
5. Once verified working, `git add -A && git commit && git push` so the
   GitHub repo (source of truth for HACS) matches what's deployed.
6. SSH alias `ha` (via `~/.ssh/config`, ProxyJump through `proxmox` alias)
   reaches the HA VM (192.168.0.137, user `hassio`). **The "Advanced SSH &
   Web Terminal" HACS add-on can silently stop** (happened once this
   session) — if `ssh ha` suddenly refuses connections, check
   Settings → Apps (or Supervisor Add-ons) in the HA UI, start it, and
   enable "Start on boot" + "Watchdog" to prevent recurrence.

## RESOLVED (2026-09-15) — CDN/frontend-caching inconsistency
See point 7 under "Latest session" near the top of this file for the fix
(serve frontend JS via `/local/`, not a custom `StaticPathConfig` path).
The write-up below is kept as-is for historical context — everything tried
here was tried again this session too, with the same failure, before the
`/local/` fix was found.
The live HA instance is reached via Nabu Casa's remote-UI cloud proxy
(`https://6vmtz8amuqwkmqz50qz0jno5dy9vqils.ui.nabu.casa/`). There appears
to be a **CDN layer in front of it that caches by path and has edge nodes
out of sync with each other** — confirmed by fetching the *exact same URL*
via `curl` (fresh, correct content, correct ETag) and via the browser
(stale, wrong content, different ETag) within moments of each other,
repeatedly, even for URLs that had genuinely never been requested before
(freshly content-hashed paths, then freshly per-restart-build-id-prefixed
paths on top of that). None of these mitigations fixed it:
- Query-string cache-busting (`?v=<hash>`) — CDN ignored the query string,
  served old body regardless.
- Content-hash baked into the filename itself
  (`cleaning-settings-card.<hash>.js`) — still got a stale response from
  the browser's edge, while curl got the correct one.
- A per-HA-restart timestamp prefix folder on top of the content hash
  (`/cleaning_tasks_frontend/<unix-timestamp>/<file>.<hash>.js`) — pushed
  and restarted, confirmed correct via curl, but **the browser tab used in
  this session was still showing stale content for the freshly-built path
  when the session was interrupted.**

**This is very likely specific to the "Claude Browser" (in-app browser
pane) tool's own network path** — it consistently showed stale content
while `curl` from the Bash tool consistently showed fresh content for the
identical URL. That strongly suggests the in-app browser is going through
its own proxy/cache layer, separate from the CDN theory. **Next step for a
new session: verify from a real device/browser (the user's own phone or
PC, not the Claude Browser pane) whether the day-ordering fix and the
redesigned task-editor card (shared translations table) are actually
showing correctly** — they may already be fine for the user, and this may
have been purely a quirk of the automated browser tool used during this
debugging session, not a real user-facing bug.

Quick verification snippet (run in real browser devtools console) once
back on this:
```js
const ctor = customElements.get('cleaning-settings-card');
console.log(ctor.prototype._render.toString().includes('WEEKDAY_ORDER'));
// should be true
```
If a new session confirms it's still stale even on a real device, the
next thing to try is dropping `add_extra_js_url` + `StaticPathConfig`
entirely in favor of registering the cards as proper Lovelace resources
(`lovelace_resources` storage, `type: module`) the way the very first
version of this project's custom cards worked earlier in this same
session (before the HACS rewrite) — that approach never showed this
caching problem, for whatever reason (possibly a different code path in
frontend.py that Nabu Casa's CDN/the browser handles differently than
dynamically-`import()`-ed extra JS urls).

## Confirmed working (verified via SSH/curl, backend-side)
- Integration installed via HACS, config entry survives redeploys, all 67
  entities present and correctly named/typed.
- Due/done logic, room-used auto-reset on task completion, cleaning-day
  persistence across restarts (the original `initial: true` bug from the
  pre-HACS pyscript version is gone — days no longer reset on restart).
- CSV export/import, room/task CRUD via websocket — logic verified
  correct in code; UI-level re-verification blocked by the caching issue
  above.
- `store.py`'s shared `translations` dict + `list_translations()` /
  `set_translation()` — implemented and wired into
  `switch.py`'s `extra_state_attributes` (task-level `name_af`/`name_xh`
  override the shared dict if set, else falls back to it, else English).

## Known low-priority follow-ups (not started)
- User mentioned wanting to install Afrikaans/isiXhosa OS-level TTS voices
  on their actual kiosk/admin devices — that's a device Settings task, not
  something changeable from HA (explained during the session; isiXhosa
  voices are not available on mainstream TTS engines like Google's as of
  this session).
- Better admin reporting — user said "later" on this, not started.
