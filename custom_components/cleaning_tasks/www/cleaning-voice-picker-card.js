/**
 * cleaning-voice-picker-card
 * -----------------
 * Pick a browser speech-synthesis voice per display language, read by
 * cleaning-today-card's speak button. Voices are read live from this
 * device's window.speechSynthesis.getVoices(), so the picker only offers
 * what can actually speak here.
 *
 * Only shows a row for languages enabled in the task editor card's
 * "Languages" section (select.cleaning_display_language's
 * enabled_languages attribute) - matches the kiosk's own language
 * dropdown, so there's nothing to configure for a language nobody sees.
 *
 * Afrikaans and isiZulu also get an "HA Cloud" option using Home
 * Assistant Cloud's (Nabu Casa's Azure-backed) text-to-speech - real
 * neural voices, confirmed to exist for only these 2 of the 11 languages.
 *
 * Saved centrally in text.cleaning_voice_name as one small JSON blob keyed
 * by language, so it applies wherever the kiosk/admin cards are opened.
 */
const LANG_CODE = {
  English: "en", Afrikaans: "af", isiXhosa: "xh", isiZulu: "zu", Sepedi: "nso",
  Setswana: "tn", Sesotho: "st", Xitsonga: "ts", siSwati: "ss", Tshivenda: "ve", isiNdebele: "nr",
};
// Home Assistant Cloud (Nabu Casa) text-to-speech - real Azure neural
// voices, confirmed via tts/engine/voices to exist for exactly these two
// languages (Azure has no voice for the other 9). Offered as named options
// in the dropdown below rather than hidden behind "(browser default)", so
// it's clear what's actually being used.
const HA_CLOUD_TTS = {
  Afrikaans: { language: "af-ZA", voices: [{ id: "AdriNeural", label: "Adri" }, { id: "WillemNeural", label: "Willem" }] },
  isiZulu: { language: "zu-ZA", voices: [{ id: "ThandoNeural", label: "Thando" }, { id: "ThembaNeural", label: "Themba" }] },
};

async function playHaCloudTts(hass, text, lang, voiceId) {
  const config = HA_CLOUD_TTS[lang];
  if (!config) throw new Error(`no HA Cloud TTS voice for ${lang}`);
  const result = await hass.callApi("POST", "tts_get_url", {
    engine_id: "tts.home_assistant_cloud",
    message: text,
    language: config.language,
    options: { voice: voiceId || config.voices[0].id },
  });
  const audio = new Audio(result.path);
  await new Promise((resolve, reject) => {
    audio.addEventListener("ended", resolve, { once: true });
    audio.addEventListener("error", reject, { once: true });
    audio.play().catch(reject);
  });
}

const TEST_PHRASES = {
  English: "Clean the bathroom mirror",
  Afrikaans: "Maak die badkamerspieël skoon",
  isiXhosa: "Coca isipili segumbi lokuhlamba",
  isiZulu: "Sula isibuko segumbi lokugeza",
  Sepedi: "Hlwekiša seipone sa ka ntlwaneng",
  Setswana: "Phepafatsa seipone sa ntlwana ya boithobalo",
  Sesotho: "Hlwekisa seipone sa kamoreng ya ho hlapa",
  Xitsonga: "Basisa xifaniso xa kamara yo hlambela",
  siSwati: "Hlambulula sibuko selikamelo lekugeza",
  Tshivenda: "Kuna tshiga tsha kamara ya u ṱamba",
  isiNdebele: "Hlambulula sibuko lelikamelo lokugeza",
};

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
      this._rowLanguages = [];
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

  _enabledLanguages() {
    const state = this._hass && this._hass.states["select.cleaning_display_language"];
    const attrs = (state && state.attributes) || {};
    return attrs.enabled_languages && attrs.enabled_languages.length
      ? attrs.enabled_languages
      : ["English", "Afrikaans", "isiXhosa"];
  }

  _rebuildRows(languages) {
    this._rowLanguages = languages;
    this._selects = {};
    const rowsEl = this.querySelector(".cv-rows");
    rowsEl.innerHTML = "";
    for (const lang of languages) {
      const row = document.createElement("div");
      row.style.cssText = "margin-bottom:10px;";
      const top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
      const label = document.createElement("span");
      label.textContent = lang;
      label.style.cssText = "min-width:90px;font-weight:500;";
      const select = document.createElement("select");
      select.style.cssText = "flex:1;padding:6px 8px;border-radius:8px;";
      select.addEventListener("change", () => this._save());
      this._selects[lang] = select;
      top.appendChild(label);
      top.appendChild(select);
      row.appendChild(top);
      const rowHint = document.createElement("div");
      rowHint.className = "cv-row-hint";
      rowHint.style.cssText = "font-size:0.8em;opacity:0.65;margin-top:2px;margin-left:98px;";
      row.appendChild(rowHint);
      rowsEl.appendChild(row);
    }
  }

  _populateVoices() {
    const voices = this._voices();
    const hint = this.querySelector(".cv-hint");
    hint.textContent = voices.length
      ? `${voices.length} voice(s) available on this device.`
      : "No voices found yet - try reopening this page.";

    const saved = this._savedVoiceNames();
    for (const lang of this._rowLanguages) {
      const select = this._selects[lang];
      const current = select.value || saved[lang] || "";
      select.innerHTML = "";
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "(browser default)";
      select.appendChild(noneOpt);
      if (HA_CLOUD_TTS[lang]) {
        const group = document.createElement("optgroup");
        group.label = "HA Cloud (recommended)";
        for (const v of HA_CLOUD_TTS[lang].voices) {
          const opt = document.createElement("option");
          opt.value = `__hacloud__${v.id}`;
          opt.textContent = v.label;
          group.appendChild(opt);
        }
        select.appendChild(group);
      }
      const code = LANG_CODE[lang] || "en";
      const matching = voices.filter((v) => v.lang && v.lang.toLowerCase().startsWith(code));
      const others = voices.filter((v) => !matching.includes(v));
      if (matching.length) {
        const group = document.createElement("optgroup");
        group.label = `Matches ${lang}`;
        for (const v of matching) {
          const opt = document.createElement("option");
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          group.appendChild(opt);
        }
        select.appendChild(group);
      }
      if (others.length) {
        const group = document.createElement("optgroup");
        group.label = "Other voices (will mispronounce)";
        for (const v of others) {
          const opt = document.createElement("option");
          opt.value = v.name;
          opt.textContent = `${v.name} (${v.lang})`;
          group.appendChild(opt);
        }
        select.appendChild(group);
      }
      if (current && select.querySelector(`option[value="${CSS.escape(current)}"]`)) {
        select.value = current;
      }
      const rowHint = select.parentElement.parentElement.querySelector(".cv-row-hint");
      if (rowHint) {
        rowHint.textContent = matching.length
          ? `${matching.length} matching voice(s) on this device.`
          : "No voice on this device speaks this language natively - it will use a fallback accent.";
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
    const languages = this._enabledLanguages();
    if (languages.join(",") !== this._rowLanguages.join(",")) {
      this._rebuildRows(languages);
      if (this._voices().length) this._populateVoices();
      return;
    }
    if (this._voices().length && Object.values(this._selects)[0] && Object.values(this._selects)[0].children.length === 0) {
      this._populateVoices();
    }
  }

  _save() {
    if (!this._hass) return;
    const saved = this._savedVoiceNames();
    for (const lang of this._rowLanguages) saved[lang] = this._selects[lang].value || "";
    this._hass.callService("text", "set_value", {
      entity_id: "text.cleaning_voice_name",
      value: JSON.stringify(saved),
    });
  }

  async _test() {
    if (!("speechSynthesis" in window)) return;
    const selectState = this._hass.states["select.cleaning_display_language"];
    const lang = (selectState && selectState.state) || "English";
    const phrase = TEST_PHRASES[lang] || TEST_PHRASES.English;
    const select = this._selects[lang];
    const voiceName = select ? select.value : "";
    const cloudVoiceId = voiceName.startsWith("__hacloud__") ? voiceName.slice("__hacloud__".length) : null;

    if ((!voiceName || cloudVoiceId) && HA_CLOUD_TTS[lang]) {
      try {
        await playHaCloudTts(this._hass, phrase, lang, cloudVoiceId);
        return;
      } catch (e) {
        // fall through to Web Speech API below
      }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase);
    utterance.lang = `${LANG_CODE[lang] || "en"}-ZA`;
    if (voiceName && !cloudVoiceId) {
      const voice = this._voices().find((v) => v.name === voiceName);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
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
