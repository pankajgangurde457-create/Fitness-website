const http = require('http');

const API_URL = 'http://localhost:5000/api';
const testEmail = `test_${Date.now()}@fitpulse.com`;
const testPassword = 'Password123!';
let userToken = '';
let userId = '';
let testPostId = null;
let testChallengeId = 1;

const request = (method, path, body = null, headers = {}) => {
  return new Promise((resolve, reject) => {
    const url = new URL(`${API_URL}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (userToken) {
      options.headers['Authorization'] = `Bearer ${userToken}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
};

const runTests = async () => {
  console.log('==================================================');
  console.log('FITPULSE BACKEND API ENDPOINT TEST SUITE');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`[PASS] - ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] - ${testName}`);
      if (details) console.error(`       Detail:`, details);
      failed++;
    }
  };

  try {
    // 1. Health Check
    const health = await request('GET', '/../../health'); // Resolve to /health
    assert(health.statusCode === 200 && health.data.status === 'ok', 'Health Check Endpoint');

    // 2. Auth - Register Test User
    const register = await request('POST', '/auth/register', {
      name: 'Test Runner User',
      email: testEmail,
      password: testPassword
    });
    
    // In case email confirmation is enabled, we won't get token, but user is registered
    const registeredSuccessfully = register.statusCode === 201;
    assert(registeredSuccessfully, 'Auth - Register Account API', JSON.stringify(register.data));
    
    if (register.data && register.data.token) {
      userToken = register.data.token;
      userId = register.data.user.id;
    }

    // 3. Auth - Login
    const login = await request('POST', '/auth/login', {
      email: testEmail,
      password: testPassword
    });
    assert(login.statusCode === 200 && login.data.token !== undefined, 'Auth - Login API', JSON.stringify(login.data));
    
    if (login.data && login.data.token) {
      userToken = login.data.token;
      userId = login.data.user.id;
    }

    // 4. Auth - Validate Session
    const session = await request('GET', '/auth/session');
    assert(session.statusCode === 200 && session.data.user.email === testEmail, 'Auth - Session Validation API', JSON.stringify(session.data));

    // 5. Dashboard - Get Today's Logs and Goals
    const dashboard = await request('GET', '/dashboard');
    assert(dashboard.statusCode === 200 && dashboard.data.calories !== undefined, 'Dashboard - Fetch Daily Data API', JSON.stringify(dashboard.data));

    // 6. Dashboard - Log Calories
    const calories = await request('POST', '/dashboard/calories', { calories: 500 });
    assert(calories.statusCode === 200 && calories.data.calories >= 500, 'Dashboard - Log Calories API', JSON.stringify(calories.data));

    // 7. Dashboard - Log Water
    const water = await request('POST', '/dashboard/water');
    assert(water.statusCode === 200 && water.data.water === 250, 'Dashboard - Log Water API', JSON.stringify(water.data));

    // 8. Dashboard - Update Goals
    const goals = await request('POST', '/dashboard/goals', { target: 'Gain Muscle', weeklyWorkouts: 5 });
    assert(goals.statusCode === 200 && goals.data.target === 'Gain Muscle', 'Dashboard - Update Goals API', JSON.stringify(goals.data));

    // 9. Progress - Fetch Weight Progress Entries
    const progressGet = await request('GET', '/progress');
    assert(progressGet.statusCode === 200 && Array.isArray(progressGet.data), 'Progress - Get Weight Entries API', JSON.stringify(progressGet.data));

    // 10. Progress - Add Weight Entry
    const progressAdd = await request('POST', '/progress', { weight: 72.5, note: 'Morning weight' });
    assert(progressAdd.statusCode === 201 && progressAdd.data.weight === 72.5, 'Progress - Add Weight Entry API', JSON.stringify(progressAdd.data));

    // 11. Progress - Save BMI History
    const bmiSave = await request('POST', '/progress/bmi', { height: 175, weight: 72.5, bmi: 23.7 });
    assert(bmiSave.statusCode === 201, 'Progress - Save BMI History API', JSON.stringify(bmiSave.data));

    // 12. Community - Fetch Feed Posts
    const communityFeed = await request('GET', '/community/posts');
    assert(communityFeed.statusCode === 200 && Array.isArray(communityFeed.data), 'Community - Get Feed Posts API', JSON.stringify(communityFeed.data));

    // 13. Community - Create Post
    const communityPost = await request('POST', '/community/posts', { text: 'Testing community post api endpoint!' });
    assert(communityPost.statusCode === 201 && communityPost.data.text !== undefined, 'Community - Create Feed Post API', JSON.stringify(communityPost.data));
    
    if (communityPost.data && communityPost.data.id) {
      testPostId = communityPost.data.id;
    }

    // 14. Community - Like Post
    if (testPostId) {
      const communityLike = await request('POST', `/community/posts/${testPostId}/like`);
      assert(communityLike.statusCode === 200 && communityLike.data.likes === 1, 'Community - Like Post API', JSON.stringify(communityLike.data));
    } else {
      console.warn('Skipping post liking test because post ID is not available.');
    }

    // 15. Challenges - Fetch Challenges List
    const challenges = await request('GET', '/challenges');
    assert(challenges.statusCode === 200 && Array.isArray(challenges.data), 'Challenges - Fetch Challenges List API', JSON.stringify(challenges.data));
    if (challenges.data && challenges.data.length > 0) {
      testChallengeId = challenges.data[0].id;
    }

    // 16. Challenges - Join Challenge
    const challengeJoin = await request('POST', `/challenges/${testChallengeId}/join`);
    assert(challengeJoin.statusCode === 200 && challengeJoin.data.joined === true, 'Challenges - Join Challenge API', JSON.stringify(challengeJoin.data));

    // 17. Bookings - Create Booking
    const bookingAdd = await request('POST', '/trainer-bookings', {
      trainer: 'Coach Aman — Strength & Conditioning',
      date: '2026-07-15',
      time: '10:00',
      type: 'Online'
    });
    assert(bookingAdd.statusCode === 201 && bookingAdd.data.trainer !== undefined, 'Bookings - Create Session Booking API', JSON.stringify(bookingAdd.data));

    // 18. Bookings - Fetch Bookings
    const bookingsGet = await request('GET', '/trainer-bookings');
    assert(bookingsGet.statusCode === 200 && bookingsGet.data.length > 0, 'Bookings - Get Bookings List API', JSON.stringify(bookingsGet.data));

    // 19. Blogs - Get Blogs List
    const blogs = await request('GET', '/blogs');
    assert(blogs.statusCode === 200 && Array.isArray(blogs.data), 'Blogs - Get Blogs List API', JSON.stringify(blogs.data));

    // 20. Contact - Submit Message
    const contact = await request('POST', '/contact', {
      name: 'John Doe',
      email: 'john@example.com',
      message: 'Hello, testing backend API message submission.'
    });
    assert(contact.statusCode === 201, 'Contact - Form Submission API', JSON.stringify(contact.data));

    // 21. Static Data - Exercises
    const exercises = await request('GET', '/exercises');
    assert(exercises.statusCode === 200 && Array.isArray(exercises.data), 'Static Data - Get Exercises List API', JSON.stringify(exercises.data));

    // 22. Static Data - Workouts
    const workouts = await request('GET', '/workouts');
    assert(workouts.statusCode === 200 && workouts.data.beginner !== undefined, 'Static Data - Get Workout Plans API', JSON.stringify(workouts.data));

    // 23. Admin - Try Unauthorized Access
    const unauthorizedAdmin = await request('GET', '/admin/users');
    assert(unauthorizedAdmin.statusCode === 403, 'Admin - Prevent Unauthorized Access (Access Denied)');

    // 24. Auth - Logout
    const logout = await request('POST', '/auth/logout');
    assert(logout.statusCode === 200, 'Auth - Logout API');

    // 25. Auth - Reset Token Verification
    const postLogoutSession = await request('GET', '/auth/session');
    assert(postLogoutSession.statusCode === 401, 'Auth - Token Revocation verification');

  } catch (err) {
    console.error('Unhandled test execution error:', err);
  }

  console.log('\n==================================================');
  console.log(`TEST EXECUTION SUMMARY:`);
  console.log(`  PASSED: ${passed}`);
  console.log(`  FAILED: ${failed}`);
  console.log('==================================================');
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
};

runTests();
