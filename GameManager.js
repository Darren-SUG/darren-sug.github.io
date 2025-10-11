/****************************************************
 * OUTBACK CAFE – Single JS File (with new plate system)
 ****************************************************/

// ===== Global Config =====
const LEVEL_TIME = 60;         // seconds
const POINTS_PER_MEAL = 100;
let currentLevel = null;
let currentScore = 0;
let levelTimer   = LEVEL_TIME;
let requiredPoints = 300;
let customers    = [];         // active Animal instances
let gameInterval = null;
let levelActive = false;

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

/****************************************************
 * Player Class
 ****************************************************/
class Player {
  constructor(elementId) {
    this.element = document.getElementById(elementId);
    this.heldItem = null;       // clone of ingredient or cup
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
    if (this.currentSpotId === "spot13") { // bin code
      if (this.heldItem) {
        this.heldItem.remove();
        this.heldItem = null;
      }
      Object.keys(plateContents).forEach(plateId => {
        // dont clear water cooler
        if (plateId !== "waterCooler" && plateId !== "chopper") {
          plateContents[plateId] = [];
          const plateEl = document.getElementById(plateId);
          if (plateEl) plateEl.innerHTML = "";
          // dont clear plate assignments, this changes the customers wants, making it impossible to serve them
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
            new Audio("Assets/SFX/PickUpItem.mp3").play();
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
      }
    }

    // ---- drop held item ----
    if (this.heldItem) {
      this.drop();
      new Audio("Assets/SFX/ItemDropping.mp3").play();
    }
  }

  drop() {
    if (!this.heldItem || !this.currentSpotId) return false;

    // ---- Check water cooler first ----
    const coolerSpot = Object.entries(elementToSpotMap)
      .find(([id, s]) => s === this.currentSpotId && id === "waterCooler");

    if (coolerSpot) {
      if (this.heldItem.id === "ingredientCup" && !this.dispenserBusy && plateContents["waterCooler"].length < 1) {
        // if cooler does not have a cup, fill cup
        this.dispenserBusy = true;
        const dispenserEl = document.getElementById("waterCooler");
        
        // move cup to cooler
        dispenserEl.appendChild(this.heldItem);
        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");
        plateContents["waterCooler"].push(this.heldItem);
        this.heldItem = null;
        
        // fill cup after X time
        setTimeout(() => {
          const cupEl = plateContents["waterCooler"][0];
          if (cupEl) {
            cupEl.id = "ingredientCupFilled";
            cupEl.src = "Assets/Food Art/cupOfWater.png";
          }
          this.dispenserBusy = false;
        }, 4000); // edit this number to change filling time
        
        return true;
      }
      // if holding filled cup, or dispenser is busy, or hand is empty, don't do anything
      return false;
    }

    const chopperSpot = Object.entries(elementToSpotMap)
      .find(([id, s]) => s === this.currentSpotId && id === "chopper");

    if (chopperSpot) {
      if (this.heldItem.id !== "ingredientCup" && !this.chopperBusy && plateContents["chopper"].length < 1) {
        // if chopper does not have an ingredient, chop ingredient
        this.chopperBusy = true;
        const chopperEl = document.getElementById("chopper");
        
        // move ingredient to chopper
        chopperEl.appendChild(this.heldItem);
        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");
        plateContents["chopper"].push(this.heldItem);
        this.heldItem = null;
        
        // chop ingredient after X time
        setTimeout(() => {
          const ingEl = plateContents["chopper"][0];
          if (ingEl) {
            ingEl.id = ingEl.id + "Chopped";
            ingEl.src = `Assets/Food Art/${ingEl.id}.png`;
          }
          this.chopperBusy = false;
        }, 4000); // edit this number to change chopping time
        
        return true;
      }
      // if holding chopped ingredient, or chopper is busy, or hand is empty, don't do anything
      return false;
    }

    // ---- Check plates ----
    const plateId = Object.entries(elementToSpotMap)
      .find(([elId, spot]) =>
        spot === this.currentSpotId &&
        elId.startsWith("plate")
      )?.[0];

    if (plateId) {
      if (!Array.isArray(plateContents[plateId])) {
        plateContents[plateId] = [];
      }

      if (plateContents[plateId].length < 3) {
        const plateEl = document.getElementById(plateId);
        plateEl.appendChild(this.heldItem);

        this.heldItem.classList.remove("held");
        this.heldItem.classList.add("dropped");

        plateContents[plateId].push(this.heldItem.id);
        this.heldItem = null;

        // Check if this plate is linked to a customer
        const customer = plateAssignments[plateId];
        if (customer) customer.serve(plateContents[plateId]);

        return true;
      }
    }

    return false;
  }
}

/****************************************************
 * Animal / Customer Class
 ****************************************************/
class Animal {
  constructor(name, correctFood, patienceTicker) {
    this.name = name;
    this.correctFood = correctFood;
    this.patience = 1;
    this.patienceTicker = patienceTicker;

    // Find a free plate slot for this animal
    this.plateId = Object.keys(plateAssignments).find(p => plateAssignments[p] === null);
    if (!this.plateId) {
      console.warn("No free plates for", name);
      return;
    }
    plateAssignments[this.plateId] = this;

    this.element = document.createElement("div");
    this.element.classList.add(name.toLowerCase(), "customer");

    const spotNum = parseInt(this.plateId.replace("plate", ""), 10);
    document.getElementById("customerSpot" + (spotNum - 1)).appendChild(this.element);

    this.meter = document.createElement("div");
    this.meter.className = "patience-meter";
    this.element.appendChild(this.meter);

    this.timer = setInterval(() => this.tick(), 1000);
  }

  tick() {
    this.patience -= 1 / this.patienceTicker;
    this.meter.style.clipPath = `inset(0 0 0 ${100 - this.patience * 100}%)`;
    if (this.patience <= 0) this.leaveAngry();
  }

  leaveAngry() {
    clearInterval(this.timer);
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
    if (this.correctFood.every(f => ingredients.includes(f)) &&
        ingredients.length === this.correctFood.length) {
      customers = customers.filter(c => c !== this);
      const pts = Math.round(POINTS_PER_MEAL * this.patience);
      currentScore += pts;
      updateScore();
      clearInterval(this.timer);
      
      new Audio("Assets/SFX/AnimalHappy.mp3").play();
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
 * Game Flow
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

function updateScore() {
  document.getElementById("scoreDisplay").textContent = `Score: ${currentScore}`;
}

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
  document.getElementById("hud").style.display = "none";
  levelActive = false;
  const menu = document.getElementById("levelComplete");
  const heading = document.getElementById("levelCompleteText");
  const score = document.getElementById("finalScore");
  score.textContent = `Final Score: ${currentScore}`;
  heading.textContent = currentScore >= requiredPoints ? "Completed!" : "Time's Up!";
  menu.style.display = "block";

  let nextLevel = null;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] === currentLevel && i < levels.length - 1) {
      nextLevel = levels[i + 1];
      break;
    }
  }
  document.getElementById("nextLevelBtn").onclick = () => {
    showCafeMenu(nextLevel);
  }

  document.getElementById("restartLevelBtn").onclick = () => {
    showCafeMenu(currentLevel);
  }

  // 🧹 Clean up all current animals
  customers.forEach(c => {
    clearInterval(c.timer); // stop patience countdown
    if (c.element && c.element.parentNode) {
      c.element.remove();   // remove from DOM
    }
  });
  customers = [];

  // 🧹 Reset all plates
  Object.keys(plateContents).forEach(plateId => {
    if (plateId !== "waterCooler") {  
      plateContents[plateId] = [];
      const plateEl = document.getElementById(plateId);
      if (plateEl) plateEl.innerHTML = "";
    }
  });

  Object.keys(plateAssignments).forEach(p => {
    plateAssignments[p] = null;
  });

  // 🧩 Endless Mode Handling
  if (document.getElementById("endlessMode").classList.contains("active")) {
    if (currentScore >= requiredPoints) {
      // Player passed this wave
      requiredPoints += 300; // raise goal
      showCafeMenu(generateEndlessLevel()); // show next random wave menu
    } else {
      // Player failed the wave – normal fail screen
      document.getElementById("levelComplete").style.display = "block";
      document.getElementById("nextLevelBtn").style.display = "none"; // hide next button
      document.querySelectorAll(".levelSelect")[1].style.display = "none"; // hide level select button
    }
    return; // prevent normal levelComplete logic from firing again
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
}

/****************************************************
 * Level / Menu
 ****************************************************/
const level1 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 20},
    { name: "Kangaroo", meal: ["ingredient2"], ticker: 20},
  ]
};

const level2 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 15},
    { name: "Kangaroo", meal: ["ingredient2", "ingredientCupFilled"], ticker: 15}
  ]
};

const level3 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 15},
    { name: "Wombat", meal: ["ingredient1", "ingredient2"], ticker: 15},
    { name: "Snake", meal: ["ingredient3"], ticker: 15}
  ]
};

const level4 = {
  customers: [
    { name: "Koala", meal: ["ingredient1"], ticker: 15},
    { name: "Wombat", meal: ["ingredient1", "ingredient2", "ingredientCupFilled"], ticker: 15},
    { name: "Snake", meal: ["ingredient3Chopped"], ticker: 15}
  ]
};

const level5 = {
  customers: [
    { name: "Possum", meal: ["ingredient1", "ingredient2", "ingredient4Chopped"], ticker: 15},
    { name: "Wombat", meal: ["ingredient1", "ingredient2", "ingredientCupFilled"], ticker: 15},
    { name: "Snake", meal: ["ingredient3Chopped", "ingredientCupFilled"], ticker: 15}
  ]
};

const levels = [level1, level2, level3, level4, level5];
const levelNames = ["level1", "level2", "level3", "level4", "level5"];

function showCafeMenu(levelData) {
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
      animalImg.src = `Assets/Animals Art/${c.name.toLowerCase()}.png`;
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
  if (!document.getElementById("endlessMode").classList.contains("active")) {
    currentScore = 0;
  } else {
    currentScore = currentScore; // preserve previous total if continuing
  }
  levelTimer = LEVEL_TIME;

  updateScore();
  startTimer();
  customers = [];
  levelActive = true;

  // Reset plates
  Object.keys(plateAssignments).forEach(p => plateAssignments[p] = null);

  // Define min and max delay in milliseconds
  const minDelay = 2000;  // 2 seconds
  const maxDelay = 8000;  // 8 seconds

  // Function to spawn a customer
  function spawnCustomer() {
    if (!levelActive || levelData.customers.length === 0) return;  // No customers left to spawn

    // Pick a random customer from the list
    const randomIndex = Math.floor(Math.random() * levelData.customers.length);
    const randomCustomer = levelData.customers[randomIndex];

    // Find a free plate before creating a new animal
    const freePlateId = Object.keys(plateAssignments).find(plateId => plateAssignments[plateId] === null);

    if (freePlateId) {
      // There is a free plate, create the animal (it assigns itself in the constructor)
      // edit the last number to change patience
      const animal = new Animal(randomCustomer.name, randomCustomer.meal, randomCustomer.ticker);
      customers.push(animal);
      
      new Audio("Assets/SFX/Ding.mp3").play();
    }

    // Schedule the next spawn after a random delay
    const nextDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    setTimeout(spawnCustomer, nextDelay);  // Recursively call spawnCustomer after a random delay
  }

  // Start spawning customers
  spawnCustomer();
}

function startEndlessRound() {
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
      ticker: 15
    });
  });

  return levelData;
}

const animalMealPool = [
  { name: "Koala",   meal: ["ingredient1"] },
  { name: "Kangaroo", meal: ["ingredient2", "ingredientCupFilled"] },
  { name: "Wombat",  meal: ["ingredient1", "ingredient2", "ingredientCupFilled"] },
  { name: "Snake",   meal: ["ingredient3", "ingredientCupFilled"] },
  { name: "Possum",  meal: ["ingredient1", "ingredient2", "ingredient4"] }
];

document.querySelectorAll(".levelSelect").forEach(btn => {
  btn.onclick = () => {
    document.getElementById("bgm").play();
    document.querySelectorAll(".ui").forEach(el => {
      el.style.display = "none";
    });
    document.getElementById("levelMenu").style.display = "block";
  }
});

document.querySelectorAll(".backToMain").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".ui").forEach(el => {
      el.style.display = "none";
    });
    document.getElementById("mainMenu").style.display = "block";
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
  document.getElementById("bgm").play();
  document.querySelectorAll(".ui").forEach(el => el.style.display = "none");
  document.getElementById("endlessMode").classList.add("active");

  requiredPoints = 300; // First threshold for wave completion
  if (!levelActive) {
    currentScore = currentScore; // preserve previous total if continuing
  }

  startEndlessRound();
};

