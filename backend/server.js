const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const progressRoutes = require('./routes/progress');
const communityRoutes = require('./routes/community');
const challengesRoutes = require('./routes/challenges');
const bookingsRoutes = require('./routes/bookings');
const blogsRoutes = require('./routes/blogs');
const contactRoutes = require('./routes/contact');
const adminRoutes = require('./routes/admin');
const staticDataRoutes = require('./routes/staticData');

const seedDatabase = async () => {
  try {
    const seed = require('./config/seedData');
    await seed();
  } catch (e) {
    console.error('Seeding error:', e);
  }
};

const app = express();
const PORT = process.env.PORT || 5000;

// Security and utility middleware
app.use(helmet({
  contentSecurityPolicy: false, // Turn off CSP so it doesn't block local dev frontend assets/API calls
  crossOriginResourcePolicy: false
}));

app.use(cors({
  origin: '*', // Allow all origins for local pairing, or configure specifically in production
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests from this IP, please try again later.' }
});
app.use('/api/', apiLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Route mountings
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/community', communityRoutes);
app.use('/api/challenges', challengesRoutes);
app.use('/api/trainer-bookings', bookingsRoutes);
app.use('/api/blogs', blogsRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', staticDataRoutes);

// Catch-all route not found
app.use((req, res, next) => {
  res.status(404).json({ message: 'API endpoint not found.' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  const status = err.statusCode || 500;
  const msg = err.message || 'Internal server error.';
  res.status(status).json({ message: msg });
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}...`);
  // Seed the initial data on startup
  await seedDatabase();
});
