const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// @route   GET /api/trainer-bookings
// @desc    Get all bookings for the logged-in user
router.get('/', requireAuth, async (req, res) => {
  const userId = req.user.id;

  try {
    const { data: bookings, error } = await supabase
      .from('trainer_bookings')
      .select('id, trainer, date, time, type')
      .eq('user_id', userId)
      .order('date', { ascending: true })
      .order('time', { ascending: true });

    if (error) throw error;

    // Format the time slightly to remove seconds if present (e.g. "10:00:00" -> "10:00")
    const formattedBookings = bookings.map(b => ({
      id: b.id,
      trainer: b.trainer,
      date: b.date,
      time: b.time ? b.time.slice(0, 5) : '',
      type: b.type
    }));

    res.json(formattedBookings);
  } catch (err) {
    console.error('Error fetching bookings:', err);
    res.status(500).json({ message: 'Failed to retrieve bookings.' });
  }
});

// @route   POST /api/trainer-bookings
// @desc    Book a new trainer session
router.post('/', requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { trainer, date, time, type } = req.body;

  if (!trainer || !date || !time || !type) {
    return res.status(400).json({ message: 'Trainer, date, time, and session type are required.' });
  }

  try {
    const { data: booking, error } = await supabase
      .from('trainer_bookings')
      .insert({
        user_id: userId,
        trainer,
        date,
        time,
        type
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: booking.id,
      trainer: booking.trainer,
      date: booking.date,
      time: booking.time ? booking.time.slice(0, 5) : '',
      type: booking.type
    });
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).json({ message: 'Failed to create booking.' });
  }
});

module.exports = router;
