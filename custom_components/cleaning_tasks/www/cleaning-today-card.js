/**
 * cleaning-today-card
 * -----------------
 * Self-contained "today's checklist" card. Reads every switch.cleaning_task_*
 * entity straight from hass.states, keeps the ones with attributes.due, and
 * groups/renders them by room - no per-task YAML generation needed, unlike
 * the old static-dashboard version of this project. Add this one card to
 * any dashboard view.
 *
 * Each row shows the task name, a Do/Done label, and a small built-in
 * speaker button (Web Speech API, voiced from text.cleaning_voice_name if
 * set). Completed tasks stay visible, struck through and green, sorted to
 * the bottom of their room.
 *
 * A small language dropdown in the header sets
 * select.cleaning_display_language (shared with the other cleaning cards,
 * kiosk and admin alike): task names auto-translate on the fly (via Google
 * Translate's public endpoint, no API key - see translateText below),
 * chrome text switches too, and the speak button uses that language's
 * chosen voice. Task names are never typed in by hand per language - that
 * never scaled past two languages, so translation happens client-side and
 * is cached in localStorage (translateText's cache) to avoid re-fetching
 * the same task name every day.
 * The dropdown only lists languages turned on in the task editor card's
 * "Languages" section (select.cleaning_display_language's
 * enabled_languages attribute) - all 11 SA official languages are
 * supported, but most stay hidden until an admin enables them, to avoid
 * cluttering the kiosk for the cleaner. Google Translate doesn't support
 * siSwati, Tshivenda or isiNdebele - task names for those languages just
 * stay in English (silently, via the null entries in GOOGLE_LANG below).
 *
 * The chrome text (instructions/do/done/nothing-due) below is machine-
 * assisted for the languages beyond Afrikaans/isiXhosa - worth a native
 * speaker's review before relying on it.
 */
const STRINGS = {
  English: {
    instructions: "Tick each task off as you finish it. Tap the speaker icon to have it read aloud.",
    nothingDue: "Nothing due today.",
    allDone: "All done for today! 🎉",
    do: "Do",
    done: "Done",
  },
  Afrikaans: {
    instructions: "Merk elke taak af soos jy dit voltooi. Tik op die luidsprekerikoon om dit hardop te laat lees.",
    nothingDue: "Niks is vandag nodig nie.",
    allDone: "Alles klaar vir vandag! 🎉",
    do: "Doen",
    done: "Klaar",
  },
  isiXhosa: {
    instructions: "Phawula umsebenzi ngamunye njengoko uwugqiba. Cofa iayikhoni yesipikha ukuze ifundwe ngokuzwakalayo.",
    nothingDue: "Akukho nto ifunekayo namhlanje.",
    allDone: "Konke kugqityiwe namhlanje! 🎉",
    do: "Yenza",
    done: "Kwenziwe",
  },
  isiZulu: {
    instructions: "Maka umsebenzi ngamunye njengoba uwuqeda. Thepha uphawu lwesipikha ukuze ufundwe ngokuzwakalayo.",
    nothingDue: "Akukho okudingekayo namuhla.",
    allDone: "Konke kuqediwe namuhla! 🎉",
    do: "Yenza",
    done: "Kwenziwe",
  },
  Sepedi: {
    instructions: "Swaya mošomo o mongwe le o mongwe ge o o fetša. Tobetša leswao la sepikara gore le balwe ka go kwagala.",
    nothingDue: "Ga go na se se nyakegago lehono.",
    allDone: "Tšohle di fedile lehono! 🎉",
    do: "Dira",
    done: "E dirilwe",
  },
  Setswana: {
    instructions: "Tshwaya tiro nngwe le nngwe fa o e fetsa. Tobetsa letshwao la sepikara gore e balwe kwa godimo.",
    nothingDue: "Ga go na sepe se se tlhokegang gompieno.",
    allDone: "Tsotlhe di fedile gompieno! 🎉",
    do: "Dira",
    done: "Go dirilwe",
  },
  Sesotho: {
    instructions: "Tšoaea mosebetsi ka mong ha o o qeta. Tobetsa letshwao la sepikara hore e baleoe ka lentswe.",
    nothingDue: "Ha ho letho le hlokahalang kajeno.",
    allDone: "Tsohle di phethetswe kajeno! 🎉",
    do: "Etsa",
    done: "E entsoe",
  },
  Xitsonga: {
    instructions: "Fungha ntirho un'wana ni un'wana loko u wu hetile. Tsheketa xikombiso xa xipikara leswaku xi hlayiwa hi rito.",
    nothingDue: "A ku na nchumu lexi lavekaka namuntlha.",
    allDone: "Hinkwaswo swi helile namuntlha! 🎉",
    do: "Endla",
    done: "Xi endliwile",
  },
  siSwati: {
    instructions: "Maka umsebenti ngamunye njengobe uwucedza. Tsindza sikhombiso sesipikha kutsi sifundvwe ngesiswayi.",
    nothingDue: "Akukho lokudzingekako lamuhla.",
    allDone: "Konkhe kuchediwe lamuhla! 🎉",
    do: "Yenta",
    done: "Kwentiwe",
  },
  Tshivenda: {
    instructions: "Sumbedza mushumo muṅwe na muṅwe musi wo u fhedza. Tenda tshiga tsha sipikha uri i vhaliwe nga ipfi.",
    nothingDue: "A huna zwine zwa tea namusi.",
    allDone: "Zwoṱhe zwo fheliswa namusi! 🎉",
    do: "Ita",
    done: "Zwo itwa",
  },
  isiNdebele: {
    instructions: "Phawula umsebenzi ngamunye njengoba uwuqeda. Thinta isiboniso sesipikha bona ifundwe ngezwi.",
    nothingDue: "Akukho okudzingekako lamhla.",
    allDone: "Konke kuqediwe lamuhla! 🎉",
    do: "Yenza",
    done: "Kwenziwe",
  },
};

// Google Translate's target-language code per SA language - null means
// Google doesn't support that language, so translateText() just returns
// the original English text for it.
const GOOGLE_LANG = {
  English: null, Afrikaans: "af", isiXhosa: "xh", isiZulu: "zu", Sepedi: "nso",
  Setswana: "tn", Sesotho: "st", Xitsonga: "ts", siSwati: null, Tshivenda: null, isiNdebele: null,
};
const LANG_CODE = {
  English: "en-ZA", Afrikaans: "af-ZA", isiXhosa: "xh-ZA", isiZulu: "zu-ZA", Sepedi: "nso-ZA",
  Setswana: "tn-ZA", Sesotho: "st-ZA", Xitsonga: "ts-ZA", siSwati: "ss-ZA", Tshivenda: "ve-ZA", isiNdebele: "nr-ZA",
};
// Home Assistant Cloud (Nabu Casa) text-to-speech - real Azure neural
// voices, confirmed via tts/engine/voices to actually exist for these two
// languages (and only these two, of the 11 - Azure has no Xhosa/Sepedi/
// Setswana/Sesotho/Xitsonga/siSwati/Tshivenda/isiNdebele voice). This is
// what the speak button prefers when the admin hasn't picked a specific
// local device voice, since a real neural voice beats any local fallback.
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

const TRANSLATION_CACHE_KEY = "cleaning_tasks_translation_cache_v1";
let _translationCache = null;
const _translationPending = new Map();

function _loadTranslationCache() {
  if (_translationCache) return _translationCache;
  try {
    _translationCache = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || "{}");
  } catch (e) {
    _translationCache = {};
  }
  return _translationCache;
}

function _cachedTranslation(text, googleCode) {
  if (!googleCode) return text;
  const cache = _loadTranslationCache();
  return cache[`${googleCode}::${text}`] || text;
}

async function translateText(text, googleCode) {
  if (!text || !googleCode) return text;
  const cache = _loadTranslationCache();
  const key = `${googleCode}::${text}`;
  if (cache[key]) return cache[key];
  if (_translationPending.has(key)) return _translationPending.get(key);

  const promise = (async () => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${googleCode}&dt=t&q=${encodeURIComponent(text)}`;
      const resp = await fetch(url);
      if (!resp.ok) return text;
      const data = await resp.json();
      const translated = (data[0] || []).map((segment) => segment[0]).join("");
      if (!translated) return text;
      cache[key] = translated;
      try {
        localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(cache));
      } catch (e) {
        // storage full/unavailable - translation still works, just re-fetches next time
      }
      return translated;
    } catch (e) {
      return text;
    } finally {
      _translationPending.delete(key);
    }
  })();
  _translationPending.set(key, promise);
  return promise;
}

class CleaningTodayCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card>
          <div class="ct-header" style="padding:16px 16px 8px;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
            <div>
              <div class="ct-date" style="font-size:1.3em;font-weight:600;"></div>
              <div class="ct-instructions" style="opacity:0.75;font-size:0.9em;margin-top:4px;"></div>
            </div>
            <select class="ct-lang" style="padding:4px 6px;border-radius:8px;"></select>
          </div>
          <div class="ct-rooms" style="padding:0 16px 16px;column-width:320px;column-gap:16px;"></div>
        </ha-card>`;
      this.style.display = "block";
      this.querySelector(".ct-lang").addEventListener("change", (ev) => {
        this._hass.callService("select", "select_option", {
          entity_id: "select.cleaning_display_language",
          option: ev.target.value,
        });
      });
    }
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _lang() {
    const state = this._hass.states["select.cleaning_display_language"];
    return (state && state.state) || "English";
  }

  _enabledLanguages() {
    const state = this._hass.states["select.cleaning_display_language"];
    const attrs = (state && state.attributes) || {};
    return attrs.enabled_languages && attrs.enabled_languages.length
      ? attrs.enabled_languages
      : ["English", "Afrikaans", "isiXhosa"];
  }

  _taskLabel(attrs) {
    const english = attrs.task_name || "";
    return _cachedTranslation(english, GOOGLE_LANG[this._lang()]);
  }

  async _speak(attrs) {
    if (!("speechSynthesis" in window)) return;
    const lang = this._lang();
    const english = attrs.task_name || "";
    const text = await translateText(english, GOOGLE_LANG[lang]);
    if (!text) return;

    const voiceState = this._hass && this._hass.states["text.cleaning_voice_name"];
    let voiceName = "";
    if (voiceState) {
      try {
        voiceName = (JSON.parse(voiceState.state) || {})[lang] || "";
      } catch (e) {
        voiceName = "";
      }
    }

    // No local device voice picked for this language, or the admin
    // explicitly picked an HA Cloud voice ("__hacloud__<voiceId>") in the
    // voice picker - HA Cloud (Nabu Casa's Azure-backed TTS) has real
    // neural voices for Afrikaans and isiZulu, which beats any local
    // fallback voice.
    const cloudVoiceId = voiceName.startsWith("__hacloud__") ? voiceName.slice("__hacloud__".length) : null;
    if ((!voiceName || cloudVoiceId) && HA_CLOUD_TTS[lang]) {
      try {
        await playHaCloudTts(this._hass, text, lang, cloudVoiceId);
        return;
      } catch (e) {
        // fall through to Web Speech API below
      }
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_CODE[lang] || "en-ZA";
    if (voiceName && !cloudVoiceId) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    window.speechSynthesis.speak(utterance);
  }

  _toggle(entityId) {
    if (!this._hass) return;
    this._hass.callService("switch", "toggle", { entity_id: entityId });
  }

  _render() {
    if (!this._hass || !this._built) return;
    const lang = this._lang();
    const strings = STRINGS[lang] || STRINGS.English;

    const enabledLanguages = this._enabledLanguages();
    const langSelect = this.querySelector(".ct-lang");
    const currentOptions = Array.from(langSelect.options).map((o) => o.value);
    if (currentOptions.join(",") !== enabledLanguages.join(",")) {
      langSelect.innerHTML = "";
      for (const l of enabledLanguages) {
        const opt = document.createElement("option");
        opt.value = l;
        opt.textContent = l;
        langSelect.appendChild(opt);
      }
    }
    if (langSelect.value !== lang) langSelect.value = lang;

    const dateEl = this.querySelector(".ct-date");
    dateEl.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    this.querySelector(".ct-instructions").textContent = strings.instructions;

    const byRoom = {};
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("switch.cleaning_task_")) continue;
      const attrs = state.attributes || {};
      if (!attrs.due) continue;
      const room = attrs.room || "Other";
      (byRoom[room] = byRoom[room] || []).push({ entityId, state, attrs });
    }

    const roomsEl = this.querySelector(".ct-rooms");
    roomsEl.innerHTML = "";
    const roomNames = Object.keys(byRoom).sort();
    if (roomNames.length === 0) {
      roomsEl.innerHTML = `<div style="opacity:0.7;padding:8px 0;">${strings.nothingDue}</div>`;
      return;
    }

    const allTasks = Object.values(byRoom).flat();
    const allDone = allTasks.length > 0 && allTasks.every((t) => t.state.state === "on");
    if (allDone) {
      const banner = document.createElement("div");
      banner.style.cssText =
        "break-inside:avoid;font-weight:600;color:green;background:var(--secondary-background-color);" +
        "border-radius:var(--ha-card-border-radius,12px);padding:12px 16px;margin-bottom:12px;text-align:center;";
      banner.textContent = strings.allDone;
      roomsEl.appendChild(banner);
    }

    for (const room of roomNames) {
      const tasks = byRoom[room];
      tasks.sort((a, b) => {
        const doneA = a.state.state === "on" ? 1 : 0;
        const doneB = b.state.state === "on" ? 1 : 0;
        if (doneA !== doneB) return doneA - doneB;
        return this._taskLabel(a.attrs).localeCompare(this._taskLabel(b.attrs));
      });

      const section = document.createElement("div");
      section.style.breakInside = "avoid";
      section.style.marginBottom = "16px";

      const heading = document.createElement("div");
      heading.textContent = room;
      heading.style.cssText = "font-weight:600;font-size:1.05em;margin-bottom:6px;";
      section.appendChild(heading);

      for (const task of tasks) {
        section.appendChild(this._taskRow(task, strings));
      }
      roomsEl.appendChild(section);
    }
  }

  _taskRow({ entityId, state, attrs }, strings) {
    const done = state.state === "on";
    const lang = this._lang();
    const label = this._taskLabel(attrs);
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;min-height:52px;padding:0 8px 0 12px;margin-bottom:6px;" +
      "border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color,var(--secondary-background-color));";

    const icon = document.createElement("ha-icon");
    icon.icon = "mdi:broom";
    icon.style.color = done ? "green" : "";

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;overflow:hidden;flex:1;cursor:pointer;min-width:0;";
    const name = document.createElement("span");
    name.textContent = label;
    name.style.cssText = `font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${done ? "text-decoration:line-through;color:green;" : ""}`;
    const stateLabel = document.createElement("span");
    stateLabel.textContent = done ? strings.done : strings.do;
    stateLabel.style.cssText = `font-size:0.85em;opacity:0.75;${done ? "color:green;" : ""}`;
    body.appendChild(name);
    body.appendChild(stateLabel);
    body.addEventListener("click", () => this._toggle(entityId));

    const googleCode = GOOGLE_LANG[lang];
    if (googleCode) {
      // label is already the cached translation if we had one; this just
      // fills it in (and updates the DOM) the first time a task name is
      // seen in a given language.
      translateText(attrs.task_name || "", googleCode).then((translated) => {
        if (this._lang() === lang) name.textContent = translated;
      });
    }

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.style.cssText =
      "-webkit-appearance:none;appearance:none;box-sizing:border-box;flex:0 0 28px;min-width:28px;width:28px;height:28px;" +
      "padding:0;margin:0;border:none;outline:none;background:transparent;cursor:pointer;display:flex;align-items:center;" +
      "justify-content:center;-webkit-tap-highlight-color:transparent;";
    const speakIcon = document.createElement("ha-icon");
    speakIcon.icon = "mdi:volume-high";
    speakIcon.style.cssText = "--mdc-icon-size:20px;width:20px;height:20px;";
    speakBtn.appendChild(speakIcon);
    speakBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._speak(attrs);
    });

    row.appendChild(icon);
    row.appendChild(body);
    row.appendChild(speakBtn);
    return row;
  }

  getCardSize() {
    return 6;
  }
}

customElements.define("cleaning-today-card", CleaningTodayCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "cleaning-today-card",
  name: "Cleaning Today Card",
  description: "Today's cleaning checklist, grouped by room, with a built-in speak button and language picker.",
});
