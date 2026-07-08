-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (public schema)
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('member', 'admin')),
    joined DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 2. Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    target_goal VARCHAR(100) DEFAULT 'Lose Fat',
    weekly_workouts INTEGER DEFAULT 4 CHECK (weekly_workouts >= 0),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Trigger to sync auth.users to public.users and public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  -- Insert into public.users
  INSERT INTO public.users (id, name, email, role, status)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'FitPulse User'),
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'member'),
    'active'
  );
  
  -- Insert default profile
  INSERT INTO public.profiles (id, target_goal, weekly_workouts)
  VALUES (
    new.id,
    'Lose Fat',
    4
  );
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Workouts Table (Static or Custom templates)
CREATE TABLE IF NOT EXISTS public.workouts (
    id SERIAL PRIMARY KEY,
    level VARCHAR(50) NOT NULL CHECK (level IN ('beginner', 'intermediate', 'advanced')),
    title VARCHAR(255) NOT NULL,
    frequency VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    days JSONB NOT NULL, -- Storing day schedules and exercise list
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Nutrition Logs
CREATE TABLE IF NOT EXISTS public.nutrition_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    calories INTEGER NOT NULL DEFAULT 0 CHECK (calories >= 0),
    calorie_goal INTEGER NOT NULL DEFAULT 2200 CHECK (calorie_goal > 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_user_nutrition_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_nutrition_user_date ON public.nutrition_logs(user_id, date);

-- 5. Water Logs
CREATE TABLE IF NOT EXISTS public.water_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    water INTEGER NOT NULL DEFAULT 0 CHECK (water >= 0), -- in ml
    water_goal INTEGER NOT NULL DEFAULT 3000 CHECK (water_goal > 0), -- in ml
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_user_water_date UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_water_user_date ON public.water_logs(user_id, date);

-- 6. Progress Logs (Weight and BMI tracker)
CREATE TABLE IF NOT EXISTS public.progress_logs (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    weight NUMERIC(5, 2) CHECK (weight > 0), -- weight in kg
    height NUMERIC(5, 2) CHECK (height > 0), -- height in cm (from BMI calculation)
    bmi NUMERIC(4, 1) CHECK (bmi > 0),
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON public.progress_logs(user_id, date);

-- 7. Blogs Table
CREATE TABLE IF NOT EXISTS public.blogs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(100) NOT NULL,
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    tag VARCHAR(100) NOT NULL,
    excerpt TEXT NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. Community Posts Table
CREATE TABLE IF NOT EXISTS public.community_posts (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL DEFAULT 'Guest',
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 9. Comments Table
CREATE TABLE IF NOT EXISTS public.comments (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    author_name VARCHAR(255) NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 10. Likes Table
CREATE TABLE IF NOT EXISTS public.likes (
    id SERIAL PRIMARY KEY,
    post_id INTEGER NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT unique_post_user_like UNIQUE (post_id, user_id)
);

-- 11. Trainer Bookings Table
CREATE TABLE IF NOT EXISTS public.trainer_bookings (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    trainer VARCHAR(255) NOT NULL,
    date DATE NOT NULL,
    time TIME NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('In-person', 'Online')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trainer_bookings_user ON public.trainer_bookings(user_id);

-- 12. Challenges Table
CREATE TABLE IF NOT EXISTS public.challenges (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL UNIQUE,
    days INTEGER NOT NULL CHECK (days > 0),
    participants_count INTEGER DEFAULT 0 CHECK (participants_count >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 13. Challenge Participants Table
CREATE TABLE IF NOT EXISTS public.challenge_participants (
    challenge_id INTEGER NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    PRIMARY KEY (challenge_id, user_id)
);

-- Trigger function to automatically maintain participant counts in challenges
CREATE OR REPLACE FUNCTION public.update_challenge_participants_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.challenges 
    SET participants_count = participants_count + 1 
    WHERE id = NEW.challenge_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.challenges 
    SET participants_count = GREATEST(0, participants_count - 1) 
    WHERE id = OLD.challenge_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_challenge_participant_added
  AFTER INSERT OR DELETE ON public.challenge_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_challenge_participants_count();

-- 14. Contact Messages Table
CREATE TABLE IF NOT EXISTS public.contact_messages (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
