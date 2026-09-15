"""Switch entities: one per task (done today?), one per cleaning day, one
per usage-tracked room (used since last clean?)."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, WEEKDAY_LABELS
from .manager import CleaningManager


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager: CleaningManager = hass.data[DOMAIN][entry.entry_id]
    manager.register_switch_adder(async_add_entities)


class CleaningDaySwitch(SwitchEntity):
    """On = the cleaner comes this day of the week."""

    _attr_should_poll = False
    _attr_icon = "mdi:calendar-check"

    def __init__(self, manager: CleaningManager, day: str) -> None:
        self._manager = manager
        self._day = day
        self._attr_unique_id = f"{DOMAIN}_day_{day}"
        self.entity_id = f"switch.cleaning_day_{day}"
        self._attr_name = f"Cleaner comes {WEEKDAY_LABELS[day]}"
        self._is_on = manager.store.data["cleaning_days"].get(day, False)

    @property
    def is_on(self) -> bool:
        return self._is_on

    def set_state(self, on: bool) -> None:
        self._is_on = on
        self._manager.store.data["cleaning_days"][self._day] = on
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        self.set_state(True)
        self._manager.on_day_or_room_used_changed()

    async def async_turn_off(self, **kwargs) -> None:
        self.set_state(False)
        self._manager.on_day_or_room_used_changed()


class CleaningRoomUsedSwitch(SwitchEntity):
    """On = this room was used since it was last cleaned - drives its
    conditional_on_used tasks (change linen, clean the braai, ...)."""

    _attr_should_poll = False
    _attr_icon = "mdi:alert-circle-check-outline"

    def __init__(self, manager: CleaningManager, room_id: str) -> None:
        self._manager = manager
        self._room_id = room_id
        self._attr_unique_id = f"{DOMAIN}_room_used_{room_id}"
        self.entity_id = f"switch.cleaning_room_used_{room_id}"
        self._is_on = manager.store.data["room_used"].get(room_id, False)

    @property
    def name(self) -> str:
        room = self._manager.store.get_room(self._room_id)
        room_name = room["name"] if room else self._room_id
        return f"{room_name} was used since last clean"

    @property
    def is_on(self) -> bool:
        return self._is_on

    @property
    def extra_state_attributes(self) -> dict:
        return {"room_id": self._room_id}

    def set_state(self, on: bool) -> None:
        self._is_on = on
        self._manager.store.data["room_used"][self._room_id] = on
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        self.set_state(True)
        self._manager.on_day_or_room_used_changed()

    async def async_turn_off(self, **kwargs) -> None:
        self.set_state(False)
        self._manager.on_day_or_room_used_changed()


class CleaningTaskSwitch(SwitchEntity):
    """On = done today. The `due` attribute (not the state) is what the
    kiosk card uses to decide whether to show the row at all today."""

    _attr_should_poll = False
    _attr_icon = "mdi:broom"

    def __init__(self, manager: CleaningManager, task_id: str) -> None:
        self._manager = manager
        self._task_id = task_id
        self._attr_unique_id = f"{DOMAIN}_task_{task_id}"
        self.entity_id = f"switch.cleaning_task_{task_id}"
        self._due = False
        self._done = False

    @property
    def _task(self) -> dict:
        return self._manager.store.get_task(self._task_id) or {}

    @property
    def name(self) -> str:
        task = self._task
        room = self._manager.store.get_room(task.get("room_id", ""))
        room_name = room["name"] if room else task.get("room_id", "")
        return f"{room_name} - {task.get('name', self._task_id)}"

    @property
    def is_on(self) -> bool:
        return self._done

    @property
    def extra_state_attributes(self) -> dict:
        task = self._task
        room = self._manager.store.get_room(task.get("room_id", ""))
        return {
            "task_id": self._task_id,
            "task_name": task.get("name"),
            "task_name_af": task.get("name_af", ""),
            "task_name_xh": task.get("name_xh", ""),
            "room": room["name"] if room else task.get("room_id"),
            "room_id": task.get("room_id"),
            "unit": task.get("unit"),
            "count": task.get("count"),
            "conditional_on_used": task.get("conditional_on_used", False),
            "last_done": task.get("last_done"),
            "due": self._due,
        }

    def set_state(self, due: bool, done: bool) -> None:
        self._due = due
        self._done = done
        if self.hass is not None:
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        self._manager.mark_done(self._task_id)

    async def async_turn_off(self, **kwargs) -> None:
        self._manager.mark_undone(self._task_id)
