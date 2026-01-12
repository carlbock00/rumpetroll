const express = require('express');
const { userOps, progressOps } = require('./db');

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, username } = req.body;

    if (!email || !password || !username) {
      return res.status(400).json({ success: false, error: 'Email, password, and username are required' });
    }

    const result = await userOps.register(email, password, username);

    if (result.success) {
      // Set session
      req.session.userId = result.userId;
      req.session.username = result.username;

      res.json({
        success: true,
        user: {
          id: result.userId,
          username: result.username,
          email: email
        }
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = await userOps.login(email, password);

    if (result.success) {
      // Set session
      req.session.userId = result.userId;
      req.session.username = result.username;

      // Get progress
      const progress = progressOps.get(result.userId);

      res.json({
        success: true,
        user: {
          id: result.userId,
          username: result.username,
          email: result.email
        },
        progress: progress
      });
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
});

// Logout user
router.post('/logout', (req, res) => {
  // Clear session (cookie-session style)
  req.session = null;
  res.json({ success: true });
});

// Get current session
router.get('/session', (req, res) => {
  if (req.session.userId) {
    const user = userOps.getById(req.session.userId);
    const progress = progressOps.get(req.session.userId);

    res.json({
      loggedIn: true,
      user: {
        id: req.session.userId,
        username: req.session.username,
        email: user?.email
      },
      progress: progress
    });
  } else {
    res.json({ loggedIn: false });
  }
});

// Save progress (authenticated)
router.post('/save-progress', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not logged in' });
  }

  try {
    const { creatures, stats } = req.body;

    progressOps.save(req.session.userId, {
      creatures: creatures,
      totalFoodCollected: stats?.totalFoodCollected,
      totalKills: stats?.totalKills,
      totalDeaths: stats?.totalDeaths,
      playTimeSeconds: stats?.playTimeSeconds,
      highestEvolution: stats?.highestEvolution
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Save progress error:', error);
    res.status(500).json({ success: false, error: 'Failed to save progress' });
  }
});

// Clear progress on death (authenticated)
router.post('/clear-progress', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not logged in' });
  }

  try {
    // Clear creature data but keep stats (increment death count)
    progressOps.save(req.session.userId, {
      creatures: [], // Empty creatures = start fresh as tadpole
      totalDeaths: 1 // Increment death count
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Clear progress error:', error);
    res.status(500).json({ success: false, error: 'Failed to clear progress' });
  }
});

// Load progress (authenticated)
router.get('/load-progress', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ success: false, error: 'Not logged in' });
  }

  try {
    const progress = progressOps.get(req.session.userId);
    res.json({ success: true, progress: progress });
  } catch (error) {
    console.error('Load progress error:', error);
    res.status(500).json({ success: false, error: 'Failed to load progress' });
  }
});

// Admin: List all users (requires secret key)
router.get('/admin/users', (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== 'rumpetroll-admin-2024') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const users = userOps.listAll();
    res.json({ success: true, users });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ success: false, error: 'Failed to list users' });
  }
});

// Admin: Delete user by email (requires secret key)
router.delete('/admin/user/:email', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];

  // Simple secret key check - in production use environment variable
  if (adminKey !== 'rumpetroll-admin-2024') {
    return res.status(403).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const email = decodeURIComponent(req.params.email);
    const user = userOps.getByEmail(email);

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Delete progress first (foreign key)
    progressOps.delete(user.id);
    // Delete user
    userOps.delete(user.id);

    res.json({ success: true, message: `Deleted user ${email}` });
  } catch (error) {
    console.error('Admin delete error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete user' });
  }
});

module.exports = router;
