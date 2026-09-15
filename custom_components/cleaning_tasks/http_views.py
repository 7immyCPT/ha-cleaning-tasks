"""CSV export/import HTTP views for the room/task editor card."""
from __future__ import annotations

import csv
import io

from aiohttp import web
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from .manager import CleaningManager
from .store import CleaningTasksStore


class CleaningTasksExportView(HomeAssistantView):
    url = "/api/cleaning_tasks/export"
    name = "api:cleaning_tasks:export"

    async def get(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        manager: CleaningManager = next(iter(hass.data[DOMAIN].values()))
        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=CleaningTasksStore.CSV_FIELDS)
        writer.writeheader()
        for row in manager.store.to_csv_rows():
            writer.writerow(row)
        return web.Response(
            text=buffer.getvalue(),
            content_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="cleaning_tasks.csv"'},
        )


class CleaningTasksImportView(HomeAssistantView):
    url = "/api/cleaning_tasks/import"
    name = "api:cleaning_tasks:import"

    async def post(self, request: web.Request) -> web.Response:
        hass: HomeAssistant = request.app["hass"]
        manager: CleaningManager = next(iter(hass.data[DOMAIN].values()))
        raw = await request.text()
        reader = csv.DictReader(io.StringIO(raw))
        rows = list(reader)
        if not rows:
            return web.json_response({"error": "No rows found in CSV"}, status=400)
        manager.import_csv_rows(rows)
        await manager.store.async_save()
        return web.json_response({"rooms": len(manager.store.rooms()), "tasks": len(manager.store.tasks())})


def async_register(hass: HomeAssistant) -> None:
    hass.http.register_view(CleaningTasksExportView())
    hass.http.register_view(CleaningTasksImportView())
