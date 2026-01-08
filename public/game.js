// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const selectionMenu = document.getElementById('selectionMenu');
const deathScreen = document.getElementById('deathScreen');
const upgradeBtn = document.getElementById('upgradeBtn');
const supportBtn = document.getElementById('supportBtn');
const hibernateBtn = document.getElementById('hibernateBtn');
const restartBtn = document.getElementById('restartBtn');
const healthStat = document.getElementById('healthStat');
const strengthStat = document.getElementById('strengthStat');
const foodStat = document.getElementById('foodStat');
const foodCapacityStat = document.getElementById('foodCapacityStat');
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

// Tech Tree nodes - Health and Strength are root branches, Capacity branches from Health
const techNodes = {
  // Health branch (root)
  techMembrane: { type: 'health', level: 1, cost: 5, requires: null },
  techCytoplasm: { type: 'health', level: 2, cost: 8, requires: 'techMembrane' },
  techNucleus: { type: 'health', level: 3, cost: 12, requires: 'techCytoplasm' },
  // Capacity branch (branches from Health/Membrane)
  techVacuole: { type: 'capacity', level: 1, cost: 3, requires: 'techMembrane' },
  techLysosome: { type: 'capacity', level: 2, cost: 5, requires: 'techVacuole' },
  techVesicle: { type: 'capacity', level: 3, cost: 8, requires: 'techLysosome' },
  // Strength branch (root)
  techFlagellum: { type: 'strength', level: 1, cost: 5, requires: null },
  techPseudopod: { type: 'strength', level: 2, cost: 8, requires: 'techFlagellum' },
  techCytoskeleton: { type: 'strength', level: 3, cost: 12, requires: 'techPseudopod' },
  // Evolution (requires Nucleus)
  techMitosis: { type: 'transform', level: 1, cost: 20, requires: 'techNucleus' }
};

// Cell-specific technology tree
const cellTechNodes = {
  // Defense branch (root) - Health for cells
  cellTechWall: { type: 'cellHealth', level: 1, cost: 8, requires: null },
  cellTechER: { type: 'cellHealth', level: 2, cost: 12, requires: 'cellTechWall' },
  cellTechGolgi: { type: 'cellHealth', level: 3, cost: 18, requires: 'cellTechER' },
  // Storage branch (branches from Defense)
  cellTechStorage: { type: 'cellCapacity', level: 1, cost: 6, requires: 'cellTechWall' },
  cellTechLipid: { type: 'cellCapacity', level: 2, cost: 10, requires: 'cellTechStorage' },
  cellTechGlycogen: { type: 'cellCapacity', level: 3, cost: 15, requires: 'cellTechLipid' },
  // Speed branch (root) - NEW! Level 2 gives tail
  cellTechCilia: { type: 'cellSpeed', level: 1, cost: 6, requires: null },
  cellTechMotor: { type: 'cellSpeed', level: 2, cost: 12, requires: 'cellTechCilia' }, // Gives tail!
  cellTechJet: { type: 'cellSpeed', level: 3, cost: 18, requires: 'cellTechMotor' },
  // Offense branch (root) - Strength for cells
  cellTechEnzymes: { type: 'cellStrength', level: 1, cost: 8, requires: null },
  cellTechToxin: { type: 'cellStrength', level: 2, cost: 12, requires: 'cellTechEnzymes' },
  cellTechPredator: { type: 'cellStrength', level: 3, cost: 18, requires: 'cellTechToxin' }
};

// Cell upgrade bonuses
const CELL_HEALTH_BONUSES = [30, 60, 90]; // Cumulative health bonus per level
const CELL_STRENGTH_BONUSES = [15, 30, 50]; // Cumulative damage bonus per level
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

    // Find the actual creature object
    const tad = myTadpoles[creatureIndex];
    if (!tad) {
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
      // Clear commands for newly selected creatures
      moveTarget = null;
      attackTarget = null;
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
let deathEffects = []; // Array of death splat effects
let particles = []; // Ambient floating particles
let damageTexts = []; // Array of damage text instances
let vanishingFood = []; // Food items that are fading out
let waitingForSupportTarget = false; // True when selecting a creature to support
let supportSourceId = null; // ID of creature that will do the supporting
let lastCreatureCount = 0; // Track when to rebuild creature list
let lastWaitingForSupport = false; // Track when support mode changes
let lastSelectedIds = new Set(); // Track selected IDs to detect selection changes

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
// Combat stats - NPCs have advantage until player upgrades
const MAX_HEALTH = 70; // Player base health (weak at start)
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
    healthStat.textContent = Math.round(displayTad.health);
    strengthStat.textContent = Math.round(playerStrength);
    foodStat.textContent = displayTad.food || 0;
    foodCapacityStat.textContent = getFoodCapacity(displayTad);
  } else {
    healthStat.textContent = '0';
    strengthStat.textContent = '0';
    foodStat.textContent = '0';
    foodCapacityStat.textContent = '0';
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

socket.on('init', (data) => {
  myId = data.id;
  const player = data.player;
  player.renderX = player.x;
  player.renderY = player.y;
  player.health = MAX_HEALTH;
  player.lastHit = 0;
  player.lastAttack = 0;
  player.type = 'tadpole';
  player.food = 0; // Start with 0 food
  player.radius = TADPOLE_RADIUS; // Override server radius to use consistent client size
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
});

socket.on('players', (serverPlayers) => {
  Object.keys(serverPlayers).forEach(id => {
    if (id !== myId) {
      const player = serverPlayers[id];
      player.renderX = player.x;
      player.renderY = player.y;
      player.health = MAX_HEALTH;
      player.lastHit = 0;
      player.lastAttack = 0;
      player.type = 'tadpole';
      player.color = '#4a5a6a'; // Dark blue-grey for other players
      initializeTadpole(player);
      players[id] = player;
    }
  });
});

socket.on('playerJoined', (player) => {
  player.renderX = player.x;
  player.renderY = player.y;
  player.health = MAX_HEALTH;
  player.lastHit = 0;
  player.lastAttack = 0;
  player.type = 'tadpole';
  player.color = '#4a5a6a'; // Dark blue-grey for other players
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
    console.log('Converting idle player to NPC:', playerData.name || playerId);

    // Determine if player was a cell or tadpole
    const wasCell = playerData.type === 'cell';

    // Convert to NPC - preserve player type
    const npc = {
      id: playerId,
      x: playerData.x,
      y: playerData.y,
      vx: playerData.vx || 0,
      vy: playerData.vy || 0,
      renderX: playerData.x,
      renderY: playerData.y,
      color: '#505050', // NPC color
      radius: wasCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
      score: 0,
      name: '', // NPCs don't show names
      health: NPC_MAX_HEALTH,
      lastHit: 0,
      lastAttack: 0,
      type: wasCell ? 'cell' : 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false,
      food: playerData.food || 0 // Preserve food storage
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
  // Save food item for vanishing animation before deleting
  const foodItem = food[data.foodId];
  if (foodItem) {
    vanishingFood.push({
      ...foodItem,
      vanishTime: Date.now()
    });
  }
  delete food[data.foodId];
  // Server doesn't track individual tadpole food, so we handle it client-side
});

socket.on('foodReset', (serverFood) => {
  // Clear all existing food and set to new sparse food
  food = serverFood;
  console.log('Food reset - now extremely sparse');
});

// NPC handlers - NPCs are now server-authoritative
socket.on('npcs', (serverNpcs) => {
  // Initial NPC state from server
  npcs = {};
  Object.values(serverNpcs).forEach(npcData => {
    const npc = { ...npcData };
    npc.renderX = npc.x;
    npc.renderY = npc.y;
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
      npc.provoked = serverNpc.provoked;
      npc.isTired = serverNpc.isTired;
      npc.chaseEnergy = serverNpc.chaseEnergy;
      npc.isSprinting = serverNpc.isSprinting;
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
      // New NPC - add it
      const npc = { ...serverNpc };
      npc.renderX = npc.x;
      npc.renderY = npc.y;
      if (npc.type === 'cell') {
        npc.angle = 0;
        npc.wiggleOffset = Math.random() * Math.PI * 2;
      } else {
        initializeTadpole(npc);
      }
      npcs[npc.id] = npc;
    }
  });
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
      // Apply damage
      closestTad.health -= data.damage;
      closestTad.lastHit = Date.now();
      closestTad.vx += data.knockbackX;
      closestTad.vy += data.knockbackY;
      spawnDamageText(closestTad.x, closestTad.y, data.damage);
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

// Name input with cheat commands (console-style, execute on Enter)
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const input = nameInput.value.trim();

    // Check for cheat commands
    if (input.startsWith('/food ')) {
      const amount = parseInt(input.substring(6));
      if (!isNaN(amount)) {
        // Add food to all tadpoles
        myTadpoles.forEach(tad => {
          tad.food = (tad.food || 0) + amount;
        });
        nameInput.value = '';
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
        nameInput.value = '';
        console.log(`Health set to ${playerHealth}`);
      }
      return;
    }

    if (input.startsWith('/strength ')) {
      const amount = parseInt(input.substring(10));
      if (!isNaN(amount)) {
        playerStrength = Math.max(0, amount);
        updateStatsDisplay();
        nameInput.value = '';
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

          nameInput.value = '';
          console.log('New tadpole spawned via /split cheat');
        }
      }
      return;
    }

    if (input === '/op') {
      invincibilityMode = !invincibilityMode;
      nameInput.value = '';
      console.log(`Invincibility mode ${invincibilityMode ? 'enabled' : 'disabled'}`);
      return;
    }

    if (input === '/reset') {
      socket.emit('resetWorld');
      nameInput.value = '';
      console.log('World reset requested');
      return;
    }

    // Normal name setting
    if (input && myTadpoles.length > 0) {
      socket.emit('setName', input);
      myTadpoles.forEach(tad => tad.name = input);
    }
  }
});

// Tadpole helper functions
function initializeTadpole(entity) {
  entity.tail = [];
  entity.trail = [];
  entity.angle = 0;
  entity.wiggleOffset = Math.random() * Math.PI * 2;

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
  entity.cellTailAngle = entity.angle || 0;

  // Initialize tail segments on one edge of the hexagon (bottom edge)
  const tailAngle = entity.cellTailAngle + Math.PI; // Point opposite to movement
  const segmentLength = CELL_TAIL_LENGTH / CELL_TAIL_SEGMENTS;

  // Start position - one of the hexagon vertices
  const startX = entity.x + Math.cos(tailAngle) * entity.radius;
  const startY = entity.y + Math.sin(tailAngle) * entity.radius;

  for (let i = 0; i < CELL_TAIL_SEGMENTS; i++) {
    entity.cellTail.push({
      x: startX + Math.cos(tailAngle) * (i + 1) * segmentLength,
      y: startY + Math.sin(tailAngle) * (i + 1) * segmentLength
    });
  }
}

function updateCellTail(entity, time) {
  if (!entity.hasCellTail) return;
  if (!entity.cellTail || entity.cellTail.length === 0) {
    initializeCellTail(entity);
  }

  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;
  const vx = entity.vx || 0;
  const vy = entity.vy || 0;
  const speed = Math.sqrt(vx * vx + vy * vy);

  // Update cell's facing angle based on movement
  if (speed > 0.1) {
    entity.cellTailAngle = Math.atan2(vy, vx);
  }

  // Tail base position - on the back edge of the cell
  const tailAngle = entity.cellTailAngle + Math.PI;
  const baseX = x + Math.cos(tailAngle) * entity.radius * 0.8;
  const baseY = y + Math.sin(tailAngle) * entity.radius * 0.8;

  const segmentLength = CELL_TAIL_LENGTH / CELL_TAIL_SEGMENTS;

  // Wiggle parameters (smaller than tadpole)
  const baseWiggle = 0.3;
  const speedWiggle = Math.min(speed * 1.5, 1.2);
  const wiggleIntensity = baseWiggle + speedWiggle;
  const wiggleSpeed = 8 + (speed * 6);

  for (let i = 0; i < CELL_TAIL_SEGMENTS; i++) {
    const segment = entity.cellTail[i];
    const targetX = i === 0 ? baseX : entity.cellTail[i - 1].x;
    const targetY = i === 0 ? baseY : entity.cellTail[i - 1].y;

    // Wiggle motion
    const segmentWiggle = Math.sin(time * wiggleSpeed + i * 0.6 + (entity.wiggleOffset || 0)) *
                          wiggleIntensity * (i / CELL_TAIL_SEGMENTS) * 5;

    const wiggleAngle = tailAngle + Math.PI / 2;
    const wiggleX = Math.cos(wiggleAngle) * segmentWiggle;
    const wiggleY = Math.sin(wiggleAngle) * segmentWiggle;

    // Calculate segment position
    const dx = segment.x - targetX;
    const dy = segment.y - targetY;
    const currentDist = Math.sqrt(dx * dx + dy * dy);

    let angle;
    if (currentDist > 1) {
      angle = Math.atan2(dy, dx);
    } else {
      angle = tailAngle;
    }

    const newX = targetX + Math.cos(angle) * segmentLength + wiggleX;
    const newY = targetY + Math.sin(angle) * segmentLength + wiggleY;

    // Smooth interpolation
    segment.x += (newX - segment.x) * 0.4;
    segment.y += (newY - segment.y) * 0.4;
  }
}

function updateTail(entity, time) {
  if (!entity.tail) initializeTadpole(entity);

  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;
  const vx = entity.vx || 0;
  const vy = entity.vy || 0;

  const speed = Math.sqrt(vx * vx + vy * vy);
  // Always update angle when moving, but preserve it when idle
  if (speed > 0.1) {
    entity.angle = Math.atan2(vy, vx);
  } else if (entity.angle === undefined) {
    // Initialize angle if not set (pointing left by default)
    entity.angle = Math.PI;
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
    // Move to food to eat it
    moveTarget = { x: clickedFood.x, y: clickedFood.y, isFoodTarget: true, foodId: clickedFood.id };
    attackTarget = null;
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
      // Clear commands when changing selection
      moveTarget = null;
      attackTarget = null;
    }
    updateSelectionCount();
  } else if (clickedEntity) {
    // Attack target
    attackTarget = clickedEntity;
    moveTarget = null;
  } else {
    // Move to location
    moveTarget = { x: worldX, y: worldY };
    attackTarget = null;
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
      if (selectedTadpoles.has(tad.id)) {
        selectedTadpoles.delete(tad.id);
      } else {
        selectedTadpoles.add(tad.id);
      }
      updateSelectionCount();

      // Clear targets when selecting/deselecting to prevent velocity burst
      moveTarget = null;
      attackTarget = null;

      // Show menu if any are selected
      if (selectedTadpoles.size > 0) {
        selectionMenu.classList.remove('hidden');
      } else {
        selectionMenu.classList.add('hidden');
      }
      return;
    }
  }

  // Right-clicked somewhere else - deselect all and cancel support mode
  selectedTadpoles.clear();
  waitingForSupportTarget = false;
  supportSourceId = null;
  updateSelectionCount();
  selectionMenu.classList.add('hidden');
  moveTarget = null;
  attackTarget = null;
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
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Detect when player tab becomes inactive
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    // Tab is hidden - notify server
    socket.emit('playerInactive');
  } else {
    // Tab is visible again - notify server
    socket.emit('playerActive');
  }
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

hibernateBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'cell') {
      if (selectedTad.isHibernating) {
        // Cancel hibernation
        selectedTad.isHibernating = false;
        selectedTad.hibernationStartTime = null;
      } else {
        // Start hibernation
        selectedTad.isHibernating = true;
        selectedTad.hibernationStartTime = Date.now();
        console.log('Cell entering hibernation...');
      }
      updateSelectionCount();
    }
  }
});

restartBtn.addEventListener('click', () => {
  location.reload();
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
  // Check both tadpole and cell tech trees
  const isCellTech = nodeId.startsWith('cellTech');
  const techData = isCellTech ? cellTechNodes[nodeId] : techNodes[nodeId];
  if (!techData) return;

  if (selectedTadpoles.size === 0) return;
  const selectedId = Array.from(selectedTadpoles)[0];
  const selectedTad = myTadpoles.find(t => t.id === selectedId);
  if (!selectedTad) return;

  // Verify creature type matches tech tree
  if (isCellTech && selectedTad.type !== 'cell') return;
  if (!isCellTech && selectedTad.type === 'cell' && techData.type !== 'transform') return;

  const currentFood = selectedTad.food || 0;
  const techTree = isCellTech ? cellTechNodes : techNodes;

  // Check if node is locked (prerequisite not met)
  if (techData.requires) {
    const reqNode = techTree[techData.requires];
    if (reqNode) {
      const reqLevel = getUpgradeLevel(selectedTad, reqNode.type);
      if (reqLevel < reqNode.level) return; // Prerequisite not researched
    }
  }

  // Check if already researched
  const currentLevel = getUpgradeLevel(selectedTad, techData.type);
  if (techData.type !== 'transform' && currentLevel >= techData.level) return;

  // Check if can afford
  if (currentFood < techData.cost) return;

  // Apply the upgrade
  selectedTad.food = currentFood - techData.cost;

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
    selectedTad.isTransforming = true;
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
  }

  updateUpgradeMenu();
  updateSelectionCount();
}

// Tech nodes (both tadpole and cell)
document.querySelectorAll('.tech-node').forEach(node => {
  node.addEventListener('click', () => handleTechClick(node.id));
});

// Evolution options
document.querySelectorAll('.evolution-option').forEach(node => {
  node.addEventListener('click', () => handleTechClick(node.id));
});

function getUpgradeLevel(tad, type) {
  // Tadpole upgrades
  if (type === 'health') return tad.healthLevel || 0;
  if (type === 'strength') return tad.strengthLevel || 0;
  if (type === 'capacity') return tad.capacityLevel || 0;
  if (type === 'transform') return tad.type === 'cell' ? 1 : 0;
  // Cell upgrades
  if (type === 'cellHealth') return tad.cellHealthLevel || 0;
  if (type === 'cellStrength') return tad.cellStrengthLevel || 0;
  if (type === 'cellCapacity') return tad.cellCapacityLevel || 0;
  if (type === 'cellSpeed') return tad.cellSpeedLevel || 0;
  return 0;
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

      // Deduct cost from selected tadpole
      selectedTad.food = (selectedTad.food || 0) - 20;

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
    Object.keys(techTree).forEach(nodeId => {
      const techData = techTree[nodeId];
      const node = document.getElementById(nodeId);
      if (!node) return;

      const currentLevel = getUpgradeLevel(selectedTad, techData.type);
      const isResearched = techData.type === 'transform'
        ? selectedTad.type === 'cell'
        : currentLevel >= techData.level;

      // Check if prerequisite is met
      let isLocked = false;
      if (techData.requires) {
        const reqNode = techTree[techData.requires];
        if (reqNode) {
          const reqLevel = getUpgradeLevel(selectedTad, reqNode.type);
          isLocked = reqLevel < reqNode.level;
        }
      }

      // For non-researched nodes, also check if previous level is researched
      if (!isResearched && !isLocked && techData.level > 1) {
        const prevLevel = currentLevel;
        if (prevLevel < techData.level - 1) {
          isLocked = true;
        }
      }

      // Check affordability (unlocked but can't afford)
      const canAfford = currentFood >= techData.cost;
      const isUnaffordable = !isResearched && !isLocked && !canAfford;

      // Update node classes
      node.classList.remove('researched', 'locked', 'unaffordable');
      if (isResearched) {
        node.classList.add('researched');
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
        } else {
          costEl.textContent = techData.cost;
        }
      }
    });
  }

  // Update both tech trees (tadpole and cell)
  updateTechTree(techNodes);
  updateTechTree(cellTechNodes);

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

    // Create creature name/number and support info
    const creatureName = document.createElement('span');
    const typeIcon = tad.type === 'cell' ? '⬡' : '○';
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
  } else {
    supportBtn.classList.add('hidden');
  }

  // Show Hibernate button only when a cell is selected
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    if (selectedTad && selectedTad.type === 'cell') {
      hibernateBtn.classList.remove('hidden');

      // Update button text based on hibernation state
      if (selectedTad.isHibernating) {
        hibernateBtn.textContent = 'Cancel Hibernation';
      } else {
        hibernateBtn.textContent = 'Hibernate';
      }
    } else {
      hibernateBtn.classList.add('hidden');
    }
  } else {
    hibernateBtn.classList.add('hidden');
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

  if (creatureCountChanged || supportModeChanged || selectionChanged) {
    lastCreatureCount = myTadpoles.length;
    lastWaitingForSupport = waitingForSupportTarget;
    lastSelectedIds = new Set(selectedTadpoles);
    updateCreatureList();
  }
}

// Game loop
function update(deltaTime = 1) {
  if (isDead) return;

  // Auto-select single creature (no yellow highlight)
  if (myTadpoles.length === 1 && selectedTadpoles.size === 0) {
    selectedTadpoles.add(myTadpoles[0].id);
  }

  // Update NPC tails for rendering (NPC behavior is server-controlled)
  const time = Date.now() / 1000;
  const now = Date.now();
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
        // Check if leader is near any enemy (NPCs or other players)
        for (let npc of Object.values(npcs)) {
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

    // Can move if selected OR in support mode (but not if hibernating)
    if ((isSelected || tad.supportMode) && !tad.isHibernating) {
      // Use support targets if in support mode, otherwise use normal targets
      const currentAttackTarget = tad.supportMode ? supportAttackTarget : attackTarget;
      let currentMoveTarget = tad.supportMode ? supportMoveTarget : moveTarget;

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
      if (currentAttackTarget) {
        // Apply formation offset to attack position
        const targetX = currentAttackTarget.x + formationOffset.x;
        const targetY = currentAttackTarget.y + formationOffset.y;

        const distX = targetX - tad.x;
        const distY = targetY - tad.y;
        const distance = Math.sqrt(distX * distX + distY * distY);

        if (distance < ATTACK_RANGE) {
          // In range, attack continuously
          const attackCooldown = tad.type === 'cell' ? CELL_ATTACK_COOLDOWN : TADPOLE_ATTACK_COOLDOWN;

          if (Date.now() - tad.lastAttack > attackCooldown) {
            const baseStrength = playerStrength + (tad.strengthBonus || 0);
            const damage = baseStrength * (tad.type === 'cell' ? 1.5 : 1);

            tad.lastAttack = Date.now();

            // Start attack animation (lunge)
            tad.attackLungeTime = Date.now();
            const angle = Math.atan2(currentAttackTarget.y - tad.y, currentAttackTarget.x - tad.x);
            tad.attackLungeAngle = angle;

            // If attacking an NPC, send to server (server handles damage, death, provoke)
            if (npcs[currentAttackTarget.id]) {
              socket.emit('attackNPC', {
                npcId: currentAttackTarget.id,
                damage: damage
              });
              // Don't apply damage locally - server will broadcast npcDamaged event
            } else if (players[currentAttackTarget.id]) {
              // Attacking another player - send to server to forward to them
              socket.emit('attackPlayer', {
                targetId: currentAttackTarget.id,
                damage: damage,
                knockbackX: Math.cos(angle) * 1,
                knockbackY: Math.sin(angle) * 1
              });
              // Show damage text locally for attacker feedback
              spawnDamageText(currentAttackTarget.x, currentAttackTarget.y, damage);
            } else {
              // Attacking local entity (own tadpole?) - apply damage locally
              currentAttackTarget.health -= damage;
              currentAttackTarget.lastHit = Date.now();

              // Spawn damage text
              spawnDamageText(currentAttackTarget.x, currentAttackTarget.y, damage);

              // Bounce target
              currentAttackTarget.vx += Math.cos(angle) * 1;
              currentAttackTarget.vy += Math.sin(angle) * 1;

              // Check if target died
              if (currentAttackTarget.health <= 0) {
                const deathX = currentAttackTarget.x;
                const deathY = currentAttackTarget.y;
                handleDeath(currentAttackTarget);

                // Tell supporting creatures to collect food from this kill
                myTadpoles.forEach(supportingTad => {
                  if (supportingTad.supportMode && supportingTad.supportLeader === tad.id) {
                    // Mark this creature to collect food from the death location
                    supportingTad.collectFoodAt = { x: deathX, y: deathY, time: Date.now() };
                  }
                });

                // Only clear global attackTarget if not in support mode
                if (!tad.supportMode && attackTarget === currentAttackTarget) {
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

        if (distance < ARRIVAL_THRESHOLD) {
          // Arrived - gentle glide to stop with soft correction
          tad.vx *= 0.95;
          tad.vy *= 0.95;

          // Gentle nudge toward exact target to prevent drifting
          if (distance > 5) {
            tad.vx += (distX / distance) * 0.015;
            tad.vy += (distY / distance) * 0.015;
          }
        } else if (distance < decelerationZone) {
          // Approaching - calculate desired velocity for smooth gliding arrival
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
        }
        if (keys['arrowright'] || keys['d']) {
          dx = 1;
          moveTarget = null;
        }
        if (keys['arrowup'] || keys['w']) {
          dy = -1;
          moveTarget = null;
        }
        if (keys['arrowdown'] || keys['s']) {
          dy = 1;
          moveTarget = null;
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
    let moveSpeed = tad.type === 'cell' ? MOVE_SPEED * 0.4 : MOVE_SPEED;
    // Apply cell speed bonus from upgrades
    if (tad.type === 'cell' && tad.cellSpeedBonus) {
      moveSpeed *= (1 + tad.cellSpeedBonus);
    }
    if (dx !== 0 || dy !== 0) {
      tad.vx += dx * moveSpeed;
      tad.vy += dy * moveSpeed;
    }

    // Friction
    tad.vx *= FRICTION;
    tad.vy *= FRICTION;

    if (Math.abs(tad.vx) < 0.01) tad.vx = 0;
    if (Math.abs(tad.vy) < 0.01) tad.vy = 0;

    tad.x += tad.vx;
    tad.y += tad.vy;
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
      const dx = tad.x - foodItem.x;
      const dy = tad.y - foodItem.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < tad.radius + foodItem.radius) {
        // Check food capacity
        const foodCapacity = getFoodCapacity(tad);
        const currentFood = tad.food || 0;

        if (currentFood < foodCapacity) {
          // Increase this tadpole's food counter
          tad.food = currentFood + 1;
          socket.emit('eatFood', foodItem.id);
          // Server will handle spawning new food
        }
      }
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
      tad.health = Math.min(MAX_HEALTH, tad.health + HEALTH_REGEN_RATE);
      // Update playerHealth to track the first tadpole's health
      if (myTadpoles[0] === tad) {
        playerHealth = tad.health;
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
        const spawnDistance = tad.radius + TADPOLE_RADIUS; // Spawn right at the edge, touching the cell

        // Spawn a new tadpole right next to the cell
        const newTad = {
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
          birthTime: Date.now(), // For birth animation
          birthDuration: 800 // Faster, more dramatic birth animation
        };
        initializeTadpole(newTad);

        myTadpoles.push(newTad);

        // Cell recoil in opposite direction
        tad.vx = -Math.cos(popAngle) * 3;
        tad.vy = -Math.sin(popAngle) * 3;

        // Mark cell as just gave birth for visual effect
        tad.birthBurstTime = Date.now();

        // End hibernation
        tad.isHibernating = false;
        tad.hibernationStartTime = null;

        // Update UI to reset hibernate button
        updateSelectionCount();

        console.log('Hibernation complete! New tadpole spawned.');
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

  // Send position
  if (myTadpoles.length > 0 && (!update.lastSent || Date.now() - update.lastSent > 50)) {
    const mainTad = myTadpoles[0];
    socket.emit('move', {
      x: mainTad.x,
      y: mainTad.y,
      vx: mainTad.vx,
      vy: mainTad.vy
    });
    update.lastSent = Date.now();
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
  Object.values(players).forEach(player => {
    if (!player.renderX) player.renderX = player.x;
    if (!player.renderY) player.renderY = player.y;

    player.renderX += (player.x - player.renderX) * interpFactor;
    player.renderY += (player.y - player.renderY) * interpFactor;

    updateTail(player, time);
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

  // Always drop exactly 1 food item on death
  socket.emit('spawnDeathFood', {
    x: entity.x,
    y: entity.y,
    count: 1
  });

  if (myTadpoles.includes(entity)) {
    myTadpoles = myTadpoles.filter(t => t !== entity);
    selectedTadpoles.delete(entity.id);

    if (myTadpoles.length === 0) {
      isDead = true;
      deathScreen.classList.remove('hidden');
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

function spawnDamageText(x, y, damage) {
  damageTexts.push({
    x: x,
    y: y,
    damage: Math.round(damage),
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

    // Red text with black outline
    ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
    ctx.lineWidth = 2;
    ctx.fillStyle = `rgba(255, 50, 50, ${opacity})`;

    const displayText = `-${text.damage}`;
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

    const drawRadius = foodItem.radius * scale;

    // Spawn glow effect
    if (glowAlpha > 0) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, drawRadius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 255, 200, ${glowAlpha * 0.4})`;
      ctx.fill();
    }

    // Outer glow
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, drawRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    // Main food circle
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, drawRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Cursor around food if targeting
    if (moveTarget && moveTarget.isFoodTarget && moveTarget.foodId === foodItem.id) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, drawRadius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Draw vanishing food with fade/shrink animation
  const vanishDuration = 300; // 300ms vanish animation (same as spawn)
  for (let i = vanishingFood.length - 1; i >= 0; i--) {
    const foodItem = vanishingFood[i];
    const elapsed = Date.now() - foodItem.vanishTime;

    if (elapsed >= vanishDuration) {
      // Animation complete, remove from array
      vanishingFood.splice(i, 1);
      continue;
    }

    const progress = elapsed / vanishDuration;
    // Shrink from 1 to 0, with slight overshoot at start
    let scale;
    if (progress < 0.2) {
      // Slight expand at start (1 to 1.15)
      scale = 1 + (progress / 0.2) * 0.15;
    } else {
      // Then shrink to 0
      const shrinkProgress = (progress - 0.2) / 0.8;
      scale = 1.15 * (1 - shrinkProgress);
    }

    const alpha = 1 - progress;
    const drawRadius = foodItem.radius * scale;

    // Vanish glow effect (same as spawn glow but fading out)
    const glowAlpha = alpha * 0.4;
    if (glowAlpha > 0.05) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, drawRadius * 2.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 255, 200, ${glowAlpha * 0.4})`;
      ctx.fill();
    }

    // Outer glow
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, drawRadius + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.3})`;
    ctx.fill();

    // Main food circle
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, drawRadius, 0, Math.PI * 2);
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

  // Draw other players
  Object.values(players).forEach(player => {
    drawEntity(player, false, false);
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

        ctx.strokeStyle = `rgba(255, 255, 100, ${pulseAlpha})`;
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

  const vignette = ctx.createRadialGradient(centerX, centerY, radius * 0.4, centerX, centerY, radius);
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.7, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.35)');

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawEntity(entity, isMe, isNPC, isSelected = false) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Only initialize tail for tadpoles
  if (entity.type === 'tadpole' && !entity.tail) {
    initializeTadpole(entity);
  }

  if (entity.type === 'cell') {
    drawCell(entity, isMe, isSelected);
  } else {
    drawTadpole(entity, isMe, isNPC, isSelected);
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

  // Transformation animation (tadpole to cell)
  let transformScale = 1;
  let transformGlow = 0;
  if (entity.isTransforming && entity.transformationStartTime) {
    const elapsed = Date.now() - entity.transformationStartTime;
    const progress = Math.min(elapsed / TRANSFORMATION_DURATION, 1);

    // Pulsing effect during transformation
    const pulse = Math.sin(elapsed / 200) * 0.1;
    transformScale = 1 + pulse;

    // Growing glow that intensifies toward the end
    transformGlow = 0.3 + progress * 0.5;

    // Draw transformation glow
    ctx.save();
    ctx.translate(x, y);

    // Pulsing rings
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      const ringPhase = (elapsed / 500 + i / ringCount) % 1;
      const ringRadius = entity.radius * (1 + ringPhase * 2);
      const ringAlpha = (1 - ringPhase) * transformGlow * 0.5;

      ctx.strokeStyle = `rgba(100, 150, 255, ${ringAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Inner transformation glow
    const glowGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, entity.radius * 2);
    glowGradient.addColorStop(0, `rgba(100, 150, 255, ${transformGlow * 0.4})`);
    glowGradient.addColorStop(0.5, `rgba(74, 95, 127, ${transformGlow * 0.3})`);
    glowGradient.addColorStop(1, 'rgba(74, 95, 127, 0)');
    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(0, 0, entity.radius * 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Draw tail
  if (entity.tail && entity.tail.length > 1) {
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
    gradient.addColorStop(0, entity.color);
    gradient.addColorStop(1, hexToRGBA(entity.color, 0.8));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = entity.radius * 1.2;
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

  ctx.beginPath();
  ctx.ellipse(0, 0, effectiveRadius * 1.2, effectiveRadius, 0, 0, Math.PI * 2);

  // Enhanced color for strength upgrades
  let bodyColor = entity.color;
  if (strengthLvl > 0 && isMe) {
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

      // Size based on food fullness
      const particleSize = effectiveRadius * 0.08 * (0.7 + foodRatio * 0.5);

      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.4 + foodRatio * 0.3})`;
      ctx.fill();
    }
  }

  // Border - yellow for selected (only if 2+ creatures), white for own unselected
  if (isSelected && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Solid yellow
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (isMe) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Eyes - size scales with upgrades
  const eyeOffset = effectiveRadius * 0.4;
  const eyeSize = effectiveRadius * (0.25 + totalLvl * 0.015); // Slightly bigger eyes at higher levels

  // Level 3+: Draw eye whites first for more detailed eyes
  if (totalLvl >= 3 && isMe) {
    ctx.beginPath();
    ctx.arc(eyeOffset, -eyeOffset * 0.7, eyeSize * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(eyeOffset, eyeOffset * 0.7, eyeSize * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
  }

  // Main eye pupils
  ctx.beginPath();
  ctx.arc(eyeOffset, -eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = totalLvl >= 5 && isMe ? 'rgba(60, 0, 120, 0.95)' : 'rgba(0, 0, 0, 0.8)'; // Purple eyes at max level
  ctx.fill();

  ctx.beginPath();
  ctx.arc(eyeOffset, eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = totalLvl >= 5 && isMe ? 'rgba(60, 0, 120, 0.95)' : 'rgba(0, 0, 0, 0.8)';
  ctx.fill();

  // Level 4+: Eye shine/glint
  if (totalLvl >= 4 && isMe) {
    const glintSize = eyeSize * 0.35;
    ctx.beginPath();
    ctx.arc(eyeOffset + eyeSize * 0.3, -eyeOffset * 0.7 - eyeSize * 0.3, glintSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(eyeOffset + eyeSize * 0.3, eyeOffset * 0.7 - eyeSize * 0.3, glintSize, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fill();
  }

  ctx.restore();

  // Name (only for non-NPCs)
  if (!isNPC && entity.name) {
    // Dark green for own creatures, light blue for other players
    ctx.fillStyle = isMe ? '#2d8659' : '#e8f0ff';
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

  // Size bonus: +3% per combined level (max +30% at level 10 total)
  const upgradeSizeBonus = 1 + (totalLvl * 0.03);

  // Glow intensity based on level (starts at level 2)
  const upgradeGlow = totalLvl >= 2 ? Math.min((totalLvl - 1) * 0.1, 0.5) : 0;

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

        // Much more irregular hair lengths (2-8 pixels, wider range) + strength bonus
        const strengthBonus = (entity.strengthLevel || 0) * 0.8; // +0.8 length per strength level
        const length = 2 + Math.random() * 6 + strengthBonus;

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
    // Calculate tail base position on the back edge
    const tailAngle = (entity.cellTailAngle || entity.angle || 0) + Math.PI;
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

    // Create gradient for tail
    const lastSeg = entity.cellTail[entity.cellTail.length - 1];
    const gradient = ctx.createLinearGradient(baseX, baseY, lastSeg.x, lastSeg.y);
    gradient.addColorStop(0, entity.color);
    gradient.addColorStop(1, hexToRGBA(entity.color, 0.6));

    ctx.strokeStyle = gradient;
    ctx.lineWidth = entity.radius * 0.5; // Thinner than tadpole tail
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  // Draw upgrade glow aura (before main cell)
  if (upgradeGlow > 0 && isMe) {
    ctx.save();
    ctx.translate(x, y);
    const glowRadius = entity.radius * upgradeSizeBonus * 1.6;
    const gradient = ctx.createRadialGradient(0, 0, entity.radius * 0.8, 0, 0, glowRadius);
    gradient.addColorStop(0, `rgba(100, 200, 255, ${upgradeGlow * 0.4})`);
    gradient.addColorStop(0.5, `rgba(150, 220, 255, ${upgradeGlow * 0.2})`);
    gradient.addColorStop(1, 'rgba(100, 200, 255, 0)');
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

      // Size based on food fullness
      const particleSize = entity.radius * 0.06 * (0.7 + foodRatio * 0.5);

      ctx.beginPath();
      ctx.arc(px, py, particleSize, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + foodRatio * 0.25})`;
      ctx.fill();
    }
  }

  // Border - yellow for selected (only if 2+ creatures), white for own unselected
  if (isSelected && myTadpoles.length > 1) {
    ctx.strokeStyle = 'rgba(255, 255, 0, 1)'; // Solid yellow
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (isMe) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
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

  ctx.restore();

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

      // Tiny eyes
      if (organismSize > 3) {
        const eyeOffset = organismSize * 0.3;
        const eyeSize = organismSize * 0.15;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
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

  // Name
  if (entity.name) {
    // Dark green for own creatures, light blue for other players
    ctx.fillStyle = isMe ? '#2d8659' : '#e8f0ff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(entity.name, x, y - entity.radius - 25);
    ctx.fillText(entity.name, x, y - entity.radius - 25);
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
  requestAnimationFrame(gameLoop);
}

gameLoop();
