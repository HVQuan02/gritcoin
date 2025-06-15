// GritCoin params
const SCI = 0.01;
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const DEADLINE_HOUR = 22;

// State management
class StateManager {
  constructor() {
    this.storageKeys = ["missions", "streaks", "checkedStates", "lastDeadlines", "misses"];
    this.loadState();
  }

  loadState() {
    [this.missions, this.streaks, this.checkedStates, this.lastDeadlines, this.misses] = 
      this.storageKeys.map(key => {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : [];
      });
  }

  saveState() {
    this.storageKeys.forEach(key => {
      localStorage.setItem(key, JSON.stringify(this[key]));
    });
  }
}

// App logic
class HabitTracker {
  constructor() {
    this.state = new StateManager();
    this.countdownInterval = null;
    this.init();
  }

  init() {
    this.updateMissionsOnAppOpen();
    this.setupEventListeners();
    this.render();
    this.startCountdown();
    
    window.addEventListener('beforeunload', () => this.state.saveState());
  }

  getCurrentDeadline() {
    const now = new Date();
    const deadline = new Date();
    deadline.setHours(DEADLINE_HOUR, 0, 0, 0);
    if (now > deadline) deadline.setDate(deadline.getDate() + 1);
    return deadline;
  }

  startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const updateCountdown = () => {
      const now = new Date();
      const currentDeadline = this.getCurrentDeadline();
      const timeLeft = currentDeadline - now;

      const hours = Math.floor((timeLeft / (60 * 60 * 1000)) % 24);
      const minutes = Math.floor((timeLeft / (60 * 1000)) % 60);
      const seconds = Math.floor((timeLeft / 1000) % 60);

      document.getElementById("countdown").textContent = 
        `⏰ Time left: ${hours}h ${minutes}m ${seconds}s ⏰`;
    };

    updateCountdown();
    this.countdownInterval = setInterval(updateCountdown, 1000);
  }

  updateMissionsOnAppOpen() {
    const now = new Date();
    
    this.state.missions.forEach((_, index) => {
      const lastDeadline = this.state.lastDeadlines[index] ? 
        new Date(this.state.lastDeadlines[index]) : null;
      const currentDeadline = this.getCurrentDeadline();

      this.state.lastDeadlines[index] = currentDeadline.toISOString();

      if (!lastDeadline) {
        return;
      }

      const missGapInMs = now - lastDeadline;

      if (missGapInMs <= 0) return;
      
      // If within deadline and already checked, complete mission
      if (missGapInMs <= ONE_DAY_IN_MS && this.state.checkedStates[index]) {
        this.completeMission(index);
        return;
      }

      // Calculate missed days
      const daysMissed = this.state.misses[index] + 
        Math.floor(missGapInMs / ONE_DAY_IN_MS) + 
        (!this.state.checkedStates[index] ? 1 : 0);

      if (daysMissed >= 3) {
        this.resetMission(index);
      } else {
        this.missMission(index, daysMissed);
      }
    });
  }

  completeMission(index) {
    this.state.streaks[index]++;
    this.state.misses[index] = 0;
    this.state.checkedStates[index] = false;
  }

  missMission(index, missedDays) {
    this.state.misses[index] = missedDays;
    this.state.checkedStates[index] = false;
  }

  resetMission(index) {
    this.state.streaks[index] = 0;
    this.state.misses[index] = 0;
    this.state.checkedStates[index] = false;
  }

  calculateBaseMultiplier(mission) {
    const avoidanceMultiplier = mission.Avoidance >= 0.8 ? 1.1 : 1;
    const ltRoiMultiplier = mission.LT_ROI >= 0.8 ? 1.2 : 1;
    return avoidanceMultiplier * ltRoiMultiplier;
  }

  calculateBaseGain(mission) {
    const baseMultiplier = this.calculateBaseMultiplier(mission);
    const flowValue = (mission.LT_ROI <= 0.5 || mission.Avoidance <= 0.5) 
      ? mission.Flow * 0.5 
      : mission.Flow;

    return (mission.LT_ROI * 4 + mission.Avoidance * 3 + flowValue * 2 + mission.ST_ROI * 1) * baseMultiplier;
  }

  calculateMomentumRate(streak, miss) {
    const effectiveStreak = Math.max(streak - miss, 0);
    return Math.pow(1 + SCI, effectiveStreak);
  }

  calculateCurrentGain(mission, streak, miss) {
    const baseGain = this.calculateBaseGain(mission);
    if (miss > 2) return baseGain;
    return baseGain * this.calculateMomentumRate(streak, miss);
  }

  setupEventListeners() {
    document.getElementById("mission-form").addEventListener('submit', (e) => {
      e.preventDefault();
      this.addMission();
    });
  }

  addMission() {
    const formData = {
      Name: document.getElementById("name").value.trim(),
      LT_ROI: parseFloat(document.getElementById("lt-roi").value),
      Avoidance: parseFloat(document.getElementById("avoidance").value),
      Flow: parseFloat(document.getElementById("flow").value),
      ST_ROI: parseFloat(document.getElementById("st-roi").value)
    };

    this.state.missions.push(formData);
    this.state.streaks.push(0);
    this.state.misses.push(0);
    this.state.checkedStates.push(false);
    this.state.lastDeadlines.push(this.getCurrentDeadline().toISOString());

    // Reset form
    document.getElementById("mission-form").reset();
    this.render();
  }

  deleteMission(index) {
    if (!confirm("Delete this mission?")) return;
    
    ['missions', 'streaks', 'misses', 'checkedStates', 'lastDeadlines'].forEach(key => {
      this.state[key].splice(index, 1);
    });
    this.render();
  }

  renameMission(index) {
    const newName = prompt("Rename mission:", this.state.missions[index].Name)?.trim();
    if (newName) {
      this.state.missions[index].Name = newName;
      this.render();
    }
  }

  updateParameter(index, param, value) {
    this.state.missions[index][param] = parseFloat(value);
    this.updateMissionDisplay(index);
  }

  updateMissionDisplay(index) {
    const mission = this.state.missions[index];
    const baseMultiplier = this.calculateBaseMultiplier(mission);
    const baseGain = this.calculateBaseGain(mission);
    const currentGain = this.calculateCurrentGain(mission, this.state.streaks[index], this.state.misses[index]);

    document.querySelector(`[data-index="${index}"] .base-multiplier`).textContent = baseMultiplier.toFixed(2);
    document.querySelector(`[data-index="${index}"] .base-gain`).textContent = baseGain.toFixed(2);
    document.querySelector(`[data-index="${index}"] .current-gain`).textContent = currentGain.toFixed(2);
  }

  render() {
    const missionList = document.getElementById("mission-list");
    const emptyState = document.getElementById("empty-state");
    
    if (this.state.missions.length === 0) {
      missionList.style.display = 'none';
      emptyState.style.display = 'block';
      return;
    }

    missionList.style.display = 'grid';
    emptyState.style.display = 'none';
    missionList.innerHTML = '';

    this.state.missions.forEach((mission, index) => {
      const card = this.createMissionCard(mission, index);
      missionList.appendChild(card);
    });
  }

  createMissionCard(mission, index) {
    const card = document.createElement('div');
    card.className = 'mission-card';
    card.setAttribute('data-index', index);

    const baseMultiplier = this.calculateBaseMultiplier(mission);
    const baseGain = this.calculateBaseGain(mission);
    const momentumRate = this.calculateMomentumRate(this.state.streaks[index], this.state.misses[index]);
    const currentGain = this.calculateCurrentGain(mission, this.state.streaks[index], this.state.misses[index]);

    card.innerHTML = `
      <div class="mission-header">
        <input type="checkbox" class="mission-checkbox" ${this.state.checkedStates[index] ? 'checked' : ''}>
        <div class="mission-name ${this.state.checkedStates[index] ? 'completed' : ''}">${mission.Name}</div>
      </div>
      
      <div class="stats-row">
        <span class="streak">🔥 Streak: ${this.state.streaks[index]}</span>
        <span class="misses">💀 Misses: ${this.state.misses[index]}</span>
      </div>

      <div class="params-section">
        <h4>Parameters</h4>
        <div class="params-grid">
          <div class="param-input">
            <label>LT_ROI:</label>
            <input type="number" step="0.01" min="0" max="1" value="${mission.LT_ROI}" data-param="LT_ROI">
          </div>
          <div class="param-input">
            <label>Avoidance:</label>
            <input type="number" step="0.01" min="0" max="1" value="${mission.Avoidance}" data-param="Avoidance">
          </div>
          <div class="param-input">
            <label>Flow:</label>
            <input type="number" step="0.01" min="0" max="1" value="${mission.Flow}" data-param="Flow">
          </div>
          <div class="param-input">
            <label>ST_ROI:</label>
            <input type="number" step="0.01" min="0" max="1" value="${mission.ST_ROI}" data-param="ST_ROI">
          </div>
        </div>
      </div>

      <div class="gains-section">
        <div class="gains-grid">
          <div class="gain-item">
            <div>Base Multiplier</div>
            <div class="gain-value base-multiplier">${baseMultiplier.toFixed(2)}</div>
          </div>
          <div class="gain-item">
            <div>Base Gain</div>
            <div class="gain-value base-gain">${baseGain.toFixed(2)}</div>
          </div>
          <div class="gain-item">
            <div>Momentum Rate</div>
            <div class="gain-value">${momentumRate.toFixed(2)}</div>
          </div>
          <div class="gain-item">
            <div>Current Gain</div>
            <div class="gain-value current-gain">${currentGain.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <div class="actions">
        <button class="btn btn-delete">Delete</button>
        <button class="btn btn-rename">Rename</button>
      </div>
    `;

    // Event listeners
    const checkbox = card.querySelector('.mission-checkbox');
    checkbox.addEventListener('change', () => {
      this.state.checkedStates[index] = checkbox.checked;
      card.querySelector('.mission-name').classList.toggle('completed', checkbox.checked);
    });

    card.querySelectorAll('.param-input input').forEach(input => {
      input.addEventListener('input', (e) => {
        if (e.target.value > 1) {
          e.target.value = 1
        }
        this.updateParameter(index, e.target.dataset.param, e.target.value);
      });
    });

    card.querySelector('.btn-delete').addEventListener('click', () => this.deleteMission(index));
    card.querySelector('.btn-rename').addEventListener('click', () => this.renameMission(index));

    return card;
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  new HabitTracker();
});