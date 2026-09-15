"""text.cleaning_voice_names - stores the chosen browser speech-synthesis
voice per display language (set via the voice picker card), as a small JSON
blob: {"English": "Google US English", "Afrikaans": "", "isiXhosa": ""}.
Read by the task card when it speaks a task aloud, keyed by whichever
language select.cleaning_display_language is currently set to."""
from __future__ import annotations

import json

from homeassistant.components.text import TextEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .manager import CleaningManager


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    manager: CleaningManager = hass.data[DOMAIN][entry.entry_id]
    manager.register_text_adder(async_add_entities)


class CleaningVoiceText(TextEntity):
    _attr_should_poll = False
    _attr_icon = "mdi:account-voice"
    _attr_name = "Voices for reading tasks aloud"
    _attr_native_max = 500

    def __init__(self, manager: CleaningManager) -> None:
        self._manager = manager
        self._attr_unique_id = f"{DOMAIN}_voice_names"
        self.entity_id = "text.cleaning_voice_name"
        self._attr_native_value = json.dumps(manager.store.data.get("voice_names", {}))

    async def async_set_value(self, value: str) -> None:
        self._attr_native_value = value
        try:
            self._manager.store.data["voice_names"] = json.loads(value)
        except ValueError:
            pass
        self.async_write_ha_state()
        await self._manager.store.async_save()
