/**
 * cleaning-reports-card
 * -----------------
 * Small reset/refresh buttons (icon-sized, not full-width - these are
 * rare, occasional actions and shouldn't dominate the dashboard) plus an
 * "outstanding this month" list computed client-side from
 * switch.cleaning_task_* attributes. Timestamped completions are already
 * in Home Assistant's built-in Logbook - add a core "Logbook" card next to
 * this one, pointed at your cleaning_task entities, if you want that view.
 */
class CleaningReportsCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card header="Cleaning report">
          <div style="display:flex;gap:8px;padding:0 16px 12px;">
            <button class="cr-reset" type="button" style="${this._smallBtnStyle()}">
              <ha-icon icon="mdi:restart" style="--mdc-icon-size:18px;"></ha-icon>
              <span style="font-size:0.85em;">Reset today</span>
            </button>
            <button class="cr-refresh" type="button" style="${this._smallBtnStyle()}">
              <ha-icon icon="mdi:refresh" style="--mdc-icon-size:18px;"></ha-icon>
              <span style="font-size:0.85em;">Refresh</span>
            </button>
          </div>
          <div class="cr-outstanding" style="padding:0 16px 16px;"></div>
        </ha-card>`;
      this.style.display = "block";
      this.querySelector(".cr-reset").addEventListener("click", () => {
        if (window.confirm("Undo every task ticked off today?")) {
          this._hass.callService("cleaning_tasks", "reset_today", {});
        }
      });
      this.querySelector(".cr-refresh").addEventListener("click", () => {
        this._hass.callService("cleaning_tasks", "refresh_today", {});
      });
    }
    this._render();
  }

  _smallBtnStyle() {
    return "-webkit-appearance:none;appearance:none;display:flex;align-items:center;gap:4px;" +
      "padding:4px 10px;border-radius:14px;border:1px solid var(--divider-color);background:transparent;" +
      "color:var(--primary-text-color);cursor:pointer;";
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this._hass || !this._built) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const outstanding = [];
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("switch.cleaning_task_")) continue;
      const attrs = state.attributes || {};
      if (attrs.unit !== "month" || attrs.conditional_on_used) continue;
      const lastDone = attrs.last_done || "";
      if (!lastDone.startsWith(monthKey)) {
        outstanding.push(attrs);
      }
    }
    outstanding.sort((a, b) => (a.room || "").localeCompare(b.room || ""));

    const el = this.querySelector(".cr-outstanding");
    if (outstanding.length === 0) {
      el.innerHTML = `<div style="opacity:0.7;">Everything monthly is done this month.</div>`;
      return;
    }
    el.innerHTML =
      `<div style="font-weight:600;margin-bottom:6px;">Outstanding this month (${outstanding.length})</div>` +
      outstanding.map((a) => `<div style="padding:2px 0;">${a.room || ""}: ${a.task_name || ""}</div>`).join("");
  }

  getCardSize() {
    return 3;
  }
}

customElements.define("cleaning-reports-card", CleaningReportsCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "cleaning-reports-card",
  name: "Cleaning Reports Card",
  description: "Small reset/refresh buttons plus what's still outstanding this month.",
});
