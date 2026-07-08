const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth, adminOnly } = require('../middleware/authMiddleware');

// Apply admin protection to all routes in this file
router.use(requireAuth);
router.use(adminOnly);

// @route   GET /api/admin/users
// @desc    Get all users (Admin only)
router.get('/users', async (req, res) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, role, joined, status')
      .order('joined', { ascending: false });

    if (error) throw error;

    res.json(users);
  } catch (err) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({ message: 'Failed to retrieve users.' });
  }
});

// @route   POST /api/admin/users/:id/toggle-status
// @desc    Suspend or activate a user account (Admin only)
router.post('/users/:id/toggle-status', async (req, res) => {
  const targetUserId = req.params.id;

  if (targetUserId === req.user.id) {
    return res.status(400).json({ message: 'You cannot suspend your own admin account.' });
  }

  try {
    // 1. Fetch target user current status
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('status')
      .eq('id', targetUserId)
      .single();

    if (fetchError || !user) {
      return res.status(444).json({ message: 'User not found.' });
    }

    const nextStatus = user.status === 'active' ? 'suspended' : 'active';

    // 2. Update status in public database
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ status: nextStatus })
      .eq('id', targetUserId)
      .select()
      .single();

    if (updateError) throw updateError;

    // 3. Optional: Sync suspension to Supabase Auth if using direct features (e.g. banning user)
    // Supabase auth admin API can ban users by setting ban_duration to "none" or "infinite"
    // Since service_role key bypasses RLS and can run auth admin operations, we can call:
    // await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: nextStatus === 'suspended' ? 'infinite' : 'none' });
    if (nextStatus === 'suspended') {
      await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'infinite' }).catch(err => {
        console.error('Auth ban sync warning:', err.message);
      });
    } else {
      await supabase.auth.admin.updateUserById(targetUserId, { ban_duration: 'none' }).catch(err => {
        console.error('Auth unban sync warning:', err.message);
      });
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('Error toggling user status:', err);
    res.status(500).json({ message: 'Failed to update user status.' });
  }
});

// @route   POST /api/admin/blogs
// @desc    Create a new blog post (Admin only)
router.post('/blogs', async (req, res) => {
  const { title, tag } = req.body;
  const adminName = req.user.name;

  if (!title || !tag) {
    return res.status(400).json({ message: 'Blog title and tag are required.' });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data: blog, error } = await supabase
      .from('blogs')
      .insert({
        title: title.trim(),
        tag: tag.trim(),
        author: adminName,
        date: today,
        excerpt: 'New post added by admin.',
        content: 'Full content of the blog post...'
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(blog);
  } catch (err) {
    console.error('Error creating blog post:', err);
    res.status(500).json({ message: 'Failed to create blog post.' });
  }
});

// @route   DELETE /api/admin/blogs/:id
// @desc    Delete a blog post (Admin only)
router.delete('/blogs/:id', async (req, res) => {
  const blogId = parseInt(req.params.id);

  if (isNaN(blogId)) {
    return res.status(400).json({ message: 'Invalid blog ID.' });
  }

  try {
    const { error } = await supabase
      .from('blogs')
      .delete()
      .eq('id', blogId);

    if (error) throw error;

    res.json({ message: 'Blog post deleted successfully.' });
  } catch (err) {
    console.error('Error deleting blog post:', err);
    res.status(500).json({ message: 'Failed to delete blog post.' });
  }
});

// @route   GET /api/admin/challenges
// @desc    Get all challenges for admin dashboard (Admin only)
router.get('/challenges', async (req, res) => {
  try {
    const { data: challenges, error } = await supabase
      .from('challenges')
      .select('id, title, days, participants_count')
      .order('id', { ascending: true });

    if (error) throw error;

    const result = challenges.map(c => ({
      id: c.id,
      title: c.title,
      days: c.days,
      participants: c.participants_count || 0
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching admin challenges:', err);
    res.status(500).json({ message: 'Failed to retrieve challenges.' });
  }
});

module.exports = router;
