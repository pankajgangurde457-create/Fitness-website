const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// @route   GET /api/progress
// @desc    Get progress weight entries history
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data: logs, error } = await supabase
      .from('progress_logs')
      .select('id, date, weight, note')
      .eq('user_id', userId)
      .not('weight', 'is', null)
      .order('date', { ascending: true });

    if (error) throw error;

    res.json(logs);
  } catch (err) {
    console.error('Error fetching progress logs:', err);
    res.status(500).json({ message: 'Failed to fetch progress logs.' });
  }
});

// @route   POST /api/progress
// @desc    Add a weight check-in log
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { weight, note } = req.body;

  if (weight === undefined || weight === null) {
    return res.status(400).json({ message: 'Weight is required.' });
  }

  const parsedWeight = parseFloat(weight);
  if (isNaN(parsedWeight) || parsedWeight <= 0) {
    return res.status(400).json({ message: 'Weight must be a positive number.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: newEntry, error } = await supabase
      .from('progress_logs')
      .insert({
        user_id: userId,
        date: today,
        weight: parsedWeight,
        note: note || null
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(newEntry);
  } catch (err) {
    console.error('Error adding weight progress entry:', err);
    res.status(500).json({ message: 'Failed to record progress entry.' });
  }
});

// @route   POST /api/progress/bmi
// @desc    Add a BMI history entry
router.post('/bmi', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { height, weight, bmi } = req.body;

  if (!height || !weight || !bmi) {
    return res.status(400).json({ message: 'Height, weight, and calculated BMI are required.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);

    const { data: newEntry, error } = await supabase
      .from('progress_logs')
      .insert({
        user_id: userId,
        date: today,
        height: parseFloat(height),
        weight: parseFloat(weight),
        bmi: parseFloat(bmi),
        note: `BMI Calculation: ${parseFloat(bmi).toFixed(1)}`
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(newEntry);
  } catch (err) {
    console.error('Error recording BMI entry:', err);
    res.status(500).json({ message: 'Failed to save BMI calculation.' });
  }
});

module.exports = router;
