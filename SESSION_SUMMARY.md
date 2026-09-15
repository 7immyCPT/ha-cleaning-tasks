# Session summary — HA Cleaning Tasks (for continuing in a new chat)

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
  - `select.py` — `select.cleaning_display_language` (English/Afrikaans/
    isiXhosa), shared across every card.
  - `websocket_api.py` — CRUD commands for rooms/tasks
    (`cleaning_tasks/room/*`, `/task/*`) plus shared translations
    (`cleaning_tasks/translations/list`, `/set`).
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
    CSV export/import, **and a shared "Task name translations" table**
    (translate each distinct English task name once, applies to every task
    using that name — this replaced earlier per-task Afrikaans/isiXhosa
    input fields, which was tedious since names repeat across rooms).
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

## UNRESOLVED — CDN cache inconsistency (where this session left off)
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
