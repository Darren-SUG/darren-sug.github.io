/****************************************************
 * OUTBACK CAFE – Single JS File (reorganized, same code)
 ****************************************************/

// ===== Global Config =====
const LEVEL_TIME = 60;         // seconds
const POINTS_PER_MEAL = 100;
let currentLevel = null;
let currentScore = 0;
let endlessHighScore = parseInt(localStorage.getItem("endlessHighScore")) || 0;
let endlessWaveCount = 0;
let levelTimer   = LEVEL_TIME;
let requiredPoints = 300;
let customers    = [];         // active Animal instances
let spawnTimeouts = [];
let gameInterval = null;
let levelActive = false;
let colourBlindMode = false;

/****************************************************
 *  Cognitive / Planning Metrics
 ****************************************************/

const stats = {
  sessionId: Date.now(),
  totalCustomersSpawned: 0,
  totalCustomersServed: 0,
  animalTypesSeen: new Set(),
  animalTypesServed: new Set(),
  servePatiences: [], // patience (0–1) at serve time
  lastChopperEmptyTime: 0,
  lastCoolerEmptyTime: 0,
  totalChopperIdle: 0, // in seconds
  totalCoolerIdle: 0,
  startTime: 0,
  endTime: 0,
};

/****************************************************
 *  Global Totals Across All Levels
 ****************************************************/
const globalStats = {
  sessions: [],
  totalPlanning: 0,
  totalServeSpeed: 0,
  totalAnticipation: 0,
  totalLevelsPlayed: 0,
  totalCustomersServed: 0,
  totalCustomersSpawned: 0,
  totalDuration: 0,
};

// Load saved stats if same day, otherwise reset
const savedStats = localStorage.getItem("outbackStats");
const savedDate = localStorage.getItem("outbackStatsDate");
const today = new Date().toDateString();

if (savedStats && savedDate === today) {
  //  Restore previous stats for today
  const parsed = JSON.parse(savedStats);
  Object.assign(globalStats, parsed);
} else {
  //  New day → reset stats
  localStorage.removeItem("outbackStats");
  localStorage.removeItem("outbackStatsDate");
}

// Track which plates have items (arrays allow up to 3 ingredients)
const plateContents = {
  plate1: [], plate2: [], plate3: [],
  waterCooler: [], chopper: []
};

// Map objects to movement spots
const elementToSpotMap = {
  plate1: "spot1",
  plate2: "spot2",
  plate3: "spot3",
  ingredient1: "spot4",
  ingredient2: "spot5",
  ingredient3: "spot6",
  ingredient4: "spot7",
  ingredient5: "spot8",
  ingredient6: "spot9",
  ingredient7: "spot10",
  ingredientCup: "spot11",
  waterCooler: "spot12",
  bin: "spot13",
  chopper: "spot14"
};

// Track which plate is currently assigned to which customer
const plateAssignments = {
  plate1: null,
  plate2: null,
  plate3: null
};

const activeSounds = []; // track currently playing sounds

/****************************************************
 * Utility & Helpers
 ****************************************************/

function updateScore() {
  document.getElementById("scoreDisplay").textContent = `Score: ${currentScore}`;
}

/****************************************************
 *  Global Sound Control (helper & mute toggle)
 ****************************************************/

// helper for all sounds
function playSound(src) {
  const audio = new Audio(src);
  audio.muted = soundMuted;
  audio.play();
  activeSounds.push(audio);

  // Remove it from the list once it ends
  audio.addEventListener("ended", () => {
    const index = activeSounds.indexOf(audio);
    if (index !== -1) activeSounds.splice(index, 1);
  });

  return audio;
}

const toggleSoundBtn = document.getElementById("toggleSound");
let soundMuted = localStorage.getItem("soundMuted") === "true";

function updateMuteState() {
  document.querySelectorAll("audio").forEach(a => a.muted = soundMuted);
  toggleSoundBtn.textContent = soundMuted ? "Unmute Sound" : "Mute Sound";
  localStorage.setItem("soundMuted", soundMuted);
}

// run once at start
updateMuteState();

toggleSoundBtn.addEventListener("click", () => {
  soundMuted = !soundMuted;
  updateMuteState();
});

/****************************************************
 * Colour-Blind Mode Helpers
 ****************************************************/

document.getElementById("colourBlind").onclick = () => {
  colourBlindMode = !colourBlindMode; // toggle on/off
  toggleColourBlindMode(colourBlindMode);
};

function toggleColourBlindMode(enabled) {
  // Handle ingredients
  document.querySelectorAll(".ingredient").forEach(img => {
    const base = img.dataset.base;
    if (!base) return;
    img.src = `Assets/Food Art/${enabled ? base.replace(".png", "_cb.png") : base}`;
  });
}

/****************************************************
 * Classes
 ****************************************************/

class Player {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.heldItem = null;
    this.currentSpotId = null;
    this.dispenserBusy = false;
    this.chopperBusy = false;
  }

  moveToSpot(spotId) {
    const spot = document.getElementById(spotId);
    if (!spot) return;

    const levelZone = document.getElementById("levelZone");
    const spotRect = spot.getBoundingClientRect();
    const levelRect = levelZone.getBoundingClientRect();

    const left = spotRect.left - levelRect.left;
    const top  = spotRect.top - levelRect.top;

    this.element.style.left = left + "px";
    this.element.style.top  = top + "px";

    this.currentSpotId = spotId;
    this.interact();
  }

  interact() {
    if (!this.currentSpotId) return;

    // ---- clear all ingredients ----
    if (this.currentSpotId === "spot13") {
      if (this.heldItem) {
        this.heldItem.remove();
        this.heldItem = null;
      }
      Object.keys(plateContents).forEach(plateId => {
        if (plateId !== "waterCooler" && plateId !== "chopper") {
          plateContents[plateId] = [];
          const plateEl = document.getElementById(plateId);
          if (plateEl) plateEl.innerHTML = "";
        }
      });
      return;
    }

    // ---- pick up ingredient ----
    if (!this.heldItem) {
      for (const [id, spot] of Object.entries(elementToSpotMap)) {
        if (spot === this.currentSpotId && id.startsWith("ingredient")) {
          const el = document.getElementById(id);
          if (el) {
            const clone = el.cloneNode(true);
            clone.classList.add("held");
            this.element.appendChild(clone);
            this.heldItem = clone;
            playSound("Assets/SFX/PickUpItem.mp3");
            return;
          }
        }
      }

      // ---- pick up filled cup from water cooler ----
      if (this.currentSpotId === elementToSpotMap["waterCooler"] && 
          !this.dispenserBusy && 
          plateContents["waterCooler"].length > 0) {
        const cupEl = plateContents["waterCooler"][0];
        const clone = cupEl.cloneNode(true);
        clone.classList.add("held");
        this.element.appendChild(clone);
        this.heldItem = clone;
        cupEl.remove();
        plateContents["waterCooler"] = [];
        playSound("Assets/SFX/PickUpItem.mp3");
      }

      // ---- pick up chopped ingredient from chopper ----
      if (this.currentSpotId === elementToSpotMap["chopper"] && 
          !this.chopperBusy && 
          plateContents["chopper"].length > 0) {
        const ingEl = plateContents["chopper"][0];
        const clone = ingEl.cloneNode(true);
        clone.classList.add("held");
        this.element.appendChild(clone);
        this.heldItem = clone;
        ingEl.remove();
        plateContents["chopper"] = [];
        playSound("Assets/SFX/PickUpItem.mp3");
      }
    }

    // ---- drop held item ----
    if (this.heldItem) {
      this.drop();
    }
  }

  drop() {
    if (!this.heldItem || !this.currentSpotId) return false;

    // Track water cooler downtime
    if (plateContents["waterCooler"].length === 0 && this.currentSpotId !== elementToSpotMap["waterCooler"]) {
      if (stats.lastCoolerEmptyTime === 0) stats.lastCoolerEmptyTime = Date.now();
    } else if (plateContents["waterCooler"].length > 0 && stats.lastCoolerEmptyTime > 0) {
      stats.totalCoolerIdle += (Date.now() - stats.lastCoolerEmptyTime) / 1000;
      stats.lastCoolerEmptyTime = 0;
    }

    // Track chopper downtime
    if (plateContents["chopper"].length === 0 && this.currentSpotId !== elementToSpotMap["chopper"]) {
      if (stats.lastChopperEmptyTime === 0) stats.lastChopperEmptyTime = Date.now();
    } else if (plateContents["chopper"].length > 0 && stats.lastChopperEmptyTime > 0) {
      stats.totalChopperIdle += (Date.now() - stats.lastChopperEmptyTime) / 1000;
      stats.lastChopperEmptyTime = 0;
    }

    // ---- Water Cooler ----
    const coolerSpot = Object.entries(elementToSpotMap)
      .find(([id, s]) => s === this.currentSpotId && id === "waterCooler");

    if (coolerSpot) {
      if (this.heldItem.id === "ingredientCup" && !this.dispenserBusy && plateContents["waterCooler"].length < 1) {
        this.dispenserBusy = true;
        const dispenserEl = document.getElementById("waterCooler");
        dispenserEl.appendChild(this.heldItem);
        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");
        plateContents["waterCooler"].push(this.heldItem);
        playSound("Assets/SFX/ItemDropping.mp3");
        playSound("Assets/SFX/WaterCooler.mp3");
        this.heldItem = null;

        setTimeout(() => {
          const cupEl = plateContents["waterCooler"][0];
          if (cupEl) {
            cupEl.id = "ingredientCupFilled";
            if (colourBlindMode) {
              cupEl.src = `Assets/Food Art/Watercup_cb.png`;
            } else {
              cupEl.src = `Assets/Food Art/Watercup.png`;
            }
          }
          this.dispenserBusy = false;
        }, 4000);
        return true;
      }
      return false;
    }

    // ---- Chopper ----
    const chopperSpot = Object.entries(elementToSpotMap)
      .find(([id, s]) => s === this.currentSpotId && id === "chopper");

    if (chopperSpot) {
      if ((this.heldItem.id === "ingredient4" || this.heldItem.id === "ingredient3") && !this.chopperBusy && plateContents["chopper"].length < 1) {
        this.chopperBusy = true;
        const chopperEl = document.getElementById("chopper");
        chopperEl.appendChild(this.heldItem);
        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");
        plateContents["chopper"].push(this.heldItem);
        playSound("Assets/SFX/ItemDropping.mp3");
        playSound("Assets/SFX/KitchenHand.mp3");
        this.heldItem = null;

        setTimeout(() => {
          const ingEl = plateContents["chopper"][0];
          if (ingEl) {
            ingEl.id = ingEl.id + "Chopped";
            if (colourBlindMode) {
              ingEl.src = `Assets/Food Art/${ingEl.id}_cb.png`;
            } else {
              ingEl.src = `Assets/Food Art/${ingEl.id}.png`;
            }
          }
          this.chopperBusy = false;
        }, 4000);
        return true;
      }
      return false;
    }

    // ---- Plates ----
    const plateId = Object.entries(elementToSpotMap)
      .find(([elId, spot]) => spot === this.currentSpotId && elId.startsWith("plate"))?.[0];

    if (plateId) {
      if (!Array.isArray(plateContents[plateId])) plateContents[plateId] = [];

      if (plateContents[plateId].length < 3) {
        const plateEl = document.getElementById(plateId);
        plateEl.appendChild(this.heldItem);
        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");
        plateContents[plateId].push(this.heldItem.id);
        playSound("Assets/SFX/ItemDropping.mp3");
        this.heldItem = null;

        const customer = plateAssignments[plateId];
        if (customer) customer.serve(plateContents[plateId]);
        return true;
      }
    }

    return false;
  }
}

class Animal {
  constructor(name, correctFood, patienceTicker) {
    this.name = name;
    this.correctFood = correctFood;
    this.patience = 1;
    this.patienceTicker = patienceTicker;

    this.plateId = Object.keys(plateAssignments).find(p => plateAssignments[p] === null);
    if (!this.plateId) return;
    plateAssignments[this.plateId] = this;

    this.element = document.createElement("div");
    this.element.classList.add(name.toLowerCase(), "customer");

    const spotNum = parseInt(this.plateId.replace("plate", ""), 10);
    document.getElementById("customerSpot" + (spotNum - 1)).appendChild(this.element);

    this.meter = document.createElement("div");
    this.meter.className = "patience-meter";
    this.element.appendChild(this.meter);
    if (colourBlindMode) {
      this.element.style.backgroundImage = `url('Assets/Animals Art/${this.name.toLowerCase()}_cb.png')`; 
    }
    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    this.patience -= 1 / this.patienceTicker;
    this.meter.style.clipPath = `inset(0 0 0 ${100 - this.patience * 100}%)`;
    if (this.patience <= 0) this.leaveAngry();
  }

  leaveAngry() {
    currentScore -= 10;
    updateScore();
    clearInterval(this.timer);
    currentScore -= 10;
    new Audio("Assets/SFX/AnimalAngry.mp3").play();
    const img = document.createElement("img");
    img.src = "Assets/Customer Art/angry.png";
    img.className = "reaction-icon";
    this.element.appendChild(img);
    setTimeout(() => {
      this.element.remove();
      this.clearPlate();
    }, 1000);
  }

  serve(ingredients) {
    if (ingredients.some(i => !this.correctFood.includes(i))) {
      clearInterval(this.timer);
      this.leaveAngry();
    }
    if (this.correctFood.every(f => ingredients.includes(f)) && ingredients.length === this.correctFood.length) {
      customers = customers.filter(c => c !== this);
      const pts = Math.round(POINTS_PER_MEAL * this.patience);
      currentScore += pts;
      updateScore();
      clearInterval(this.timer);
      playSound("Assets/SFX/AnimalHappy.mp3");

      //  Record serve stats
      stats.totalCustomersServed++;
      stats.animalTypesServed.add(this.name);
      stats.servePatiences.push(this.patience);

      const img = document.createElement("img");
      img.src = "Assets/Customer Art/happy.png";
      img.className = "reaction-icon";
      this.element.appendChild(img);
      setTimeout(() => {
        this.element.remove();
        this.clearPlate();
      }, 1000);
    }
  }

  clearPlate() {
    plateContents[this.plateId] = [];
    const plateEl = document.getElementById(this.plateId);
    plateEl.innerHTML = "";
    plateAssignments[this.plateId] = null;
  }
}

/****************************************************
 * Player instance & click wiring for interactable DOM
 ****************************************************/

const playerObj = new Player("player");

document.querySelectorAll(".plate, .ingredient, #waterCooler, #bin, #chopper")
  .forEach(el => {
    el.addEventListener("click", () => {
      const spotId = elementToSpotMap[el.id];
      if (spotId) playerObj.moveToSpot(spotId);
    });
    el.style.cursor = "pointer";
  });

/****************************************************
 * Game Flow (timer, start/end level, spawn, resets)
 ****************************************************/

function startTimer() {
  const timerEl = document.getElementById("timer");
  gameInterval = setInterval(() => {
    levelTimer--;
    timerEl.textContent = `Time Left: ${levelTimer}s`;
    if (levelTimer <= 0 || currentScore >= requiredPoints) endLevel();
  }, 1000);
}

function endLevel() {
  clearInterval(gameInterval);
  //  Stop all currently playing sounds
  activeSounds.forEach(a => {
    a.pause();
    a.currentTime = 0;
  });
  activeSounds.length = 0; // clear the list
  playerObj.dispenserBusy = false;
  playerObj.chopperBusy = false;
  if (playerObj.heldItem) {
    playerObj.heldItem.remove();
    playerObj.heldItem = null;
  }
  document.getElementById("hud").style.display = "none";
  levelActive = false;
  const menu = document.getElementById("levelComplete");
  const heading = document.getElementById("levelCompleteText");
  const score = document.getElementById("finalScore");
  score.textContent = `Final Score: ${currentScore}`;
  heading.textContent = currentScore >= requiredPoints ? "Completed!" : "Time's Up!";
  menu.style.display = "block";

  if (!document.getElementById("endlessMode").classList.contains("active")) {
    let nextLevel = null;

    for (let i = 0; i < levels.length; i++) {
      if (levels[i] === currentLevel && i < levels.length - 1) {
        nextLevel = levels[i + 1];
        break;
      }
    }

    const nextBtn = document.getElementById("nextLevelBtn");

    if (nextLevel) {
      nextBtn.style.display = "block";
      nextBtn.onclick = () => showCafeMenu(nextLevel);
    } else {
      nextBtn.style.display = "none"; // hide if no next level (i.e. Level 5)
    }
  } else {
    nextLevel = null;
  }

  document.getElementById("restartLevelBtn").onclick = () => {
    showCafeMenu(currentLevel);
    currentScore = 0;
  }

  //  Clean up all current animals
  customers.forEach(c => {
    clearInterval(c.timer); // stop patience countdown
    if (c.element && c.element.parentNode) {
      c.element.remove();   // remove from DOM
    }
  });
  customers = [];
  //  Stop all pending spawns
  spawnTimeouts.forEach(id => clearTimeout(id));
  spawnTimeouts = []; // reset

  //  Reset all plates
  Object.keys(plateContents).forEach(plateId => {
    const plateEl = document.getElementById(plateId);
    if (plateId.startsWith("plate")) {  
      plateContents[plateId] = [];
      if (plateEl) plateEl.innerHTML = "";
    } else {
      plateContents[plateId] = [];
      if (plateEl) {
        for (let i = 0; i < plateEl.children.length; i++) {
          if (plateEl.children[i].classList.contains("dropped")) {
            plateEl.children[i].remove();
            i--; // adjust index after removal
          }
        }
      }
    }
  });

  Object.keys(plateAssignments).forEach(p => {
    plateAssignments[p] = null;
  });

  //  Endless Mode Handling
  if (document.getElementById("endlessMode").classList.contains("active")) {
    // Record wave stats before resetting
    stats.endTime = Date.now();

    const planningPercent =
      (stats.animalTypesServed.size / stats.animalTypesSeen.size) * 100 || 0;

    const avgPatience =
      stats.servePatiences.reduce((a, b) => a + b, 0) / (stats.servePatiences.length || 1);
    const serveSpeedPercent = Math.min(100, Math.max(0, avgPatience * 100));

    // Check dynamically whether water cooler or chopper were needed
    const requiresCooler = currentLevel.customers.some(c =>
      c.meal.some(i => i.includes("CupFilled"))
    );
    const requiresChopper = currentLevel.customers.some(c =>
      c.meal.some(i => i.includes("Chopped"))
    );

    let anticipationPercent = 100;
    if (requiresCooler)
      anticipationPercent -= Math.min(100, Math.floor(stats.totalCoolerIdle / 5) * 5);
    if (requiresChopper)
      anticipationPercent -= Math.min(100, Math.floor(stats.totalChopperIdle / 5) * 5);
    anticipationPercent = Math.max(0, anticipationPercent);

    // Generate Endless Wave name with attempt tracking
    endlessWaveCount++; //  Increment wave count each time a wave finishes
    const baseWaveName = `Endless Wave ${endlessWaveCount}`;
    const repeatCount =
      globalStats.sessions.filter(s => s.levelName.startsWith(baseWaveName)).length + 1;

    const report = {
      levelName: `${baseWaveName} (Attempt ${repeatCount})`,
      planningPercent,
      serveSpeedPercent,
      anticipationPercent,
      totalCustomersServed: stats.totalCustomersServed,
      totalCustomersSpawned: stats.totalCustomersSpawned,
      duration: ((stats.endTime - stats.startTime) / 1000).toFixed(1),
    };

    globalStats.sessions.push(report);
    globalStats.totalPlanning += planningPercent;
    globalStats.totalServeSpeed += serveSpeedPercent;
    globalStats.totalAnticipation += anticipationPercent;
    globalStats.totalLevelsPlayed++;
    globalStats.totalCustomersServed += stats.totalCustomersServed;
    globalStats.totalCustomersSpawned += stats.totalCustomersSpawned;
    globalStats.totalDuration += parseFloat(report.duration);

    globalStats.avgPlanning = globalStats.totalPlanning / globalStats.totalLevelsPlayed;
    globalStats.avgServeSpeed = globalStats.totalServeSpeed / globalStats.totalLevelsPlayed;
    globalStats.avgAnticipation = globalStats.totalAnticipation / globalStats.totalLevelsPlayed;

    // Reset for next wave
    Object.assign(stats, {
      totalCustomersSpawned: 0,
      totalCustomersServed: 0,
      animalTypesSeen: new Set(),
      animalTypesServed: new Set(),
      servePatiences: [],
      lastChopperEmptyTime: 0,
      lastCoolerEmptyTime: 0,
      totalChopperIdle: 0,
      totalCoolerIdle: 0,
      startTime: Date.now(),
    });

    if (currentScore >= requiredPoints) {
      requiredPoints += 300;
      showCafeMenu(generateEndlessLevel());
    } else {
      endlessHighScore = Math.max(currentScore, endlessHighScore);
      localStorage.setItem("endlessHighScore", endlessHighScore.toString());
      document.getElementById("highScore").textContent = "High Score: " + endlessHighScore;
      document.getElementById("highScore").style.display = "block";
      document.getElementById("levelComplete").style.display = "block";
      document.getElementById("nextLevelBtn").style.display = "none";
    }

    return;
  } else {
    if (currentScore >= requiredPoints) {
      const currentLevelIndex = levels.indexOf(currentLevel);
      const currentLevelName = levelNames[currentLevelIndex];
      document.getElementById(currentLevelName).classList.add("completed");
    }
    
    // Normal mode handling (for story levels)
    if (currentScore >= requiredPoints || levelTimer <= 0) {
      document.getElementById("levelComplete").style.display = "block";
    }
  }

  stats.endTime = Date.now();

  //  Compute metrics for this level
  const planningPercent =
    (stats.animalTypesServed.size / stats.animalTypesSeen.size) * 100 || 0;

  const avgPatience =
    stats.servePatiences.reduce((a, b) => a + b, 0) / (stats.servePatiences.length || 1);
  const serveSpeedPercent = Math.min(100, Math.max(0, avgPatience * 100));

  let anticipationPercent = 100;
  if (currentLevel === level2 || currentLevel === level4 || currentLevel === level5) {
    anticipationPercent -= Math.min(100, Math.floor(stats.totalCoolerIdle / 5) * 5);
  }
  if (currentLevel === level4 || currentLevel === level5) {
    anticipationPercent -= Math.min(100, Math.floor(stats.totalChopperIdle / 5) * 5);
  }
  anticipationPercent = Math.max(0, anticipationPercent);

  // Use actual level name (e.g. "Level 1") and include attempt number if replayed
  const baseLevelName = currentLevel.name || `Level ${levels.indexOf(currentLevel) + 1}`;
  const repeatCount =
    globalStats.sessions.filter(s => s.levelName.startsWith(baseLevelName)).length + 1;

  const report = {
    levelName: `${baseLevelName} (Attempt ${repeatCount})`,
    planningPercent,
    serveSpeedPercent,
    anticipationPercent,
    totalCustomersServed: stats.totalCustomersServed,
    totalCustomersSpawned: stats.totalCustomersSpawned,
    duration: ((stats.endTime - stats.startTime) / 1000).toFixed(1),
  };

  //  Add to global cumulative stats
  globalStats.sessions.push(report);
  globalStats.totalPlanning += planningPercent;
  globalStats.totalServeSpeed += serveSpeedPercent;
  globalStats.totalAnticipation += anticipationPercent;
  globalStats.totalCustomersServed += stats.totalCustomersServed;
  globalStats.totalCustomersSpawned += stats.totalCustomersSpawned;
  globalStats.totalDuration += parseFloat(report.duration);
  globalStats.totalLevelsPlayed++;

  //  Compute running averages
  globalStats.avgPlanning =
    globalStats.totalPlanning / globalStats.totalLevelsPlayed;
  globalStats.avgServeSpeed =
    globalStats.totalServeSpeed / globalStats.totalLevelsPlayed;
  globalStats.avgAnticipation =
    globalStats.totalAnticipation / globalStats.totalLevelsPlayed;

  console.table(report);
  console.log("Global averages:", {
    avgPlanning: globalStats.avgPlanning.toFixed(1),
    avgServeSpeed: globalStats.avgServeSpeed.toFixed(1),
    avgAnticipation: globalStats.avgAnticipation.toFixed(1),
  });

  // Save updated stats and current date
  localStorage.setItem("outbackStats", JSON.stringify(globalStats));
  localStorage.setItem("outbackStatsDate", new Date().toDateString());
}

/****************************************************
 * Level / Menu Definitions & Helpers
 ****************************************************/

const level1 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 20},
    { name: "Kangaroo", meal: ["ingredient2"], ticker: 20},
  ]
};

const level2 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 20},
    { name: "Kangaroo", meal: ["ingredient2", "ingredientCupFilled"], ticker: 20}
  ]
};

const level3 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 20},
    { name: "Wombat", meal: ["ingredient1", "ingredient2"], ticker: 20},
    { name: "Snake", meal: ["ingredient3"], ticker: 20}
  ]
};

const level4 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 20},
    { name: "Wombat", meal: ["ingredient1", "ingredient2", "ingredientCupFilled"], ticker: 20},
    { name: "Snake", meal: ["ingredient3Chopped"], ticker: 20}
  ]
};

const level5 = {
  customers: [
    { name: "Possum", meal: ["ingredient1", "ingredient2", "ingredient4Chopped"], ticker: 20},
    { name: "Wombat", meal: ["ingredient1", "ingredient2", "ingredientCupFilled"], ticker: 20},
    { name: "Snake", meal: ["ingredient3Chopped", "ingredientCupFilled"], ticker: 20}
  ]
};

const levels = [level1, level2, level3, level4, level5];
const levelTutorials = {
  level1: "",
  level2: "tutorial2",
  level3: "",
  level4: "tutorial3",
  level5: ""
};
const levelNames = ["level1", "level2", "level3", "level4", "level5"];

function showCafeMenu(levelData) {
  const levelIndex = levels.indexOf(levelData);
  const tutorialId = levelTutorials[levelNames[levelIndex]];
  
  if (!localStorage.getItem(tutorialId) && tutorialId && document.getElementById(tutorialId)) {
    document.getElementById(tutorialId).style.display = "block";
    localStorage.setItem(tutorialId, "true");
  }
  document.getElementById("levelComplete").style.display = "none";
  const menu = document.getElementById("cafeMenu");
  menu.innerHTML = "";

  const seen = new Set();

  levelData.customers.forEach(c => {
    if (!seen.has(c.name)) {
      seen.add(c.name);

      const div = document.createElement("div");
      div.className = "menu-entry";
      const animalImg = document.createElement("img");
      if (colourBlindMode) {
        animalImg.src = `Assets/Animals Art/${c.name.toLowerCase()}_cb.png`;
      } else {
        animalImg.src = `Assets/Animals Art/${c.name.toLowerCase()}.png`;
      }
      animalImg.className = "menu-animal";
      div.appendChild(animalImg);
      c.meal.forEach(i => {
        const ing = document.getElementById(i);
        if (ing) {
          const img = document.createElement("img");
          img.src = ing.src;
          img.className = "menu-ingredient";
          div.appendChild(img);
        }
      })
      menu.appendChild(div);
    }
  });

  const startBtn = document.createElement("button");
  startBtn.textContent = "Start";
  startBtn.onclick = () => startLevel(levelData);
  menu.appendChild(startBtn);

  menu.style.display = "block";
}

function startLevel(levelData) {
  document.getElementById("cafeMenu").style.display = "none";
  document.getElementById("hud").style.display = "block";
  currentLevel = levelData;
  stats.startTime = Date.now();
  if (!document.getElementById("endlessMode").classList.contains("active")) {
    currentScore = 0;
  } else {
    currentScore = currentScore; // preserve previous total if continuing
  }
  levelTimer = LEVEL_TIME;

  updateScore();
  startTimer();
  customers = [];
  spawnTimeouts.forEach(id => clearTimeout(id));
  spawnTimeouts = [];
  levelActive = true;

  // Reset plates
  Object.keys(plateAssignments).forEach(p => plateAssignments[p] = null);

  // Define min and max delay in milliseconds
  const minDelay = 2000;  // 2 seconds
  const maxDelay = 8000;  // 8 seconds

  // Function to spawn a customer
  function spawnCustomer() {
    if (!levelActive || levelData.customers.length === 0) return;

    const randomIndex = Math.floor(Math.random() * levelData.customers.length);
    const randomCustomer = levelData.customers[randomIndex];
    const freePlateId = Object.keys(plateAssignments).find(plateId => plateAssignments[plateId] === null);

    if (freePlateId) {
      const animal = new Animal(randomCustomer.name, randomCustomer.meal, randomCustomer.ticker);
      customers.push(animal);
      playSound("Assets/SFX/Ding.mp3");

      //  Track unique animals
      stats.totalCustomersSpawned++;
      stats.animalTypesSeen.add(randomCustomer.name);
    }

    const nextDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    const timeoutId = setTimeout(spawnCustomer, nextDelay);
    spawnTimeouts.push(timeoutId); //  store timeout
  }

  // Start spawning customers
  spawnCustomer();
}

function startEndlessRound() {
  endlessWaveCount = 0;
  const endlessLevel = generateEndlessLevel();
  showCafeMenu(endlessLevel); // reuse your cafeMenu function
  currentLevel = endlessLevel;
}

function generateEndlessLevel() {
  const levelData = { customers: [] };

  // Choose 3 unique animals from the pool
  const shuffled = [...animalMealPool].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, 3);

  selected.forEach(animalData => {
    levelData.customers.push({
      name: animalData.name,
      meal: animalData.meal,
      ticker: 20
    });
  });

  return levelData;
}

const animalMealPool = [
  { name: "Koala",   meal: ["ingredient1"] },
  { name: "Kangaroo", meal: ["ingredient2", "ingredientCupFilled"] },
  { name: "Wombat",  meal: ["ingredient1", "ingredient2", "ingredientCupFilled"] },
  { name: "Snake",   meal: ["ingredient3Chopped", "ingredientCupFilled"] },
  { name: "Possum",  meal: ["ingredient1", "ingredient2", "ingredient4Chopped"] }
];

/****************************************************
 * UI Controls & Event Listeners
 ****************************************************/

document.getElementById("settingsButton").onclick = () => {
  document.querySelectorAll(".ui").forEach(el => {
    el.style.display = "none";
  });
  document.getElementById("settingsMenu").style.display = "block";
  document.getElementById("bgm").play();
}

document.getElementById("levelSelect").onclick = () => {
  document.getElementById("bgm").play();
  document.querySelectorAll(".ui").forEach(el => {
    el.style.display = "none";
  });
  document.getElementById("levelMenu").style.display = "block";
}

document.getElementById("menuLevelSelect").onclick = () => {
  document.getElementById("bgm").play();
  document.querySelectorAll(".ui").forEach(el => {
    el.style.display = "none";
  });
  document.getElementById("levelMenu").style.display = "block";
  if (!localStorage.getItem("tutorial1")) {
    document.getElementById("tutorial1").style.display = "block";
    localStorage.setItem("tutorial1", "true");
  }
}

document.querySelectorAll(".backToMain").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ui").forEach(el => {
      el.style.display = "none";
    });
    document.getElementById("mainMenu").style.display = "flex";
    document.getElementById("highScore").style.display = "none";
    requiredPoints = 300;
  }
});

document.querySelectorAll(".levelButton").forEach((button, index) => {
  button.addEventListener("click", () => {
    document.getElementById("endlessMode").classList.remove("active");
    const levelData = levels[index];
    document.querySelectorAll(".ui").forEach(el => {
      el.style.display = "none";
    });
    showCafeMenu(levelData);
  });
});

document.getElementById("endlessMode").onclick = () => {
  currentScore = 0;
  document.getElementById("bgm").play();
  document.querySelectorAll(".ui").forEach(el => el.style.display = "none");
  document.getElementById("endlessMode").classList.add("active");

  requiredPoints = 300; // First threshold for wave completion
  if (!levelActive) {
    currentScore = currentScore; // preserve previous total if continuing
  }

  startEndlessRound();
  if (!localStorage.getItem("tutorialEndless")) {
    document.getElementById("tutorialEndless").style.display = "block";
    localStorage.setItem("tutorialEndless", "true");
  }
};

document.getElementById("allTutorials").onclick = () => {
  document.getElementById("combinedTutorials").style.display = "block";
  document.getElementById("bgm").play();
};

/****************************************************
 * Tutorial Setup
 ****************************************************/

function setupTutorial(tutorialId) {
  const tutorial = document.getElementById(tutorialId);
  if (!tutorial) return;

  const nextBtn = tutorial.querySelector(".nextTutorial");
  const closeBtn = tutorial.querySelector(".closeTutorial");
  const steps = Array.from(tutorial.querySelectorAll("p, img"));
  let currentStep = 0;

  // Initialize state
  steps.forEach((el, i) => el.style.display = i === 0 ? "block" : "none");
  closeBtn.style.display = "block";

  // Next button logic
  nextBtn.addEventListener("click", () => {
    steps[currentStep].style.display = "none";
    currentStep++;

    if (currentStep < steps.length) {
      steps[currentStep].style.display = "block";
    } else {
      tutorial.style.display = "none";
      currentStep = 0;
      steps.forEach((el, i) => el.style.display = i === 0 ? "block" : "none");
    }
  });

  // Close button logic
  closeBtn.addEventListener("click", () => {
    tutorial.style.display = "none";
    currentStep = 0;
    steps.forEach((el, i) => el.style.display = i === 0 ? "block" : "none");
  });
}

// Initialize all tutorials on page load
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".tutorial").forEach(tut => setupTutorial(tut.id));
});

function exportAllStatsCSV() {
  if (globalStats.sessions.length === 0) {
    alert("No statistics available to export.");
    return;
  }

  // Prepare level-by-level data
  let csv = "levelName,planningPercent,serveSpeedPercent,anticipationPercent,totalCustomersServed,totalCustomersSpawned,duration\n";
  globalStats.sessions.forEach(s => {
    csv += `${s.levelName},${s.planningPercent.toFixed(1)},${s.serveSpeedPercent.toFixed(1)},${s.anticipationPercent.toFixed(1)},${s.totalCustomersServed},${s.totalCustomersSpawned},${s.duration}\n`;
  });

  // Add overall averages (compute safely on the fly)
  const levels = globalStats.totalLevelsPlayed || 0;

  const avgPlanning =
    levels ? globalStats.totalPlanning / levels : 0;
  const avgServeSpeed =
    levels ? globalStats.totalServeSpeed / levels : 0;
  const avgAnticipation =
    levels ? globalStats.totalAnticipation / levels : 0;

  // If you prefer to keep cumulative totals too, they’re already in globalStats.* totals
  csv += "\nAverages & Totals,";
  csv += `${avgPlanning.toFixed(1)},${avgServeSpeed.toFixed(1)},${avgAnticipation.toFixed(1)},${globalStats.totalCustomersServed},${globalStats.totalCustomersSpawned},${(globalStats.totalDuration || 0).toFixed(1)}\n`;

  // Download CSV
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `outback_cognitive_summary_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById("statsDownload").addEventListener("click", exportAllStatsCSV);