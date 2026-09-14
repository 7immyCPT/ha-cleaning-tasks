"""
Run this ONCE locally (python3 generate_dashboard.py) whenever you edit
tasks_config.json. It produces:
  input_booleans_generated.yaml   -> copy into /config/packages/
  kiosk_dashboard_generated.yaml  -> the kiosk-only "today's tasks" dashboard
  admin_dashboard_generated.yaml  -> reports + settings, admin/chosen users only
  automations_generated.yaml      -> generic automation linking checkboxes to pyscript
"""
import json
import os

OUT_DIR = "generated"
os.makedirs(OUT_DIR, exist_ok=True)

with open("tasks_config.json", "r", encoding="utf-8") as f:
    config = json.load(f)

# ---------- input_booleans ----------
booleans = {"input_boolean": {}}
for room in config["rooms"]:
    for task in room["tasks"]:
        tid = task["id"]
        booleans["input_boolean"][f"due_{tid}"] = {
            "name": f"DUE: {room['name']} - {task['name']}",
            "icon": "mdi:calendar-alert",
        }
        booleans["input_boolean"][f"done_{tid}"] = {
            "name": f"DONE: {room['name']} - {task['name']}",
            "icon": "mdi:checkbox-marked-circle-outline",
        }

def dump_yaml_booleans():
    lines = ["input_boolean:"]
    for key, val in booleans["input_boolean"].items():
        lines.append(f"  {key}:")
        lines.append(f"    name: \"{val['name']}\"")
        lines.append(f"    icon: {val['icon']}")
    return "\n".join(lines) + "\n"

with open(f"{OUT_DIR}/input_booleans_generated.yaml", "w", encoding="utf-8") as f:
    f.write(dump_yaml_booleans())

# ---------- kiosk dashboard: ONLY today's tasks, no nav, no reports ----------
kiosk_cards = []
for room in config["rooms"]:
    room_rows = []
    for task in room["tasks"]:
        tid = task["id"]
        row = f"""          - type: conditional
            conditions:
              - entity: input_boolean.due_{tid}
                state: "on"
            card:
              type: horizontal-stack
              cards:
                - type: tile
                  entity: input_boolean.done_{tid}
                  name: "{task['name']}"
                  icon: mdi:broom
                  tap_action:
                    action: toggle
                - type: tile
                  entity: input_boolean.done_{tid}
                  name: " "
                  icon: mdi:volume-high
                  show_state: false
                  tap_action:
                    action: call-service
                    service: pyscript.cleaning_speak_task
                    service_data:
                      task_id: {tid}
                      media_player: media_player.kiosk_tablet"""
        room_rows.append(row)
    kiosk_cards.append(f"""      - type: vertical-stack
        cards:
          - type: heading
            heading: "{room['name']}"
            heading_style: title
{chr(10).join(room_rows)}""")

kiosk_yaml = f"""title: Cleaning - Today
views:
  - title: Today's Tasks
    path: today
    icon: mdi:broom
    cards:
      - type: markdown
        content: >
          ## {{{{ now().strftime('%A %d %B %Y') }}}}

          Tick each task off as you finish it. Tap the speaker icon to have it read aloud.
{chr(10).join(kiosk_cards)}
"""

with open(f"{OUT_DIR}/kiosk_dashboard_generated.yaml", "w", encoding="utf-8") as f:
    f.write(kiosk_yaml)

# ---------- admin dashboard: reports + settings, restrict via user profile ----------
admin_yaml = """title: Cleaning - Admin
views:
  - title: Reports
    path: reports
    icon: mdi:file-chart
    cards:
      - type: markdown
        content: >
          ## Monthly Completion Report

          Current month: **{{ states('pyscript.cleaning_report') }}** complete
          ({{ state_attr('pyscript.cleaning_report','entries') }} of
          {{ state_attr('pyscript.cleaning_report','required') }} required tasks logged).

          [Open full report]({{ state_attr('pyscript.cleaning_report','path') }})
      - type: button
        name: Generate report now
        icon: mdi:file-refresh
        tap_action:
          action: call-service
          service: pyscript.cleaning_generate_report
      - type: markdown
        content: >
          ## Outstanding this month ({{ states('pyscript.cleaning_outstanding') }} items)

          {% for item in state_attr('pyscript.cleaning_outstanding','items') or [] %}
          - **{{ item.room }}**: {{ item.task }} ({{ item.done }}/{{ item.required }})
          {% endfor %}
      - type: button
        name: Refresh outstanding list
        icon: mdi:refresh
        tap_action:
          action: call-service
          service: pyscript.cleaning_force_catchup
  - title: Settings
    path: settings
    icon: mdi:cog
    cards:
      - type: entities
        title: Cleaning schedule
        entities:
          - input_number.visits_per_week
          - input_select.cleaning_media_player
"""

with open(f"{OUT_DIR}/admin_dashboard_generated.yaml", "w", encoding="utf-8") as f:
    f.write(admin_yaml)

# ---------- automation: checkbox -> pyscript mark_done/undone ----------
all_ids = [task["id"] for room in config["rooms"] for task in room["tasks"]]
entity_list = "\n".join(f"          - input_boolean.done_{tid}" for tid in all_ids)

automations_yaml = f"""automation:
  - alias: Cleaning - checkbox toggled to done
    trigger:
      - platform: state
        entity_id:
{entity_list}
        to: "on"
    action:
      - service: pyscript.cleaning_mark_done
        data:
          task_id: >
            {{{{ trigger.entity_id.split('.')[1].removeprefix('done_') }}}}

  - alias: Cleaning - checkbox toggled to undone
    trigger:
      - platform: state
        entity_id:
{entity_list}
        to: "off"
    action:
      - service: pyscript.cleaning_mark_undone
        data:
          task_id: >
            {{{{ trigger.entity_id.split('.')[1].removeprefix('done_') }}}}
"""

with open(f"{OUT_DIR}/automations_generated.yaml", "w", encoding="utf-8") as f:
    f.write(automations_yaml)

print(f"Generated files for {len(all_ids)} tasks across {len(config['rooms'])} rooms.")
