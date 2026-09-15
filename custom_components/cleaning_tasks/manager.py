"""Runtime manager: owns the store, the live entities, and the due/done
logic (ported from the old pyscript cleaning_manager.py, now plain Python
running inside the integration instead of pyscript's AST-transformed
execution model - no more blocking-I/O or task.executor workarounds needed,
since entity state IS the storage here, and the only file write is through
HA's own async Store).
"""
from __future__ import annotations

import calendar
import logging
from datetime import date
from typing import Any, Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change

from .const import WEEKDAYS
from .store import CleaningTasksStore

_LOGGER = logging.getLogger(__name__)


def _target_interval_days(task: dict) -> float:
    if task["unit"] == "month":
        return 30.4 / max(task["count"], 1)
    return 7.0 / max(task["count"], 1)


class CleaningManager:
    """Coordinates the store, task/day/room-used switch entities, and the
    daily due/done recompute."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.store = CleaningTasksStore(hass)
        self.day_entities: dict[str, Any] = {}
        self.room_used_entities: dict[str, Any] = {}
        self.task_entities: dict[str, Any] = {}
        self.voice_entity: Any = None
        self._add_switch_entities: Callable | None = None
        self._add_text_entities: Callable | None = None
        self._unsubs: list[Callable] = []

    async def async_load(self) -> None:
        await self.store.async_load()

    def register_switch_adder(self, add_entities: Callable) -> None:
        self._add_switch_entities = add_entities

    def register_text_adder(self, add_entities: Callable) -> None:
        self._add_text_entities = add_entities

    # ---------- entity lifecycle ----------

    def async_build_initial_entities(self) -> None:
        from .switch import CleaningDaySwitch, CleaningRoomUsedSwitch, CleaningTaskSwitch
        from .text import CleaningVoiceText

        day_switches = []
        for day in WEEKDAYS:
            entity = CleaningDaySwitch(self, day)
            self.day_entities[day] = entity
            day_switches.append(entity)

        room_used_switches = []
        for room in self.store.rooms():
            if room.get("tracks_usage"):
                entity = CleaningRoomUsedSwitch(self, room["id"])
                self.room_used_entities[room["id"]] = entity
                room_used_switches.append(entity)

        task_switches = []
        for task in self.store.tasks():
            entity = CleaningTaskSwitch(self, task["id"])
            self.task_entities[task["id"]] = entity
            task_switches.append(entity)

        if self._add_switch_entities:
            self._add_switch_entities(day_switches + room_used_switches + task_switches)

        self.voice_entity = CleaningVoiceText(self)
        if self._add_text_entities:
            self._add_text_entities([self.voice_entity])

    async def async_start(self) -> None:
        self._unsubs.append(
            async_track_time_change(self.hass, self._handle_daily_refresh, hour=6, minute=0, second=0)
        )
        self.refresh_today()

    def async_stop(self) -> None:
        for unsub in self._unsubs:
            unsub()
        self._unsubs.clear()

    @callback
    def _handle_daily_refresh(self, now) -> None:
        self.refresh_today()

    # ---------- room/task CRUD, wired to entity add/remove ----------

    def add_room(self, name: str, tracks_usage: bool) -> dict:
        room = self.store.add_room(name, tracks_usage)
        if tracks_usage:
            from .switch import CleaningRoomUsedSwitch

            entity = CleaningRoomUsedSwitch(self, room["id"])
            self.room_used_entities[room["id"]] = entity
            if self._add_switch_entities:
                self._add_switch_entities([entity])
        return room

    def update_room(self, room_id: str, name: str | None, tracks_usage: bool | None) -> dict | None:
        was_tracked = room_id in self.room_used_entities
        room = self.store.update_room(room_id, name, tracks_usage)
        if room is None:
            return None
        now_tracked = bool(room.get("tracks_usage"))
        if now_tracked and not was_tracked:
            from .switch import CleaningRoomUsedSwitch

            entity = CleaningRoomUsedSwitch(self, room_id)
            self.room_used_entities[room_id] = entity
            if self._add_switch_entities:
                self._add_switch_entities([entity])
        elif was_tracked and not now_tracked:
            self._remove_entity(self.room_used_entities.pop(room_id, None))
        return room

    def remove_room(self, room_id: str) -> None:
        removed_task_ids = self.store.remove_room(room_id)
        for task_id in removed_task_ids:
            self._remove_entity(self.task_entities.pop(task_id, None))
        self._remove_entity(self.room_used_entities.pop(room_id, None))

    def add_task(
        self,
        room_id: str,
        name: str,
        unit: str,
        count: int,
        conditional_on_used: bool,
        name_af: str = "",
        name_xh: str = "",
    ) -> dict | None:
        task = self.store.add_task(room_id, name, unit, count, conditional_on_used, name_af, name_xh)
        if task is None:
            return None
        from .switch import CleaningTaskSwitch

        entity = CleaningTaskSwitch(self, task["id"])
        self.task_entities[task["id"]] = entity
        if self._add_switch_entities:
            self._add_switch_entities([entity])
        self.refresh_today()
        return task

    def update_task(self, task_id: str, **fields: Any) -> dict | None:
        task = self.store.update_task(task_id, **fields)
        if task is None:
            return None
        entity = self.task_entities.get(task_id)
        if entity is not None:
            entity.async_write_ha_state()
        self.refresh_today()
        return task

    def remove_task(self, task_id: str) -> None:
        if self.store.remove_task(task_id):
            self._remove_entity(self.task_entities.pop(task_id, None))

    def _remove_entity(self, entity) -> None:
        if entity is None:
            return

        async def _do_remove() -> None:
            entity_id = entity.entity_id
            await entity.async_remove(force_remove=True)
            if entity_id:
                from homeassistant.helpers import entity_registry as er

                registry = er.async_get(self.hass)
                if registry.async_get(entity_id):
                    registry.async_remove(entity_id)

        self.hass.async_create_task(_do_remove())

    def import_csv_rows(self, rows: list[dict]) -> None:
        self.store.replace_from_csv_rows(rows)
        self._resync_entities()
        self.refresh_today()

    def _resync_entities(self) -> None:
        """After a bulk change (CSV import), reconcile the live entity set
        with the store from scratch."""
        from .switch import CleaningRoomUsedSwitch, CleaningTaskSwitch

        wanted_room_ids = {r["id"] for r in self.store.rooms() if r.get("tracks_usage")}
        for room_id in list(self.room_used_entities):
            if room_id not in wanted_room_ids:
                self._remove_entity(self.room_used_entities.pop(room_id, None))
        new_room_switches = []
        for room_id in wanted_room_ids:
            if room_id not in self.room_used_entities:
                entity = CleaningRoomUsedSwitch(self, room_id)
                self.room_used_entities[room_id] = entity
                new_room_switches.append(entity)

        wanted_task_ids = {t["id"] for t in self.store.tasks()}
        for task_id in list(self.task_entities):
            if task_id not in wanted_task_ids:
                self._remove_entity(self.task_entities.pop(task_id, None))
        new_task_switches = []
        for task_id in wanted_task_ids:
            if task_id not in self.task_entities:
                entity = CleaningTaskSwitch(self, task_id)
                self.task_entities[task_id] = entity
                new_task_switches.append(entity)

        if self._add_switch_entities and (new_room_switches or new_task_switches):
            self._add_switch_entities(new_room_switches + new_task_switches)

    # ---------- due/done logic ----------

    def is_cleaning_day(self, weekday: int) -> bool:
        entity = self.day_entities.get(WEEKDAYS[weekday])
        return bool(entity and entity.is_on)

    def is_room_used(self, room_id: str) -> bool:
        entity = self.room_used_entities.get(room_id)
        return bool(entity and entity.is_on)

    def _is_due(self, task: dict, today: date, days_left_in_month: int) -> bool:
        if task.get("conditional_on_used"):
            return self.is_room_used(task["room_id"])
        interval = _target_interval_days(task)
        last_done = task.get("last_done")
        if not last_done:
            return True
        try:
            last_done_date = date.fromisoformat(last_done)
        except ValueError:
            return True
        days_since = (today - last_done_date).days
        if days_since >= interval:
            return True
        if task["unit"] == "month" and last_done_date.month != today.month and days_left_in_month <= 3:
            return True
        return False

    def refresh_today(self) -> None:
        today = date.today()
        today_iso = today.isoformat()
        days_left_in_month = calendar.monthrange(today.year, today.month)[1] - today.day
        cleaning_today = self.is_cleaning_day(today.weekday())

        for task in self.store.tasks():
            entity = self.task_entities.get(task["id"])
            if entity is None:
                continue
            done_today = task.get("last_done") == today_iso
            due_today = cleaning_today and (self._is_due(task, today, days_left_in_month) or done_today)
            entity.set_state(due=due_today, done=done_today)

    def mark_done(self, task_id: str) -> None:
        task = self.store.get_task(task_id)
        if not task:
            return
        task["last_done"] = date.today().isoformat()
        self.hass.async_create_task(self.store.async_save())
        if task.get("conditional_on_used"):
            room_entity = self.room_used_entities.get(task["room_id"])
            if room_entity is not None:
                room_entity.set_state(on=False)
        self.refresh_today()

    def mark_undone(self, task_id: str) -> None:
        task = self.store.get_task(task_id)
        if not task:
            return
        if task.get("last_done") == date.today().isoformat():
            task["last_done"] = None
            self.hass.async_create_task(self.store.async_save())
        self.refresh_today()

    def reset_today(self) -> None:
        today_iso = date.today().isoformat()
        changed = False
        for task in self.store.tasks():
            if task.get("last_done") == today_iso:
                task["last_done"] = None
                changed = True
        if changed:
            self.hass.async_create_task(self.store.async_save())
        self.refresh_today()

    def on_day_or_room_used_changed(self) -> None:
        self.hass.async_create_task(self.store.async_save())
        self.refresh_today()
