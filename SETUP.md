# Setup

## 1. Install the integration (HACS custom repository)

HACS → Integrations → ⋮ → Custom repositories → add this repo's URL,
category "Integration" → install "Cleaning Tasks" → restart Home Assistant.

## 2. Add the integration

Settings → Devices & Services → Add Integration → search "Cleaning Tasks" →
Submit. No configuration needed at this step — it starts empty, or with
whatever `generated/seed_cleaning_tasks_storage.json` was placed at
`/config/.storage/cleaning_tasks` before first startup (only relevant if
migrating from an older, pyscript-based version of this project).

This creates ~7 day-schedule entities, one text and one select entity, and
a `switch.cleaning_task_*` entity per task you add.

## 3. Add the cards to a dashboard

Edit any dashboard (existing or new) → Add Card → search for:
- **Cleaning Today Card** — the kiosk checklist
- **Cleaning Task Editor Card** — search/add/edit/remove rooms & tasks,
  CSV export/import
- **Cleaning Settings Card** — cleaning days + "used since last clean?"
  toggles
- **Cleaning Reports Card** — reset/refresh + outstanding-this-month
- **Cleaning Voice Picker Card** — pick a voice per language

Put `cleaning-today-card` on its own dashboard/view for the kiosk tablet;
put the other four wherever you (the admin) actually look at dashboards —
they don't need to be together or separate from your existing views.

## 4. Restrict the kiosk (the actual privacy boundary)

1. Settings → People → Users → Add User. Name it e.g. `kiosk`, **untick
   "Administrator"**, set a simple PIN/password.
2. Give that dashboard/view (with just `cleaning-today-card`) to the
   `kiosk` user; don't give it the view(s) with the other cards.
3. Log in as `kiosk` on the tablet itself, not your own account.

Optional polish: install the **Kiosk Mode** HACS frontend card/add-on to
hide the header and sidebar chrome on the tablet — cosmetic only, the real
access boundary is the separate non-admin user above.

## 5. Set up languages and voices

Add `cleaning-voice-picker-card` somewhere you can reach it, pick a voice
per language (each dropdown lists whatever speech-synthesis voices your
current browser/device actually has). The language dropdown in
`cleaning-today-card`'s header (or the settings card) controls which
language's task names and voice are used everywhere — it's shared, so
changing it on the kiosk also changes it on admin cards and vice versa.

When adding a task, the editor card lets you fill in Afrikaans/isiXhosa
names alongside the English one; leave them blank and it falls back to
English automatically.

## 6. Completion history

Every tick is timestamped automatically in Home Assistant's built-in
Logbook (no custom report needed) — add a core **Logbook** card pointed at
your `switch.cleaning_task_*` entities if you want that view alongside the
Reports card.
