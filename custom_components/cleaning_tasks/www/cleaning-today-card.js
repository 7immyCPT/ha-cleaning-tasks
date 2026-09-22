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
 * ‹ › arrows next to the date browse 7 days back through 7 days forward
 * (today included). Today is the live, interactive checklist (tick things
 * off, speak, etc.) exactly as before; any other day - past or future - is
 * a read-only preview fetched from the backend
 * (cleaning_tasks/week_preview), computed with the same due-date/weather
 * logic. A past day is the same schedule preview as a future one, not an
 * actual completion record (the store only keeps each task's most recent
 * completion date, not a full history, so "was this exact task done on
 * that exact day" isn't something the data can answer). It also can't
 * predict a conditional_on_used room's future "used" flag, so those are
 * shown using today's current flag as a best guess and labeled "If room
 * is used".
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

// Last-resort HA Cloud voice for devices with no usable Web Speech voice
// at all (Android WebView - the HA Companion app and most kiosk browsers -
// exposes speechSynthesis but has zero voices, so speak() is silent). A
// language without its own cloud voice gets read in South African English,
// which beats silence.
const HA_CLOUD_FALLBACK = { language: "en-ZA", voices: [{ id: "LeahNeural", label: "Leah" }] };

// Mobile browsers (iOS Safari, Android WebView) only let audio start
// inside the tap itself - anything after an await (translation fetch,
// tts_get_url) is outside it and gets blocked, while desktop Chrome is
// lenient. So each tap synchronously plays a silent clip on one shared
// <audio> element, which unlocks that element for the real clip later,
// and the first tap also speaks an empty utterance to unlock
// speechSynthesis on iOS.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICA" +
  "gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";
let _ttsAudio = null;
let _speechUnlocked = false;

function unlockAudioForTap() {
  if (!_ttsAudio) _ttsAudio = new Audio();
  _ttsAudio.onended = null;
  _ttsAudio.onerror = null;
  _ttsAudio.src = SILENT_WAV;
  _ttsAudio.play().catch(() => {});
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    if (!_speechUnlocked) {
      _speechUnlocked = true;
      const unlock = new SpeechSynthesisUtterance("");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
  }
}

// Mobile browsers load the voice list lazily and return [] until asked at
// least once, so kick that off at load rather than on the first tap.
if ("speechSynthesis" in window) window.speechSynthesis.getVoices();

async function playHaCloudTts(hass, text, lang, voiceId) {
  const config = HA_CLOUD_TTS[lang] || HA_CLOUD_FALLBACK;
  const result = await hass.callApi("POST", "tts_get_url", {
    engine_id: "tts.home_assistant_cloud",
    message: text,
    language: config.language,
    options: { voice: voiceId || config.voices[0].id },
  });
  const audio = _ttsAudio || new Audio();
  await new Promise((resolve, reject) => {
    audio.onended = resolve;
    audio.onerror = reject;
    audio.src = result.path;
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
          <div class="ct-header" style="padding:16px 16px 8px;">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;align-items:center;gap:2px;flex-wrap:wrap;">
                <button class="ct-day-prev" type="button" title="Previous day" style="flex:0 0 auto;width:28px;height:28px;padding:0;border:none;background:transparent;color:var(--primary-text-color);cursor:pointer;border-radius:6px;font-size:1.1em;">‹</button>
                <div class="ct-date" style="font-size:1.15em;font-weight:600;white-space:nowrap;"></div>
                <button class="ct-day-next" type="button" title="Next day" style="flex:0 0 auto;width:28px;height:28px;padding:0;border:none;background:transparent;color:var(--primary-text-color);cursor:pointer;border-radius:6px;font-size:1.1em;">›</button>
                <button class="ct-day-today" type="button" style="display:none;margin-left:2px;padding:3px 10px;border-radius:12px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);font-size:0.8em;cursor:pointer;white-space:nowrap;">Today</button>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <select class="ct-lang" style="padding:4px 6px;border-radius:8px;max-width:140px;"></select>
                <button class="ct-mark-all" type="button" title="Mark every task on this list as done (password-protected)" style="flex:0 0 auto;width:32px;height:32px;padding:0;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;font-size:1em;display:flex;align-items:center;justify-content:center;">🔒</button>
                <button class="ct-print" type="button" title="Download a printable A4 checklist for this list" style="flex:0 0 auto;width:32px;height:32px;padding:0;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;font-size:1em;display:flex;align-items:center;justify-content:center;">🖨️</button>
              </div>
            </div>
            <div class="ct-instructions" style="opacity:0.75;font-size:0.85em;margin-top:6px;"></div>
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
      this.querySelector(".ct-mark-all").addEventListener("click", () => this._markAllDone());
      this.querySelector(".ct-day-prev").addEventListener("click", () => this._shiftDay(-1));
      this.querySelector(".ct-day-next").addEventListener("click", () => this._shiftDay(1));
      this.querySelector(".ct-day-today").addEventListener("click", () => this._shiftDay(-this._dayOffset));
    }
    this._render();
  }

  // Small masked-input dialog - native window.prompt() can't mask input,
  // so this builds a minimal password-field modal instead. Resolves to the
  // entered string, or null if cancelled (Escape, backdrop click, Cancel).
  _promptPassword() {
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;";
      const box = document.createElement("div");
      box.style.cssText =
        "background:var(--card-background-color,var(--primary-background-color,#fff));color:var(--primary-text-color);" +
        "padding:20px;border-radius:var(--ha-card-border-radius,12px);min-width:240px;max-width:90vw;box-shadow:0 4px 20px rgba(0,0,0,0.4);";
      box.innerHTML = `
        <div style="font-weight:600;margin-bottom:10px;">Enter password</div>
        <input type="password" inputmode="numeric" autocomplete="off" style="width:100%;box-sizing:border-box;padding:8px 10px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);font-size:1em;">
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
          <button class="ct-pw-cancel" type="button" style="padding:6px 14px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;">Cancel</button>
          <button class="ct-pw-ok" type="button" style="padding:6px 14px;border-radius:8px;border:none;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer;">OK</button>
        </div>`;
      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const input = box.querySelector("input");
      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };
      box.querySelector(".ct-pw-cancel").addEventListener("click", () => finish(null));
      box.querySelector(".ct-pw-ok").addEventListener("click", () => finish(input.value));
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") finish(input.value);
        if (ev.key === "Escape") finish(null);
      });
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) finish(null);
      });
      setTimeout(() => input.focus(), 0);
    });
  }

  // After the PIN: every still-open task, grouped by room and all ticked,
  // so anything that was actually missed can be unticked before marking.
  // Resolves to the ticked items' keys, or null if cancelled.
  _promptChecklist(items) {
    if (items.length === 0) return Promise.resolve([]);
    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;";
      const box = document.createElement("div");
      box.style.cssText =
        "background:var(--card-background-color,var(--primary-background-color,#fff));color:var(--primary-text-color);" +
        "padding:20px;border-radius:var(--ha-card-border-radius,12px);width:min(420px,92vw);max-height:85vh;display:flex;" +
        "flex-direction:column;box-shadow:0 4px 20px rgba(0,0,0,0.4);box-sizing:border-box;";
      box.innerHTML = `
        <div style="font-weight:600;margin-bottom:4px;">Mark as done</div>
        <div style="font-size:0.85em;opacity:0.75;margin-bottom:10px;">Untick anything that wasn't done.</div>
        <label style="display:flex;align-items:center;gap:8px;padding:4px 0 8px;border-bottom:1px solid var(--divider-color);cursor:pointer;">
          <input class="ct-cl-all" type="checkbox" checked style="width:18px;height:18px;"> <span>All</span>
        </label>
        <div class="ct-cl-list" style="overflow-y:auto;flex:1;min-height:0;padding-top:6px;"></div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px;">
          <button class="ct-cl-cancel" type="button" style="padding:6px 14px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;">Cancel</button>
          <button class="ct-cl-ok" type="button" style="padding:6px 14px;border-radius:8px;border:none;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer;"></button>
        </div>`;

      const list = box.querySelector(".ct-cl-list");
      const byRoom = {};
      for (const item of items) (byRoom[item.room] = byRoom[item.room] || []).push(item);
      const boxes = [];
      for (const room of Object.keys(byRoom).sort()) {
        const heading = document.createElement("div");
        heading.textContent = room;
        heading.style.cssText = "font-weight:600;font-size:0.9em;margin:8px 0 2px;";
        list.appendChild(heading);
        for (const item of byRoom[room].sort((a, b) => a.label.localeCompare(b.label))) {
          const row = document.createElement("label");
          row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.checked = true;
          cb.dataset.key = item.key;
          cb.style.cssText = "width:18px;height:18px;flex:0 0 auto;";
          const text = document.createElement("span");
          text.textContent = item.label;
          row.appendChild(cb);
          row.appendChild(text);
          list.appendChild(row);
          boxes.push(cb);
        }
      }

      const allBox = box.querySelector(".ct-cl-all");
      const okBtn = box.querySelector(".ct-cl-ok");
      const update = () => {
        const n = boxes.filter((b) => b.checked).length;
        okBtn.textContent = `Mark ${n} done`;
        okBtn.disabled = n === 0;
        okBtn.style.opacity = n === 0 ? "0.5" : "1";
        allBox.checked = n === boxes.length;
        allBox.indeterminate = n > 0 && n < boxes.length;
      };
      boxes.forEach((b) => b.addEventListener("change", update));
      allBox.addEventListener("change", () => {
        boxes.forEach((b) => { b.checked = allBox.checked; });
        update();
      });
      update();

      overlay.appendChild(box);
      document.body.appendChild(overlay);
      const finish = (value) => {
        overlay.remove();
        resolve(value);
      };
      box.querySelector(".ct-cl-cancel").addEventListener("click", () => finish(null));
      okBtn.addEventListener("click", () => finish(boxes.filter((b) => b.checked).map((b) => b.dataset.key)));
      overlay.addEventListener("click", (ev) => {
        if (ev.target === overlay) finish(null);
      });
    });
  }

  // PIN is checked server-side (cleaning_tasks/pin/verify) against
  // store.mark_all_pin() - never hardcoded here, and never sent to this
  // (possibly non-admin, kiosk) session even on a wrong guess. Still just
  // a deterrent against an accidental tap wiping out the whole list, not
  // real security - the check is easy to bypass by anyone editing this
  // file. Works on today's live list (real switch.turn_on, same path a
  // manual tick uses) or on a past day's catch-up preview
  // (cleaning_tasks/task/mark_done_for_date) - never on a future day,
  // since nothing there has happened yet.
  async _markAllDone() {
    if (this._dayOffset > 0) return;
    const entered = await this._promptPassword();
    if (entered === null) return;
    const { valid } = await this._hass.callWS({ type: "cleaning_tasks/pin/verify", pin: entered });
    if (!valid) {
      window.alert("Incorrect password.");
      return;
    }

    if (this._dayOffset === 0) {
      const open = Object.entries(this._hass.states)
        .filter(([id, state]) => id.startsWith("switch.cleaning_task_") && state.attributes.due && state.state !== "on")
        .map(([id, state]) => ({ key: id, room: state.attributes.room || "Other", label: this._taskLabel(state.attributes) }));
      const targets = await this._promptChecklist(open);
      if (!targets || targets.length === 0) return;
      await Promise.all(targets.map((id) => this._hass.callService("switch", "turn_on", { entity_id: id })));
      return;
    }

    const offset = this._dayOffset;
    const dateIso = this._isoForOffset(offset);
    const day = await this._previewCache[offset];
    const open = (day && day.tasks ? day.tasks : [])
      .filter((t) => !t.done)
      .map((t) => ({ key: t.task_id, room: t.room || "Other", label: this._taskLabel({ task_name: t.task_name }) }));
    const picked = await this._promptChecklist(open);
    if (!picked || picked.length === 0) return;
    const targets = picked.map((task_id) => ({ task_id }));
    await Promise.all(
      targets.map((t) => this._hass.callWS({ type: "cleaning_tasks/task/mark_done_for_date", task_id: t.task_id, date: dateIso, done: true }))
    );
    delete this._previewCache[offset];
    this._render();
  }

  async _toggleDoneForDate(taskId, dateIso, done) {
    await this._hass.callWS({ type: "cleaning_tasks/task/mark_done_for_date", task_id: taskId, date: dateIso, done });
    delete this._previewCache[this._dayOffset];
    this._render();
  }

  _shiftDay(delta) {
    const next = Math.min(7, Math.max(-7, this._dayOffset + delta));
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

  // Must be called straight from the tap handler (no await before it) -
  // see unlockAudioForTap().
  async _speak(attrs) {
    unlockAudioForTap();
    const lang = this._lang();
    const english = attrs.task_name || "";
    // The row render already warmed the translation cache, so this is
    // normally synchronous; only fetch if it genuinely isn't cached yet.
    const googleCode = GOOGLE_LANG[lang];
    let text = _cachedTranslation(english, googleCode);
    if (googleCode && text === english) text = await translateText(english, googleCode);
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

    const cloudFallback = () => playHaCloudTts(this._hass, text, lang, null).catch(() => {});
    const voices = "speechSynthesis" in window ? window.speechSynthesis.getVoices() : [];
    if (!voices.length) {
      await cloudFallback();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG_CODE[lang] || "en-ZA";
    if (voiceName && !cloudVoiceId) {
      const voice = voices.find((v) => v.name === voiceName);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    // e.g. Android Chrome rejects a lang it has no voice for with
    // "language-unavailable" instead of falling back to a default voice.
    utterance.onerror = (ev) => {
      if (ev.error !== "interrupted" && ev.error !== "canceled") cloudFallback();
    };
    // Held on the instance: Chrome can garbage-collect an unreferenced
    // utterance mid-speech and silently cut it off.
    this._utterance = utterance;
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

  // Prints whichever day is on screen: today's live list, or another day's
  // server preview (the same list the card is showing for that day).
  async _downloadPrintable() {
    const offset = this._dayOffset;
    let byRoom = this._lastByRoom || {};
    let previewDay = null;
    if (offset !== 0) {
      previewDay = await (this._previewCache[offset] ||
        this._hass.callWS({ type: "cleaning_tasks/week_preview" }).then((r) => r.days.find((d) => d.offset === offset)));
      byRoom = {};
      for (const task of (previewDay && previewDay.tasks) || []) {
        const room = task.room || "Other";
        (byRoom[room] = byRoom[room] || []).push({ attrs: { task_name: task.task_name } });
      }
    }
    const roomNames = Object.keys(byRoom).sort();
    const html = this._buildPrintableHtml(roomNames, byRoom, offset, previewDay);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateSlug = this._isoForOffset(offset);
    a.href = url;
    a.download = `cleaning-checklist-${dateSlug}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  _buildPrintableHtml(roomNames, byRoom, offset = 0, previewDay = null) {
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const dateLabel = this._dateForOffset(offset).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    let heading = `Cleaning checklist — ${esc(dateLabel)}`;
    let note = "";
    if (offset !== 0) {
      if (!previewDay || !previewDay.is_cleaning_day) {
        note = "Not a cleaning day.";
      } else if (roomNames.length === 0) {
        note = "Nothing is scheduled for this day.";
      } else if (offset > 0) {
        note = "Planned list - weather or room usage on the day may still change it slightly.";
      }
    } else if (roomNames.length === 0) {
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

  _isoForOffset(offset) {
    const d = this._dateForOffset(offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
    prevBtn.disabled = this._dayOffset <= -7;
    prevBtn.style.opacity = prevBtn.disabled ? "0.3" : "1";
    nextBtn.disabled = this._dayOffset >= 7;
    nextBtn.style.opacity = nextBtn.disabled ? "0.3" : "1";
    this.querySelector(".ct-day-today").style.display = this._dayOffset === 0 ? "none" : "inline-block";
    this.querySelector(".ct-print").style.display = "inline-block";
    this.querySelector(".ct-mark-all").style.display = this._dayOffset <= 0 ? "inline-block" : "none";

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
        for (const day of result.days) this._previewCache[day.offset] = day;
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

    const interactive = offset < 0; // catch-up marking allowed for past days only
    const dateIso = day.date;
    for (const room of roomNames) {
      const tasks = [...byRoom[room]].sort((a, b) => {
        if (interactive && a.done !== b.done) return a.done ? 1 : -1;
        return this._taskLabel({ task_name: a.task_name }).localeCompare(this._taskLabel({ task_name: b.task_name }));
      });
      const section = document.createElement("div");
      section.style.breakInside = "avoid";
      section.style.marginBottom = "16px";

      const heading = document.createElement("div");
      heading.textContent = room;
      heading.style.cssText = "font-weight:600;font-size:1.05em;margin-bottom:6px;";
      section.appendChild(heading);

      for (const task of tasks) {
        section.appendChild(this._taskRowPreview(task, interactive, dateIso));
      }
      roomsEl.appendChild(section);
    }
  }

  _taskRowPreview(task, interactive, dateIso) {
    const attrs = { task_name: task.task_name };
    const label = this._taskLabel(attrs);
    const done = interactive && task.done;
    const row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;gap:8px;min-height:52px;padding:0 8px 0 12px;margin-bottom:6px;" +
      (interactive ? "" : "opacity:0.85;") +
      "border-radius:var(--ha-card-border-radius,12px);background:var(--card-background-color,var(--secondary-background-color));";

    const icon = document.createElement("ha-icon");
    icon.icon = task.conditional_on_used ? "mdi:help-circle-outline" : task.weather_deferred ? "mdi:weather-rainy" : "mdi:broom";
    if (done) icon.style.color = "green";

    const body = document.createElement("div");
    body.style.cssText = `display:flex;flex-direction:column;overflow:hidden;flex:1;min-width:0;${interactive ? "cursor:pointer;" : ""}`;
    const name = document.createElement("span");
    name.textContent = label;
    name.style.cssText = `font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${done ? "text-decoration:line-through;color:green;" : ""}`;
    const note = document.createElement("span");
    note.style.cssText = `font-size:0.85em;opacity:0.75;${done ? "color:green;" : ""}`;
    note.textContent = done
      ? "Done"
      : task.weather_deferred
        ? "Weather-permitting"
        : task.conditional_on_used
          ? "If room is used"
          : interactive
            ? "Do"
            : "Scheduled";
    body.appendChild(name);
    body.appendChild(note);
    if (interactive) {
      body.addEventListener("click", () => this._toggleDoneForDate(task.task_id, dateIso, !done));
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
