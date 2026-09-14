# Setup

## 1. Install pyscript (HACS)

HACS → Integrations → search "pyscript" → install → restart Home Assistant →
Settings → Devices & Services → Add Integration → "pyscript".

## 2. Copy files into your HA config

```
/config/tasks_config.json
/config/pyscript/cleaning_manager.py
/config/packages/cleaning_helpers.yaml
/config/generated/input_booleans_generated.yaml   (rename/include as a package, see below)
```

In `configuration.yaml`, make sure packages are loaded:

```yaml
homeassistant:
  packages: !include_dir_named packages
```

Copy `generated/input_booleans_generated.yaml` into `/config/packages/` too
(or `!include` it from a package file) so the helper `input_boolean` entities
exist.

Restart Home Assistant.

## 3. Add the automations

Paste the contents of `generated/automations_generated.yaml` into your
automations (Settings → Automations → ⋮ → Edit in YAML, or merge into
`automations.yaml`).

## 4. Set your speaker

Settings → Devices & Services → check your kiosk tablet's `media_player`
entity id, then update it in:
- `packages/cleaning_helpers.yaml` (`input_select.cleaning_media_player`)
- `generated/kiosk_dashboard_generated.yaml` (the `media_player.kiosk_tablet`
  references — regenerate after editing `generate_dashboard.py` if you want
  this driven by the input_select instead of hardcoded)

## 5. Add the two dashboards

Settings → Dashboards → Add Dashboard → "New dashboard from scratch" → then
switch to YAML mode (⋮ → Edit Dashboard → ⋮ → Raw configuration editor) and
paste in:
- `generated/kiosk_dashboard_generated.yaml` → name it e.g. "Cleaning - Today"
- `generated/admin_dashboard_generated.yaml` → name it e.g. "Cleaning - Admin"

## 6. Restrict the kiosk (the actual privacy boundary)

1. Settings → People → Users → Add User. Name it e.g. `kiosk`, **untick
   "Administrator"**, set a simple PIN/password (kiosk tablets often use the
   HA Android/iOS app or a browser with saved login).
2. Log in as that user once (or use Settings → People → click the user →
   "Change default dashboard" if available in your HA version) and set the
   default/only dashboard to "Cleaning - Today".
3. Do **not** share the "Cleaning - Admin" dashboard with the `kiosk` user —
   by default new dashboards aren't shown to non-admins unless you enable
   "Show in sidebar" for them, so just leave that off for `kiosk`.
4. On the kiosk tablet itself, log in as `kiosk`, not your own account.

Optional polish: install the **Kiosk Mode** HACS frontend card/add-on to hide
the header and sidebar chrome on the tablet — that's cosmetic (it makes the
tablet feel like a dedicated appliance) but the actual access restriction is
the separate non-admin user from step 6, not this.

## 7. Generate the first report

Once a few tasks have been ticked, open the Admin dashboard → Reports →
"Generate report now", or wait for the automatic 1st-of-month run.
