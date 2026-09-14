# HA Cleaning Tasks

A Home Assistant kiosk task manager: enter your cleaning tasks once (by room,
with how often each needs doing), and it auto-distributes them across your
cleaning visits so everything gets done by month-end — with a tap-to-hear
option and a full timestamped completion log kept separate from the kiosk.

## Where the task list lives

**`tasks_config.json`** is the single source of truth. It's organized exactly
how you'd think about it: a list of **rooms**, each with a list of **tasks**,
each task carrying its own **frequency**:

```json
{
  "id": "kitchen_counters",
  "name": "Wipe counters & stovetop",
  "unit": "week",
  "count": 2
}
```

- `unit: "week"` + `count: 2` → twice a week
- `unit: "month"` + `count: 1` → once a month

That's the whole vocabulary — every task is either "N times a week" or "N
times a month," which covers daily-ish chores (set `unit: week, count` equal
to your visits/week) through to windows/deep-cleans (`unit: month`). Keeping
it as one flat JSON file (rather than scattering task definitions across HA
YAML) means:

- it's easy to scan and edit by hand, or hand to Claude to edit for you
- adding/removing/renaming a task never touches the scheduling logic
- it's the only file you regenerate everything else *from* — see below

To change your task list: edit `tasks_config.json`, then run:

```bash
python generate_dashboard.py
```

This regenerates everything in `generated/` (helper entities, both
dashboards, the checkbox automation) from the current task list. Nothing is
hand-maintained outside that one file.

## How the scheduling works

Each morning, `pyscript/cleaning_manager.py` compares "days since last done"
against each task's target interval. If a task is due — or the month is
running out and it still hasn't been done — it's surfaced as due today. This
is self-correcting: skip a visit, and overdue tasks just carry forward and
get caught up, rather than being silently dropped.

## Privacy split: kiosk vs. reports

- **Kiosk dashboard** (`generated/kiosk_dashboard_generated.yaml`) shows
  *only* today's due tasks, room by room, with a checkbox and a 🔊 speak
  button. No navigation, no history, no settings.
- **Admin dashboard** (`generated/admin_dashboard_generated.yaml`) has the
  monthly report, the outstanding-tasks list, and the schedule settings.

The split only becomes a real access boundary once it's paired with a
**restricted, non-admin HA user** for the kiosk device — see `SETUP.md` for
the exact steps (create the user, assign only the kiosk dashboard, hide the
sidebar). A second dashboard alone doesn't hide anything from someone using
your own admin login.

## Repo layout

```
tasks_config.json              <- edit this to change tasks/rooms/frequency
generate_dashboard.py          <- regenerates everything below from the above
pyscript/cleaning_manager.py   <- scheduling, completion logging, TTS, reports
packages/cleaning_helpers.yaml <- input_number (visits/week), input_select (speaker)
generated/                     <- output of generate_dashboard.py (don't hand-edit)
```

## Requirements

- HACS integration: **pyscript**
- Core HA only otherwise (tile cards, conditional cards, input_booleans) —
  no other HACS frontend cards required, for reliability.

See `SETUP.md` for full install steps.
