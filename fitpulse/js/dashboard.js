/* Dashboard logic: profile, goals, calories, water intake connected to backend APIs */
(function () {
  const user = FP.auth.requireAuth();
  if (!user) return;

  async function fetchDashboardData() {
    try {
      const data = await FP.apiCall('/dashboard');
      return data;
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
      // Fallback defaults if API fails
      return { calories: 0, calorieGoal: 2200, water: 0, waterGoal: 3000, target: 'Lose Fat', weeklyWorkouts: 4 };
    }
  }

  async function render() {
    const d = await fetchDashboardData();
    
    document.getElementById('userName').textContent = user.name;
    document.getElementById('userEmail').textContent = user.email;
    document.getElementById('calNum').textContent = d.calories;
    document.getElementById('calGoal').textContent = d.calorieGoal;
    document.getElementById('waterNum').textContent = (d.water / 1000).toFixed(1) + 'L';
    document.getElementById('waterGoal').textContent = (d.waterGoal / 1000).toFixed(1) + 'L';
    
    document.getElementById('calBar').style.width = Math.min(100, (d.calories / d.calorieGoal) * 100) + '%';
    document.getElementById('waterBar').style.width = Math.min(100, (d.water / d.waterGoal) * 100) + '%';

    document.getElementById('goalTarget').textContent = d.target;
    document.getElementById('goalWorkouts').textContent = d.weeklyWorkouts + '× / week';
  }

  document.getElementById('addCal').addEventListener('click', async () => {
    const val = parseInt(document.getElementById('calInput').value) || 0;
    if (val <= 0) return;
    
    try {
      await FP.apiCall('/dashboard/calories', {
        method: 'POST',
        body: JSON.stringify({ calories: val })
      });
      document.getElementById('calInput').value = '';
      await render();
    } catch (err) {
      console.error('Failed to log calories:', err);
    }
  });

  document.getElementById('addWater').addEventListener('click', async () => {
    try {
      await FP.apiCall('/dashboard/water', {
        method: 'POST'
      });
      await render();
    } catch (err) {
      console.error('Failed to log water:', err);
    }
  });

  document.getElementById('goalForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const fd = new FormData(this);
    try {
      await FP.apiCall('/dashboard/goals', {
        method: 'POST',
        body: JSON.stringify({
          target: fd.get('target'),
          weeklyWorkouts: fd.get('weeklyWorkouts')
        })
      });
      await render();
    } catch (err) {
      console.error('Failed to update goals:', err);
    }
  });

  render();
})();
