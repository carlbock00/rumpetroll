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
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    res.json({ success: true });
  });
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

module.exports = router;
