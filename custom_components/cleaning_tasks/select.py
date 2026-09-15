"""select.cleaning_display_language - the one shared "which language" pick,
read by both the kiosk and admin cards so they never disagree on it."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, LANGUAGES
from .manager import CleaningManager


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager: CleaningManager = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([CleaningLanguageSelect(manager)])


class CleaningLanguageSelect(SelectEntity):
    _attr_should_poll = False
    _attr_icon = "mdi:translate"
    _attr_name = "Cleaning dashboard language"
    _attr_options = LANGUAGES

    def __init__(self, manager: CleaningManager) -> None:
        self._manager = manager
        self._attr_unique_id = f"{DOMAIN}_display_language"
        self.entity_id = "select.cleaning_display_language"
        self._attr_current_option = manager.store.data.get("display_language", LANGUAGES[0])

    async def async_select_option(self, option: str) -> None:
        if option not in LANGUAGES:
            return
        self._attr_current_option = option
        self._manager.store.data["display_language"] = option
        self.async_write_ha_state()
        await self._manager.store.async_save()
