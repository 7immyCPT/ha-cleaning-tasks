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
from datetime import date, timedelta
from typing import Any, Callable

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_track_state_change_event, async_track_time_change

from .const import (
    BAD_WEATHER_CONDITIONS,
    BAD_WEATHER_PRECIPITATION_PROBABILITY,
    WEATHER_GRACE_DAYS,
    WEEKDAYS,
)
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
        self.language_entity: Any = None
        self._add_switch_entities: Callable | None = None
        self._add_text_entities: Callable | None = None
        self._unsubs: list[Callable] = []
        self._forecast_date: date | None = None
        self._forecast_cache: list[dict] = []

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
        weather_dependent: bool = False,
    ) -> dict | None:
        task = self.store.add_task(
            room_id, name, unit, count, conditional_on_used, name_af, name_xh, weather_dependent,
        )
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

    # ---------- schedule balancing ----------

    @staticmethod
    def _slot_kind(task: dict) -> str | None:
        """Weekly and monthly (once-per) tasks get a fixed slot so they
        spread evenly over the cleaning days instead of all landing on
        whichever day they were last done (or, never done, all on the next
        cleaning day). Anything more frequent already happens every
        cleaning day or close to it."""
        if task.get("conditional_on_used") or task.get("count") != 1:
            return None
        return {"week": "weekly", "month": "monthly"}.get(task.get("unit"))

    def _slot_valid(self, task: dict, cleaning_days: list[str]) -> bool:
        slot = task.get("slot") or {}
        if slot.get("day") not in cleaning_days:
            return False
        if self._slot_kind(task) == "monthly":
            return slot.get("week") in (1, 2, 3, 4)
        return True

    def ensure_slots(self, rebalance: bool = False) -> bool:
        """Give every weekly/monthly task a valid slot, filling the lightest
        day (weekly) or week+day (monthly) first. A room's unslotted tasks
        are placed together, so the cleaner does a room in one go. Existing
        valid slots are kept unless rebalancing. Returns True if anything
        changed."""
        if not self.day_entities:
            return False  # not set up yet - every slot would look invalid
        cleaning_days = [d for i, d in enumerate(WEEKDAYS) if self.is_cleaning_day(i)]
        changed = False
        for task in self.store.tasks():
            kind = self._slot_kind(task)
            if (rebalance or kind is None or not self._slot_valid(task, cleaning_days)) and "slot" in task:
                del task["slot"]
                changed = True
        if not cleaning_days:
            return changed

        weekly_load = {d: 0 for d in cleaning_days}
        monthly_load = {(w, d): 0 for w in (1, 2, 3, 4) for d in cleaning_days}
        pending: dict[str, dict[str, list[dict]]] = {"weekly": {}, "monthly": {}}
        for task in self.store.tasks():
            kind = self._slot_kind(task)
            if kind is None:
                continue
            slot = task.get("slot")
            if slot is None:
                pending[kind].setdefault(task["room_id"], []).append(task)
            elif kind == "weekly":
                weekly_load[slot["day"]] += 1
            else:
                monthly_load[(slot["week"], slot["day"])] += 1

        def biggest_rooms_first(groups: dict[str, list[dict]]) -> list[list[dict]]:
            return [groups[r] for r in sorted(groups, key=lambda r: (-len(groups[r]), r))]

        for tasks in biggest_rooms_first(pending["weekly"]):
            day = min(cleaning_days, key=lambda d: weekly_load[d])
            for task in tasks:
                task["slot"] = {"day": day}
            weekly_load[day] += len(tasks)
            changed = True
        # Monthly slots sit on top of that day's weekly load.
        for tasks in biggest_rooms_first(pending["monthly"]):
            week, day = min(monthly_load, key=lambda k: monthly_load[k] + weekly_load[k[1]])
            for task in tasks:
                task["slot"] = {"day": day, "week": week}
            monthly_load[(week, day)] += len(tasks)
            changed = True

        if changed:
            self.hass.async_create_task(self.store.async_save())
        return changed

    def _is_due_slotted(self, task: dict, today: date) -> bool:
        slot = task["slot"]
        on_slot = WEEKDAYS[today.weekday()] == slot["day"]
        monthly = self._slot_kind(task) == "monthly"
        if monthly:
            on_slot = on_slot and (today.day - 1) // 7 + 1 == slot["week"]
        last_done = task.get("last_done")
        try:
            days_since = (today - date.fromisoformat(last_done)).days if last_done else None
        except ValueError:
            days_since = None
        if days_since is None:
            return on_slot
        # On its slot: due unless it was done very recently (e.g. caught up
        # on another day). Missed its slot: due on any cleaning day once
        # it's clearly overdue, rather than skipping a whole cycle.
        interval = _target_interval_days(task)
        if on_slot and days_since >= (14 if monthly else interval / 2):
            return True
        return days_since >= interval + (7 if monthly else 3)

    def _is_due(self, task: dict, today: date, days_left_in_month: int) -> bool:
        if task.get("conditional_on_used"):
            return self.is_room_used(task["room_id"])
        if task.get("slot"):
            return self._is_due_slotted(task, today)
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
        # Cleaning only happens on some weekdays, so the exact interval
        # usually falls between two cleaning days - e.g. a 2x/week task
        # (3.5 days) with Mon/Wed cleaning would otherwise never be due on
        # Wednesday and quietly become weekly. Do it now if that's closer to
        # the target interval than waiting for the next cleaning day.
        days_early_now = interval - days_since
        days_late_if_wait = days_since + self._days_to_next_cleaning_day(today) - interval
        return days_early_now < days_late_if_wait

    def _days_to_next_cleaning_day(self, from_date: date) -> int:
        for gap in range(1, 8):
            if self.is_cleaning_day((from_date.weekday() + gap) % 7):
                return gap
        return 7

    # ---------- weather-aware scheduling ----------

    async def _async_get_forecast(self) -> list[dict]:
        entity_id = self.store.weather_entity()
        if not entity_id:
            return []
        today = date.today()
        if self._forecast_date == today:
            return self._forecast_cache
        forecast: list[dict] = []
        try:
            result = await self.hass.services.async_call(
                "weather", "get_forecasts", {"entity_id": entity_id, "type": "daily"},
                blocking=True, return_response=True,
            )
            forecast = (result or {}).get(entity_id, {}).get("forecast", [])
        except Exception:  # noqa: BLE001 - forecast is best-effort, never block scheduling
            _LOGGER.warning("cleaning_tasks: failed to fetch weather forecast from %s", entity_id, exc_info=True)
        self._forecast_cache = forecast
        self._forecast_date = today
        return forecast

    def _bad_weather_by_date(self, forecast: list[dict]) -> dict[str, bool]:
        result: dict[str, bool] = {}
        for entry in forecast:
            dt = entry.get("datetime") or ""
            day = dt[:10]
            if not day:
                continue
            condition = (entry.get("condition") or "").lower()
            precip_prob = entry.get("precipitation_probability")
            bad = condition in BAD_WEATHER_CONDITIONS or (
                precip_prob is not None and precip_prob >= BAD_WEATHER_PRECIPITATION_PROBABILITY
            )
            result[day] = bad
        return result

    def _due_date(self, task: dict, today: date) -> date:
        last_done = task.get("last_done")
        if not last_done:
            return today
        try:
            last_done_date = date.fromisoformat(last_done)
        except ValueError:
            return today
        return last_done_date + timedelta(days=_target_interval_days(task))

    def _should_defer_for_weather(self, task: dict, today: date, bad_by_date: dict[str, bool]) -> bool:
        """True if a weather-dependent task that's otherwise due today should
        wait for a drier upcoming cleaning day instead - as long as it hasn't
        already been waiting more than WEATHER_GRACE_DAYS."""
        if not bad_by_date or not bad_by_date.get(today.isoformat(), False):
            return False
        days_overdue = (today - self._due_date(task, today)).days
        remaining_grace = WEATHER_GRACE_DAYS - max(days_overdue, 0)
        if remaining_grace <= 0:
            return False
        for offset in range(1, remaining_grace + 1):
            future = today + timedelta(days=offset)
            if not self.is_cleaning_day(future.weekday()):
                continue
            if not bad_by_date.get(future.isoformat(), True):
                return True
        return False

    def refresh_today(self) -> None:
        self.hass.async_create_task(self.async_refresh_today())

    async def async_refresh_today(self) -> None:
        # Cheap no-op once every task has a valid slot; picks up new tasks,
        # frequency edits, CSV imports and cleaning-day changes.
        self.ensure_slots()
        today = date.today()
        today_iso = today.isoformat()
        days_left_in_month = calendar.monthrange(today.year, today.month)[1] - today.day
        cleaning_today = self.is_cleaning_day(today.weekday())
        bad_by_date = self._bad_weather_by_date(await self._async_get_forecast())

        for task in self.store.tasks():
            entity = self.task_entities.get(task["id"])
            if entity is None:
                continue
            done_today = task.get("last_done") == today_iso
            due_today = cleaning_today and (self._is_due(task, today, days_left_in_month) or done_today)
            weather_deferred = False
            if due_today and not done_today and task.get("weather_dependent"):
                if self._should_defer_for_weather(task, today, bad_by_date):
                    due_today = False
                    weather_deferred = True
            entity.set_state(due=due_today, done=done_today, weather_deferred=weather_deferred)

    def _preview_due_tasks(self, target: date, bad_by_date: dict[str, bool]) -> list[dict]:
        """Which tasks would be due on `target` given how things stand
        right now - used for browsing the rest of the week, not for
        ticking anything off. Two things this can't truly predict: a
        conditional_on_used task's room might get flagged used/unused
        between now and then (shown using today's current flag, as the
        best available guess), and a weather forecast this far out may not
        exist yet for every provider (falls back to not deferring)."""
        days_left_in_month = calendar.monthrange(target.year, target.month)[1] - target.day
        results = []
        for task in self.store.tasks():
            # A task done on this exact day is no longer "due" by
            # last_done, but still belongs on that day's list (shown done) -
            # otherwise a past day empties out as it gets ticked off.
            done_that_day = task.get("last_done") == target.isoformat()
            if not done_that_day and not self._is_due(task, target, days_left_in_month):
                continue
            weather_deferred = bool(
                task.get("weather_dependent") and self._should_defer_for_weather(task, target, bad_by_date)
            )
            room = self.store.get_room(task["room_id"])
            last_done = task.get("last_done")
            results.append({
                "task_id": task["id"],
                "task_name": task["name"],
                "room": room["name"] if room else task["room_id"],
                "conditional_on_used": task.get("conditional_on_used", False),
                "weather_deferred": weather_deferred,
                "done": bool(last_done and last_done >= target.isoformat()),
            })
        return results

    async def async_week_preview(self) -> list[dict]:
        """7 days back through 7 days forward (today included): which tasks
        would be due on each, for the kiosk card's day-by-day browsing.
        Read-only - nothing here marks anything done, and a past day is the
        same due-schedule preview as a future one, not an actual
        completion record (last_done only keeps the most recent
        completion, not a full history, so "was this exact task done on
        that exact day" genuinely isn't knowable from current data)."""
        self.ensure_slots()
        today = date.today()
        bad_by_date = self._bad_weather_by_date(await self._async_get_forecast())
        days = []
        for offset in range(-7, 8):
            target = today + timedelta(days=offset)
            is_cleaning_day = self.is_cleaning_day(target.weekday())
            days.append({
                "offset": offset,
                "date": target.isoformat(),
                "weekday": WEEKDAYS[target.weekday()],
                "is_cleaning_day": is_cleaning_day,
                "tasks": self._preview_due_tasks(target, bad_by_date) if is_cleaning_day else [],
            })
        return days

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

    def mark_done_for_date(self, task_id: str, target_date_iso: str, done: bool = True) -> None:
        """Catch-up marking for a past (or today's) preview day - e.g. "I
        forgot to tick this off on the 21st". Only ever moves last_done
        forward (never regresses a task that's already been completed more
        recently than target_date_iso), and undoing only clears last_done
        if it exactly matches target_date_iso - there's no history to fall
        back to otherwise. Doesn't apply to future days; the frontend
        doesn't offer this for those, since nothing there has happened
        yet."""
        task = self.store.get_task(task_id)
        if not task:
            return
        current = task.get("last_done")
        changed = False
        if done:
            if not current or target_date_iso > current:
                task["last_done"] = target_date_iso
                changed = True
        else:
            if current == target_date_iso:
                task["last_done"] = None
                changed = True
        if changed:
            self.hass.async_create_task(self.store.async_save())
            if done and task.get("conditional_on_used"):
                room_entity = self.room_used_entities.get(task["room_id"])
                if room_entity is not None:
                    room_entity.set_state(on=False)
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

    def set_language_enabled(self, lang: str, enabled: bool) -> list[str]:
        result = self.store.set_language_enabled(lang, enabled)
        if self.language_entity is not None:
            self.language_entity.async_write_ha_state()
        self.hass.async_create_task(self.store.async_save())
        return result

    def set_weather_entity(self, entity_id: str) -> str:
        result = self.store.set_weather_entity(entity_id)
        self._forecast_date = None
        self.hass.async_create_task(self.store.async_save())
        self.refresh_today()
        return result

    def rebalance_schedule(self) -> None:
        self.ensure_slots(rebalance=True)
        self.refresh_today()

    def on_day_or_room_used_changed(self) -> None:
        self.hass.async_create_task(self.store.async_save())
        self.refresh_today()
