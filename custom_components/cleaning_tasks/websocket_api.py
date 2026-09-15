"""WebSocket commands backing the room/task editor card's search, add,
edit, and remove actions."""
from __future__ import annotations

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .manager import CleaningManager


def _manager(hass: HomeAssistant) -> CleaningManager:
    entry_id = next(iter(hass.data[DOMAIN]))
    return hass.data[DOMAIN][entry_id]


def _full_list(hass: HomeAssistant) -> dict:
    manager = _manager(hass)
    return {"rooms": manager.store.rooms(), "tasks": manager.store.tasks()}


async def _save(hass: HomeAssistant) -> None:
    await _manager(hass).store.async_save()


@websocket_api.websocket_command({vol.Required("type"): "cleaning_tasks/list"})
@websocket_api.async_response
async def handle_list(hass, connection, msg):
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/room/add",
    vol.Required("name"): str,
    vol.Optional("tracks_usage", default=False): bool,
})
@websocket_api.async_response
async def handle_room_add(hass, connection, msg):
    manager = _manager(hass)
    manager.add_room(msg["name"], msg["tracks_usage"])
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/room/update",
    vol.Required("room_id"): str,
    vol.Optional("name"): str,
    vol.Optional("tracks_usage"): bool,
})
@websocket_api.async_response
async def handle_room_update(hass, connection, msg):
    manager = _manager(hass)
    room = manager.update_room(msg["room_id"], msg.get("name"), msg.get("tracks_usage"))
    if room is None:
        connection.send_error(msg["id"], "not_found", "Room not found")
        return
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/room/remove",
    vol.Required("room_id"): str,
})
@websocket_api.async_response
async def handle_room_remove(hass, connection, msg):
    manager = _manager(hass)
    manager.remove_room(msg["room_id"])
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/task/add",
    vol.Required("room_id"): str,
    vol.Required("name"): str,
    vol.Optional("name_af", default=""): str,
    vol.Optional("name_xh", default=""): str,
    vol.Optional("unit", default="week"): vol.In(["week", "month"]),
    vol.Optional("count", default=1): int,
    vol.Optional("conditional_on_used", default=False): bool,
    vol.Optional("weather_dependent", default=False): bool,
})
@websocket_api.async_response
async def handle_task_add(hass, connection, msg):
    manager = _manager(hass)
    task = manager.add_task(
        msg["room_id"], msg["name"], msg["unit"], msg["count"], msg["conditional_on_used"],
        msg["name_af"], msg["name_xh"], msg["weather_dependent"],
    )
    if task is None:
        connection.send_error(msg["id"], "not_found", "Room not found")
        return
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/task/update",
    vol.Required("task_id"): str,
    vol.Optional("name"): str,
    vol.Optional("name_af"): str,
    vol.Optional("name_xh"): str,
    vol.Optional("unit"): vol.In(["week", "month"]),
    vol.Optional("count"): int,
    vol.Optional("conditional_on_used"): bool,
    vol.Optional("weather_dependent"): bool,
})
@websocket_api.async_response
async def handle_task_update(hass, connection, msg):
    manager = _manager(hass)
    fields = {k: v for k, v in msg.items() if k not in ("type", "id", "task_id")}
    task = manager.update_task(msg["task_id"], **fields)
    if task is None:
        connection.send_error(msg["id"], "not_found", "Task not found")
        return
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/task/remove",
    vol.Required("task_id"): str,
})
@websocket_api.async_response
async def handle_task_remove(hass, connection, msg):
    manager = _manager(hass)
    manager.remove_task(msg["task_id"])
    await _save(hass)
    connection.send_result(msg["id"], _full_list(hass))


@websocket_api.websocket_command({vol.Required("type"): "cleaning_tasks/languages/list"})
@websocket_api.async_response
async def handle_languages_list(hass, connection, msg):
    connection.send_result(msg["id"], {"enabled_languages": _manager(hass).store.enabled_languages()})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/languages/set",
    vol.Required("lang"): str,
    vol.Required("enabled"): bool,
})
@websocket_api.async_response
async def handle_languages_set(hass, connection, msg):
    enabled_languages = _manager(hass).set_language_enabled(msg["lang"], msg["enabled"])
    connection.send_result(msg["id"], {"enabled_languages": enabled_languages})


@websocket_api.websocket_command({vol.Required("type"): "cleaning_tasks/weather/get"})
@websocket_api.async_response
async def handle_weather_get(hass, connection, msg):
    connection.send_result(msg["id"], {
        "weather_entity": _manager(hass).store.weather_entity(),
        "available_entities": sorted(
            e for e in hass.states.async_entity_ids("weather")
        ),
    })


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): "cleaning_tasks/weather/set",
    vol.Optional("weather_entity", default=""): str,
})
@websocket_api.async_response
async def handle_weather_set(hass, connection, msg):
    entity_id = _manager(hass).set_weather_entity(msg["weather_entity"])
    connection.send_result(msg["id"], {"weather_entity": entity_id})


def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, handle_list)
    websocket_api.async_register_command(hass, handle_room_add)
    websocket_api.async_register_command(hass, handle_room_update)
    websocket_api.async_register_command(hass, handle_room_remove)
    websocket_api.async_register_command(hass, handle_task_add)
    websocket_api.async_register_command(hass, handle_task_update)
    websocket_api.async_register_command(hass, handle_task_remove)
    websocket_api.async_register_command(hass, handle_languages_list)
    websocket_api.async_register_command(hass, handle_languages_set)
    websocket_api.async_register_command(hass, handle_weather_get)
    websocket_api.async_register_command(hass, handle_weather_set)
