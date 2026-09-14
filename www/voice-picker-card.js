/**
 * voice-picker-card
 * -------------------
 * Lets you pick which of the browser's available speech-synthesis voices
 * speak-tile-card should use when reading a task aloud. Voices are
 * per-browser/per-device (there's no central HA list of them), so this
 * reads window.speechSynthesis.getVoices() live and saves the chosen
 * voice's name into input_text.cleaning_voice_name, which speak-tile-card
 * then looks up by name on the same device.
 */
class VoicePickerCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card header="Task-reading voice">
          <div style="padding: 0 16px 16px;">
            <div class="vp-hint" style="opacity:0.7;font-size:0.9em;margin-bottom:8px;">
              Loading voices available on this device...
            </div>
            <select class="vp-select" style="width:100%;padding:8px;font-size:1em;
              background: var(--card-background-color); color: var(--primary-text-color);
              border: 1px solid var(--divider-color); border-radius: 4px;">
            </select>
            <button class="vp-test" style="margin-top:10px;padding:8px 16px;
              border-radius:4px;border:none;background:var(--primary-color);
              color:var(--text-primary-color, white);cursor:pointer;">
              Test voice
            </button>
          </div>
        </ha-card>`;
      this._select = this.querySelector(".vp-select");
      this._hint = this.querySelector(".vp-hint");
      this._select.addEventListener("change", () => this._onChange());
      this.querySelector(".vp-test").addEventListener("click", () => this._test());
      this._loadVoices();
      if ("speechSynthesis" in window) {
        window.speechSynthesis.addEventListener("voiceschanged", () => this._loadVoices());
      }
    }
    this._renderSelection();
  }

  _loadVoices() {
    if (!("speechSynthesis" in window)) {
      this._hint.textContent = "Speech synthesis isn't supported on this device's browser.";
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) {
      this._hint.textContent = "No voices found yet - try reopening this page.";
      return;
    }
    this._hint.textContent = `${voices.length} voice(s) available on this device:`;
    this._select.innerHTML = voices
      .map((v) => `<option value="${v.name}">${v.name} (${v.lang})</option>`)
      .join("");
    this._renderSelection();
  }

  _renderSelection() {
    if (!this._select || !this._hass) return;
    const current = this._hass.states["input_text.cleaning_voice_name"];
    if (current && current.state && this._select.querySelector(`option[value="${CSS.escape(current.state)}"]`)) {
      this._select.value = current.state;
    }
  }

  _onChange() {
    if (!this._hass) return;
    this._hass.callService("input_text", "set_value", {
      entity_id: "input_text.cleaning_voice_name",
      value: this._select.value,
    });
  }

  _test() {
    if (!("speechSynthesis" in window)) return;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find((v) => v.name === this._select.value);
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance("Clean the bathroom mirror");
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  set hass(hass) {
    this._hass = hass;
    this._renderSelection();
  }

  getCardSize() {
    return 2;
  }
}

customElements.define("voice-picker-card", VoicePickerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "voice-picker-card",
  name: "Voice Picker Card",
  description: "Pick which browser speech-synthesis voice reads tasks aloud on this device.",
});
