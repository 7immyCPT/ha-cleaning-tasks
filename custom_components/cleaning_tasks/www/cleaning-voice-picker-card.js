/**
 * cleaning-voice-picker-card
 * -----------------
 * Pick a browser speech-synthesis voice per display language (English,
 * Afrikaans, isiXhosa), read by cleaning-today-card's speak button. Voices
 * are read live from this device's window.speechSynthesis.getVoices(), so
 * the picker only offers what can actually speak here.
 *
 * Saved centrally in text.cleaning_voice_name as one small JSON blob keyed
 * by language, so it applies wherever the kiosk/admin cards are opened.
 */
const LANGUAGES = ["English", "Afrikaans", "isiXhosa"];

class CleaningVoicePickerCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card header="Task-reading voices">
          <div style="padding:0 16px 16px;">
            <div class="cv-hint" style="font-size:0.85em;opacity:0.75;margin-bottom:10px;"></div>
            <div class="cv-rows"></div>
            <button class="cv-test" type="button" style="margin-top:8px;padding:8px 14px;border-radius:8px;border:none;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer;">Test voice</button>
          </div>
        </ha-card>`;
      this.style.display = "block";
      this._selects = {};
      for (const lang of LANGUAGES) {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;";
        const label = document.createElement("span");
        label.textContent = lang;
        label.style.cssText = "min-width:90px;font-weight:500;";
        const select = document.createElement("select");
        select.style.cssText = "flex:1;padding:6px 8px;border-radius:8px;";
        select.addEventListener("change", () => this._save());
        this._selects[lang] = select;
        row.appendChild(label);
        row.appendChild(select);
        this.querySelector(".cv-rows").appendChild(row);
      }
      this.querySelector(".cv-test").addEventListener("click", () => this._test());
      if ("speechSynthesis" in window) {
        window.speechSynthesis.onvoiceschanged = () => this._populateVoices();
      }
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _voices() {
    return "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
  }

  _populateVoices() {
    const voices = this._voices();
    const hint = this.querySelector(".cv-hint");
    hint.textContent = voices.length
      ? `${voices.length} voice(s) available on this device.`
      : "No voices found yet - try reopening this page.";

    const saved = this._savedVoiceNames();
    for (const lang of LANGUAGES) {
      const select = this._selects[lang];
      const current = select.value || saved[lang] || "";
      select.innerHTML = "";
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "(browser default)";
      select.appendChild(noneOpt);
      for (const v of voices) {
        const opt = document.createElement("option");
        opt.value = v.name;
        opt.textContent = `${v.name} (${v.lang})`;
        select.appendChild(opt);
      }
      if (current && select.querySelector(`option[value="${CSS.escape(current)}"]`)) {
        select.value = current;
      }
    }
  }

  _savedVoiceNames() {
    const state = this._hass && this._hass.states["text.cleaning_voice_name"];
    if (!state) return {};
    try {
      return JSON.parse(state.state) || {};
    } catch (e) {
      return {};
    }
  }

  _render() {
    if (!this._hass || !this._built) return;
    if (this._voices().length && Object.values(this._selects)[0].children.length === 0) {
      this._populateVoices();
    }
  }

  _save() {
    if (!this._hass) return;
    const value = {};
    for (const lang of LANGUAGES) value[lang] = this._selects[lang].value || "";
    this._hass.callService("text", "set_value", {
      entity_id: "text.cleaning_voice_name",
      value: JSON.stringify(value),
    });
  }

  _test() {
    if (!("speechSynthesis" in window)) return;
    const selectState = this._hass.states["select.cleaning_display_language"];
    const lang = (selectState && selectState.state) || "English";
    const phrases = {
      English: "Clean the bathroom mirror",
      Afrikaans: "Maak die badkamerspieël skoon",
      isiXhosa: "Coca isipili segumbi lokuhlamba",
    };
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrases[lang] || phrases.English);
    const voiceName = this._selects[lang].value;
    if (voiceName) {
      const voice = this._voices().find((v) => v.name === voiceName);
      if (voice) utterance.voice = voice;
    }
    window.speechSynthesis.speak(utterance);
  }

  getCardSize() {
    return 4;
  }
}

customElements.define("cleaning-voice-picker-card", CleaningVoicePickerCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "cleaning-voice-picker-card",
  name: "Cleaning Voice Picker Card",
  description: "Pick a speech-synthesis voice per language for reading tasks aloud.",
});
