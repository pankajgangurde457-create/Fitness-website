const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// Helper to get formatted date "YYYY-MM-DD" in local time zone
const getLocalDateString = () => {
  return new Date().toISOString().slice(0, 10);
};

// @route   GET /api/dashboard
// @desc    Get dashboard details (calories, water logs, and goals) for today
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = getLocalDateString();

  try {
    // 1. Get or create today's nutrition log
    let { data: nutrition, error: nutrError } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (nutrError) throw nutrError;

    if (!nutrition) {
      const { data: newNutr, error: createError } = await supabase
        .from('nutrition_logs')
        .insert({ user_id: userId, date: today, calories: 0, calorie_goal: 2200 })
        .select()
        .single();
      if (createError) throw createError;
      nutrition = newNutr;
    }

    // 2. Get or create today's water log
    let { data: waterLog, error: waterError } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .maybeSingle();

    if (waterError) throw waterError;

    if (!waterLog) {
      const { data: newWater, error: createError } = await supabase
        .from('water_logs')
        .insert({ user_id: userId, date: today, water: 0, water_goal: 3000 })
        .select()
        .single();
      if (createError) throw createError;
      waterLog = newWater;
    }

    // 3. Get user goals from profiles
    let { data: profile, error: profError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profError) throw profError;

    if (!profile) {
      const { data: newProf, error: createError } = await supabase
        .from('profiles')
        .insert({ id: userId, target_goal: 'Lose Fat', weekly_workouts: 4 })
        .select()
        .single();
      if (createError) throw createError;
      profile = newProf;
    }

    res.json({
      calories: nutrition.calories,
      calorieGoal: nutrition.calorie_goal,
      water: waterLog.water,
      waterGoal: waterLog.water_goal,
      target: profile.target_goal,
      weeklyWorkouts: profile.weekly_workouts
    });

  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    res.status(500).json({ message: 'Failed to fetch dashboard data.' });
  }
});

// @route   POST /api/dashboard/calories
// @desc    Add calories to today's intake
router.post('/calories', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = getLocalDateString();
  const caloriesToAdd = parseInt(req.body.calories) || 0;

  if (caloriesToAdd < 0) {
    return res.status(400).json({ message: 'Calories cannot be negative.' });
  }

  try {
    // 1. Fetch today's log
    const { data: nutrition, error: fetchError } = await supabase
      .from('nutrition_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    let updatedCalories = caloriesToAdd;
    if (nutrition) {
      updatedCalories += nutrition.calories;
    }

    // 2. Upsert (update or insert)
    const { data: result, error: upsertError } = await supabase
      .from('nutrition_logs')
      .upsert({
        user_id: userId,
        date: today,
        calories: updatedCalories,
        calorie_goal: nutrition ? nutrition.calorie_goal : 2200
      }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (upsertError) throw upsertError;

    res.json({ calories: result.calories, calorieGoal: result.calorie_goal });
  } catch (err) {
    console.error('Error adding calories:', err);
    res.status(500).json({ message: 'Failed to log calories.' });
  }
});

// @route   POST /api/dashboard/water
// @desc    Add water (increments by 250ml) to today's log
router.post('/water', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const today = getLocalDateString();

  try {
    const { data: waterLog, error: fetchError } = await supabase
      .from('water_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('date', today)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

    let updatedWater = 250;
    if (waterLog) {
      updatedWater += waterLog.water;
    }

    const { data: result, error: upsertError } = await supabase
      .from('water_logs')
      .upsert({
        user_id: userId,
        date: today,
        water: updatedWater,
        water_goal: waterLog ? waterLog.water_goal : 3000
      }, { onConflict: 'user_id,date' })
      .select()
      .single();

    if (upsertError) throw upsertError;

    res.json({ water: result.water, waterGoal: result.water_goal });
  } catch (err) {
    console.error('Error logging water:', err);
    res.status(500).json({ message: 'Failed to log water.' });
  }
});

// @route   POST /api/dashboard/goals
// @desc    Update target goal and weekly workout goals
router.post('/goals', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { target, weeklyWorkouts } = req.body;

  if (!target || weeklyWorkouts === undefined) {
    return res.status(400).json({ message: 'Target goal and weekly workouts frequency are required.' });
  }

  const workoutsNum = parseInt(weeklyWorkouts);
  if (isNaN(workoutsNum) || workoutsNum < 0) {
    return res.status(400).json({ message: 'Workouts frequency must be a non-negative integer.' });
  }

  try {
    const { data: result, error } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        target_goal: target,
        weekly_workouts: workoutsNum,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ target: result.target_goal, weeklyWorkouts: result.weekly_workouts });
  } catch (err) {
    console.error('Error updating profile goals:', err);
    res.status(500).json({ message: 'Failed to update goals.' });
  }
});

module.exports = router;
