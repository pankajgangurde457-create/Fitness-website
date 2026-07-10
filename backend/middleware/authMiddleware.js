const supabase = require('../config/supabaseClient');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required. No token provided.' });
    }

    const token = authHeader.split(' ')[1];
    
    // Retrieve user session details from Supabase Auth
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return res.status(401).json({ message: 'Session invalid or expired. Please login again.' });
    }

    // Fetch user role and status from public.users table
    const { data: dbUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (dbError || !dbUser) {
      // If public user doesn't exist yet, we can create one dynamically or return error.
      // Usually, the trigger handle_new_user creates it. If it doesn't exist, we return unauthorized.
      return res.status(401).json({ message: 'User record not found in public database.' });
    }

    if (dbUser.status !== 'active') {
      return res.status(403).json({ message: 'Your account is suspended. Please contact support.' });
    }

    // Attach to request
    req.user = dbUser;
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(500).json({ message: 'Internal server error during authentication.' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Access denied. Administrator privileges required.' });
  }
  next();
};

module.exports = {
  requireAuth,
  adminOnly
};
