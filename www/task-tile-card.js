/**
 * task-tile-card
 * -----------------
 * A checklist row bound to an input_boolean, styled like a tile card but
 * showing "Do" / "Done" instead of HA's default "On" / "Off" state text
 * (the core tile card has no way to relabel a boolean's state text, so
 * this is a small custom card instead). Tapping the row toggles the entity.
 *
 * Also has a small built-in speaker button that reads `speak_text` aloud via
 * the browser's own Web Speech API - not a media_player/tts.speak service
 * call, since that would need a specific HA-controllable speaker entity the
 * kiosk tablet may not have. This speaks on whatever device is looking at
 * the dashboard right now. If input_text.cleaning_voice_name has a value
 * (set via voice-picker-card on the admin dashboard) and a matching voice
 * exists on this device, that voice is used; otherwise the browser's
 * default voice is used.
 *
 * The speaker is a small fixed-size icon button at the end of the row
 * (not a separate equal-width card next to this one) so the task name gets
 * the full row width instead of losing half of it - full task names were
 * getting clipped on the kiosk tablet when the speaker was its own card.
 *
 * config: { entity, name, label, struck (bool), color (css color or ""), speak_text }
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
        <ha-card style="height:100%;">
          <div style="display:flex;align-items:center;gap:8px;height:100%;min-height:58px;padding:0 8px 0 12px;box-sizing:border-box;">
            <ha-icon class="tt-icon" icon="mdi:broom"></ha-icon>
            <div class="tt-body" style="display:flex;flex-direction:column;overflow:hidden;flex:1;cursor:pointer;min-width:0;">
              <span class="tt-name" style="font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></span>
              <span class="tt-label" style="font-size:0.85em;opacity:0.75;"></span>
            </div>
            <button class="tt-speak" type="button" style="-webkit-appearance:none;appearance:none;box-sizing:border-box;flex:0 0 28px;min-width:28px;width:28px;height:28px;padding:0;margin:0;border:none;outline:none;background:transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent;">
              <ha-icon class="tt-speak-icon" icon="mdi:volume-high" style="--mdc-icon-size:20px;width:20px;height:20px;color:var(--state-icon-color, var(--paper-item-icon-color));"></ha-icon>
            </button>
          </div>
        </ha-card>`;
      this.style.display = "block";
      this.style.height = "100%";
      this.querySelector(".tt-body").addEventListener("click", () => this._toggle());
      this.querySelector(".tt-speak").addEventListener("click", (ev) => {
        ev.stopPropagation();
        this._speak();
      });
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

  _speak() {
    const text = this._config.speak_text || this._config.name;
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voiceName = this._hass && this._hass.states["input_text.cleaning_voice_name"]
      ? this._hass.states["input_text.cleaning_voice_name"].state
      : "";
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
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
  description: "Checklist row showing Do/Done with a compact built-in speak button.",
});
