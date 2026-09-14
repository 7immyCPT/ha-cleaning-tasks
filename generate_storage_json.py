"""
Converts the generated dashboard YAML files into HA's storage-mode JSON
format (.storage/lovelace.<url_path>), so they can be pushed directly over
SSH instead of retyped through the raw config editor in the browser.
"""
import json
import yaml

DASHBOARDS = {
    "generated/kiosk_dashboard_generated.yaml": ("lovelace.cleaning_today", "generated/lovelace.cleaning_today.json"),
    "generated/admin_dashboard_generated.yaml": ("lovelace.cleaning_admin", "generated/lovelace.cleaning_admin.json"),
}

for src, (key, out) in DASHBOARDS.items():
    with open(src, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)
    storage = {
        "version": 1,
        "minor_version": 1,
        "key": key,
        "data": {"config": config},
    }
    with open(out, "w", encoding="utf-8") as f:
        json.dump(storage, f, indent=2)
    print(f"Wrote {out}")
