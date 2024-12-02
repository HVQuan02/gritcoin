document.addEventListener("DOMContentLoaded", () => {
  // Load deadline and acceptance values from localStorage or set defaults
  const streakUpdateTimestamp = parseInt(localStorage.getItem("streakUpdateTimestamp")) || 22;
  const acceptanceRate = parseInt(localStorage.getItem("acceptanceRate")) || 80;

  // DOM Elements
  const habitList = document.getElementById("habit-list");
  const habitForm = document.getElementById("habit-form");
  const configForm = document.getElementById("config-form");
  const newHabitInput = document.getElementById("new-habit");
  const acceptPercent = document.getElementById("accept-percent");
  const deadline = document.getElementById("deadline");

  // Set initial input values for acceptance rate and deadline
  acceptPercent.value = acceptanceRate;
  deadline.value = streakUpdateTimestamp;

  // Initialize data from localStorage
  let habits = JSON.parse(localStorage.getItem("habits")) || [];
  let streak = parseInt(localStorage.getItem("streak")) || 0;
  let maxStreak = parseInt(localStorage.getItem("maxStreak")) || streak;
  let checkedStates = JSON.parse(localStorage.getItem("checkedStates")) || Array(habits.length).fill(false);

  // Config form submission to update settings and reload
  configForm.onsubmit = (e) => {
    e.preventDefault();
    localStorage.setItem("acceptanceRate", acceptPercent.value);
    localStorage.setItem("streakUpdateTimestamp", deadline.value);
    location.reload(); // Reload to reflect changes immediately
  };

  // Habit form submission: Add a new habit
  habitForm.onsubmit = (e) => {
    e.preventDefault();
    const newHabit = newHabitInput.value.trim();
    if (newHabit) {
      habits.push(newHabit);
      checkedStates.push(false);
      updateLocalStorage();
      newHabitInput.value = ''; // Clear input
      renderHabits();
    }
  };

  // Check if the user meets the success criteria based on acceptance rate
  const isSuccessful = () => {
    const checkedCount = checkedStates.filter(Boolean).length;
    return habits.length > 0 && checkedCount >= (acceptanceRate / 100) * habits.length;
  };

  // Update streak and reset checks
  const updateStreak = () => {
    streak++;
    checkedStates.fill(false);
    updateLocalStorage();
  };

  // Reset streak and update maxStreak if necessary
  const resetStreak = () => {
    if (streak > maxStreak) {
      maxStreak = streak;
      localStorage.setItem("maxStreak", maxStreak);
    }
    streak = 0;
    checkedStates.fill(false);
    updateLocalStorage();
  };

  // Schedule streak updates and handle deadline checking
  const scheduleStreakUpdate = (timestamp) => {
    const now = new Date();
    const nextUpdate = new Date();
    nextUpdate.setHours(timestamp, 0, 0, 0);

    if (now >= nextUpdate) nextUpdate.setDate(nextUpdate.getDate() + 1);

    const lastUpdate = new Date(localStorage.getItem("lastUpcomingUpdate"));
    if (!isNaN(lastUpdate) && now > lastUpdate) {
      isSuccessful() ? updateStreak() : resetStreak();
    }
    localStorage.setItem("lastUpcomingUpdate", nextUpdate.toISOString());

    // Countdown timer for UI
    const countdownInterval = setInterval(() => {
      const timeLeft = nextUpdate - new Date();
      if (timeLeft <= 0) {
        clearInterval(countdownInterval);
        scheduleStreakUpdate(streakUpdateTimestamp);
      } else {
        updateCountdownDisplay(timeLeft);
      }
    }, 1000);
  };

  // Update the countdown display in the UI
  const updateCountdownDisplay = (timeLeft) => {
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
    const seconds = Math.floor((timeLeft / 1000) % 60);
    const countdownElement = document.getElementById("countdown");
    if (countdownElement) {
      countdownElement.textContent = `⏰ Time left until deadline: ${hours}h ${minutes}m ${seconds}s ⏰`;
    }
  };

  // Render the habit list and UI components
  const renderHabits = () => {
    habitList.innerHTML = `
      <p>Your current streak: ${streak} 🔥 (Longest streak: ${maxStreak} 🔥)</p>
    `;
    habits.forEach((habit, index) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <input type="checkbox" id="habit_${index}" ${checkedStates[index] ? 'checked' : ''}>
        <label for="habit_${index}">${habit}</label>
        <button class="delete-button">Delete</button>
        <button class="rename-button">Rename</button>
      `;

      li.querySelector("input").onchange = () => {
        checkedStates[index] = li.querySelector("input").checked;
        updateLocalStorage();
      };

      li.querySelector(".delete-button").onclick = () => {
        if (confirm("Are you sure you want to delete this habit?")) {
          habits.splice(index, 1);
          checkedStates.splice(index, 1);
          updateLocalStorage();
          renderHabits();
        }
      };

      li.querySelector(".rename-button").onclick = () => {
        const newName = prompt("Enter new habit name:", habit).trim();
        if (newName) {
          habits[index] = newName;
          updateLocalStorage();
          renderHabits();
        }
      };

      habitList.appendChild(li);
    });
  };

  // Helper function to update all necessary localStorage entries
  const updateLocalStorage = () => {
    localStorage.setItem("habits", JSON.stringify(habits));
    localStorage.setItem("checkedStates", JSON.stringify(checkedStates));
    localStorage.setItem("streak", streak);
  };

  // Initial calls
  renderHabits();
  scheduleStreakUpdate(streakUpdateTimestamp);
});