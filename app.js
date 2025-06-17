// Constants - centralized và semantic
const CONFIG = {
  SCI: 0.01,
  DEADLINE_HOUR: 22,
  DEFAULT_WEEKLY_GOAL: 100,
  MAX_MISSED_DAYS: 2,
  DECIMAL_PLACES: 2,
  TIME: {
    WEEK_MS: 7 * 24 * 60 * 60 * 1000,
    DAY_MS: 24 * 60 * 60 * 1000,
    HOUR_MS: 60 * 60 * 1000,
    MINUTE_MS: 60 * 1000,
    SECOND_MS: 1000,
  },
};

// Storage abstraction - tách biệt logic storage
class Storage {
  static get(key, defaultValue = null) {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  static set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error("Storage failed:", error);
    }
  }

  static getDate(key) {
    const stored = localStorage.getItem(key);
    return stored ? new Date(stored) : new Date(0);
  }

  static setDate(key, date) {
    localStorage.setItem(key, date.toISOString());
  }
}

// Mission logic - pure functions, testable
class MissionLogic {
  static calculateBaseGain(mission) {
    const { lt_roi, avoidance, flow, st_roi } = mission;
    const flowValue = lt_roi <= 0.5 || avoidance <= 0.5 ? flow / 2 : flow;
    return lt_roi * 4 + avoidance * 3 + flowValue * 2 + st_roi;
  }

  static calculateGainMultiplier(mission) {
    const avoidanceBonus = mission.avoidance >= 0.8 ? 1.1 : 1;
    const ltRoiBonus = mission.lt_roi >= 0.8 ? 1.2 : 1;
    return avoidanceBonus * ltRoiBonus;
  }

  static calculateMomentumRate(mission) {
    const effectiveStreak = Math.max(mission.streak - mission.miss, 0);
    return Math.pow(1 + CONFIG.SCI, effectiveStreak);
  }

  static getGainSnapshot(mission) {
    const baseGain = this.calculateBaseGain(mission);
    const gainMultiplier = this.calculateGainMultiplier(mission);
    const momentumRate = this.calculateMomentumRate(mission);
    const gainWithMultiplier = baseGain * gainMultiplier;

    return {
      baseGain,
      gainMultiplier,
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
    mission.checkedState = false;
  }

  static completeMission(mission) {
    mission.streak++;
    mission.miss = 0;
    mission.checkedState = false;
  }
}

// Time utilities
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

  static formatCountdown(timeLeft) {
    const hours = Math.floor(timeLeft / CONFIG.TIME.HOUR_MS) % 24;
    const minutes = Math.floor(timeLeft / CONFIG.TIME.MINUTE_MS) % 60;
    const seconds = Math.floor(timeLeft / CONFIG.TIME.SECOND_MS) % 60;

    const pad = (n) => n.toString().padStart(2, "0");
    return `⏰ ${pad(hours)}:${pad(minutes)}:${pad(seconds)} ⏰`;
  }
}

// State management - clean separation
class AppState {
  constructor() {
    this.load();
  }

  load() {
    this.missions = Storage.get("missions", []);
    this.weeklyDeadline = Storage.getDate("weeklyDeadline");
    this.lastDeadline = Storage.getDate("lastDeadline");
    this.weeklyGoal = Storage.get("weeklyGoal", CONFIG.DEFAULT_WEEKLY_GOAL);
    this.piggyBank = Storage.get("piggyBank", 0);
    this.weeklyEarnedCoins = Storage.get("weeklyEarnedCoins", 0);

    // Reset daily coins if new day
    const now = new Date();
    this.dailyEarnedCoins = now > this.lastDeadline ? 0 : Storage.get("dailyEarnedCoins", 0);
  }

  save() {
    Storage.set("missions", this.missions);
    Storage.setDate("weeklyDeadline", this.weeklyDeadline);
    Storage.setDate("lastDeadline", this.lastDeadline);
    Storage.set("weeklyGoal", this.weeklyGoal);
    Storage.set("piggyBank", this.piggyBank);
    Storage.set("weeklyEarnedCoins", this.weeklyEarnedCoins);
    Storage.set("dailyEarnedCoins", this.dailyEarnedCoins);
  }

  addCoins(amount) {
    this.piggyBank += amount;
    this.weeklyEarnedCoins += amount;
    this.dailyEarnedCoins += amount;
  }

  removeCoins(amount) {
    this.piggyBank -= amount;
    this.weeklyEarnedCoins -= amount;
    this.dailyEarnedCoins -= amount;
  }

  resetWeeklyProgress() {
    this.weeklyEarnedCoins = 0;
    this.weeklyDeadline = new Date(Date.now() + CONFIG.TIME.WEEK_MS);
  }
}

// UI management - focused responsibility
class UIManager {
  constructor(state) {
    this.state = state;
    this.countdownInterval = null;
  }

  renderProgressSummary() {
    const elements = {
      "weekly-goal": this.state.weeklyGoal,
      "piggy-bank": this.state.piggyBank,
      "weekly-earned-coin": this.state.weeklyEarnedCoins,
      "daily-earned-coin": this.state.dailyEarnedCoins,
    };

    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = value.toFixed(CONFIG.DECIMAL_PLACES);
      }
    });
  }

  showGoalMessage(message) {
    const element = document.getElementById("goal-message");
    if (element) element.textContent = message;
  }

  renderMissionList() {
    const missionList = document.getElementById("mission-list");
    const emptyState = document.getElementById("empty-state");

    if (!missionList || !emptyState) return;

    if (this.state.missions.length === 0) {
      missionList.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    missionList.style.display = "grid";
    emptyState.style.display = "none";
    missionList.innerHTML = "";

    this.state.missions.forEach((mission, index) => {
      const card = this.createMissionCard(mission, index);
      missionList.appendChild(card);
    });
  }

  createMissionCard(mission, index) {
    const card = document.createElement("div");
    card.className = "mission-card";
    card.dataset.index = index;

    const gainData = MissionLogic.getGainSnapshot(mission);

    card.innerHTML = this.getMissionCardHTML(mission, gainData);
    this.setupMissionCardEvents(card, mission, index);

    return card;
  }

  getMissionCardHTML(mission, gainData) {
    const { baseGain, gainMultiplier, momentumRate, accumulativeGain } = gainData;

    return `
      <div class="mission-header">
        <input type="checkbox" class="mission-checkbox" ${mission.checkedState ? "checked" : ""}>
        <div class="mission-name ${mission.checkedState ? "completed" : ""}">${mission.name}</div>
      </div>
      
      <div class="stats-row">
        <span class="streak">🔥 Streak: ${mission.streak}</span>
        <span class="misses">💀 Misses: ${mission.miss}</span>
      </div>

      <div class="params-section">
        <h4>Parameters</h4>
        <div class="params-grid">
          ${this.createParamInputs(mission)}
        </div>
      </div>

      <div class="gains-section">
        <div class="gains-grid">
          <div class="gain-item">
            <div>Base Gain</div>
            <div class="gain-value base-gain">${baseGain.toFixed(CONFIG.DECIMAL_PLACES)}</div>
          </div>
          <div class="gain-item">
            <div>Base Multiplier</div>
            <div class="gain-value base-multiplier">${gainMultiplier.toFixed(
              CONFIG.DECIMAL_PLACES
            )}</div>
          </div>
          <div class="gain-item">
            <div>Momentum Rate</div>
            <div class="gain-value">${momentumRate.toFixed(CONFIG.DECIMAL_PLACES)}</div>
          </div>
          <div class="gain-item">
            <div>Accumulative Gain</div>
            <div class="gain-value accumulative-gain">${accumulativeGain.toFixed(
              CONFIG.DECIMAL_PLACES
            )}</div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-delete">Delete</button>
        <button class="btn btn-rename">Rename</button>
      </div>
    `;
  }

  createParamInputs(mission) {
    const params = ["lt_roi", "avoidance", "flow", "st_roi"];
    return params
      .map(
        (param) => `
      <div class="param-input">
        <label>${param}:</label>
        <input type="number" step="0.01" min="0" max="1" 
               value="${mission[param]}" data-param="${param}">
      </div>
    `
      )
      .join("");
  }

  setupMissionCardEvents(card, mission, index) {
    // Checkbox event
    const checkbox = card.querySelector(".mission-checkbox");
    checkbox.addEventListener("change", () => {
      this.onMissionToggle(mission, checkbox.checked, card);
    });

    // Parameter inputs
    card.querySelectorAll(".param-input input").forEach((input) => {
      input.addEventListener("input", (e) => {
        this.onParameterChange(mission, e.target, index, checkbox.checked);
      });
    });

    // Action buttons
    card.querySelector(".btn-delete").addEventListener("click", () => {
      this.onDeleteMission(index);
    });

    card.querySelector(".btn-rename").addEventListener("click", () => {
      this.onRenameMission(mission);
    });
  }

  onMissionToggle(mission, isChecked, card) {
    const gainData = MissionLogic.getGainSnapshot(mission);

    if (isChecked) {
      this.state.addCoins(gainData.accumulativeGain);
    } else {
      this.state.removeCoins(gainData.accumulativeGain);
    }

    mission.checkedState = isChecked;
    card.querySelector(".mission-name").classList.toggle("completed", isChecked);
    this.renderProgressSummary();
  }

  onParameterChange(mission, input, index, isChecked) {
    if (isChecked) {
      alert("Please uncheck the mission first before adjusting parameters.");
      input.value = mission[input.dataset.param];
      return;
    }

    // Clamp value
    const value = Math.max(0, Math.min(1, parseFloat(input.value) || 0));
    input.value = value;
    mission[input.dataset.param] = value;

    this.updateMissionGains(index);
  }

  updateMissionGains(index) {
    const mission = this.state.missions[index];
    const gainData = MissionLogic.getGainSnapshot(mission);
    const card = document.querySelector(`[data-index="${index}"]`);

    if (!card) return;

    card.querySelector(".base-gain").textContent = gainData.baseGain.toFixed(CONFIG.DECIMAL_PLACES);
    card.querySelector(".base-multiplier").textContent = gainData.gainMultiplier.toFixed(
      CONFIG.DECIMAL_PLACES
    );
    card.querySelector(".accumulative-gain").textContent = gainData.accumulativeGain.toFixed(
      CONFIG.DECIMAL_PLACES
    );
  }

  onDeleteMission(index) {
    if (confirm("Delete this mission?")) {
      this.state.missions.splice(index, 1);
      this.renderMissionList();
    }
  }

  onRenameMission(mission) {
    const newName = prompt("Rename mission:", mission.name)?.trim();
    if (newName) {
      mission.name = newName;
      this.renderMissionList();
    }
  }

  startCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    const updateCountdown = () => {
      const now = new Date();
      const deadline = TimeUtils.getCurrentDeadline();
      const timeLeft = deadline - now;

      const countdownElement = document.getElementById("countdown");
      if (countdownElement) {
        countdownElement.textContent = TimeUtils.formatCountdown(timeLeft);
      }
    };

    updateCountdown();
    this.countdownInterval = setInterval(updateCountdown, 1000);
  }
}

// Main application - orchestration
class GritCoin {
  constructor() {
    this.state = new AppState();
    this.ui = new UIManager(this.state);
    this.init();
  }

  init() {
    this.updateStatesOnAppOpen();
    this.checkWeeklyGoal();
    this.render();
    this.setupEventListeners();

    // Auto-save on page unload
    window.addEventListener("beforeunload", () => {
      this.state.save();
    });
  }

  updateStatesOnAppOpen() {
    const now = new Date();
    const lastDeadline = this.state.lastDeadline;
    this.state.lastDeadline = TimeUtils.getCurrentDeadline();

    if (lastDeadline.getTime() === 0) return; // First time opening

    const missGap = now - lastDeadline;
    if (missGap <= 0) return;

    this.state.missions.forEach((mission) => {
      if (missGap <= CONFIG.TIME.DAY_MS && mission.checkedState) {
        MissionLogic.completeMission(mission);
        return;
      }

      const daysMissed =
        mission.miss + Math.floor(missGap / CONFIG.TIME.DAY_MS) + (mission.checkedState ? 0 : 1);

      MissionLogic.updateMissionOnMiss(mission, daysMissed);
    });
  }

  checkWeeklyGoal() {
    if (this.state.missions.length === 0) return;

    const now = new Date();
    const deadlineGap = now - this.state.weeklyDeadline;
    const goalMet = this.state.weeklyEarnedCoins >= this.state.weeklyGoal;

    if (deadlineGap < 0 && !goalMet) return;

    const message =
      deadlineGap <= CONFIG.TIME.DAY_MS && goalMet
        ? "🎉 Congrats! You crushed your weekly goal! Time to reset, refocus, and rise again. Let's make next week legendary. 💪"
        : "⏳ The week's up, and the goal slipped away. But your grit doesn't reset with the clock. Let's regroup and come back stronger. 💡";

    this.ui.showGoalMessage(message);
    this.state.resetWeeklyProgress();
  }

  render() {
    this.ui.renderProgressSummary();
    this.ui.renderMissionList();
    this.ui.startCountdown();
  }

  addMission(formData) {
    const mission = {
      name: formData.name.trim(),
      lt_roi: parseFloat(formData.lt_roi) || 0,
      avoidance: parseFloat(formData.avoidance) || 0,
      flow: parseFloat(formData.flow) || 0,
      st_roi: parseFloat(formData.st_roi) || 0,
      checkedState: false,
      streak: 0,
      miss: 0,
    };

    this.state.missions.push(mission);

    // Set weekly deadline for first mission
    if (this.state.missions.length === 1) {
      this.state.weeklyDeadline = new Date(Date.now() + CONFIG.TIME.WEEK_MS);
    }

    this.ui.renderMissionList();
  }

  changeWeeklyGoal() {
    const newGoal = parseFloat(prompt("New weekly goal:", this.state.weeklyGoal));
    if (newGoal && newGoal > 0) {
      this.state.weeklyGoal = newGoal.toFixed(2);
      this.ui.renderProgressSummary();
    }
  }

  setupEventListeners() {
    const form = document.getElementById("mission-form");
    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        this.addMission(Object.fromEntries(formData));
        form.reset();
      });
    }

    const goalButton = document.getElementById("change-weekly-goal");
    if (goalButton) {
      goalButton.addEventListener("click", () => {
        this.changeWeeklyGoal();
      });
    }
  }
}

// Initialize app
document.addEventListener("DOMContentLoaded", () => {
  new GritCoin();
});
