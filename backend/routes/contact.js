const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// @route   POST /api/contact
// @desc    Submit a contact form message
router.post('/', async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Name, email, and message are required.' });
  }

  try {
    const { data, error } = await supabase
      .from('contact_messages')
      .insert({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        message: message.trim()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      message: 'Message submitted successfully.',
      id: data.id
    });
  } catch (err) {
    console.error('Error submitting contact message:', err);
    res.status(500).json({ message: 'Failed to submit contact message.' });
  }
});

module.exports = router;
