/* =========================================================
   FITPULSE — shared app logic
   Works purely client-side with localStorage.
   (No backend — swap FP.api.* calls with real API calls later.)
   ========================================================= */

const FP = {};

/* ---------------- Theme ---------------- */
FP.initTheme = function () {
  const saved = localStorage.getItem('fp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  const toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('fp_theme', next);
    });
  }
};

/* ---------------- Mobile nav ---------------- */
FP.initNav = function () {
  const btn = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');
  if (btn && links) {
    btn.addEventListener('click', () => links.classList.toggle('open'));
  }
  // highlight current page link
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === path) a.classList.add('active');
  });
};

/* ---------------- Fake "DB" helpers (localStorage) ---------------- */
FP.db = {
  read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  },
  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
};

/* seed a demo admin + demo user so login/admin panel aren't empty */
FP.seed = function () {
  let users = FP.db.read('fp_users', null);
  if (!users) {
    users = [
      { id: 1, name: 'Admin User', email: 'admin@fitpulse.com', password: 'admin123', role: 'admin', joined: '2026-01-04', status: 'active' },
      { id: 2, name: 'Rohit Sharma', email: 'demo@fitpulse.com', password: 'demo1234', role: 'member', joined: '2026-02-11', status: 'active' },
      { id: 3, name: 'Sneha Patil', email: 'sneha@fitpulse.com', password: 'demo1234', role: 'member', joined: '2026-03-02', status: 'active' }
    ];
    FP.db.write('fp_users', users);
  }
  if (!FP.db.read('fp_blogs', null)) {
    FP.db.write('fp_blogs', [
      { id: 1, title: '5 Mistakes Beginners Make in the Gym', author: 'Coach Aman', date: '2026-06-02', tag: 'Training', excerpt: 'Skipping warm-ups to chasing heavy weight too soon — here is what to fix first.' },
      { id: 2, title: 'How Much Protein Do You Actually Need?', author: 'Dr. Neha Kulkarni', date: '2026-06-14', tag: 'Nutrition', excerpt: 'A simple, evidence-based way to calculate your daily protein target.' },
      { id: 3, title: 'Why Rest Days Make You Stronger', author: 'Coach Aman', date: '2026-06-28', tag: 'Recovery', excerpt: 'Muscle grows during recovery, not during the workout. Here is the science.' }
    ]);
  }
  if (!FP.db.read('fp_challenges', null)) {
    FP.db.write('fp_challenges', [
      { id: 1, title: '30-Day Plank Challenge', participants: 482, days: 30, joined: false },
      { id: 2, title: '10K Steps Everyday', participants: 1203, days: 21, joined: false },
      { id: 3, title: 'No Sugar August', participants: 356, days: 31, joined: false },
      { id: 4, title: 'Push-Up Progression', participants: 640, days: 14, joined: false }
    ]);
  }
};

/* ---------------- Auth ---------------- */
FP.auth = {
  currentUser() {
    return FP.db.read('fp_session', null);
  },
  login(email, password) {
    const users = FP.db.read('fp_users', []);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.password === password);
    if (!user) return { ok: false, msg: 'Invalid email or password.' };
    FP.db.write('fp_session', user);
    return { ok: true, user };
  },
  register(name, email, password) {
    const users = FP.db.read('fp_users', []);
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { ok: false, msg: 'An account with this email already exists.' };
    }
    const user = { id: Date.now(), name, email, password, role: 'member', joined: new Date().toISOString().slice(0, 10), status: 'active' };
    users.push(user);
    FP.db.write('fp_users', users);
    FP.db.write('fp_session', user);
    return { ok: true, user };
  },
  logout() {
    localStorage.removeItem('fp_session');
  },
  requireAuth() {
    const u = FP.auth.currentUser();
    if (!u) { location.href = 'login.html'; }
    return u;
  },
  requireAdmin() {
    const u = FP.auth.currentUser();
    if (!u || u.role !== 'admin') { location.href = 'login.html'; }
    return u;
  }
};

/* ---------------- Navbar auth-state render ---------------- */
FP.renderAuthNav = function () {
  const slot = document.getElementById('authSlot');
  if (!slot) return;
  const user = FP.auth.currentUser();
  if (user) {
    slot.innerHTML = `
      <a href="dashboard.html" class="btn btn-outline btn-sm">${user.name.split(' ')[0]}</a>
      <button class="btn btn-primary btn-sm" id="logoutBtn">Logout</button>`;
    document.getElementById('logoutBtn').addEventListener('click', () => {
      FP.auth.logout();
      location.href = 'index.html';
    });
  } else {
    slot.innerHTML = `
      <a href="login.html" class="btn btn-outline btn-sm">Log in</a>
      <a href="register.html" class="btn btn-primary btn-sm">Join Free</a>`;
  }
};

FP.showMsg = function (el, ok, text) {
  el.textContent = text;
  el.classList.remove('ok', 'err');
  el.classList.add('show', ok ? 'ok' : 'err');
};

document.addEventListener('DOMContentLoaded', () => {
  FP.seed();
  FP.initTheme();
  FP.initNav();
  FP.renderAuthNav();
});
