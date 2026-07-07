/* Dashboard logic: profile, goals, calories, water intake */
(function () {
  const user = FP.auth.requireAuth();
  if (!user) return;

  const KEY = 'fp_daily_' + user.id;
  const today = new Date().toISOString().slice(0, 10);

  function loadDay() {
    let d = FP.db.read(KEY, null);
    if (!d || d.date !== today) {
      d = { date: today, calories: 0, water: 0, calorieGoal: 2200, waterGoal: 3000 };
      FP.db.write(KEY, d);
    }
    return d;
  }

  function render() {
    const d = loadDay();
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('calNum').textContent = d.calories;
    document.getElementById('calGoal').textContent = d.calorieGoal;
    document.getElementById('waterNum').textContent = (d.water / 1000).toFixed(1) + 'L';
    document.getElementById('waterGoal').textContent = (d.waterGoal / 1000).toFixed(1) + 'L';
    document.getElementById('calBar').style.width = Math.min(100, (d.calories / d.calorieGoal) * 100) + '%';
    document.getElementById('waterBar').style.width = Math.min(100, (d.water / d.waterGoal) * 100) + '%';

    const goals = FP.db.read('fp_goals_' + user.id, { target: 'Lose Fat', weeklyWorkouts: 4 });
    document.getElementById('goalTarget').textContent = goals.target;
    document.getElementById('goalWorkouts').textContent = goals.weeklyWorkouts + '× / week';
  }

  document.getElementById('addCal').addEventListener('click', () => {
    const val = parseInt(document.getElementById('calInput').value) || 0;
    const d = loadDay();
    d.calories += val;
    FP.db.write(KEY, d);
    document.getElementById('calInput').value = '';
    render();
  });

  document.getElementById('addWater').addEventListener('click', () => {
    const d = loadDay();
    d.water += 250;
    FP.db.write(KEY, d);
    render();
  });

  document.getElementById('goalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    const fd = new FormData(this);
    FP.db.write('fp_goals_' + user.id, {
      target: fd.get('target'),
      weeklyWorkouts: fd.get('weeklyWorkouts')
    });
    render();
  });

  render();
})();
