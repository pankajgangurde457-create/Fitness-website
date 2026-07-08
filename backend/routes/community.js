const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// Relative time formatting helper
function getRelativeTime(dateString) {
  const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
  if (seconds < 60) return 'just now';
  
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + 'y ago';
  
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + 'mo ago';
  
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + 'd ago';
  
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + 'h ago';
  
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + 'm ago';
  
  return 'just now';
}

// @route   GET /api/community/posts
// @desc    Get all community posts with likes counts
router.get('/posts', async (req, res) => {
  try {
    // Fetch posts and count from the likes table for each post
    const { data: posts, error } = await supabase
      .from('community_posts')
      .select(`
        id,
        user_id,
        author_name,
        text,
        created_at,
        likes:likes(count)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const formattedPosts = posts.map(p => ({
      id: p.id,
      author: p.author_name,
      time: getRelativeTime(p.created_at),
      text: p.text,
      likes: p.likes && p.likes[0] ? p.likes[0].count : 0
    }));

    res.json(formattedPosts);
  } catch (err) {
    console.error('Error fetching community posts:', err);
    res.status(500).json({ message: 'Failed to retrieve posts.' });
  }
});

// @route   POST /api/community/posts
// @desc    Create a new community post
router.post('/posts', requireAuth, async (req, res) => {
  const { text } = req.body;
  const user = req.user;

  if (!text || text.trim() === '') {
    return res.status(400).json({ message: 'Post content cannot be empty.' });
  }

  try {
    const { data: post, error } = await supabase
      .from('community_posts')
      .insert({
        user_id: user.id,
        author_name: user.name,
        text: text.trim()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: post.id,
      author: post.author_name,
      time: 'just now',
      text: post.text,
      likes: 0
    });
  } catch (err) {
    console.error('Error creating post:', err);
    res.status(500).json({ message: 'Failed to submit post.' });
  }
});

// @route   POST /api/community/posts/:id/like
// @desc    Like a community post
router.post('/posts/:id/like', requireAuth, async (req, res) => {
  const postId = parseInt(req.params.id);
  const userId = req.user.id;

  if (isNaN(postId)) {
    return res.status(400).json({ message: 'Invalid post ID.' });
  }

  try {
    // 1. Check if post exists
    const { data: post, error: postError } = await supabase
      .from('community_posts')
      .select('id')
      .eq('id', postId)
      .single();

    if (postError || !post) {
      return res.status(444).json({ message: 'Post not found.' });
    }

    // 2. Insert like (if it already exists, it will fail due to unique constraint, but we can catch it or use upsert)
    const { error: likeError } = await supabase
      .from('likes')
      .insert({
        post_id: postId,
        user_id: userId
      });

    // PGRST116/23505 unique constraint violation means already liked
    if (likeError && likeError.code !== '23505') {
      throw likeError;
    }

    // 3. Count total likes for this post
    const { count, error: countError } = await supabase
      .from('likes')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

    if (countError) throw countError;

    res.json({ id: postId, likes: count });
  } catch (err) {
    console.error('Error liking post:', err);
    res.status(500).json({ message: 'Failed to like post.' });
  }
});

module.exports = router;
