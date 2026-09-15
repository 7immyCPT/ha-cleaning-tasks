"""The Cleaning Tasks integration."""
from __future__ import annotations

import logging
import shutil
from pathlib import Path

import voluptuous as vol
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
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
        await manager.async_refresh_today()

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

    # Copy the frontend files into /config/www/cleaning_tasks/ so they're
    # served through Home Assistant's own built-in /local/ static mount -
    # the same mechanism every other custom card on this instance already
    # uses reliably (e.g. /local/f1-sensor-live-data-card/...). A custom
    # StaticPathConfig registration under a component-private URL
    # (/cleaning_tasks_frontend/...) was tried first, several different
    # ways (per-restart timestamp path, content-hash path, epoch-salted
    # filename) - all of them got stuck serving stale bytes to every
    # external client (confirmed on a real browser AND via direct LAN IP
    # access, even after a full site-data/service-worker wipe), while curl
    # to the HA host itself always saw the fresh file. /local/ doesn't
    # show this problem. The Lovelace resources for these 5 files (type
    # "JavaScript module") must point at /local/cleaning_tasks/<file>.js -
    # see SESSION_SUMMARY.md's "Frontend deploy workflow" section for the
    # websocket script that (re)registers them after any content change.
    src_www = Path(__file__).parent / "www"
    dest_www = Path(hass.config.path("www", "cleaning_tasks"))
    dest_www.mkdir(parents=True, exist_ok=True)
    for f in FRONTEND_FILES:
        shutil.copyfile(src_www / f, dest_www / f)
    _LOGGER.info("cleaning_tasks frontend files synced to %s", dest_www)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    manager: CleaningManager = hass.data[DOMAIN][entry.entry_id]
    manager.async_stop()
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        hass.data[DOMAIN].pop(entry.entry_id)
    return unloaded
