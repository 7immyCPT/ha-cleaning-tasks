/**
 * cleaning-task-editor-card
 * -----------------
 * Search, add, edit, and remove rooms and tasks - talks to the integration
 * over WebSocket commands (cleaning_tasks/room/*, cleaning_tasks/task/*),
 * backed by Home Assistant's own async Store (not raw file I/O). Edits
 * save immediately on blur/change, same "no separate save button" feel as
 * the rest of these cards.
 *
 * Also has CSV export (current rooms/tasks) and CSV import (replaces the
 * current rooms/tasks with what's in the file - export, edit in a
 * spreadsheet, reimport).
 */
class CleaningTaskEditorCard extends HTMLElement {
  setConfig(config) {
    this._config = config || {};
    if (!this._built) {
      this._built = true;
      this.innerHTML = `
        <ha-card header="Rooms &amp; tasks">
          <div style="padding:0 16px 16px;">
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
              <input class="te-search" type="search" placeholder="Search rooms or tasks..." style="flex:1;min-width:160px;padding:8px 10px;border-radius:8px;border:1px solid var(--divider-color);background:var(--card-background-color);color:var(--primary-text-color);">
              <button class="te-add-room" type="button" style="padding:8px 12px;border-radius:8px;border:none;background:var(--primary-color);color:var(--text-primary-color,#fff);cursor:pointer;">+ Room</button>
              <button class="te-export" type="button" style="padding:8px 12px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;">Export CSV</button>
              <label class="te-import-label" style="padding:8px 12px;border-radius:8px;border:1px solid var(--divider-color);background:transparent;color:var(--primary-text-color);cursor:pointer;">
                Import CSV
                <input class="te-import" type="file" accept=".csv" style="display:none;">
              </label>
            </div>
            <div class="te-status" style="font-size:0.85em;opacity:0.75;margin-bottom:8px;"></div>
            <div class="te-rooms"></div>
          </div>
        </ha-card>`;
      this.style.display = "block";
      this._data = { rooms: [], tasks: [] };
      this._search = "";
      this.querySelector(".te-search").addEventListener("input", (ev) => {
        this._search = ev.target.value.toLowerCase();
        this._renderRooms();
      });
      this.querySelector(".te-add-room").addEventListener("click", () => this._addRoom());
      this.querySelector(".te-export").addEventListener("click", () => this._exportCsv());
      this.querySelector(".te-import").addEventListener("change", (ev) => this._importCsv(ev));
    }
    if (this._hass) this._load();
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (first) this._load();
  }

  async _load() {
    this._data = await this._hass.callWS({ type: "cleaning_tasks/list" });
    this._renderRooms();
  }

  _status(text) {
    this.querySelector(".te-status").textContent = text || "";
  }

  async _addRoom() {
    const name = window.prompt("Room name?");
    if (!name) return;
    const tracksUsage = window.confirm("Track \"used since last clean?\" for this room (e.g. a spare bedroom or the braai)?");
    this._data = await this._hass.callWS({ type: "cleaning_tasks/room/add", name, tracks_usage: tracksUsage });
    this._renderRooms();
  }

  async _removeRoom(roomId, name) {
    if (!window.confirm(`Remove "${name}" and all its tasks?`)) return;
    this._data = await this._hass.callWS({ type: "cleaning_tasks/room/remove", room_id: roomId });
    this._renderRooms();
  }

  async _updateRoom(roomId, fields) {
    this._data = await this._hass.callWS({ type: "cleaning_tasks/room/update", room_id: roomId, ...fields });
  }

  async _addTask(roomId) {
    const name = window.prompt("Task name (English)?");
    if (!name) return;
    this._data = await this._hass.callWS({ type: "cleaning_tasks/task/add", room_id: roomId, name });
    this._renderRooms();
  }

  async _removeTask(taskId, name) {
    if (!window.confirm(`Remove task "${name}"?`)) return;
    this._data = await this._hass.callWS({ type: "cleaning_tasks/task/remove", task_id: taskId });
    this._renderRooms();
  }

  async _updateTask(taskId, fields) {
    this._data = await this._hass.callWS({ type: "cleaning_tasks/task/update", task_id: taskId, ...fields });
  }

  _matches(room, task) {
    if (!this._search) return true;
    const haystack = [room.name, task && task.name, task && task.name_af, task && task.name_xh]
      .filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(this._search);
  }

  _renderRooms() {
    const el = this.querySelector(".te-rooms");
    el.innerHTML = "";
    const rooms = [...this._data.rooms].sort((a, b) => a.name.localeCompare(b.name));
    for (const room of rooms) {
      const tasks = this._data.tasks
        .filter((t) => t.room_id === room.id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const roomMatches = this._matches(room, null);
      const visibleTasks = tasks.filter((t) => roomMatches || this._matches(room, t));
      if (this._search && !roomMatches && visibleTasks.length === 0) continue;

      const section = document.createElement("div");
      section.style.cssText = "border:1px solid var(--divider-color);border-radius:10px;padding:10px 12px;margin-bottom:10px;";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";

      const nameInput = document.createElement("input");
      nameInput.value = room.name;
      nameInput.style.cssText = "flex:1;min-width:120px;font-weight:600;padding:4px 6px;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--primary-text-color);";
      nameInput.addEventListener("blur", () => {
        if (nameInput.value && nameInput.value !== room.name) this._updateRoom(room.id, { name: nameInput.value });
      });

      const tracksLabel = document.createElement("label");
      tracksLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:0.85em;white-space:nowrap;";
      const tracksCheckbox = document.createElement("input");
      tracksCheckbox.type = "checkbox";
      tracksCheckbox.checked = !!room.tracks_usage;
      tracksCheckbox.addEventListener("change", () => this._updateRoom(room.id, { tracks_usage: tracksCheckbox.checked }));
      tracksLabel.appendChild(tracksCheckbox);
      tracksLabel.appendChild(document.createTextNode("tracks usage"));

      const addTaskBtn = this._smallButton("+ task", () => this._addTask(room.id));
      const removeRoomBtn = this._smallButton("Remove room", () => this._removeRoom(room.id, room.name), true);

      header.appendChild(nameInput);
      header.appendChild(tracksLabel);
      header.appendChild(addTaskBtn);
      header.appendChild(removeRoomBtn);
      section.appendChild(header);

      const taskList = document.createElement("div");
      taskList.style.cssText = "margin-top:8px;";
      for (const task of visibleTasks) {
        taskList.appendChild(this._taskRow(task));
      }
      section.appendChild(taskList);
      el.appendChild(section);
    }
  }

  _taskRow(task) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--divider-color);";

    const mk = (value, placeholder, width) => {
      const input = document.createElement("input");
      input.value = value || "";
      input.placeholder = placeholder;
      input.style.cssText = `width:${width};padding:4px 6px;border:1px solid var(--divider-color);border-radius:6px;background:transparent;color:var(--primary-text-color);`;
      return input;
    };

    const nameInput = mk(task.name, "Task name (English)", "160px");
    const nameAfInput = mk(task.name_af, "Afrikaans", "120px");
    const nameXhInput = mk(task.name_xh, "isiXhosa", "120px");

    const unitSelect = document.createElement("select");
    unitSelect.style.cssText = "padding:4px 6px;border-radius:6px;";
    for (const u of ["week", "month"]) {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      if (u === task.unit) opt.selected = true;
      unitSelect.appendChild(opt);
    }

    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = "1";
    countInput.value = task.count;
    countInput.style.cssText = "width:48px;padding:4px 6px;border:1px solid var(--divider-color);border-radius:6px;background:transparent;color:var(--primary-text-color);";

    const usedLabel = document.createElement("label");
    usedLabel.style.cssText = "display:flex;align-items:center;gap:4px;font-size:0.85em;white-space:nowrap;";
    const usedCheckbox = document.createElement("input");
    usedCheckbox.type = "checkbox";
    usedCheckbox.checked = !!task.conditional_on_used;
    usedLabel.appendChild(usedCheckbox);
    usedLabel.appendChild(document.createTextNode("only if used"));

    const commit = () => {
      this._updateTask(task.id, {
        name: nameInput.value || task.name,
        name_af: nameAfInput.value,
        name_xh: nameXhInput.value,
        unit: unitSelect.value,
        count: parseInt(countInput.value, 10) || 1,
        conditional_on_used: usedCheckbox.checked,
      });
    };
    [nameInput, nameAfInput, nameXhInput, countInput].forEach((i) => i.addEventListener("blur", commit));
    unitSelect.addEventListener("change", commit);
    usedCheckbox.addEventListener("change", commit);

    const removeBtn = this._smallButton("✕", () => this._removeTask(task.id, task.name), true);
    removeBtn.style.marginLeft = "auto";

    row.appendChild(nameInput);
    row.appendChild(nameAfInput);
    row.appendChild(nameXhInput);
    row.appendChild(unitSelect);
    row.appendChild(countInput);
    row.appendChild(usedLabel);
    row.appendChild(removeBtn);
    return row;
  }

  _smallButton(label, onClick, danger) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.style.cssText =
      `padding:4px 10px;border-radius:8px;border:1px solid var(--divider-color);cursor:pointer;font-size:0.85em;` +
      (danger ? "background:transparent;color:var(--error-color,#c62828);" : "background:transparent;color:var(--primary-text-color);");
    btn.addEventListener("click", onClick);
    return btn;
  }

  async _exportCsv() {
    this._status("Exporting...");
    const resp = await this._hass.fetchWithAuth("/api/cleaning_tasks/export");
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "cleaning_tasks.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this._status("Exported.");
  }

  async _importCsv(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    if (!window.confirm("Importing replaces the current room/task list with what's in this file. Continue?")) {
      ev.target.value = "";
      return;
    }
    this._status("Importing...");
    const text = await file.text();
    const resp = await this._hass.fetchWithAuth("/api/cleaning_tasks/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });
    ev.target.value = "";
    if (!resp.ok) {
      this._status("Import failed.");
      return;
    }
    const result = await resp.json();
    this._status(`Imported ${result.rooms} room(s), ${result.tasks} task(s).`);
    await this._load();
  }

  getCardSize() {
    return 10;
  }
}

customElements.define("cleaning-task-editor-card", CleaningTaskEditorCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "cleaning-task-editor-card",
  name: "Cleaning Task Editor Card",
  description: "Search, add, edit, remove rooms/tasks, and CSV export/import.",
});
