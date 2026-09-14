/**
 * task-tile-card
 * -----------------
 * A checklist row bound to an input_boolean, styled like a tile card but
 * showing "Do" / "Done" instead of HA's default "On" / "Off" state text
 * (the core tile card has no way to relabel a boolean's state text, so
 * this is a small custom card instead). Tapping toggles the entity.
 *
 * config: { entity, name, label, struck (bool), color (css color or "") }
 */
class TaskTileCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("task-tile-card: 'entity' is required");
    }
    this._config = config;
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card style="height:100%;cursor:pointer;">
          <div style="display:flex;align-items:center;gap:12px;height:100%;min-height:58px;padding:0 12px;box-sizing:border-box;">
            <ha-icon class="tt-icon" icon="mdi:broom"></ha-icon>
            <div style="display:flex;flex-direction:column;overflow:hidden;">
              <span class="tt-name" style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>
              <span class="tt-label" style="font-size:0.85em;opacity:0.75;"></span>
            </div>
          </div>
        </ha-card>`;
      this.style.display = "block";
      this.style.height = "100%";
      this.addEventListener("click", () => this._toggle());
    }
    this._render();
  }

  _render() {
    const nameEl = this.querySelector(".tt-name");
    const labelEl = this.querySelector(".tt-label");
    const iconEl = this.querySelector(".tt-icon");
    nameEl.textContent = this._config.name || "";
    nameEl.style.textDecoration = this._config.struck ? "line-through" : "none";
    labelEl.textContent = this._config.label || "";
    const color = this._config.color || "";
    iconEl.style.color = color;
    labelEl.style.color = color;
  }

  _toggle() {
    if (!this._hass || !this._config.entity) return;
    this._hass.callService("input_boolean", "toggle", { entity_id: this._config.entity });
  }

  set hass(hass) {
    this._hass = hass;
  }

  getCardSize() {
    return 1;
  }
}

customElements.define("task-tile-card", TaskTileCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "task-tile-card",
  name: "Task Tile Card",
  description: "Checklist row showing Do/Done instead of On/Off.",
});
