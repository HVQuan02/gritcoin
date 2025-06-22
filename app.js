// Constants & Configuration
const CONFIG = Object.freeze({
  SCI: 0.01,
  DEADLINE_HOUR: 22,
  DEFAULT_WEEKLY_GOAL: 100,
  MAX_MISSED_DAYS: 2,
  DECIMAL_PLACES: 2,
  ON_TIME_THRESHOLD: 30,
  MAX_PUNISH: 0.2,
  TIME: Object.freeze({
    WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    DAY_MS: 24 * 60 * 60 * 1000,
    HOUR_MS: 60 * 60 * 1000,
    MINUTE_MS: 60 * 1000,
    SECOND_MS: 1000,
  }),
});

// Utility Classes
class Storage {
  static #safeGet(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static #safeSet(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Storage failed for ${key}:`, error);
    }
  }

  static get(key, defaultValue) {
    return this.#safeGet(key, defaultValue);
  }

  static set(key, value) {
    this.#safeSet(key, value);
  }

  static getDate(key) {
    try {
      const stored = localStorage.getItem(key);
      if (!stored) return new Date(0);

      const date = new Date(stored);
      return isNaN(date.getTime()) ? new Date(0) : date;
    } catch {
      return new Date(0);
    }
  }

  static setDate(key, date) {
    this.#safeSet(key, date.toISOString());
  }
}

class TimeUtils {
  static getCurrentDeadline() {
    const now = new Date();
    const deadline = new Date();
    deadline.setHours(CONFIG.DEADLINE_HOUR, 0, 0, 0);

    if (now > deadline) {
      deadline.setDate(deadline.getDate() + 1);
    }

    return deadline;
  }

  static #pad(n) {
    return n.toString().padStart(2, "0");
  }

  static formatTime(time) {
    const absTime = Math.abs(time);
    const hours = Math.floor(absTime / CONFIG.TIME.HOUR_MS) % 24;
    const minutes = Math.floor(absTime / CONFIG.TIME.MINUTE_MS) % 60;
    const seconds = Math.floor(absTime / CONFIG.TIME.SECOND_MS) % 60;
    const sign = time >= 0 ? "+" : "-";

    return `${sign}${this.#pad(hours)}:${this.#pad(minutes)}:${this.#pad(seconds)}`;
  }

  static getElapsedTime(mission) {
    return mission.actualEnd ? 0 : Date.now() - mission.actualStart;
  }

  static createTimeDate(timeStr) {
    const [hours, minutes] = timeStr.split(":");
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    return date;
  }

  static getTimeDeviation(mission) {
    if (!mission.actualStart || !mission.scheduledStart) return 0;
    const scheduledTime = this.createTimeDate(mission.scheduledStart);
    return mission.actualStart - scheduledTime;
  }

  static getActualDuration(mission) {
    if (!mission.actualStart || !mission.actualEnd) return 0;
    return mission.actualEnd - mission.actualStart;
  }

  static getScheduledDuration(mission) {
    if (!mission.scheduledStart || !mission.scheduledEnd) return 0;
    const scheduledStart = this.createTimeDate(mission.scheduledStart);
    const scheduledEnd = this.createTimeDate(mission.scheduledEnd);
    return scheduledEnd - scheduledStart;
  }
}

// Mission Logic
class Mission {
  static #calculateBaseGain(mission) {
    const { lt_roi, avoidance, flow, st_roi } = mission;
    const flowValue = lt_roi <= 0.5 || avoidance <= 0.5 ? flow / 2 : flow;
    return lt_roi * 4 + avoidance * 3 + flowValue * 2 + st_roi;
  }

  static #calculateBaseMultiplier(mission) {
    const ltRoiBonus = mission.lt_roi >= 0.8 ? 1.1 : 1;
    const avoidanceBonus = mission.avoidance >= 0.8 ? 1.1 : 1;
    return ltRoiBonus * avoidanceBonus;
  }

  static #calculateMomentumRate(mission) {
    const effectiveStreak = Math.max(mission.streak - mission.miss, 0);
    return Math.pow(1 + CONFIG.SCI, effectiveStreak);
  }

  static #calculateTimeAdherence(mission) {
    if (!mission.scheduledStart || !mission.actualStart) return 1.0;

    const timeDeviation = TimeUtils.getTimeDeviation(mission) / CONFIG.TIME.MINUTE_MS;
    const x = timeDeviation / CONFIG.ON_TIME_THRESHOLD;

    if (x <= 1) {
      return 1 + (1 - x) / 10;
    }

    const maxLate = AppState.getDailyDeadline() - TimeUtils.getScheduledDuration(mission);
    const punishFactor =
      (Math.min(timeDeviation, maxLate) - CONFIG.ON_TIME_THRESHOLD) /
      (maxLate - CONFIG.ON_TIME_THRESHOLD);
    return 1.0 - punishFactor * CONFIG.MAX_PUNISH;
  }

  static #calculateDurationAdherence(mission) {
    if (!mission.actualStart || !mission.actualEnd) return 1.0;

    const x = TimeUtils.getActualDuration(mission) / TimeUtils.getScheduledDuration(mission);

    if (x < 1) {
      return 1.0 - (1 - x) * CONFIG.MAX_PUNISH;
    }
    return 1 + Math.pow(x - 1, 0.5) * 0.5;
  }

  static createMission(formData) {
    return {
      name: formData.name.trim(),
      lt_roi: parseFloat(formData.lt_roi) || 0,
      avoidance: parseFloat(formData.avoidance) || 0,
      flow: parseFloat(formData.flow) || 0,
      st_roi: parseFloat(formData.st_roi) || 0,
      scheduledStart: formData.scheduledStart || "00:06",
      scheduledEnd: formData.scheduledEnd || "00:09",
      actualStart: null,
      actualEnd: null,
      checkedState: false,
      streak: 0,
      miss: 0,
    };
  }

  static getGainSnapshot(mission) {
    const baseGain = this.#calculateBaseGain(mission);
    const gainMultiplier = this.#calculateBaseMultiplier(mission);
    const timeAdherence = this.#calculateTimeAdherence(mission);
    const durationAdherence = this.#calculateDurationAdherence(mission);
    const momentumRate = this.#calculateMomentumRate(mission);
    const gainWithMultiplier = baseGain * gainMultiplier * timeAdherence * durationAdherence;

    return {
      baseGain,
      gainMultiplier,
      timeAdherence,
      durationAdherence,
      momentumRate,
      accumulativeGain:
        mission.miss > CONFIG.MAX_MISSED_DAYS
          ? gainWithMultiplier
          : gainWithMultiplier * momentumRate,
    };
  }

  static updateMissionOnMiss(mission, missedDays) {
    if (missedDays > CONFIG.MAX_MISSED_DAYS) {
      mission.streak = 0;
      mission.miss = 0;
    } else if (mission.streak > 0) {
      mission.miss = missedDays;
    }

    this.#resetMissionState(mission);
  }

  static completeMission(mission) {
    mission.streak++;
    mission.miss = 0;
    this.#resetMissionState(mission);
  }

  static #resetMissionState(mission) {
    mission.checkedState = false;
    mission.actualStart = null;
    mission.actualEnd = null;
  }
}

// Application State
class AppState {
  #missions = [];
  #weeklyDeadline = new Date(0);
  #dailyDeadline = new Date(0);
  #weeklyGoal = CONFIG.DEFAULT_WEEKLY_GOAL;
  #piggyBank = 0;
  #weeklyEarnedCoins = 0;
  #dailyEarnedCoins = 0;
  #motivationQuote = "";

  constructor() {
    this.#load();
  }

  #load() {
    this.#missions = Storage.get("missions", []);
    this.#weeklyDeadline = Storage.getDate("weeklyDeadline");
    this.#dailyDeadline = Storage.getDate("dailyDeadline");
    this.#weeklyGoal = Storage.get("weeklyGoal", CONFIG.DEFAULT_WEEKLY_GOAL);
    this.#piggyBank = Storage.get("piggyBank", 0);
    this.#weeklyEarnedCoins = Storage.get("weeklyEarnedCoins", 0);
    this.#motivationQuote = Storage.get("motivationQuote", "");

    const now = new Date();
    this.#dailyEarnedCoins = now > this.#dailyDeadline ? 0 : Storage.get("dailyEarnedCoins", 0);
  }

  save() {
    const data = {
      missions: this.#missions,
      weeklyGoal: this.#weeklyGoal,
      piggyBank: this.#piggyBank,
      weeklyEarnedCoins: this.#weeklyEarnedCoins,
      dailyEarnedCoins: this.#dailyEarnedCoins,
      motivationQuote: this.#motivationQuote,
    };

    Object.entries(data).forEach(([key, value]) => Storage.set(key, value));
    Storage.setDate("weeklyDeadline", this.#weeklyDeadline);
    Storage.setDate("dailyDeadline", this.#dailyDeadline);
  }

  // Getters
  get missions() {
    return this.#missions;
  }
  get weeklyDeadline() {
    return this.#weeklyDeadline;
  }
  get dailyDeadline() {
    return this.#dailyDeadline;
  }
  get weeklyGoal() {
    return this.#weeklyGoal;
  }
  get piggyBank() {
    return this.#piggyBank;
  }
  get weeklyEarnedCoins() {
    return this.#weeklyEarnedCoins;
  }
  get dailyEarnedCoins() {
    return this.#dailyEarnedCoins;
  }
  get motivationQuote() {
    return this.#motivationQuote;
  }

  // Setters
  set weeklyGoal(value) {
    this.#weeklyGoal = value;
  }
  set motivationQuote(value) {
    this.#motivationQuote = value;
  }
  set dailyDeadline(value) {
    this.#dailyDeadline = value;
  }

  addCoins(amount) {
    this.#piggyBank += amount;
    this.#weeklyEarnedCoins += amount;
    this.#dailyEarnedCoins += amount;
  }

  removeCoins(amount) {
    this.#piggyBank -= amount;
    this.#weeklyEarnedCoins -= amount;
    this.#dailyEarnedCoins -= amount;
  }

  addMission(mission) {
    this.#missions.push(mission);

    // Set weekly deadline for first mission
    if (this.#missions.length === 1) {
      this.#weeklyDeadline = new Date(Date.now() + CONFIG.TIME.WEEK_MS);
    }
  }

  removeMission(index) {
    this.#missions.splice(index, 1);
  }

  hasMissionNameExisted(missionName) {
    const processedName = missionName.trim().toLowerCase();
    return this.#missions.some((mission) => mission.name.trim().toLowerCase() === processedName);
  }

  resetWeeklyProgress() {
    this.#weeklyEarnedCoins = 0;
    this.#weeklyDeadline = new Date(Date.now() + CONFIG.TIME.WEEK_MS);
  }

  static getDailyDeadline() {
    return Storage.getDate("dailyDeadline");
  }
}

// UI Management
class UIManager {
  #state;
  #dailyDeadlineInterval = null;
  #progressIntervals = new Map();

  constructor(state) {
    this.#state = state;
  }

  #getElement(id) {
    return document.getElementById(id);
  }

  #createElement(tag, className = "", content = "") {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (content) element.innerHTML = content;
    return element;
  }

  renderProgressSummary() {
    const elements = {
      "weekly-goal": this.#state.weeklyGoal,
      "piggy-bank": this.#state.piggyBank,
      "weekly-earned-coin": this.#state.weeklyEarnedCoins,
      "daily-earned-coin": this.#state.dailyEarnedCoins,
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = this.#getElement(id);
      if (element) {
        element.textContent = value.toFixed(CONFIG.DECIMAL_PLACES);
      }
    });
  }

  renderMotivationQuote() {
    const quoteElement = this.#getElement("motivation-quote");
    if (quoteElement) {
      quoteElement.textContent = this.#state.motivationQuote;
    }
  }

  showGoalMessage(message) {
    const element = this.#getElement("goal-message");
    if (element) {
      element.textContent = message;
    }
  }

  renderMissionList() {
    const missionList = this.#getElement("mission-list");
    const emptyState = this.#getElement("empty-state");

    if (!missionList || !emptyState) return;

    if (this.#state.missions.length === 0) {
      missionList.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    missionList.style.display = "grid";
    emptyState.style.display = "none";
    missionList.innerHTML = "";

    this.#state.missions.forEach((mission, index) => {
      const card = this.#createMissionCard(mission, index);
      missionList.appendChild(card);

      if (mission.actualStart && !mission.actualEnd) {
        this.#startProgressTimer(mission, index);
      }
    });
  }

  addMissionCard(mission, index) {
    const missionList = this.#getElement("mission-list");
    const emptyState = this.#getElement("empty-state");

    if (!missionList || !emptyState) return;

    if (this.#state.missions.length === 1) {
      missionList.style.display = "grid";
      emptyState.style.display = "none";
    }

    const card = this.#createMissionCard(mission, index);
    missionList.appendChild(card);

    if (mission.actualStart && !mission.actualEnd) {
      this.#startProgressTimer(mission, index);
    }
  }

  removeMissionCard(index) {
    const card = document.querySelector(`.mission-card[data-index="${index}"]`);
    card?.remove();
  }

  updateMissionCard(mission, index) {
    const existingCard = document.querySelector(`.mission-card[data-index="${index}"]`);
    if (!existingCard) return;

    const gainData = Mission.getGainSnapshot(mission);
    existingCard.innerHTML = this.#getMissionCardHTML(mission, index, gainData);
    this.#setupMissionCardEvents(existingCard, mission, index);

    if (mission.actualStart && !mission.actualEnd) {
      this.#startProgressTimer(mission, index);
    }
  }

  #createMissionCard(mission, index) {
    const card = this.#createElement("div", "mission-card");
    card.dataset.index = index;

    const gainData = Mission.getGainSnapshot(mission);
    card.innerHTML = this.#getMissionCardHTML(mission, index, gainData);
    this.#setupMissionCardEvents(card, mission, index);

    return card;
  }

  #getMissionCardHTML(mission, index, gainData) {
    const {
      baseGain,
      gainMultiplier,
      timeAdherence,
      durationAdherence,
      momentumRate,
      accumulativeGain,
    } = gainData;

    return `
      <div class="mission-header">
        <input type="checkbox" class="mission-checkbox" ${mission.checkedState ? "checked" : ""}>
        <div class="mission-name ${mission.checkedState ? "completed" : ""}">${mission.name}</div>
        <div class="actions">
          <button class="btn btn-delete">Delete</button>
          <button class="btn btn-rename">Rename</button>
        </div>
      </div>

      <div class="stats-row">
        <span class="streak">🔥 Streak: ${mission.streak}</span>
        <span class="misses">💀 Misses: ${mission.miss}</span>
      </div>

      <div class="progress-section">
        <div class="progress-clock" data-mission-index="${index}">
          <span class="clock-time">⏰ +00:00:00</span>
          ${
            mission.actualStart
              ? `<div class="deviation-info">${TimeUtils.formatTime(
                  TimeUtils.getTimeDeviation(mission)
                )}</div>`
              : ""
          }
          ${
            mission.actualEnd
              ? `<div class="actual-duration">${TimeUtils.formatTime(
                  TimeUtils.getActualDuration(mission)
                )}</div>`
              : ""
          }
        </div>
        <div class="progress-buttons">
          ${this.#getProgressButtonHTML(mission, index)}
        </div>
      </div>

      <div class="params-section">
        <h4>Parameters</h4>
        <div class="params-grid">
          ${this.#createParamInputs(mission)}
        </div>
      </div>

      <div class="gains-section">
        <div class="gains-grid">
          ${this.#createGainsHTML(
            baseGain,
            gainMultiplier,
            timeAdherence,
            durationAdherence,
            momentumRate,
            accumulativeGain
          )}
        </div>
      </div>
    `;
  }

  #getProgressButtonHTML(mission, index) {
    if (mission.actualStart && !mission.actualEnd) {
      return `<button class="btn btn-end-mission" data-mission-index="${index}">End Mission</button>`;
    } else if (!mission.actualEnd) {
      return `<button class="btn btn-start-mission" data-mission-index="${index}">Start Mission</button>`;
    }
    return "";
  }

  #createGainsHTML(
    baseGain,
    gainMultiplier,
    timeAdherence,
    durationAdherence,
    momentumRate,
    accumulativeGain
  ) {
    const gains = [
      { label: "Base Gain", value: baseGain, className: "base-gain" },
      { label: "Base Multiplier", value: gainMultiplier, className: "base-multiplier" },
      { label: "Time Adherence", value: timeAdherence },
      { label: "Duration Adherence", value: durationAdherence },
      { label: "Momentum Rate", value: momentumRate },
      { label: "Accumulative Gain", value: accumulativeGain, className: "accumulative-gain" },
    ];

    return gains
      .map(
        ({ label, value, className = "" }) => `
      <div class="gain-item">
        <div>${label}</div>
        <div class="gain-value ${className}">${value.toFixed(CONFIG.DECIMAL_PLACES)}</div>
      </div>
    `
      )
      .join("");
  }

  #createParamInputs(mission) {
    const params = ["lt_roi", "avoidance", "flow", "st_roi"];
    const paramInputs = params
      .map(
        (param) => `
      <div class="param-input">
        <label>${param}:</label>
        <input type="number" min="0" max="1" step="0.01" 
               value="${mission[param]}" data-param="${param}" required>
      </div>
    `
      )
      .join("");

    const timeInputs = `
      <div class="time-inputs">
        <div class="time-input">
          <label>Start Time:</label>
          <input type="time" value="${mission.scheduledStart}" data-param="scheduledStart">
        </div>
        <div class="time-input">
          <label>End Time:</label>
          <input type="time" value="${mission.scheduledEnd}" data-param="scheduledEnd">
        </div>
      </div>
    `;

    return paramInputs + timeInputs;
  }

  #setupMissionCardEvents(card, mission, index) {
    // Checkbox event
    const checkbox = card.querySelector(".mission-checkbox");
    checkbox.addEventListener("change", () => {
      this.#onMissionToggle(mission, checkbox.checked, card);
    });

    // Parameter inputs
    card.querySelectorAll(".param-input input").forEach((input) => {
      input.addEventListener("blur", (e) => {
        this.#onParameterBlur(mission, e.target, index, checkbox.checked);
      });
    });

    // Time inputs
    card.querySelectorAll(".time-input input").forEach((input) => {
      input.addEventListener("change", (e) => {
        this.#onTimeInputChange(mission, e.target, checkbox.checked);
      });
    });

    // Mission control buttons
    const startButton = card.querySelector(".btn-start-mission");
    const endButton = card.querySelector(".btn-end-mission");

    startButton?.addEventListener("click", () => this.#onStartMission(mission, index));
    endButton?.addEventListener("click", () => this.#onEndMission(mission, index));

    // Management buttons
    card.querySelector(".btn-delete").addEventListener("click", () => {
      this.onDeleteMission(mission, index);
    });

    card.querySelector(".btn-rename").addEventListener("click", () => {
      this.onRenameMission(mission, index);
    });
  }

  #onMissionToggle(mission, isChecked, card) {
    if (mission.actualStart && !mission.actualEnd) {
      alert("You cannot check a mission while it is still active. Please end the mission first!");
      card.querySelector(".mission-checkbox").checked = false;
      return;
    }

    const { accumulativeGain } = Mission.getGainSnapshot(mission);

    if (isChecked) {
      this.#state.addCoins(accumulativeGain);
    } else {
      this.#state.removeCoins(accumulativeGain);
    }

    mission.checkedState = isChecked;
    card.querySelector(".mission-name").classList.toggle("completed", isChecked);
    this.renderProgressSummary();
  }

  #onParameterBlur(mission, input, index, isChecked) {
    if (isChecked) {
      alert("Please uncheck the mission first before adjusting parameters!");
      input.value = mission[input.dataset.param];
      return;
    }

    const value = parseFloat(input.value);
    if (isNaN(value) || value < 0 || value > 1) {
      input.value = mission[input.dataset.param];
      return;
    }

    const roundedValue = parseFloat(value.toFixed(CONFIG.DECIMAL_PLACES));
    input.value = mission[input.dataset.param] = roundedValue;
    this.#renderMissionGains(index);
  }

  #onTimeInputChange(mission, input, isChecked) {
    if (isChecked) {
      alert("Please uncheck the mission first before changing time!");
      input.value = mission[input.dataset.param];
      return;
    }

    const timeValue = input.value.trim();
    if (!timeValue) {
      input.value = mission[input.dataset.param];
      return;
    }

    mission[input.dataset.param] = timeValue;
  }

  #onStartMission(mission, index) {
    mission.actualStart = Date.now();
    this.#startProgressTimer(mission, index);
    this.updateMissionCard(mission, index);
  }

  #onEndMission(mission, index) {
    mission.actualEnd = Date.now();
    this.#stopProgressTimer(index);
    this.updateMissionCard(mission, index);
  }

  #startProgressTimer(mission, index) {
    if (this.#progressIntervals.has(index)) {
      clearInterval(this.#progressIntervals.get(index));
    }

    const startTime = Date.now();
    const initialElapsed = TimeUtils.getElapsedTime(mission);

    const interval = setInterval(() => {
      const clockElement = document.querySelector(`[data-mission-index="${index}"] .clock-time`);
      if (clockElement) {
        const currentElapsed = initialElapsed + (Date.now() - startTime);
        clockElement.textContent = `⏰ ${TimeUtils.formatTime(currentElapsed)}`;
      }
    }, 1000);

    this.#progressIntervals.set(index, interval);
  }

  #stopProgressTimer(index) {
    if (this.#progressIntervals.has(index)) {
      clearInterval(this.#progressIntervals.get(index));
      this.#progressIntervals.delete(index);
    }
  }

  #renderMissionGains(index) {
    const mission = this.#state.missions[index];
    const gainData = Mission.getGainSnapshot(mission);
    const card = document.querySelector(`[data-index="${index}"]`);

    if (!card) return;

    const elements = {
      ".base-gain": gainData.baseGain,
      ".base-multiplier": gainData.gainMultiplier,
      ".accumulative-gain": gainData.accumulativeGain,
    };

    Object.entries(elements).forEach(([selector, value]) => {
      const element = card.querySelector(selector);
      if (element) {
        element.textContent = value.toFixed(CONFIG.DECIMAL_PLACES);
      }
    });
  }

  onDeleteMission(mission, index) {
    if (!confirm("Delete this mission?")) return;

    const { accumulativeGain } = Mission.getGainSnapshot(mission);
    if (mission.checkedState) {
      this.#state.removeCoins(accumulativeGain);
    }

    this.#state.removeMission(index);
    this.removeMissionCard(index);
    this.renderProgressSummary();
  }

  onRenameMission(mission, index) {
    const newName = prompt("Rename mission:", mission.name)?.trim();
    if (newName) {
      mission.name = newName;
      this.updateMissionCard(mission, index);
    }
  }

  startCountdown() {
    if (this.#dailyDeadlineInterval) {
      clearInterval(this.#dailyDeadlineInterval);
    }

    const updateCountdown = () => {
      const now = new Date();
      const deadline = TimeUtils.getCurrentDeadline();
      const timeLeft = deadline - now;

      const countdownElement = this.#getElement("countdown");
      if (countdownElement) {
        countdownElement.textContent = `⌛ ${TimeUtils.formatTime(timeLeft)}`;
      }
    };

    updateCountdown();
    this.#dailyDeadlineInterval = setInterval(updateCountdown, 1000);
  }

  cleanup() {
    if (this.#dailyDeadlineInterval) {
      clearInterval(this.#dailyDeadlineInterval);
    }
    this.#progressIntervals.forEach((interval) => clearInterval(interval));
    this.#progressIntervals.clear();
  }
}

// Main Application Class
class GritCoin {
  #state;
  #ui;

  constructor() {
    this.#state = new AppState();
    this.#ui = new UIManager(this.#state);
    this.#init();
  }

  #init() {
    this.#updateStatesOnAppOpen();
    this.#checkWeeklyGoal();
    this.#render();
    this.#setupEventListeners();

    window.addEventListener("beforeunload", () => {
      this.#state.save();
      this.#ui.cleanup();
    });
  }

  #updateStatesOnAppOpen() {
    const now = new Date();
    const dailyDeadline = this.#state.dailyDeadline;
    this.#state.dailyDeadline = TimeUtils.getCurrentDeadline();

    if (dailyDeadline.getTime() === 0) return;

    const missGap = now - dailyDeadline;
    if (missGap <= 0) return;

    this.#state.missions.forEach((mission) => {
      if (missGap <= CONFIG.TIME.DAY_MS && mission.checkedState) {
        Mission.completeMission(mission);
        return;
      }

      const daysMissed =
        mission.miss + Math.floor(missGap / CONFIG.TIME.DAY_MS) + (mission.checkedState ? 0 : 1);

      Mission.updateMissionOnMiss(mission, daysMissed);
    });
  }

  #checkWeeklyGoal() {
    if (this.#state.missions.length === 0) return;

    const now = new Date();
    const deadlineGap = now - this.#state.weeklyDeadline;
    const goalMet = this.#state.weeklyEarnedCoins >= this.#state.weeklyGoal;

    if (deadlineGap < 0 && !goalMet) return;

    const message =
      deadlineGap <= CONFIG.TIME.DAY_MS && goalMet
        ? "🎉 Congrats! You crushed your weekly goal! Time to reset, refocus, and rise again. Let's make next week legendary. 💪"
        : "⏳ The week's up, and an goal slipped away. But your grit doesn't reset with the clock. Let's regroup and come back stronger. 💡";
    this.#ui.showGoalMessage(message);
    this.#state.resetWeeklyProgress();
  }

  #render() {
    this.#ui.renderMotivationQuote();
    this.#ui.renderProgressSummary();
    this.#ui.renderMissionList();
    this.#ui.startCountdown();
  }

  #addMission(formData) {
    const mission = Mission.createMission(formData);
    this.#state.addMission(mission);
    this.#ui.addMissionCard(mission, this.#state.missions.length - 1);
  }

  #changeWeeklyGoal() {
    const newGoal = parseFloat(prompt("New weekly goal:", this.#state.weeklyGoal));
    if (newGoal && newGoal > 0) {
      this.#state.weeklyGoal = newGoal;
      this.#ui.renderProgressSummary();
    }
  }

  #changeMotivationQuote() {
    const newQuote = prompt("New quote:", this.#state.motivationQuote)?.trim();
    if (newQuote) {
      this.#state.motivationQuote = newQuote;
      this.#ui.renderMotivationQuote();
    }
  }

  #setupEventListeners() {
    const form = document.getElementById("mission-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        const missionName = formData.get("name").trim();

        if (this.#state.hasMissionNameExisted(missionName)) {
          alert("A mission with this name already exists. Please choose a different name!");
          return;
        }

        this.#addMission(Object.fromEntries(formData));
        form.reset();
      });
    }

    const goalButton = document.getElementById("change-weekly-goal");
    if (goalButton) {
      goalButton.addEventListener("click", () => this.#changeWeeklyGoal());
    }

    const quoteButton = document.getElementById("change-quote");
    if (quoteButton) {
      quoteButton.addEventListener("click", () => this.#changeMotivationQuote());
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new GritCoin();
});
