"""
House Cleaning Task Manager
----------------------------
Requires the HACS "pyscript" integration.

Data files (created automatically on first run, in /config/):
  tasks_config.json     - room/task definitions (edit this to add/remove tasks)
  cleaning_state.json   - runtime state: last-done date per task + full completion log

Services exposed to Home Assistant (usable from automations / dashboard buttons):
  pyscript.cleaning_refresh_today      -> recompute which tasks are due today
  pyscript.cleaning_mark_done          -> mark a task complete (writes timestamp to log)
  pyscript.cleaning_mark_undone        -> undo an accidental tick
  pyscript.cleaning_speak_task         -> read a task aloud via TTS to a media_player
  pyscript.cleaning_generate_report    -> build an HTML report for a given month
  pyscript.cleaning_force_catchup      -> list anything still outstanding this month

Exposes state:
  pyscript.cleaning_today   -> attributes.rooms = today's due tasks, grouped by room
  pyscript.cleaning_status  -> attributes = per-room monthly completion counts
"""

import json
import os
from datetime import datetime, date
import calendar

CONFIG_PATH = "/config/tasks_config.json"
STATE_PATH = "/config/cleaning_state.json"
REPORT_DIR = "/config/www/reports"


def _load_config():
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_state():
    if not os.path.exists(STATE_PATH):
        return {"tasks": {}, "log": []}
    with open(STATE_PATH, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception:
            return {"tasks": {}, "log": []}


def _save_state(state):
    tmp = STATE_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, STATE_PATH)


def _visits_per_week():
    try:
        v = float(state.get("input_number.visits_per_week"))
        return v if v > 0 else 2
    except Exception:
        return 2


def _all_tasks(config):
    for room in config["rooms"]:
        for task in room["tasks"]:
            yield room, task


def _target_interval_days(task, visits_per_week):
    """Average number of days between required completions of this task."""
    if task["unit"] == "week":
        return 7.0 / task["count"]
    else:  # month
        return 30.4 / task["count"]


def _is_due(task, task_state, today, visits_per_week, days_left_in_month):
    interval = _target_interval_days(task, visits_per_week)
    last_done = task_state.get("last_done")
    if not last_done:
        return True
    last_done_date = date.fromisoformat(last_done)
    days_since = (today - last_done_date).days
    if days_since >= interval:
        return True
    # Monthly-safety catch-up: if a monthly/weekly task can't possibly be
    # completed again before month end at the normal pace, force it now.
    if task["unit"] == "month":
        remaining_target = 1 - task_state.get("done_this_month", 0)
        if remaining_target > 0 and days_left_in_month <= 3:
            return True
    return False


@service
def cleaning_refresh_today():
    """Recompute today's checklist, flip the due_<id>/done_<id> helper
    booleans that drive the dashboard, and publish a summary sensor."""
    config = _load_config()
    st = _load_state()
    today = date.today()
    today_iso = today.isoformat()
    days_left_in_month = calendar.monthrange(today.year, today.month)[1] - today.day
    vpw = _visits_per_week()

    due_by_room = {}
    for room, task in _all_tasks(config):
        due_entity = f"input_boolean.due_{task['id']}"
        done_entity = f"input_boolean.done_{task['id']}"
        tstate = st["tasks"].get(task["id"], {})
        due_today = _is_due(task, tstate, today, vpw, days_left_in_month)
        done_today = tstate.get("last_done") == today_iso

        if state.get(due_entity) is not None:
            if due_today:
                homeassistant.turn_on(entity_id=due_entity)
                # Reset the done-checkbox each new day, unless already ticked today
                if done_today:
                    homeassistant.turn_on(entity_id=done_entity)
                else:
                    homeassistant.turn_off(entity_id=done_entity)
            else:
                homeassistant.turn_off(entity_id=due_entity)
                homeassistant.turn_off(entity_id=done_entity)

        if due_today:
            due_by_room.setdefault(room["name"], []).append({
                "id": task["id"], "name": task["name"], "done_today": done_today,
            })

    total_due = sum(len(v) for v in due_by_room.values())
    state.set(
        "pyscript.cleaning_today",
        f"{total_due} tasks due",
        {"rooms": due_by_room, "date": today_iso, "friendly_name": "Today's Cleaning Tasks"},
    )
    return due_by_room


@service
def cleaning_mark_done(task_id=None):
    """Mark a task done right now and log the timestamp."""
    if not task_id:
        log.error("cleaning_mark_done called without task_id")
        return
    config = _load_config()
    room_name, task_name = None, None
    for room, task in _all_tasks(config):
        if task["id"] == task_id:
            room_name, task_name = room["name"], task["name"]
            break
    if room_name is None:
        log.error(f"cleaning_mark_done: unknown task_id {task_id}")
        return

    st = _load_state()
    now = datetime.now()
    today_iso = now.date().isoformat()

    tstate = st["tasks"].setdefault(task_id, {})
    month_key = now.strftime("%Y-%m")
    if tstate.get("month_key") != month_key:
        tstate["done_this_month"] = 0
        tstate["month_key"] = month_key
    tstate["last_done"] = today_iso
    tstate["done_this_month"] = tstate.get("done_this_month", 0) + 1

    st["log"].append({
        "task_id": task_id,
        "room": room_name,
        "task": task_name,
        "date": today_iso,
        "time": now.strftime("%H:%M:%S"),
        "timestamp": now.isoformat(timespec="seconds"),
    })
    _save_state(st)
    cleaning_refresh_today()
    log.info(f"Cleaning task completed: {room_name} / {task_name} at {now.isoformat(timespec='seconds')}")


@service
def cleaning_mark_undone(task_id=None):
    """Undo today's completion for a task (accidental tick)."""
    if not task_id:
        return
    st = _load_state()
    today_iso = date.today().isoformat()
    tstate = st["tasks"].get(task_id)
    if tstate and tstate.get("last_done") == today_iso:
        tstate["last_done"] = None
        tstate["done_this_month"] = max(0, tstate.get("done_this_month", 1) - 1)
        st["log"] = [e for e in st["log"] if not (e["task_id"] == task_id and e["date"] == today_iso)]
        _save_state(st)
    cleaning_refresh_today()


@service
def cleaning_speak_task(task_id=None, media_player=None):
    """Read a task's name aloud via TTS on the given media_player."""
    if not task_id or not media_player:
        log.error("cleaning_speak_task requires task_id and media_player")
        return
    config = _load_config()
    task_name = None
    for room, task in _all_tasks(config):
        if task["id"] == task_id:
            task_name = task["name"]
            break
    if not task_name:
        return
    tts.speak(entity_id=media_player, media_player_entity_id=media_player, message=task_name)


@service
def cleaning_force_catchup():
    """Return every task not yet completed this calendar month."""
    config = _load_config()
    st = _load_state()
    month_key = date.today().strftime("%Y-%m")
    outstanding = []
    for room, task in _all_tasks(config):
        tstate = st["tasks"].get(task["id"], {})
        done = tstate.get("done_this_month", 0) if tstate.get("month_key") == month_key else 0
        required = task["count"] if task["unit"] == "month" else task["count"] * 4
        if done < required:
            outstanding.append({"room": room["name"], "task": task["name"], "done": done, "required": required})
    state.set("pyscript.cleaning_outstanding", str(len(outstanding)), {"items": outstanding})
    return outstanding


@service
def cleaning_generate_report(year=None, month=None):
    """Build an HTML report of every completed task with timestamps for a given month."""
    now = datetime.now()
    year = int(year) if year else now.year
    month = int(month) if month else now.month
    st = _load_state()

    entries = [e for e in st["log"] if e["date"].startswith(f"{year:04d}-{month:02d}")]
    entries.sort(key=lambda e: e["timestamp"])

    config = _load_config()
    total_tasks_required = 0
    for room, task in _all_tasks(config):
        total_tasks_required += task["count"] if task["unit"] == "month" else task["count"] * 4
    completion_pct = round(100 * len(entries) / total_tasks_required, 1) if total_tasks_required else 0

    os.makedirs(REPORT_DIR, exist_ok=True)
    rows = "\n".join(
        f"<tr><td>{e['date']}</td><td>{e['time']}</td><td>{e['room']}</td><td>{e['task']}</td></tr>"
        for e in entries
    )
    html = f"""<!doctype html><html><head><meta charset="utf-8">
<title>Cleaning Report {year}-{month:02d}</title>
<style>
body{{font-family:sans-serif;margin:2rem;background:#f7f7f7}}
h1{{font-size:1.4rem}} .summary{{margin-bottom:1rem;font-size:1.1rem}}
table{{border-collapse:collapse;width:100%;background:#fff}}
td,th{{border:1px solid #ddd;padding:8px;text-align:left}}
th{{background:#333;color:#fff}}
tr:nth-child(even){{background:#f2f2f2}}
</style></head><body>
<h1>Cleaning Completion Report &mdash; {calendar.month_name[month]} {year}</h1>
<div class="summary">Total logged completions: <b>{len(entries)}</b> of {total_tasks_required} required
&nbsp;(&asymp; {completion_pct}%)</div>
<table><tr><th>Date</th><th>Time</th><th>Room</th><th>Task</th></tr>
{rows}
</table>
</body></html>"""

    out_path = f"{REPORT_DIR}/report_{year:04d}-{month:02d}.html"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    state.set(
        "pyscript.cleaning_report",
        f"{completion_pct}%",
        {"path": f"/local/reports/report_{year:04d}-{month:02d}.html", "entries": len(entries), "required": total_tasks_required},
    )
    log.info(f"Cleaning report generated: {out_path}")
    return out_path


@time_trigger("cron(0 6 * * *)")
def cleaning_daily_refresh():
    """Recompute today's checklist automatically every morning at 06:00."""
    cleaning_refresh_today()
    cleaning_force_catchup()
