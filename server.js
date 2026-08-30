const express = require('express');
const cors = require('cors');
require('dotenv').config();
const db = require('./db');

const app = express();

app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// -------------------------------------------------------------
// USER ROUTES
// -------------------------------------------------------------

// Create or login user
app.post('/api/users', async (req, res) => {
  const { id, email, display_name } = req.body;
  if (!id || !email) {
    return res.status(400).json({ error: 'id and email are required' });
  }

  try {
    const query = `
      INSERT INTO users (id, email, display_name)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE display_name = VALUES(display_name);
    `;
    await db.execute(query, [id, email, display_name || 'Explorer']);
    res.status(200).json({ message: 'User created/updated successfully', id });
  } catch (err) {
    console.error('Error inserting user:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// -------------------------------------------------------------
// EXPLORATION STATS ROUTES
// -------------------------------------------------------------

// Sync exploration stats from phone
app.post('/api/stats/sync', async (req, res) => {
  const { user_id, total_area_m2, total_tiles_revealed, total_distance_km } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  try {
    const query = `
      INSERT INTO user_exploration_stats (user_id, total_area_m2, total_tiles_revealed, total_distance_km)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_area_m2 = VALUES(total_area_m2),
        total_tiles_revealed = VALUES(total_tiles_revealed),
        total_distance_km = VALUES(total_distance_km);
    `;
    await db.execute(query, [
      user_id,
      total_area_m2 || 0,
      total_tiles_revealed || 0,
      total_distance_km || 0
    ]);
    res.status(200).json({ message: 'Stats synced successfully' });
  } catch (err) {
    console.error('Error syncing stats:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get stats for a user
app.get('/api/stats/:user_id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT * FROM user_exploration_stats WHERE user_id = ?',
      [req.params.user_id]
    );
    res.status(200).json(rows[0] || { total_area_m2: 0, total_tiles_revealed: 0, total_distance_km: 0 });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

// -------------------------------------------------------------
// MILESTONES ROUTES
// -------------------------------------------------------------

// Sync unlocked milestone
app.post('/api/milestones/sync', async (req, res) => {
  const { user_id, milestone_id } = req.body;
  if (!user_id || !milestone_id) {
    return res.status(400).json({ error: 'user_id and milestone_id are required' });
  }

  try {
    const query = `
      INSERT IGNORE INTO user_milestones (user_id, milestone_id)
      VALUES (?, ?);
    `;
    await db.execute(query, [user_id, milestone_id]);
    res.status(200).json({ message: 'Milestone recorded' });
  } catch (err) {
    console.error('Error syncing milestone:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all unlocked milestones for a user
app.get('/api/milestones/:user_id', async (req, res) => {
  try {
    const [rows] = await db.execute(
      'SELECT milestone_id, unlocked_at FROM user_milestones WHERE user_id = ?',
      [req.params.user_id]
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Server running on http://localhost:${PORT}`);
});
// Get active quests with user progress
app.get('/api/quests/:user_id', async (req, res) => {
  try {
    const query = `
      SELECT q.*, COALESCE(uq.progress, 0) as progress, COALESCE(uq.is_completed, FALSE) as is_completed
      FROM quests q
      LEFT JOIN user_quests uq ON q.id = uq.quest_id AND uq.user_id = ?
    `;
    const [rows] = await db.execute(query, [req.params.user_id]);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Collect Mystery Chest & Award XP/Coins
app.post('/api/collectibles/collect', async (req, res) => {
  const { user_id, collectible_id, xp_value, coin_value } = req.body;
  if (!user_id || !collectible_id) return res.status(400).json({ error: 'Missing user_id or collectible_id' });

  try {
    await db.execute('INSERT IGNORE INTO user_collectibles (user_id, collectible_id) VALUES (?, ?)', [user_id, collectible_id]);
    await db.execute(`
      UPDATE user_exploration_stats 
      SET total_xp = total_xp + ?, 
          coins_collected = coins_collected + ?,
          current_level = FLOOR(1 + SQRT((total_xp + ?) / 100))
      WHERE user_id = ?
    `, [xp_value || 50, coin_value || 25, xp_value || 50, user_id]);

    res.status(200).json({ message: 'Collectible recorded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});