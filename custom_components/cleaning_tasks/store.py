"""Persistent storage for rooms/tasks, using HA's own Store helper.

This is deliberately NOT raw file I/O - Store is the async, debounced,
crash-safe JSON persistence every core HA integration uses under
/config/.storage/. An earlier pyscript-based version of this project hit
repeated, hard-to-debug bugs trying to do its own file I/O from inside
pyscript's AST-transformed execution model; Store sidesteps that class of
bug entirely.
"""
from __future__ import annotations

import re
import uuid
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DEFAULT_ENABLED_LANGUAGES, LANGUAGES, STORAGE_KEY, STORAGE_VERSION, WEEKDAYS

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(text: str) -> str:
    slug = _SLUG_RE.sub("_", text.strip().lower()).strip("_")
    return slug or uuid.uuid4().hex[:8]


def _default_data() -> dict[str, Any]:
    return {
        "rooms": [],
        "tasks": [],
        "cleaning_days": {day: False for day in WEEKDAYS},
        "room_used": {},
        "display_language": LANGUAGES[0],
        "enabled_languages": list(DEFAULT_ENABLED_LANGUAGES),
        "voice_names": {lang: "" for lang in LANGUAGES},
        "weather_entity": "",
    }


class CleaningTasksStore:
    """In-memory model backed by a HA Store, with CRUD helpers."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store = Store(hass, STORAGE_VERSION, STORAGE_KEY)
        self.data: dict[str, Any] = _default_data()

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if stored:
            merged = _default_data()
            merged.update(stored)
            merged["cleaning_days"] = {**merged["cleaning_days"], **stored.get("cleaning_days", {})}
            merged["voice_names"] = {**merged["voice_names"], **stored.get("voice_names", {})}
            stored_enabled = stored.get("enabled_languages")
            if stored_enabled:
                merged["enabled_languages"] = [lang for lang in LANGUAGES if lang in stored_enabled]
            self.data = merged

    async def async_save(self) -> None:
        await self._store.async_save(self.data)

    # ---------- rooms ----------

    def rooms(self) -> list[dict]:
        return self.data["rooms"]

    def get_room(self, room_id: str) -> dict | None:
        return next((r for r in self.data["rooms"] if r["id"] == room_id), None)

    def _unique_room_id(self, name: str) -> str:
        base = _slugify(name)
        existing = {r["id"] for r in self.data["rooms"]}
        candidate = base
        i = 2
        while candidate in existing:
            candidate = f"{base}_{i}"
            i += 1
        return candidate

    def add_room(self, name: str, tracks_usage: bool = False) -> dict:
        room = {"id": self._unique_room_id(name), "name": name, "tracks_usage": tracks_usage}
        self.data["rooms"].append(room)
        return room

    def update_room(self, room_id: str, name: str | None = None, tracks_usage: bool | None = None) -> dict | None:
        room = self.get_room(room_id)
        if not room:
            return None
        if name is not None:
            room["name"] = name
        if tracks_usage is not None:
            room["tracks_usage"] = tracks_usage
            if not tracks_usage:
                self.data["room_used"].pop(room_id, None)
        return room

    def remove_room(self, room_id: str) -> list[str]:
        """Remove a room and all its tasks. Returns removed task ids."""
        self.data["rooms"] = [r for r in self.data["rooms"] if r["id"] != room_id]
        removed_ids = [t["id"] for t in self.data["tasks"] if t["room_id"] == room_id]
        self.data["tasks"] = [t for t in self.data["tasks"] if t["room_id"] != room_id]
        self.data["room_used"].pop(room_id, None)
        return removed_ids

    # ---------- tasks ----------

    def tasks(self) -> list[dict]:
        return self.data["tasks"]

    def get_task(self, task_id: str) -> dict | None:
        return next((t for t in self.data["tasks"] if t["id"] == task_id), None)

    def _unique_task_id(self, room_id: str, name: str) -> str:
        base = f"{room_id}_{_slugify(name)}"
        existing = {t["id"] for t in self.data["tasks"]}
        candidate = base
        i = 2
        while candidate in existing:
            candidate = f"{base}_{i}"
            i += 1
        return candidate

    def add_task(
        self,
        room_id: str,
        name: str,
        unit: str = "week",
        count: int = 1,
        conditional_on_used: bool = False,
        name_af: str = "",
        name_xh: str = "",
        weather_dependent: bool = False,
    ) -> dict | None:
        if not self.get_room(room_id):
            return None
        task = {
            "id": self._unique_task_id(room_id, name),
            "room_id": room_id,
            "name": name,
            "name_af": name_af,
            "name_xh": name_xh,
            "unit": unit,
            "count": count,
            "conditional_on_used": conditional_on_used,
            "weather_dependent": weather_dependent,
            "last_done": None,
        }
        self.data["tasks"].append(task)
        return task

    def update_task(self, task_id: str, **fields: Any) -> dict | None:
        task = self.get_task(task_id)
        if not task:
            return None
        for key in (
            "name", "name_af", "name_xh", "unit", "count",
            "conditional_on_used", "weather_dependent",
        ):
            if key in fields and fields[key] is not None:
                task[key] = fields[key]
        return task

    def remove_task(self, task_id: str) -> bool:
        before = len(self.data["tasks"])
        self.data["tasks"] = [t for t in self.data["tasks"] if t["id"] != task_id]
        return len(self.data["tasks"]) != before

    # ---------- enabled languages (admin picks which show on the kiosk) ----------

    def enabled_languages(self) -> list[str]:
        return self.data.get("enabled_languages", list(DEFAULT_ENABLED_LANGUAGES))

    def set_language_enabled(self, lang: str, enabled: bool) -> list[str]:
        if lang not in LANGUAGES:
            return self.enabled_languages()
        current = self.enabled_languages()
        if enabled and lang not in current:
            current = [l for l in LANGUAGES if l in current or l == lang]
        elif not enabled and lang in current:
            current = [l for l in current if l != lang]
        if not current:
            current = ["English"]
        self.data["enabled_languages"] = current
        return current

    # ---------- weather-aware scheduling ----------

    def weather_entity(self) -> str:
        return self.data.get("weather_entity", "")

    def set_weather_entity(self, entity_id: str) -> str:
        self.data["weather_entity"] = (entity_id or "").strip()
        return self.data["weather_entity"]

    # ---------- CSV ----------

    CSV_FIELDS = [
        "room_id", "room_name", "room_tracks_usage",
        "task_id", "task_name", "task_name_af", "task_name_xh",
        "unit", "count", "conditional_on_used", "weather_dependent",
    ]

    def to_csv_rows(self) -> list[dict]:
        rooms_by_id = {r["id"]: r for r in self.data["rooms"]}
        rows = []
        for task in self.data["tasks"]:
            room = rooms_by_id.get(task["room_id"], {})
            rows.append({
                "room_id": task["room_id"],
                "room_name": room.get("name", ""),
                "room_tracks_usage": room.get("tracks_usage", False),
                "task_id": task["id"],
                "task_name": task["name"],
                "task_name_af": task.get("name_af", ""),
                "task_name_xh": task.get("name_xh", ""),
                "unit": task["unit"],
                "count": task["count"],
                "conditional_on_used": task["conditional_on_used"],
                "weather_dependent": task.get("weather_dependent", False),
            })
        return rows

    def replace_from_csv_rows(self, rows: list[dict]) -> None:
        """Rebuild rooms/tasks from CSV rows (upsert by room_id/task_id when
        present, else generate fresh ids from the names). Rooms/tasks not
        present in the import are dropped - the import is treated as the
        new full picture, matching what "export, edit, reimport" implies."""
        old_last_done = {t["id"]: t.get("last_done") for t in self.data["tasks"]}

        rooms: dict[str, dict] = {}
        tasks: list[dict] = []
        for row in rows:
            room_name = (row.get("room_name") or "").strip()
            if not room_name:
                continue
            room_id = (row.get("room_id") or "").strip() or _slugify(room_name)
            tracks_usage = str(row.get("room_tracks_usage", "")).strip().lower() in ("1", "true", "yes")
            if room_id not in rooms:
                rooms[room_id] = {"id": room_id, "name": room_name, "tracks_usage": tracks_usage}

            task_name = (row.get("task_name") or "").strip()
            if not task_name:
                continue
            task_id = (row.get("task_id") or "").strip() or f"{room_id}_{_slugify(task_name)}"
            unit = (row.get("unit") or "week").strip() or "week"
            try:
                count = int(row.get("count") or 1)
            except ValueError:
                count = 1
            conditional_on_used = str(row.get("conditional_on_used", "")).strip().lower() in ("1", "true", "yes")
            weather_dependent = str(row.get("weather_dependent", "")).strip().lower() in ("1", "true", "yes")
            tasks.append({
                "id": task_id,
                "room_id": room_id,
                "name": task_name,
                "name_af": (row.get("task_name_af") or "").strip(),
                "name_xh": (row.get("task_name_xh") or "").strip(),
                "unit": unit,
                "count": count,
                "conditional_on_used": conditional_on_used,
                "weather_dependent": weather_dependent,
                "last_done": old_last_done.get(task_id),
            })

        self.data["rooms"] = list(rooms.values())
        self.data["tasks"] = tasks
        valid_room_ids = set(rooms.keys())
        self.data["room_used"] = {
            rid: val for rid, val in self.data["room_used"].items() if rid in valid_room_ids
        }
