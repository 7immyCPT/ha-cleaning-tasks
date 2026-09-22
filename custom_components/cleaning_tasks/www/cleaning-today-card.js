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
 *
 * ‹ › arrows next to the date browse today plus the next 6 days. Today is
 * the live, interactive checklist (tick things off, speak, etc.) exactly
 * as before; any other day is a read-only preview fetched from the
 * backend (cleaning_tasks/week_preview), computed with the same due-date/
 * weather logic - it can't predict a conditional_on_used room's future
 * "used" flag, so those are shown using today's current flag as a best
 * guess and labeled "If room is used".
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

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_LABELS = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

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
              <div style="display:flex;align-items:center;gap:4px;">
                <button class="ct-day-prev" type="button" title="Previous day" style="flex:0 0 auto;width:28px;height:28px;padding:0;border:none;background:transparent;color:var(--primary-text-color);cursor:pointer;border-radius:6px;">‹</button>
                <div class="ct-date" style="font-size:1.3em;font-weight:600;white-space:nowrap;"></div>
                <button class="ct-day-next" type="button" title="Next day" style="flex:0 0 auto;width:28px;height:28px;padding:0;border:none;background:transparent;color:var(--primary-text-color);cursor:pointer;border-radius:6px;">›</button>
                <button class="ct-day-today" type="button" style="display:none;margin-left:4px;padding:3px 10px;border-radius:12px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);font-size:0.8em;cursor:pointer;white-space:nowrap;">Today</button>
              </div>
              <div class="ct-instructions" style="opacity:0.75;font-size:0.9em;margin-top:4px;"></div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;">
              <select class="ct-lang" style="padding:4px 6px;border-radius:8px;"></select>
              <button class="ct-print" type="button" title="Download a printable A4 checklist for this list" style="padding:6px 10px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;white-space:nowrap;">🖨️ Print</button>
            </div>
          </div>
          <div class="ct-rooms" style="padding:0 16px 16px;column-width:320px;column-gap:16px;"></div>
        </ha-card>`;
      this.style.display = "block";
      this._dayOffset = 0;
      this._previewCache = {};
      this.querySelector(".ct-lang").addEventListener("change", (ev) => {
        this._hass.callService("select", "select_option", {
          entity_id: "select.cleaning_display_language",
          option: ev.target.value,
        });
      });
      this.querySelector(".ct-print").addEventListener("click", () => this._downloadPrintable());
      this.querySelector(".ct-day-prev").addEventListener("click", () => this._shiftDay(-1));
      this.querySelector(".ct-day-next").addEventListener("click", () => this._shiftDay(1));
      this.querySelector(".ct-day-today").addEventListener("click", () => this._shiftDay(-this._dayOffset));
    }
    this._render();
  }

  _shiftDay(delta) {
    const next = Math.min(6, Math.max(0, this._dayOffset + delta));
    if (next === this._dayOffset) return;
    this._dayOffset = next;
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

  // Finds today's weekday (if it's a cleaning day) or, failing that, the
  // next upcoming one that's toggled on - used so the printable list still
  // makes sense on a day nothing is due.
  _nextCleaningDay() {
    const todayIdx = (new Date().getDay() + 6) % 7; // JS getDay(): 0=Sun -> convert to 0=Mon
    for (let offset = 0; offset < 7; offset++) {
      const idx = (todayIdx + offset) % 7;
      const day = WEEKDAYS[idx];
      const state = this._hass.states[`switch.cleaning_day_${day}`];
      if (state && state.state === "on") {
        return { day, label: WEEKDAY_LABELS[day], offset };
      }
    }
    return null;
  }

  _downloadPrintable() {
    const byRoom = this._lastByRoom || {};
    const roomNames = Object.keys(byRoom).sort();
    const html = this._buildPrintableHtml(roomNames, byRoom);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateSlug = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `cleaning-checklist-${dateSlug}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _buildPrintableHtml(roomNames, byRoom) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const now = new Date();
    const dateLabel = now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    let heading = `Cleaning checklist — ${esc(dateLabel)}`;
    let note = "";
    if (roomNames.length === 0) {
      const next = this._nextCleaningDay();
      if (next && next.offset === 0) {
        note = "It's a cleaning day, but nothing is currently due.";
      } else if (next) {
        heading = `Cleaning checklist — next cleaning day: ${esc(next.label)}`;
        note = "This list will only fill in on the day itself (some tasks depend on weather or usage) - come back and print again once it's due.";
      } else {
        note = "No cleaning days are currently turned on.";
      }
    }

    const sections = roomNames.map((room) => {
      const tasks = [...byRoom[room]].sort((a, b) => (a.attrs.task_name || "").localeCompare(b.attrs.task_name || ""));
      const items = tasks.map((t) => `
        <li class="task">
          <span class="box"></span>
          <span class="label">${esc(t.attrs.task_name || "")}</span>
        </li>`).join("");
      return `<section class="room"><h2>${esc(room)}</h2><ul>${items}</ul></section>`;
    }).join("");

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(heading)}</title>
<style>
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; }
  h1 { font-size: 1.4em; margin: 0 0 4px; }
  .note { font-size: 0.9em; color: #555; margin-bottom: 16px; }
  .rooms { column-width: 260px; column-gap: 28px; }
  section.room { break-inside: avoid; margin-bottom: 18px; }
  h2 { font-size: 1.05em; border-bottom: 1px solid #999; padding-bottom: 3px; margin: 0 0 6px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li.task { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 0.95em; }
  .box { flex: 0 0 14px; width: 14px; height: 14px; border: 1.5px solid #333; margin-top: 2px; }
  .label { flex: 1; }
  @media print {
    .print-hint { display: none; }
  }
  .print-hint { margin-top: 24px; font-size: 0.8em; color: #888; }
</style>
</head>
<body>
  <h1>${heading}</h1>
  ${note ? `<div class="note">${esc(note)}</div>` : ""}
  <div class="rooms">${sections}</div>
  <div class="print-hint">Open this file and use your browser's Print (Ctrl/Cmd+P), paper size A4.</div>
</body>
</html>`;
  }

  _dateForOffset(offset) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d;
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
    dateEl.textContent = this._dateForOffset(this._dayOffset).toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long", year: "numeric",
    });
    this.querySelector(".ct-instructions").textContent = strings.instructions;
    const prevBtn = this.querySelector(".ct-day-prev");
    const nextBtn = this.querySelector(".ct-day-next");
    prevBtn.disabled = this._dayOffset <= 0;
    prevBtn.style.opacity = prevBtn.disabled ? "0.3" : "1";
    nextBtn.disabled = this._dayOffset >= 6;
    nextBtn.style.opacity = nextBtn.disabled ? "0.3" : "1";
    this.querySelector(".ct-day-today").style.display = this._dayOffset === 0 ? "none" : "inline-block";
    this.querySelector(".ct-print").style.display = this._dayOffset === 0 ? "inline-block" : "none";

    if (this._dayOffset === 0) {
      this._renderLive(strings);
    } else {
      this._renderPreview(strings);
    }
  }

  _renderLive(strings) {
    const byRoom = {};
    for (const [entityId, state] of Object.entries(this._hass.states)) {
      if (!entityId.startsWith("switch.cleaning_task_")) continue;
      const attrs = state.attributes || {};
      if (!attrs.due) continue;
      const room = attrs.room || "Other";
      (byRoom[room] = byRoom[room] || []).push({ entityId, state, attrs });
    }
    this._lastByRoom = byRoom;
    this._lastLang = this._lang();

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

  // Other days of the week: read-only, based on a server-computed preview
  // (cleaning_tasks/week_preview) using the same due-date/weather logic as
  // today's live list - nothing here can be ticked off, since it isn't
  // real yet. Cached per offset for the life of the card; the point is
  // browsing, not a live feed.
  async _renderPreview(strings) {
    const offset = this._dayOffset;
    let cached = this._previewCache[offset];
    if (!cached) {
      cached = this._hass.callWS({ type: "cleaning_tasks/week_preview" }).then((result) => {
        for (let i = 0; i < result.days.length; i++) this._previewCache[i] = result.days[i];
        return this._previewCache[offset];
      });
      this._previewCache[offset] = cached;
    }

    const roomsEl = this.querySelector(".ct-rooms");
    if (roomsEl.dataset.previewOffset !== String(offset)) {
      roomsEl.innerHTML = `<div style="opacity:0.6;padding:8px 0;">…</div>`;
    }

    const day = await cached;
    // The offset (and thus which day this resolves to) may have moved on
    // again while the fetch was in flight - only paint if still current.
    if (this._dayOffset !== offset || !this._hass) return;
    roomsEl.dataset.previewOffset = String(offset);

    roomsEl.innerHTML = "";
    if (!day || !day.is_cleaning_day) {
      roomsEl.innerHTML = `<div style="opacity:0.7;padding:8px 0;">${strings.nothingDue}</div>`;
      return;
    }

    const byRoom = {};
    for (const task of day.tasks) {
      (byRoom[task.room || "Other"] = byRoom[task.room || "Other"] || []).push(task);
    }
    const roomNames = Object.keys(byRoom).sort();
    if (roomNames.length === 0) {
      roomsEl.innerHTML = `<div style="opacity:0.7;padding:8px 0;">${strings.nothingDue}</div>`;
      return;
    }

    for (const room of roomNames) {
      const tasks = [...byRoom[room]].sort((a, b) =>
        this._taskLabel({ task_name: a.task_name }).localeCompare(this._taskLabel({ task_name: b.task_name }))
      );
      const section = document.createElement("div");
      section.style.breakInside = "avoid";
      section.style.marginBottom = "16px";

      const heading = document.createElement("div");
      heading.textContent = room;
      heading.style.cssText = "font-weight:600;font-size:1.05em;margin-bottom:6px;";
      section.appendChild(heading);

      for (const task of tasks) {
        section.appendChild(this._taskRowPreview(task));
      }
      roomsEl.appendChild(section);
    }
  }

  _taskRowPreview(task) {
    const attrs = { task_name: task.task_name };
    const label = this._taskLabel(attrs);
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;min-height:52px;padding:0 8px 0 12px;margin-bottom:6px;opacity:0.85;" +
      "border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color,var(--secondary-background-color));";

    const icon = document.createElement("ha-icon");
    icon.icon = task.conditional_on_used ? "mdi:help-circle-outline" : task.weather_deferred ? "mdi:weather-rainy" : "mdi:broom";

    const body = document.createElement("div");
    body.style.cssText = "display:flex;flex-direction:column;overflow:hidden;flex:1;min-width:0;";
    const name = document.createElement("span");
    name.textContent = label;
    name.style.cssText = "font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
    const note = document.createElement("span");
    note.style.cssText = "font-size:0.85em;opacity:0.75;";
    note.textContent = task.weather_deferred
      ? "Weather-permitting"
      : task.conditional_on_used
        ? "If room is used"
        : "Scheduled";
    body.appendChild(name);
    body.appendChild(note);

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
