const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// Middleware to optionally parse authorization token if present
const parseOptionalUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        req.userId = user.id;
      }
    }
  } catch (e) {
    // Silently continue as guest
  }
  next();
};

// @route   GET /api/challenges
// @desc    Get all challenges and check if current user has joined them
router.get('/', parseOptionalUser, async (req, res) => {
  try {
    // 1. Fetch all challenges
    const { data: challenges, error } = await supabase
      .from('challenges')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    // 2. Fetch joined challenges for current user if logged in
    let joinedIds = new Set();
    if (req.userId) {
      const { data: participations } = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .eq('user_id', req.userId);
      
      if (participations) {
        participations.forEach(p => joinedIds.add(p.challenge_id));
      }
    }

    const result = challenges.map(c => ({
      id: c.id,
      title: c.title,
      days: c.days,
      participants: c.participants_count || 0,
      joined: joinedIds.has(c.id)
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching challenges:', err);
    res.status(500).json({ message: 'Failed to retrieve challenges.' });
  }
});

// @route   POST /api/challenges/:id/join
// @desc    Join or leave a challenge
router.post('/:id/join', requireAuth, async (req, res) => {
  const challengeId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(challengeId)) {
    return res.status(400).json({ message: 'Invalid challenge ID.' });
  }

  try {
    // 1. Check if challenge exists
    const { data: challenge, error: chError } = await supabase
      .from('challenges')
      .select('*')
      .eq('id', challengeId)
      .single();

    if (chError || !challenge) {
      return res.status(444).json({ message: 'Challenge not found.' });
    }

    // 2. Check if user is already participating
    const { data: participation, error: partError } = await supabase
      .from('challenge_participants')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('user_id', userId)
      .maybeSingle();

    if (partError) throw partError;

    let joined = false;
    if (participation) {
      // Already joined -> Leave the challenge
      const { error: deleteError } = await supabase
        .from('challenge_participants')
        .delete()
        .eq('challenge_id', challengeId)
        .eq('user_id', userId);

      if (deleteError) throw deleteError;
      joined = false;
    } else {
      // Not joined yet -> Join the challenge
      const { error: insertError } = await supabase
        .from('challenge_participants')
        .insert({
          challenge_id: challengeId,
          user_id: userId
        });

      if (insertError) throw insertError;
      joined = true;
    }

    // 3. Fetch updated challenge details
    const { data: updatedChallenge } = await supabase
      .from('challenges')
      .select('participants_count')
      .eq('id', challengeId)
      .single();

    res.json({
      id: challengeId,
      joined,
      participants: updatedChallenge ? updatedChallenge.participants_count : 0
    });

  } catch (err) {
    console.error('Error toggling challenge participation:', err);
    res.status(500).json({ message: 'Failed to update challenge status.' });
  }
});

module.exports = router;
