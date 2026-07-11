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

/* ---------------- API & DB helpers ---------------- */
// API URL: auto-detects environment at runtime (no build step required)
// - Production (Vercel): uses the Render backend URL
// - Local development: uses localhost:5000
FP.API_URL = (function() {
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5000/api';
  }
  // Production backend on Render
  return 'https://fitpulse-backend-oy6z.onrender.com/api';
})();

FP.apiCall = async function (endpoint, options = {}) {
  const token = localStorage.getItem('fp_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${FP.API_URL}${endpoint}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'API request failed');
  }
  return res.json();
};

FP.db = {
  // Legacy support - read from localStorage for non-database sync states (like theme)
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

/* seed local storage theme fallback (database seeding is handled by backend) */
FP.seed = function () {
  // No-op. Backend seeds the database automatically on start.
};

/* ---------------- Auth ---------------- */
FP.auth = {
  currentUser() {
    try {
      const u = localStorage.getItem('fp_session');
      return u ? JSON.parse(u) : null;
    } catch (e) {
      return null;
    }
  },
  async login(email, password) {
    try {
      const res = await FP.apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (res.token) {
        localStorage.setItem('fp_token', res.token);
        localStorage.setItem('fp_session', JSON.stringify(res.user));
        return { ok: true, user: res.user };
      }
      return { ok: false, msg: res.message || 'Login failed.' };
    } catch (err) {
      return { ok: false, msg: err.message };
    }
  },
  async register(name, email, password) {
    try {
      const res = await FP.apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      });
      // If email verification is enabled, we won't get a token immediately
      if (res.token) {
        localStorage.setItem('fp_token', res.token);
        localStorage.setItem('fp_session', JSON.stringify(res.user));
        return { ok: true, user: res.user };
      }
      return { ok: true, message: res.message, user: res.user };
    } catch (err) {
      return { ok: false, msg: err.message };
    }
  },
  async logout() {
    try {
      await FP.apiCall('/auth/logout', { method: 'POST' });
    } catch (e) {
      // Ignore network errors on logout
    }
    localStorage.removeItem('fp_token');
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
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await FP.auth.logout();
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
