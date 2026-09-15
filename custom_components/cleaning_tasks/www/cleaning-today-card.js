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
 * kiosk and admin alike): task names switch to that language's translation
 * when the task has one (falls back to the English name), chrome text
 * switches too, and the speak button uses that language's chosen voice.
 */
const STRINGS = {
  English: {
    instructions: "Tick each task off as you finish it. Tap the speaker icon to have it read aloud.",
    nothingDue: "Nothing due today.",
    do: "Do",
    done: "Done",
  },
  Afrikaans: {
    instructions: "Merk elke taak af soos jy dit voltooi. Tik op die luidsprekerikoon om dit hardop te laat lees.",
    nothingDue: "Niks is vandag nodig nie.",
    do: "Doen",
    done: "Klaar",
  },
  isiXhosa: {
    instructions: "Phawula umsebenzi ngamunye njengoko uwugqiba. Cofa iayikhoni yesipikha ukuze ifundwe ngokuzwakalayo.",
    nothingDue: "Akukho nto ifunekayo namhlanje.",
    do: "Yenza",
    done: "Kwenziwe",
  },
};

const LANG_FIELD = { English: "task_name", Afrikaans: "task_name_af", isiXhosa: "task_name_xh" };

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

  _taskLabel(attrs) {
    const field = LANG_FIELD[this._lang()] || "task_name";
    return attrs[field] || attrs.task_name || "";
  }

  _speak(attrs) {
    const text = this._taskLabel(attrs);
    if (!text || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const lang = this._lang();
    const voiceState = this._hass && this._hass.states["text.cleaning_voice_name"];
    let voiceName = "";
    if (voiceState) {
      try {
        voiceName = (JSON.parse(voiceState.state) || {})[lang] || "";
      } catch (e) {
        voiceName = "";
      }
    }
    if (voiceName) {
      const voice = window.speechSynthesis.getVoices().find((v) => v.name === voiceName);
      if (voice) utterance.voice = voice;
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

    const langSelect = this.querySelector(".ct-lang");
    if (langSelect.children.length === 0) {
      for (const l of Object.keys(STRINGS)) {
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
