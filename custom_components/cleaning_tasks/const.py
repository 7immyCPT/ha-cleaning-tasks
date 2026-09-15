"""Constants for the Cleaning Tasks integration."""

DOMAIN = "cleaning_tasks"
STORAGE_VERSION = 1
STORAGE_KEY = "cleaning_tasks"

LANGUAGES = [
    "English",
    "Afrikaans",
    "isiXhosa",
    "isiZulu",
    "Sepedi",
    "Setswana",
    "Sesotho",
    "Xitsonga",
    "siSwati",
    "Tshivenda",
    "isiNdebele",
]
LANGUAGE_BCP47 = {
    "English": "en-ZA",
    "Afrikaans": "af-ZA",
    "isiXhosa": "xh-ZA",
    "isiZulu": "zu-ZA",
    "Sepedi": "nso-ZA",
    "Setswana": "tn-ZA",
    "Sesotho": "st-ZA",
    "Xitsonga": "ts-ZA",
    "siSwati": "ss-ZA",
    "Tshivenda": "ve-ZA",
    "isiNdebele": "nr-ZA",
}
# Short code used to build per-task attribute keys (task_name_<code>).
LANGUAGE_CODE = {
    "English": "en",
    "Afrikaans": "af",
    "isiXhosa": "xh",
    "isiZulu": "zu",
    "Sepedi": "nso",
    "Setswana": "tn",
    "Sesotho": "st",
    "Xitsonga": "ts",
    "siSwati": "ss",
    "Tshivenda": "ve",
    "isiNdebele": "nr",
}
# Enabled by default - the rest can be turned on from the task editor card's
# "Languages" section once someone actually needs them, so the kiosk
# dropdown doesn't show all 11 by default.
DEFAULT_ENABLED_LANGUAGES = ["English", "Afrikaans", "isiXhosa"]

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

# Weather-aware scheduling for outdoor tasks (e.g. window cleaning): when a
# task marked weather_dependent becomes due on a rainy day, it's deferred to
# the next forecast-dry cleaning day, but never for more than this many days
# - after that it's due anyway so it doesn't get postponed indefinitely.
WEATHER_GRACE_DAYS = 3
BAD_WEATHER_CONDITIONS = {
    "rainy", "pouring", "lightning", "lightning-rainy", "hail",
    "snowy", "snowy-rainy", "exceptional",
}
BAD_WEATHER_PRECIPITATION_PROBABILITY = 50
