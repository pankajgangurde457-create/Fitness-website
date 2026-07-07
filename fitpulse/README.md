# FitPulse — Fitness Website

A complete, front-end fitness website built with plain HTML, CSS and JavaScript
(no build tools, no framework required — just open in a browser or host anywhere).

## How to run

1. Unzip the folder.
2. Open `index.html` directly in your browser, **or**
3. For the best experience (some browsers restrict `localStorage` on `file://`),
   serve it locally:
   ```bash
   cd fitpulse
   python3 -m http.server 8080
   ```
   Then visit `http://localhost:8080`.

## Demo accounts

| Role  | Email               | Password  |
|-------|----------------------|-----------|
| Admin | admin@fitpulse.com   | admin123  |
| User  | demo@fitpulse.com    | demo1234  |

(You can also register a brand-new account from the Register page.)

## Pages included

- `index.html` — Home: hero, programs, testimonials
- `login.html` / `register.html` / `forgot-password.html` — Authentication
- `dashboard.html` — Profile, goals, calorie & water tracking
- `bmi-calculator.html` — BMI Calculator
- `workout-plans.html` — Beginner / Intermediate / Advanced plans
- `nutrition.html` — Nutrition & diet plans
- `progress-tracker.html` — Weight log with trend chart
- `ai-coach.html` — Rule-based AI Fitness Coach chat demo
- `exercise-library.html` — Filterable exercise library
- `challenges.html` — Join/leave challenges
- `community.html` — Community feed with likes
- `trainer-booking.html` — Book a trainer
- `blog.html` — Blog listing
- `contact.html` — Contact form
- `admin.html` — Admin panel (manage users, blogs, challenges)

## Notes / how it works

- **No backend** — all data (users, posts, bookings, progress, etc.) is stored in the
  browser's `localStorage`, seeded with demo data on first load. This is meant as a
  fully working front-end demo / starting point.
- **Dark/Light mode** — toggle switch in the navbar, saved in `localStorage`.
- **Responsive** — layouts collapse to single-column with a mobile nav menu below ~860px.
- **AI Fitness Coach** — currently a rule-based responder (`ai-coach.html`). To make it
  a real AI coach, replace the `reply()` function's logic with a call to the
  Anthropic API (see `js/app.js` for the shared helper pattern to follow).

## Connecting a real backend later

Every localStorage call goes through `FP.db.read(key, fallback)` and
`FP.db.write(key, value)` in `js/app.js`. To move to a real database/API, replace
just those two functions with `fetch()` calls to your backend — the rest of the
site's logic (forms, rendering) will keep working unchanged.

## Customize

- Colors, fonts and spacing: `css/style.css` (CSS variables at the top under `:root`
  and `[data-theme="light"]`).
- Shared logic: `js/app.js` (theme, nav, auth, seed data).
- Page-specific logic: inline `<script>` at the bottom of each HTML file, or
  `js/dashboard.js` for the dashboard.
