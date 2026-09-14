/**
 * speak-tile-card
 * -----------------
 * A minimal Lovelace card that reads its configured `text` aloud using the
 * browser's own Web Speech API (window.speechSynthesis) when tapped.
 *
 * Deliberately not a media_player/tts.speak service call: those require a
 * specific HA-controllable speaker entity to be configured, which the kiosk
 * tablet may not have. This just speaks on whatever device is looking at
 * the dashboard right now - no entity to configure, works anywhere the
 * browser supports speech synthesis (all modern browsers do).
 *
 * If input_text.cleaning_voice_name has a value (set via voice-picker-card
 * on the admin dashboard) and a matching voice exists on this device, that
 * voice is used; otherwise the browser's default voice is used.
 */
class SpeakTileCard extends HTMLElement {
  setConfig(config) {
    if (!config || !config.text) {
      throw new Error("speak-tile-card: 'text' is required");
    }
    this._config = config;
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card style="height:100%;cursor:pointer;">
          <div style="display:flex;align-items:center;justify-content:center;height:100%;min-height:58px;">
            <ha-icon icon="mdi:volume-high" style="color: var(--state-icon-color, var(--paper-item-icon-color));"></ha-icon>
          </div>
        </ha-card>`;
      this.style.display = "block";
      this.style.height = "100%";
      this.addEventListener("click", () => this._speak());
    }
  }

  _speak() {
    if (!("speechSynthesis" in window)) {
      console.warn("speak-tile-card: speechSynthesis not supported in this browser");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(this._config.text);
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

customElements.define("speak-tile-card", SpeakTileCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "speak-tile-card",
  name: "Speak Tile Card",
  description: "Reads configured text aloud via the browser's speech synthesis on tap.",
});
