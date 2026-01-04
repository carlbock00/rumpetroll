// Canvas setup
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const selectionMenu = document.getElementById('selectionMenu');
const selectionCount = document.getElementById('selectionCount');
const deathScreen = document.getElementById('deathScreen');
const upgradeBtn = document.getElementById('upgradeBtn');
const supportBtn = document.getElementById('supportBtn');
const hibernateBtn = document.getElementById('hibernateBtn');
const restartBtn = document.getElementById('restartBtn');
const healthStat = document.getElementById('healthStat');
const strengthStat = document.getElementById('strengthStat');
const foodStat = document.getElementById('foodStat');
const creatureList = document.getElementById('creatureList');
const upgradeMenu = document.getElementById('upgradeMenu');
const upgradeCloseBtn = document.getElementById('upgradeCloseBtn');
const buyHealthBtn = document.getElementById('buyHealthBtn');
const buyStrengthBtn = document.getElementById('buyStrengthBtn');
const transformCellBtn = document.getElementById('transformCellBtn');
const healthUpgradeLevelEl = document.getElementById('healthUpgradeLevel');
const strengthUpgradeLevelEl = document.getElementById('strengthUpgradeLevel');
const healthUpgradeCostEl = document.getElementById('healthUpgradeCost');
const strengthUpgradeCostEl = document.getElementById('strengthUpgradeCost');

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
let waitingForSupportTarget = false; // True when selecting a creature to support
let supportSourceId = null; // ID of creature that will do the supporting
let lastCreatureCount = 0; // Track when to rebuild creature list
let lastWaitingForSupport = false; // Track when support mode changes
let lastSelectedIds = new Set(); // Track selected IDs to detect selection changes

// Cheat modes
let invincibilityMode = false; // /op command - allow negative health without dying

// Upgrade system
let healthUpgradeLevel = 0;
let strengthUpgradeLevel = 0;
const BASE_UPGRADE_COST = 5;
const HEALTH_PER_UPGRADE = 20;
const STRENGTH_PER_UPGRADE = 10;

// Food capacity
const TADPOLE_FOOD_CAPACITY = 30;
const CELL_FOOD_CAPACITY = 50;

// Hibernation
const HIBERNATION_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

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
const MOVE_SPEED = 0.03;
const NPC_MOVE_SPEED = 0.015; // 2x slower
const FRICTION = 0.98;
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
const MAX_HEALTH = 100;
const NPC_MAX_HEALTH = 150; // NPCs have 1.5x more health than players
const HEALTH_REGEN_RATE = MAX_HEALTH / (2 * 60 * 60); // Full health in 2 minutes
const NPC_HEALTH_REGEN_RATE = NPC_MAX_HEALTH / (2 * 60 * 60); // NPCs regenerate proportionally
const ATTACK_DAMAGE = 50; // 2 hits to kill (100 health / 50 damage)
const ATTACK_RANGE = 100; // Large enough to attack before collision pushes apart
const TADPOLE_ATTACK_COOLDOWN = 1000; // ms - tadpoles attack once per second
const CELL_ATTACK_COOLDOWN = 1500; // ms - cells attack once per 1.5 seconds
const NPC_ATTACK_COOLDOWN = 1500; // ms - NPCs attack cooldown
const ATTACK_LUNGE_DISTANCE = 15; // How far to lunge forward when attacking
const ATTACK_LUNGE_DURATION = 150; // ms - how long the lunge lasts
const CELL_DAMAGE_RESISTANCE = 0.5; // Take half damage

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
  } else {
    healthStat.textContent = '0';
    strengthStat.textContent = '0';
    foodStat.textContent = '0';
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
    food[newFood.id] = newFood;
  }
});

socket.on('foodEaten', (data) => {
  delete food[data.foodId];
  // Server doesn't track individual tadpole food, so we handle it client-side
});

socket.on('foodReset', (serverFood) => {
  // Clear all existing food and set to new sparse food
  food = serverFood;
  console.log('Food reset - now extremely sparse');
});

// Initialize NPCs (tadpoles and cells)
function initializeNPCs() {
  const totalNPCs = 15;
  const npcCellCount = 3; // 3 cells, 12 tadpoles

  for (let i = 0; i < totalNPCs; i++) {
    const isCell = i < npcCellCount; // First 3 are cells

    const npc = {
      id: `npc_${i}`,
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      vx: 0,
      vy: 0,
      renderX: 0,
      renderY: 0,
      color: '#505050', // Darker shade of grey
      radius: isCell ? NPC_CELL_RADIUS : NPC_TADPOLE_RADIUS,
      score: 0,
      name: '',
      health: NPC_MAX_HEALTH,
      lastHit: 0,
      lastAttack: 0,
      type: isCell ? 'cell' : 'tadpole',
      moveTarget: null,
      targetChangeTime: Date.now(),
      provoked: false // NPCs start peaceful
    };
    npc.renderX = npc.x;
    npc.renderY = npc.y;

    if (isCell) {
      // Cells don't have tails, they're hexagons
      npc.angle = 0;
      npc.wiggleOffset = Math.random() * Math.PI * 2;
    } else {
      initializeTadpole(npc);
    }

    npcs[npc.id] = npc;
  }
}
initializeNPCs();

// Initialize ambient particles
function initializeParticles() {
  const particleCount = 500; // Number of particles in the world

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: (Math.random() - 0.5) * WORLD_SIZE,
      y: (Math.random() - 0.5) * WORLD_SIZE,
      radius: 0.5 + Math.random() * 1.5, // 0.5-2 pixels (much smaller than food)
      brightness: 0.3 + Math.random() * 0.7, // Varying shades of white (0.3-1.0)
      driftSpeed: 0.02 + Math.random() * 0.03, // Slow drift speed
      driftAngle: Math.random() * Math.PI * 2, // Random drift direction
      phase: Math.random() * Math.PI * 2 // For floating motion
    });
  }
}
initializeParticles();

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

  entity.trail.unshift({ x, y, alpha: 1 });
  if (entity.trail.length > TRAIL_LENGTH) {
    entity.trail.pop();
  }

  entity.trail.forEach((point, i) => {
    point.alpha = 1 - (i / TRAIL_LENGTH);
  });

  const segmentLength = TAIL_LENGTH / TAIL_SEGMENTS;
  const baseWiggle = 0.4;
  const speedWiggle = Math.min(speed * 2, 1.5);
  const wiggleIntensity = baseWiggle + speedWiggle;
  const baseWiggleSpeed = 3;
  const maxWiggleSpeed = 10;
  const wiggleSpeed = baseWiggleSpeed + (speed * 8);
  const clampedWiggleSpeed = Math.min(wiggleSpeed, maxWiggleSpeed);

  for (let i = 0; i < TAIL_SEGMENTS; i++) {
    const segment = entity.tail[i];
    const targetX = i === 0 ? x : entity.tail[i - 1].x;
    const targetY = i === 0 ? y : entity.tail[i - 1].y;

    const segmentWiggle = Math.sin(time * clampedWiggleSpeed + i * 0.5 + entity.wiggleOffset) *
                          wiggleIntensity * (i / TAIL_SEGMENTS) * 8;

    const wiggleAngle = entity.angle + Math.PI / 2;
    const wiggleX = Math.cos(wiggleAngle) * segmentWiggle;
    const wiggleY = Math.sin(wiggleAngle) * segmentWiggle;

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

    // Less interpolation to maintain tail length
    const interpFactor = speed > 0.1 ? 0.2 : 0.3; // Slower interpolation when idle
    segment.x += (offsetX - segment.x) * interpFactor;
    segment.y += (offsetY - segment.y) * interpFactor;
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

buyHealthBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    const cost = BASE_UPGRADE_COST + healthUpgradeLevel * 2;

    if (selectedTad && (selectedTad.food || 0) >= cost) {
      // Deduct cost
      selectedTad.food = (selectedTad.food || 0) - cost;

      // Increase health upgrade level
      healthUpgradeLevel++;

      // Increase max health for this creature
      if (!selectedTad.maxHealthBonus) selectedTad.maxHealthBonus = 0;
      selectedTad.maxHealthBonus += HEALTH_PER_UPGRADE;

      // Also heal the creature by the upgrade amount
      selectedTad.health = Math.min(
        (selectedTad.health || MAX_HEALTH) + HEALTH_PER_UPGRADE,
        MAX_HEALTH + selectedTad.maxHealthBonus
      );

      updateUpgradeMenu();
      updateSelectionCount();
    }
  }
});

buyStrengthBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);
    const cost = BASE_UPGRADE_COST + strengthUpgradeLevel * 2;

    if (selectedTad && (selectedTad.food || 0) >= cost) {
      // Deduct cost
      selectedTad.food = (selectedTad.food || 0) - cost;

      // Increase strength upgrade level
      strengthUpgradeLevel++;

      // Increase strength for this creature
      if (!selectedTad.strengthBonus) selectedTad.strengthBonus = 0;
      selectedTad.strengthBonus += STRENGTH_PER_UPGRADE;

      updateUpgradeMenu();
      updateSelectionCount();
    }
  }
});

transformCellBtn.addEventListener('click', () => {
  if (selectedTadpoles.size > 0) {
    const selectedId = Array.from(selectedTadpoles)[0];
    const selectedTad = myTadpoles.find(t => t.id === selectedId);

    if (selectedTad && selectedTad.type === 'tadpole' && (selectedTad.food || 0) >= 5) {
      // Deduct cost from selected tadpole
      selectedTad.food = (selectedTad.food || 0) - 5;

      // Upgrade to cell
      selectedTad.type = 'cell';
      selectedTad.radius = CELL_RADIUS;
      selectedTad.color = '#4a5f7f'; // Less dark hue of dark blue

      // Clear tail and hairs completely - force fresh initialization
      selectedTad.tail = null;
      selectedTad.hairs = null;
      selectedTad.trail = null;

      // Ensure angle and wiggle offset are set for cell
      if (!selectedTad.angle) {
        selectedTad.angle = 0;
      }
      if (!selectedTad.wiggleOffset) {
        selectedTad.wiggleOffset = Math.random() * Math.PI * 2;
      }

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
  const healthCost = BASE_UPGRADE_COST + healthUpgradeLevel * 2;
  const strengthCost = BASE_UPGRADE_COST + strengthUpgradeLevel * 2;

  // Update levels
  healthUpgradeLevelEl.textContent = healthUpgradeLevel;
  strengthUpgradeLevelEl.textContent = strengthUpgradeLevel;

  // Update costs
  healthUpgradeCostEl.textContent = healthCost;
  strengthUpgradeCostEl.textContent = strengthCost;

  // Enable/disable buttons based on food availability
  buyHealthBtn.disabled = currentFood < healthCost;
  buyStrengthBtn.disabled = currentFood < strengthCost;
  transformCellBtn.disabled = selectedTad.type !== 'tadpole' || currentFood < 5;
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
    const foodCapacity = tad.type === 'cell' ? CELL_FOOD_CAPACITY : TADPOLE_FOOD_CAPACITY;
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
  selectionCount.textContent = `Selected: ${selectedTadpoles.size}`;

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

// Update NPCs
function updateNPC(npc, time) {
  // Random movement
  if (!npc.moveTarget || Date.now() - npc.targetChangeTime > 3000) {
    npc.moveTarget = {
      x: npc.x + (Math.random() - 0.5) * 400,
      y: npc.y + (Math.random() - 0.5) * 400
    };
    npc.targetChangeTime = Date.now();
  }

  // Move towards target
  if (npc.moveTarget) {
    const dx = npc.moveTarget.x - npc.x;
    const dy = npc.moveTarget.y - npc.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ARRIVAL_THRESHOLD) {
      npc.moveTarget = null;
      // Ultra-gentle coast to a stop
      npc.vx *= 0.985;
      npc.vy *= 0.985;
    } else {
      let moveSpeed = NPC_MOVE_SPEED;

      // Gentle deceleration as approaching target
      const decelerationZone = ARRIVAL_THRESHOLD * 2;
      if (dist < decelerationZone) {
        const speedMultiplier = 0.5 + 0.5 * (dist - ARRIVAL_THRESHOLD) / (decelerationZone - ARRIVAL_THRESHOLD);
        moveSpeed *= speedMultiplier;
      }

      npc.vx += (dx / dist) * moveSpeed;
      npc.vy += (dy / dist) * moveSpeed;
    }
  }

  // Apply friction
  npc.vx *= FRICTION;
  npc.vy *= FRICTION;

  if (Math.abs(npc.vx) < 0.01) npc.vx = 0;
  if (Math.abs(npc.vy) < 0.01) npc.vy = 0;

  npc.x += npc.vx;
  npc.y += npc.vy;
  npc.renderX = npc.x;
  npc.renderY = npc.y;

  // Apply attack lunge animation
  if (npc.attackLungeTime) {
    const timeSinceLunge = Date.now() - npc.attackLungeTime;
    if (timeSinceLunge < ATTACK_LUNGE_DURATION * 2) {
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

      npc.renderX += Math.cos(npc.attackLungeAngle) * lungeOffset;
      npc.renderY += Math.sin(npc.attackLungeAngle) * lungeOffset;

      // Add squish effect when pulling back (spring loading)
      if (!isLunging) {
        const squishAmount = (1 - lungeProgress) * 0.7; // Max 70% squish
        npc.attackSquish = squishAmount;
        npc.attackSquishAngle = npc.attackLungeAngle;
      } else {
        npc.attackSquish = 0;
      }
    } else {
      npc.attackLungeTime = null;
      npc.attackSquish = 0;
    }
  }

  // NPCs don't eat food - they're client-side only and shouldn't affect shared game state
  // They just swim around randomly

  // NPC vs NPC combat - NPCs sometimes attack each other
  if (!npc.attackTarget && Math.random() < 0.001) { // 0.1% chance per frame to pick a fight
    const nearbyNPCs = Object.values(npcs).filter(other => {
      if (other.id === npc.id) return false;
      const dx = other.x - npc.x;
      const dy = other.y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist < 200; // Only attack NPCs within 200 pixels
    });

    if (nearbyNPCs.length > 0) {
      npc.attackTarget = nearbyNPCs[Math.floor(Math.random() * nearbyNPCs.length)].id;
    }
  }

  // Attack another NPC if we have a target
  if (npc.attackTarget) {
    const target = npcs[npc.attackTarget];
    if (target && target.health > 0) {
      const dx = target.x - npc.x;
      const dy = target.y - npc.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Move towards target
      if (dist > ATTACK_RANGE) {
        npc.vx += (dx / dist) * NPC_MOVE_SPEED * 0.5;
        npc.vy += (dy / dist) * NPC_MOVE_SPEED * 0.5;
      }

      // Attack when in range
      if (dist < ATTACK_RANGE && Date.now() - npc.lastAttack > NPC_ATTACK_COOLDOWN) {
        const npcDamage = ATTACK_DAMAGE * (npc.type === 'cell' ? 1.5 : 1);
        const actualDamage = npcDamage * (target.type === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);
        target.health -= actualDamage;
        target.lastHit = Date.now();
        npc.lastAttack = Date.now();

        // Spawn damage text
        spawnDamageText(target.x, target.y, actualDamage);

        // Attack animation
        npc.attackLungeTime = Date.now();
        const angle = Math.atan2(dy, dx);
        npc.attackLungeAngle = angle;

        // Bounce target
        target.vx += Math.cos(angle) * 1;
        target.vy += Math.sin(angle) * 1;

        // Check if target died
        if (target.health <= 0) {
          handleDeath(target);
          npc.attackTarget = null;
        }
      }
    } else {
      // Target died or doesn't exist, clear it
      npc.attackTarget = null;
    }
  }

  // Collision with other NPCs
  for (let otherNpc of Object.values(npcs)) {
    if (otherNpc.id === npc.id) continue;

    const dx = npc.x - otherNpc.x;
    const dy = npc.y - otherNpc.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = npc.radius + otherNpc.radius;

    if (distance < minDistance && distance > 0) {
      // Calculate bounce
      const angle = Math.atan2(dy, dx);
      const overlap = minDistance - distance;

      // Push apart
      const pushX = Math.cos(angle) * overlap * 0.5;
      const pushY = Math.sin(angle) * overlap * 0.5;

      npc.x += pushX;
      npc.y += pushY;

      // Bounce velocity
      const bounceStrength = 0.3;
      npc.vx += Math.cos(angle) * bounceStrength;
      npc.vy += Math.sin(angle) * bounceStrength;
    }
  }

  // Collision with player tadpoles
  for (let tad of myTadpoles) {
    const dx = npc.x - tad.x;
    const dy = npc.y - tad.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = npc.radius + tad.radius;

    if (distance < minDistance && distance > 0) {
      // Calculate bounce
      const angle = Math.atan2(dy, dx);
      const overlap = minDistance - distance;

      // Push apart
      const pushX = Math.cos(angle) * overlap * 0.5;
      const pushY = Math.sin(angle) * overlap * 0.5;

      npc.x += pushX;
      npc.y += pushY;

      // Bounce velocity
      const bounceStrength = 0.3;
      npc.vx += Math.cos(angle) * bounceStrength;
      npc.vy += Math.sin(angle) * bounceStrength;
    }
  }

  // Collision with other players
  for (let otherPlayer of Object.values(players)) {
    const dx = npc.x - otherPlayer.x;
    const dy = npc.y - otherPlayer.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const minDistance = npc.radius + otherPlayer.radius;

    if (distance < minDistance && distance > 0) {
      // Calculate bounce
      const angle = Math.atan2(dy, dx);
      const overlap = minDistance - distance;

      // Push apart
      const pushX = Math.cos(angle) * overlap * 0.5;
      const pushY = Math.sin(angle) * overlap * 0.5;

      npc.x += pushX;
      npc.y += pushY;

      // Bounce velocity
      const bounceStrength = 0.3;
      npc.vx += Math.cos(angle) * bounceStrength;
      npc.vy += Math.sin(angle) * bounceStrength;
    }
  }

  // Health regeneration
  if (Date.now() - npc.lastHit > 1000) {
    npc.health = Math.min(NPC_MAX_HEALTH, npc.health + NPC_HEALTH_REGEN_RATE);
  }

  // Avoid player tadpoles (move away) unless provoked
  for (let tad of myTadpoles) {
    const dx = npc.x - tad.x;
    const dy = npc.y - tad.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Only attack if NPC has been provoked
    if (npc.provoked && dist < ATTACK_RANGE && Date.now() - npc.lastAttack > NPC_ATTACK_COOLDOWN) {
      // NPCs inflict same base damage as players, with cell resistance
      const npcDamage = ATTACK_DAMAGE * (npc.type === 'cell' ? 1.5 : 1); // Cells do 1.5x damage
      const actualDamage = npcDamage * (tad.type === 'cell' ? CELL_DAMAGE_RESISTANCE : 1);
      tad.health -= actualDamage;
      tad.lastHit = Date.now();
      npc.lastAttack = Date.now();

      // Spawn damage text
      spawnDamageText(tad.x, tad.y, actualDamage);

      // Attack animation
      npc.attackLungeTime = Date.now();
      const angle = Math.atan2(-dy, -dx); // Angle towards player
      npc.attackLungeAngle = angle;

      // Bounce player back
      tad.vx -= Math.cos(angle) * 0.5;
      tad.vy -= Math.sin(angle) * 0.5;
    } else if (!npc.provoked && dist < 100) {
      // Avoid player - move away gently
      const avoidAngle = Math.atan2(dy, dx);
      npc.vx += Math.cos(avoidAngle) * 0.015;
      npc.vy += Math.sin(avoidAngle) * 0.015;
    }
  }
}

// Game loop
function update() {
  if (isDead) return;

  // Auto-select single creature (no yellow highlight)
  if (myTadpoles.length === 1 && selectedTadpoles.size === 0) {
    selectedTadpoles.add(myTadpoles[0].id);
  }

  // Update NPCs
  const time = Date.now() / 1000;
  for (let npc of Object.values(npcs)) {
    updateNPC(npc, time);
    // Only update tail for tadpoles, not cells
    if (npc.type === 'tadpole') {
      updateTail(npc, time);
    }
  }

  // Update particles - gentle floating motion
  particles.forEach(particle => {
    // Gentle sinusoidal floating
    const floatX = Math.sin(time * 0.5 + particle.phase) * particle.driftSpeed;
    const floatY = Math.cos(time * 0.3 + particle.phase) * particle.driftSpeed;

    // Slow drift in a direction
    particle.x += Math.cos(particle.driftAngle) * particle.driftSpeed + floatX;
    particle.y += Math.sin(particle.driftAngle) * particle.driftSpeed + floatY;

    // Wrap around world edges
    if (particle.x > WORLD_SIZE / 2) particle.x = -WORLD_SIZE / 2;
    if (particle.x < -WORLD_SIZE / 2) particle.x = WORLD_SIZE / 2;
    if (particle.y > WORLD_SIZE / 2) particle.y = -WORLD_SIZE / 2;
    if (particle.y < -WORLD_SIZE / 2) particle.y = WORLD_SIZE / 2;
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
            currentAttackTarget.health -= damage;
            currentAttackTarget.lastHit = Date.now();

            // Spawn damage text
            spawnDamageText(currentAttackTarget.x, currentAttackTarget.y, damage);
            tad.lastAttack = Date.now();

            // Start attack animation (lunge)
            tad.attackLungeTime = Date.now();
            const angle = Math.atan2(currentAttackTarget.y - tad.y, currentAttackTarget.x - tad.x);
            tad.attackLungeAngle = angle;

            // Mark NPC as provoked if attacking an NPC
            if (npcs[currentAttackTarget.id]) {
              currentAttackTarget.provoked = true;
            }

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

        if (distance < ARRIVAL_THRESHOLD) {
          // Ultra-gentle damping when very close - long slow glide
          tad.vx *= 0.985;
          tad.vy *= 0.985;
        } else {
          // Calculate movement direction
          dx = distX / distance;
          dy = distY / distance;

          // Gentle deceleration as we approach the target - more of a skid
          const decelerationZone = ARRIVAL_THRESHOLD * 2; // Start slowing down at 60 pixels
          if (distance < decelerationZone) {
            // Gradually reduce speed but keep momentum for skidding effect
            const speedMultiplier = 0.5 + 0.5 * (distance - ARRIVAL_THRESHOLD) / (decelerationZone - ARRIVAL_THRESHOLD);
            dx *= speedMultiplier;
            dy *= speedMultiplier;
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
    const moveSpeed = tad.type === 'cell' ? MOVE_SPEED * 0.4 : MOVE_SPEED;
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
        const foodCapacity = tad.type === 'cell' ? CELL_FOOD_CAPACITY : TADPOLE_FOOD_CAPACITY;
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
        // Spawn a new tadpole
        const newTad = {
          id: `${myId}_${Date.now()}`,
          x: tad.x + 30,
          y: tad.y + 30,
          vx: 0,
          vy: 0,
          renderX: tad.x + 30,
          renderY: tad.y + 30,
          color: '#FFFFFF',
          radius: TADPOLE_RADIUS,
          score: 0,
          name: myName,
          health: MAX_HEALTH,
          lastHit: 0,
          lastAttack: 0,
          type: 'tadpole',
          food: 0,
          birthTime: Date.now(), // For birth animation
          birthDuration: 1000 // 1 second birth animation
        };
        newTad.renderX = newTad.x;
        newTad.renderY = newTad.y;
        initializeTadpole(newTad);

        myTadpoles.push(newTad);

        // End hibernation
        tad.isHibernating = false;
        tad.hibernationStartTime = null;

        console.log('Hibernation complete! New tadpole spawned.');
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

  // Interpolate other players
  Object.values(players).forEach(player => {
    if (!player.renderX) player.renderX = player.x;
    if (!player.renderY) player.renderY = player.y;

    player.renderX += (player.x - player.renderX) * INTERPOLATION_FACTOR;
    player.renderY += (player.y - player.renderY) * INTERPOLATION_FACTOR;

    updateTail(player, time);
  });

  // Clean up expired death effects
  const now = Date.now();
  deathEffects = deathEffects.filter(effect => now - effect.startTime < effect.duration);
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

  // Determine food count based on stored food (60-80% of stored food is dropped)
  const storedFood = entity.food || 0;
  const dropPercentage = 0.6 + Math.random() * 0.2; // 60-80%
  const foodFromStorage = Math.floor(storedFood * dropPercentage);

  // Minimum 2 food items, plus what they were storing
  const foodCount = Math.max(2, foodFromStorage);

  // Request server to spawn food at death location
  // This ensures food is properly synced and edible
  socket.emit('spawnDeathFood', {
    x: entity.x,
    y: entity.y,
    count: foodCount
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
    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, foodItem.radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(foodItem.x, foodItem.y, foodItem.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Cursor around food if targeting
    if (moveTarget && moveTarget.isFoodTarget && moveTarget.foodId === foodItem.id) {
      ctx.beginPath();
      ctx.arc(foodItem.x, foodItem.y, foodItem.radius + 8, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255, 255, 100, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

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

  // Draw minimap
  if (myTadpoles.length > 0) {
    drawMinimap();
  }
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
  const maxHealth = isNPC ? NPC_MAX_HEALTH : MAX_HEALTH;
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

  // Birth animation
  let birthScale = 1;
  let birthGlow = 0;
  if (entity.birthTime && entity.birthDuration) {
    const timeSinceBirth = Date.now() - entity.birthTime;
    if (timeSinceBirth < entity.birthDuration) {
      const progress = timeSinceBirth / entity.birthDuration;
      // Ease out: start fast, end slow
      birthScale = Math.sqrt(progress);
      // Glow diminishes as birth completes
      birthGlow = (1 - progress) * 0.8;
    } else {
      // Birth animation complete, clean up
      entity.birthTime = null;
      entity.birthDuration = null;
    }
  }

  // Apply birth scaling if active
  if (birthScale < 1) {
    ctx.save();
    ctx.translate(x, y);

    // Draw birth glow
    if (birthGlow > 0) {
      ctx.beginPath();
      ctx.arc(0, 0, entity.radius * 2 * (1.5 - birthScale), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(100, 200, 255, ${birthGlow * 0.3})`;
      ctx.fill();
    }

    ctx.scale(birthScale, birthScale);
    ctx.translate(-x, -y);
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
  ctx.ellipse(0, 0, entity.radius * 1.2, entity.radius, 0, 0, Math.PI * 2);
  ctx.fillStyle = entity.color;
  ctx.fill();

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

  // Eyes
  const eyeOffset = entity.radius * 0.4;
  const eyeSize = entity.radius * 0.25;

  ctx.beginPath();
  ctx.arc(eyeOffset, -eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(eyeOffset, eyeOffset * 0.7, eyeSize, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fill();

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
  if (birthScale < 1) {
    ctx.restore();
  }
}

function drawCell(entity, isMe, isSelected) {
  const x = entity.renderX || entity.x;
  const y = entity.renderY || entity.y;

  // Initialize hairs if not present - aligned with hexagon edges (irregular)
  if (!entity.hairs) {
    entity.hairs = [];

    for (let edgeIndex = 0; edgeIndex < 6; edgeIndex++) {
      // Random number of hairs per edge (4-10 hairs)
      const hairsPerEdge = Math.floor(4 + Math.random() * 7);

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

        // Much more irregular hair lengths (2-8 pixels, wider range)
        const length = 2 + Math.random() * 6;

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

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(entity.angle + swimAngle);
  ctx.scale(1 + swimPulse, 1 + swimPulse);

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

      ctx.restore();
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

function drawMinimap() {
  const minimapSize = 150;
  const minimapPadding = 20;
  const minimapX = minimapPadding;
  const minimapY = minimapPadding;
  const scale = minimapSize / WORLD_SIZE;

  // Background
  ctx.fillStyle = 'rgba(10, 14, 26, 0.8)';
  ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

  // Center marker
  const centerX = minimapX + minimapSize / 2;
  const centerY = minimapY + minimapSize / 2;
  ctx.fillStyle = 'rgba(150, 180, 220, 0.3)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, 2, 0, Math.PI * 2);
  ctx.fill();

  // Draw entities on minimap
  const drawOnMinimap = (entity) => {
    let mapX = minimapX + (entity.x + WORLD_SIZE / 2) * scale;
    let mapY = minimapY + (entity.y + WORLD_SIZE / 2) * scale;

    // Clamp to minimap bounds
    mapX = Math.max(minimapX, Math.min(minimapX + minimapSize, mapX));
    mapY = Math.max(minimapY, Math.min(minimapY + minimapSize, mapY));

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
      ctx.fillStyle = 'rgba(100, 200, 255, 1)';
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

  myTadpoles.forEach(tad => {
    let mapX = minimapX + (tad.x + WORLD_SIZE / 2) * scale;
    let mapY = minimapY + (tad.y + WORLD_SIZE / 2) * scale;

    mapX = Math.max(minimapX, Math.min(minimapX + minimapSize, mapX));
    mapY = Math.max(minimapY, Math.min(minimapY + minimapSize, mapY));

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

  // Draw camera view box - constrained to minimap
  const viewWidth = canvas.width;
  const viewHeight = canvas.height;
  const viewBoxWidth = Math.min(viewWidth * scale, minimapSize);
  const viewBoxHeight = Math.min(viewHeight * scale, minimapSize);

  let viewBoxX = minimapX + (camera.x - viewWidth / 2 + WORLD_SIZE / 2) * scale;
  let viewBoxY = minimapY + (camera.y - viewHeight / 2 + WORLD_SIZE / 2) * scale;

  // Constrain view box to stay within minimap
  viewBoxX = Math.max(minimapX, Math.min(minimapX + minimapSize - viewBoxWidth, viewBoxX));
  viewBoxY = Math.max(minimapY, Math.min(minimapY + minimapSize - viewBoxHeight, viewBoxY));

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight);
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function gameLoop() {
  update();
  render();
  updateStatsDisplay();
  requestAnimationFrame(gameLoop);
}

gameLoop();
