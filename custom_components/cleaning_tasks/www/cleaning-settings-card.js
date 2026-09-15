/**
 * cleaning-settings-card
 * -----------------
 * Which days the cleaner comes, plus a toggle per usage-tracked room ("used
 * since last clean?"). Reads switch.cleaning_day_* and
 * switch.cleaning_room_used_* straight from hass.states, so newly added
 * tracked rooms show up automatically - no dashboard editing needed.
 */
class CleaningSettingsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card header="Cleaning schedule">
          <div class="cs-days" style="padding:0 16px 8px;"></div>
          <div class="cs-rooms-title" style="padding:8px 16px 0;font-weight:600;display:none;">Used since last clean?</div>
          <div class="cs-rooms" style="padding:0 16px 16px;"></div>
        </ha-card>`;
      this.style.display = "block";
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _row(entityId, label) {
    const state = this._hass.states[entityId];
    if (!state) return null;
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:8px 0;";
    const span = document.createElement("span");
    span.textContent = label;
    const toggle = document.createElement("ha-switch");
    toggle.checked = state.state === "on";
    toggle.addEventListener("change", (ev) => {
      this._hass.callService("switch", ev.target.checked ? "turn_on" : "turn_off", { entity_id: entityId });
    });
    row.appendChild(span);
    row.appendChild(toggle);
    return row;
  }

  _render() {
    if (!this._hass || !this._built) return;

    const daysEl = this.querySelector(".cs-days");
    daysEl.innerHTML = "";
    const dayEntities = Object.keys(this._hass.states)
      .filter((id) => id.startsWith("switch.cleaning_day_"))
      .sort();
    for (const id of dayEntities) {
      const row = this._row(id, this._hass.states[id].attributes.friendly_name || id);
      if (row) daysEl.appendChild(row);
    }

    const roomsEl = this.querySelector(".cs-rooms");
    const roomsTitle = this.querySelector(".cs-rooms-title");
    roomsEl.innerHTML = "";
    const roomEntities = Object.keys(this._hass.states)
      .filter((id) => id.startsWith("switch.cleaning_room_used_"))
      .sort();
    roomsTitle.style.display = roomEntities.length ? "block" : "none";
    for (const id of roomEntities) {
      const state = this._hass.states[id];
      const label = state.attributes.friendly_name || id;
      const row = this._row(id, label);
      if (row) roomsEl.appendChild(row);
    }
  }

  getCardSize() {
    return 4;
  }
}

customElements.define("cleaning-settings-card", CleaningSettingsCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "cleaning-settings-card",
  name: "Cleaning Settings Card",
  description: "Cleaning days and room-used toggles, kept in sync automatically.",
});
