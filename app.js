const STORAGE_KEYS = ["missions", "streaks", "checkedStates", "lastDeadlines", "misses"]
let [missions, streaks, checkedStates, lastDeadlines, misses] = STORAGE_KEYS.map(key => {
  const item = localStorage.getItem(key)
  return item ? JSON.parse(item) : []
})
const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000
const DEADLINE_HOUR = 22

let countdownInterval = null

const startCountdown = () => {
  if (countdownInterval) clearInterval(countdownInterval)

  const countdownElement = document.getElementById("countdown")

  const updateCountdown = () => {
    const now = new Date()
    const currentDeadline = getCurrentDeadline()
    const timeLeft = currentDeadline - now

    const hours = Math.floor((timeLeft / (60 * 60 * 1000)) % 24)
    const minutes = Math.floor((timeLeft / (60* 1000)) % 60)
    const seconds = Math.floor((timeLeft / 1000) % 60)

    countdownElement.textContent = `⏰ Time left: ${hours}h ${minutes}m ${seconds}s ⏰`
  }

  const startCountdown = () => {
    updateCountdown()
    return setInterval(updateCountdown, 1000)
  }

  countdownInterval = startCountdown()
}

const saveState = () => {
  localStorage.setItem("missions", JSON.stringify(missions))
  localStorage.setItem("streaks", JSON.stringify(streaks))
  localStorage.setItem("checkedStates", JSON.stringify(checkedStates))
  localStorage.setItem("lastDeadlines", JSON.stringify(lastDeadlines))
  localStorage.setItem("misses", JSON.stringify(misses))
}

window.addEventListener("beforeunload", saveState)

const getCurrentDeadline = () => {
  const now = new Date()
  const deadline = new Date()
  deadline.setHours(DEADLINE_HOUR, 0, 0, 0)
  if (now > deadline) deadline.setDate(deadline.getDate() + 1)
  return deadline
}

const completeMission = (index) => {
  streaks[index]++
  checkedStates[index] = false
}

const missMission = (index, missedDays) => {
  misses[index] = missedDays
  checkedStates[index] = false
}

const resetMission = (index) => {
  streaks[index] = 0
  misses[index] = 0
  checkedStates[index] = false
}

const updateMissionsOnAppOpen = () => {
  const now = new Date()
  missions.forEach((_, index) => {
    let lastDeadline = lastDeadlines[index] ? new Date(lastDeadlines[index]) : null
    const currentDeadline = getCurrentDeadline()

    if (!lastDeadline) {
      lastDeadlines[index] = currentDeadline.toISOString()
      return
    }

    const missGapInMs = now - lastDeadline
    if (missGapInMs <= ONE_DAY_IN_MS && checkedStates[index]) {
      completeMission()
      return
    }

    const missedDays = misses[index] + Math.floor(missGapInMs / ONE_DAY_IN_MS) + !checkedStates[index]

    if (missedDays >= 3) resetMission()
    else missMission(index, missedDays)

    lastDeadlines[index] = currentDeadline.toISOString()
  })
}

const renderMissions = () => {
  const missionList = document.getElementById("mission-list")
  missionList.innerHTML = ''
  missions.forEach((mission, index) => {
    const li = document.createElement("li")
    li.innerHTML = `
      <input type="checkbox" id="mission_${index}" ${checkedStates[index] ? 'checked' : ''}>
      <label for="mission_${index}">${mission}</label>
      <span>🔥 Streak: ${streaks[index]} | 💀 Misses: ${misses[index]}</span>
      <button class="delete-button">Delete</button>
      <button class="rename-button">Rename</button>
    `

    li.querySelector("input").onchange = () => {
      checkedStates[index] = li.querySelector("input").checked
    }

    li.querySelector(".delete-button").onclick = () => {
      if (confirm("Delete this mission?")) {
        missions.splice(index, 1)
        streaks.splice(index, 1)
        misses.splice(index, 1)
        checkedStates.splice(index, 1)
        lastDeadlines.splice(index, 1)
        renderMissions()
      }
    }

    li.querySelector(".rename-button").onclick = () => {
      const newName = prompt("Rename mission:", mission).trim()
      if (newName) {
        missions[index] = newName
        renderMissions()
      }
    }

    missionList.appendChild(li)
  })
}

const handleMissionFormSubmit = (e) => {
    e.preventDefault()
    const newMissionInput = document.getElementById("new-mission")
    const newMission = newMissionInput.value.trim()
    if (newMission) {
      missions.push(newMission)
      streaks.push(0)
      misses.push(0)
      checkedStates.push(false)
      lastDeadlines.push(getCurrentDeadline().toISOString())
      newMissionInput.value = ''
      renderMissions()
    }
}

const handleMissionForm = () => {
  const missionForm = document.getElementById("mission-form")
  missionForm.onsubmit = handleMissionFormSubmit
}

document.addEventListener("DOMContentLoaded", () => {
  updateMissionsOnAppOpen()
  handleMissionForm()
  renderMissions()
  startCountdown()
})