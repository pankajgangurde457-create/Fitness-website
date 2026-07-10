const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');

// @route   GET /api/blogs
// @desc    Get all blog posts
router.get('/', async (req, res) => {
  try {
    const { data: blogs, error } = await supabase
      .from('blogs')
      .select('id, title, author, date, tag, excerpt')
      .order('date', { ascending: false });

    if (error) throw error;

    res.json(blogs);
  } catch (err) {
    console.error('Error fetching blogs:', err);
    res.status(500).json({ message: 'Failed to retrieve blog posts.' });
  }
});

module.exports = router;
