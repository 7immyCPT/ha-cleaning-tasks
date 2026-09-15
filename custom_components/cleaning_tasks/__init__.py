"""The Cleaning Tasks integration."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.components.http import StaticPathConfig
from homeassistant.components.frontend import add_extra_js_url
from homeassistant.const import Platform

from . import http_views, websocket_api
from .const import (
    ATTR_TASK_ID,
    DOMAIN,
    SERVICE_MARK_DONE,
    SERVICE_MARK_UNDONE,
    SERVICE_REFRESH_TODAY,
    SERVICE_RESET_TODAY,
)
from .manager import CleaningManager

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SWITCH, Platform.TEXT, Platform.SELECT]

FRONTEND_FILES = [
    "cleaning-today-card.js",
    "cleaning-task-editor-card.js",
    "cleaning-settings-card.js",
    "cleaning-reports-card.js",
    "cleaning-voice-picker-card.js",
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    manager = CleaningManager(hass)
    await manager.async_load()

    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = manager

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    manager.async_build_initial_entities()
    await manager.async_start()

    async def _handle_mark_done(call: ServiceCall) -> None:
        manager.mark_done(call.data[ATTR_TASK_ID])

    async def _handle_mark_undone(call: ServiceCall) -> None:
        manager.mark_undone(call.data[ATTR_TASK_ID])

    async def _handle_reset_today(call: ServiceCall) -> None:
        manager.reset_today()

    async def _handle_refresh_today(call: ServiceCall) -> None:
        manager.refresh_today()

    hass.services.async_register(
        DOMAIN, SERVICE_MARK_DONE, _handle_mark_done,
        schema=vol.Schema({vol.Required(ATTR_TASK_ID): cv.string}),
    )
    hass.services.async_register(
        DOMAIN, SERVICE_MARK_UNDONE, _handle_mark_undone,
        schema=vol.Schema({vol.Required(ATTR_TASK_ID): cv.string}),
    )
    hass.services.async_register(DOMAIN, SERVICE_RESET_TODAY, _handle_reset_today)
    hass.services.async_register(DOMAIN, SERVICE_REFRESH_TODAY, _handle_refresh_today)

    websocket_api.async_register(hass)
    http_views.async_register(hass)

    www_path = Path(__file__).parent / "www"
    await hass.http.async_register_static_paths(
        [StaticPathConfig(f"/cleaning_tasks_frontend/{f}", str(www_path / f), False) for f in FRONTEND_FILES]
    )
    for f in FRONTEND_FILES:
        add_extra_js_url(hass, f"/cleaning_tasks_frontend/{f}")

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    manager: CleaningManager = hass.data[DOMAIN][entry.entry_id]
    manager.async_stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded
