# HA Cleaning Tasks

A Home Assistant custom integration (installable via HACS) that turns
cleaning tasks into a kiosk checklist: enter tasks per room with how often
each needs doing, and it auto-distributes them across your cleaning visits
so everything gets done by month-end — with a tap-to-hear option in
multiple languages, and a full timestamped completion log.

## How it's built

This is a real custom integration (`custom_components/cleaning_tasks/`),
not a collection of scripts and generated YAML. That means:

- **Rooms and tasks live in Home Assistant's own storage** (`hass.helpers.storage.Store`,
  the same mechanism every core integration uses) — not a JSON file you
  hand-edit and regenerate from.
- **Every task is a real entity** (`switch.cleaning_task_<id>`) created and
  removed dynamically as you add/remove tasks. No restart needed to see a
  new task on the kiosk.
- **Cards are cards, not dashboards.** Add whichever ones you want to any
  existing dashboard view:
  - `cleaning-today-card` — the kiosk checklist (add this to a
    kiosk-restricted dashboard)
  - `cleaning-task-editor-card` — search, add, edit, remove rooms/tasks;
    CSV export/import
  - `cleaning-settings-card` — which days the cleaner comes, and "used
    since last clean?" toggles for tracked rooms
  - `cleaning-reports-card` — small reset/refresh buttons + what's
    outstanding this month
  - `cleaning-voice-picker-card` — pick a speech-synthesis voice per
    language

## Multi-language

`select.cleaning_display_language` (English / Afrikaans / isiXhosa) is
shared across every card. Each task can optionally have an Afrikaans and
isiXhosa name (set in the task editor) — the kiosk card shows whichever
language is selected, falling back to the English name if no translation
was entered. The voice picker lets you choose a different
speech-synthesis voice per language for the read-aloud button.

## How the scheduling works

Each task has a `unit` (`week` or `month`) and a `count` — "N times a
week" or "N times a month." The integration compares days-since-last-done
against that interval; if a task is due — or the month is running out and
it still hasn't been done — it's surfaced as due today. Skip a cleaning
day and overdue tasks just carry forward, rather than being silently
dropped.

A task can also be marked **"only if used"** (`conditional_on_used`) and
tied to a room that "tracks usage" (e.g. a spare bedroom, the braai) —
that task only becomes due if the room's "used since last clean?" toggle
is on. Ticking the task off clears that toggle automatically.

## Privacy: kiosk vs. admin

There's no separate "admin dashboard" baked in — the admin-style cards are
just cards, added wherever you like. The actual access boundary is a
**restricted, non-admin HA user** for the kiosk device: create that user,
give it only a dashboard with `cleaning-today-card` on it, and don't show
it the view(s) with the other cards. See `SETUP.md`.

## Repo layout

```
custom_components/cleaning_tasks/   <- the integration (Python backend)
custom_components/cleaning_tasks/www/  <- the Lovelace cards (JS)
generated/seed_cleaning_tasks_storage.json  <- one-time migration seed used when this
                                                project moved off its earlier pyscript version
```

## Requirements

- HACS custom repository install of this integration (Settings → Devices
  & services → Add Integration → "Cleaning Tasks" once installed)
- Core HA only otherwise — no other HACS cards required

See `SETUP.md` for full install steps.
