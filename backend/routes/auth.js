const express = require('express');
const router = express.Router();
const supabase = require('../config/supabaseClient');
const { requireAuth } = require('../middleware/authMiddleware');

// @route   POST /api/auth/register
// @desc    Register a new user
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  // Basic validation
  if (!name || !email || !password) {
    return res.status(400).json({ message: 'All fields (name, email, password) are required.' });
  }

  try {
    // 1. Sign up user via Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          role: 'member'
        }
      }
    });

    if (error) {
      console.error('Supabase Auth signUp error:', error);
      return res.status(400).json({ message: error.message || 'Registration failed.' });
    }

    const session = data.session;
    const user = data.user;

    // Check if the user record exists in the public users table yet.
    // If we have no session (meaning email confirmation is enabled), we return success message.
    if (!session) {
      return res.status(201).json({
        message: 'Registration successful. Please check your email to verify your account.',
        user: { name, email, role: 'member' }
      });
    }

    // Fetch the newly synced user from public.users table
    let dbUser = null;
    let retries = 3;
    while (retries > 0) {
      const { data: fetchUser } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (fetchUser) {
        dbUser = fetchUser;
        break;
      }
      // Wait 300ms for trigger to finish syncing
      await new Promise(resolve => setTimeout(resolve, 300));
      retries--;
    }

    if (!dbUser) {
      // Fallback if trigger hasn't run or is not deployed
      // Insert manually for local testing resilience
      const { data: newUser, error: insertError } = await supabase
        .from('users')
        .insert({ id: user.id, name, email, role: 'member', status: 'active' })
        .select()
        .single();

      if (insertError) {
        console.error('Manual user sync error:', insertError);
      }
      dbUser = newUser || { id: user.id, name, email, role: 'member', status: 'active' };
    }

    res.status(201).json({
      message: 'Registration successful.',
      token: session.access_token,
      user: dbUser
    });

  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error during registration.' });
  }
});

// @route   POST /api/auth/login
// @desc    Log in a user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const { session, user } = data;

    // Fetch full profile info from public.users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError || !dbUser) {
      return res.status(401).json({ message: 'User profile record not found. Please contact support.' });
    }

    if (dbUser.status !== 'active') {
      return res.status(403).json({ message: 'Your account is suspended.' });
    }

    res.json({
      message: 'Login successful.',
      token: session.access_token,
      user: dbUser
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error during login.' });
  }
});

// @route   POST /api/auth/logout
// @desc    Log out a user
router.post('/logout', async (req, res) => {
  try {
    await supabase.auth.signOut();
    res.json({ message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Server error during logout.' });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Request password reset email
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required.' });
  }

  try {
    // Check if user exists in public.users
    const { data: user } = await supabase
      .from('users')
      .select('email')
      .eq('email', email.toLowerCase())
      .single();

    if (!user) {
      // Return 200/success anyway for security (so hackers can't enumerate emails)
      return res.json({ message: 'If the email exists, a password reset link has been sent.' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${req.headers.origin || 'http://localhost:8080'}/login.html`
    });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    res.json({ message: 'If the email exists, a password reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ message: 'Server error during password reset request.' });
  }
});

// @route   GET /api/auth/session
// @desc    Get current session validation
router.get('/session', requireAuth, (req, res) => {
  res.json({
    user: req.user
  });
});

module.exports = router;
