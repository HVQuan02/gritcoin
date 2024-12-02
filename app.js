document.addEventListener("DOMContentLoaded", () => {
  // Load settings or set default values
  const streakUpdateTimestamp = parseInt(localStorage.getItem("streakUpdateTimestamp")) || 22;
  const acceptanceRate = parseInt(localStorage.getItem("acceptanceRate")) || 80;

  // DOM Elements
  const habitList = document.getElementById("habit-list");
  const habitForm = document.getElementById("habit-form");
  const configForm = document.getElementById("config-form");
  const newHabitInput = document.getElementById("new-habit");
  const acceptPercent = document.getElementById("accept-percent");
  const deadline = document.getElementById("deadline");

  // Set initial values for form inputs
  acceptPercent.value = acceptanceRate;
  deadline.value = streakUpdateTimestamp;

  // Load or initialize data from localStorage
  let habits = JSON.parse(localStorage.getItem("habits")) || [];
  let streak = parseInt(localStorage.getItem("streak")) || 0;
  let maxStreak = parseInt(localStorage.getItem("maxStreak")) || streak;
  let checkedStates = JSON.parse(localStorage.getItem("checkedStates")) || Array(habits.length).fill(false);

  // Save updated data to localStorage
  const updateLocalStorage = () => {
    localStorage.setItem("habits", JSON.stringify(habits));
    localStorage.setItem("checkedStates", JSON.stringify(checkedStates));
    localStorage.setItem("streak", streak);
  };

  // Config form submission: update and reload
  configForm.onsubmit = (e) => {
    e.preventDefault();
    localStorage.setItem("acceptanceRate", acceptPercent.value);
    localStorage.setItem("streakUpdateTimestamp", deadline.value);
    location.reload(); // Reload to reflect changes
  };

  // Add a new habit
  habitForm.onsubmit = (e) => {
    e.preventDefault();
    const newHabit = newHabitInput.value.trim();
    if (newHabit) {
      habits.push(newHabit);
      checkedStates.push(false);
      updateLocalStorage();
      newHabitInput.value = '';
      renderHabits();
      updateFinishButton();
    }
  };

  // Determine if the habits meet the success criteria
  const isSuccessful = () => {
    const checkedCount = checkedStates.filter(Boolean).length;
    return habits.length > 0 && checkedCount >= (acceptanceRate / 100) * habits.length;
  };

  // Update max streak and reset checks
  const updateMaxStreak = () => {
    if (streak > maxStreak) {
      maxStreak = streak;
      localStorage.setItem("maxStreak", maxStreak);
    }
  };

  const updateStreak = () => {
    streak++;
    updateMaxStreak();
    checkedStates.fill(false);
    updateLocalStorage();
  };

  const resetStreak = () => {
    updateMaxStreak();
    streak = 0;
    checkedStates.fill(false);
    updateLocalStorage();
  };

  // Countdown logic for the streak reset timer
  const scheduleStreakUpdate = (timestamp) => {
    const now = new Date();
    const nextUpdate = new Date();
    nextUpdate.setHours(timestamp, 0, 0, 0);

    if (now >= nextUpdate) nextUpdate.setDate(nextUpdate.getDate() + 1);

    const lastUpdate = new Date(localStorage.getItem("lastUpcomingUpdate"));
    if (!isNaN(lastUpdate) && now > lastUpdate) {
      now - lastUpdate < 24 * 60 * 60 * 1000 ? (isSuccessful() ? updateStreak() : resetStreak()) : resetStreak();
    }

    localStorage.setItem("lastUpcomingUpdate", nextUpdate.toISOString());

    // Display countdown
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

  const updateCountdownDisplay = (timeLeft) => {
    const hours = Math.floor((timeLeft / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((timeLeft / (1000 * 60)) % 60);
    const seconds = Math.floor((timeLeft / 1000) % 60);
    document.getElementById("countdown").textContent = `⏰ Time left: ${hours}h ${minutes}m ${seconds}s ⏰`;
  };

  // Handle "Finish" button visibility
  const updateFinishButton = () => {
    isSuccessful() ? addFinishButton() : removeFinishButton();
  };

  const addFinishButton = () => {
    if (!document.getElementById('finish-button')) {
      const finishButton = document.createElement("button");
      finishButton.id = 'finish-button';
      finishButton.textContent = "Finish";
      finishButton.onclick = () => {
        updateStreak();
        renderHabits();
      };
      habitList.appendChild(finishButton);
    }
  };

  const removeFinishButton = () => {
    const finishButton = document.getElementById('finish-button');
    if (finishButton) {
      habitList.removeChild(finishButton);
    }
  };

  // Render habits
  const renderHabits = () => {
    habitList.innerHTML = `<p>Your current streak: ${streak} 🔥 (Longest: ${maxStreak} 🔥)</p>`;
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
        updateFinishButton();
      };

      li.querySelector(".delete-button").onclick = () => {
        if (confirm("Delete this habit?")) {
          habits.splice(index, 1);
          checkedStates.splice(index, 1);
          updateLocalStorage();
          renderHabits();
          updateFinishButton();
        }
      };

      li.querySelector(".rename-button").onclick = () => {
        const newName = prompt("Rename habit:", habit).trim();
        if (newName) {
          habits[index] = newName;
          updateLocalStorage();
          renderHabits();
        }
      };

      habitList.appendChild(li);
    });
  };

  renderHabits();
  scheduleStreakUpdate(streakUpdateTimestamp);
  updateFinishButton();
});