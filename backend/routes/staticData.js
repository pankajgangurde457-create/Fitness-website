const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

const EXERCISES = [
  { name: 'Barbell Bench Press', cat: 'chest', level: 'Intermediate', tip: 'Keep shoulder blades pinned and feet flat throughout the lift.' },
  { name: 'Push-up', cat: 'chest', level: 'Beginner', tip: 'Keep a straight line from head to heels, elbows at ~45°.' },
  { name: 'Incline Dumbbell Press', cat: 'chest', level: 'Intermediate', tip: 'Set bench to 30-45°, control the descent.' },
  { name: 'Pull-up', cat: 'back', level: 'Advanced', tip: 'Full range of motion, avoid kipping unless training for it.' },
  { name: 'Bent-over Row', cat: 'back', level: 'Intermediate', tip: 'Hinge at hips, keep back flat, pull to lower ribs.' },
  { name: 'Lat Pulldown', cat: 'back', level: 'Beginner', tip: 'Pull to upper chest, avoid leaning back excessively.' },
  { name: 'Back Squat', cat: 'legs', level: 'Intermediate', tip: 'Brace core, knees track over toes, hit depth you can control.' },
  { name: 'Romanian Deadlift', cat: 'legs', level: 'Intermediate', tip: 'Soft knees, hinge at hips, keep bar close to legs.' },
  { name: 'Walking Lunge', cat: 'legs', level: 'Beginner', tip: 'Keep torso upright, front knee stacked over ankle.' },
  { name: 'Plank', cat: 'core', level: 'Beginner', tip: 'Squeeze glutes and abs, avoid sagging hips.' },
  { name: 'Hanging Leg Raise', cat: 'core', level: 'Advanced', tip: 'Control the swing, curl pelvis at the top.' },
  { name: 'Dead Bug', cat: 'core', level: 'Beginner', tip: 'Keep lower back pressed to the floor throughout.' },
  { name: 'Overhead Press', cat: 'shoulders', level: 'Intermediate', tip: 'Brace core, press bar in a straight line overhead.' },
  { name: 'Lateral Raise', cat: 'shoulders', level: 'Beginner', tip: 'Slight bend in elbows, lead with elbows not hands.' },
  { name: 'Face Pull', cat: 'shoulders', level: 'Beginner', tip: 'Pull to face height, squeeze shoulder blades together.' }
];

// @route   GET /api/exercises
// @desc    Get all exercises
router.get('/exercises', (req, res) => {
  res.json(EXERCISES);
});

// @route   GET /api/workouts
// @desc    Get workout plans from database
router.get('/workouts', async (req, res) => {
  try {
    const { data: workouts, error } = await supabase
      .from('workouts')
      .select('*');

    if (error) throw error;

    // Convert array back into the object map PLANS structure expected by frontend
    const PLANS = {};
    workouts.forEach(w => {
      PLANS[w.level] = {
        title: w.title,
        freq: w.frequency,
        desc: w.description,
        days: w.days
      };
    });

    res.json(PLANS);
  } catch (err) {
    console.error('Error fetching workouts:', err);
    // Return hardcoded fallback if db is empty or error
    res.json({
      beginner: {
        title: 'Foundation Builder', freq: '3 days / week', desc: 'Build the habit and learn correct form before adding load.',
        days: [
          { day: 'Day 1 — Full Body A', items: ['Bodyweight Squat — 3×12', 'Incline Push-up — 3×10', 'Assisted Row — 3×12', 'Plank — 3×30s'] },
          { day: 'Day 2 — Rest / Walk', items: ['20–30 min brisk walk', 'Light stretching'] },
          { day: 'Day 3 — Full Body B', items: ['Glute Bridge — 3×15', 'Wall Push-up — 3×12', 'Band Pull-apart — 3×15', 'Dead Bug — 3×10'] }
        ]
      }
    });
  }
});

module.exports = router;
