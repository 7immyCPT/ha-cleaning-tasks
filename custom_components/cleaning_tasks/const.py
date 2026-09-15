"""Constants for the Cleaning Tasks integration."""

DOMAIN = "cleaning_tasks"
STORAGE_VERSION = 1
STORAGE_KEY = "cleaning_tasks"

LANGUAGES = ["English", "Afrikaans", "isiXhosa"]
LANGUAGE_BCP47 = {"English": "en-ZA", "Afrikaans": "af-ZA", "isiXhosa": "xh-ZA"}

WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
WEEKDAY_LABELS = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}

ATTR_ROOM = "room"
ATTR_ROOM_ID = "room_id"
ATTR_DUE = "due"
ATTR_UNIT = "unit"
ATTR_COUNT = "count"
ATTR_CONDITIONAL_ON_USED = "conditional_on_used"
ATTR_LAST_DONE = "last_done"

SERVICE_MARK_DONE = "mark_done"
SERVICE_MARK_UNDONE = "mark_undone"
SERVICE_RESET_TODAY = "reset_today"
SERVICE_REFRESH_TODAY = "refresh_today"

ATTR_TASK_ID = "task_id"
