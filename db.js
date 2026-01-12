const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

// Initialize database
const dbPath = path.join(__dirname, 'rumpetroll.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  -- Users table
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    username TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
  );

  -- Player progress table (linked to user)
  CREATE TABLE IF NOT EXISTS player_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    creature_data TEXT, -- JSON blob for all creatures
    total_food_collected INTEGER DEFAULT 0,
    total_kills INTEGER DEFAULT 0,
    total_deaths INTEGER DEFAULT 0,
    play_time_seconds INTEGER DEFAULT 0,
    highest_evolution TEXT DEFAULT 'tadpole',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- Index for faster email lookups
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

const SALT_ROUNDS = 10;

// User operations
const userOps = {
  // Register a new user
  async register(email, password, username) {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate password length
    if (password.length < 6) {
      return { success: false, error: 'Password must be at least 6 characters' };
    }

    // Validate username
    if (!username || username.length < 2 || username.length > 20) {
      return { success: false, error: 'Username must be 2-20 characters' };
    }

    // Check if email already exists
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      return { success: false, error: 'Email already registered' };
    }

    try {
      // Hash password
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

      // Insert user
      const result = db.prepare(
        'INSERT INTO users (email, password_hash, username) VALUES (?, ?, ?)'
      ).run(email.toLowerCase(), passwordHash, username);

      // Create initial progress record
      db.prepare(
        'INSERT INTO player_progress (user_id) VALUES (?)'
      ).run(result.lastInsertRowid);

      return {
        success: true,
        userId: result.lastInsertRowid,
        username: username
      };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: 'Registration failed' };
    }
  },

  // Login user
  async login(email, password) {
    const user = db.prepare(
      'SELECT id, email, password_hash, username FROM users WHERE email = ?'
    ).get(email.toLowerCase());

    if (!user) {
      return { success: false, error: 'Invalid email or password' };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return { success: false, error: 'Invalid email or password' };
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    return {
      success: true,
      userId: user.id,
      username: user.username,
      email: user.email
    };
  },

  // Get user by ID
  getById(userId) {
    return db.prepare(
      'SELECT id, email, username, created_at, last_login FROM users WHERE id = ?'
    ).get(userId);
  },

  // Get user by email
  getByEmail(email) {
    return db.prepare(
      'SELECT id, email, username, created_at, last_login FROM users WHERE email = ?'
    ).get(email.toLowerCase());
  },

  // Delete user by ID
  delete(userId) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  },

  // List all users (admin)
  listAll() {
    return db.prepare('SELECT id, email, username, created_at, last_login FROM users').all();
  }
};

// Progress operations
const progressOps = {
  // Get player progress
  get(userId) {
    const progress = db.prepare(
      'SELECT * FROM player_progress WHERE user_id = ?'
    ).get(userId);

    if (progress && progress.creature_data) {
      progress.creature_data = JSON.parse(progress.creature_data);
    }

    return progress;
  },

  // Save player progress
  save(userId, data) {
    const existing = db.prepare('SELECT id FROM player_progress WHERE user_id = ?').get(userId);

    const creatureDataJson = data.creatures ? JSON.stringify(data.creatures) : null;

    if (existing) {
      db.prepare(`
        UPDATE player_progress SET
          creature_data = COALESCE(?, creature_data),
          total_food_collected = COALESCE(?, total_food_collected),
          total_kills = COALESCE(?, total_kills),
          total_deaths = COALESCE(?, total_deaths),
          play_time_seconds = COALESCE(?, play_time_seconds),
          highest_evolution = COALESCE(?, highest_evolution),
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).run(
        creatureDataJson,
        data.totalFoodCollected,
        data.totalKills,
        data.totalDeaths,
        data.playTimeSeconds,
        data.highestEvolution,
        userId
      );
    } else {
      db.prepare(`
        INSERT INTO player_progress (user_id, creature_data, total_food_collected, total_kills, total_deaths, play_time_seconds, highest_evolution)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        creatureDataJson,
        data.totalFoodCollected || 0,
        data.totalKills || 0,
        data.totalDeaths || 0,
        data.playTimeSeconds || 0,
        data.highestEvolution || 'tadpole'
      );
    }

    return { success: true };
  },

  // Update stats incrementally
  updateStats(userId, stats) {
    db.prepare(`
      UPDATE player_progress SET
        total_food_collected = total_food_collected + COALESCE(?, 0),
        total_kills = total_kills + COALESCE(?, 0),
        total_deaths = total_deaths + COALESCE(?, 0),
        play_time_seconds = play_time_seconds + COALESCE(?, 0),
        highest_evolution = CASE
          WHEN ? IS NOT NULL AND ? > highest_evolution THEN ?
          ELSE highest_evolution
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      stats.foodCollected,
      stats.kills,
      stats.deaths,
      stats.playTime,
      stats.highestEvolution,
      stats.highestEvolution,
      stats.highestEvolution,
      userId
    );
  },

  // Delete progress by user ID
  delete(userId) {
    return db.prepare('DELETE FROM player_progress WHERE user_id = ?').run(userId);
  }
};

// Close database on process exit
process.on('exit', () => db.close());
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});
process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

module.exports = {
  db,
  userOps,
  progressOps
};
