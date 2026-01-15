// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const chatInput = document.getElementById('chatInput');
const chatDisplay = document.getElementById('chatDisplay');
const selectionMenu = document.getElementById('selectionMenu');
const deathScreen = document.getElementById('deathScreen');
const upgradeBtn = document.getElementById('upgradeBtn');
const supportBtn = document.getElementById('supportBtn');
const hibernateBtn = document.getElementById('hibernateBtn');
const shieldBtn = document.getElementById('shieldBtn');
const farmBtn = document.getElementById('farmBtn');
const giveFoodBtn = document.getElementById('giveFoodBtn');
const restartBtn = document.getElementById('restartBtn');
const typeStat = document.getElementById('typeStat');
const healthStat = document.getElementById('healthStat');
const strengthStat = document.getElementById('strengthStat');
const foodStat = document.getElementById('foodStat');
const foodCapacityStat = document.getElementById('foodCapacityStat');
const nucleotideStat = document.getElementById('nucleotideStat');
const nucleotideRow = document.getElementById('nucleotideRow');
const creatureList = document.getElementById('creatureList');
const upgradeMenu = document.getElementById('upgradeMenu');
const upgradeCloseBtn = document.getElementById('upgradeCloseBtn');
// Legacy elements (hidden but kept for data storage)
const buyHealthBtn = document.getElementById('buyHealthBtn');
const buyStrengthBtn = document.getElementById('buyStrengthBtn');
const transformCellBtn = document.getElementById('transformCellBtn');
const healthUpgradeLevelEl = document.getElementById('healthUpgradeLevel');
const strengthUpgradeLevelEl = document.getElementById('strengthUpgradeLevel');
const capacityUpgradeLevelEl = document.getElementById('capacityUpgradeLevel');
const healthUpgradeCostEl = document.getElementById('healthUpgradeCost');
const strengthUpgradeCostEl = document.getElementById('strengthUpgradeCost');
const capacityUpgradeCostEl = document.getElementById('capacityUpgradeCost');
const buyCapacityBtn = document.getElementById('buyCapacityBtn');

// ===== Authentication System =====
const loginModal = document.getElementById('loginModal');
const loginBtn = document.getElementById('loginBtn');
const loginCloseBtn = document.getElementById('loginCloseBtn');
const testModeBtn = document.getElementById('testModeBtn');
const userStatus = document.getElementById('userStatus');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

// ===== Hibernation Menu =====
const hibernationMenu = document.getElementById('hibernationMenu');
const hibernationTimerFill = document.getElementById('hibernationTimerFill');
const hibernationTimeLeft = document.getElementById('hibernationTimeLeft');
const hibernationTadpole = document.getElementById('hibernationTadpole');
const hibernationBacteria = document.getElementById('hibernationBacteria');
const hibernationCancelBtn = document.getElementById('hibernationCancelBtn');
let selectedOffspringType = 'tadpole'; // Default to tadpole
let hibernationMenuInterval = null;

let currentUser = null;
let lastSaveTime = 0;
const SAVE_INTERVAL = 30000; // Save every 30 seconds
let sessionCheckComplete = false; // Flag to track if session check is done

// Check session on load
async function checkSession() {
  try {
    const response = await fetch('/api/auth/session');
    const data = await response.json();
    if (data.loggedIn) {
      currentUser = data.user;
      updateUserUI();
      if (data.progress?.creature_data) {
        loadProgressFromServer(data.progress);
      }
    }
  } catch (error) {
    console.error('Session check failed:', error);
  } finally {
    sessionCheckComplete = true;
  }
}

// Update UI based on login state
function updateUserUI(isNewRegistration = false) {
  if (currentUser) {
    userStatus.innerHTML = `
      <div class="user-info">
        <span class="username">${currentUser.username}</span>
        <button class="logout-btn" id="logoutBtn">Logout</button>
      </div>
    `;
    document.getElementById('logoutBtn').addEventListener('click', logout);
    // Update all creatures to use the username
    if (typeof myTadpoles !== 'undefined') {
      myTadpoles.forEach(tad => {
        tad.name = currentUser.username;
      });
    }
    // Emit to server (pass isNewRegistration to prevent restoring stale idle NPCs)
    if (typeof socket !== 'undefined' && socket.connected) {
      socket.emit('setName', { name: currentUser.username, isNewRegistration });
    }
  } else {
    userStatus.innerHTML = '<button id="loginBtn" class="auth-btn">Login</button>';
    document.getElementById('loginBtn').addEventListener('click', () => {
      loginModal.classList.remove('hidden');
    });
  }
}

// Login
async function login(email, password) {
  try {
    loginError.textContent = '';
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (data.success) {
      currentUser = data.user;
      loginModal.classList.add('hidden');
      updateUserUI();
      if (data.progress?.creature_data) {
        loadProgressFromServer(data.progress);
      }
    } else {
      loginError.textContent = data.error || 'Login failed';
    }
  } catch (error) {
    console.error('Login error:', error);
    loginError.textContent = 'Connection error. Please try again.';
  }
}

// Register
async function register(username, email, password) {
  try {
    registerError.textContent = '';
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await response.json();
    if (data.success) {
      currentUser = data.user;
      loginModal.classList.add('hidden');
      updateUserUI(true); // true = new registration, don't restore old idle NPCs
    } else {
      registerError.textContent = data.error || 'Registration failed';
    }
  } catch (error) {
    console.error('Register error:', error);
    registerError.textContent = 'Connection error. Please try again.';
  }
}

// Logout
async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    currentUser = null;
    // Reload the page to start fresh as an anonymous player
    window.location.reload();
  } catch (error) {
    console.error('Logout error:', error);
  }
}

// Clear progress on death (so player starts fresh as tadpole)
async function clearProgressOnDeath() {
  if (!currentUser) return;

  try {
    await fetch('/api/auth/clear-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('Progress cleared - will start as tadpole on next login');
  } catch (error) {
    console.error('Clear progress error:', error);
  }
}

// Save progress to server
async function saveProgressToServer() {
  if (!currentUser) return;

  const now = Date.now();
  if (now - lastSaveTime < SAVE_INTERVAL) return; // Rate limit saves
  lastSaveTime = now;

  try {
    // Prepare creature data
    const creatures = myTadpoles.map(tad => ({
      type: tad.type,
      name: tad.name,
      // Position
      x: tad.x,
      y: tad.y,
      angle: tad.angle || 0,
      // Stats
      health: tad.health,
      food: tad.food,
      nucleotides: tad.nucleotides || 0,
      // Tadpole upgrades
      healthLevel: tad.healthLevel || 0,
      strengthLevel: tad.strengthLevel || 0,
      capacityLevel: tad.capacityLevel || 0,
      maxHealthBonus: tad.maxHealthBonus || 0,
      strengthBonus: tad.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: tad.cellHealthLevel || 0,
      cellStrengthLevel: tad.cellStrengthLevel || 0,
      cellCapacityLevel: tad.cellCapacityLevel || 0,
      cellSpeedLevel: tad.cellSpeedLevel || 0,
      hasCellTail: tad.hasCellTail || false,
      hasProtector: tad.hasProtector || false,
      hasSword: tad.hasSword || false,
      canHibernate: tad.canHibernate || false,
      // Bacteria-specific
      isFarming: tad.isFarming || false
    }));

    // Calculate highest evolution
    let highestEvolution = 'tadpole';
    for (const c of creatures) {
      if (c.type === 'cell') {
        highestEvolution = 'cell';
        break;
      }
      if (c.type === 'bacteria') {
        highestEvolution = 'bacteria';
        // Don't break - cell is considered higher evolution than bacteria
      }
    }

    await fetch('/api/auth/save-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatures,
        stats: {
          totalFoodCollected: totalFoodCollected || 0,
          totalKills: totalKills || 0,
          totalDeaths: totalDeaths || 0,
          highestEvolution
        }
      })
    });
    showSaveIndicator('Progress saved');
  } catch (error) {
    console.error('Save progress error:', error);
  }
}

// Load progress from server (silently loads when logged in)
function loadProgressFromServer(progress) {
  if (!progress || !progress.creature_data || progress.creature_data.length === 0) return;

  // Clear current creatures
  myTadpoles = [];
  selectedTadpoles.clear();

  // Recreate creatures from saved data
  progress.creature_data.forEach((savedTad, index) => {
    // Validate position - use saved value only if it's a valid finite number (not null/undefined/NaN)
    const isValidX = typeof savedTad.x === 'number' && isFinite(savedTad.x);
    const isValidY = typeof savedTad.y === 'number' && isFinite(savedTad.y);
    const startX = isValidX ? savedTad.x : (Math.random() - 0.5) * 500;
    const startY = isValidY ? savedTad.y : (Math.random() - 0.5) * 500;
    if (!isValidX || !isValidY) {
      console.warn(`Creature ${index} had invalid position (${savedTad.x}, ${savedTad.y}), using random: (${startX}, ${startY})`);
    }
    // Determine color and radius based on type
    let color = '#FFFFFF';
    let radius = TADPOLE_RADIUS;
    let defaultHealth = MAX_HEALTH;
    if (savedTad.type === 'cell') {
      color = '#4a5f7f';
      radius = CELL_RADIUS;
      defaultHealth = CELL_MAX_HEALTH;
    } else if (savedTad.type === 'bacteria') {
      color = '#7fbf7f';
      radius = BACTERIA_RADIUS;
      defaultHealth = BACTERIA_MAX_HEALTH;
    }

    const tad = {
      id: `saved_${Date.now()}_${index}`,
      // Restore exact position, or random if not saved
      x: startX,
      y: startY,
      renderX: startX,
      renderY: startY,
      vx: 0,
      vy: 0,
      color: color,
      radius: radius,
      name: savedTad.name || currentUser.username,
      type: savedTad.type || 'tadpole',
      health: savedTad.health || defaultHealth,
      maxHealth: defaultHealth,
      food: savedTad.food || 0,
      nucleotides: savedTad.nucleotides || 0,
      angle: savedTad.angle !== undefined ? savedTad.angle : Math.random() * Math.PI * 2,
      wiggleOffset: Math.random() * Math.PI * 2,
      lastHit: 0,
      lastAttack: 0,
      // Tadpole upgrades
      healthLevel: savedTad.healthLevel || 0,
      strengthLevel: savedTad.strengthLevel || 0,
      capacityLevel: savedTad.capacityLevel || 0,
      maxHealthBonus: savedTad.maxHealthBonus || 0,
      strengthBonus: savedTad.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: savedTad.cellHealthLevel || 0,
      cellStrengthLevel: savedTad.cellStrengthLevel || 0,
      cellCapacityLevel: savedTad.cellCapacityLevel || 0,
      cellSpeedLevel: savedTad.cellSpeedLevel || 0,
      hasCellTail: savedTad.hasCellTail || false,
      hasProtector: savedTad.hasProtector || false,
      canBubbleShield: savedTad.hasProtector || false,
      bubbleShieldActive: savedTad.bubbleShieldActive || false,
      hasSword: savedTad.hasSword || false,
      canHibernate: savedTad.canHibernate || false,
      // Bacteria-specific
      isFarming: savedTad.isFarming || false
    };

    // Initialize type-specific properties
    if (tad.type === 'tadpole') {
      initializeTadpole(tad);
    } else if (tad.type === 'bacteria') {
      // Generate blob shape for bacteria
      tad.blobShape = generateBlobShape();
    }

    myTadpoles.push(tad);
    if (index === 0) {
      selectedTadpoles.add(tad.id);
    }
  });

  updateSelectionCount();
}

// Show save indicator
function showSaveIndicator(message) {
  let indicator = document.querySelector('.save-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.className = 'save-indicator';
    document.body.appendChild(indicator);
  }
  indicator.textContent = message;
  indicator.classList.add('show');
  setTimeout(() => indicator.classList.remove('show'), 2000);
}

// Flash a button to indicate an action can't be performed
function flashButton(button) {
  if (!button) return;

  // Store original styles
  const originalBackground = button.style.background;
  const originalBorderColor = button.style.borderColor;
  const originalTransform = button.style.transform;

  // Flash sequence
  let flashCount = 0;
  const maxFlashes = 3;
  const flashInterval = setInterval(() => {
    if (flashCount >= maxFlashes * 2) {
      // Restore original styles
      button.style.background = originalBackground;
      button.style.borderColor = originalBorderColor;
      button.style.transform = originalTransform;
      clearInterval(flashInterval);
      return;
    }

    if (flashCount % 2 === 0) {
      // Flash on - bright highlight
      button.style.background = 'rgba(255, 100, 100, 0.6)';
      button.style.borderColor = 'rgba(255, 150, 150, 0.9)';
      button.style.transform = 'scale(1.1)';
    } else {
      // Flash off - return to original
      button.style.background = originalBackground;
      button.style.borderColor = originalBorderColor;
      button.style.transform = originalTransform;
    }
    flashCount++;
  }, 100);
}

// Stats tracking
let totalFoodCollected = 0;
let totalKills = 0;
let totalDeaths = 0;

// Login modal event listeners
loginBtn?.addEventListener('click', () => {
  loginModal.classList.remove('hidden');
});

loginCloseBtn?.addEventListener('click', () => {
  loginModal.classList.add('hidden');
});

tabLogin?.addEventListener('click', () => {
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  loginForm.classList.remove('hidden');
  registerForm.classList.add('hidden');
  loginError.textContent = '';
});

tabRegister?.addEventListener('click', () => {
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerForm.classList.remove('hidden');
  loginForm.classList.add('hidden');
  registerError.textContent = '';
});

loginForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  login(email, password);
});

registerForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('registerUsername').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;
  const confirm = document.getElementById('registerConfirm').value;

  if (password !== confirm) {
    registerError.textContent = 'Passwords do not match';
    return;
  }
  register(username, email, password);
});

// Close modal on background click
loginModal?.addEventListener('click', (e) => {
  if (e.target === loginModal) {
    loginModal.classList.add('hidden');
  }
});

// Auto-save periodically when logged in
setInterval(() => {
  if (currentUser && myTadpoles.length > 0) {
    saveProgressToServer();
  }
}, SAVE_INTERVAL);

// Periodic sync of creature state to server (every 10 seconds)
// This ensures server has recent state even if page closes abruptly
setInterval(() => {
  if (myTadpoles.length > 0 && socket && socket.connected) {
    const creatures = myTadpoles.map(tad => ({
      id: tad.id,
      type: tad.type,
      name: tad.name,
      x: tad.x,
      y: tad.y,
      angle: tad.angle || 0,
      health: tad.health,
      maxHealth: tad.maxHealth || (tad.type === 'cell' ? CELL_MAX_HEALTH : MAX_HEALTH),
      food: tad.food,
      nucleotides: tad.nucleotides || 0,
      radius: tad.radius,
      healthLevel: tad.healthLevel || 0,
      strengthLevel: tad.strengthLevel || 0,
      capacityLevel: tad.capacityLevel || 0,
      maxHealthBonus: tad.maxHealthBonus || 0,
      strengthBonus: tad.strengthBonus || 0,
      cellHealthLevel: tad.cellHealthLevel || 0,
      cellStrengthLevel: tad.cellStrengthLevel || 0,
      cellCapacityLevel: tad.cellCapacityLevel || 0,
      cellSpeedLevel: tad.cellSpeedLevel || 0,
      cellSpeedBonus: tad.cellSpeedBonus || 0,
      cellStrengthBonus: tad.cellStrengthBonus || 0,
      cellMaxHealthBonus: tad.cellMaxHealthBonus || 0,
      hasProtector: tad.hasProtector || false,
      bubbleShieldActive: tad.bubbleShieldActive || false,
      hasSword: tad.hasSword || false,
      hasCellTail: tad.hasCellTail || false,
      canHibernate: tad.canHibernate || false,
      isFarming: tad.isFarming || false
    }));
    socket.emit('syncCreatures', { creatures });
  }
}, 10000); // Every 10 seconds

// Check session on page load
checkSession();

// ===== End Authentication System =====

// ===== Hibernation Menu System =====
function showHibernationMenu(cell) {
  if (!hibernationMenu) return;

  // Reset selection to tadpole
  selectedOffspringType = 'tadpole';
  hibernationTadpole?.classList.add('selected');
  hibernationBacteria?.classList.remove('selected');

  // Check if Prokaryosis (bacteria) option is available
  // Requires Nucleus unlock (healthLevel >= 3 for tadpoles, or being a cell)
  const hasNucleus = (cell.healthLevel || 0) >= 3 || cell.type === 'cell';
  if (hibernationBacteria) {
    if (hasNucleus) {
      hibernationBacteria.classList.remove('locked');
    } else {
      hibernationBacteria.classList.add('locked');
    }
  }

  // Show the menu
  hibernationMenu.classList.remove('hidden');

  // Start timer update interval
  if (hibernationMenuInterval) clearInterval(hibernationMenuInterval);
  hibernationMenuInterval = setInterval(() => updateHibernationTimer(cell), 100);
}

function hideHibernationMenu() {
  if (!hibernationMenu) return;
  hibernationMenu.classList.add('hidden');

  if (hibernationMenuInterval) {
    clearInterval(hibernationMenuInterval);
    hibernationMenuInterval = null;
  }
}

function updateHibernationTimer(cell) {
  if (!cell || !cell.isHibernating || !cell.hibernationStartTime) {
    hideHibernationMenu();
    return;
  }

  const HIBERNATION_DURATION = 30000; // 30 seconds
  const elapsed = Date.now() - cell.hibernationStartTime;
  const remaining = Math.max(0, HIBERNATION_DURATION - elapsed);
  const progress = Math.min(elapsed / HIBERNATION_DURATION * 100, 100);

  if (hibernationTimerFill) {
    hibernationTimerFill.style.width = progress + '%';
  }
  if (hibernationTimeLeft) {
    hibernationTimeLeft.textContent = Math.ceil(remaining / 1000) + 's';
  }

  // Hide menu when hibernation completes
  if (remaining <= 0) {
    hideHibernationMenu();
  }
}

// Hibernation menu event listeners
hibernationTadpole?.addEventListener('click', () => {
  selectedOffspringType = 'tadpole';
  hibernationTadpole.classList.add('selected');
  hibernationBacteria?.classList.remove('selected');
});

hibernationBacteria?.addEventListener('click', () => {
  // Check if locked
  if (hibernationBacteria.classList.contains('locked')) return;

  selectedOffspringType = 'bacteria';
  hibernationBacteria.classList.add('selected');
  hibernationTadpole?.classList.remove('selected');
});

hibernationCancelBtn?.addEventListener('click', () => {
  // Cancel hibernation for the selected cell
  const selectedId = Array.from(selectedTadpoles)[0];
  const selectedTad = myTadpoles.find(t => t.id === selectedId);
  if (selectedTad && selectedTad.isHibernating) {
    selectedTad.isHibernating = false;
    selectedTad.hibernationStartTime = null;
  }
  hideHibernationMenu();
});

// ===== End Hibernation Menu System =====

// Tutorial system
const tutorialTooltip = document.getElementById('tutorialTooltip');
const tooltipText = document.getElementById('tooltipText');
const tooltipDismiss = document.getElementById('tooltipDismiss');
const tooltipArrow = tutorialTooltip.querySelector('.tooltip-arrow');

const tutorialSteps = [
  {
    id: 'movement',
    text: "Welcome, little one! Click anywhere to swim, or use Arrow Keys/WASD to explore.",
    trigger: 'immediate',
    dismissOn: 'movement' // Dismissed when player moves
  },
  {
    id: 'food',
    text: "Great! See those glowing orbs? Swim into them to collect food!",
    trigger: 'afterMovement',
    dismissOn: 'collectFood' // Dismissed when food is collected
  },
  {
    id: 'upgrade',
    text: "Nice catch! Right-click and select 'Upgrade' to grow stronger!",
    trigger: 'hasFood',
    dismissOn: 'upgrade' // Dismissed when upgrade is purchased
  },
  {
    id: 'combat',
    text: "You're getting stronger! Watch out for cells - they're dangerous. Good luck!",
    trigger: 'afterUpgrade',
    dismissOn: 'timeout' // Auto-dismiss after a few seconds
  }
];

let tutorialState = {
  currentStep: 0,
  completed: JSON.parse(localStorage.getItem('tutorialCompleted') ?? 'true'), // Off by default, use /tutorial on to enable
  hasMoved: false,
  hasCollectedFood: false,
  hasUpgraded: false,
  movementDistance: 0,
  startPos: null,
  tooltipVisible: false,
  tooltipTimeout: null
};

function showTutorialTooltip(step) {
  if (tutorialState.completed) return;
  if (tutorialState.tooltipVisible) return; // Don't show if already showing

  const stepData = tutorialSteps[step];
  if (!stepData) return;

  tooltipText.textContent = stepData.text;
  tooltipDismiss.style.display = 'none'; // Hide the button

  // Set initial position above player (center of screen initially)
  const screenCenterX = canvas.width / 2;
  const screenCenterY = canvas.height / 2;
  const offset = 120;

  tutorialTooltip.style.left = screenCenterX + 'px';
  tutorialTooltip.style.top = (screenCenterY - offset) + 'px';
  tutorialTooltip.style.transform = 'translate(-50%, -100%)';
  tooltipArrow.style.display = 'block';
  tooltipArrow.style.left = '50%';
  tooltipArrow.style.bottom = '-10px';
  tooltipArrow.style.transform = 'translateX(-50%)';

  tutorialTooltip.classList.remove('hidden');
  tutorialState.tooltipVisible = true;

  // Auto-dismiss timeout for the last step
  if (stepData.dismissOn === 'timeout') {
    tutorialState.tooltipTimeout = setTimeout(() => {
      advanceTutorial();
    }, 5000);
  }
}

function updateTooltipPosition() {
  if (!tutorialState.tooltipVisible) return;
  if (myTadpoles.length === 0) return;
  if (!camera) return;

  const tad = myTadpoles[0];
  // Convert world position to screen position
  const screenX = (tad.x - camera.x) * camera.zoom + canvas.width / 2;
  const screenY = (tad.y - camera.y) * camera.zoom + canvas.height / 2;

  // Responsive tooltip sizing
  const tooltipWidth = Math.min(280, canvas.width * 0.8);
  const tooltipHeight = 80;
  const offset = Math.max(80, canvas.height * 0.1); // Distance above player

  let tooltipX = screenX;
  let tooltipY = screenY - offset;

  // Keep tooltip on screen
  tooltipX = Math.max(tooltipWidth / 2 + 10, Math.min(canvas.width - tooltipWidth / 2 - 10, tooltipX));
  tooltipY = Math.max(20, tooltipY);

  // If too close to top, put it below instead
  if (tooltipY < 60) {
    tooltipY = screenY + offset * 0.8;
    tooltipArrow.style.bottom = 'auto';
    tooltipArrow.style.top = '-10px';
    tooltipArrow.style.transform = 'translateX(-50%) rotate(180deg)';
    tutorialTooltip.style.transform = 'translate(-50%, 0)';
  } else {
    tooltipArrow.style.bottom = '-10px';
    tooltipArrow.style.top = 'auto';
    tooltipArrow.style.transform = 'translateX(-50%)';
    tutorialTooltip.style.transform = 'translate(-50%, -100%)';
  }

  tutorialTooltip.style.left = tooltipX + 'px';
  tutorialTooltip.style.top = tooltipY + 'px';
  tooltipArrow.style.display = 'block';
  tooltipArrow.style.left = '50%';
}

function hideTutorialTooltip() {
  tutorialTooltip.classList.add('hidden');
  tutorialState.tooltipVisible = false;
  if (tutorialState.tooltipTimeout) {
    clearTimeout(tutorialState.tooltipTimeout);
    tutorialState.tooltipTimeout = null;
  }
}

function advanceTutorial() {
  hideTutorialTooltip();
  tutorialState.currentStep++;

  if (tutorialState.currentStep >= tutorialSteps.length) {
    // Tutorial complete
    tutorialState.completed = true;
    localStorage.setItem('tutorialCompleted', 'true');
    return;
  }

  // Check if next step should show immediately
  checkTutorialTriggers();
}

function checkTutorialTriggers() {
  if (tutorialState.completed) return;
  if (tutorialState.currentStep >= tutorialSteps.length) return;

  const currentStepData = tutorialSteps[tutorialState.currentStep];

  switch (currentStepData.trigger) {
    case 'immediate':
      setTimeout(() => showTutorialTooltip(tutorialState.currentStep), 1000);
      break;
    case 'afterMovement':
      if (tutorialState.movementDistance > 200) {
        setTimeout(() => showTutorialTooltip(tutorialState.currentStep), 500);
      }
      break;
    case 'hasFood':
      if (tutorialState.hasCollectedFood) {
        setTimeout(() => showTutorialTooltip(tutorialState.currentStep), 500);
      }
      break;
    case 'afterUpgrade':
      if (tutorialState.hasUpgraded) {
        setTimeout(() => showTutorialTooltip(tutorialState.currentStep), 500);
      }
      break;
  }
}

function checkTutorialDismiss() {
  if (!tutorialState.tooltipVisible) return;
  if (tutorialState.currentStep >= tutorialSteps.length) return;

  const currentStepData = tutorialSteps[tutorialState.currentStep];

  switch (currentStepData.dismissOn) {
    case 'movement':
      if (tutorialState.movementDistance > 100) {
        advanceTutorial();
      }
      break;
    case 'collectFood':
      if (tutorialState.hasCollectedFood) {
        advanceTutorial();
      }
      break;
    case 'upgrade':
      if (tutorialState.hasUpgraded) {
        advanceTutorial();
      }
      break;
    // 'timeout' is handled in showTutorialTooltip
  }
}

function updateTutorialProgress() {
  if (tutorialState.completed) return;

  // Track movement distance
  if (myTadpoles.length > 0) {
    const tad = myTadpoles[0];
    if (!tutorialState.startPos) {
      tutorialState.startPos = { x: tad.x, y: tad.y };
    } else {
      const dx = tad.x - tutorialState.startPos.x;
      const dy = tad.y - tutorialState.startPos.y;
      tutorialState.movementDistance = Math.sqrt(dx * dx + dy * dy);
    }

    // Check if player collected food
    if ((tad.food || 0) > 0 && !tutorialState.hasCollectedFood) {
      tutorialState.hasCollectedFood = true;
    }
  }

  // Update tooltip position to follow player
  updateTooltipPosition();

  // Check if current step should be dismissed
  checkTutorialDismiss();

  // Check if next step should trigger
  checkTutorialTriggers();
}

// Tutorial dismiss button handler (fallback)
tooltipDismiss.addEventListener('click', advanceTutorial);

// Tech Tree nodes - Health and Strength are root branches, Capacity branches from Health
const techNodes = {
  // Health branch (root)
  techMembrane: { type: 'health', level: 1, cost: 5, requires: null },
  techCytoplasm: { type: 'health', level: 2, cost: 8, requires: 'techMembrane' },
  techNucleus: { type: 'health', level: 3, cost: 12, requires: 'techCytoplasm' },
  // Capacity branch (branches from Health/Membrane)
  techVacuole: { type: 'capacity', level: 1, cost: 3, requires: 'techMembrane' },
  techLysosome: { type: 'capacity', level: 2, cost: 5, requires: 'techVacuole' },
  // Strength branch (root)
  techFlagellum: { type: 'strength', level: 1, cost: 5, requires: null },
  techPseudopod: { type: 'strength', level: 2, cost: 8, requires: 'techFlagellum' },
  techCytoskeleton: { type: 'strength', level: 3, cost: 12, requires: 'techPseudopod' },
  // Evolution (requires Nucleus)
  techMitosis: { type: 'transform', level: 1, cost: 20, requires: 'techNucleus' },
  techBacteria: { type: 'transformBacteria', level: 1, cost: 15, requires: 'techNucleus' }
};

// Cell-specific technology tree
const cellTechNodes = {
  // Defense branch (root) - Health for cells
  cellTechWall: { type: 'cellHealth', level: 1, cost: 8, requires: null, branch: 'defense' },
  cellTechER: { type: 'cellHealth', level: 2, cost: 12, requires: 'cellTechWall', branch: 'defense' },
  cellTechGolgi: { type: 'cellHealth', level: 3, cost: 18, requires: 'cellTechER', branch: 'defense' },
  cellTechProtector: { type: 'cellProtector', level: 4, cost: 25, requires: 'cellTechGolgi', branch: 'defense' },
  // Storage branch (branches from Defense)
  cellTechStorage: { type: 'cellCapacity', level: 1, cost: 6, requires: 'cellTechWall', branch: 'defense' },
  cellTechHibernate: { type: 'cellHibernate', level: 2, cost: 10, requires: 'cellTechStorage', branch: 'defense' },
  cellTechLipid: { type: 'cellCapacity', level: 2, cost: 10, requires: 'cellTechStorage', branch: 'defense' },
  cellTechGlycogen: { type: 'cellCapacity', level: 3, cost: 15, requires: 'cellTechLipid', branch: 'defense' },
  // Speed branch (root) - Level 2 gives tail
  cellTechCilia: { type: 'cellSpeed', level: 1, cost: 6, requires: null, branch: 'speed' },
  cellTechMotor: { type: 'cellSpeed', level: 2, cost: 12, requires: 'cellTechCilia', branch: 'speed' },
  cellTechJet: { type: 'cellSpeed', level: 3, cost: 18, requires: 'cellTechMotor', branch: 'speed' },
  // Offense branch (root) - Strength for cells
  cellTechEnzymes: { type: 'cellStrength', level: 1, cost: 8, requires: null, branch: 'offense' },
  cellTechToxin: { type: 'cellStrength', level: 2, cost: 12, requires: 'cellTechEnzymes', branch: 'offense' },
  cellTechPredator: { type: 'cellStrength', level: 3, cost: 18, requires: 'cellTechToxin', branch: 'offense' },
  cellTechSword: { type: 'cellSword', level: 4, cost: 25, requires: 'cellTechPredator', branch: 'offense' }
};

// Cell upgrade bonuses
const CELL_HEALTH_BONUSES = [30, 60, 90]; // Cumulative health bonus per level
const CELL_STRENGTH_BONUSES = [15, 30, 50, 75]; // Cumulative damage bonus per level (4 levels now)
const CELL_CAPACITY_BONUSES = [15, 30, 50]; // Cumulative capacity bonus per level
const CELL_SPEED_BONUSES = [0.15, 0.25, 0.40]; // Speed multiplier bonus per level

// Delegated click handler for creature list
creatureList.addEventListener('click', (e) => {
  // Find the creature item that was clicked
  let creatureItem = e.target;
  while (creatureItem && !creatureItem.classList.contains('creature-item')) {
    creatureItem = creatureItem.parentElement;
    if (creatureItem === creatureList || !creatureItem) {
      return;
    }
  }

  if (creatureItem && creatureItem.classList.contains('creature-item')) {
    const creatureIndex = parseInt(creatureItem.getAttribute('data-creature-index'));
    const creatureId = creatureItem.getAttribute('data-creature-id');

    // Find the actual creature object - prefer ID over index for robustness
    let tad = myTadpoles.find(t => t.id === creatureId);
    if (!tad && creatureIndex >= 0 && creatureIndex < myTadpoles.length) {
      tad = myTadpoles[creatureIndex]; // Fallback to index
    }
    if (!tad) {
      console.warn('Could not find creature with id:', creatureId, 'or index:', creatureIndex);
      return;
    }

    // If in support selection mode
    if (waitingForSupportTarget) {
      if (tad.id === supportSourceId) {
        // Clicking the source creature cancels selection mode
        waitingForSupportTarget = false;
        supportSourceId = null;
        updateSelectionCount();
        return;
      } else {
        // Clicking a valid target sets up the support relationship
        const sourceCreature = myTadpoles.find(t => t.id === supportSourceId);
        if (sourceCreature) {
          sourceCreature.supportMode = true;
          sourceCreature.supportLeader = tad.id;

          waitingForSupportTarget = false;
          supportSourceId = null;

          // Select the host creature (the one being supported)
          selectedTadpoles.clear();
          selectedTadpoles.add(tad.id);
          updateSelectionCount();
        }
        return;
      }
    }

    // If in food transfer selection mode
    if (waitingForFoodTarget) {
      if (tad.id === foodSourceId) {
        // Clicking the source creature cancels selection mode
        waitingForFoodTarget = false;
        foodSourceId = null;
        updateSelectionCount();
        return;
      } else {
        // Clicking a valid target transfers food
        const sourceCreature = myTadpoles.find(t => t.id === foodSourceId);
        if (sourceCreature && sourceCreature.food > 0) {
          // Calculate how much food can be transferred
          const targetCapacity = tad.type === 'cell' ? CELL_FOOD_CAPACITY : getFoodCapacity(tad);
          const availableSpace = targetCapacity - (tad.food || 0);
          const transferAmount = Math.min(sourceCreature.food, availableSpace);

          if (transferAmount > 0) {
            // Transfer the food
            sourceCreature.food -= transferAmount;
            tad.food = (tad.food || 0) + transferAmount;
            console.log(`Transferred ${transferAmount} food from creature to creature`);
          }

          waitingForFoodTarget = false;
          foodSourceId = null;

          // Select the receiving creature
          selectedTadpoles.clear();
          selectedTadpoles.add(tad.id);
          updateSelectionCount();
        }
        return;
      }
    }

    // Normal selection behavior
    const previousSelection = new Set(selectedTadpoles);

    if (e.shiftKey) {
      // Shift-click: toggle selection
      if (selectedTadpoles.has(tad.id)) {
        selectedTadpoles.delete(tad.id);
      } else {
        selectedTadpoles.add(tad.id);
      }
    } else {
      // Regular click: clear selection and select only this one
      selectedTadpoles.clear();
      selectedTadpoles.add(tad.id);
    }

    // Clear move/attack targets when selection changes (not when adding to selection)
    let selectionChanged = false;
    if (selectedTadpoles.size !== previousSelection.size) {
      selectionChanged = true;
    } else {
      for (let id of selectedTadpoles) {
        if (!previousSelection.has(id)) {
          selectionChanged = true;
          break;
        }
      }
    }

    if (selectionChanged && !e.shiftKey) {
      // Clear commands for newly selected creatures (globals)
      moveTarget = null;
      attackTarget = null;
      // Also clear per-creature targets for the newly selected creatures
      // but don't clear targets for deselected creatures - they should continue their commands
      myTadpoles.forEach(t => {
        if (selectedTadpoles.has(t.id)) {
          t.moveTarget = null;
          t.attackTarget = null;
          t.collectFoodAt = null;
        }
      });
      // Hide hibernation menu when selecting a different creature
      hideHibernationMenu();
    }

    updateSelectionCount();

    // Show menu if any selected
    if (selectedTadpoles.size > 0) {
      selectionMenu.classList.remove('hidden');
    } else {
      selectionMenu.classList.add('hidden');
    }
  }
});

// Double-click on creature list to center camera on that creature (useful for finding lost ones)
creatureList.addEventListener('dblclick', (e) => {
  let creatureItem = e.target;
  while (creatureItem && !creatureItem.classList.contains('creature-item')) {
    creatureItem = creatureItem.parentElement;
    if (creatureItem === creatureList || !creatureItem) {
      return;
    }
  }

  if (creatureItem && creatureItem.classList.contains('creature-item')) {
    const creatureIndex = parseInt(creatureItem.getAttribute('data-creature-index'));
    const creatureId = creatureItem.getAttribute('data-creature-id');
    // Prefer ID over index for robustness
    let tad = myTadpoles.find(t => t.id === creatureId);
    if (!tad && creatureIndex >= 0 && creatureIndex < myTadpoles.length) {
      tad = myTadpoles[creatureIndex];
    }
    if (tad) {
      // Center camera on this creature
      camera.x = tad.x;
      camera.y = tad.y;
    }
  }
});

// Set canvas size to fill screen
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Socket.IO connection
const socket = io();

// Game state
let myId = null;
let myTadpoles = []; // Array of tadpoles the player controls
let players = {}; // Other players
let npcs = {}; // NPC tadpoles
let keys = {};
let food = {};
let selectedTadpoles = new Set(); // Set of selected tadpole IDs
let isDead = false;
let testMode = false; // Cheat mode: infinite food, NPCs ignore you
let isSecondaryWindow = false; // True if this is a secondary window for same user (view-only)
let deathEffects = []; // Array of death splat effects
let particles = []; // Ambient floating particles
let damageTexts = []; // Array of damage text instances
let vanishingFood = []; // Food items that are fading out
let waitingForSupportTarget = false; // True when selecting a creature to support
let supportSourceId = null; // ID of creature that will do the supporting
let waitingForFoodTarget = false; // True when selecting a creature to give food to
let foodSourceId = null; // ID of creature giving food
let lastCreatureCount = 0; // Track when to rebuild creature list
let lastWaitingForSupport = false; // Track when support mode changes
let lastWaitingForFood = false; // Track when food transfer mode changes
let lastSelectedIds = new Set(); // Track selected IDs to detect selection changes
let lastFoodValues = new Map(); // Track food values to detect changes

// Cheat modes
let invincibilityMode = false; // /op command - allow negative health without dying

// Fog of war - track explored regions (grid-based)
const FOG_REGION_SIZE = 100; // Size of each fog region (smaller = more granular)
let exploredRegions = new Set(); // Set of "x,y" region keys

// Upgrade system - 5 levels each
const MAX_UPGRADE_LEVEL = 5;
let healthUpgradeLevel = 0;
let strengthUpgradeLevel = 0;

// Upgrade costs per level [1, 2, 3, 4, 5]
const HEALTH_UPGRADE_COSTS = [3, 6, 12, 20, 35];
const STRENGTH_UPGRADE_COSTS = [3, 6, 12, 20, 35];

// Bonuses per level (cumulative)
const HEALTH_BONUSES = [25, 55, 95, 145, 200]; // +25, +30, +40, +50, +55
const STRENGTH_BONUSES = [8, 18, 32, 50, 75];  // +8, +10, +14, +18, +25

// Food capacity
const TADPOLE_BASE_FOOD_CAPACITY = 10; // Starting capacity
const TADPOLE_MAX_FOOD_CAPACITY = 30; // After full upgrades
const CELL_FOOD_CAPACITY = 50;
const FOOD_CAPACITY_BONUSES = [7, 14, 20]; // +7, +7, +6 = 20 total (10 → 30)
const MAX_CAPACITY_LEVEL = 3;
const CAPACITY_UPGRADE_COSTS = [3, 5, 8]; // Cheaper since only 3 levels

// Hibernation
const HIBERNATION_DURATION = 1 * 60 * 1000; // 1 minute for testing
const TRANSFORMATION_DURATION = 10 * 1000; // 10 seconds to transform to cell
const BACTERIA_TRANSFORMATION_DURATION = 8 * 1000; // 8 seconds to transform to bacteria

// Camera system
let camera = {
  x: 0,
  y: 0,
  targetX: 0,
  targetY: 0
};

// Target for movement
let moveTarget = null;
let attackTarget = null;

// Constants
const INTERPOLATION_FACTOR = 0.2;
const MOVE_SPEED = 0.034; // 20% slower top speed
const NPC_MOVE_SPEED = 0.034; // Same as player tadpoles
const FRICTION = 0.988; // Balanced: quick accel, natural gliding
const CAMERA_SMOOTHING = 0.1;
const ARRIVAL_THRESHOLD = 30; // ~1.5 tadpole lengths - comfortable arrival distance
const TAIL_SEGMENTS = 8;
const TAIL_LENGTH = 35;
const TAIL_WIGGLE_SPEED = 0.15;
const TRAIL_LENGTH = 15;
const WORLD_SIZE = 4000;
const FOOD_RADIUS = 4; // Slightly smaller
const TADPOLE_RADIUS = 9; // Player tadpoles - smaller
const NPC_TADPOLE_RADIUS = 11.2; // NPCs are bigger
const CELL_RADIUS = 30; // Player cells
const NPC_CELL_RADIUS = 40; // NPC cells are bigger than player cells
const BACTERIA_RADIUS = 18; // Bacteria are medium-sized
const BACTERIA_MAX_HEALTH = 60; // Bacteria are weaker
const BACTERIA_FOOD_CAPACITY = 30; // Medium capacity
const BACTERIA_FARM_RATE = 0.002; // Food per frame when farming (~0.12 food/sec at 60fps)
// Combat stats - NPCs have advantage until player upgrades
const MAX_HEALTH = 70; // Player base health (weak at start)
const CELL_MAX_HEALTH = 120; // Player cell base health
const NPC_TADPOLE_HEALTH = 80; // NPC tadpoles - tankier than players
const NPC_CELL_HEALTH = 200; // NPC cells - very tanky
const NPC_MAX_HEALTH = 100; // Default NPC health (used for generic NPCs)
const HEALTH_REGEN_RATE = 0.02; // HP per frame (~1.2 HP/sec at 60fps)
const NPC_HEALTH_REGEN_RATE = 0.015; // NPCs regen a bit faster

// Attack stats - NPCs win 1v1 until 2 upgrades
const ATTACK_DAMAGE = 14; // Base player damage (weak at start)
const NPC_TADPOLE_DAMAGE = 20; // NPC tadpoles hit harder than players!
const NPC_CELL_DAMAGE = 30; // NPC cells hit harder
const ATTACK_RANGE = 80; // Tighter attack range
const TADPOLE_ATTACK_COOLDOWN = 650; // ms - slightly slower player attacks
const CELL_ATTACK_COOLDOWN = 900; // ms - cells attack slower but harder
const NPC_ATTACK_COOLDOWN = 700; // ms - NPCs attack faster!
const ATTACK_LUNGE_DISTANCE = 18; // Slightly longer lunge
const ATTACK_LUNGE_DURATION = 120; // ms - snappier lunge
const CELL_DAMAGE_RESISTANCE = 0.6; // Cells take 40% less damage

// Player stats (can be modified with cheat commands)
let playerHealth = MAX_HEALTH;
let playerStrength = ATTACK_DAMAGE;

// Global wave/ripple simulation
function getWaveOffset(x, y, time) {
  // Multiple overlapping waves with different frequencies and directions
  const wave1 = Math.sin(x * 0.01 + time * 0.5) * Math.cos(y * 0.01 + time * 0.3);
  const wave2 = Math.sin(x * 0.015 - time * 0.4) * Math.cos(y * 0.02 - time * 0.35);
  const wave3 = Math.sin((x + y) * 0.008 + time * 0.6) * 0.5;

  return {
    x: (wave1 + wave2 * 0.7 + wave3) * 2,
    y: (wave1 * 0.8 + wave2 + wave3 * 0.6) * 2
  };
}

// Get food capacity for a creature
function getFoodCapacity(tad) {
  if (tad.type === 'cell') {
    return CELL_FOOD_CAPACITY;
  }
  if (tad.type === 'bacteria') {
    return BACTERIA_FOOD_CAPACITY;
  }
  // Tadpole: base + upgrade bonuses
  const capacityLevel = tad.capacityLevel || 0;
  const bonus = capacityLevel > 0 ? FOOD_CAPACITY_BONUSES[capacityLevel - 1] : 0;
  return TADPOLE_BASE_FOOD_CAPACITY + bonus;
}

// Update stats display
function updateStatsDisplay() {
  // Show stats for selected tadpole, or first tadpole if none selected
  let displayTad = myTadpoles[0];
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    if (selectedTad) {
      displayTad = selectedTad;
    }
  }

  if (displayTad) {
    // Show creature type
    const typeNames = { tadpole: 'Tadpole', cell: 'Cell', bacteria: 'Bacteria' };
    typeStat.textContent = typeNames[displayTad.type] || 'Tadpole';
    healthStat.textContent = Math.round(displayTad.health);
    strengthStat.textContent = Math.round(playerStrength);
    foodStat.textContent = displayTad.food || 0;
    foodCapacityStat.textContent = getFoodCapacity(displayTad);
    const nucleotides = displayTad.nucleotides || 0;
    nucleotideStat.textContent = nucleotides;
    // Only show nucleotide row when player has collected one
    if (nucleotides > 0) {
      nucleotideRow.classList.remove('hidden');
    } else {
      nucleotideRow.classList.add('hidden');
    }
  } else {
    typeStat.textContent = '-';
    healthStat.textContent = '0';
    strengthStat.textContent = '0';
    foodStat.textContent = '0';
    foodCapacityStat.textContent = '0';
    nucleotideStat.textContent = '0';
    nucleotideRow.classList.add('hidden');
  }
}

// Socket event handlers
socket.on('connect', () => {
  statusEl.textContent = 'Connected';
  statusEl.className = 'connected';
});

socket.on('disconnect', () => {
  statusEl.textContent = 'Disconnected';
  statusEl.className = 'disconnected';
});

// Restore position from idle NPC when reconnecting
socket.on('restorePosition', (data) => {
  console.log(`Restoring position from idle NPC: (${data.x}, ${data.y})`);
  if (myTadpoles.length > 0) {
    myTadpoles.forEach(tad => {
      tad.x = data.x;
      tad.y = data.y;
      tad.renderX = data.x;
      tad.renderY = data.y;
      tad.vx = 0;
      tad.vy = 0;
      // Restore protector/shield state from idle NPC
      if (data.hasProtector !== undefined) {
        tad.hasProtector = data.hasProtector;
        tad.canBubbleShield = data.hasProtector;
      }
      if (data.bubbleShieldActive !== undefined) {
        tad.bubbleShieldActive = data.bubbleShieldActive;
      }
    });
  }
});

// Restore all creatures from idle NPCs when reconnecting
socket.on('restoreCreatures', (data) => {
  console.log(`Restoring ${data.creatures.length} creatures from idle NPCs`);

  // Clear current creatures and rebuild from restored data
  myTadpoles = [];
  selectedTadpoles.clear();

  data.creatures.forEach((creature, index) => {
    // Determine type-specific defaults
    let defaultColor = '#FFFFFF';
    let defaultRadius = TADPOLE_RADIUS;
    let defaultHealth = MAX_HEALTH;
    if (creature.type === 'cell') {
      defaultColor = '#4a5f7f';
      defaultRadius = CELL_RADIUS;
      defaultHealth = CELL_MAX_HEALTH;
    } else if (creature.type === 'bacteria') {
      defaultColor = '#7fbf7f';
      defaultRadius = BACTERIA_RADIUS;
      defaultHealth = BACTERIA_MAX_HEALTH;
    }

    // Validate position (typeof check needed because isFinite(null) returns true)
    const isValidX = typeof creature.x === 'number' && isFinite(creature.x);
    const isValidY = typeof creature.y === 'number' && isFinite(creature.y);
    const validX = isValidX ? creature.x : (Math.random() - 0.5) * 500;
    const validY = isValidY ? creature.y : (Math.random() - 0.5) * 500;
    if (!isValidX || !isValidY) {
      console.warn(`Restored creature ${index} had invalid position, using random`);
    }

    const tad = {
      id: creature.id || `restored_${Date.now()}_${index}`,
      x: validX,
      y: validY,
      renderX: validX,
      renderY: validY,
      vx: 0,
      vy: 0,
      color: defaultColor,
      radius: creature.radius || defaultRadius,
      name: currentUser ? currentUser.username : creature.name,
      type: creature.type || 'tadpole',
      health: creature.health || defaultHealth,
      maxHealth: creature.maxHealth || defaultHealth,
      food: creature.food || 0,
      nucleotides: creature.nucleotides || 0,
      angle: creature.angle || 0,
      wiggleOffset: Math.random() * Math.PI * 2,
      lastHit: 0,
      lastAttack: 0,
      // Tadpole upgrades
      healthLevel: creature.healthLevel || 0,
      strengthLevel: creature.strengthLevel || 0,
      capacityLevel: creature.capacityLevel || 0,
      maxHealthBonus: creature.maxHealthBonus || 0,
      strengthBonus: creature.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: creature.cellHealthLevel || 0,
      cellStrengthLevel: creature.cellStrengthLevel || 0,
      cellCapacityLevel: creature.cellCapacityLevel || 0,
      cellSpeedLevel: creature.cellSpeedLevel || 0,
      cellSpeedBonus: creature.cellSpeedBonus || 0,
      cellStrengthBonus: creature.cellStrengthBonus || 0,
      hasProtector: creature.hasProtector || false,
      canBubbleShield: creature.hasProtector || false,
      bubbleShieldActive: creature.bubbleShieldActive || false,
      hasSword: creature.hasSword || false,
      hasCellTail: creature.hasCellTail || false,
      canHibernate: creature.canHibernate || false,
      // Bacteria-specific
      isFarming: creature.isFarming || false
    };

    // Initialize type-specific properties
    if (tad.type === 'tadpole') {
      initializeTadpole(tad);
    } else if (tad.type === 'cell') {
      tad.wiggleOffset = Math.random() * Math.PI * 2;
      if (tad.hasCellTail) {
        initializeCellTail(tad);
      }
    } else if (tad.type === 'bacteria') {
      tad.blobShape = generateBlobShape();
    }

    myTadpoles.push(tad);
    if (index === 0) {
      selectedTadpoles.add(tad.id);
    }
  });

  // Initialize particles around first creature
  if (myTadpoles.length > 0) {
    initializeParticles(myTadpoles[0].x, myTadpoles[0].y);
  }

  updateSelectionCount();
  console.log(`Restored ${myTadpoles.length} creatures`);
});

socket.on('init', async (data) => {
  myId = data.id;

  // Check if user died while inactive FIRST - before any other logic
  if (data.diedWhileInactive) {
    console.log('You died while inactive (before reconnecting)');
    isDead = true;
    myTadpoles = [];
    selectedTadpoles.clear();

    // Clear saved progress so player starts fresh as tadpole
    clearProgressOnDeath();

    // Update death screen message
    const deathTitle = deathScreen.querySelector('h1');
    if (deathTitle) {
      deathTitle.textContent = 'You Died While Inactive';
    }
    deathScreen.classList.remove('hidden');
    return; // Don't initialize anything else
  }

  // Wait for session check to complete (with timeout)
  let waitCount = 0;
  while (!sessionCheckComplete && waitCount < 50) {
    await new Promise(resolve => setTimeout(resolve, 50));
    waitCount++;
  }

  // If server sent restored creatures from idle NPCs, use those
  if (data.restoredCreatures && data.restoredCreatures.length > 0) {
    console.log(`Restoring ${data.restoredCreatures.length} creatures from server (idle NPCs)`);

    // Clear current creatures and rebuild from restored data
    myTadpoles = [];
    selectedTadpoles.clear();

    data.restoredCreatures.forEach((creature, index) => {
      // Determine type-specific defaults
      let defaultColor = '#FFFFFF';
      let defaultRadius = TADPOLE_RADIUS;
      let defaultHealth = MAX_HEALTH;
      if (creature.type === 'cell') {
        defaultColor = '#4a5f7f';
        defaultRadius = CELL_RADIUS;
        defaultHealth = CELL_MAX_HEALTH;
      } else if (creature.type === 'bacteria') {
        defaultColor = '#7fbf7f';
        defaultRadius = BACTERIA_RADIUS;
        defaultHealth = BACTERIA_MAX_HEALTH;
      }

      // Validate position (typeof check needed because isFinite(null) returns true)
      const isValidX = typeof creature.x === 'number' && isFinite(creature.x);
      const isValidY = typeof creature.y === 'number' && isFinite(creature.y);
      const validX = isValidX ? creature.x : (Math.random() - 0.5) * 500;
      const validY = isValidY ? creature.y : (Math.random() - 0.5) * 500;
      if (!isValidX || !isValidY) {
        console.warn(`Init creature ${index} had invalid position, using random`);
      }

      const tad = {
        id: creature.id || `creature_${index}`,
        x: validX,
        y: validY,
        renderX: validX,
        renderY: validY,
        vx: 0,
        vy: 0,
        color: defaultColor,
        radius: creature.radius || defaultRadius,
        health: creature.health || defaultHealth,
        maxHealth: creature.maxHealth || defaultHealth,
        food: creature.food || 0,
        nucleotides: creature.nucleotides || 0,
        angle: creature.angle || 0,
        type: creature.type || 'tadpole',
        lastHit: 0,
        lastAttack: 0,
        name: currentUser?.username || data.player.name || 'Player',
        // Tadpole upgrades
        healthLevel: creature.healthLevel || 0,
        strengthLevel: creature.strengthLevel || 0,
        capacityLevel: creature.capacityLevel || 0,
        maxHealthBonus: creature.maxHealthBonus || 0,
        strengthBonus: creature.strengthBonus || 0,
        // Cell upgrades
        cellHealthLevel: creature.cellHealthLevel || 0,
        cellStrengthLevel: creature.cellStrengthLevel || 0,
        cellCapacityLevel: creature.cellCapacityLevel || 0,
        cellSpeedLevel: creature.cellSpeedLevel || 0,
        cellSpeedBonus: creature.cellSpeedBonus || 0,
        cellStrengthBonus: creature.cellStrengthBonus || 0,
        cellMaxHealthBonus: creature.cellMaxHealthBonus || 0,
        hasProtector: creature.hasProtector || false,
        canBubbleShield: creature.hasProtector || false,
        bubbleShieldActive: creature.bubbleShieldActive || false,
        hasSword: creature.hasSword || false,
        hasCellTail: creature.hasCellTail || false,
        canHibernate: creature.canHibernate || false,
        // Bacteria-specific
        isFarming: creature.isFarming || false
      };

      // Initialize type-specific properties
      if (tad.type === 'tadpole') {
        initializeTadpole(tad);
      } else if (tad.type === 'cell') {
        tad.wiggleOffset = Math.random() * Math.PI * 2;
        if (tad.hasCellTail) {
          initializeCellTail(tad);
        }
      } else if (tad.type === 'bacteria') {
        tad.blobShape = generateBlobShape();
      }

      myTadpoles.push(tad);
      if (index === 0) {
        selectedTadpoles.add(tad.id);
      }
    });

    // Initialize particles around first creature
    if (myTadpoles.length > 0) {
      initializeParticles(myTadpoles[0].x, myTadpoles[0].y);
    }

    // Clear movement target so creatures stay still
    moveTarget = null;

    updateSelectionCount();
    console.log(`Restored ${myTadpoles.length} creatures from idle NPCs`);

    // Still need to call setName to update server tracking
    if (currentUser && !data.isSecondary) {
      socket.emit('setName', currentUser.username);
    }
    return;
  }

  // If we already have creatures loaded from saved progress, don't overwrite them
  if (myTadpoles.length > 0) {
    console.log('Keeping loaded creatures, skipping default spawn');

    // Use username if logged in (but only call setName for primary windows)
    if (currentUser) {
      myTadpoles.forEach(tad => {
        tad.name = currentUser.username;
      });
      // Only call setName for primary windows - secondary windows are already handled by server
      if (!data.isSecondary) {
        socket.emit('setName', currentUser.username);
      }
    }

    // Initialize particles around first creature
    const firstTad = myTadpoles[0];
    initializeParticles(firstTad.x, firstTad.y);

    // Initialize tails and ensure zero velocity for loaded creatures
    myTadpoles.forEach(tad => {
      // Start stationary
      tad.vx = 0;
      tad.vy = 0;

      if (tad.type === 'tadpole') {
        initializeTadpole(tad);
      } else if (tad.type === 'cell') {
        tad.angle = tad.angle || 0;
        tad.wiggleOffset = tad.wiggleOffset || Math.random() * Math.PI * 2;
        if (tad.hasCellTail) {
          initializeCellTail(tad);
        }
      }
    });

    // Clear movement target so creatures stay still
    moveTarget = null;

    // Select the first creature
    selectedTadpoles.clear();
    selectedTadpoles.add(firstTad.id);
    updateSelectionCount();
    return;
  }

  const player = data.player;
  player.renderX = player.x;
  player.renderY = player.y;
  player.vx = 0; // Start stationary
  player.vy = 0;
  player.health = player.health || MAX_HEALTH;
  player.lastHit = 0;
  player.lastAttack = 0;
  player.type = player.type || 'tadpole';
  player.food = player.food || 0;
  player.radius = player.radius || TADPOLE_RADIUS;

  // Clear any movement target so player stays still
  moveTarget = null;

  // For secondary windows, server already knows the user - don't call setName
  // For primary windows, set the name
  if (!data.isSecondary && currentUser) {
    player.name = currentUser.username;
    socket.emit('setName', currentUser.username);
  } else if (data.isSecondary) {
    console.log('Secondary window - view only mode (another window controls this tadpole)');
    isSecondaryWindow = true;
    // Use the player's name from server data
    player.name = player.name || currentUser?.username || 'Player';
  }

  initializeTadpole(player);
  myTadpoles = [player];

  // Always select the initial tadpole
  selectedTadpoles.clear();
  selectedTadpoles.add(player.id);
  updateSelectionCount();

  // Reinitialize particles and NPCs around the player's spawn position
  initializeParticles(player.x, player.y);

  // Move NPCs to be around the player's spawn position
  const npcSpawnRange = 2000;
  Object.values(npcs).forEach(npc => {
    const angle = Math.random() * Math.PI * 2;
    const dist = npcSpawnRange * 0.4 + Math.random() * npcSpawnRange * 0.6;
    npc.x = player.x + Math.cos(angle) * dist;
    npc.y = player.y + Math.sin(angle) * dist;
    npc.renderX = npc.x;
    npc.renderY = npc.y;
  });

  // Initialize tutorial for new players
  tutorialState.startPos = { x: player.x, y: player.y };
  checkTutorialTriggers();
});

socket.on('players', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    if (id !== myId) {
      const player = serverPlayers[id];
      player.renderX = player.x;
      player.renderY = player.y;
      // Preserve server values, only set defaults if not provided
      player.health = player.health || MAX_HEALTH;
      player.maxHealth = player.maxHealth || MAX_HEALTH;
      player.lastHit = player.lastHit || 0;
      player.lastAttack = 0;
      player.type = player.type || 'tadpole';
      player.color = player.color || '#4a5a6a'; // Dark blue-grey for other players
      player.creatures = player.creatures || [];
      initializeTadpole(player);
      players[id] = player;
    }
  });
});

socket.on('playerJoined', (player) => {
  player.renderX = player.x;
  player.renderY = player.y;
  // Preserve server values, only set defaults if not provided
  player.health = player.health || MAX_HEALTH;
  player.maxHealth = player.maxHealth || MAX_HEALTH;
  player.lastHit = player.lastHit || 0;
  player.lastAttack = 0;
  player.type = player.type || 'tadpole';
  player.color = player.color || '#4a5a6a'; // Dark blue-grey for other players
  player.creatures = player.creatures || [];
  initializeTadpole(player);
  players[player.id] = player;
});

socket.on('playerLeft', (id) => {
  delete players[id];
  // Also remove from NPCs in case they were idle
  delete npcs[id];
});

socket.on('playerIdle', (data) => {
  const playerId = data.id;
  const playerData = data.player;

  // Don't convert own player to NPC
  if (playerId === myId) return;

  // Remove from players if they're there
  if (players[playerId]) {
    console.log('Converting idle player to idle NPC:', playerData.name || playerId);

    // Determine if player was a cell or tadpole
    const wasCell = playerData.type === 'cell';

    // Convert to idle NPC - preserve player type and name
    const idleHealth = wasCell ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH;
    const npc = {
      id: playerId,
      x: playerData.x,
      y: playerData.y,
      vx: 0, // Idle players don't move until provoked
      vy: 0,
      renderX: playerData.x,
      renderY: playerData.y,
      color: '#a0a0a0', // Light grey for idle players
      radius: wasCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
      score: 0,
      name: playerData.name || '', // Preserve player name for idle players
      health: idleHealth,
      maxHealth: idleHealth,
      lastHit: 0,
      lastAttack: 0,
      type: wasCell ? 'cell' : 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false,
      food: playerData.food || 0, // Preserve food storage
      isIdlePlayer: true // Mark as idle player for special rendering
    };
    npc.renderX = npc.x;
    npc.renderY = npc.y;

    // Initialize based on type
    if (wasCell) {
      // Cells need angle and wiggleOffset
      npc.angle = playerData.angle || 0;
      npc.wiggleOffset = playerData.wiggleOffset || Math.random() * Math.PI * 2;
      // Clear any tail data from previous tadpole state
      npc.tail = null;
      // Cell fatigue system
      npc.chaseEnergy = 100;
      npc.maxChaseEnergy = 100;
      npc.isTired = false;
      npc.tiredStartTime = 0;
    } else {
      // Initialize as tadpole
      initializeTadpole(npc);
    }

    // Add to NPCs
    npcs[playerId] = npc;

    // Remove from players
    delete players[playerId];
  }
});

socket.on('playerActive', (data) => {
  const playerId = data.id;

  // If this was an idle NPC, convert back to player
  if (npcs[playerId] && !players[playerId]) {
    console.log('Player became active again, converting NPC back to player:', playerId);

    const npc = npcs[playerId];
    const player = {
      id: playerId,
      x: npc.x,
      y: npc.y,
      vx: npc.vx || 0,
      vy: npc.vy || 0,
      renderX: npc.x,
      renderY: npc.y,
      color: '#4a5a6a', // Player color
      radius: TADPOLE_RADIUS,
      score: 0,
      name: npc.name || '',
      health: MAX_HEALTH,
      lastHit: 0,
      lastAttack: 0,
      type: 'tadpole'
    };

    initializeTadpole(player);
    players[playerId] = player;
    delete npcs[playerId];
  }
});

socket.on('playerMoved', (data) => {
  // If this is our own player (multi-window: another window moved it), sync to myTadpoles
  if (data.id === myId && myTadpoles.length > 0) {
    // Another window controlling our tadpole - sync position
    myTadpoles.forEach(tad => {
      tad.x = data.x;
      tad.y = data.y;
      tad.vx = data.vx;
      tad.vy = data.vy;
      tad.renderX = data.x;
      tad.renderY = data.y;
    });
    return;
  }

  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].vx = data.vx;
    players[data.id].vy = data.vy;
  }
});

socket.on('playerUpdated', (player) => {
  const myTad = myTadpoles.find(t => t.id === player.id);
  if (myTad) {
    myTad.name = player.name;
  } else if (players[player.id]) {
    players[player.id].name = player.name;
  }
});

// Server authoritative state update - sync all player state continuously
socket.on('playerStateUpdate', (playerStates) => {
  for (let playerId in playerStates) {
    // Skip our own player - we're the source of truth for ourselves
    if (playerId === myId) continue;

    const state = playerStates[playerId];

    if (players[playerId]) {
      // Update existing player with server state
      const p = players[playerId];

      // Store server target position for smooth interpolation
      // Instead of snapping, we'll smoothly blend towards server position
      p.serverX = state.x;
      p.serverY = state.y;
      p.vx = state.vx;
      p.vy = state.vy;

      // If this is the first update or player teleported far, snap immediately
      const dx = state.x - (p.x || state.x);
      const dy = state.y - (p.y || state.y);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 200 || !p.x) {
        // Teleport - snap to position
        p.x = state.x;
        p.y = state.y;
        p.renderX = state.x;
        p.renderY = state.y;
      }
      // Otherwise, let interpolateVisuals handle smooth movement
      p.health = state.health;
      p.maxHealth = state.maxHealth;
      p.food = state.food;
      p.nucleotides = state.nucleotides;
      p.type = state.type;
      p.radius = state.radius;
      p.name = state.name;
      p.color = state.color;
      p.score = state.score;
      p.angle = state.angle;
      p.lastHit = state.lastHit;
      p.bubbleShieldActive = state.bubbleShieldActive;
      p.hasProtector = state.hasProtector;
      p.hasSword = state.hasSword;
      p.hasCellTail = state.hasCellTail;
      p.creatures = state.creatures || [];
      // Debug: log when we receive creatures for other players (rate-limited)
      if (state.creatures && state.creatures.length > 1) {
        if (!window._lastSyncInLog || !window._lastSyncInLog[playerId] || Date.now() - window._lastSyncInLog[playerId] > 5000) {
          console.log(`[SYNC IN] Received ${state.creatures.length} creatures for player ${playerId}:`, state.creatures.map(c => `${c.type}@${Math.round(c.x)},${Math.round(c.y)}`).join(', '));
          if (!window._lastSyncInLog) window._lastSyncInLog = {};
          window._lastSyncInLog[playerId] = Date.now();
        }
      }
    } else {
      // New player we didn't know about - add them
      players[playerId] = {
        ...state,
        renderX: state.x,
        renderY: state.y
      };
      initializeTadpole(players[playerId]);
    }
  }

  // Remove players that are no longer in server state
  for (let playerId in players) {
    if (playerId !== myId && !playerStates[playerId]) {
      delete players[playerId];
    }
  }
});

// Food event handlers
socket.on('food', (serverFood) => {
  food = serverFood;
});

socket.on('foodSpawned', (newFood) => {
  if (newFood) {
    newFood.spawnTime = Date.now(); // For spawn animation
    food[newFood.id] = newFood;
  }
});

socket.on('foodEaten', (data) => {
  // Only add to vanishing if food still exists (wasn't already eaten locally)
  // This prevents double-animations when we eat food ourselves
  const foodItem = food[data.foodId];
  if (foodItem) {
    // Food eaten by another player - add vanish animation (no suck target)
    vanishingFood.push({
      ...foodItem,
      vanishTime: Date.now()
    });
  }
  delete food[data.foodId];
});

socket.on('foodReset', (serverFood) => {
  // Clear all existing food and set to new sparse food
  food = serverFood;
  console.log('Food reset - now extremely sparse');
});

// Shield cost events
socket.on('foodUpdate', (data) => {
  // Server updated food (e.g., shield cost)
  // Find the protector cell and update its food
  const protector = myTadpoles.find(t => t.type === 'cell' && t.hasProtector);
  if (protector) {
    protector.food = data.food;
    currentFood = data.food;
  }
});

socket.on('shieldDenied', (data) => {
  // Shield activation denied - not enough food
  console.log('Shield denied:', data.reason);
  // Revert shield state on client
  const protector = myTadpoles.find(t => t.type === 'cell' && t.hasProtector);
  if (protector) {
    protector.bubbleShieldActive = false;
  }
});

socket.on('shieldDeactivated', (data) => {
  // Shield was forcibly deactivated (ran out of food)
  console.log('Shield deactivated:', data.reason);
  const protector = myTadpoles.find(t => t.type === 'cell' && t.hasProtector);
  if (protector) {
    protector.bubbleShieldActive = false;
  }
});

socket.on('shieldCharged', (data) => {
  // Shield hourly cost charged
  console.log(`Shield charged: ${data.cost} food, ${data.remaining} remaining`);
});

// NPC handlers - NPCs are now server-authoritative
socket.on('npcs', (serverNpcs) => {
  // Initial NPC state from server
  npcs = {};
  Object.values(serverNpcs).forEach(npcData => {
    // Skip the current user's own idle NPCs (they should have been deleted, but just in case)
    if (npcData.isIdlePlayer && currentUser &&
        (npcData.name === currentUser.username || npcData.ownerName === currentUser.username)) {
      return;
    }

    const npc = { ...npcData };
    npc.renderX = npc.x;
    npc.renderY = npc.y;
    // Ensure maxHealth is set for health bar display
    if (!npc.maxHealth) {
      npc.maxHealth = npc.type === 'cell' ? NPC_CELL_HEALTH : NPC_TADPOLE_HEALTH;
    }
    if (npc.type === 'cell') {
      npc.angle = 0;
      npc.wiggleOffset = Math.random() * Math.PI * 2;
    } else {
      initializeTadpole(npc);
    }
    npcs[npc.id] = npc;
  });
  console.log(`Received ${Object.keys(npcs).length} NPCs from server`);
});

socket.on('npcUpdate', (serverNpcs) => {
  // Continuous NPC state updates from server
  Object.values(serverNpcs).forEach(serverNpc => {
    // Always skip the current user's own idle NPCs
    if (serverNpc.isIdlePlayer && currentUser &&
        (serverNpc.name === currentUser.username || serverNpc.ownerName === currentUser.username)) {
      // If it somehow got added, remove it
      if (npcs[serverNpc.id]) {
        delete npcs[serverNpc.id];
      }
      return;
    }

    if (npcs[serverNpc.id]) {
      // Update existing NPC
      const npc = npcs[serverNpc.id];

      // Check if NPC was teleported (large position change) - skip interpolation
      const dx = serverNpc.x - npc.x;
      const dy = serverNpc.y - npc.y;
      const distChange = Math.sqrt(dx * dx + dy * dy);
      const wasTeleported = distChange > 500; // Teleport threshold

      npc.x = serverNpc.x;
      npc.y = serverNpc.y;
      npc.vx = serverNpc.vx;
      npc.vy = serverNpc.vy;
      npc.health = serverNpc.health;
      npc.maxHealth = serverNpc.maxHealth || npc.maxHealth;
      npc.provoked = serverNpc.provoked;
      npc.isTired = serverNpc.isTired;
      npc.chaseEnergy = serverNpc.chaseEnergy;
      npc.isSprinting = serverNpc.isSprinting;
      // Preserve idle player properties from server
      npc.isIdlePlayer = serverNpc.isIdlePlayer || false;
      npc.name = serverNpc.name || npc.name || '';
      npc.color = serverNpc.color || npc.color;
      // Preserve protector/shield properties for idle players
      npc.hasProtector = serverNpc.hasProtector || false;
      npc.bubbleShieldActive = serverNpc.bubbleShieldActive || false;
      // Convert server lunge time to client time - if it's a new attack, use current time
      if (serverNpc.attackLungeTime && serverNpc.attackLungeTime !== npc.lastServerLungeTime) {
        npc.attackLungeTime = Date.now(); // Use client time for animation
        npc.lastServerLungeTime = serverNpc.attackLungeTime;
      }
      npc.attackLungeAngle = serverNpc.attackLungeAngle;

      // If teleported, snap render position immediately (no interpolation)
      if (wasTeleported) {
        npc.renderX = npc.x;
        npc.renderY = npc.y;
      } else if (!npc.renderX) {
        npc.renderX = npc.x;
        npc.renderY = npc.y;
      }
    } else {
      // New NPC - add it (but skip if it's the current user's idle self)
      // This prevents race conditions where old npcUpdate messages re-add deleted idle NPCs
      if (serverNpc.isIdlePlayer && currentUser &&
          (serverNpc.name === currentUser.username || serverNpc.ownerName === currentUser.username)) {
        // Skip - this is the current user's idle NPC that should have been deleted
        return;
      }

      const npc = { ...serverNpc };
      npc.renderX = npc.x;
      npc.renderY = npc.y;
      npc.spawnTime = Date.now(); // For spawn animation
      if (npc.type === 'cell') {
        npc.angle = 0;
        npc.wiggleOffset = Math.random() * Math.PI * 2;
      } else {
        initializeTadpole(npc);
      }
      npcs[npc.id] = npc;
    }
  });

  // Clean up client-side NPCs that no longer exist on the server
  // This fixes "ghost" NPCs that got stuck due to missed death events
  for (let npcId in npcs) {
    if (!serverNpcs[npcId]) {
      console.log(`Removing ghost NPC ${npcId} (no longer on server)`);
      delete npcs[npcId];
      // Clear attack target if we were targeting this NPC
      if (attackTarget && attackTarget.id === npcId) {
        attackTarget = null;
      }
    }
  }
});

socket.on('npcDamaged', (data) => {
  // Show damage text when NPC is hit
  if (npcs[data.npcId]) {
    npcs[data.npcId].health = data.health;
    spawnDamageText(data.x, data.y, data.damage);
  }
});

socket.on('npcDied', (data) => {
  // Create death effect
  deathEffects.push({
    x: data.x,
    y: data.y,
    radius: data.radius,
    startTime: Date.now(),
    duration: 2000
  });

  // Remove the NPC from local state
  delete npcs[data.id];
});

socket.on('idlePlayerDied', (data) => {
  // Create death effect
  deathEffects.push({
    x: data.x,
    y: data.y,
    radius: data.radius,
    startTime: Date.now(),
    duration: 2000
  });

  // Remove from NPCs
  delete npcs[data.id];

  // Check if this was the current user's idle self
  if (currentUser && data.name === currentUser.username) {
    console.log('Your inactive self was killed!');
    // Show death screen with inactive message
    isDead = true;
    myTadpoles = [];
    selectedTadpoles.clear();

    // Clear saved progress so player starts fresh as tadpole
    clearProgressOnDeath();

    // Update death screen message
    const deathTitle = deathScreen.querySelector('h1');
    if (deathTitle) {
      deathTitle.textContent = 'You Died While Inactive';
    }

    // Add subtitle if not already there
    let deathSubtitle = deathScreen.querySelector('.death-subtitle');
    if (!deathSubtitle) {
      deathSubtitle = document.createElement('p');
      deathSubtitle.className = 'death-subtitle';
      deathScreen.insertBefore(deathSubtitle, deathScreen.querySelector('button'));
    }
    deathSubtitle.textContent = 'Someone killed your idle avatar while you were away.';

    deathScreen.classList.remove('hidden');
  }
});

// Handle server notification that user died while inactive (sent via setName handler)
socket.on('diedWhileInactive', () => {
  console.log('Server notified: You died while inactive');
  isDead = true;
  myTadpoles = [];
  selectedTadpoles.clear();

  // Clear saved progress so player starts fresh as tadpole
  clearProgressOnDeath();

  // Update death screen message
  const deathTitle = deathScreen.querySelector('h1');
  if (deathTitle) {
    deathTitle.textContent = 'You Died While Inactive';
  }

  // Add subtitle if not already there
  let deathSubtitle = deathScreen.querySelector('.death-subtitle');
  if (!deathSubtitle) {
    deathSubtitle = document.createElement('p');
    deathSubtitle.className = 'death-subtitle';
    deathScreen.insertBefore(deathSubtitle, deathScreen.querySelector('button'));
  }
  deathSubtitle.textContent = 'Someone killed your idle avatar while you were away.';

  deathScreen.classList.remove('hidden');
});

socket.on('npcRespawned', (npcData) => {
  // NPC respawned at new location
  const npc = npcs[npcData.id];
  if (npc) {
    npc.x = npcData.x;
    npc.y = npcData.y;
    npc.renderX = npcData.x;
    npc.renderY = npcData.y;
    npc.vx = 0;
    npc.vy = 0;
    npc.health = npcData.health;
    npc.provoked = false;
    if (npc.type === 'cell') {
      npc.isTired = false;
      npc.chaseEnergy = npc.maxChaseEnergy || 100;
    }
  }
});

socket.on('npcAttack', (data) => {
  // NPC attacked us - apply damage to our tadpole
  if (myTadpoles.length > 0) {
    // Find the closest tadpole to damage (for multi-tadpole scenarios)
    const npc = npcs[data.npcId];
    if (npc) {
      let closestTad = myTadpoles[0];
      let closestDist = Infinity;
      for (let tad of myTadpoles) {
        const dx = tad.x - npc.x;
        const dy = tad.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestTad = tad;
        }
      }

      // Check if protected by a Protector's bubble shield
      let isProtected = false;
      for (let protector of myTadpoles) {
        if (protector.type === 'cell' && protector.hasProtector && protector.bubbleShieldActive) {
          const shieldRadius = protector.radius * 12;
          const dx = closestTad.x - protector.x;
          const dy = closestTad.y - protector.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < shieldRadius) {
            isProtected = true;
            break;
          }
        }
      }

      if (!isProtected) {
        // Apply damage
        closestTad.health -= data.damage;
        closestTad.lastHit = Date.now();
        closestTad.vx += data.knockbackX;
        closestTad.vy += data.knockbackY;
        spawnDamageText(closestTad.x, closestTad.y, data.damage);
      } else {
        // Shield absorbed the hit - show visual feedback
        spawnDamageText(closestTad.x, closestTad.y, 0, 'Shielded!');
      }
    }
  }
});

// Handle player damage broadcast (server-authoritative)
socket.on('playerDamaged', (data) => {
  // Update player health from server
  if (players[data.playerId]) {
    players[data.playerId].health = data.health;
    players[data.playerId].maxHealth = data.maxHealth;
    spawnDamageText(data.x, data.y, data.damage);
  }
});

// Handle other player dying (from PvP or other causes)
socket.on('otherPlayerDied', (data) => {
  // Check if this is OUR player dying (from server-side PvP death detection)
  if (data.playerId === socket.id) {
    console.log('We died from PvP (server-authoritative)');

    // Create death effect at our location
    deathEffects.push({
      x: data.x,
      y: data.y,
      radius: myTadpoles[0]?.radius || 8,
      startTime: Date.now(),
      duration: 2000
    });

    // Clear all our tadpoles
    myTadpoles = [];
    selectedTadpoles.clear();

    // Show death screen
    isDead = true;
    deathScreen.classList.remove('hidden');

    // Clear saved progress so player starts fresh as tadpole
    clearProgressOnDeath();

    // Notify server (for cleanup)
    socket.emit('playerDied', { x: data.x, y: data.y });
    return;
  }

  const player = players[data.playerId];
  if (player) {
    // Create death effect
    deathEffects.push({
      x: data.x,
      y: data.y,
      radius: player.radius || 8,
      startTime: Date.now(),
      duration: 2000
    });

    // Remove from players list so they disappear
    delete players[data.playerId];
    console.log(`Player ${data.playerId} died`);
  }
});

// Handle player-vs-player attacks
socket.on('playerAttacked', (data) => {
  // Another player attacked us - apply damage to our tadpole
  if (myTadpoles.length > 0) {
    // Find the closest tadpole to the attacker
    const attacker = players[data.attackerId];
    let closestTad = myTadpoles[0];

    if (attacker) {
      let closestDist = Infinity;
      for (let tad of myTadpoles) {
        const dx = tad.x - attacker.x;
        const dy = tad.y - attacker.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestTad = tad;
        }
      }
    }

    // Check if protected by a Protector's bubble shield
    let isProtected = false;
    for (let protector of myTadpoles) {
      if (protector.type === 'cell' && protector.hasProtector && protector.bubbleShieldActive) {
        const shieldRadius = protector.radius * 12;
        const dx = closestTad.x - protector.x;
        const dy = closestTad.y - protector.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < shieldRadius) {
          isProtected = true;
          break;
        }
      }
    }

    if (!isProtected) {
      // Apply damage
      closestTad.health -= data.damage;
      closestTad.lastHit = Date.now();
      closestTad.vx += data.knockbackX || 0;
      closestTad.vy += data.knockbackY || 0;
      spawnDamageText(closestTad.x, closestTad.y, data.damage);
    } else {
      // Shield absorbed the hit
      spawnDamageText(closestTad.x, closestTad.y, 0, 'Shielded!');
    }
  }
});

socket.on('worldReset', (data) => {
  // Clear all other players (keep myTadpoles - our controlled creatures)
  players = {};
  // Clear all NPCs and set to new ones
  npcs = {};
  if (data.npcs) {
    Object.values(data.npcs).forEach(npcData => {
      const npc = { ...npcData };
      npc.renderX = npc.x;
      npc.renderY = npc.y;
      if (npc.type === 'cell') {
        npc.angle = 0;
        npc.wiggleOffset = Math.random() * Math.PI * 2;
        // Cell fatigue system
        npc.chaseEnergy = 100;
        npc.maxChaseEnergy = 100;
        npc.isTired = false;
        npc.tiredStartTime = 0;
      } else {
        initializeTadpole(npc);
      }
      npcs[npc.id] = npc;
    });
  }
  // Reset food
  food = data.food || {};
  // Reset fog of war - only keep current position explored
  exploredRegions.clear();
  // Keep myTadpoles intact - player's creatures are preserved
  console.log('World reset complete - NPCs and food regenerated, your creatures preserved');
});

// NPCs are now initialized by the server - no local initialization needed

// Initialize ambient particles around a center point
function initializeParticles(centerX = 0, centerY = 0) {
  particles.length = 0; // Clear existing
  const particleCount = 500; // Number of particles
  const particleRange = 2500; // Spawn range around center

  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * particleRange;
    particles.push({
      x: centerX + Math.cos(angle) * dist,
      y: centerY + Math.sin(angle) * dist,
      radius: 0.5 + Math.random() * 1.5, // 0.5-2 pixels (much smaller than food)
      brightness: 0.3 + Math.random() * 0.7, // Varying shades of white (0.3-1.0)
      driftSpeed: 0.02 + Math.random() * 0.03, // Slow drift speed
      driftAngle: Math.random() * Math.PI * 2, // Random drift direction
      phase: Math.random() * Math.PI * 2 // For floating motion
    });
  }
}
initializeParticles(); // Initial spawn around origin, will be recycled when player spawns

// Get player display name (username if logged in, or PlayerXXX)
function getPlayerName() {
  if (currentUser) {
    return currentUser.username;
  }
  // Use stored name or the name from first tadpole
  if (myTadpoles.length > 0 && myTadpoles[0].name) {
    return myTadpoles[0].name;
  }
  return 'Player' + Math.floor(Math.random() * 1000);
}

// Display a chat message on screen
function displayChatMessage(name, message) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message';
  msgDiv.innerHTML = `<span class="chat-name">${escapeHtml(name)}:</span>${escapeHtml(message)}`;
  chatDisplay.appendChild(msgDiv);

  // Remove message after animation completes (5 seconds)
  setTimeout(() => {
    if (msgDiv.parentNode) {
      msgDiv.remove();
    }
  }, 5000);

  // Limit visible messages to 5
  while (chatDisplay.children.length > 5) {
    chatDisplay.removeChild(chatDisplay.firstChild);
  }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Chat input with cheat commands (console-style, execute on Enter)
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const input = chatInput.value.trim();
    if (!input) return;

    // Check for cheat commands
    if (input.startsWith('/food ')) {
      const amount = parseInt(input.substring(6));
      if (!isNaN(amount)) {
        // Add food to all tadpoles
        myTadpoles.forEach(tad => {
          tad.food = (tad.food || 0) + amount;
        });
        chatInput.value = '';
        console.log(`Food adjusted by ${amount} for all creatures`);
        updateStatsDisplay();
      }
      return;
    }

    if (input.startsWith('/health ')) {
      const amount = parseInt(input.substring(8));
      if (!isNaN(amount)) {
        playerHealth = Math.max(0, amount);
        // Apply to all player's tadpoles
        myTadpoles.forEach(tad => {
          tad.health = playerHealth;
        });
        updateStatsDisplay();
        chatInput.value = '';
        console.log(`Health set to ${playerHealth}`);
      }
      return;
    }

    if (input.startsWith('/strength ')) {
      const amount = parseInt(input.substring(10));
      if (!isNaN(amount)) {
        playerStrength = Math.max(0, amount);
        updateStatsDisplay();
        chatInput.value = '';
        console.log(`Strength set to ${playerStrength}`);
      }
      return;
    }

    if (input === '/split') {
      if (myTadpoles.length > 0) {
        const selectedId = selectedTadpoles.size > 0 ? Array.from(selectedTadpoles)[0] : myTadpoles[0].id;
        const selectedTad = myTadpoles.find(t => t.id === selectedId);
        if (selectedTad) {
          // Create new tadpole
          const newTad = {
            id: `${myId}_${Date.now()}`,
            x: selectedTad.x + 30,
            y: selectedTad.y + 30,
            vx: 0,
            vy: 0,
            renderX: selectedTad.x + 30,
            renderY: selectedTad.y + 30,
            color: '#FFFFFF',
            radius: TADPOLE_RADIUS,
            food: 0,
            name: selectedTad.name,
            health: MAX_HEALTH,
            lastHit: 0,
            lastAttack: 0,
            type: 'tadpole',
            supportMode: false,
            supportLeader: null
          };
          initializeTadpole(newTad);
          myTadpoles.push(newTad);

          chatInput.value = '';
          console.log('New tadpole spawned via /split cheat');
        }
      }
      return;
    }

    if (input === '/op') {
      invincibilityMode = !invincibilityMode;
      chatInput.value = '';
      console.log(`Invincibility mode ${invincibilityMode ? 'enabled' : 'disabled'}`);
      return;
    }

    if (input === '/reset') {
      socket.emit('resetWorld');
      chatInput.value = '';
      console.log('World reset requested');
      return;
    }

    if (input === '/tutorial' || input === '/tutorial off') {
      tutorialState.completed = true;
      localStorage.setItem('tutorialCompleted', 'true');
      hideTutorialTooltip();
      chatInput.value = '';
      console.log('Tutorial disabled');
      return;
    }

    if (input === '/tutorial on' || input === '/tutorial reset') {
      tutorialState.completed = false;
      tutorialState.currentStep = 0;
      tutorialState.hasCollectedFood = false;
      tutorialState.hasUpgraded = false;
      tutorialState.movementDistance = 0;
      tutorialState.startPos = myTadpoles.length > 0 ? { x: myTadpoles[0].x, y: myTadpoles[0].y } : null;
      localStorage.setItem('tutorialCompleted', 'false');
      chatInput.value = '';
      console.log('Tutorial reset');
      checkTutorialTriggers();
      return;
    }

    if (input === '/mitosis') {
      if (myTadpoles.length > 0) {
        const selectedId = selectedTadpoles.size > 0 ? Array.from(selectedTadpoles)[0] : myTadpoles[0].id;
        const selectedTad = myTadpoles.find(t => t.id === selectedId);
        if (selectedTad && selectedTad.type === 'tadpole' && !selectedTad.isTransforming) {
          // Start transformation without cost
          selectedTad.isTransforming = true;
          selectedTad.transformationStartTime = Date.now();
          selectedTad.baseRadius = selectedTad.radius;
          chatInput.value = '';
          console.log('Mitosis cheat: transformation started without cost');
        }
      }
      return;
    }

    if (input.startsWith('/tp ')) {
      const coords = input.substring(4).split('/');
      if (coords.length === 2) {
        const x = parseFloat(coords[0]);
        const y = parseFloat(coords[1]);
        if (!isNaN(x) && !isNaN(y)) {
          // Teleport all player's creatures to the coordinates
          myTadpoles.forEach(tad => {
            tad.x = x;
            tad.y = y;
            tad.renderX = x;
            tad.renderY = y;
            tad.vx = 0;
            tad.vy = 0;
          });
          // Clear movement target so creatures stay still
          moveTarget = null;
          chatInput.value = '';
          console.log(`Teleported to ${x}, ${y}`);
        }
      }
      return;
    }

    // Test mode cheat: infinite food + NPC cells ignore you
    if (input === '/testmode' || input === '/god') {
      testMode = !testMode;
      socket.emit('testMode', { enabled: testMode });
      chatInput.value = '';
      console.log(`Test mode ${testMode ? 'ENABLED' : 'DISABLED'}: infinite food, NPCs ignore you`);
      // Visual feedback
      spawnDamageText(myTadpoles[0]?.x || 0, myTadpoles[0]?.y || 0, 0, testMode ? 'TEST MODE ON' : 'TEST MODE OFF');
      return;
    }

    // Send chat message (not a cheat command)
    const playerName = getPlayerName();
    socket.emit('chat', { name: playerName, message: input });
    // Display own message immediately
    displayChatMessage(playerName, input);
    chatInput.value = '';
  }
});

// Listen for chat messages from other players
socket.on('chat', (data) => {
  displayChatMessage(data.name, data.message);
});

// Tadpole helper functions
function initializeTadpole(entity) {
  entity.tail = [];
  entity.trail = [];
  // Only reset angle if not already set (preserve synced angle for other players)
  if (entity.angle === undefined) {
    entity.angle = 0;
  }
  entity.wiggleOffset = entity.wiggleOffset || Math.random() * Math.PI * 2;

  // Initialize tail segments properly spaced out behind the entity
  const segmentLength = TAIL_LENGTH / TAIL_SEGMENTS;
  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    entity.tail.push({
      x: entity.x - (i + 1) * segmentLength,
      y: entity.y
    });
  }
}

// Cell tail constants - smaller/shorter than tadpole tails
const CELL_TAIL_SEGMENTS = 6;
const CELL_TAIL_LENGTH = 25;

function initializeCellTail(entity) {
  entity.cellTail = [];

  // Tail is always at the back of the body (fixed corner)
  const tailAngle = (entity.angle || 0) + Math.PI; // Point opposite to facing direction
  const segmentLength = CELL_TAIL_LENGTH / CELL_TAIL_SEGMENTS;

  // Start position - at the back edge of the cell
  const startX = entity.x + Math.cos(tailAngle) * entity.radius;
  const startY = entity.y + Math.sin(tailAngle) * entity.radius;

  for (let i = 0; i < CELL_TAIL_SEGMENTS; i++) {
    entity.cellTail.push({
      x: startX + Math.cos(tailAngle) * (i + 1) * segmentLength,
      y: startY + Math.sin(tailAngle) * (i + 1) * segmentLength
    });
  }
}

function updateCellTail(entity, time, isRemote = false) {
  if (!entity.hasCellTail) return;
  if (!entity.cellTail || entity.cellTail.length === 0) {
    initializeCellTail(entity);
  }

  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;
  const vx = entity.vx || 0;
  const vy = entity.vy || 0;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // Only update angle for local entities - remote entities use synced angle
  if (!isRemote) {
    // Update cell's body angle based on movement direction (whole body rotates)
    if (speed > 0.1) {
      const targetAngle = Math.atan2(vy, vx);
      // Smooth rotation towards movement direction
      let angleDiff = targetAngle - entity.angle;
      // Normalize to -PI to PI
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      entity.angle += angleDiff * 0.06; // Slower, more gradual turn rate
      // Normalize angle to prevent large value drift
      while (entity.angle > Math.PI) entity.angle -= Math.PI * 2;
      while (entity.angle < -Math.PI) entity.angle += Math.PI * 2;
    }
  }

  // Kick-off detection for natural thrust motion
  const prevSpeed = entity.cellTailPrevSpeed || 0;
  entity.cellTailPrevSpeed = speed;

  // Initialize kick properties if not set
  if (entity.cellTailKickIntensity === undefined) entity.cellTailKickIntensity = 0;
  if (entity.cellTailKickPhase === undefined) entity.cellTailKickPhase = 0;

  // Detect movement START - trigger strong sprint at beginning
  // Protectors don't sprint - they move at constant slow speed
  const wasStationary = prevSpeed < 0.3;
  const isMoving = speed > 0.5;
  const startedMoving = wasStationary && isMoving;

  // Strong kick at movement START (sprint propulsion) - not for Protectors
  if (startedMoving && !entity.hasProtector) {
    entity.cellTailKickIntensity = 2.5; // Strong initial thrust
    entity.cellTailKickPhase = time * 18;
  }

  // Decay kick intensity quickly - sprint is only at the start
  entity.cellTailKickIntensity *= 0.85;

  // Tail is at a FIXED corner of the cell body (opposite to front)
  const tailAngle = entity.angle + Math.PI;
  const baseX = x + Math.cos(tailAngle) * entity.radius * 0.8;
  const baseY = y + Math.sin(tailAngle) * entity.radius * 0.8;

  const segmentLength = CELL_TAIL_LENGTH / CELL_TAIL_SEGMENTS;

  // Natural swimming wiggle parameters
  const baseWiggle = 0.35;
  const speedWiggle = Math.min(speed * 1.8, 1.5);
  const wiggleIntensity = baseWiggle + speedWiggle;
  const baseWiggleSpeed = 5;
  const wiggleSpeed = Math.min(baseWiggleSpeed + (speed * 7), 12);

  for (let i = 0; i < CELL_TAIL_SEGMENTS; i++) {
    const segment = entity.cellTail[i];
    const targetX = i === 0 ? baseX : entity.cellTail[i - 1].x;
    const targetY = i === 0 ? baseY : entity.cellTail[i - 1].y;

    // Smooth flowing wave motion - increases toward tail tip
    const wavePhase = time * wiggleSpeed + i * 0.55 + (entity.wiggleOffset || 0);
    const segmentWiggle = Math.sin(wavePhase) * wiggleIntensity * (i / CELL_TAIL_SEGMENTS) * 6;

    // Kick-off thrust - propagates down the tail with delay
    const kickDelay = i * 0.12;
    const kickWave = Math.sin(entity.cellTailKickPhase - kickDelay * 8) *
                     entity.cellTailKickIntensity * (i / CELL_TAIL_SEGMENTS) * 8;

    // Combined natural motion
    const totalWiggle = segmentWiggle + kickWave;

    const wiggleAngle = tailAngle + Math.PI / 2;
    const wiggleX = Math.cos(wiggleAngle) * totalWiggle;
    const wiggleY = Math.sin(wiggleAngle) * totalWiggle;

    // Calculate segment position with drag effect
    const dx = segment.x - targetX;
    const dy = segment.y - targetY;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    let angle;
    if (currentDist > 0.5) {
      angle = Math.atan2(dy, dx);
    } else {
      angle = tailAngle;
    }

    const newX = targetX + Math.cos(angle) * segmentLength + wiggleX;
    const newY = targetY + Math.sin(angle) * segmentLength + wiggleY;

    // Smoother interpolation for fluid motion
    const lerpFactor = 0.35 + (i / CELL_TAIL_SEGMENTS) * 0.1; // Tip follows more loosely
    segment.x += (newX - segment.x) * lerpFactor;
    segment.y += (newY - segment.y) * lerpFactor;
  }
}

function updateTail(entity, time, isRemote = false) {
  if (!entity.tail) initializeTadpole(entity);

  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;
  const vx = entity.vx || 0;
  const vy = entity.vy || 0;

  const speed = Math.sqrt(vx * vx + vy * vy);
  // Only update angle for local entities - remote entities use synced angle
  if (!isRemote) {
    // Always update angle when moving, but preserve it when idle
    if (speed > 0.1) {
      entity.angle = Math.atan2(vy, vx);
    } else if (entity.angle === undefined) {
      // Initialize angle if not set (pointing left by default)
      entity.angle = Math.PI;
    }
  }

  // Kick-off detection - track acceleration
  const prevSpeed = entity.prevSpeed || 0;
  const acceleration = speed - prevSpeed;
  entity.prevSpeed = speed;

  // Initialize kick intensity if not set
  if (entity.kickIntensity === undefined) entity.kickIntensity = 0;
  if (entity.kickPhase === undefined) entity.kickPhase = 0;

  // Trigger kick-off when accelerating
  if (acceleration > 0.02) {
    // Strong acceleration detected - trigger a kick
    entity.kickIntensity = Math.min(entity.kickIntensity + acceleration * 15, 3.0);
    entity.kickPhase = time * 20; // Capture phase for asymmetric motion
  }

  // Decay kick intensity over time
  entity.kickIntensity *= 0.92;

  entity.trail.unshift({ x, y, alpha: 1 });
  if (entity.trail.length > TRAIL_LENGTH) {
    entity.trail.pop();
  }

  entity.trail.forEach((point, i) => {
    point.alpha = 1 - (i / TRAIL_LENGTH);
  });

  const segmentLength = TAIL_LENGTH / TAIL_SEGMENTS;
  const baseWiggle = 0.4;
  const speedWiggle = Math.min(speed * 2, 2.0); // Gentler wiggle increase
  const wiggleIntensity = baseWiggle + speedWiggle;
  const baseWiggleSpeed = 6; // Faster base animation
  const maxWiggleSpeed = 14; // Faster max oscillation
  const wiggleSpeed = baseWiggleSpeed + (speed * 8); // More responsive to speed
  const clampedWiggleSpeed = Math.min(wiggleSpeed, maxWiggleSpeed);

  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const segment = entity.tail[i];
    const targetX = i === 0 ? x : entity.tail[i - 1].x;
    const targetY = i === 0 ? y : entity.tail[i - 1].y;

    // Regular swimming motion - smooth flowing wave
    const segmentWiggle = Math.sin(time * clampedWiggleSpeed + i * 0.5 + entity.wiggleOffset) *
                          wiggleIntensity * (i / TAIL_SEGMENTS) * 8;

    // Kick-off motion - strong asymmetric thrust that propagates down the tail
    const kickDelay = i * 0.15; // Wave propagates down the tail
    const kickWave = Math.sin(entity.kickPhase - kickDelay * 10) *
                     entity.kickIntensity * (i / TAIL_SEGMENTS) * 12;

    // Combined wiggle with kick
    const totalWiggle = segmentWiggle + kickWave;

    const wiggleAngle = entity.angle + Math.PI / 2;
    const wiggleX = Math.cos(wiggleAngle) * totalWiggle;
    const wiggleY = Math.sin(wiggleAngle) * totalWiggle;

    // Calculate the angle from target to segment
    const dx = segment.x - targetX;
    const dy = segment.y - targetY;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    // Maintain exact segment length - always point away from previous segment
    let angle;
    if (currentDist > 1) {
      // Use existing segment direction
      angle = Math.atan2(dy, dx);
    } else {
      // Segment is collapsing - force it to point behind the entity
      angle = entity.angle + Math.PI;
    }

    const offsetX = targetX + Math.cos(angle) * segmentLength + wiggleX;
    const offsetY = targetY + Math.sin(angle) * segmentLength + wiggleY;

    // Smooth tail following - slower interpolation for graceful movement
    const interpFactor = speed > 0.1 ? 0.12 : 0.2; // Slower, smoother tail
    segment.x += (offsetX - segment.x) * interpFactor;
    segment.y += (offsetY - segment.y) * interpFactor;

    // Clamp segment distance to prevent stretching - tail must stay attached
    const finalDx = segment.x - targetX;
    const finalDy = segment.y - targetY;
    const finalDist = Math.sqrt(finalDx * finalDx + finalDy * finalDy);
    const maxDist = segmentLength * 1.2; // Allow only 20% stretch
    if (finalDist > maxDist) {
      const clampAngle = Math.atan2(finalDy, finalDx);
      segment.x = targetX + Math.cos(clampAngle) * maxDist;
      segment.y = targetY + Math.sin(clampAngle) * maxDist;
    }
  }
}

// Input handling
canvas.addEventListener('click', (e) => {
  if (isDead || myTadpoles.length === 0) return;
  if (isSecondaryWindow) return; // Secondary windows are view-only

  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  // Convert to world coordinates
  const worldX = clickX - canvas.width / 2 + camera.x;
  const worldY = clickY - canvas.height / 2 + camera.y;

  // Check if clicking on a tadpole (for selection or attack)
  let clickedEntity = null;

  // Check NPCs (bigger hit zone for easier attacking)
  for (let npc of Object.values(npcs)) {
    const dx = worldX - npc.x;
    const dy = worldY - npc.y;
    if (Math.sqrt(dx * dx + dy * dy) < npc.radius + 20) {
      clickedEntity = npc;
      break;
    }
  }

  // Check other players (bigger hit zone for easier attacking)
  if (!clickedEntity) {
    for (let player of Object.values(players)) {
      const dx = worldX - player.x;
      const dy = worldY - player.y;
      if (Math.sqrt(dx * dx + dy * dy) < player.radius + 20) {
        clickedEntity = player;
        break;
      }
    }
  }

  // Check own tadpoles
  if (!clickedEntity) {
    for (let tad of myTadpoles) {
      const dx = worldX - tad.x;
      const dy = worldY - tad.y;
      if (Math.sqrt(dx * dx + dy * dy) < tad.radius + 10) {
        clickedEntity = tad;
        break;
      }
    }
  }

  // If waiting to select a support target
  if (waitingForSupportTarget && clickedEntity && myTadpoles.includes(clickedEntity)) {
    const sourceCreature = myTadpoles.find(t => t.id === supportSourceId);
    if (sourceCreature && clickedEntity.id !== supportSourceId) {
      // Set up support relationship
      sourceCreature.supportMode = true;
      sourceCreature.supportLeader = clickedEntity.id;

      waitingForSupportTarget = false;
      supportSourceId = null;

      // Select the supporting creature to show the relationship
      selectedTadpoles.clear();
      selectedTadpoles.add(sourceCreature.id);
      updateSelectionCount();

      console.log(`Creature ${sourceCreature.id} is now supporting ${clickedEntity.id}`);
    }
    return;
  }

  // If waiting to select a food transfer target
  if (waitingForFoodTarget && clickedEntity && myTadpoles.includes(clickedEntity)) {
    const sourceCreature = myTadpoles.find(t => t.id === foodSourceId);
    if (sourceCreature && clickedEntity.id !== foodSourceId && sourceCreature.food > 0) {
      // Calculate how much food can be transferred
      const targetCapacity = clickedEntity.type === 'cell' ? CELL_FOOD_CAPACITY : getFoodCapacity(clickedEntity);
      const availableSpace = targetCapacity - (clickedEntity.food || 0);
      const transferAmount = Math.min(sourceCreature.food, availableSpace);

      if (transferAmount > 0) {
        // Transfer the food
        sourceCreature.food -= transferAmount;
        clickedEntity.food = (clickedEntity.food || 0) + transferAmount;

        console.log(`Transferred ${transferAmount} food from ${sourceCreature.name} to ${clickedEntity.name}`);
      }

      waitingForFoodTarget = false;
      foodSourceId = null;

      // Select the receiving creature
      selectedTadpoles.clear();
      selectedTadpoles.add(clickedEntity.id);
      updateSelectionCount();
    }
    return;
  }

  // Check if clicking food (bigger hit zone for easier selection)
  let clickedFood = null;
  for (let foodItem of Object.values(food)) {
    const dx = worldX - foodItem.x;
    const dy = worldY - foodItem.y;
    if (Math.sqrt(dx * dx + dy * dy) < foodItem.radius + 15) {
      clickedFood = foodItem;
      break;
    }
  }

  if (clickedFood) {
    // Move to food to eat it - check if any creature can move
    const selectedCreatures = myTadpoles.filter(t => selectedTadpoles.has(t.id));
    const creaturesCanMove = selectedCreatures.filter(t => {
      if (t.supportMode) return false;
      if (t.type === 'cell' && t.hasProtector && t.bubbleShieldActive) return false;
      return true;
    });

    if (creaturesCanMove.length > 0) {
      // Set per-creature targets for selected creatures that can move
      creaturesCanMove.forEach(t => {
        t.moveTarget = { x: clickedFood.x, y: clickedFood.y, isFoodTarget: true, foodId: clickedFood.id };
        t.attackTarget = null;
        t.collectFoodAt = null; // Clear auto-collect
      });
      // Keep global for backwards compatibility (formations, etc)
      moveTarget = { x: clickedFood.x, y: clickedFood.y, isFoodTarget: true, foodId: clickedFood.id };
      attackTarget = null;
    } else {
      // Flash buttons to indicate can't move
      const hasSupporting = selectedCreatures.some(t => t.supportMode);
      const hasShielded = selectedCreatures.some(t => t.type === 'cell' && t.hasProtector && t.bubbleShieldActive);
      if (hasSupporting) flashButton(supportBtn);
      if (hasShielded) flashButton(shieldBtn);
    }
  } else if (clickedEntity && myTadpoles.includes(clickedEntity)) {
    // Selecting own tadpole
    if (e.shiftKey) {
      if (selectedTadpoles.has(clickedEntity.id)) {
        selectedTadpoles.delete(clickedEntity.id);
      } else {
        selectedTadpoles.add(clickedEntity.id);
      }
      // Keep existing commands when adding to selection
    } else {
      selectedTadpoles.clear();
      selectedTadpoles.add(clickedEntity.id);
      // Don't clear creature's existing command when selecting it
      // Hide hibernation menu when selecting a different creature
      hideHibernationMenu();
    }
    // Update globals to match newly selected creature's targets
    const newlySelected = myTadpoles.find(t => t.id === clickedEntity.id);
    if (newlySelected) {
      moveTarget = newlySelected.moveTarget || null;
      attackTarget = newlySelected.attackTarget || null;
    }
    updateSelectionCount();
  } else if (clickedEntity) {
    // Attack target - set per-creature
    const selectedCreatures = myTadpoles.filter(t => selectedTadpoles.has(t.id));
    selectedCreatures.forEach(t => {
      if (!t.supportMode) { // Only non-support creatures can attack independently
        t.attackTarget = clickedEntity;
        t.moveTarget = null;
        t.collectFoodAt = null;
      }
    });
    attackTarget = clickedEntity;
    moveTarget = null;
  } else {
    // Move to location - check if any selected creature can actually move
    const selectedCreatures = myTadpoles.filter(t => selectedTadpoles.has(t.id));

    // Check if any creature can move (not supporting and not shielded)
    const creaturesCanMove = selectedCreatures.filter(t => {
      // Supporting creatures can't move independently
      if (t.supportMode) return false;
      // Protector cells with active shield can't move
      if (t.type === 'cell' && t.hasProtector && t.bubbleShieldActive) return false;
      return true;
    });

    if (creaturesCanMove.length > 0) {
      // Set per-creature targets for selected creatures that can move
      creaturesCanMove.forEach(t => {
        t.moveTarget = { x: worldX, y: worldY };
        t.attackTarget = null;
        t.collectFoodAt = null; // Clear auto-collect
      });
      // Keep global for backwards compatibility
      moveTarget = { x: worldX, y: worldY };
      attackTarget = null;
    } else {
      // No creature can move - flash the appropriate button
      const hasSupporting = selectedCreatures.some(t => t.supportMode);
      const hasShielded = selectedCreatures.some(t => t.type === 'cell' && t.hasProtector && t.bubbleShieldActive);

      if (hasSupporting) {
        flashButton(supportBtn);
      }
      if (hasShielded) {
        flashButton(shieldBtn);
      }
    }
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (isDead || myTadpoles.length === 0) return;

  const rect = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;

  const worldX = clickX - canvas.width / 2 + camera.x;
  const worldY = clickY - canvas.height / 2 + camera.y;

  // Check if right-clicking on own tadpole
  for (let tad of myTadpoles) {
    const dx = worldX - tad.x;
    const dy = worldY - tad.y;
    if (Math.sqrt(dx * dx + dy * dy) < tad.radius + 10) {
      // Toggle selection - add if not selected, remove if already selected
      const wasSelected = selectedTadpoles.has(tad.id);
      if (wasSelected) {
        selectedTadpoles.delete(tad.id);
        // Creature was deselected - let it continue its per-creature commands
      } else {
        selectedTadpoles.add(tad.id);
        // Creature was added to selection - clear its per-creature targets
        tad.moveTarget = null;
        tad.attackTarget = null;
        tad.collectFoodAt = null;
      }
      updateSelectionCount();

      // Clear global targets when selecting/deselecting to prevent velocity burst
      moveTarget = null;
      attackTarget = null;
      // Hide hibernation menu when changing selection
      hideHibernationMenu();

      // Show menu if any are selected
      if (selectedTadpoles.size > 0) {
        selectionMenu.classList.remove('hidden');
      } else {
        selectionMenu.classList.add('hidden');
      }
      return;
    }
  }

  // Right-clicked somewhere else - deselect all and cancel selection modes
  selectedTadpoles.clear();
  waitingForSupportTarget = false;
  supportSourceId = null;
  waitingForFoodTarget = false;
  foodSourceId = null;
  updateSelectionCount();
  selectionMenu.classList.add('hidden');
  moveTarget = null;
  attackTarget = null;
  // Hide hibernation menu when deselecting
  hideHibernationMenu();
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }

  // Escape cancels support selection mode
  if (e.key === 'Escape' && waitingForSupportTarget) {
    waitingForSupportTarget = false;
    supportSourceId = null;
    updateSelectionCount();
    console.log('Support selection cancelled with Escape');
  }

  // Escape cancels food transfer mode
  if (e.key === 'Escape' && waitingForFoodTarget) {
    waitingForFoodTarget = false;
    foodSourceId = null;
    updateSelectionCount();
    console.log('Food transfer cancelled with Escape');
  }

  // 'B' toggles bubble shield for Protector cells
  if (e.key.toLowerCase() === 'b') {
    myTadpoles.forEach(tad => {
      if (tad.type === 'cell' && tad.hasProtector && selectedTadpoles.has(tad.id) && !tad.isHibernating) {
        tad.bubbleShieldActive = !tad.bubbleShieldActive;
        // Notify server of shield state for protection from NPCs
        socket.emit('bubbleShield', { oderId: tad.id, active: tad.bubbleShieldActive });
      }
    });
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Force save progress immediately (bypass rate limit)
async function forceSaveProgress() {
  if (!currentUser || myTadpoles.length === 0) return;

  try {
    const creatures = myTadpoles.map(tad => ({
      type: tad.type,
      name: tad.name,
      x: tad.x,
      y: tad.y,
      angle: tad.angle || 0,
      health: tad.health,
      food: tad.food,
      nucleotides: tad.nucleotides || 0,
      healthLevel: tad.healthLevel || 0,
      strengthLevel: tad.strengthLevel || 0,
      capacityLevel: tad.capacityLevel || 0,
      cellHealthLevel: tad.cellHealthLevel || 0,
      cellStrengthLevel: tad.cellStrengthLevel || 0,
      cellCapacityLevel: tad.cellCapacityLevel || 0,
      cellSpeedLevel: tad.cellSpeedLevel || 0,
      hasCellTail: tad.hasCellTail || false,
      hasProtector: tad.hasProtector || false,
      hasSword: tad.hasSword || false,
      canHibernate: tad.canHibernate || false,
      bubbleShieldActive: tad.bubbleShieldActive || false
    }));

    let highestEvolution = 'tadpole';
    for (const c of creatures) {
      if (c.type === 'cell') {
        highestEvolution = 'cell';
        break;
      }
    }

    await fetch('/api/auth/save-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatures,
        stats: { highestEvolution }
      })
    });
  } catch (error) {
    console.error('Force save error:', error);
  }
}

// Detect when player tab becomes inactive
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab is hidden - save progress immediately before going inactive
    forceSaveProgress();
    // Send all creatures to server for idle NPC conversion (include all upgrade data)
    const creatures = myTadpoles.map(tad => ({
      id: tad.id,
      type: tad.type,
      name: tad.name,
      x: tad.x,
      y: tad.y,
      angle: tad.angle || 0,
      health: tad.health,
      maxHealth: tad.maxHealth || (tad.type === 'cell' ? CELL_MAX_HEALTH : MAX_HEALTH),
      food: tad.food,
      nucleotides: tad.nucleotides || 0,
      radius: tad.radius,
      // Tadpole upgrades
      healthLevel: tad.healthLevel || 0,
      strengthLevel: tad.strengthLevel || 0,
      capacityLevel: tad.capacityLevel || 0,
      maxHealthBonus: tad.maxHealthBonus || 0,
      strengthBonus: tad.strengthBonus || 0,
      // Cell upgrades
      cellHealthLevel: tad.cellHealthLevel || 0,
      cellStrengthLevel: tad.cellStrengthLevel || 0,
      cellCapacityLevel: tad.cellCapacityLevel || 0,
      cellSpeedLevel: tad.cellSpeedLevel || 0,
      cellSpeedBonus: tad.cellSpeedBonus || 0,
      cellStrengthBonus: tad.cellStrengthBonus || 0,
      hasProtector: tad.hasProtector || false,
      bubbleShieldActive: tad.bubbleShieldActive || false,
      hasSword: tad.hasSword || false,
      hasCellTail: tad.hasCellTail || false,
      canHibernate: tad.canHibernate || false
    }));
    socket.emit('playerInactive', { creatures });
  } else {
    // Tab is visible again - notify server
    socket.emit('playerActive');
  }
});

// Send creatures to server via WebSocket immediately before page closes
window.addEventListener('beforeunload', () => {
  if (myTadpoles.length > 0 && socket && socket.connected) {
    const creatures = myTadpoles.map(tad => ({
      id: tad.id,
      type: tad.type,
      name: tad.name,
      x: tad.x,
      y: tad.y,
      angle: tad.angle || 0,
      health: tad.health,
      maxHealth: tad.maxHealth || (tad.type === 'cell' ? CELL_MAX_HEALTH : MAX_HEALTH),
      food: tad.food,
      nucleotides: tad.nucleotides || 0,
      radius: tad.radius,
      healthLevel: tad.healthLevel || 0,
      strengthLevel: tad.strengthLevel || 0,
      capacityLevel: tad.capacityLevel || 0,
      maxHealthBonus: tad.maxHealthBonus || 0,
      strengthBonus: tad.strengthBonus || 0,
      cellHealthLevel: tad.cellHealthLevel || 0,
      cellStrengthLevel: tad.cellStrengthLevel || 0,
      cellCapacityLevel: tad.cellCapacityLevel || 0,
      cellSpeedLevel: tad.cellSpeedLevel || 0,
      cellSpeedBonus: tad.cellSpeedBonus || 0,
      cellStrengthBonus: tad.cellStrengthBonus || 0,
      cellMaxHealthBonus: tad.cellMaxHealthBonus || 0,
      hasProtector: tad.hasProtector || false,
      bubbleShieldActive: tad.bubbleShieldActive || false,
      hasSword: tad.hasSword || false,
      hasCellTail: tad.hasCellTail || false,
      canHibernate: tad.canHibernate || false,
      isFarming: tad.isFarming || false
    }));
    // Try to send via WebSocket (may not complete before page unloads)
    socket.emit('syncCreatures', { creatures });
  }
});

// Also save progress via HTTP beacon for database persistence
window.addEventListener('beforeunload', () => {
  if (!currentUser || myTadpoles.length === 0) return;

  const creatures = myTadpoles.map(tad => ({
    type: tad.type,
    name: tad.name,
    x: tad.x,
    y: tad.y,
    angle: tad.angle || 0,
    health: tad.health,
    food: tad.food,
    nucleotides: tad.nucleotides || 0,
    healthLevel: tad.healthLevel || 0,
    strengthLevel: tad.strengthLevel || 0,
    capacityLevel: tad.capacityLevel || 0,
    cellHealthLevel: tad.cellHealthLevel || 0,
    cellStrengthLevel: tad.cellStrengthLevel || 0,
    cellCapacityLevel: tad.cellCapacityLevel || 0,
    cellSpeedLevel: tad.cellSpeedLevel || 0,
    hasCellTail: tad.hasCellTail || false,
    hasProtector: tad.hasProtector || false,
    hasSword: tad.hasSword || false,
    canHibernate: tad.canHibernate || false,
    bubbleShieldActive: tad.bubbleShieldActive || false
  }));

  let highestEvolution = 'tadpole';
  for (const c of creatures) {
    if (c.type === 'cell') {
      highestEvolution = 'cell';
      break;
    }
  }

  // sendBeacon is more reliable for unload events - use Blob for proper Content-Type
  const blob = new Blob([JSON.stringify({ creatures, stats: { highestEvolution } })], { type: 'application/json' });
  navigator.sendBeacon('/api/auth/save-progress', blob);
});

// Menu handlers
upgradeBtn.addEventListener('click', () => {
  // Open the upgrade menu
  upgradeMenu.classList.remove('hidden');
  updateUpgradeMenu();
});

supportBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0 && myTadpoles.length > 1) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad) {
      if (selectedTad.supportMode) {
        // Unlink - stop supporting
        selectedTad.supportMode = false;
        selectedTad.supportLeader = null;
        waitingForSupportTarget = false;
        supportSourceId = null;
      } else {
        // Enter selection mode - waiting for player to click a creature to support
        waitingForSupportTarget = true;
        supportSourceId = selectedTad.id;
        console.log('Click another creature to support...');
      }
      updateSelectionCount();
    }
  }
});

giveFoodBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0 && myTadpoles.length > 1) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad) {
      if (waitingForFoodTarget && foodSourceId === selectedTad.id) {
        // Already in selection mode with this creature - cancel
        waitingForFoodTarget = false;
        foodSourceId = null;
        console.log('Food giving cancelled');
      } else if (selectedTad.food > 0) {
        // Enter selection mode - waiting for player to click a creature to give food to
        waitingForFoodTarget = true;
        foodSourceId = selectedTad.id;
        console.log('Click another creature to give food to...');
      }
      updateSelectionCount();
    }
  }
});

hibernateBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'cell') {
      if (selectedTad.isHibernating) {
        // Cancel hibernation
        selectedTad.isHibernating = false;
        selectedTad.hibernationStartTime = null;
        hideHibernationMenu();
      } else {
        // Require 1 nucleotide to start hibernation
        if ((selectedTad.nucleotides || 0) < 1) {
          console.log('Not enough nucleotides for hibernation');
          flashButton(hibernateBtn);
          return;
        }
        selectedTad.nucleotides = (selectedTad.nucleotides || 0) - 1;
        // Start hibernation
        selectedTad.isHibernating = true;
        selectedTad.hibernationStartTime = Date.now();
        // Show hibernation menu for offspring type selection
        showHibernationMenu(selectedTad);
        console.log('Cell entering hibernation...');
      }
      updateSelectionCount();
    }
  }
});

shieldBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'cell' && selectedTad.hasProtector && !selectedTad.isHibernating) {
      // When activating shield, check if we have enough food (costs 1 food per hour)
      if (!selectedTad.bubbleShieldActive && (selectedTad.food || 0) < 1) {
        console.log('Not enough food to activate shield (costs 1 food/hour)');
        flashButton(shieldBtn);
        return;
      }

      selectedTad.bubbleShieldActive = !selectedTad.bubbleShieldActive;
      // Notify server of shield state for protection from NPCs
      socket.emit('bubbleShield', { oderId: selectedTad.id, active: selectedTad.bubbleShieldActive });
      updateSelectionCount();
    }
  }
});

farmBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'bacteria') {
      // Toggle farming mode
      selectedTad.isFarming = !selectedTad.isFarming;
      console.log(`Bacteria farming mode: ${selectedTad.isFarming ? 'ON' : 'OFF'}`);
      updateSelectionCount();
    }
  }
});

restartBtn.addEventListener('click', async () => {
  // Make sure progress is cleared before reloading (wait for server confirmation)
  if (currentUser) {
    await clearProgressOnDeath();
  }
  location.reload();
});

// Test mode button handler
testModeBtn.addEventListener('click', () => {
  testMode = !testMode;
  testModeBtn.classList.toggle('active', testMode);
  socket.emit('testMode', { enabled: testMode });
  console.log(`Test mode ${testMode ? 'ENABLED' : 'DISABLED'}: infinite food, NPCs ignore you`);
  // Visual feedback
  if (myTadpoles.length > 0) {
    spawnDamageText(myTadpoles[0].x, myTadpoles[0].y, 0, testMode ? 'TEST MODE ON' : 'TEST MODE OFF');
  }
});

// Upgrade menu handlers
upgradeCloseBtn.addEventListener('click', () => {
  upgradeMenu.classList.add('hidden');
});

// Tab switching
const tabTechnology = document.getElementById('tabTechnology');
const tabEvolution = document.getElementById('tabEvolution');
const pageTechnology = document.getElementById('pageTechnology');
const pageEvolution = document.getElementById('pageEvolution');

tabTechnology?.addEventListener('click', () => {
  tabTechnology.classList.add('active');
  tabEvolution.classList.remove('active');
  pageTechnology.classList.remove('hidden');
  pageEvolution.classList.add('hidden');
});

tabEvolution?.addEventListener('click', () => {
  tabEvolution.classList.add('active');
  tabTechnology.classList.remove('active');
  pageEvolution.classList.remove('hidden');
  pageTechnology.classList.add('hidden');
});

// Tech Tree click handlers (for tech nodes and evolution options)
function handleTechClick(nodeId) {
  console.log('Tech click:', nodeId);

  // Check both tadpole and cell tech trees
  const isCellTech = nodeId.startsWith('cellTech');
  const techData = isCellTech ? cellTechNodes[nodeId] : techNodes[nodeId];
  if (!techData) {
    console.log('No tech data for', nodeId);
    return;
  }

  if (selectedTadpoles.size === 0) {
    console.log('No creature selected');
    return;
  }
  const selectedId = Array.from(selectedTadpoles)[0];
  const selectedTad = myTadpoles.find(t => t.id === selectedId);
  if (!selectedTad) {
    console.log('Selected creature not found');
    return;
  }

  // Verify creature type matches tech tree
  if (isCellTech && selectedTad.type !== 'cell') {
    console.log('Cell tech requires cell, but creature is', selectedTad.type);
    return;
  }
  if (!isCellTech && selectedTad.type === 'cell' && techData.type !== 'transform') {
    console.log('Tadpole tech for cell creature');
    return;
  }

  const currentFood = selectedTad.food || 0;
  const techTree = isCellTech ? cellTechNodes : techNodes;

  // Check if branch is locked (mutually exclusive columns for cell tech)
  if (isCellTech && techData.branch) {
    const chosenBranch = getCellBranch(selectedTad);
    console.log('Branch check:', techData.branch, 'chosen:', chosenBranch);
    if (chosenBranch && techData.branch !== chosenBranch) {
      console.log('Branch locked - different branch already chosen');
      return; // Cannot research from a different branch
    }
  }

  // Check if node is locked (prerequisite not met)
  if (techData.requires) {
    const reqNode = techTree[techData.requires];
    if (reqNode) {
      const reqLevel = getUpgradeLevel(selectedTad, reqNode.type);
      console.log('Prerequisite check:', techData.requires, 'reqLevel:', reqLevel, 'needs:', reqNode.level);
      if (reqLevel < reqNode.level) {
        console.log('Prerequisite not met');
        return; // Prerequisite not researched
      }
    }
  }

  // Check if already researched
  const currentLevel = getUpgradeLevel(selectedTad, techData.type);
  if (techData.type !== 'transform' && currentLevel >= techData.level) {
    console.log('Already researched');
    return;
  }

  // Check if can afford
  if (currentFood < techData.cost) {
    console.log('Cannot afford:', currentFood, '<', techData.cost);
    return;
  }

  console.log('Purchasing tech:', nodeId, 'for', techData.cost, 'food');

  // Apply the upgrade
  selectedTad.food = currentFood - techData.cost;

  // Mark tutorial progress
  if (!tutorialState.hasUpgraded) {
    tutorialState.hasUpgraded = true;
  }

  // Tadpole upgrades
  if (techData.type === 'health') {
    healthUpgradeLevel = techData.level;
    selectedTad.maxHealthBonus = HEALTH_BONUSES[healthUpgradeLevel - 1];
    selectedTad.healthLevel = healthUpgradeLevel;
    const maxHealth = MAX_HEALTH + selectedTad.maxHealthBonus;
    selectedTad.health = Math.min((selectedTad.health || MAX_HEALTH) + 30, maxHealth);
  } else if (techData.type === 'strength') {
    strengthUpgradeLevel = techData.level;
    selectedTad.strengthBonus = STRENGTH_BONUSES[strengthUpgradeLevel - 1];
    selectedTad.strengthLevel = strengthUpgradeLevel;
  } else if (techData.type === 'capacity') {
    selectedTad.capacityLevel = techData.level;
  } else if (techData.type === 'transform') {
    if (selectedTad.type !== 'tadpole' || selectedTad.isTransforming) return;
    // Require 1 nucleotide for evolution
    const nucleotides = selectedTad.nucleotides || 0;
    if (nucleotides < 1) return;
    // Consume the nucleotide
    selectedTad.nucleotides = 0;
    selectedTad.isTransforming = true;
    selectedTad.transformationStartTime = Date.now();
    selectedTad.baseRadius = selectedTad.radius;
    upgradeMenu.classList.add('hidden');
  } else if (techData.type === 'transformBacteria') {
    if (selectedTad.type !== 'tadpole' || selectedTad.isTransforming) return;
    // Require 1 nucleotide for evolution
    const nucleotides = selectedTad.nucleotides || 0;
    if (nucleotides < 1) return;
    // Consume the nucleotide
    selectedTad.nucleotides = 0;
    selectedTad.isTransformingToBacteria = true;
    selectedTad.transformationStartTime = Date.now();
    selectedTad.baseRadius = selectedTad.radius;
    upgradeMenu.classList.add('hidden');
  }
  // Cell upgrades
  else if (techData.type === 'cellHealth') {
    selectedTad.cellHealthLevel = techData.level;
    selectedTad.cellMaxHealthBonus = CELL_HEALTH_BONUSES[techData.level - 1];
    const maxHealth = CELL_MAX_HEALTH + selectedTad.cellMaxHealthBonus;
    selectedTad.health = Math.min((selectedTad.health || CELL_MAX_HEALTH) + 40, maxHealth);
    // Level 2+ gives health regen boost
    if (techData.level >= 2) {
      selectedTad.regenBoost = techData.level === 2 ? 1.5 : 2.0;
    }
  } else if (techData.type === 'cellStrength') {
    selectedTad.cellStrengthLevel = techData.level;
    selectedTad.cellStrengthBonus = CELL_STRENGTH_BONUSES[techData.level - 1];
  } else if (techData.type === 'cellCapacity') {
    selectedTad.cellCapacityLevel = techData.level;
    selectedTad.cellCapacityBonus = CELL_CAPACITY_BONUSES[techData.level - 1];
  } else if (techData.type === 'cellSpeed') {
    selectedTad.cellSpeedLevel = techData.level;
    selectedTad.cellSpeedBonus = CELL_SPEED_BONUSES[techData.level - 1];
    // Level 2 gives a tail!
    if (techData.level >= 2 && !selectedTad.cellTail) {
      selectedTad.cellTail = []; // Initialize tail array - will be populated in update
      selectedTad.hasCellTail = true;
    }
  } else if (techData.type === 'cellProtector') {
    selectedTad.hasProtector = true;
    selectedTad.canBubbleShield = true;
    // Notify server that this player has protector upgrade
    socket.emit('hasProtector', { active: true });
  } else if (techData.type === 'cellSword') {
    selectedTad.hasSword = true;
    // Additional damage bonus from sword
    selectedTad.cellStrengthBonus = (selectedTad.cellStrengthBonus || 0) + 25;
  } else if (techData.type === 'cellHibernate') {
    selectedTad.canHibernate = true;
  }

  updateUpgradeMenu();
  updateSelectionCount();
}

// Handle evolution actions (Hibernate, Split) - these are not tech tree items
function handleEvolutionAction(actionId) {
  if (selectedTadpoles.size === 0) return;
  const selectedId = Array.from(selectedTadpoles)[0];
  const selectedTad = myTadpoles.find(t => t.id === selectedId);
  if (!selectedTad || selectedTad.type !== 'cell') return;

  if (actionId === 'techHibernate') {
    // Toggle hibernation
    if (selectedTad.isHibernating) {
      selectedTad.isHibernating = false;
      selectedTad.hibernationStartTime = null;
      hideHibernationMenu();
    } else {
      // Require 1 nucleotide to start hibernation
      if ((selectedTad.nucleotides || 0) < 1) {
        console.log('Not enough nucleotides for hibernation');
        return;
      }
      selectedTad.nucleotides = (selectedTad.nucleotides || 0) - 1;
      selectedTad.isHibernating = true;
      selectedTad.hibernationStartTime = Date.now();
      // Show hibernation menu for offspring type selection
      showHibernationMenu(selectedTad);
    }
    upgradeMenu.classList.add('hidden');
  } else if (actionId === 'techSplit') {
    const splitCost = 15;
    if ((selectedTad.food || 0) < splitCost) return;
    // Require 1 nucleotide for split
    if ((selectedTad.nucleotides || 0) < 1) {
      console.log('Not enough nucleotides for split');
      return;
    }

    // Deduct costs
    selectedTad.food -= splitCost;
    selectedTad.nucleotides = (selectedTad.nucleotides || 0) - 1;

    // Create split animation
    selectedTad.isSplitting = true;
    selectedTad.splitStartTime = Date.now();

    // After animation, create the new cell
    setTimeout(() => {
      if (!selectedTad.isSplitting) return; // Cancelled

      // Use parent's angle (default to random if undefined)
      const parentAngle = selectedTad.angle !== undefined ? selectedTad.angle : Math.random() * Math.PI * 2;
      const spawnAngle = parentAngle + Math.PI; // Spawn behind parent

      // Create new cell - virgin with no upgrades
      const newCell = {
        id: `cell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        x: selectedTad.x + Math.cos(spawnAngle) * (selectedTad.radius || 40) * 2.5,
        y: selectedTad.y + Math.sin(spawnAngle) * (selectedTad.radius || 40) * 2.5,
        vx: 0,
        vy: 0,
        radius: selectedTad.radius || 40,
        color: selectedTad.color,
        name: selectedTad.name,
        type: 'cell',
        health: CELL_MAX_HEALTH, // Full health for new cell
        maxHealth: CELL_MAX_HEALTH,
        food: 0,
        angle: spawnAngle,
        wiggleOffset: Math.random() * Math.PI * 2,
        lastHit: 0,
        lastAttack: 0, // Required for attack cooldown to work
        // No upgrades - virgin cell
        cellHealthLevel: 0,
        cellStrengthLevel: 0,
        cellCapacityLevel: 0,
        cellSpeedLevel: 0,
        cellMaxHealthBonus: 0,
        cellStrengthBonus: 0,
        cellCapacityBonus: 0,
        cellSpeedBonus: 0,
        hasCellTail: false,
        hasProtector: false,
        hasSword: false,
        canHibernate: false,
        // Birth animation
        birthTime: Date.now(),
        birthDuration: 800
      };

      // Validate position - if invalid, spawn near parent
      if (!isFinite(newCell.x) || !isFinite(newCell.y)) {
        console.warn('New cell had invalid position, spawning near parent');
        newCell.x = (selectedTad.x || 0) + 50;
        newCell.y = (selectedTad.y || 0) + 50;
      }

      // Initialize render position
      newCell.renderX = newCell.x;
      newCell.renderY = newCell.y;

      // Halve original cell's health
      selectedTad.health = Math.floor((selectedTad.health || CELL_MAX_HEALTH) / 2);
      selectedTad.isSplitting = false;

      // Add to player's creatures
      myTadpoles.push(newCell);
      selectedTadpoles.add(newCell.id);

      updateSelectionCount();
    }, 600); // 600ms split animation

    upgradeMenu.classList.add('hidden');
  }
}

// Tech nodes (both tadpole and cell)
document.querySelectorAll('.tech-node').forEach(node => {
  console.log('Adding click handler for:', node.id);
  node.addEventListener('click', (e) => {
    // Visual feedback for debugging
    node.style.outline = '2px solid yellow';
    setTimeout(() => node.style.outline = '', 200);
    handleTechClick(node.id);
  });
});

// Evolution options
document.querySelectorAll('.evolution-option').forEach(node => {
  node.addEventListener('click', () => {
    // Special handling for hibernate and split (not tech tree items)
    if (node.id === 'techHibernate' || node.id === 'techSplit') {
      handleEvolutionAction(node.id);
    } else {
      handleTechClick(node.id);
    }
  });
});

function getUpgradeLevel(tad, type) {
  // Tadpole upgrades
  if (type === 'health') return tad.healthLevel || 0;
  if (type === 'strength') return tad.strengthLevel || 0;
  if (type === 'capacity') return tad.capacityLevel || 0;
  if (type === 'transform') return tad.type === 'cell' ? 1 : 0;
  if (type === 'transformBacteria') return tad.type === 'bacteria' ? 1 : 0;
  // Cell upgrades
  if (type === 'cellHealth') return tad.cellHealthLevel || 0;
  if (type === 'cellStrength') return tad.cellStrengthLevel || 0;
  if (type === 'cellCapacity') return tad.cellCapacityLevel || 0;
  if (type === 'cellSpeed') return tad.cellSpeedLevel || 0;
  if (type === 'cellProtector') return tad.hasProtector ? 4 : 0;
  if (type === 'cellSword') return tad.hasSword ? 4 : 0;
  if (type === 'cellHibernate') return tad.canHibernate ? 4 : 0;
  return 0;
}

// Get the chosen cell branch for a creature (defense, speed, or offense)
function getCellBranch(tad) {
  if (!tad || tad.type !== 'cell') return null;

  // Check if any branch has been researched (level 1 node)
  if ((tad.cellHealthLevel || 0) >= 1 || (tad.cellCapacityLevel || 0) >= 1 || tad.hasProtector) {
    return 'defense';
  }
  if ((tad.cellSpeedLevel || 0) >= 1) {
    return 'speed';
  }
  if ((tad.cellStrengthLevel || 0) >= 1 || tad.hasSword) {
    return 'offense';
  }
  return null; // No branch chosen yet
}

// Legacy button handlers (kept for backward compatibility, buttons are hidden)
buyHealthBtn?.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    // Check if max level reached
    if (healthUpgradeLevel >= MAX_UPGRADE_LEVEL) return;

    const cost = HEALTH_UPGRADE_COSTS[healthUpgradeLevel];

    if (selectedTad && (selectedTad.food || 0) >= cost) {
      // Deduct cost
      selectedTad.food = (selectedTad.food || 0) - cost;

      // Increase health upgrade level
      healthUpgradeLevel++;

      // Set max health bonus to cumulative value for this level
      selectedTad.maxHealthBonus = HEALTH_BONUSES[healthUpgradeLevel - 1];
      selectedTad.healthLevel = healthUpgradeLevel; // Track for visuals

      // Also heal the creature
      const maxHealth = MAX_HEALTH + selectedTad.maxHealthBonus;
      selectedTad.health = Math.min(
        (selectedTad.health || MAX_HEALTH) + 30, // Heal 30 HP on upgrade
        maxHealth
      );

      updateUpgradeMenu();
      updateSelectionCount();
    }
  }
});

buyStrengthBtn?.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    // Check if max level reached
    if (strengthUpgradeLevel >= MAX_UPGRADE_LEVEL) return;

    const cost = STRENGTH_UPGRADE_COSTS[strengthUpgradeLevel];

    if (selectedTad && (selectedTad.food || 0) >= cost) {
      // Deduct cost
      selectedTad.food = (selectedTad.food || 0) - cost;

      // Increase strength upgrade level
      strengthUpgradeLevel++;

      // Set strength bonus to cumulative value for this level
      selectedTad.strengthBonus = STRENGTH_BONUSES[strengthUpgradeLevel - 1];
      selectedTad.strengthLevel = strengthUpgradeLevel; // Track for visuals

      updateUpgradeMenu();
      updateSelectionCount();
    }
  }
});

buyCapacityBtn?.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    // Only tadpoles can upgrade capacity (cells have fixed high capacity)
    if (!selectedTad || selectedTad.type === 'cell') return;

    // Check if max level reached
    const capacityLevel = selectedTad.capacityLevel || 0;
    if (capacityLevel >= MAX_CAPACITY_LEVEL) return;

    const cost = CAPACITY_UPGRADE_COSTS[capacityLevel];

    if ((selectedTad.food || 0) >= cost) {
      // Deduct cost
      selectedTad.food = (selectedTad.food || 0) - cost;

      // Increase capacity level for this tadpole
      selectedTad.capacityLevel = capacityLevel + 1;

      updateUpgradeMenu();
      updateSelectionCount();
    }
  }
});

transformCellBtn?.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'tadpole' && (selectedTad.food || 0) >= 20) {
      // Check if already transforming
      if (selectedTad.isTransforming) return;
      // Require 1 nucleotide for mitosis
      if ((selectedTad.nucleotides || 0) < 1) {
        console.log('Not enough nucleotides for mitosis');
        return;
      }

      // Deduct costs
      selectedTad.food = (selectedTad.food || 0) - 20;
      selectedTad.nucleotides = (selectedTad.nucleotides || 0) - 1;

      // Start transformation process
      selectedTad.isTransforming = true;
      selectedTad.transformationStartTime = Date.now();
      selectedTad.baseRadius = selectedTad.radius; // Store original radius

      // Close the upgrade menu
      upgradeMenu.classList.add('hidden');
      updateSelectionCount();
    }
  }
});

function updateUpgradeMenu() {
  if (selectedTadpoles.size === 0) return;

  const selectedId = Array.from(selectedTadpoles)[0];
  const selectedTad = myTadpoles.find(t => t.id === selectedId);

  if (!selectedTad) return;

  const currentFood = selectedTad.food || 0;
  const isCell = selectedTad.type === 'cell';

  // Show/hide the appropriate tech tree
  const tadpoleTechTree = document.getElementById('tadpoleTechTree');
  const cellTechTree = document.getElementById('cellTechTree');
  if (tadpoleTechTree && cellTechTree) {
    if (isCell) {
      tadpoleTechTree.classList.add('hidden');
      cellTechTree.classList.remove('hidden');
    } else {
      tadpoleTechTree.classList.remove('hidden');
      cellTechTree.classList.add('hidden');
    }
  }

  // Helper function to update tech nodes
  function updateTechTree(techTree) {
    // Get the chosen branch for cell tech tree (mutually exclusive columns)
    const chosenBranch = techTree === cellTechNodes ? getCellBranch(selectedTad) : null;
    const isDebugCellTree = techTree === cellTechNodes;
    if (isDebugCellTree) {
      console.log('Updating cell tech tree, chosen branch:', chosenBranch);
    }

    // First pass: determine the max researched level for each type
    const maxResearchedLevel = {};
    Object.keys(techTree).forEach(nodeId => {
      const techData = techTree[nodeId];
      const currentLevel = getUpgradeLevel(selectedTad, techData.type);
      if (!maxResearchedLevel[techData.type] || currentLevel > maxResearchedLevel[techData.type]) {
        maxResearchedLevel[techData.type] = currentLevel;
      }
    });

    Object.keys(techTree).forEach(nodeId => {
      const techData = techTree[nodeId];
      const node = document.getElementById(nodeId);
      if (!node) return;

      const currentLevel = getUpgradeLevel(selectedTad, techData.type);
      const isResearched = techData.type === 'transform'
        ? selectedTad.type === 'cell'
        : currentLevel >= techData.level;

      // Check if branch is locked (mutually exclusive columns for cell tech)
      let isBranchLocked = false;
      if (techData.branch && chosenBranch && techData.branch !== chosenBranch) {
        isBranchLocked = true;
      }

      // Check if prerequisite is met
      let isLocked = false;
      if (techData.requires) {
        const reqNode = techTree[techData.requires];
        if (reqNode) {
          const reqLevel = getUpgradeLevel(selectedTad, reqNode.type);
          isLocked = reqLevel < reqNode.level;
        }
      } else if (techData.level > 1) {
        // No explicit prerequisite but level > 1: need previous level of same type
        isLocked = currentLevel < techData.level - 1;
      }

      // Branch lock overrides other states
      if (isBranchLocked) {
        isLocked = true;
      }

      // Check affordability (unlocked but can't afford)
      let canAfford = currentFood >= techData.cost;
      // Transform also requires 1 nucleotide
      if (techData.type === 'transform') {
        const nucleotides = selectedTad.nucleotides || 0;
        canAfford = canAfford && nucleotides >= 1;
      }
      const isUnaffordable = !isResearched && !isLocked && !canAfford;

      // Check fog of war: node is 2+ levels beyond current progress, OR locked by cross-type prerequisite
      const myResearchedLevel = maxResearchedLevel[techData.type] || 0;
      const levelsAhead = techData.level - myResearchedLevel;
      let isFogged = false;
      if (isLocked && !isBranchLocked) {
        if (levelsAhead >= 2) {
          // 2+ levels ahead in same type = fog
          isFogged = true;
        } else if (techData.requires) {
          // If locked by a cross-type prerequisite (different type), also fog
          const reqNode = techTree[techData.requires];
          if (reqNode && reqNode.type !== techData.type) {
            isFogged = true;
          }
        }
      }

      // Debug logging for cell tech nodes
      if (isDebugCellTree && (nodeId === 'cellTechWall' || nodeId === 'cellTechER' || nodeId === 'cellTechStorage')) {
        console.log(`Node ${nodeId}: researched=${isResearched}, locked=${isLocked}, branchLocked=${isBranchLocked}, fogged=${isFogged}, unaffordable=${isUnaffordable}, canAfford=${canAfford}, food=${currentFood}, cost=${techData.cost}`);
      }

      // Update node classes
      node.classList.remove('researched', 'locked', 'unaffordable', 'fog', 'branch-locked');
      if (isResearched) {
        node.classList.add('researched');
      } else if (isBranchLocked) {
        node.classList.add('locked', 'branch-locked');
      } else if (isFogged) {
        node.classList.add('locked', 'fog');
      } else if (isLocked) {
        node.classList.add('locked');
      } else if (isUnaffordable) {
        node.classList.add('unaffordable');
      }

      // Update cost display (for tech-cost or evolution-cost)
      const costEl = node.querySelector('.tech-cost span') || node.querySelector('.evolution-cost span');
      if (costEl) {
        if (isResearched) {
          costEl.textContent = '✓';
        } else if (isBranchLocked) {
          costEl.textContent = '✗';
        } else if (isFogged) {
          costEl.textContent = '?';
        } else {
          costEl.textContent = techData.cost;
        }
      }
    });

    // Update branch visual state (add class to whole branch container)
    if (techTree === cellTechNodes) {
      const defenseBranch = document.querySelector('.defense-branch');
      const speedBranch = document.querySelector('.speed-branch');
      const offenseBranch = document.querySelector('.offense-branch');

      [defenseBranch, speedBranch, offenseBranch].forEach(branch => {
        if (branch) branch.classList.remove('branch-disabled');
      });

      if (chosenBranch) {
        if (chosenBranch !== 'defense' && defenseBranch) defenseBranch.classList.add('branch-disabled');
        if (chosenBranch !== 'speed' && speedBranch) speedBranch.classList.add('branch-disabled');
        if (chosenBranch !== 'offense' && offenseBranch) offenseBranch.classList.add('branch-disabled');
      }
    }
  }

  // Update both tech trees (tadpole and cell)
  updateTechTree(techNodes);
  updateTechTree(cellTechNodes);

  // Update evolution options visibility
  const techMitosis = document.getElementById('techMitosis');
  const techBacteria = document.getElementById('techBacteria');
  const techHibernate = document.getElementById('techHibernate');
  const techSplit = document.getElementById('techSplit');

  if (isCell) {
    // Hide Mitosis and Bacteria for cells, show Hibernate and Split
    if (techMitosis) techMitosis.classList.add('hidden');
    if (techBacteria) techBacteria.classList.add('hidden');
    if (techHibernate) {
      // Only show Hibernate if the tech is unlocked
      if (selectedTad.canHibernate) {
        techHibernate.classList.remove('hidden');
        techHibernate.classList.remove('locked');
        // Update hibernate text based on current state
        const nameEl = techHibernate.querySelector('.evolution-name');
        if (nameEl) {
          nameEl.textContent = selectedTad.isHibernating ? 'Cancel Hibernation' : 'Hibernate';
        }
      } else {
        techHibernate.classList.add('hidden');
      }
    }
    if (techSplit) {
      techSplit.classList.remove('hidden');
      // Update affordability
      const splitCost = 15;
      if (currentFood < splitCost) {
        techSplit.classList.add('unaffordable');
      } else {
        techSplit.classList.remove('unaffordable');
      }
    }
  } else if (selectedTad.type === 'bacteria') {
    // Hide all evolution options for bacteria (bacteria can't evolve further)
    if (techMitosis) techMitosis.classList.add('hidden');
    if (techBacteria) techBacteria.classList.add('hidden');
    if (techHibernate) techHibernate.classList.add('hidden');
    if (techSplit) techSplit.classList.add('hidden');
  } else {
    // Show Mitosis for tadpoles, hide Hibernate, Split, and Bacteria
    // Bacteria (Prokaryosis) is only available during cell hibernation
    if (techMitosis) techMitosis.classList.remove('hidden');
    if (techBacteria) techBacteria.classList.add('hidden'); // Prokaryosis only via hibernation
    if (techHibernate) techHibernate.classList.add('hidden');
    if (techSplit) techSplit.classList.add('hidden');
  }

  // Legacy: update hidden elements (backward compatibility)
  const healthMaxed = healthUpgradeLevel >= MAX_UPGRADE_LEVEL;
  const strengthMaxed = strengthUpgradeLevel >= MAX_UPGRADE_LEVEL;
  const capacityLevel = selectedTad.capacityLevel || 0;

  if (healthUpgradeLevelEl) healthUpgradeLevelEl.textContent = `${healthUpgradeLevel}/${MAX_UPGRADE_LEVEL}`;
  if (strengthUpgradeLevelEl) strengthUpgradeLevelEl.textContent = `${strengthUpgradeLevel}/${MAX_UPGRADE_LEVEL}`;
  if (capacityUpgradeLevelEl) capacityUpgradeLevelEl.textContent = `${capacityLevel}`;
}

function updateCreatureList() {
  // Only show creature list if there are 2+ creatures
  if (myTadpoles.length <= 1) {
    creatureList.style.display = 'none';
    return;
  }

  creatureList.style.display = 'block';

  // Clear the list
  creatureList.innerHTML = '';

  // Calculate total food across all tadpoles
  const totalFood = myTadpoles.reduce((sum, tad) => sum + (tad.food || 0), 0);

  // Add header with selection count and total food
  const header = document.createElement('div');
  header.className = 'creature-list-header';
  header.style.pointerEvents = 'none'; // Ensure clicks pass through
  const line1 = document.createElement('div');
  line1.textContent = `Selected: ${selectedTadpoles.size}`;
  line1.style.pointerEvents = 'none';
  const line2 = document.createElement('div');
  line2.textContent = `Total Food: ${totalFood}`;
  line2.style.pointerEvents = 'none';
  header.appendChild(line1);
  header.appendChild(line2);
  creatureList.appendChild(header);

  // Add each creature
  myTadpoles.forEach((tad, index) => {
    const item = document.createElement('div');
    item.className = 'creature-item';
    item.style.pointerEvents = 'all'; // Ensure clicks work
    item.style.cursor = 'pointer';

    // Add selected class if selected
    if (selectedTadpoles.has(tad.id)) {
      item.classList.add('selected');
    }

    // Add supporting class if in support mode
    if (tad.supportMode) {
      item.classList.add('supporting');
    }

    // Highlight when in support selection mode
    if (waitingForSupportTarget) {
      if (tad.id === supportSourceId) {
        // Source creature - show it's selecting a target
        item.style.background = 'rgba(255, 255, 100, 0.3)';
        item.style.borderColor = 'rgba(255, 255, 100, 0.7)';
      } else {
        // Valid target - show it can be selected
        item.style.background = 'rgba(100, 255, 100, 0.3)';
        item.style.borderColor = 'rgba(100, 255, 100, 0.7)';
      }
    }

    // Highlight when in food transfer selection mode
    if (waitingForFoodTarget) {
      if (tad.id === foodSourceId) {
        // Source creature - show it's giving food
        item.style.background = 'rgba(255, 200, 100, 0.3)';
        item.style.borderColor = 'rgba(255, 200, 100, 0.7)';
      } else {
        // Valid target - show it can receive food
        item.style.background = 'rgba(100, 255, 100, 0.3)';
        item.style.borderColor = 'rgba(100, 255, 100, 0.7)';
      }
    }

    // Create creature name/number and support info
    const creatureName = document.createElement('span');
    const typeIcon = tad.type === 'cell' ? '⬡' : tad.type === 'bacteria' ? '◎' : '○';
    let nameText = `${typeIcon} #${index + 1}`;

    // Add support relationship info
    if (tad.supportMode && tad.supportLeader) {
      const leaderIndex = myTadpoles.findIndex(t => t.id === tad.supportLeader);
      if (leaderIndex !== -1) {
        nameText += ` → #${leaderIndex + 1}`;
      }
    }

    creatureName.textContent = nameText;

    // Create food capacity display
    const foodCapacity = getFoodCapacity(tad);
    const currentFood = tad.food || 0;
    const foodSpan = document.createElement('span');
    foodSpan.className = 'creature-food';
    foodSpan.textContent = `${currentFood}/${foodCapacity}`;
    foodSpan.style.fontSize = '11px';
    foodSpan.style.opacity = '0.8';
    foodSpan.style.marginLeft = '8px';

    item.appendChild(creatureName);
    item.appendChild(foodSpan);

    // Set data attributes for delegated event handler
    item.setAttribute('data-creature-index', index);
    item.setAttribute('data-creature-id', tad.id);

    creatureList.appendChild(item);
  });
}

function updateSelectionCount() {
  // Show/hide selection menu based on whether anything is selected
  if (selectedTadpoles.size > 0) {
    selectionMenu.classList.remove('hidden');
  } else {
    selectionMenu.classList.add('hidden');
  }

  // Show Support button only when there are 2+ creatures
  if (myTadpoles.length > 1) {
    supportBtn.classList.remove('hidden');

    // Update button text based on mode
    if (waitingForSupportTarget) {
      supportBtn.textContent = 'Select target...';
      supportBtn.style.background = 'rgba(100, 255, 100, 0.3)';
      supportBtn.style.borderColor = 'rgba(100, 255, 100, 0.7)';
    } else if (selectedTadpoles.size > 0) {
      const selectedId = Array.from(selectedTadpoles)[0];
      const selectedTad = myTadpoles.find(t => t.id === selectedId);
      if (selectedTad && selectedTad.supportMode) {
        supportBtn.textContent = 'Unlink';
        supportBtn.style.background = '';
        supportBtn.style.borderColor = '';
      } else {
        supportBtn.textContent = 'Support';
        supportBtn.style.background = '';
        supportBtn.style.borderColor = '';
      }
    }

    // Show Give Food button when selected creature has food
    if (selectedTadpoles.size > 0) {
      const selectedId = Array.from(selectedTadpoles)[0];
      const selectedTad = myTadpoles.find(t => t.id === selectedId);
      if (selectedTad && selectedTad.food > 0) {
        giveFoodBtn.classList.remove('hidden');
        if (waitingForFoodTarget) {
          giveFoodBtn.textContent = 'Select target...';
          giveFoodBtn.style.background = 'rgba(255, 200, 100, 0.3)';
          giveFoodBtn.style.borderColor = 'rgba(255, 200, 100, 0.7)';
        } else {
          giveFoodBtn.textContent = 'Give Food';
          giveFoodBtn.style.background = '';
          giveFoodBtn.style.borderColor = '';
        }
      } else {
        giveFoodBtn.classList.add('hidden');
      }
    } else {
      giveFoodBtn.classList.add('hidden');
    }
  } else {
    supportBtn.classList.add('hidden');
    giveFoodBtn.classList.add('hidden');
  }

  // Hibernate is now in the Evolution tab - keep button hidden
  hibernateBtn.classList.add('hidden');

  // Show Shield button only for Protector cells (not while hibernating)
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    if (selectedTad && selectedTad.type === 'cell' && selectedTad.hasProtector && !selectedTad.isHibernating) {
      shieldBtn.classList.remove('hidden');
      // Update button text based on shield state
      if (selectedTad.bubbleShieldActive) {
        shieldBtn.textContent = 'Shield ON (-1/hr)';
        shieldBtn.style.background = 'rgba(100, 200, 255, 0.3)';
        shieldBtn.style.borderColor = 'rgba(100, 200, 255, 0.7)';
      } else {
        shieldBtn.textContent = 'Shield (-1/hr)';
        shieldBtn.style.background = '';
        shieldBtn.style.borderColor = '';
      }
    } else {
      shieldBtn.classList.add('hidden');
    }
  } else {
    shieldBtn.classList.add('hidden');
  }

  // Show Farm button only for bacteria creatures
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    if (selectedTad && selectedTad.type === 'bacteria') {
      farmBtn.classList.remove('hidden');
      // Update button text based on farming state
      if (selectedTad.isFarming) {
        farmBtn.textContent = 'Stop Farming';
        farmBtn.style.background = 'rgba(100, 255, 100, 0.3)';
        farmBtn.style.borderColor = 'rgba(100, 255, 100, 0.7)';
      } else {
        farmBtn.textContent = 'Farm';
        farmBtn.style.background = '';
        farmBtn.style.borderColor = '';
      }
    } else {
      farmBtn.classList.add('hidden');
    }
  } else {
    farmBtn.classList.add('hidden');
  }

  // Check if selection changed
  let selectionChanged = false;
  if (selectedTadpoles.size !== lastSelectedIds.size) {
    selectionChanged = true;
  } else {
    for (let id of selectedTadpoles) {
      if (!lastSelectedIds.has(id)) {
        selectionChanged = true;
        break;
      }
    }
  }

  // Only rebuild creature list if something changed
  const creatureCountChanged = myTadpoles.length !== lastCreatureCount;
  const supportModeChanged = waitingForSupportTarget !== lastWaitingForSupport;
  const foodModeChanged = waitingForFoodTarget !== lastWaitingForFood;

  // Check if any food values changed
  let foodChanged = false;
  for (let tad of myTadpoles) {
    const lastFood = lastFoodValues.get(tad.id) || 0;
    if ((tad.food || 0) !== lastFood) {
      foodChanged = true;
      lastFoodValues.set(tad.id, tad.food || 0);
    }
  }

  if (creatureCountChanged || supportModeChanged || foodModeChanged || selectionChanged || foodChanged) {
    lastCreatureCount = myTadpoles.length;
    lastWaitingForSupport = waitingForSupportTarget;
    lastWaitingForFood = waitingForFoodTarget;
    lastSelectedIds = new Set(selectedTadpoles);
    updateCreatureList();
  }
}

// Game loop
function update(deltaTime = 1) {
  if (isDead) return;

  // Test mode: give infinite food to all creatures
  if (testMode) {
    myTadpoles.forEach(tad => {
      const maxFood = tad.type === 'cell' ? CELL_FOOD_CAPACITY : getFoodCapacity(tad);
      tad.food = maxFood;
    });
  }

  // Check for birth animation completion - stop velocity when animation ends
  const now = Date.now();
  myTadpoles.forEach(tad => {
    if (tad.birthTime && tad.birthDuration) {
      const timeSinceBirth = now - tad.birthTime;
      if (timeSinceBirth >= tad.birthDuration) {
        // Birth animation complete - stop movement
        tad.vx = 0;
        tad.vy = 0;
        tad.birthTime = null;
        tad.birthDuration = null;
      }
    }
  });

  // Auto-select single creature (no yellow highlight)
  if (myTadpoles.length === 1 && selectedTadpoles.size === 0) {
    selectedTadpoles.add(myTadpoles[0].id);
  }

  // Update NPC tails for rendering (NPC behavior is server-controlled)
  const time = Date.now() / 1000;
  for (let npc of Object.values(npcs)) {
    // Only update tail animation for tadpoles
    if (npc.type === 'tadpole') {
      updateTail(npc, time);
    }
    // Smooth interpolation for render position
    const interpFactor = 0.2;
    if (npc.renderX !== undefined) {
      npc.renderX += (npc.x - npc.renderX) * interpFactor;
      npc.renderY += (npc.y - npc.renderY) * interpFactor;
    } else {
      npc.renderX = npc.x;
      npc.renderY = npc.y;
    }

    // Make NPC face toward nearest player/tadpole (unless attacking)
    const isLunging = npc.attackLungeTime && (now - npc.attackLungeTime) < ATTACK_LUNGE_DURATION * 2.5;
    if (!isLunging) {
      // Find nearest target (player's tadpoles)
      let nearestDist = Infinity;
      let nearestTarget = null;
      for (let tad of myTadpoles) {
        const dx = tad.x - npc.x;
        const dy = tad.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearestDist && dist < 500) { // Only face if within detection range
          nearestDist = dist;
          nearestTarget = tad;
        }
      }
      if (nearestTarget) {
        const targetAngle = Math.atan2(nearestTarget.y - npc.y, nearestTarget.x - npc.x);
        // Smoothly rotate toward target
        let angleDiff = targetAngle - (npc.angle || 0);
        // Normalize to -PI to PI
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        npc.angle = (npc.angle || 0) + angleDiff * 0.1;
      }
    }

    // Apply attack lunge animation for NPCs
    if (npc.attackLungeTime && npc.attackLungeAngle !== undefined) {
      const timeSinceLunge = now - npc.attackLungeTime;
      if (timeSinceLunge < ATTACK_LUNGE_DURATION * 2.5) {
        // Make NPC face the attack direction
        npc.angle = npc.attackLungeAngle;

        // Lunge forward then bob back
        let lungeProgress;

        if (timeSinceLunge < ATTACK_LUNGE_DURATION) {
          // Lunge forward (0 to 1) - sudden jerky motion
          lungeProgress = timeSinceLunge / ATTACK_LUNGE_DURATION;
          lungeProgress = lungeProgress * lungeProgress; // Jerky easing
        } else {
          // Bob back (1 to 0) - slower
          lungeProgress = 1 - (timeSinceLunge - ATTACK_LUNGE_DURATION) / ATTACK_LUNGE_DURATION;
          lungeProgress = Math.max(0, Math.sqrt(lungeProgress)); // Ease out, clamp to 0
        }

        const lungeOffset = lungeProgress * ATTACK_LUNGE_DISTANCE;
        npc.renderX += Math.cos(npc.attackLungeAngle) * lungeOffset;
        npc.renderY += Math.sin(npc.attackLungeAngle) * lungeOffset;

        // Add squish effect during recoil
        if (timeSinceLunge >= ATTACK_LUNGE_DURATION && timeSinceLunge < ATTACK_LUNGE_DURATION * 2) {
          npc.attackSquish = lungeProgress * 0.25;
          npc.attackSquishAngle = npc.attackLungeAngle;
        } else {
          npc.attackSquish = 0;
        }
      } else {
        npc.attackSquish = 0;
      }
    }
  }

  // Update particles - gentle floating motion with player-relative recycling
  const playerCenterX = myTadpoles.length > 0 ? myTadpoles[0].x : 0;
  const playerCenterY = myTadpoles.length > 0 ? myTadpoles[0].y : 0;
  const particleRange = 2500; // Max distance from player

  particles.forEach(particle => {
    // Gentle sinusoidal floating
    const floatX = Math.sin(time * 0.5 + particle.phase) * particle.driftSpeed;
    const floatY = Math.cos(time * 0.3 + particle.phase) * particle.driftSpeed;

    // Slow drift in a direction
    particle.x += Math.cos(particle.driftAngle) * particle.driftSpeed + floatX;
    particle.y += Math.sin(particle.driftAngle) * particle.driftSpeed + floatY;

    // Recycle particles that are too far from player
    const dx = particle.x - playerCenterX;
    const dy = particle.y - playerCenterY;
    const distSq = dx * dx + dy * dy;
    if (distSq > particleRange * particleRange) {
      // Respawn at random position around player
      const angle = Math.random() * Math.PI * 2;
      const dist = particleRange * 0.5 + Math.random() * particleRange * 0.4;
      particle.x = playerCenterX + Math.cos(angle) * dist;
      particle.y = playerCenterY + Math.sin(angle) * dist;
      particle.driftAngle = Math.random() * Math.PI * 2;
    }
  });

  // Track food eaten this frame to prevent multiple tadpoles eating the same food
  const eatenThisFrame = new Set();

  // Update player tadpoles
  for (let tad of myTadpoles) {
    let dx = 0;
    let dy = 0;

    const isSelected = selectedTadpoles.has(tad.id);

    // Get list of all selected creatures for formation logic
    const selectedCreatures = myTadpoles.filter(t => selectedTadpoles.has(t.id));

    // Support mode - follow leader and attack what leader attacks
    let supportMoveTarget = null;
    let supportAttackTarget = null;

    if (tad.supportMode && tad.supportLeader) {
      const leader = myTadpoles.find(t => t.id === tad.supportLeader);
      if (leader) {
        // Follow leader at a natural distance - stay behind and to the side
        const leaderDistX = leader.x - tad.x;
        const leaderDistY = leader.y - tad.y;
        const leaderDist = Math.sqrt(leaderDistX * leaderDistX + leaderDistY * leaderDistY);

        // Ideal formation: behind and slightly to the side of leader
        const minDistance = 100; // Minimum separation - they should never touch
        const maxDistance = 200; // Maximum separation before catching up

        // Find what the leader is attacking
        // Check if leader is near any enemy (NPCs or other players) - only alive targets
        for (let npc of Object.values(npcs)) {
          if (npc.health <= 0) continue; // Skip dead NPCs
          const distX = leader.x - npc.x;
          const distY = leader.y - npc.y;
          const distance = Math.sqrt(distX * distX + distY * distY);
          if (distance < ATTACK_RANGE) {
            supportAttackTarget = npc;
            break;
          }
        }

        // Also check other players
        if (!supportAttackTarget) {
          for (let player of Object.values(players)) {
            if (player.health <= 0) continue; // Skip dead players
            const distX = leader.x - player.x;
            const distY = leader.y - player.y;
            const distance = Math.sqrt(distX * distX + distY * distY);
            if (distance < ATTACK_RANGE) {
              supportAttackTarget = player;
              break;
            }
          }
        }

        // Intelligent positioning based on situation
        if (supportAttackTarget) {
          // When attacking: flank the target for better angle
          // Position on opposite side of target from leader
          const targetToLeaderAngle = Math.atan2(leader.y - supportAttackTarget.y, leader.x - supportAttackTarget.x);
          const flankAngle = targetToLeaderAngle + Math.PI; // Opposite side
          const flankDistance = 90; // Distance from target to flank position (maintain separation)

          const idealX = supportAttackTarget.x + Math.cos(flankAngle) * flankDistance;
          const idealY = supportAttackTarget.y + Math.sin(flankAngle) * flankDistance;

          const idealDistX = idealX - tad.x;
          const idealDistY = idealY - tad.y;
          const distToIdeal = Math.sqrt(idealDistX * idealDistX + idealDistY * idealDistY);

          if (distToIdeal > 20) {
            supportMoveTarget = { x: idealX, y: idealY };
          }
        } else {
          // When following: intelligently avoid bumping into leader
          // Calculate leader's velocity to predict movement
          const leaderSpeed = Math.sqrt(leader.vx * leader.vx + leader.vy * leader.vy);

          // Calculate ideal position: behind leader based on leader's movement direction
          let leaderAngle = leader.angle || 0;
          if (leaderSpeed > 0.1) {
            // Use velocity direction if leader is moving
            leaderAngle = Math.atan2(leader.vy, leader.vx);
          }

          // If too close to leader, move to the side to avoid collision
          if (leaderDist < minDistance) {
            // Move perpendicular to leader's movement to get out of the way
            const perpendicularAngle = leaderAngle + Math.PI / 2;
            const avoidDistance = minDistance + 30;
            const avoidX = leader.x + Math.cos(perpendicularAngle) * avoidDistance;
            const avoidY = leader.y + Math.sin(perpendicularAngle) * avoidDistance;
            supportMoveTarget = { x: avoidX, y: avoidY };
          } else {
            // Normal follow position: behind and to the side
            const offsetAngle = leaderAngle + Math.PI + (Math.PI / 6); // Behind and slightly to side
            const idealDistance = 120; // Comfortable follow distance
            const idealX = leader.x + Math.cos(offsetAngle) * idealDistance;
            const idealY = leader.y + Math.sin(offsetAngle) * idealDistance;

            // Move toward ideal position if too far from it
            const idealDistX = idealX - tad.x;
            const idealDistY = idealY - tad.y;
            const distToIdeal = Math.sqrt(idealDistX * idealDistX + idealDistY * idealDistY);

            if (distToIdeal > 20) {
              supportMoveTarget = { x: idealX, y: idealY };
            }
          }
        }
      } else {
        // Leader no longer exists, disable support mode
        tad.supportMode = false;
        tad.supportLeader = null;
      }
    }

    // Supporting creatures collect food after leader kills
    if (tad.supportMode && tad.collectFoodAt) {
      const collectArea = tad.collectFoodAt;
      const foodSearchRadius = 150; // Search for food within this radius of death location

      // Find nearest food item within search area
      let nearestFood = null;
      let nearestDist = Infinity;

      for (let foodItem of Object.values(food)) {
        const dx = foodItem.x - collectArea.x;
        const dy = foodItem.y - collectArea.y;
        const distToDeathSpot = Math.sqrt(dx * dx + dy * dy);

        if (distToDeathSpot < foodSearchRadius) {
          const tadDx = foodItem.x - tad.x;
          const tadDy = foodItem.y - tad.y;
          const distToFood = Math.sqrt(tadDx * tadDx + tadDy * tadDy);

          if (distToFood < nearestDist) {
            nearestDist = distToFood;
            nearestFood = foodItem;
          }
        }
      }

      if (nearestFood) {
        // Move to collect this food
        supportMoveTarget = { x: nearestFood.x, y: nearestFood.y };
      } else {
        // No more food in area, stop collecting
        tad.collectFoodAt = null;
      }
    }

    // Auto-collect food for non-support tadpoles (after a kill)
    // Only if no explicit player command (moveTarget/attackTarget)
    let autoCollectTarget = null;
    if (!tad.supportMode && tad.collectFoodAt && !moveTarget && !attackTarget) {
      const collectArea = tad.collectFoodAt;
      const foodSearchRadius = 150;

      // Clear collectFoodAt if it's been too long (10 seconds)
      if (Date.now() - collectArea.time > 10000) {
        tad.collectFoodAt = null;
      } else {
        // Find nearest food item within search area
        let nearestFood = null;
        let nearestDist = Infinity;

        for (let foodItem of Object.values(food)) {
          const dx = foodItem.x - collectArea.x;
          const dy = foodItem.y - collectArea.y;
          const distToDeathSpot = Math.sqrt(dx * dx + dy * dy);

          if (distToDeathSpot < foodSearchRadius) {
            const distToTad = Math.sqrt(
              Math.pow(foodItem.x - tad.x, 2) + Math.pow(foodItem.y - tad.y, 2)
            );
            if (distToTad < nearestDist) {
              nearestDist = distToTad;
              nearestFood = foodItem;
            }
          }
        }

        if (nearestFood) {
          autoCollectTarget = { x: nearestFood.x, y: nearestFood.y };
        } else {
          // No more food in area, stop collecting
          tad.collectFoodAt = null;
        }
      }
    }

    // Clear auto-collect if player gives explicit command
    if (tad.collectFoodAt && (moveTarget || attackTarget)) {
      tad.collectFoodAt = null;
    }

    // Can move if has any target (per-creature or global) OR in support mode OR auto-collecting (but not if hibernating)
    const hasPerCreatureTarget = tad.moveTarget || tad.attackTarget;
    if ((isSelected || tad.supportMode || autoCollectTarget || hasPerCreatureTarget) && !tad.isHibernating) {
      // Priority: per-creature targets > support targets > global targets > auto-collect
      // This allows each creature to have independent commands
      let currentAttackTarget;
      let currentMoveTarget;

      if (tad.supportMode) {
        // Support mode uses support targets
        currentAttackTarget = supportAttackTarget;
        currentMoveTarget = supportMoveTarget;
      } else {
        // Non-support: use per-creature targets if set, otherwise globals
        currentAttackTarget = tad.attackTarget || (isSelected ? attackTarget : null);
        currentMoveTarget = tad.moveTarget || (isSelected ? moveTarget : null) || autoCollectTarget;
      }

      // Formation logic for multi-selected creatures
      let formationOffset = { x: 0, y: 0 };

      // Generate a persistent random offset for natural variation
      if (!tad.formationRandomOffset) {
        tad.formationRandomOffset = {
          x: (Math.random() - 0.5) * 15,
          y: (Math.random() - 0.5) * 15
        };
      }

      if (selectedCreatures.length > 1 && isSelected && (currentMoveTarget || currentAttackTarget)) {
        const creatureIndex = selectedCreatures.indexOf(tad);
        const totalCreatures = selectedCreatures.length;

        if (currentAttackTarget) {
          // Attacking formation: tight circle around target
          const angleStep = (Math.PI * 2) / totalCreatures;
          const formationAngle = angleStep * creatureIndex;
          const formationRadius = 70; // Distance from target

          formationOffset.x = Math.cos(formationAngle) * formationRadius;
          formationOffset.y = Math.sin(formationAngle) * formationRadius;
        } else if (currentMoveTarget) {
          // Movement formation: arrange in a neat circular/grid pattern around destination
          if (totalCreatures === 2) {
            // Two creatures: side by side
            const spacing = 40;
            const offset = (creatureIndex - 0.5) * spacing;
            formationOffset.x = offset;
            formationOffset.y = 0;
          } else if (totalCreatures <= 6) {
            // 3-6 creatures: circle around destination
            const angleStep = (Math.PI * 2) / totalCreatures;
            const formationAngle = angleStep * creatureIndex;
            const formationRadius = 50 + (totalCreatures - 3) * 10; // Larger circle for more creatures

            formationOffset.x = Math.cos(formationAngle) * formationRadius;
            formationOffset.y = Math.sin(formationAngle) * formationRadius;
          } else {
            // 7+ creatures: use concentric circles
            const innerCircleSize = 6;
            if (creatureIndex < innerCircleSize) {
              // Inner circle
              const angleStep = (Math.PI * 2) / innerCircleSize;
              const formationAngle = angleStep * creatureIndex;
              const formationRadius = 50;

              formationOffset.x = Math.cos(formationAngle) * formationRadius;
              formationOffset.y = Math.sin(formationAngle) * formationRadius;
            } else {
              // Outer circle(s)
              const outerIndex = creatureIndex - innerCircleSize;
              const outerCircleSize = totalCreatures - innerCircleSize;
              const angleStep = (Math.PI * 2) / outerCircleSize;
              const formationAngle = angleStep * outerIndex + Math.PI / outerCircleSize; // Offset for better coverage
              const formationRadius = 90;

              formationOffset.x = Math.cos(formationAngle) * formationRadius;
              formationOffset.y = Math.sin(formationAngle) * formationRadius;
            }
          }
        }

        // Add small random variation to formation for natural look
        formationOffset.x += tad.formationRandomOffset.x;
        formationOffset.y += tad.formationRandomOffset.y;
      } else if (currentMoveTarget) {
        // Single creature or support mode gets random offset for natural positioning
        formationOffset = tad.formationRandomOffset;
      }

      // Attack target - all selected tadpoles attack continuously
      // First check if target is still valid (alive and exists)
      let activeAttackTarget = currentAttackTarget;
      if (activeAttackTarget) {
        // Check if target is dead or no longer exists
        const targetIsDead = activeAttackTarget.health <= 0;
        const targetIsNPC = npcs[activeAttackTarget.id] !== undefined;
        const targetIsPlayer = players[activeAttackTarget.id] !== undefined;
        const targetExists = targetIsNPC || targetIsPlayer || myTadpoles.includes(activeAttackTarget);

        if (targetIsDead || !targetExists) {
          // Clear the attack target (per-creature only - don't clear global since other creatures may use it)
          if (!tad.supportMode) {
            tad.attackTarget = null; // Clear per-creature target
          }
          // Skip attack logic for this frame
          activeAttackTarget = null;
        }
      }

      if (activeAttackTarget) {
        // Apply formation offset to attack position (where creature moves to)
        const targetX = activeAttackTarget.x + formationOffset.x;
        const targetY = activeAttackTarget.y + formationOffset.y;

        const distX = targetX - tad.x;
        const distY = targetY - tad.y;
        const distance = Math.sqrt(distX * distX + distY * distY);

        // Calculate actual distance to target (not formation position) for attack range
        const actualDistX = activeAttackTarget.x - tad.x;
        const actualDistY = activeAttackTarget.y - tad.y;
        const actualDistance = Math.sqrt(actualDistX * actualDistX + actualDistY * actualDistY);

        // Cells with swords turn to face targets (spike-first attack)
        if (tad.type === 'cell' && tad.hasSword && actualDistance < ATTACK_RANGE * 1.5) {
          const angleToTarget = Math.atan2(activeAttackTarget.y - tad.y, activeAttackTarget.x - tad.x);
          // Quickly turn to face target
          let angleDiff = angleToTarget - (tad.angle || 0);
          // Normalize to -PI to PI
          while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
          while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
          tad.angle = (tad.angle || 0) + angleDiff * 0.2; // Turn towards target
        }

        if (actualDistance < ATTACK_RANGE) {
          // In range of actual target, attack continuously
          const attackCooldown = tad.type === 'cell' ? CELL_ATTACK_COOLDOWN : TADPOLE_ATTACK_COOLDOWN;

          if (Date.now() - tad.lastAttack > attackCooldown) {
            // Calculate damage - include both tadpole and cell strength bonuses
            let baseStrength = playerStrength + (tad.strengthBonus || 0);
            if (tad.type === 'cell') {
              baseStrength += (tad.cellStrengthBonus || 0);
            }
            let damage = baseStrength * (tad.type === 'cell' ? 1.5 : 1);

            // Spike-first bonus: if cell has sword and is facing the target, deal massive damage
            if (tad.type === 'cell' && tad.hasSword) {
              const angleToTarget = Math.atan2(activeAttackTarget.y - tad.y, activeAttackTarget.x - tad.x);
              const facingAngle = tad.angle || 0;
              const angleDiff = Math.abs(((angleToTarget - facingAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
              // If facing within ~45 degrees of target, spike hits first - massive damage
              if (angleDiff < Math.PI / 4) {
                damage *= 3; // Triple damage for spike-first hit
              }
            }

            tad.lastAttack = Date.now();

            // Start attack animation (lunge)
            tad.attackLungeTime = Date.now();
            const angle = Math.atan2(activeAttackTarget.y - tad.y, activeAttackTarget.x - tad.x);
            tad.attackLungeAngle = angle;

            // If attacking an NPC, send to server (server handles damage, death, provoke)
            if (npcs[activeAttackTarget.id]) {
              socket.emit('attackNPC', {
                npcId: activeAttackTarget.id,
                damage: damage,
                attackerX: tad.x,
                attackerY: tad.y
              });
              // Don't apply damage locally - server will broadcast npcDamaged event
            } else if (players[activeAttackTarget.id]) {
              // Attacking another player - send to server to forward to them
              socket.emit('attackPlayer', {
                targetId: activeAttackTarget.id,
                damage: damage,
                knockbackX: Math.cos(angle) * 1,
                knockbackY: Math.sin(angle) * 1
              });
              // Show damage text locally for attacker feedback
              spawnDamageText(activeAttackTarget.x, activeAttackTarget.y, damage);
            } else {
              // Attacking local entity (own tadpole?) - apply damage locally
              activeAttackTarget.health -= damage;
              activeAttackTarget.lastHit = Date.now();

              // Spawn damage text
              spawnDamageText(activeAttackTarget.x, activeAttackTarget.y, damage);

              // Bounce target
              activeAttackTarget.vx += Math.cos(angle) * 1;
              activeAttackTarget.vy += Math.sin(angle) * 1;

              // Check if target died
              if (activeAttackTarget.health <= 0) {
                const deathX = activeAttackTarget.x;
                const deathY = activeAttackTarget.y;
                handleDeath(activeAttackTarget);

                // Auto-collect: tell the killer and supporting creatures to collect food
                tad.collectFoodAt = { x: deathX, y: deathY, time: Date.now() };

                myTadpoles.forEach(supportingTad => {
                  if (supportingTad.supportMode && supportingTad.supportLeader === tad.id) {
                    // Mark this creature to collect food from the death location
                    supportingTad.collectFoodAt = { x: deathX, y: deathY, time: Date.now() };
                  }
                });

                // Only clear global attackTarget if not in support mode
                if (!tad.supportMode && attackTarget === activeAttackTarget) {
                  attackTarget = null;
                }
              }
            }
          }
          // Stay in position and keep attacking - ultra-slow coast
          dx = 0;
          dy = 0;
          tad.vx *= 0.98;
          tad.vy *= 0.98;
        } else {
          // Move towards formation position to get in range
          dx = distX / distance;
          dy = distY / distance;

          // Gentle deceleration as approaching attack range
          const decelerationZone = ATTACK_RANGE * 1.5;
          if (distance < decelerationZone) {
            const speedMultiplier = 0.6 + 0.4 * (distance - ATTACK_RANGE) / (decelerationZone - ATTACK_RANGE);
            dx *= speedMultiplier;
            dy *= speedMultiplier;
          }
        }
      }

      // Move target - all selected tadpoles move to same location (with formation)
      if (currentMoveTarget && !currentAttackTarget) {
        const targetX = currentMoveTarget.x + formationOffset.x;
        const targetY = currentMoveTarget.y + formationOffset.y;

        const distX = targetX - tad.x;
        const distY = targetY - tad.y;
        const distance = Math.sqrt(distX * distX + distY * distY);

        // Calculate current speed
        const currentSpeed = Math.sqrt(tad.vx * tad.vx + tad.vy * tad.vy);

        // Dynamic deceleration zone based on current speed - faster = start slowing earlier
        const minDecelZone = ARRIVAL_THRESHOLD * 3;
        const decelerationZone = Math.max(minDecelZone, currentSpeed * 25);

        // Check if this is a fixed-speed entity (bacteria or protector cells)
        const isFixedSpeed = tad.type === 'bacteria' || (tad.type === 'cell' && tad.hasProtector);

        if (distance < ARRIVAL_THRESHOLD) {
          // Arrived - fixed-speed entities stop immediately, others coast
          if (isFixedSpeed) {
            dx = 0;
            dy = 0;
          } else {
            tad.vx *= 0.95;
            tad.vy *= 0.95;

            // Gentle nudge toward exact target to prevent drifting
            if (distance > 5) {
              tad.vx += (distX / distance) * 0.015;
              tad.vy += (distY / distance) * 0.015;
            }
          }
        } else if (distance < decelerationZone && !isFixedSpeed) {
          // Approaching - calculate desired velocity for smooth gliding arrival
          // Bacteria skip deceleration - they move at constant speed
          const arrivalTime = 35; // More frames = smoother coast
          const desiredVx = distX / arrivalTime;
          const desiredVy = distY / arrivalTime;

          // Gentle blend for natural gliding deceleration
          const blendFactor = 0.08;
          tad.vx += (desiredVx - tad.vx) * blendFactor;
          tad.vy += (desiredVy - tad.vy) * blendFactor;

          // Don't add normal movement input in decel zone
          dx = 0;
          dy = 0;
        } else {
          // Normal movement toward target
          dx = distX / distance;
          dy = distY / distance;

          // Check if moving away from target - apply counter-force for quicker turns
          const dotProduct = tad.vx * dx + tad.vy * dy;
          if (dotProduct < 0 && currentSpeed > 0.3) {
            // Moving opposite to target direction - brake very hard and boost turn
            const brakeFactor = 0.85; // Very strong braking when turning around
            tad.vx *= brakeFactor;
            tad.vy *= brakeFactor;

            // Strong thrust toward target for sharp turns
            dx *= 4;
            dy *= 4;
          } else if (dotProduct < currentSpeed * 0.5 && currentSpeed > 0.3) {
            // Moving at an angle to target - apply moderate correction
            const brakeFactor = 0.95;
            tad.vx *= brakeFactor;
            tad.vy *= brakeFactor;
            dx *= 2;
            dy *= 2;
          }
        }
      }

      // Keyboard - only respond to keyboard if selected (not in support mode)
      if (isSelected) {
        if (keys['arrowleft'] || keys['a']) {
          dx = -1;
          moveTarget = null;
          tad.moveTarget = null;
        }
        if (keys['arrowright'] || keys['d']) {
          dx = 1;
          moveTarget = null;
          tad.moveTarget = null;
        }
        if (keys['arrowup'] || keys['w']) {
          dy = -1;
          moveTarget = null;
          tad.moveTarget = null;
        }
        if (keys['arrowdown'] || keys['s']) {
          dy = 1;
          moveTarget = null;
          tad.moveTarget = null;
        }
      }
    }

    // Normalize diagonal
    if (dx !== 0 && dy !== 0) {
      const magnitude = Math.sqrt(dx * dx + dy * dy);
      dx /= magnitude;
      dy /= magnitude;
    }

    // Apply movement
    let moveSpeed = tad.type === 'cell' ? MOVE_SPEED * 0.4 :
                    tad.type === 'bacteria' ? MOVE_SPEED * 0.5 : MOVE_SPEED;

    // Protector cells have fixed slow speed - no bonuses apply, no acceleration, no coasting
    if (tad.type === 'cell' && tad.hasProtector) {
      // Protectors with active shield cannot move at all
      if (tad.bubbleShieldActive) {
        tad.vx = 0;
        tad.vy = 0;

        // Shield consumes food at 1 food per hour (1/3600 per second, per physics tick)
        const SHIELD_FOOD_COST_PER_SECOND = 1 / 3600; // 1 food per hour
        const foodCost = SHIELD_FOOD_COST_PER_SECOND * PHYSICS_TIMESTEP / 1000;
        tad.shieldFoodAccumulator = (tad.shieldFoodAccumulator || 0) + foodCost;

        // Deduct whole food units when accumulated
        if (tad.shieldFoodAccumulator >= 1) {
          tad.food = Math.max(0, (tad.food || 0) - 1);
          tad.shieldFoodAccumulator -= 1;

          // Turn off shield if out of food
          if (tad.food <= 0) {
            tad.bubbleShieldActive = false;
            tad.shieldFoodAccumulator = 0;
            socket.emit('bubbleShield', { oderId: tad.id, active: false });
          }
        }
      } else if (dx !== 0 || dy !== 0) {
        // Fixed constant speed - SET velocity directly (no acceleration/sprint/coasting)
        const protectorSpeed = 0.4; // Constant slow pace
        tad.vx = dx * protectorSpeed;
        tad.vy = dy * protectorSpeed;
      } else {
        // No movement input - stop immediately (protectors don't coast)
        tad.vx = 0;
        tad.vy = 0;
      }
    } else if (tad.type === 'bacteria') {
      // Bacteria have fixed constant speed - no acceleration/sprint behavior, no coasting
      const bacteriaSpeed = 0.5; // Constant slow pace
      if (dx !== 0 || dy !== 0) {
        tad.vx = dx * bacteriaSpeed;
        tad.vy = dy * bacteriaSpeed;
      } else {
        // Bacteria stop immediately when no direction input (no coasting)
        tad.vx = 0;
        tad.vy = 0;
      }
    } else {
      // Normal cells and tadpoles get speed bonuses and acceleration
      // Apply cell speed bonus from upgrades
      if (tad.type === 'cell' && tad.cellSpeedBonus) {
        moveSpeed *= (1 + tad.cellSpeedBonus);
      }
      // Cells with tails are faster than tadpoles
      if (tad.type === 'cell' && tad.hasCellTail) {
        moveSpeed = MOVE_SPEED * 1.3; // 30% faster than tadpoles
        if (tad.cellSpeedBonus) {
          moveSpeed *= (1 + tad.cellSpeedBonus * 0.5); // Additional bonus scales less
        }
      }
      if (dx !== 0 || dy !== 0) {
        tad.vx += dx * moveSpeed;
        tad.vy += dy * moveSpeed;
      }
    }

    // Friction (skip for Protectors and Bacteria when actively moving - they have fixed speed)
    const isProtectorActivelyMoving = tad.type === 'cell' && tad.hasProtector && (dx !== 0 || dy !== 0);
    const isBacteriaActivelyMoving = tad.type === 'bacteria' && (dx !== 0 || dy !== 0);
    if (!isProtectorActivelyMoving && !isBacteriaActivelyMoving) {
      tad.vx *= FRICTION;
      tad.vy *= FRICTION;
    }

    // Lower threshold for Protectors to allow slow movement
    const velThreshold = (tad.type === 'cell' && tad.hasProtector) ? 0.001 : 0.01;
    if (Math.abs(tad.vx) < velThreshold) tad.vx = 0;
    if (Math.abs(tad.vy) < velThreshold) tad.vy = 0;

    tad.x += tad.vx;
    tad.y += tad.vy;

    // Sanity check: reset position if it becomes invalid (NaN/Infinity)
    if (!isFinite(tad.x) || !isFinite(tad.y)) {
      console.warn('Creature position became invalid, resetting to camera position');
      tad.x = camera.x || 0;
      tad.y = camera.y || 0;
      tad.vx = 0;
      tad.vy = 0;
    }

    tad.renderX = tad.x;
    tad.renderY = tad.y;

    // Apply attack lunge animation
    if (tad.attackLungeTime) {
      const timeSinceLunge = Date.now() - tad.attackLungeTime;
      if (timeSinceLunge < ATTACK_LUNGE_DURATION * 2) {
        // Lunge forward then bob back
        let lungeProgress;
        let isLunging = false;

        if (timeSinceLunge < ATTACK_LUNGE_DURATION) {
          // Lunge forward (0 to 1) - sudden jerky motion
          lungeProgress = timeSinceLunge / ATTACK_LUNGE_DURATION;
          isLunging = true;
          // Jerky easing - fast acceleration
          lungeProgress = lungeProgress * lungeProgress;
        } else {
          // Bob back (1 to 0) - slower, with squish
          lungeProgress = 1 - (timeSinceLunge - ATTACK_LUNGE_DURATION) / ATTACK_LUNGE_DURATION;
          // Ease out with bounce
          lungeProgress = Math.sqrt(lungeProgress);
        }

        const lungeOffset = lungeProgress * ATTACK_LUNGE_DISTANCE;

        tad.renderX += Math.cos(tad.attackLungeAngle) * lungeOffset;
        tad.renderY += Math.sin(tad.attackLungeAngle) * lungeOffset;

        // Add squish effect when pulling back (spring loading)
        if (!isLunging) {
          // Squish gets stronger as we pull back (compress like a spring)
          const squishAmount = (1 - lungeProgress) * 0.7; // Max 70% squish
          tad.attackSquish = squishAmount;
          tad.attackSquishAngle = tad.attackLungeAngle;
        } else {
          tad.attackSquish = 0;
        }
      } else {
        tad.attackLungeTime = null;
        tad.attackSquish = 0;
      }
    }

    // Check for food collisions
    for (let foodItem of Object.values(food)) {
      // Skip if already eaten this frame by another tadpole
      if (eatenThisFrame.has(foodItem.id)) continue;

      const dx = tad.x - foodItem.x;
      const dy = tad.y - foodItem.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Add pickup buffer so you don't have to move exactly over food
      const FOOD_PICKUP_BUFFER = 15;
      if (distance < tad.radius + foodItem.radius + FOOD_PICKUP_BUFFER) {
        if (foodItem.type === 'nucleotide') {
          // Nucleotides: max 1 per creature
          const currentNucleotides = tad.nucleotides || 0;
          if (currentNucleotides < 1) {
            tad.nucleotides = 1;
            eatenThisFrame.add(foodItem.id);
            // Add to vanishing with suck-in animation targeting this tadpole
            vanishingFood.push({
              ...foodItem,
              vanishTime: Date.now(),
              targetX: tad.x,
              targetY: tad.y,
              startX: foodItem.x,
              startY: foodItem.y
            });
            delete food[foodItem.id];
            socket.emit('eatFood', foodItem.id);
          }
        } else {
          // Regular food: check food capacity
          const foodCapacity = getFoodCapacity(tad);
          const currentFood = tad.food || 0;

          if (currentFood < foodCapacity) {
            tad.food = currentFood + 1;
            eatenThisFrame.add(foodItem.id);
            // Add to vanishing with suck-in animation targeting this tadpole
            vanishingFood.push({
              ...foodItem,
              vanishTime: Date.now(),
              targetX: tad.x,
              targetY: tad.y,
              startX: foodItem.x,
              startY: foodItem.y
            });
            delete food[foodItem.id];
            socket.emit('eatFood', foodItem.id);
          }
        }
      }
    }

    // Helper function to check if entity is protected by a bubble shield
    function isProtectedByShield(entity) {
      // First check: is this entity itself a protector with active shield?
      if (entity.type === 'cell' && entity.hasProtector && entity.bubbleShieldActive) {
        return true;
      }
      // Second check: is this entity within another protector's shield radius?
      for (let protector of myTadpoles) {
        if (protector.type === 'cell' && protector.hasProtector && protector.bubbleShieldActive) {
          const shieldRadius = protector.radius * 12;
          const dx = entity.x - protector.x;
          const dy = entity.y - protector.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < shieldRadius) {
            return true;
          }
        }
      }
      return false;
    }

    // Collision with own tadpoles
    for (let otherTad of myTadpoles) {
      if (otherTad.id === tad.id) continue;

      const dx = tad.x - otherTad.x;
      const dy = tad.y - otherTad.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = tad.radius + otherTad.radius;

      if (distance < minDistance && distance > 0) {
        // Calculate bounce
        const angle = Math.atan2(dy, dx);
        const overlap = minDistance - distance;

        // Push apart
        const pushX = Math.cos(angle) * overlap * 0.5;
        const pushY = Math.sin(angle) * overlap * 0.5;

        tad.x += pushX;
        tad.y += pushY;

        // Reduce bounce velocity if both are selected (moving together)
        const bothSelected = selectedTadpoles.has(tad.id) && selectedTadpoles.has(otherTad.id);
        const bounceStrength = bothSelected ? 0.05 : 0.3; // Much weaker bounce when both selected

        tad.vx += Math.cos(angle) * bounceStrength;
        tad.vy += Math.sin(angle) * bounceStrength;
      }
    }

    // Collision with other players' tadpoles
    for (let otherPlayer of Object.values(players)) {
      const dx = tad.x - otherPlayer.x;
      const dy = tad.y - otherPlayer.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = tad.radius + otherPlayer.radius;

      if (distance < minDistance && distance > 0) {
        // Skip push if entity is protected by shield
        if (isProtectedByShield(tad)) continue;

        // Calculate bounce
        const angle = Math.atan2(dy, dx);
        const overlap = minDistance - distance;

        // Push apart
        const pushX = Math.cos(angle) * overlap * 0.5;
        const pushY = Math.sin(angle) * overlap * 0.5;

        tad.x += pushX;
        tad.y += pushY;

        // Bounce velocity
        const bounceStrength = 0.3;
        tad.vx += Math.cos(angle) * bounceStrength;
        tad.vy += Math.sin(angle) * bounceStrength;
      }
    }

    // Collision with NPCs
    for (let npc of Object.values(npcs)) {
      const dx = tad.x - npc.x;
      const dy = tad.y - npc.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance = tad.radius + npc.radius;

      if (distance < minDistance && distance > 0) {
        // Skip push if entity is protected by shield
        if (isProtectedByShield(tad)) continue;

        // Calculate bounce
        const angle = Math.atan2(dy, dx);
        const overlap = minDistance - distance;

        // Push apart
        const pushX = Math.cos(angle) * overlap * 0.5;
        const pushY = Math.sin(angle) * overlap * 0.5;

        tad.x += pushX;
        tad.y += pushY;

        // Bounce velocity
        const bounceStrength = 0.3;
        tad.vx += Math.cos(angle) * bounceStrength;
        tad.vy += Math.sin(angle) * bounceStrength;
      }
    }

    // Health regeneration
    if (Date.now() - tad.lastHit > 1000) {
      // Use correct max health based on type
      const maxHealth = tad.type === 'cell' ? (CELL_MAX_HEALTH + (tad.cellMaxHealthBonus || 0)) :
                        tad.type === 'bacteria' ? BACTERIA_MAX_HEALTH :
                        (MAX_HEALTH + (tad.maxHealthBonus || 0));
      tad.health = Math.min(maxHealth, tad.health + HEALTH_REGEN_RATE);
      // Update playerHealth to track the first tadpole's health
      if (myTadpoles[0] === tad) {
        playerHealth = tad.health;
      }
    }

    // Bacteria farming - passive food generation
    if (tad.type === 'bacteria' && tad.isFarming) {
      // Slow down while farming (bacteria stays mostly still to farm)
      tad.vx *= 0.95;
      tad.vy *= 0.95;

      // Generate food passively (accumulate fractional food, round when displaying)
      const foodCapacity = BACTERIA_FOOD_CAPACITY;
      const currentFood = tad.food || 0;
      if (currentFood < foodCapacity) {
        // Accumulate fractional food internally
        tad.farmingAccumulator = (tad.farmingAccumulator || 0) + BACTERIA_FARM_RATE;
        // When accumulator reaches 1, add 1 food
        if (tad.farmingAccumulator >= 1) {
          tad.food = Math.min(Math.floor(currentFood) + 1, foodCapacity);
          tad.farmingAccumulator -= 1;
        }
      }
    }

    // Check hibernation completion
    if (tad.isHibernating && tad.hibernationStartTime) {
      // Stop all movement while hibernating
      tad.vx = 0;
      tad.vy = 0;

      const elapsed = Date.now() - tad.hibernationStartTime;
      if (elapsed >= HIBERNATION_DURATION) {
        // Pop out direction - random angle
        const popAngle = Math.random() * Math.PI * 2;
        const popSpeed = 3; // Gentle initial velocity

        // Determine offspring type based on hibernation menu selection
        const offspringType = selectedOffspringType || 'tadpole';
        let newCreature;

        if (offspringType === 'bacteria') {
          // Spawn a bacteria (Prokaryosis)
          const spawnDistance = tad.radius + BACTERIA_RADIUS;
          newCreature = {
            id: `bacteria_${myId}_${Date.now()}`,
            x: tad.x + Math.cos(popAngle) * spawnDistance,
            y: tad.y + Math.sin(popAngle) * spawnDistance,
            vx: Math.cos(popAngle) * popSpeed,
            vy: Math.sin(popAngle) * popSpeed,
            renderX: tad.x + Math.cos(popAngle) * spawnDistance,
            renderY: tad.y + Math.sin(popAngle) * spawnDistance,
            color: '#7fbf7f',
            radius: BACTERIA_RADIUS,
            name: tad.name,
            health: BACTERIA_MAX_HEALTH,
            maxHealth: BACTERIA_MAX_HEALTH,
            lastHit: 0,
            lastAttack: 0,
            type: 'bacteria',
            food: 0,
            birthTime: Date.now(),
            birthDuration: 800,
            blobShape: generateBlobShape(),
            angle: popAngle,
            wiggleOffset: Math.random() * Math.PI * 2,
            isFarming: false
          };
          console.log('Hibernation complete! New bacteria spawned (Prokaryosis).');
        } else {
          // Spawn a tadpole (default)
          const spawnDistance = tad.radius + TADPOLE_RADIUS;
          newCreature = {
            id: `${myId}_${Date.now()}`,
            x: tad.x + Math.cos(popAngle) * spawnDistance,
            y: tad.y + Math.sin(popAngle) * spawnDistance,
            vx: Math.cos(popAngle) * popSpeed,
            vy: Math.sin(popAngle) * popSpeed,
            renderX: tad.x + Math.cos(popAngle) * spawnDistance,
            renderY: tad.y + Math.sin(popAngle) * spawnDistance,
            color: '#FFFFFF',
            radius: TADPOLE_RADIUS,
            score: 0,
            name: tad.name,
            health: MAX_HEALTH,
            lastHit: 0,
            lastAttack: 0,
            type: 'tadpole',
            food: 0,
            birthTime: Date.now(),
            birthDuration: 800
          };
          initializeTadpole(newCreature);
          console.log('Hibernation complete! New tadpole spawned.');
        }

        myTadpoles.push(newCreature);

        // Cell recoil in opposite direction
        tad.vx = -Math.cos(popAngle) * 3;
        tad.vy = -Math.sin(popAngle) * 3;

        // Mark cell as just gave birth for visual effect
        tad.birthBurstTime = Date.now();

        // End hibernation
        tad.isHibernating = false;
        tad.hibernationStartTime = null;

        // Hide hibernation menu if open
        hideHibernationMenu();

        // Reset offspring type selection to default
        selectedOffspringType = 'tadpole';

        // Update UI to reset hibernate button
        updateSelectionCount();
      }
    }

    // Check transformation completion
    if (tad.isTransforming && tad.transformationStartTime) {
      // Stop all movement while transforming
      tad.vx *= 0.9;
      tad.vy *= 0.9;

      const elapsed = Date.now() - tad.transformationStartTime;
      const progress = Math.min(elapsed / TRANSFORMATION_DURATION, 1);

      // Gradually increase radius from tadpole to cell size
      const startRadius = tad.baseRadius || TADPOLE_RADIUS;
      tad.radius = startRadius + (CELL_RADIUS - startRadius) * progress;

      if (elapsed >= TRANSFORMATION_DURATION) {
        // Complete the transformation
        tad.type = 'cell';
        tad.radius = CELL_RADIUS;
        tad.color = '#4a5f7f'; // Less dark hue of dark blue

        // Notify server of type change for NPC aggression logic
        socket.emit('updateType', { type: 'cell', radius: CELL_RADIUS });

        // Clear tail and hairs completely - force fresh initialization
        tad.tail = null;
        tad.hairs = null;
        tad.trail = null;

        // Ensure angle and wiggle offset are set for cell
        if (!tad.angle) {
          tad.angle = 0;
        }
        if (!tad.wiggleOffset) {
          tad.wiggleOffset = Math.random() * Math.PI * 2;
        }

        // End transformation
        tad.isTransforming = false;
        tad.transformationStartTime = null;
        tad.baseRadius = null;

        // Update UI to show hibernate button for cell
        updateSelectionCount();

        console.log('Transformation complete! Now a cell.');
      }
    }

    // Handle bacteria transformation
    if (tad.isTransformingToBacteria && tad.transformationStartTime) {
      // Stop all movement while transforming
      tad.vx *= 0.9;
      tad.vy *= 0.9;

      const elapsed = Date.now() - tad.transformationStartTime;
      const progress = Math.min(elapsed / BACTERIA_TRANSFORMATION_DURATION, 1);

      // Gradually change radius to bacteria size
      const startRadius = tad.baseRadius || TADPOLE_RADIUS;
      tad.radius = startRadius + (BACTERIA_RADIUS - startRadius) * progress;

      if (elapsed >= BACTERIA_TRANSFORMATION_DURATION) {
        // Complete the transformation
        tad.type = 'bacteria';
        tad.radius = BACTERIA_RADIUS;
        tad.color = '#7fbf7f'; // Light green hue

        // Notify server of type change
        socket.emit('updateType', { type: 'bacteria', radius: BACTERIA_RADIUS });

        // Clear tail and reinitialize
        tad.tail = null;
        tad.hairs = null;
        tad.trail = null;

        // Generate blob shape
        tad.blobShape = generateBlobShape();

        // Set health for bacteria
        tad.maxHealth = BACTERIA_MAX_HEALTH;
        tad.health = BACTERIA_MAX_HEALTH;

        // End transformation
        tad.isTransformingToBacteria = false;
        tad.transformationStartTime = null;
        tad.baseRadius = null;

        // Update UI
        updateSelectionCount();

        console.log('Transformation complete! Now a bacteria.');
      }
    }

    // Check death (unless invincibility mode is enabled)
    if (tad.health <= 0 && !invincibilityMode) {
      handleDeath(tad);
    }

    // Only update tail for tadpoles, not cells
    if (tad.type === 'tadpole') {
      updateTail(tad, time);
    }
    // Update cell tail for cells with speed upgrade level 2+
    if (tad.type === 'cell' && tad.hasCellTail) {
      updateCellTail(tad, time);
    }
    // Update angle for cells WITHOUT hasCellTail (so they still face movement direction)
    if (tad.type === 'cell' && !tad.hasCellTail) {
      const vx = tad.vx || 0;
      const vy = tad.vy || 0;
      const speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 0.1) {
        const targetAngle = Math.atan2(vy, vx);
        let angleDiff = targetAngle - (tad.angle || 0);
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        tad.angle = (tad.angle || 0) + angleDiff * 0.06;
        // Normalize angle
        while (tad.angle > Math.PI) tad.angle -= Math.PI * 2;
        while (tad.angle < -Math.PI) tad.angle += Math.PI * 2;
      } else if (tad.angle === undefined) {
        tad.angle = 0;
      }
    }
  }

  // Update camera to follow selected tadpole or main tadpole
  if (myTadpoles.length > 0) {
    let cameraTarget = myTadpoles[0];

    // If there's a selected tadpole, track that one
    if (selectedTadpoles.size > 0) {
      const selectedId = Array.from(selectedTadpoles)[0];
      const selectedTad = myTadpoles.find(t => t.id === selectedId);
      if (selectedTad) {
        cameraTarget = selectedTad;
      }
    }

    camera.targetX = cameraTarget.x;
    camera.targetY = cameraTarget.y;
    camera.x += (camera.targetX - camera.x) * CAMERA_SMOOTHING;
    camera.y += (camera.targetY - camera.y) * CAMERA_SMOOTHING;
  }

  // Deselect tadpoles that are out of view
  const viewPadding = 50;
  const viewLeft = camera.x - canvas.width / 2 - viewPadding;
  const viewRight = camera.x + canvas.width / 2 + viewPadding;
  const viewTop = camera.y - canvas.height / 2 - viewPadding;
  const viewBottom = camera.y + canvas.height / 2 + viewPadding;

  let selectionChanged = false;
  selectedTadpoles.forEach(tadId => {
    const tad = myTadpoles.find(t => t.id === tadId);
    if (tad) {
      if (tad.x < viewLeft || tad.x > viewRight || tad.y < viewTop || tad.y > viewBottom) {
        selectedTadpoles.delete(tadId);
        selectionChanged = true;
      }
    }
  });

  // Only update UI if selection actually changed
  if (selectionChanged) {
    updateSelectionCount();
  }

  // Show/hide menu based on selection
  if (selectedTadpoles.size > 0) {
    selectionMenu.classList.remove('hidden');
  } else {
    selectionMenu.classList.add('hidden');
  }

  // Send position (only from primary window - secondary windows are view-only)
  // Send the position of the creature closest to any hostile NPC (so NPCs can attack it)
  if (!isSecondaryWindow && myTadpoles.length > 0 && (!update.lastSent || Date.now() - update.lastSent > 50)) {
    let targetTad = myTadpoles[0];

    // Find creature closest to any hostile NPC (for NPC attack targeting)
    let closestNpcDist = Infinity;
    for (let npc of Object.values(npcs)) {
      // Skip friendly/idle NPCs
      if (npc.isIdlePlayer) continue;

      for (let tad of myTadpoles) {
        const dx = tad.x - npc.x;
        const dy = tad.y - npc.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestNpcDist) {
          closestNpcDist = dist;
          targetTad = tad;
        }
      }
    }

    socket.emit('move', {
      x: targetTad.x,
      y: targetTad.y,
      vx: targetTad.vx,
      vy: targetTad.vy
    });
    update.lastSent = Date.now();

    // Sync full state to server less frequently (every 200ms)
    if (!update.lastStateSync || Date.now() - update.lastStateSync > 200) {
      const primaryTad = myTadpoles[0];
      if (primaryTad) {
        // Build creatures array for ALL creatures (so other players can see them all)
        const creatures = myTadpoles.map(tad => ({
          id: tad.id,
          x: tad.x,
          y: tad.y,
          vx: tad.vx,
          vy: tad.vy,
          angle: tad.angle || 0,
          health: tad.health,
          maxHealth: tad.maxHealth,
          food: tad.food,
          nucleotides: tad.nucleotides,
          type: tad.type,
          radius: tad.radius,
          hasProtector: tad.hasProtector,
          hasSword: tad.hasSword,
          hasCellTail: tad.hasCellTail,
          bubbleShieldActive: tad.bubbleShieldActive
        }));

        // Debug: log creatures being sent (rate-limited to every 5 seconds)
        if (creatures.length > 1 && (!window._lastSyncOutLog || Date.now() - window._lastSyncOutLog > 5000)) {
          console.log(`[SYNC OUT] Sending ${creatures.length} creatures:`, creatures.map(c => `${c.type}@${Math.round(c.x)},${Math.round(c.y)}`).join(', '));
          window._lastSyncOutLog = Date.now();
        }
        // Debug: log cell angles being sent (rate-limited)
        const cellCreatures = creatures.filter(c => c.type === 'cell');
        if (cellCreatures.length > 0 && (!window._lastCellAngleSendLog || Date.now() - window._lastCellAngleSendLog > 2000)) {
          console.log(`[CELL ANGLE SEND] Cells:`, cellCreatures.map(c => `angle=${c.angle.toFixed(3)}`).join(', '));
          window._lastCellAngleSendLog = Date.now();
        }

        socket.emit('syncState', {
          health: primaryTad.health,
          maxHealth: primaryTad.maxHealth,
          food: primaryTad.food,
          nucleotides: primaryTad.nucleotides,
          type: primaryTad.type,
          radius: primaryTad.radius,
          hasProtector: primaryTad.hasProtector,
          hasSword: primaryTad.hasSword,
          bubbleShieldActive: primaryTad.bubbleShieldActive,
          // Tadpole upgrades
          healthLevel: primaryTad.healthLevel || 0,
          strengthLevel: primaryTad.strengthLevel || 0,
          capacityLevel: primaryTad.capacityLevel || 0,
          maxHealthBonus: primaryTad.maxHealthBonus || 0,
          strengthBonus: primaryTad.strengthBonus || 0,
          // Cell upgrades
          cellHealthLevel: primaryTad.cellHealthLevel || 0,
          cellStrengthLevel: primaryTad.cellStrengthLevel || 0,
          cellCapacityLevel: primaryTad.cellCapacityLevel || 0,
          cellSpeedLevel: primaryTad.cellSpeedLevel || 0,
          cellSpeedBonus: primaryTad.cellSpeedBonus || 0,
          cellStrengthBonus: primaryTad.cellStrengthBonus || 0,
          hasCellTail: primaryTad.hasCellTail || false,
          canHibernate: primaryTad.canHibernate || false,
          creatures: creatures
        });
      }
      update.lastStateSync = Date.now();
    }
  }

  // Clean up expired death effects
  deathEffects = deathEffects.filter(effect => now - effect.startTime < effect.duration);
}

// Visual interpolation - runs once per render frame (not per physics step)
function interpolateVisuals() {
  const time = Date.now() / 1000;

  // Frame-rate independent interpolation factor
  const interpFactor = 1 - Math.pow(1 - INTERPOLATION_FACTOR, renderDeltaTime / PHYSICS_TIMESTEP);

  // Interpolate other players' positions for smooth rendering
  // Frame-rate independent interpolation using exponential decay
  // Formula: factor = 1 - (1 - baseSpeed)^(deltaTime * targetFPS / 1000)
  const targetFPS = 60;
  const positionSmoothing = 0.08; // Base smoothing per frame at 60fps
  const renderSmoothing = 0.25;   // Faster for render position

  // Calculate frame-rate independent lerp factors
  const posFactor = 1 - Math.pow(1 - positionSmoothing, renderDeltaTime * targetFPS / 1000);
  const renderFactor = 1 - Math.pow(1 - renderSmoothing, renderDeltaTime * targetFPS / 1000);

  Object.values(players).forEach(player => {
    // Get server target position
    const targetX = player.serverX !== undefined ? player.serverX : player.x;
    const targetY = player.serverY !== undefined ? player.serverY : player.y;

    // Smooth interpolation towards server position (frame-rate independent)
    player.x += (targetX - player.x) * posFactor;
    player.y += (targetY - player.y) * posFactor;

    // Render position follows actual position closely
    if (!player.renderX) player.renderX = player.x;
    if (!player.renderY) player.renderY = player.y;
    player.renderX += (player.x - player.renderX) * renderFactor;
    player.renderY += (player.y - player.renderY) * renderFactor;

    // Update tail based on player type
    if (player.type === 'cell' && player.hasCellTail) {
      updateCellTail(player, time, true); // true = isRemote, don't update angle
    } else if (player.type === 'tadpole') {
      updateTail(player, time, true); // true = isRemote, don't update angle
    }
  });
}

function handleDeath(entity) {
  // Create death splat effect
  deathEffects.push({
    x: entity.x,
    y: entity.y,
    radius: entity.radius,
    startTime: Date.now(),
    duration: 2000 // 2 seconds - slowly vanishes
  });

  // Only emit spawnDeathFood for player creature deaths
  // NPC deaths are handled server-side in handleNPCDeath - don't spawn duplicate food
  const isPlayerCreature = myTadpoles.includes(entity);
  if (isPlayerCreature) {
    socket.emit('spawnDeathFood', {
      x: entity.x,
      y: entity.y,
      count: 1
    });
  }

  if (myTadpoles.includes(entity)) {
    myTadpoles = myTadpoles.filter(t => t !== entity);
    selectedTadpoles.delete(entity.id);

    // Notify server that player died (clears saved position, resets NPC targeting)
    socket.emit('playerDied', { x: entity.x, y: entity.y });

    if (myTadpoles.length === 0) {
      isDead = true;
      deathScreen.classList.remove('hidden');
      // Clear saved progress so player starts fresh as tadpole
      clearProgressOnDeath();
    }
  } else if (npcs[entity.id]) {
    const wasCell = entity.type === 'cell';
    delete npcs[entity.id];

    // Respawn NPC with same type
    const npc = {
      id: entity.id,
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      vx: 0,
      vy: 0,
      renderX: 0,
      renderY: 0,
      color: '#505050', // Darker shade of grey
      radius: wasCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
      score: 0,
      name: '',
      health: NPC_MAX_HEALTH,
      lastHit: 0,
      lastAttack: 0,
      type: wasCell ? 'cell' : 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false // Respawned NPCs are peaceful again
    };
    npc.renderX = npc.x;
    npc.renderY = npc.y;

    if (wasCell) {
      // Cells don't have tails, they're hexagons
      npc.angle = 0;
      npc.wiggleOffset = Math.random() * Math.PI * 2;
      // Cell fatigue system
      npc.chaseEnergy = 100;
      npc.maxChaseEnergy = 100;
      npc.isTired = false;
      npc.tiredStartTime = 0;
    } else {
      initializeTadpole(npc);
    }

    npcs[npc.id] = npc;
  } else if (players[entity.id]) {
    // Other player died
    delete players[entity.id];
  }
}

function spawnDamageText(x, y, damage, customText = null) {
  damageTexts.push({
    x: x,
    y: y,
    damage: Math.round(damage),
    customText: customText, // For "Shielded!" etc.
    startTime: Date.now(),
    duration: 1000 // 1 second
  });
}

function drawDamageTexts() {
  const now = Date.now();

  // Draw and update damage texts
  damageTexts = damageTexts.filter(text => {
    const elapsed = now - text.startTime;

    if (elapsed > text.duration) {
      return false; // Remove expired text
    }

    const progress = elapsed / text.duration;
    const opacity = 1 - progress; // Fade out
    const offsetY = -progress * 60; // Float upward 60 pixels

    // Draw damage text
    ctx.save();
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Use custom text if provided, otherwise show damage
    let displayText;
    let fillColor;
    if (text.customText) {
      displayText = text.customText;
      fillColor = `rgba(100, 200, 255, ${opacity})`; // Blue for shield/special
    } else {
      displayText = `-${text.damage}`;
      fillColor = `rgba(255, 50, 50, ${opacity})`; // Red for damage
    }

    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.lineWidth = 2;
    ctx.fillStyle = fillColor;

    ctx.strokeText(displayText, text.x, text.y + offsetY);
    ctx.fillText(displayText, text.x, text.y + offsetY);

    ctx.restore();

    return true; // Keep the text
  });
}

// Render loop
function render() {
  ctx.save();

  // Clear canvas
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#0a0e1a');
  gradient.addColorStop(1, '#050810');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const offsetX = canvas.width / 2 - camera.x;
  const offsetY = canvas.height / 2 - camera.y;
  ctx.translate(offsetX, offsetY);

  // Draw grid with global wave/ripple simulation
  const gridSize = 100;
  const time = Date.now() / 1000;

  const startX = Math.floor((camera.x - canvas.width / 2) / gridSize) * gridSize;
  const endX = Math.ceil((camera.x + canvas.width / 2) / gridSize) * gridSize;
  const startY = Math.floor((camera.y - canvas.height / 2) / gridSize) * gridSize;
  const endY = Math.ceil((camera.y + canvas.height / 2) / gridSize) * gridSize;

  ctx.strokeStyle = 'rgba(100, 150, 200, 0.15)';
  ctx.lineWidth = 1;

  // Vertical lines with global wave
  for (let x = startX; x <= endX; x += gridSize) {
    ctx.beginPath();
    for (let y = startY; y <= endY; y += 10) {
      const wave = getWaveOffset(x, y, time);
      if (y === startY) {
        ctx.moveTo(x + wave.x, y + wave.y);
      } else {
        ctx.lineTo(x + wave.x, y + wave.y);
      }
    }
    ctx.stroke();
  }

  // Horizontal lines with global wave
  for (let y = startY; y <= endY; y += gridSize) {
    ctx.beginPath();
    for (let x = startX; x <= endX; x += 10) {
      const wave = getWaveOffset(x, y, time);
      if (x === startX) {
        ctx.moveTo(x + wave.x, y + wave.y);
      } else {
        ctx.lineTo(x + wave.x, y + wave.y);
      }
    }
    ctx.stroke();
  }

  // Draw coordinate labels at major gridlines with wave effect
  ctx.fillStyle = 'rgba(150, 180, 220, 0.6)';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const majorGridSize = 500;
  const labelStartX = Math.floor(startX / majorGridSize) * majorGridSize;
  const labelEndX = Math.ceil(endX / majorGridSize) * majorGridSize;
  const labelStartY = Math.floor(startY / majorGridSize) * majorGridSize;
  const labelEndY = Math.ceil(endY / majorGridSize) * majorGridSize;

  for (let x = labelStartX; x <= labelEndX; x += majorGridSize) {
    for (let y = labelStartY; y <= labelEndY; y += majorGridSize) {
      if (x !== 0 || y !== 0) {
        // Apply wave to labels
        const wave = getWaveOffset(x, y, time);
        ctx.fillText(`(${x}, ${y})`, x + 5 + wave.x * 0.5, y + 5 + wave.y * 0.5);
      }
    }
  }

  // Draw origin marker with wave
  const originWave = getWaveOffset(0, 0, time);
  ctx.strokeStyle = 'rgba(150, 180, 220, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(originWave.x, originWave.y, 15, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(150, 180, 220, 0.7)';
  ctx.fillText('(0, 0)', 20 + originWave.x, 5 + originWave.y);

  // Draw ambient particles (before food, as background elements)
  particles.forEach(particle => {
    // Only render particles in view
    const viewPadding = 100;
    if (particle.x < camera.x - canvas.width / 2 - viewPadding ||
        particle.x > camera.x + canvas.width / 2 + viewPadding ||
        particle.y < camera.y - canvas.height / 2 - viewPadding ||
        particle.y > camera.y + canvas.height / 2 + viewPadding) {
      return;
    }

    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${particle.brightness * 0.4})`; // Semi-transparent white
    ctx.fill();
  });

  // Draw food
  Object.values(food).forEach(foodItem => {
    // Spawn animation - pop effect
    let scale = 1;
    let glowAlpha = 0;
    const spawnDuration = 300; // 300ms spawn animation

    if (foodItem.spawnTime) {
      const elapsed = Date.now() - foodItem.spawnTime;
      if (elapsed < spawnDuration) {
        const progress = elapsed / spawnDuration;
        // Pop: start at 0, overshoot to 1.4, settle to 1
        if (progress < 0.4) {
          scale = (progress / 0.4) * 1.4;
        } else {
          const settleProgress = (progress - 0.4) / 0.6;
          scale = 1.4 - 0.4 * settleProgress;
        }
        glowAlpha = (1 - progress) * 0.6;
      } else {
        // Animation complete, remove spawnTime
        delete foodItem.spawnTime;
      }
    }

    const isNucleotide = foodItem.type === 'nucleotide';

    // Nucleotide has a subtle pulse effect
    let pulseScale = 1;
    if (isNucleotide) {
      pulseScale = 1 + Math.sin(Date.now() / 200) * 0.1;
    }

    const drawRadius = foodItem.radius * scale * pulseScale;

    // Spawn glow effect
    if (glowAlpha > 0) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, drawRadius * 2.5, 0, Math.PI * 2);
      const spawnGlowColor = isNucleotide
        ? `rgba(100, 200, 255, ${glowAlpha * 0.5})`
        : `rgba(200, 255, 200, ${glowAlpha * 0.4})`;
      ctx.fillStyle = spawnGlowColor;
      ctx.fill();
    }

    // Outer glow - nucleotide has blue glow, food has white
    ctx.beginPath();
    if (isNucleotide) {
      // Larger, more prominent glow for nucleotide
      ctx.arc(foodItem.x, foodItem.y, drawRadius + 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(100, 180, 255, 0.4)';
    } else {
      ctx.arc(foodItem.x, foodItem.y, drawRadius + 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    }
    ctx.fill();

    // Main food circle
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, drawRadius, 0, Math.PI * 2);
    if (isNucleotide) {
      // Blue/cyan gradient for nucleotide
      const gradient = ctx.createRadialGradient(
        foodItem.x, foodItem.y, 0,
        foodItem.x, foodItem.y, drawRadius
      );
      gradient.addColorStop(0, '#E0FFFF'); // Light cyan center
      gradient.addColorStop(0.6, '#00BFFF'); // Deep sky blue
      gradient.addColorStop(1, '#1E90FF'); // Dodger blue edge
      ctx.fillStyle = gradient;
    } else {
      // White for food
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.fill();

    // Cursor around food if targeting
    if (moveTarget && moveTarget.isFoodTarget && moveTarget.foodId === foodItem.id) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, drawRadius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // Consistent yellow
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Draw vanishing food with suck-in animation
  const vanishDuration = 250; // Faster for suck-in effect
  for (let i = vanishingFood.length - 1; i >= 0; i--) {
    const foodItem = vanishingFood[i];
    const elapsed = Date.now() - foodItem.vanishTime;

    if (elapsed >= vanishDuration) {
      // Animation complete, remove from array
      vanishingFood.splice(i, 1);
      continue;
    }

    const progress = elapsed / vanishDuration;

    // Calculate position - move towards target if we have one
    let drawX = foodItem.x;
    let drawY = foodItem.y;
    if (foodItem.targetX !== undefined && foodItem.startX !== undefined) {
      // Ease-in curve for accelerating suck effect
      const easeProgress = progress * progress * progress; // Cubic ease-in
      drawX = foodItem.startX + (foodItem.targetX - foodItem.startX) * easeProgress;
      drawY = foodItem.startY + (foodItem.targetY - foodItem.startY) * easeProgress;
    }

    // Shrink as it gets sucked in
    const scale = 1 - progress * 0.8; // Shrink to 20% of original size
    const alpha = 1 - progress * progress; // Fade out with ease
    const drawRadius = foodItem.radius * scale;

    // Vanish glow effect (trails behind as it moves)
    const glowAlpha = alpha * 0.4;
    if (glowAlpha > 0.05) {
      ctx.beginPath();
      ctx.arc(drawX, drawY, drawRadius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 255, 200, ${glowAlpha * 0.4})`;
      ctx.fill();
    }

    // Outer glow
    ctx.beginPath();
    ctx.arc(drawX, drawY, drawRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
    ctx.fill();

    // Main food circle
    ctx.beginPath();
    ctx.arc(drawX, drawY, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.fill();
  }

  // Draw death splat effects
  const currentTime = Date.now();
  deathEffects.forEach(effect => {
    const elapsed = currentTime - effect.startTime;
    const progress = elapsed / effect.duration;
    const alpha = 1 - progress; // Fade out

    // Dark red splat that expands and fades
    const splatRadius = effect.radius * (1 + progress * 0.5);

    ctx.beginPath();
    ctx.arc(effect.x, effect.y, splatRadius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(139, 0, 0, ${alpha * 0.7})`; // Dark red
    ctx.fill();

    // Add some splatter particles
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 / 8) * i;
      const dist = splatRadius * 0.7;
      const px = effect.x + Math.cos(angle) * dist;
      const py = effect.y + Math.sin(angle) * dist;
      const particleSize = effect.radius * 0.2;

      ctx.beginPath();
      ctx.arc(px, py, particleSize * (1 - progress * 0.5), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(139, 0, 0, ${alpha * 0.5})`;
      ctx.fill();
    }
  });

  // Draw NPCs
  Object.values(npcs).forEach(npc => {
    drawEntity(npc, false, true);
  });

  // Draw other players and their creatures
  Object.values(players).forEach(player => {
    // Debug: show creature count above player (temporary)
    if (player.creatures && player.creatures.length > 1) {
      const debugX = player.x;
      const debugY = player.y - 50;
      ctx.fillStyle = 'yellow';
      ctx.font = '14px Arial';
      ctx.fillText(`${player.creatures.length} creatures`, debugX - 30, debugY);
    }
    // If player has creatures array with data, draw from that (more accurate positions)
    if (player.creatures && player.creatures.length > 0) {
      // Initialize creature render cache if needed (for smooth interpolation)
      if (!player._creatureRenderCache) {
        player._creatureRenderCache = {};
      }

      player.creatures.forEach((creature, index) => {
        const creatureId = creature.id || `creature_${index}`;

        // Get or create cached render data for this creature
        let cached = player._creatureRenderCache[creatureId];
        if (!cached) {
          cached = {
            renderX: creature.x,
            renderY: creature.y,
            x: creature.x,
            y: creature.y,
            angle: creature.angle || 0,
            // Cache visual properties so they don't regenerate every frame
            wiggleOffset: Math.random() * Math.PI * 2,
            hairs: null, // Will be generated once in drawCell and cached here
            blobShape: null, // For bacteria
            cellTail: null, // For cells with Motor Tail
            tail: null // For tadpoles
          };
          player._creatureRenderCache[creatureId] = cached;
        }

        // Frame-rate independent smooth interpolation
        const targetFPS = 60;
        const posFactor = 1 - Math.pow(1 - 0.08, renderDeltaTime * targetFPS / 1000);
        const renderFactor = 1 - Math.pow(1 - 0.25, renderDeltaTime * targetFPS / 1000);
        const angleFactor = 1 - Math.pow(1 - 0.12, renderDeltaTime * targetFPS / 1000);

        cached.x += (creature.x - cached.x) * posFactor;
        cached.y += (creature.y - cached.y) * posFactor;
        cached.renderX += (cached.x - cached.renderX) * renderFactor;
        cached.renderY += (cached.y - cached.renderY) * renderFactor;

        // Smooth angle interpolation (handle wrap-around, frame-rate independent)
        let angleDiff = (creature.angle || 0) - cached.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        cached.angle += angleDiff * angleFactor;

        // Debug: Log cell angles (rate-limited)
        if (creature.type === 'cell') {
          if (!window._lastCellAngleLog || Date.now() - window._lastCellAngleLog > 2000) {
            console.log(`[CELL ANGLE] Player ${player.name}: creature.angle=${(creature.angle || 0).toFixed(3)}, cached.angle=${cached.angle.toFixed(3)}, diff=${angleDiff.toFixed(3)}`);
            window._lastCellAngleLog = Date.now();
          }
        }

        // Create a renderable creature object with all needed properties
        const renderCreature = {
          ...creature,
          x: cached.x,
          y: cached.y,
          renderX: cached.renderX,
          renderY: cached.renderY,
          color: player.color || '#4a5a6a',
          name: index === 0 ? player.name : null, // Only show name on primary creature
          // Ensure basic properties exist for rendering
          angle: cached.angle, // Use interpolated angle for smooth rotation
          radius: creature.radius || (creature.type === 'cell' ? 15 : (creature.type === 'bacteria' ? 6 : 8)),
          health: creature.health || 100,
          maxHealth: creature.maxHealth || creature.health || 100,
          lastHit: 0,
          lastAttack: 0,
          // Use cached visual properties to prevent regeneration every frame
          wiggleOffset: cached.wiggleOffset,
          hairs: cached.hairs,
          blobShape: cached.blobShape,
          cellTail: cached.cellTail,
          tail: cached.tail
        };
        drawEntity(renderCreature, false, false);

        // Store any newly generated visual properties back to cache
        if (renderCreature.hairs && !cached.hairs) {
          cached.hairs = renderCreature.hairs;
        }
        if (renderCreature.blobShape && !cached.blobShape) {
          cached.blobShape = renderCreature.blobShape;
        }
        if (renderCreature.cellTail && !cached.cellTail) {
          cached.cellTail = renderCreature.cellTail;
        }
        if (renderCreature.tail && !cached.tail) {
          cached.tail = renderCreature.tail;
        }
      });

      // Clean up old cached creatures that no longer exist
      const currentIds = new Set(player.creatures.map((c, i) => c.id || `creature_${i}`));
      for (let id in player._creatureRenderCache) {
        if (!currentIds.has(id)) {
          delete player._creatureRenderCache[id];
        }
      }
    } else {
      // Fallback: draw main player entity if no creatures array
      drawEntity(player, false, false);
    }
  });

  // Draw own tadpoles
  myTadpoles.forEach(tad => {
    const isSelected = selectedTadpoles.has(tad.id);
    drawEntity(tad, true, false, isSelected);

    // Highlight when in support selection mode
    if (waitingForSupportTarget) {
      const x = tad.renderX || tad.x;
      const y = tad.renderY || tad.y;

      if (tad.id === supportSourceId) {
        // Source creature - show it's waiting to select a target
        const pulseTime = Date.now() / 400;
        const pulseAlpha = 0.6 + Math.sin(pulseTime) * 0.2;

        ctx.strokeStyle = `rgba(255, 255, 0, ${pulseAlpha})`; // Consistent yellow
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, tad.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // Valid target - show it can be selected
        const pulseTime = Date.now() / 500;
        const pulseAlpha = 0.5 + Math.sin(pulseTime) * 0.3;

        ctx.strokeStyle = `rgba(100, 255, 100, ${pulseAlpha})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x, y, tad.radius + 8, 0, Math.PI * 2);
        ctx.stroke();

        // Draw inner glow
        ctx.strokeStyle = `rgba(100, 255, 100, ${pulseAlpha * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, tad.radius + 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });

  // Cursor around attack target
  if (attackTarget) {
    ctx.beginPath();
    ctx.arc(attackTarget.x, attackTarget.y, attackTarget.radius + 10, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Cursor at move target location (not food target, that's drawn with food)
  if (moveTarget && !moveTarget.isFoodTarget) {
    const cursorSize = 8;
    const cursorGap = 3;

    // Draw 4 corner brackets
    ctx.strokeStyle = 'rgba(100, 255, 100, 0.8)';
    ctx.lineWidth = 2;

    // Top-left
    ctx.beginPath();
    ctx.moveTo(moveTarget.x - cursorSize, moveTarget.y - cursorSize - cursorGap);
    ctx.lineTo(moveTarget.x - cursorSize, moveTarget.y - cursorSize);
    ctx.lineTo(moveTarget.x - cursorSize - cursorGap, moveTarget.y - cursorSize);
    ctx.stroke();

    // Top-right
    ctx.beginPath();
    ctx.moveTo(moveTarget.x + cursorSize, moveTarget.y - cursorSize - cursorGap);
    ctx.lineTo(moveTarget.x + cursorSize, moveTarget.y - cursorSize);
    ctx.lineTo(moveTarget.x + cursorSize + cursorGap, moveTarget.y - cursorSize);
    ctx.stroke();

    // Bottom-left
    ctx.beginPath();
    ctx.moveTo(moveTarget.x - cursorSize, moveTarget.y + cursorSize + cursorGap);
    ctx.lineTo(moveTarget.x - cursorSize, moveTarget.y + cursorSize);
    ctx.lineTo(moveTarget.x - cursorSize - cursorGap, moveTarget.y + cursorSize);
    ctx.stroke();

    // Bottom-right
    ctx.beginPath();
    ctx.moveTo(moveTarget.x + cursorSize, moveTarget.y + cursorSize + cursorGap);
    ctx.lineTo(moveTarget.x + cursorSize, moveTarget.y + cursorSize);
    ctx.lineTo(moveTarget.x + cursorSize + cursorGap, moveTarget.y + cursorSize);
    ctx.stroke();
  }

  // Draw damage texts
  drawDamageTexts();

  ctx.restore();

  // Draw soft vignette effect (screen-space overlay)
  drawVignette();

  // Draw minimap
  if (myTadpoles.length > 0) {
    drawMinimap();
  }
}

function drawVignette() {
  // Create radial gradient from center (transparent) to edges (dark)
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  // Use the diagonal distance to ensure vignette covers corners
  const radius = Math.sqrt(centerX * centerX + centerY * centerY);

  // Gradient from center to edges - start fading at 30% of radius
  const vignette = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.3, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0.21)');
  vignette.addColorStop(0.9, 'rgba(0, 0, 0, 0.56)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.84)');

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawEntity(entity, isMe, isNPC, isSelected = false) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Spawn animation for NPCs
  let spawnScale = 1;
  let spawnGlowAlpha = 0;
  const spawnDuration = 400; // 400ms spawn animation

  if (entity.spawnTime && isNPC) {
    const elapsed = Date.now() - entity.spawnTime;
    if (elapsed < spawnDuration) {
      const progress = elapsed / spawnDuration;
      // Pop effect: start at 0, overshoot to 1.3, settle to 1
      if (progress < 0.4) {
        spawnScale = (progress / 0.4) * 1.3;
      } else {
        const settleProgress = (progress - 0.4) / 0.6;
        spawnScale = 1.3 - 0.3 * settleProgress;
      }
      spawnGlowAlpha = (1 - progress) * 0.5;
    } else {
      // Animation complete, remove spawnTime
      delete entity.spawnTime;
    }
  }

  // Draw spawn glow effect
  if (spawnGlowAlpha > 0) {
    ctx.beginPath();
    ctx.arc(x, y, entity.radius * 3 * spawnScale, 0, Math.PI * 2);
    const glowColor = entity.type === 'cell'
      ? `rgba(100, 150, 220, ${spawnGlowAlpha * 0.4})`
      : `rgba(200, 100, 100, ${spawnGlowAlpha * 0.4})`;
    ctx.fillStyle = glowColor;
    ctx.fill();
  }

  // Apply spawn scale transform
  if (spawnScale !== 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(spawnScale, spawnScale);
    ctx.translate(-x, -y);
  }

  // Only initialize tail for tadpoles
  if (entity.type === 'tadpole' && !entity.tail) {
    initializeTadpole(entity);
  }

  if (entity.type === 'cell') {
    drawCell(entity, isMe, isSelected);
  } else if (entity.type === 'bacteria') {
    drawBacteria(entity, isMe, isSelected);
  } else {
    drawTadpole(entity, isMe, isNPC, isSelected);
  }

  // Restore transform if we applied spawn scale
  if (spawnScale !== 1) {
    ctx.restore();
  }

  // Draw health bar if damaged
  const maxHealth = entity.maxHealth || (isNPC ? NPC_MAX_HEALTH : MAX_HEALTH);
  if (entity.health < maxHealth) {
    const barWidth = entity.radius * 2;
    const barHeight = 4;
    const barY = isNPC ? (y - entity.radius - 12) : (y + entity.radius + 8);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    ctx.fillStyle = entity.health > maxHealth * 0.3 ? '#28a745' : '#dc3545';
    ctx.fillRect(x - barWidth / 2, barY, barWidth * (entity.health / maxHealth), barHeight);
  }
}

function drawTadpole(entity, isMe, isNPC, isSelected) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Calculate upgrade visual effects
  const healthLvl = entity.healthLevel || 0;
  const strengthLvl = entity.strengthLevel || 0;
  const totalLvl = healthLvl + strengthLvl;

  // Size bonus: +4% per combined level (max +40% at level 10 total)
  const upgradeSizeBonus = 1 + (totalLvl * 0.04);

  // Glow intensity based on level (starts at level 2)
  const upgradeGlow = totalLvl >= 2 ? Math.min((totalLvl - 1) * 0.12, 0.6) : 0;

  // Strength visual: color saturation boost
  const strengthColorBoost = strengthLvl * 0.08; // More vibrant color

  // Birth animation - dramatic pop-out effect
  let birthScale = 1;
  let birthGlow = 0;
  let birthActive = false;
  if (entity.birthTime && entity.birthDuration) {
    const timeSinceBirth = Date.now() - entity.birthTime;
    if (timeSinceBirth < entity.birthDuration) {
      birthActive = true;
      const progress = timeSinceBirth / entity.birthDuration;

      // Pop effect: start at 0, overshoot to 1.3, settle to 1
      if (progress < 0.3) {
        // Quick expand phase (0 to 1.3)
        birthScale = (progress / 0.3) * 1.3;
      } else {
        // Settle phase (1.3 back to 1 with elastic ease)
        const settleProgress = (progress - 0.3) / 0.7;
        const elasticEase = 1 + Math.sin(settleProgress * Math.PI) * 0.3 * (1 - settleProgress);
        birthScale = elasticEase;
      }

      // Intense glow at start, fades quickly
      birthGlow = Math.pow(1 - progress, 2) * 1.2;
    } else {
      // Birth animation complete, clean up
      entity.birthTime = null;
      entity.birthDuration = null;
    }
  }

  // Apply birth effects if active
  if (birthActive) {
    ctx.save();
    ctx.translate(x, y);

    // Draw birth glow - expanding rings
    if (birthGlow > 0) {
      // Outer expanding ring
      const ringRadius = entity.radius * (2 + (1 - birthGlow) * 3);
      ctx.strokeStyle = `rgba(100, 200, 255, ${birthGlow * 0.5})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow
      const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius * 3);
      glowGradient.addColorStop(0, `rgba(255, 255, 255, ${birthGlow * 0.6})`);
      glowGradient.addColorStop(0.5, `rgba(100, 200, 255, ${birthGlow * 0.3})`);
      glowGradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(0, 0, entity.radius * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.scale(birthScale, birthScale);
    ctx.translate(-x, -y);
  }

  // Transformation animation (tadpole to cell) - morphing effect
  let transformProgress = 0;
  let transformGlow = 0;
  if (entity.isTransforming && entity.transformationStartTime) {
    const elapsed = Date.now() - entity.transformationStartTime;
    transformProgress = Math.min(elapsed / TRANSFORMATION_DURATION, 1);

    // Growing glow that intensifies toward the end
    transformGlow = 0.3 + transformProgress * 0.5;

    // Draw transformation glow
    ctx.save();
    ctx.translate(x, y);

    // Pulsing energy rings - more intense as transformation progresses
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      const ringPhase = (elapsed / 400 + i / ringCount) % 1;
      const ringRadius = entity.radius * (1.2 + ringPhase * 1.5);
      const ringAlpha = (1 - ringPhase) * transformGlow * 0.4;

      ctx.strokeStyle = `rgba(100, 200, 255, ${ringAlpha})`; // Consistent blue
      ctx.lineWidth = 2 + transformProgress * 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particle burst effect during transformation
    const particleCount = Math.floor(8 + transformProgress * 12);
    for (let i = 0; i < particleCount; i++) {
      const particleAngle = (elapsed / 1000 + i * Math.PI * 2 / particleCount) % (Math.PI * 2);
      const particleDist = entity.radius * (0.8 + Math.sin(elapsed / 200 + i) * 0.3);
      const px = Math.cos(particleAngle) * particleDist;
      const py = Math.sin(particleAngle) * particleDist;
      const particleSize = 2 + transformProgress * 2;

      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, ${0.3 + transformProgress * 0.4})`; // Consistent blue
      ctx.fill();
    }

    // Inner transformation glow
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius * 2);
    glowGradient.addColorStop(0, `rgba(100, 200, 255, ${transformGlow * 0.5})`); // Consistent blue
    glowGradient.addColorStop(0.5, `rgba(74, 95, 127, ${transformGlow * 0.3})`);
    glowGradient.addColorStop(1, 'rgba(74, 95, 127, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw tail (fade out during transformation)
  const tailOpacity = entity.isTransforming ? Math.max(0, 1 - transformProgress * 2) : 1; // Tail fades in first half
  if (entity.tail && entity.tail.length > 1 && tailOpacity > 0) {
    // Draw yellow outline first if selected (and 2+ creatures)
    if (isSelected && myTadpoles.length > 1) {
      ctx.beginPath();
      ctx.moveTo(entity.tail[0].x, entity.tail[0].y);

      for (let i = 1; i < entity.tail.length - 1; i++) {
        const xc = (entity.tail[i].x + entity.tail[i + 1].x) / 2;
        const yc = (entity.tail[i].y + entity.tail[i + 1].y) / 2;
        ctx.quadraticCurveTo(entity.tail[i].x, entity.tail[i].y, xc, yc);
      }

      ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Solid yellow
      ctx.lineWidth = entity.radius * 1.2 + 3; // Thin outline
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
    }

    // Draw main tail
    ctx.beginPath();
    ctx.moveTo(entity.tail[0].x, entity.tail[0].y);

    for (let i = 1; i < entity.tail.length - 1; i++) {
      const xc = (entity.tail[i].x + entity.tail[i + 1].x) / 2;
      const yc = (entity.tail[i].y + entity.tail[i + 1].y) / 2;
      ctx.quadraticCurveTo(entity.tail[i].x, entity.tail[i].y, xc, yc);
    }

    const gradient = ctx.createLinearGradient(
      entity.tail[0].x, entity.tail[0].y,
      entity.tail[entity.tail.length - 1].x, entity.tail[entity.tail.length - 1].y
    );
    gradient.addColorStop(0, hexToRGBA(entity.color, tailOpacity));
    gradient.addColorStop(1, hexToRGBA(entity.color, 0.8 * tailOpacity));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = entity.radius * 1.2 * (entity.isTransforming ? (1 - transformProgress * 0.5) : 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw upgrade glow aura (before body)
  if (upgradeGlow > 0 && isMe) {
    ctx.save();
    ctx.translate(x, y);

    // Outer glow - health gives blue tint, strength gives orange
    const glowRadius = entity.radius * upgradeSizeBonus * 2;
    const glowGradient = ctx.createRadialGradient(0, 0, entity.radius * upgradeSizeBonus, 0, 0, glowRadius);

    // Mix colors based on health vs strength
    const healthRatio = healthLvl / Math.max(totalLvl, 1);
    const r = Math.round(100 + (1 - healthRatio) * 155);
    const g = Math.round(180 + healthRatio * 40);
    const b = Math.round(255 * healthRatio + 100 * (1 - healthRatio));

    glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${upgradeGlow * 0.4})`);
    glowGradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${upgradeGlow * 0.15})`);
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fillStyle = glowGradient;
    ctx.fill();
    ctx.restore();
  }

  // Apply upgrade size to effective radius
  const effectiveRadius = entity.radius * upgradeSizeBonus;

  // Draw body
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(entity.angle);

  // Apply squish effect if attacking
  if (entity.attackSquish) {
    // Calculate squish direction relative to body angle
    const squishAngle = entity.attackSquishAngle - entity.angle;

    // Rotate to squish axis
    ctx.rotate(squishAngle);

    // Compress along attack axis, expand perpendicular (preserve volume)
    const compress = 1 - entity.attackSquish;
    const expand = 1 + entity.attackSquish * 0.8;
    ctx.scale(compress, expand);

    // Rotate back
    ctx.rotate(-squishAngle);
  }

  // Draw body - morphs from ellipse to hexagon during transformation
  ctx.beginPath();
  if (entity.isTransforming && transformProgress > 0) {
    // Morph from ellipse to hexagon
    const morphProgress = transformProgress;
    const points = 24; // Smooth interpolation

    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;

      // Ellipse point
      const ellipseX = Math.cos(angle) * effectiveRadius * 1.2;
      const ellipseY = Math.sin(angle) * effectiveRadius;

      // Hexagon point (find nearest hex vertex position)
      const hexAngle = Math.round(angle / (Math.PI / 3)) * (Math.PI / 3);
      const hexRadius = effectiveRadius * (1 + morphProgress * 0.3); // Grow slightly
      const hexX = Math.cos(hexAngle) * hexRadius;
      const hexY = Math.sin(hexAngle) * hexRadius;

      // Interpolate between ellipse and hexagon
      const px = ellipseX + (hexX - ellipseX) * morphProgress;
      const py = ellipseY + (hexY - ellipseY) * morphProgress;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
  } else {
    ctx.ellipse(0, 0, effectiveRadius * 1.2, effectiveRadius, 0, 0, Math.PI * 2);
  }

  // Enhanced color for strength upgrades, morph color during transformation
  let bodyColor = entity.color;
  if (entity.isTransforming && transformProgress > 0) {
    // Morph from tadpole color to cell color (#4a5f7f)
    const r1 = parseInt(entity.color.slice(1, 3), 16);
    const g1 = parseInt(entity.color.slice(3, 5), 16);
    const b1 = parseInt(entity.color.slice(5, 7), 16);
    const r2 = 74, g2 = 95, b2 = 127; // Cell color
    const r = Math.round(r1 + (r2 - r1) * transformProgress);
    const g = Math.round(g1 + (g2 - g1) * transformProgress);
    const b = Math.round(b1 + (b2 - b1) * transformProgress);
    bodyColor = `rgb(${r}, ${g}, ${b})`;
  } else if (strengthLvl > 0 && isMe) {
    // Parse hex color and boost saturation/brightness
    const r = parseInt(entity.color.slice(1, 3), 16);
    const g = parseInt(entity.color.slice(3, 5), 16);
    const b = parseInt(entity.color.slice(5, 7), 16);
    const boost = 1 + strengthColorBoost;
    const newR = Math.min(255, Math.round(r * boost));
    const newG = Math.min(255, Math.round(g * boost));
    const newB = Math.min(255, Math.round(b * boost));
    bodyColor = `rgb(${newR}, ${newG}, ${newB})`;
  }
  ctx.fillStyle = bodyColor;
  ctx.fill();

  // Draw food particles inside body
  const currentFood = entity.food || 0;
  const foodCapacity = entity.type === 'cell' ? CELL_FOOD_CAPACITY : getFoodCapacity(entity);
  if (currentFood > 0) {
    const foodRatio = currentFood / foodCapacity;
    const maxParticles = 8; // Max visible food particles
    const particleCount = Math.min(Math.ceil(currentFood / 2), maxParticles);

    // Use entity id to create consistent particle positions
    const seed = entity.id ? entity.id.charCodeAt(0) : 0;

    for (let i = 0; i < particleCount; i++) {
      // Deterministic pseudo-random positions based on entity and particle index
      const angle = ((seed + i * 137.5) % 360) * Math.PI / 180;
      const dist = effectiveRadius * (0.25 + ((seed + i * 73) % 100) / 200);
      const px = Math.cos(angle) * dist * 0.6 - effectiveRadius * 0.2;
      const py = Math.sin(angle) * dist * 0.5;

      // Constant particle size (doesn't scale with food amount)
      const particleSize = effectiveRadius * 0.07;

      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
    }
  }

  // Border - yellow for selected (only when controlling multiple creatures), white for own unselected
  if (isSelected && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Solid yellow for selected
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (isMe && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Eyes - fade out during transformation (cells don't have tadpole-style eyes)
  const eyeOpacity = entity.isTransforming ? Math.max(0, 1 - transformProgress * 1.5) : 1;

  if (eyeOpacity > 0) {
    const eyeOffset = effectiveRadius * 0.4;
    const eyeSize = effectiveRadius * 0.25; // Fixed size, no weird scaling

    // Level 3+: Draw eye whites first for more detailed eyes
    if (totalLvl >= 3 && isMe && !entity.isTransforming) {
      ctx.beginPath();
      ctx.arc(eyeOffset, -eyeOffset * 0.7, eyeSize * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * eyeOpacity})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeOffset, eyeOffset * 0.7, eyeSize * 1.3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.9 * eyeOpacity})`;
      ctx.fill();
    }

    // Main eye pupils
    ctx.beginPath();
    ctx.arc(eyeOffset, -eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
    const eyeColor = totalLvl >= 5 && isMe ? `rgba(60, 0, 120, ${0.95 * eyeOpacity})` : `rgba(0, 0, 0, ${0.8 * eyeOpacity})`;
    ctx.fillStyle = eyeColor;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(eyeOffset, eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
    ctx.fillStyle = eyeColor;
    ctx.fill();

    // Level 4+: Eye shine/glint
    if (totalLvl >= 4 && isMe && !entity.isTransforming) {
      const glintSize = eyeSize * 0.35;
      ctx.beginPath();
      ctx.arc(eyeOffset + eyeSize * 0.3, -eyeOffset * 0.7 - eyeSize * 0.3, glintSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * eyeOpacity})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeOffset + eyeSize * 0.3, eyeOffset * 0.7 - eyeSize * 0.3, glintSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * eyeOpacity})`;
      ctx.fill();
    }
  }

  ctx.restore();

  // Name (for players and idle players, not regular NPCs)
  if ((!isNPC || entity.isIdlePlayer) && entity.name) {
    // Dark green for own creatures, grey for idle players, light blue for other players
    if (isMe) {
      ctx.fillStyle = '#2d8659';
    } else if (entity.isIdlePlayer) {
      ctx.fillStyle = '#8a8a9a'; // Grey-purple for idle players
    } else {
      ctx.fillStyle = '#e8f0ff';
    }
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(entity.name, x, y - entity.radius - 15);
    ctx.fillText(entity.name, x, y - entity.radius - 15);
  }

  // Restore birth scaling context if it was saved
  if (birthActive) {
    ctx.restore();
  }
}

function drawCell(entity, isMe, isSelected) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Calculate upgrade visual effects
  const healthLvl = entity.healthLevel || 0;
  const strengthLvl = entity.strengthLevel || 0;
  const totalLvl = healthLvl + strengthLvl;

  // Size bonus: +4% per combined level (max +40% at level 10 total) - matches tadpole
  const upgradeSizeBonus = 1 + (totalLvl * 0.04);

  // Glow intensity based on level (starts at level 2) - matches tadpole
  const upgradeGlow = totalLvl >= 2 ? Math.min((totalLvl - 1) * 0.12, 0.6) : 0;

  // Hair density bonus: more hairs at higher levels
  const hairDensityBonus = Math.floor(totalLvl * 0.5); // +0.5 hairs per edge per level

  // Reinitialize hairs if upgrade level changed (to add more hairs)
  if (entity.lastUpgradeLevel !== totalLvl) {
    entity.hairs = null;
    entity.hairDensityBonus = hairDensityBonus;
    entity.lastUpgradeLevel = totalLvl;
  }

  // Initialize hairs if not present - aligned with hexagon edges (irregular)
  if (!entity.hairs) {
    entity.hairs = [];

    for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
      // Random number of hairs per edge (4-10 hairs) + upgrade bonus
      const baseHairs = Math.floor(4 + Math.random() * 7);
      const hairsPerEdge = baseHairs + (entity.hairDensityBonus || 0);

      // Get the two vertices of this edge
      const angle1 = (Math.PI / 3) * edgeIndex;
      const angle2 = (Math.PI / 3) * (edgeIndex + 1);

      const v1x = Math.cos(angle1) * entity.radius;
      const v1y = Math.sin(angle1) * entity.radius;
      const v2x = Math.cos(angle2) * entity.radius;
      const v2y = Math.sin(angle2) * entity.radius;

      // Distribute hairs along this edge with irregular spacing
      for (let i = 0; i < hairsPerEdge; i++) {
        // Irregular spacing - add randomness to position
        const baseT = (i + 1) / (hairsPerEdge + 1);
        const randomOffset = (Math.random() - 0.5) * 0.15; // +/- 15% variation
        const t = Math.max(0.1, Math.min(0.9, baseT + randomOffset)); // Keep within bounds

        const baseX = v1x + (v2x - v1x) * t;
        const baseY = v1y + (v2y - v1y) * t;

        // Calculate outward direction from center (0,0) to this point on the edge
        const outwardAngle = Math.atan2(baseY, baseX);

        // Hair lengths (1-4 pixels) + strength bonus - 50% smaller
        const strengthBonus = (entity.strengthLevel || 0) * 0.4; // +0.4 length per strength level
        const length = 1 + Math.random() * 3 + strengthBonus;

        entity.hairs.push({
          baseX: baseX,
          baseY: baseY,
          baseAngle: outwardAngle, // Points outward from center
          offsetAngle: 0,
          length: length,
          phase: Math.random() * Math.PI * 2,
          segmentIndex: i // Track position along edge for wave effect
        });
      }
    }
  }

  // Update hair movement based on velocity, time, and global waves
  const time = Date.now() / 1000;
  const speed = Math.sqrt(entity.vx * entity.vx + entity.vy * entity.vy);

  // Calculate velocity direction (direction of movement)
  const velocityAngle = Math.atan2(entity.vy, entity.vx);

  entity.hairs.forEach(hair => {
    // Swimming/rowing animation - hairs push against the water to propel the cell
    // Create a coordinated rowing motion that propels the cell in the direction of movement

    // Rowing cycle: each hair goes through power stroke (push back) and recovery stroke (return forward)
    const rowingSpeed = 4; // Speed of rowing cycle
    const rowPhase = time * rowingSpeed + hair.phase; // Phase for this specific hair

    // Calculate angle relative to movement direction
    const angleToVelocity = hair.baseAngle - velocityAngle;

    // Hairs on the "back" side (opposite to movement) row harder to push forward
    const relativeAngle = ((angleToVelocity + Math.PI) % (Math.PI * 2)) - Math.PI; // Normalize to -π to π
    const isBackSide = Math.abs(relativeAngle) > Math.PI / 2; // Back half of cell

    // Rowing motion: sine wave creates the stroke pattern
    // Negative = pushing backward (power stroke), Positive = returning forward (recovery)
    const rowStroke = Math.sin(rowPhase) * (isBackSide ? 1.5 : 0.8);

    // The rowing direction should be perpendicular to the hair's outward angle
    // This creates a tangential pushing motion
    const tangentAngle = hair.baseAngle + Math.PI / 2; // Perpendicular to outward direction

    // Project the rowing motion onto the direction that opposes movement
    // Hairs push in a direction that propels the cell forward
    const pushDirection = velocityAngle + Math.PI; // Opposite to velocity
    const alignmentWithPush = Math.cos(tangentAngle - pushDirection);

    // Final rowing offset: hairs sweep back and forth in rowing motion
    const rowingInfluence = rowStroke * alignmentWithPush * 0.6;

    // Add subtle wave for idle floating when not moving
    const idleFloat = Math.sin(time * 1.5 + hair.phase) * 0.15;

    // Blend between rowing and idle based on speed
    const speedFactor = Math.min(speed * 15, 1); // Normalize speed to 0-1
    hair.offsetAngle = speedFactor * rowingInfluence + (1 - speedFactor) * idleFloat;
  });

  // Add swimming animation - gentle rocking/pulsing motion
  const swimPhase = time * 2 + (entity.wiggleOffset || 0);
  const swimAngle = Math.sin(swimPhase) * 0.08; // Gentle rotation
  const swimPulse = Math.sin(swimPhase * 1.5) * 0.03; // Slight pulsing

  // Draw cell tail (if has Motor Tail upgrade - speed level 2+)
  if (entity.hasCellTail && entity.cellTail && entity.cellTail.length > 1) {
    // Tail is always at the back of the body (fixed corner, body rotates)
    const tailAngle = (entity.angle || 0) + Math.PI;
    const baseX = x + Math.cos(tailAngle) * entity.radius * 0.8;
    const baseY = y + Math.sin(tailAngle) * entity.radius * 0.8;

    // Draw the tail
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);

    for (let i = 0; i < entity.cellTail.length - 1; i++) {
      const xc = (entity.cellTail[i].x + entity.cellTail[i + 1].x) / 2;
      const yc = (entity.cellTail[i].y + entity.cellTail[i + 1].y) / 2;
      ctx.quadraticCurveTo(entity.cellTail[i].x, entity.cellTail[i].y, xc, yc);
    }

    // Create gradient for tail - white color at 100% opacity
    const lastSeg = entity.cellTail[entity.cellTail.length - 1];
    const gradient = ctx.createLinearGradient(baseX, baseY, lastSeg.x, lastSeg.y);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(0.5, 'rgba(255, 255, 255, 1.0)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.7)');

    ctx.strokeStyle = gradient;
    ctx.lineWidth = entity.radius * 0.4; // Thinner tail for cell
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw upgrade glow aura (before main cell) - matches tadpole glow style
  if (upgradeGlow > 0 && isMe) {
    ctx.save();
    ctx.translate(x, y);
    const glowRadius = entity.radius * upgradeSizeBonus * 2; // Match tadpole radius

    // Mix colors based on health vs strength (same as tadpole)
    const healthRatio = healthLvl / Math.max(totalLvl, 1);
    const r = Math.round(100 + (1 - healthRatio) * 155);
    const g = Math.round(180 + healthRatio * 40);
    const b = Math.round(255 * healthRatio + 100 * (1 - healthRatio));

    const gradient = ctx.createRadialGradient(0, 0, entity.radius * upgradeSizeBonus, 0, 0, glowRadius);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${upgradeGlow * 0.4})`);
    gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${upgradeGlow * 0.15})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(entity.angle + swimAngle);
  ctx.scale((1 + swimPulse) * upgradeSizeBonus, (1 + swimPulse) * upgradeSizeBonus);

  // Apply squish effect if attacking (reduced for cells - they're more rigid)
  if (entity.attackSquish) {
    // Calculate squish direction relative to body angle
    const squishAngle = entity.attackSquishAngle - entity.angle;

    // Rotate to squish axis
    ctx.rotate(squishAngle);

    // Compress along attack axis, expand perpendicular (preserve volume)
    // Cells squish less (40% of normal squish)
    const reducedSquish = entity.attackSquish * 0.4;
    const compress = 1 - reducedSquish;
    const expand = 1 + reducedSquish * 0.8;
    ctx.scale(compress, expand);

    // Rotate back
    ctx.rotate(-squishAngle);
  }

  // Draw hexagon first (behind the hairs)
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = Math.cos(angle) * entity.radius;
    const py = Math.sin(angle) * entity.radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();

  ctx.fillStyle = entity.color;
  ctx.fill();

  // Red shade when sprinting to attack (gradient - most red in center)
  if (entity.isSprinting) {
    const redGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius);
    redGradient.addColorStop(0, 'rgba(200, 30, 30, 0.5)');
    redGradient.addColorStop(0.6, 'rgba(180, 40, 40, 0.25)');
    redGradient.addColorStop(1, 'rgba(150, 50, 50, 0)');
    ctx.fillStyle = redGradient;
    ctx.fill();
  }

  // Health upgrade: inner highlight glow
  if (healthLvl > 0 && isMe) {
    const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius * 0.9);
    innerGlow.addColorStop(0, `rgba(200, 255, 200, ${healthLvl * 0.08})`);
    innerGlow.addColorStop(1, 'rgba(200, 255, 200, 0)');
    ctx.fillStyle = innerGlow;
    ctx.fill();
  }

  // Draw food particles inside cell body
  const currentFood = entity.food || 0;
  if (currentFood > 0) {
    const foodRatio = currentFood / CELL_FOOD_CAPACITY;
    const maxParticles = 15; // Cells can show more particles
    const particleCount = Math.min(Math.ceil(currentFood / 3), maxParticles);

    // Use entity id to create consistent particle positions
    const seed = entity.id ? entity.id.charCodeAt(0) : 0;

    for (let i = 0; i < particleCount; i++) {
      // Deterministic pseudo-random positions based on entity and particle index
      const angle = ((seed + i * 137.5) % 360) * Math.PI / 180;
      const dist = entity.radius * (0.2 + ((seed + i * 73) % 100) / 200);
      const px = Math.cos(angle) * dist * 0.7;
      const py = Math.sin(angle) * dist * 0.7;

      // Constant particle size - matches tadpole visibility
      const particleSize = entity.radius * 0.07;

      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'; // Match tadpole opacity
      ctx.fill();
    }
  }

  // Border - yellow for selected (only if 2+ creatures), white for own unselected
  // Redraw hexagon path for border (previous path was overwritten by food particles)
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i;
    const px = Math.cos(angle) * entity.radius;
    const py = Math.sin(angle) * entity.radius;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.closePath();

  // Border - yellow for selected (only when controlling multiple creatures)
  if (isSelected && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Solid yellow for selected
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (isMe && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (!isMe) {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Draw hairs on top of the cell - aligned with hexagon edges
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'; // White, very visible
  ctx.lineWidth = 2; // Thicker for visibility at smaller size
  entity.hairs.forEach(hair => {
    const tipAngle = hair.baseAngle + hair.offsetAngle;
    const tipX = hair.baseX + Math.cos(tipAngle) * hair.length;
    const tipY = hair.baseY + Math.sin(tipAngle) * hair.length;

    ctx.beginPath();
    ctx.moveTo(hair.baseX, hair.baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
  });

  // Draw Protector symbol (iron cross) in center
  if (entity.hasProtector) {
    const symbolSize = entity.radius * 0.35;
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.9)'; // Iron gray
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Draw cross/shield symbol
    ctx.beginPath();
    ctx.moveTo(0, -symbolSize);
    ctx.lineTo(0, symbolSize);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-symbolSize * 0.7, 0);
    ctx.lineTo(symbolSize * 0.7, 0);
    ctx.stroke();

    // Small diamond outline
    ctx.beginPath();
    ctx.moveTo(0, -symbolSize * 0.5);
    ctx.lineTo(symbolSize * 0.35, 0);
    ctx.lineTo(0, symbolSize * 0.5);
    ctx.lineTo(-symbolSize * 0.35, 0);
    ctx.closePath();
    ctx.stroke();
  }

  // Draw Sword (spike on front of cell)
  if (entity.hasSword) {
    const swordLength = entity.radius * 0.8;
    const swordWidth = entity.radius * 0.15;

    // Sword points in facing direction (front of cell = angle 0 in local coords)
    ctx.fillStyle = 'rgba(200, 200, 200, 0.95)'; // Silver blade
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.9)'; // Dark edge
    ctx.lineWidth = 1;

    ctx.beginPath();
    // Blade triangle pointing forward
    ctx.moveTo(entity.radius + swordLength, 0); // Tip
    ctx.lineTo(entity.radius, -swordWidth);     // Base top
    ctx.lineTo(entity.radius, swordWidth);      // Base bottom
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hilt/guard at base
    ctx.fillStyle = 'rgba(139, 90, 43, 0.9)'; // Brown handle
    ctx.beginPath();
    ctx.arc(entity.radius, 0, swordWidth * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Draw split animation - cell stretches horizontally then separates
  if (entity.isSplitting && entity.splitStartTime) {
    const elapsed = Date.now() - entity.splitStartTime;
    const duration = 600;
    const progress = Math.min(elapsed / duration, 1);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(entity.angle); // Align with cell facing direction

    // Phase 1 (0-0.7): Cell stretches horizontally to ~2 cell widths
    // Phase 2 (0.7-1.0): Cells separate from each other
    const stretchPhaseEnd = 0.7;

    ctx.fillStyle = entity.color;

    if (progress < stretchPhaseEnd) {
      // Stretching phase - draw as elongated ellipse
      const stretchProgress = progress / stretchPhaseEnd;
      const stretchX = 1 + stretchProgress * 1.2; // Stretch to ~2.2x width
      const stretchY = 1 - stretchProgress * 0.3; // Slightly compress vertically

      ctx.beginPath();
      ctx.ellipse(0, 0, entity.radius * stretchX, entity.radius * stretchY, 0, 0, Math.PI * 2);
      ctx.fill();

      // Add pinch line forming in middle during late stretch
      if (stretchProgress > 0.5) {
        const pinchOpacity = (stretchProgress - 0.5) * 2;
        ctx.strokeStyle = `rgba(0, 0, 0, ${pinchOpacity * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -entity.radius * stretchY * 0.8);
        ctx.lineTo(0, entity.radius * stretchY * 0.8);
        ctx.stroke();
      }
    } else {
      // Separation phase - draw two cells moving apart
      const sepProgress = (progress - stretchPhaseEnd) / (1 - stretchPhaseEnd);
      const separation = sepProgress * entity.radius * 1.5;

      // Left cell (original) stays in place
      ctx.beginPath();
      ctx.arc(-separation, 0, entity.radius, 0, Math.PI * 2);
      ctx.fill();

      // Right cell (new) moves away
      ctx.beginPath();
      ctx.arc(entity.radius * 1.2 + separation, 0, entity.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle glow effect
    const glowIntensity = 0.2 + Math.sin(progress * Math.PI * 4) * 0.1;
    ctx.strokeStyle = `rgba(100, 200, 255, ${glowIntensity * (1 - progress * 0.5)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius * (1.5 + progress * 0.5), 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // Draw bubble shield if active
  if (entity.bubbleShieldActive && entity.hasProtector) {
    const shieldRadius = entity.radius * 12; // Large protection area
    const pulseTime = Date.now() / 1000;

    ctx.save();
    ctx.translate(x, y);

    // Check if this is an inactive/idle player shield
    if (entity.isIdlePlayer) {
      // DORMANT SHIELD - Hexagonal crystalline pattern in silver/grey
      const slowPulse = Math.sin(pulseTime * 0.5) * 0.05 + 1; // Slower, subtler pulse
      const shimmer = Math.sin(pulseTime * 1.5) * 0.15 + 0.85;

      // Draw hexagonal shield border
      const hexRadius = shieldRadius * slowPulse;
      ctx.strokeStyle = `rgba(180, 190, 210, ${0.6 * shimmer})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        const hx = Math.cos(angle) * hexRadius;
        const hy = Math.sin(angle) * hexRadius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();

      // Inner hexagonal glow
      const innerHexRadius = hexRadius * 0.85;
      ctx.strokeStyle = `rgba(200, 210, 230, ${0.3 * shimmer})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        const hx = Math.cos(angle) * innerHexRadius;
        const hy = Math.sin(angle) * innerHexRadius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.stroke();

      // Crystalline connecting lines from center to vertices
      ctx.strokeStyle = `rgba(150, 170, 200, ${0.2 * shimmer})`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * hexRadius, Math.sin(angle) * hexRadius);
        ctx.stroke();
      }

      // Subtle inner fill gradient
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, hexRadius);
      gradient.addColorStop(0, 'rgba(180, 190, 210, 0.03)');
      gradient.addColorStop(0.5, 'rgba(150, 170, 200, 0.05)');
      gradient.addColorStop(1, 'rgba(120, 140, 180, 0.1)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6;
        const hx = Math.cos(angle) * hexRadius;
        const hy = Math.sin(angle) * hexRadius;
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.fill();

      // Floating rune symbols at vertices (slowly rotating)
      const runeRotation = pulseTime * 0.2;
      ctx.font = '10px Arial';
      ctx.fillStyle = `rgba(200, 210, 230, ${0.4 * shimmer})`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const runeSymbols = ['\u25C6', '\u25C7', '\u25C6', '\u25C7', '\u25C6', '\u25C7']; // Diamond symbols
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI / 3) - Math.PI / 6 + runeRotation;
        const rx = Math.cos(angle) * (hexRadius * 1.1);
        const ry = Math.sin(angle) * (hexRadius * 1.1);
        ctx.fillText(runeSymbols[i], rx, ry);
      }

    } else {
      // ACTIVE SHIELD - Original blue bubble effect
      const pulse = Math.sin(pulseTime * 2) * 0.1 + 1;

      // Outer shield ring
      ctx.strokeStyle = `rgba(100, 200, 255, ${0.4 + Math.sin(pulseTime * 3) * 0.1})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, shieldRadius * pulse, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow
      const gradient = ctx.createRadialGradient(0, 0, shieldRadius * 0.8, 0, 0, shieldRadius);
      gradient.addColorStop(0, 'rgba(100, 200, 255, 0)');
      gradient.addColorStop(0.7, 'rgba(100, 200, 255, 0.05)');
      gradient.addColorStop(1, 'rgba(100, 200, 255, 0.15)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Draw hibernation visuals
  if (entity.isHibernating && entity.hibernationStartTime) {
    const elapsed = Date.now() - entity.hibernationStartTime;
    const progress = Math.min(elapsed / HIBERNATION_DURATION, 1);

    // Draw circular loading bar above the cell
    const loadingBarY = y - entity.radius - 50;
    const loadingBarRadius = 20;

    // Background circle
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, loadingBarY, loadingBarRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress arc
    ctx.strokeStyle = 'rgba(100, 200, 255, 0.9)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, loadingBarY, loadingBarRadius, -Math.PI / 2, -Math.PI / 2 + (progress * Math.PI * 2));
    ctx.stroke();

    // Draw growing organism inside cell
    const organismSize = entity.radius * 0.4 * progress; // Grows from 0 to 40% of cell size

    if (organismSize > 0) {
      ctx.save();
      ctx.translate(x, y);

      // Draw small tadpole shape
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      ctx.ellipse(0, 0, organismSize * 1.2, organismSize, 0, 0, Math.PI * 2);
      ctx.fill();

      // Tiny eyes - consistent with tadpole eye opacity
      if (organismSize > 3) {
        const eyeOffset = organismSize * 0.3;
        const eyeSize = organismSize * 0.15;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)'; // Match tadpole eye opacity
        ctx.beginPath();
        ctx.arc(eyeOffset, -eyeOffset * 0.5, eyeSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(eyeOffset, eyeOffset * 0.5, eyeSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // Unfurling tail - starts curled, slowly straightens
      if (organismSize > 2) {
        const tailLength = organismSize * 2.5 * progress; // Grows with progress
        const tailSegments = 8;
        const curlAmount = (1 - progress) * Math.PI * 1.5; // Starts very curled, straightens out

        // Tail thickness grows quickly early (ease-out curve)
        const thicknessProgress = 1 - Math.pow(1 - progress, 2); // Faster early growth
        const tailThickness = Math.max(1.5, organismSize * 0.25 * (0.5 + thicknessProgress * 0.5));

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = tailThickness;
        ctx.lineCap = 'round';
        ctx.beginPath();

        // Start from back of body
        const startX = -organismSize * 0.8;
        const startY = 0;
        ctx.moveTo(startX, startY);

        // Draw curved tail segments
        let prevX = startX;
        let prevY = startY;
        for (let i = 1; i <= tailSegments; i++) {
          const t = i / tailSegments;
          const segmentLength = (tailLength / tailSegments) * (1 - t * 0.3); // Taper

          // Curl decreases along the tail and as progress increases
          const segmentCurl = curlAmount * t * (1 - progress * 0.5);
          const baseAngle = Math.PI + segmentCurl; // Points backward, curls down

          const nextX = prevX + Math.cos(baseAngle + Math.sin(Date.now() / 300 + i) * 0.1 * progress) * segmentLength;
          const nextY = prevY + Math.sin(baseAngle + Math.sin(Date.now() / 300 + i) * 0.1 * progress) * segmentLength;

          ctx.lineTo(nextX, nextY);
          prevX = nextX;
          prevY = nextY;
        }
        ctx.stroke();

        // Tail gets thinner towards tip - draw again with gradient effect
        ctx.lineWidth = Math.max(0.5, tailThickness * 0.5);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // Birth burst effect (when cell just gave birth)
  if (entity.birthBurstTime) {
    const burstElapsed = Date.now() - entity.birthBurstTime;
    const burstDuration = 500; // 0.5 second burst

    if (burstElapsed < burstDuration) {
      const burstProgress = burstElapsed / burstDuration;
      const burstRadius = entity.radius * (1 + burstProgress * 2);
      const burstAlpha = (1 - burstProgress) * 0.6;

      // Expanding ring
      ctx.strokeStyle = `rgba(100, 200, 255, ${burstAlpha})`;
      ctx.lineWidth = 4 * (1 - burstProgress);
      ctx.beginPath();
      ctx.arc(x, y, burstRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Inner glow
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, entity.radius * 1.5);
      glowGradient.addColorStop(0, `rgba(255, 255, 255, ${burstAlpha * 0.5})`);
      glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, entity.radius * 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      entity.birthBurstTime = null;
    }
  }

  // Name (for players and idle players)
  if (entity.name) {
    // Dark green for own creatures, grey for idle players, light blue for other players
    if (isMe) {
      ctx.fillStyle = '#2d8659';
    } else if (entity.isIdlePlayer) {
      ctx.fillStyle = '#8a8a9a'; // Grey-purple for idle players
    } else {
      ctx.fillStyle = '#e8f0ff';
    }
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(entity.name, x, y - entity.radius - 25);
    ctx.fillText(entity.name, x, y - entity.radius - 25);
  }
}

// Generate irregular blob shape for bacteria
function generateBlobShape() {
  const points = [];
  const numPoints = 8 + Math.floor(Math.random() * 5); // 8-12 points for irregular shape
  const baseRadius = 1; // Normalized, will be scaled by actual radius when drawing

  // Generate random offsets for each point to create irregular blob
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    // Variation between 0.6 and 1.2 of base radius for irregular shape
    const radiusVariation = 0.6 + Math.random() * 0.6;

    // Add some "bulges" for kidney-like or amoeba shapes
    const bulgeChance = Math.random();
    let bulge = 1;
    if (bulgeChance > 0.7) {
      bulge = 1.2 + Math.random() * 0.3; // Occasional bulge
    } else if (bulgeChance < 0.2) {
      bulge = 0.7 + Math.random() * 0.2; // Occasional indent
    }

    points.push({
      angle: angle,
      radius: baseRadius * radiusVariation * bulge,
      // Add small random offset to angle for more irregularity
      angleOffset: (Math.random() - 0.5) * 0.3
    });
  }

  return points;
}

// Draw bacteria creature
function drawBacteria(entity, isMe, isSelected) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Initialize blob shape if not present
  if (!entity.blobShape) {
    entity.blobShape = generateBlobShape();
  }

  const time = Date.now() / 1000;

  // Subtle wobble animation
  const wobbleSpeed = 1.5;
  const wobbleAmount = 0.03;
  const wobble = Math.sin(time * wobbleSpeed + (entity.wiggleOffset || 0)) * wobbleAmount;

  // Check if this is an idle NPC (grey coloring)
  const isIdleNPC = entity.isIdlePlayer || false;

  // Subtle color pulsing for "alive" look
  const colorPulse = Math.sin(time * 2) * 10;
  let baseGreen, baseColor;
  if (isIdleNPC) {
    // Grey coloring for idle NPCs
    const greyBase = 140 + colorPulse * 0.3;
    baseGreen = greyBase;
    baseColor = `rgb(${Math.floor(greyBase)}, ${Math.floor(greyBase)}, ${Math.floor(greyBase)})`; // Grey
  } else {
    baseGreen = 180 + colorPulse;
    baseColor = `rgb(127, ${Math.floor(baseGreen)}, 127)`; // Light green hue
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((entity.angle || 0) + wobble);

  // Draw main blob body
  ctx.beginPath();
  const points = entity.blobShape;

  // Use bezier curves for smooth blob shape with slow shape-shifting animation
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const nextP = points[(i + 1) % points.length];

    // Animated radius and angle offset - each point shifts slowly at different rates
    const animatedRadius = p.radius + Math.sin(time * 0.3 + i * 1.2) * 0.08 + Math.sin(time * 0.5 + i * 0.7) * 0.05;
    const animatedAngleOffset = p.angleOffset + Math.sin(time * 0.4 + i * 0.9) * 0.1;

    const nextAnimatedRadius = nextP.radius + Math.sin(time * 0.3 + (i + 1) * 1.2) * 0.08 + Math.sin(time * 0.5 + (i + 1) * 0.7) * 0.05;
    const nextAnimatedAngleOffset = nextP.angleOffset + Math.sin(time * 0.4 + (i + 1) * 0.9) * 0.1;

    const px = Math.cos(p.angle + animatedAngleOffset) * animatedRadius * entity.radius;
    const py = Math.sin(p.angle + animatedAngleOffset) * animatedRadius * entity.radius;

    const npx = Math.cos(nextP.angle + nextAnimatedAngleOffset) * nextAnimatedRadius * entity.radius;
    const npy = Math.sin(nextP.angle + nextAnimatedAngleOffset) * nextAnimatedRadius * entity.radius;

    // Control points for smooth curve
    const cpx = (px + npx) / 2;
    const cpy = (py + npy) / 2;

    if (i === 0) {
      ctx.moveTo(px, py);
    }

    ctx.quadraticCurveTo(px, py, cpx, cpy);
  }
  ctx.closePath();

  // Fill with gradient for depth
  const gradient = ctx.createRadialGradient(
    -entity.radius * 0.2, -entity.radius * 0.2, 0,
    0, 0, entity.radius * 1.2
  );
  if (isIdleNPC) {
    // Grey gradient for idle NPCs
    const lightGrey = Math.floor(baseGreen + 20);
    const darkGrey = Math.floor(baseGreen - 30);
    gradient.addColorStop(0, `rgba(${lightGrey}, ${lightGrey}, ${lightGrey}, 1)`);
    gradient.addColorStop(0.5, baseColor);
    gradient.addColorStop(1, `rgba(${darkGrey}, ${darkGrey}, ${darkGrey}, 1)`);
  } else {
    gradient.addColorStop(0, `rgba(150, ${Math.floor(baseGreen + 20)}, 150, 1)`); // Lighter center
    gradient.addColorStop(0.5, baseColor);
    gradient.addColorStop(1, `rgba(100, ${Math.floor(baseGreen - 30)}, 100, 1)`); // Darker edge
  }

  ctx.fillStyle = gradient;
  ctx.fill();

  // Subtle inner membrane effect
  if (isIdleNPC) {
    const strokeGrey = Math.floor(baseGreen - 50);
    ctx.strokeStyle = `rgba(${strokeGrey}, ${strokeGrey}, ${strokeGrey}, 0.5)`;
  } else {
    ctx.strokeStyle = `rgba(80, ${Math.floor(baseGreen - 50)}, 80, 0.5)`;
  }
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw small organelle-like dots inside for bacteria texture (use deterministic positions)
  if (!entity.organelles) {
    entity.organelles = [];
    const numOrganelles = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numOrganelles; i++) {
      entity.organelles.push({
        x: (Math.random() - 0.5) * 0.8,
        y: (Math.random() - 0.5) * 0.8,
        size: 0.1 + Math.random() * 0.1
      });
    }
  }
  if (isIdleNPC) {
    const orgGrey = Math.floor(baseGreen - 20);
    ctx.fillStyle = `rgba(${orgGrey}, ${orgGrey}, ${orgGrey}, 0.4)`;
  } else {
    ctx.fillStyle = `rgba(100, ${Math.floor(baseGreen - 20)}, 100, 0.4)`;
  }
  for (let org of entity.organelles) {
    // Organelles drift slowly inside the bacteria
    const driftX = Math.sin(time * 0.2 + org.x * 10) * entity.radius * 0.05;
    const driftY = Math.cos(time * 0.25 + org.y * 10) * entity.radius * 0.05;
    ctx.beginPath();
    ctx.arc(org.x * entity.radius + driftX, org.y * entity.radius + driftY, org.size * entity.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw farming indicator if farming
  if (entity.isFarming) {
    // Glowing aura while farming
    const farmPulse = Math.sin(time * 3) * 0.2 + 0.8;
    const farmGlow = ctx.createRadialGradient(0, 0, entity.radius, 0, 0, entity.radius * 2);
    farmGlow.addColorStop(0, `rgba(100, 255, 100, ${0.3 * farmPulse})`);
    farmGlow.addColorStop(0.5, `rgba(100, 255, 100, ${0.15 * farmPulse})`);
    farmGlow.addColorStop(1, 'rgba(100, 255, 100, 0)');
    ctx.fillStyle = farmGlow;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Small sparkles around bacteria
    const numSparkles = 5;
    for (let i = 0; i < numSparkles; i++) {
      const sparkleAngle = (time * 2 + i * Math.PI * 2 / numSparkles) % (Math.PI * 2);
      const sparkleRadius = entity.radius * 1.3;
      const sx = Math.cos(sparkleAngle) * sparkleRadius;
      const sy = Math.sin(sparkleAngle) * sparkleRadius;
      const sparkleSize = 2 + Math.sin(time * 5 + i) * 1;

      ctx.fillStyle = `rgba(150, 255, 150, ${0.6 * farmPulse})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sparkleSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // Selection border
  if (isSelected && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Yellow for selected
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, entity.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (isMe && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, entity.radius + 2, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Name display
  if (entity.name) {
    if (isMe) {
      ctx.fillStyle = '#2d8659';
    } else if (entity.isIdlePlayer) {
      ctx.fillStyle = '#8a8a9a';
    } else {
      ctx.fillStyle = '#e8f0ff';
    }
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(entity.name, x, y - entity.radius - 20);
    ctx.fillText(entity.name, x, y - entity.radius - 20);
  }

  // Draw food capacity bar
  if (isMe || entity.isIdlePlayer) {
    const foodCapacity = BACTERIA_FOOD_CAPACITY;
    const currentFood = entity.food || 0;
    const foodPercentage = currentFood / foodCapacity;

    const barWidth = entity.radius * 1.5;
    const barHeight = 4;
    const barY = y + entity.radius + 8;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(x - barWidth / 2, barY, barWidth, barHeight);

    // Food fill (green)
    ctx.fillStyle = `rgba(100, 200, 100, 0.9)`;
    ctx.fillRect(x - barWidth / 2, barY, barWidth * foodPercentage, barHeight);

    // Border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - barWidth / 2, barY, barWidth, barHeight);
  }
}

// Update explored regions based on creature positions
function updateExploredRegions() {
  myTadpoles.forEach(tad => {
    // Mark current region and nearby regions as explored (vision radius)
    const visionRadius = 1; // How many regions around the creature are visible
    const rx = Math.floor(tad.x / FOG_REGION_SIZE);
    const ry = Math.floor(tad.y / FOG_REGION_SIZE);

    for (let dx = -visionRadius; dx <= visionRadius; dx++) {
      for (let dy = -visionRadius; dy <= visionRadius; dy++) {
        exploredRegions.add(`${rx + dx},${ry + dy}`);
      }
    }
  });
}

// Check if a world position is in an explored region
function isExplored(worldX, worldY) {
  const rx = Math.floor(worldX / FOG_REGION_SIZE);
  const ry = Math.floor(worldY / FOG_REGION_SIZE);
  return exploredRegions.has(`${rx},${ry}`);
}

function drawMinimap() {
  const minimapSize = 150;
  const minimapPadding = 20;
  const minimapX = minimapPadding;
  const minimapY = minimapPadding;

  // Center minimap around player's position
  const playerX = myTadpoles.length > 0 ? myTadpoles[0].x : 0;
  const playerY = myTadpoles.length > 0 ? myTadpoles[0].y : 0;

  // Dynamic zoom: minimap zooms out as player moves further from origin
  // Base size is 2000, but expands to show player's distance from origin
  const distFromOrigin = Math.sqrt(playerX * playerX + playerY * playerY);
  const minWorldSize = 2000;
  const padding = 500; // Extra space around player position
  const minimapWorldSize = Math.max(minWorldSize, (distFromOrigin + padding) * 2);
  const scale = minimapSize / minimapWorldSize;

  // Background - darker for unexplored feel
  ctx.fillStyle = 'rgba(5, 8, 15, 0.9)';
  ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);

  // Set up clipping region to ensure nothing draws outside minimap
  ctx.save();
  ctx.beginPath();
  ctx.rect(minimapX, minimapY, minimapSize, minimapSize);
  ctx.clip();

  // Draw explored regions as lighter areas
  const regionScaleSize = FOG_REGION_SIZE * scale;
  ctx.fillStyle = 'rgba(20, 28, 45, 0.8)';
  exploredRegions.forEach(key => {
    const [rx, ry] = key.split(',').map(Number);
    const regionWorldX = rx * FOG_REGION_SIZE;
    const regionWorldY = ry * FOG_REGION_SIZE;
    // Position relative to player (player is at center of minimap)
    const regionMapX = minimapX + minimapSize / 2 + (regionWorldX - playerX) * scale;
    const regionMapY = minimapY + minimapSize / 2 + (regionWorldY - playerY) * scale;

    ctx.fillRect(regionMapX, regionMapY, regionScaleSize, regionScaleSize);
  });

  // Draw world origin marker (0,0) if visible
  const originMapX = minimapX + minimapSize / 2 + (0 - playerX) * scale;
  const originMapY = minimapY + minimapSize / 2 + (0 - playerY) * scale;
  if (originMapX >= minimapX && originMapX <= minimapX + minimapSize &&
      originMapY >= minimapY && originMapY <= minimapY + minimapSize &&
      isExplored(0, 0)) {
    ctx.fillStyle = 'rgba(150, 180, 220, 0.5)';
    ctx.beginPath();
    ctx.arc(originMapX, originMapY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw entities on minimap (only if in explored region)
  const drawOnMinimap = (entity) => {
    // Fog of war check - only show entities in explored regions
    if (!isExplored(entity.x, entity.y)) return;

    // Player-centered coordinates
    let mapX = minimapX + minimapSize / 2 + (entity.x - playerX) * scale;
    let mapY = minimapY + minimapSize / 2 + (entity.y - playerY) * scale;

    // Skip if outside minimap bounds
    if (mapX < minimapX || mapX > minimapX + minimapSize ||
        mapY < minimapY || mapY > minimapY + minimapSize) return;

    if (entity.type === 'cell') {
      // Draw hexagon
      ctx.save();
      ctx.translate(mapX, mapY);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = Math.cos(angle) * 3;
        const py = Math.sin(angle) * 3;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 100, 100, 0.9)'; // Red for enemy cells
      ctx.fill();
      ctx.restore();
    } else if (entity.type === 'bacteria') {
      // Draw irregular blob for bacteria
      ctx.fillStyle = 'rgba(150, 255, 150, 0.9)'; // Light green for bacteria
      ctx.beginPath();
      ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(mapX, mapY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Object.values(npcs).forEach(drawOnMinimap);
  Object.values(players).forEach(drawOnMinimap);

  // Always draw own tadpoles at center (green/blue)
  myTadpoles.forEach((tad, index) => {
    // First tadpole is always at center, others relative to it
    let mapX, mapY;
    if (index === 0) {
      mapX = minimapX + minimapSize / 2;
      mapY = minimapY + minimapSize / 2;
    } else {
      mapX = minimapX + minimapSize / 2 + (tad.x - playerX) * scale;
      mapY = minimapY + minimapSize / 2 + (tad.y - playerY) * scale;
    }

    if (tad.type === 'cell') {
      ctx.save();
      ctx.translate(mapX, mapY);
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const px = Math.cos(angle) * 4;
        const py = Math.sin(angle) * 4;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(100, 255, 100, 1)';
      ctx.fill();
      ctx.restore();
    } else if (tad.type === 'bacteria') {
      // Own bacteria - bright green blob
      ctx.fillStyle = 'rgba(100, 255, 150, 1)';
      ctx.beginPath();
      ctx.arc(mapX, mapY, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(100, 200, 255, 1)';
      ctx.beginPath();
      ctx.arc(mapX, mapY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  // Restore canvas state (removes clipping)
  ctx.restore();

  // Draw border on top (outside clipping region)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Fixed timestep game loop for frame-rate independent physics
const PHYSICS_FPS = 60;
const PHYSICS_TIMESTEP = 1000 / PHYSICS_FPS; // 16.67ms per physics step
let lastFrameTime = performance.now();
let lastRenderTime = performance.now();
let accumulatedTime = 0;
let renderDeltaTime = PHYSICS_TIMESTEP; // For frame-rate independent interpolation

function gameLoop() {
  const now = performance.now();
  const frameTime = now - lastFrameTime;
  lastFrameTime = now;

  // Track render delta time for frame-rate independent visual interpolation
  renderDeltaTime = now - lastRenderTime;
  lastRenderTime = now;

  // Cap accumulated time to prevent spiral of death on slow frames
  accumulatedTime += Math.min(frameTime, 100);

  // Run physics updates at fixed timestep
  while (accumulatedTime >= PHYSICS_TIMESTEP) {
    update(1); // Always 1 physics step
    accumulatedTime -= PHYSICS_TIMESTEP;
  }

  // Visual interpolation runs once per render frame (frame-rate independent)
  interpolateVisuals();

  // Update fog of war explored regions
  updateExploredRegions();

  render();
  updateStatsDisplay();
  updateTutorialProgress();
  requestAnimationFrame(gameLoop);
}

gameLoop();
