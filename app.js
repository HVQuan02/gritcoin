const SCI = 0.01;
const DEADLINE_HOUR = 22;
const DEFAULT_WEEKLY_GOAL = 100;
const MAX_MISSED_DAYS = 2;
const DECIMAL_PLACES = 2;

const ONE_WEEK_IN_MS = 604800000;
const ONE_DAY_IN_MS = 86400000;
const ONE_HOUR_IN_MS = 3600000;
const ONE_MINUTE_IN_MS = 60000;
const ONE_SECOND_IN_MS = 1000;

class StateManager {
  constructor() {
    this.loadStates();
  }

  loadStates() {
    this.missions = JSON.parse(localStorage.getItem("missions") || "[]");
    this.weeklyDeadline = new Date(localStorage.getItem("weeklyDeadline"));
    this.lastDeadline = new Date(localStorage.getItem("lastDeadline"));
    this.weeklyGoal = parseFloat(localStorage.getItem("weeklyGoal")) || DEFAULT_WEEKLY_GOAL;
    this.piggyBank = parseFloat(localStorage.getItem("piggyBank")) || 0;
    this.weeklyEarnedCoins = parseFloat(localStorage.getItem("weeklyEarnedCoins")) || 0;
    this.dailyEarnedCoins =
      new Date() > this.lastDeadline ? 0 : parseFloat(localStorage.getItem("dailyEarnedCoins"));
    this.countdownInterval = null;
  }

  saveStates() {
    localStorage.setItem("missions", JSON.stringify(this.missions));
    localStorage.setItem("weeklyDeadline", this.weeklyDeadline.toISOString());
    localStorage.setItem("lastDeadline", this.lastDeadline.toISOString());
    localStorage.setItem("weeklyGoal", this.weeklyGoal);
    localStorage.setItem("piggyBank", this.piggyBank);
    localStorage.setItem("weeklyEarnedCoins", this.weeklyEarnedCoins);
    localStorage.setItem("dailyEarnedCoins", this.dailyEarnedCoins);
  }
}

class GritCoin {
  constructor() {
    this.states = new StateManager();
    this.init();
  }

  init() {
    this.updateStatesOnAppOpen();
    this.notifyIfWeeklyGoalAchieved();

    this.renderProgressSummary();
    this.renderMissionList();
    this.startCountdown();

    this.setupEventListeners();

    onbeforeunload = () => this.states.saveStates();
  }

  getCurrentDeadline() {
    const now = new Date();
    const deadline = new Date();
    deadline.setHours(DEADLINE_HOUR, 0, 0, 0);
    if (now > deadline) deadline.setDate(deadline.getDate() + 1);
    return deadline;
  }

  completeMission(mission) {
    mission.streak++;
    mission.miss = 0;
    mission.checkedState = false;
  }

  resetMission(mission) {
    mission.streak = 0;
    mission.miss = 0;
    mission.checkedState = false;
  }

  missMission(mission, missedDays) {
    mission.miss = missedDays;
    mission.checkedState = false;
  }

  updateStatesOnAppOpen() {
    const now = new Date();
    const lastDeadline = this.states.lastDeadline;
    this.states.lastDeadline = this.getCurrentDeadline();

    if (lastDeadline.getTime() === 0) return; // first time open app, no states

    const missGapInMs = now - lastDeadline;
    if (missGapInMs <= 0) return;

    this.states.missions.forEach((mission) => {
      if (missGapInMs <= ONE_DAY_IN_MS && mission.checkedState) {
        this.completeMission(mission);
        return;
      }

      const daysMissed =
        mission.miss + Math.floor(missGapInMs / ONE_DAY_IN_MS) + !mission.checkedState;
      if (daysMissed > MAX_MISSED_DAYS) this.resetMission(mission);
      else if (mission.streak) this.missMission(mission, daysMissed);
    });
  }

  notifyIfWeeklyGoalAchieved() {
    if (this.states.missions.length === 0) return;

    const now = new Date();
    const meetsRequiredCoinTarget = this.states.weeklyEarnedCoins >= this.states.weeklyGoal;
    const deadlineGap = now - this.states.weeklyDeadline;

    if (deadlineGap < 0 && !meetsRequiredCoinTarget) return;

    const successMessage =
      "🎉 Congrats! You crushed your weekly goal!" +
      "Time to reset, refocus, and rise again. " +
      "Let’s make next week legendary. 💪";
    const failureMessage =
      "⏳ The week’s up, and the goal slipped away. " +
      "But your grit doesn’t reset with the clock. " +
      "Let’s regroup and come back stronger. 💡";

    if (deadlineGap > ONE_DAY_IN_MS || !meetsRequiredCoinTarget)
      document.getElementById("goal-message").textContent = failureMessage;
    else document.getElementById("goal-message").textContent = successMessage;

    this.states.weeklyEarnedCoins = 0;
    this.states.weeklyDeadline = now + ONE_WEEK_IN_MS;
  }

  renderProgressSummary() {
    document.getElementById("weekly-goal").textContent =
      this.states.weeklyGoal.toFixed(DECIMAL_PLACES);
    document.getElementById("piggy-bank").textContent =
      this.states.piggyBank.toFixed(DECIMAL_PLACES);
    document.getElementById("weekly-earned-coin").textContent =
      this.states.weeklyEarnedCoins.toFixed(DECIMAL_PLACES);
    document.getElementById("daily-earned-coin").textContent =
      this.states.dailyEarnedCoins.toFixed(DECIMAL_PLACES);
  }

  calculateBaseGain(mission) {
    const flowValue =
      mission.lt_roi <= 0.5 || mission.avoidance <= 0.5 ? mission.flow / 2 : mission.flow;
    return mission.lt_roi * 4 + mission.avoidance * 3 + flowValue * 2 + mission.st_roi;
  }

  calculateGainMultiplier(mission) {
    const avoidanceMultiplier = mission.avoidance >= 0.8 ? 1.1 : 1;
    const ltRoiMultiplier = mission.lt_roi >= 0.8 ? 1.2 : 1;
    return avoidanceMultiplier * ltRoiMultiplier;
  }

  calculateMomentumRate(mission) {
    const effectiveStreak = Math.max(mission.streak - mission.miss, 0);
    return Math.pow(1 + SCI, effectiveStreak);
  }

  getGainSnapshot(mission) {
    const baseGain = this.calculateBaseGain(mission);
    const gainMultiplier = this.calculateGainMultiplier(mission);
    const momentumRate = this.calculateMomentumRate(mission);
    const gainWithMultiplier = baseGain * gainMultiplier;
    return {
      baseGain,
      gainMultiplier: gainMultiplier,
      momentumRate,
      accumulativeGain:
        mission.miss > MAX_MISSED_DAYS ? gainWithMultiplier : gainWithMultiplier * momentumRate,
    };
  }

  addCoinsOnCheckingMission(mission) {
    const { accumulativeGain } = this.getGainSnapshot(mission);
    this.states.piggyBank += accumulativeGain;
    this.states.weeklyEarnedCoins += accumulativeGain;
    this.states.dailyEarnedCoins += accumulativeGain;
    this.renderProgressSummary();
  }

  rollbackCoinsOnUncheckingMission(mission) {
    const { accumulativeGain } = this.getGainSnapshot(mission);
    this.states.piggyBank -= accumulativeGain;
    this.states.weeklyEarnedCoins -= accumulativeGain;
    this.states.dailyEarnedCoins -= accumulativeGain;
    this.renderProgressSummary();
  }

  renderMissionOnParameterUpdate(mission, index) {
    const { baseGain, gainMultiplier, accumulativeGain } = this.getGainSnapshot(mission);
    document.querySelector(`[data-index="${index}"] .base-gain`).textContent =
      baseGain.toFixed(DECIMAL_PLACES);
    document.querySelector(`[data-index="${index}"] .base-multiplier`).textContent =
      gainMultiplier.toFixed(DECIMAL_PLACES);
    document.querySelector(`[data-index="${index}"] .accumulative-gain`).textContent =
      accumulativeGain.toFixed(DECIMAL_PLACES);
  }

  deleteMission(index) {
    if (!confirm("Delete this mission?")) return;
    this.states.missions.splice(index, 1);
    this.renderMissionList();
  }

  renameMission(mission) {
    const newName = prompt("Rename mission:", mission.name)?.trim();
    if (newName) {
      mission.name = newName;
      this.renderMissionList();
    }
  }

  createMissionCard(mission, index) {
    const card = document.createElement("div");
    card.className = "mission-card";
    card.setAttribute("data-index", index);

    const { baseGain, gainMultiplier, momentumRate, accumulativeGain } =
      this.getGainSnapshot(mission);

    card.innerHTML = `
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
          <div class="param-input">
            <label>lt_roi:</label>
            <input type="number" step="0.01" min="0" max="1" value="${
              mission.lt_roi
            }" data-param="lt_roi">
          </div>
          <div class="param-input">
            <label>avoidance:</label>
            <input type="number" step="0.01" min="0" max="1" value="${
              mission.avoidance
            }" data-param="avoidance">
          </div>
          <div class="param-input">
            <label>flow:</label>
            <input type="number" step="0.01" min="0" max="1" value="${
              mission.flow
            }" data-param="flow">
          </div>
          <div class="param-input">
            <label>st_roi:</label>
            <input type="number" step="0.01" min="0" max="1" value="${
              mission.st_roi
            }" data-param="st_roi">
          </div>
        </div>
      </div>

      <div class="gains-section">
        <div class="gains-grid">
          <div class="gain-item">
            <div>Base Gain</div>
            <div class="gain-value base-gain">${baseGain.toFixed(DECIMAL_PLACES)}</div>
          </div>
          <div class="gain-item">
            <div>Base Multiplier</div>
            <div class="gain-value base-multiplier">${gainMultiplier.toFixed(DECIMAL_PLACES)}</div>
          </div>
          <div class="gain-item">
            <div>Momentum Rate</div>
            <div class="gain-value">${momentumRate.toFixed(DECIMAL_PLACES)}</div>
          </div>
          <div class="gain-item">
            <div>Accumulative Gain</div>
            <div class="gain-value accumulative-gain">${accumulativeGain.toFixed(
              DECIMAL_PLACES
            )}</div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-delete">Delete</button>
        <button class="btn btn-rename">Rename</button>
      </div>
    `;

    const checkbox = card.querySelector(".mission-checkbox");
    checkbox.onchange = () => {
      if (checkbox.checked) this.addCoinsOnCheckingMission(mission);
      else this.rollbackCoinsOnUncheckingMission(mission);
      mission.checkedState = checkbox.checked;
      card.querySelector(".mission-name").classList.toggle("completed", checkbox.checked);
    };

    card.querySelectorAll(".param-input input").forEach((input) => {
      input.oninput = (e) => {
        if (checkbox.checked) {
          alert("Please uncheck the mission first before adjusting parameters.");
          e.target.value = mission[e.target.dataset.param];
          return;
        }

        if (e.target.value > 1) e.target.value = 1;
        else if (e.target.value < 0) e.target.value = 0;

        mission[e.target.dataset.param] = parseFloat(e.target.value);
        this.renderMissionOnParameterUpdate(mission, index);
      };
    });

    card.querySelector(".btn-delete").onclick = () => this.deleteMission(index);
    card.querySelector(".btn-rename").onclick = () => this.renameMission(mission);

    return card;
  }

  renderMissionList() {
    const missionList = document.getElementById("mission-list");
    const emptyState = document.getElementById("empty-state");

    if (this.states.missions.length === 0) {
      missionList.style.display = "none";
      emptyState.style.display = "block";
      return;
    }

    missionList.style.display = "grid";
    emptyState.style.display = "none";
    missionList.innerHTML = "";

    this.states.missions.forEach((mission, index) => {
      const card = this.createMissionCard(mission, index);
      missionList.appendChild(card);
    });
  }

  startCountdown() {
    const formatTime = (h, m, s) => {
      const [hh, mm, ss] = [h, m, s].map((t) => t.toString().padStart(2, "0"));
      return `⏰ ${hh}:${mm}:${ss} ⏰`;
    };

    const updateCountdown = () => {
      const now = new Date();
      const currentDeadline = this.getCurrentDeadline();
      const timeLeft = currentDeadline - now;

      const h = Math.floor(timeLeft / ONE_HOUR_IN_MS) % 24;
      const m = Math.floor(timeLeft / ONE_MINUTE_IN_MS) % 60;
      const s = Math.floor(timeLeft / ONE_SECOND_IN_MS) % 60;

      document.getElementById("countdown").textContent = formatTime(h, m, s);
    };

    if (this.states.countdownInterval) clearInterval(this.states.countdownInterval);

    updateCountdown();
    this.states.countdownInterval = setInterval(updateCountdown, 1000);
  }

  addMission() {
    this.states.missions.push({
      name: document.getElementById("name").value.trim(),
      lt_roi: parseFloat(document.getElementById("lt-roi").value),
      avoidance: parseFloat(document.getElementById("avoidance").value),
      flow: parseFloat(document.getElementById("flow").value),
      st_roi: parseFloat(document.getElementById("st-roi").value),
      checkedState: false,
      streak: 0,
      miss: 0,
    });
    document.getElementById("mission-form").reset();
    this.renderMissionList();
  }

  setWeeklyDeadline() {
    if (this.states.missions.length === 1) {
      this.states.weeklyDeadline = new Date(Date.now() + ONE_WEEK_IN_MS);
    }
  }

  setupEventListeners() {
    document.getElementById("mission-form").onsubmit = (e) => {
      e.preventDefault();
      this.addMission();
      this.setWeeklyDeadline(); // only set when add first mission
    };

    document.getElementById("change-weekly-goal").onclick = () => {
      const newWeeklyGoal = parseFloat(prompt("New weekly goal:", this.states.weeklyGoal));
      this.states.weeklyGoal = newWeeklyGoal || this.states.weeklyGoal;
      document.getElementById("weekly-goal").textContent = this.states.weeklyGoal;
    };
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new GritCoin();
});
