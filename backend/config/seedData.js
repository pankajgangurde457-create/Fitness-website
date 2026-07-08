const supabase = require('./supabaseClient');

const seedDatabase = async () => {
  try {
    console.log('Checking database seed state...');

    // 1. Seed Challenges
    const { count: challengeCount, error: challengeCountError } = await supabase
      .from('challenges')
      .select('*', { count: 'exact', head: true });

    if (challengeCountError) {
      console.warn('Could not check challenges count (might need schema migration):', challengeCountError.message);
      return;
    }

    if (challengeCount === 0) {
      console.log('Seeding default challenges...');
      const defaultChallenges = [
        { id: 1, title: '30-Day Plank Challenge', days: 30, participants_count: 482 },
        { id: 2, title: '10K Steps Everyday', days: 21, participants_count: 1203 },
        { id: 3, title: 'No Sugar August', days: 31, participants_count: 356 },
        { id: 4, title: 'Push-Up Progression', days: 14, participants_count: 640 }
      ];

      const { error: seedError } = await supabase
        .from('challenges')
        .insert(defaultChallenges);

      if (seedError) console.error('Error seeding challenges:', seedError.message);
      else console.log('Successfully seeded challenges!');
    }

    // 2. Seed Blogs
    const { count: blogCount, error: blogCountError } = await supabase
      .from('blogs')
      .select('*', { count: 'exact', head: true });

    if (blogCountError) {
      console.error('Error checking blogs count:', blogCountError.message);
      return;
    }

    if (blogCount === 0) {
      console.log('Seeding default blogs...');
      const defaultBlogs = [
        {
          id: 1,
          title: '5 Mistakes Beginners Make in the Gym',
          author: 'Coach Aman',
          date: '2026-06-02',
          tag: 'Training',
          excerpt: 'Skipping warm-ups to chasing heavy weight too soon — here is what to fix first.',
          content: 'Here are the top 5 mistakes beginners make: 1. Skipping warm-ups. 2. Lifting too heavy too fast. 3. Poor nutrition. 4. Lack of consistency. 5. Not getting enough sleep.'
        },
        {
          id: 2,
          title: 'How Much Protein Do You Actually Need?',
          author: 'Dr. Neha Kulkarni',
          date: '2026-06-14',
          tag: 'Nutrition',
          excerpt: 'A simple, evidence-based way to calculate your daily protein target.',
          content: 'For an active adult, aiming for 1.6 to 2.2 grams of protein per kilogram of bodyweight is optimal for muscle repair and fat loss.'
        },
        {
          id: 3,
          title: 'Why Rest Days Make You Stronger',
          author: 'Coach Aman',
          date: '2026-06-28',
          tag: 'Recovery',
          excerpt: 'Muscle grows during recovery, not during the workout. Here is the science.',
          content: 'When you work out, you create micro-tears in muscle fibres. These rebuild and grow larger during recovery and rest days.'
        }
      ];

      const { error: seedError } = await supabase
        .from('blogs')
        .insert(defaultBlogs);

      if (seedError) console.error('Error seeding blogs:', seedError.message);
      else console.log('Successfully seeded blogs!');
    }

    // 3. Seed Workouts
    const { count: workoutCount, error: workoutCountError } = await supabase
      .from('workouts')
      .select('*', { count: 'exact', head: true });

    if (workoutCountError) {
      console.error('Error checking workouts count:', workoutCountError.message);
      return;
    }

    if (workoutCount === 0) {
      console.log('Seeding default workouts...');
      const defaultWorkouts = [
        {
          id: 1,
          level: 'beginner',
          title: 'Foundation Builder',
          frequency: '3 days / week',
          description: 'Build the habit and learn correct form before adding load.',
          days: [
            { day: 'Day 1 — Full Body A', items: ['Bodyweight Squat — 3×12', 'Incline Push-up — 3×10', 'Assisted Row — 3×12', 'Plank — 3×30s'] },
            { day: 'Day 2 — Rest / Walk', items: ['20–30 min brisk walk', 'Light stretching'] },
            { day: 'Day 3 — Full Body B', items: ['Glute Bridge — 3×15', 'Wall Push-up — 3×12', 'Band Pull-apart — 3×15', 'Dead Bug — 3×10'] }
          ]
        },
        {
          id: 2,
          level: 'intermediate',
          title: 'Strength & Conditioning',
          frequency: '4 days / week',
          description: 'Progressive overload paired with conditioning circuits.',
          days: [
            { day: 'Day 1 — Upper Push/Pull', items: ['Bench Press — 4×8', 'Bent-over Row — 4×8', 'Overhead Press — 3×10', 'Lat Pulldown — 3×12'] },
            { day: 'Day 2 — Lower Body', items: ['Back Squat — 4×6', 'Romanian Deadlift — 3×8', 'Walking Lunge — 3×12', 'Calf Raise — 3×15'] },
            { day: 'Day 3 — Conditioning', items: ['Rowing Intervals — 8×250m', 'Kettlebell Swings — 5×15', 'Core Circuit — 3 rounds'] },
            { day: 'Day 4 — Full Body', items: ['Deadlift — 4×5', 'Push Press — 3×8', 'Pull-ups — 4×AMRAP', 'Farmer Carry — 3×40m'] }
          ]
        },
        {
          id: 3,
          level: 'advanced',
          title: 'Performance Block',
          frequency: '5–6 days / week',
          description: 'Periodized programming for serious lifters and athletes.',
          days: [
            { day: 'Day 1 — Squat Focus', items: ['Back Squat — 5×5 @ 80%', 'Front Squat — 3×6', 'Bulgarian Split Squat — 3×10', 'Weighted Plank — 3×45s'] },
            { day: 'Day 2 — Bench Focus', items: ['Bench Press — 5×5 @ 80%', 'Incline DB Press — 4×8', 'Weighted Dips — 3×10', 'Face Pulls — 3×15'] },
            { day: 'Day 3 — Deadlift Focus', items: ['Deadlift — 5×3 @ 85%', 'Pendlay Row — 4×8', 'Hanging Leg Raise — 3×12'] },
            { day: 'Day 4 — Accessory / Conditioning', items: ['Sled Push — 6×20m', 'Sprint Intervals — 10×100m', 'Core Circuit — 4 rounds'] },
            { day: 'Day 5 — Olympic Lift Practice', items: ['Power Clean — 6×3', 'Push Jerk — 5×3', 'Box Jumps — 4×6'] }
          ]
        }
      ];

      const { error: seedError } = await supabase
        .from('workouts')
        .insert(defaultWorkouts);

      if (seedError) console.error('Error seeding workouts:', seedError.message);
      else console.log('Successfully seeded workouts!');
    }

    console.log('Database check and seed completed.');

  } catch (err) {
    console.error('Database seeding failed:', err);
  }
};

module.exports = seedDatabase;
