// Canonical preset exercise library for strength/gym workouts
// Each exercise has an id, name, primary muscle group, and optional aliases

export type MuscleGroup =
  | "Chest" | "Back" | "Shoulders" | "Biceps" | "Triceps" | "Forearms"
  | "Abs" | "Lower Back" | "Trapezius" | "Neck"
  | "Quads" | "Hamstrings" | "Glutes" | "Calves" | "Abductors" | "Adductors";

export const MUSCLE_GROUP_SECTIONS = [
  { label: "Torso", groups: ["Chest", "Abs", "Back", "Lower Back", "Trapezius", "Neck"] as MuscleGroup[] },
  { label: "Arms", groups: ["Shoulders", "Biceps", "Triceps", "Forearms"] as MuscleGroup[] },
  { label: "Lower Body", groups: ["Glutes", "Quads", "Hamstrings", "Calves", "Abductors", "Adductors"] as MuscleGroup[] },
];

export interface PresetExercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  aliases?: string[];
}

export const EXERCISE_LIBRARY: PresetExercise[] = [
  // ===== CHEST =====
  { id: "bench-press", name: "Bench Press", muscle: "Chest", aliases: ["flat bench", "barbell bench"] },
  { id: "incline-bench-press", name: "Incline Bench Press", muscle: "Chest" },
  { id: "decline-bench-press", name: "Decline Bench Press", muscle: "Chest" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", muscle: "Chest", aliases: ["db bench"] },
  { id: "incline-dumbbell-press", name: "Incline Dumbbell Press", muscle: "Chest", aliases: ["incline db press"] },
  { id: "decline-dumbbell-press", name: "Decline Dumbbell Press", muscle: "Chest" },
  { id: "chest-fly", name: "Chest Fly", muscle: "Chest", aliases: ["dumbbell fly", "pec fly"] },
  { id: "incline-chest-fly", name: "Incline Chest Fly", muscle: "Chest" },
  { id: "cable-crossover", name: "Cable Crossover", muscle: "Chest" },
  { id: "cable-fly", name: "Cable Fly", muscle: "Chest" },
  { id: "machine-chest-press", name: "Machine Chest Press", muscle: "Chest" },
  { id: "smith-bench-press", name: "Smith Machine Bench Press", muscle: "Chest" },
  { id: "push-up", name: "Push-Up", muscle: "Chest", aliases: ["pushup"] },
  { id: "wide-push-up", name: "Wide Push-Up", muscle: "Chest" },
  { id: "diamond-push-up", name: "Diamond Push-Up", muscle: "Chest" },
  { id: "dip-chest", name: "Chest Dip", muscle: "Chest" },
  { id: "pec-deck", name: "Pec Deck", muscle: "Chest", aliases: ["pec deck fly"] },
  { id: "landmine-press", name: "Landmine Press", muscle: "Chest" },
  { id: "floor-press", name: "Floor Press", muscle: "Chest" },
  { id: "svend-press", name: "Svend Press", muscle: "Chest" },

  // ===== BACK =====
  { id: "barbell-row", name: "Barbell Row", muscle: "Back", aliases: ["bent-over row", "bent over row"] },
  { id: "dumbbell-row", name: "Dumbbell Row", muscle: "Back", aliases: ["one arm row", "single arm row"] },
  { id: "pendlay-row", name: "Pendlay Row", muscle: "Back" },
  { id: "t-bar-row", name: "T-Bar Row", muscle: "Back" },
  { id: "cable-row", name: "Cable Row", muscle: "Back", aliases: ["seated cable row", "seated row"] },
  { id: "lat-pulldown", name: "Lat Pulldown", muscle: "Back", aliases: ["lat pull down"] },
  { id: "wide-grip-pulldown", name: "Wide Grip Pulldown", muscle: "Back" },
  { id: "close-grip-pulldown", name: "Close Grip Pulldown", muscle: "Back" },
  { id: "pull-up", name: "Pull-Up", muscle: "Back", aliases: ["pullup"] },
  { id: "chin-up", name: "Chin-Up", muscle: "Back", aliases: ["chinup"] },
  { id: "assisted-pull-up", name: "Assisted Pull-Up", muscle: "Back" },
  { id: "neutral-grip-pull-up", name: "Neutral Grip Pull-Up", muscle: "Back" },
  { id: "machine-row", name: "Machine Row", muscle: "Back" },
  { id: "chest-supported-row", name: "Chest Supported Row", muscle: "Back" },
  { id: "meadows-row", name: "Meadows Row", muscle: "Back" },
  { id: "seal-row", name: "Seal Row", muscle: "Back" },
  { id: "inverted-row", name: "Inverted Row", muscle: "Back" },
  { id: "straight-arm-pulldown", name: "Straight Arm Pulldown", muscle: "Back" },
  { id: "single-arm-cable-row", name: "Single Arm Cable Row", muscle: "Back" },
  { id: "smith-row", name: "Smith Machine Row", muscle: "Back" },
  { id: "deadlift", name: "Deadlift", muscle: "Back", aliases: ["conventional deadlift"] },
  { id: "rack-pull", name: "Rack Pull", muscle: "Back" },

  // ===== SHOULDERS =====
  { id: "overhead-press", name: "Overhead Press", muscle: "Shoulders", aliases: ["ohp", "military press", "shoulder press", "barbell shoulder press"] },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", muscle: "Shoulders", aliases: ["db shoulder press", "seated dumbbell press"] },
  { id: "arnold-press", name: "Arnold Press", muscle: "Shoulders" },
  { id: "lateral-raise", name: "Lateral Raise", muscle: "Shoulders", aliases: ["side raise", "side lateral raise"] },
  { id: "cable-lateral-raise", name: "Cable Lateral Raise", muscle: "Shoulders" },
  { id: "front-raise", name: "Front Raise", muscle: "Shoulders" },
  { id: "rear-delt-fly", name: "Rear Delt Fly", muscle: "Shoulders", aliases: ["reverse fly", "reverse pec deck"] },
  { id: "face-pull", name: "Face Pull", muscle: "Shoulders" },
  { id: "upright-row", name: "Upright Row", muscle: "Shoulders" },
  { id: "machine-shoulder-press", name: "Machine Shoulder Press", muscle: "Shoulders" },
  { id: "smith-shoulder-press", name: "Smith Machine Shoulder Press", muscle: "Shoulders" },
  { id: "push-press", name: "Push Press", muscle: "Shoulders" },
  { id: "behind-neck-press", name: "Behind the Neck Press", muscle: "Shoulders" },
  { id: "landmine-lateral-raise", name: "Landmine Lateral Raise", muscle: "Shoulders" },
  { id: "dumbbell-y-raise", name: "Y-Raise", muscle: "Shoulders" },
  { id: "plate-front-raise", name: "Plate Front Raise", muscle: "Shoulders" },
  { id: "band-pull-apart", name: "Band Pull Apart", muscle: "Shoulders" },

  // ===== BICEPS =====
  { id: "bicep-curl", name: "Bicep Curl", muscle: "Biceps", aliases: ["barbell curl", "curl", "standing curl"] },
  { id: "dumbbell-curl", name: "Dumbbell Curl", muscle: "Biceps", aliases: ["db curl"] },
  { id: "hammer-curl", name: "Hammer Curl", muscle: "Biceps" },
  { id: "incline-dumbbell-curl", name: "Incline Dumbbell Curl", muscle: "Biceps" },
  { id: "preacher-curl", name: "Preacher Curl", muscle: "Biceps" },
  { id: "concentration-curl", name: "Concentration Curl", muscle: "Biceps" },
  { id: "cable-curl", name: "Cable Curl", muscle: "Biceps" },
  { id: "ez-bar-curl", name: "EZ Bar Curl", muscle: "Biceps", aliases: ["ez curl"] },
  { id: "spider-curl", name: "Spider Curl", muscle: "Biceps" },
  { id: "drag-curl", name: "Drag Curl", muscle: "Biceps" },
  { id: "bayesian-curl", name: "Bayesian Curl", muscle: "Biceps" },
  { id: "reverse-curl", name: "Reverse Curl", muscle: "Biceps" },
  { id: "machine-curl", name: "Machine Curl", muscle: "Biceps" },
  { id: "21s-curl", name: "21s Curl", muscle: "Biceps" },
  { id: "cross-body-curl", name: "Cross Body Curl", muscle: "Biceps" },

  // ===== TRICEPS =====
  { id: "tricep-pushdown", name: "Tricep Pushdown", muscle: "Triceps", aliases: ["cable pushdown", "rope pushdown"] },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", muscle: "Triceps", aliases: ["french press", "skull crusher overhead"] },
  { id: "skull-crusher", name: "Skull Crusher", muscle: "Triceps", aliases: ["lying tricep extension"] },
  { id: "tricep-dip", name: "Tricep Dip", muscle: "Triceps", aliases: ["dip"] },
  { id: "close-grip-bench", name: "Close Grip Bench Press", muscle: "Triceps" },
  { id: "cable-overhead-extension", name: "Cable Overhead Extension", muscle: "Triceps" },
  { id: "tricep-kickback", name: "Tricep Kickback", muscle: "Triceps" },
  { id: "bench-dip", name: "Bench Dip", muscle: "Triceps" },
  { id: "diamond-push-up-tricep", name: "Diamond Push-Up", muscle: "Triceps" },
  { id: "rope-pushdown", name: "Rope Pushdown", muscle: "Triceps" },
  { id: "bar-pushdown", name: "V-Bar Pushdown", muscle: "Triceps" },
  { id: "jm-press", name: "JM Press", muscle: "Triceps" },

  // ===== FOREARMS =====
  { id: "wrist-curl", name: "Wrist Curl", muscle: "Forearms" },
  { id: "reverse-wrist-curl", name: "Reverse Wrist Curl", muscle: "Forearms" },
  { id: "farmers-walk", name: "Farmer's Walk", muscle: "Forearms", aliases: ["farmer walk", "farmers carry"] },
  { id: "plate-pinch", name: "Plate Pinch", muscle: "Forearms" },
  { id: "dead-hang", name: "Dead Hang", muscle: "Forearms" },
  { id: "gripper", name: "Hand Gripper", muscle: "Forearms" },

  // ===== ABS =====
  { id: "crunch", name: "Crunch", muscle: "Abs" },
  { id: "sit-up", name: "Sit-Up", muscle: "Abs" },
  { id: "plank", name: "Plank", muscle: "Abs" },
  { id: "side-plank", name: "Side Plank", muscle: "Abs" },
  { id: "russian-twist", name: "Russian Twist", muscle: "Abs" },
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", muscle: "Abs" },
  { id: "hanging-knee-raise", name: "Hanging Knee Raise", muscle: "Abs" },
  { id: "leg-raise", name: "Leg Raise", muscle: "Abs", aliases: ["lying leg raise"] },
  { id: "bicycle-crunch", name: "Bicycle Crunch", muscle: "Abs" },
  { id: "cable-crunch", name: "Cable Crunch", muscle: "Abs" },
  { id: "ab-wheel-rollout", name: "Ab Wheel Rollout", muscle: "Abs", aliases: ["ab rollout"] },
  { id: "mountain-climber", name: "Mountain Climber", muscle: "Abs" },
  { id: "dead-bug", name: "Dead Bug", muscle: "Abs" },
  { id: "v-up", name: "V-Up", muscle: "Abs" },
  { id: "toe-touch", name: "Toe Touch", muscle: "Abs" },
  { id: "flutter-kick", name: "Flutter Kick", muscle: "Abs" },
  { id: "pallof-press", name: "Pallof Press", muscle: "Abs" },
  { id: "wood-chop", name: "Wood Chop", muscle: "Abs" },
  { id: "dragon-flag", name: "Dragon Flag", muscle: "Abs" },

  // ===== LOWER BACK =====
  { id: "back-extension", name: "Back Extension", muscle: "Lower Back", aliases: ["hyperextension"] },
  { id: "good-morning", name: "Good Morning", muscle: "Lower Back" },
  { id: "superman", name: "Superman", muscle: "Lower Back" },
  { id: "bird-dog", name: "Bird Dog", muscle: "Lower Back" },
  { id: "reverse-hyper", name: "Reverse Hyper", muscle: "Lower Back" },

  // ===== TRAPEZIUS =====
  { id: "barbell-shrug", name: "Barbell Shrug", muscle: "Trapezius", aliases: ["shrug"] },
  { id: "dumbbell-shrug", name: "Dumbbell Shrug", muscle: "Trapezius" },
  { id: "trap-bar-shrug", name: "Trap Bar Shrug", muscle: "Trapezius" },
  { id: "cable-shrug", name: "Cable Shrug", muscle: "Trapezius" },

  // ===== NECK =====
  { id: "neck-curl", name: "Neck Curl", muscle: "Neck" },
  { id: "neck-extension", name: "Neck Extension", muscle: "Neck" },
  { id: "neck-lateral-flexion", name: "Neck Lateral Flexion", muscle: "Neck" },

  // ===== QUADS =====
  { id: "squat", name: "Squat", muscle: "Quads", aliases: ["barbell squat"] },
  { id: "back-squat", name: "Back Squat", muscle: "Quads" },
  { id: "front-squat", name: "Front Squat", muscle: "Quads" },
  { id: "goblet-squat", name: "Goblet Squat", muscle: "Quads" },
  { id: "leg-press", name: "Leg Press", muscle: "Quads" },
  { id: "hack-squat", name: "Hack Squat", muscle: "Quads" },
  { id: "leg-extension", name: "Leg Extension", muscle: "Quads" },
  { id: "bulgarian-split-squat", name: "Bulgarian Split Squat", muscle: "Quads" },
  { id: "lunges", name: "Lunges", muscle: "Quads", aliases: ["lunge", "forward lunge"] },
  { id: "walking-lunges", name: "Walking Lunges", muscle: "Quads" },
  { id: "reverse-lunge", name: "Reverse Lunge", muscle: "Quads" },
  { id: "step-up", name: "Step-Up", muscle: "Quads" },
  { id: "sissy-squat", name: "Sissy Squat", muscle: "Quads" },
  { id: "smith-squat", name: "Smith Machine Squat", muscle: "Quads" },
  { id: "box-squat", name: "Box Squat", muscle: "Quads" },
  { id: "pistol-squat", name: "Pistol Squat", muscle: "Quads" },
  { id: "wall-sit", name: "Wall Sit", muscle: "Quads" },
  { id: "pendulum-squat", name: "Pendulum Squat", muscle: "Quads" },
  { id: "belt-squat", name: "Belt Squat", muscle: "Quads" },
  { id: "safety-bar-squat", name: "Safety Bar Squat", muscle: "Quads" },
  { id: "leg-press-single", name: "Single Leg Press", muscle: "Quads" },

  // ===== HAMSTRINGS =====
  { id: "romanian-deadlift", name: "Romanian Deadlift", muscle: "Hamstrings", aliases: ["rdl"] },
  { id: "stiff-leg-deadlift", name: "Stiff Leg Deadlift", muscle: "Hamstrings" },
  { id: "sumo-deadlift", name: "Sumo Deadlift", muscle: "Hamstrings" },
  { id: "leg-curl", name: "Leg Curl", muscle: "Hamstrings", aliases: ["lying leg curl", "hamstring curl"] },
  { id: "seated-leg-curl", name: "Seated Leg Curl", muscle: "Hamstrings" },
  { id: "nordic-curl", name: "Nordic Curl", muscle: "Hamstrings", aliases: ["nordic hamstring curl"] },
  { id: "single-leg-rdl", name: "Single Leg RDL", muscle: "Hamstrings" },
  { id: "cable-pull-through", name: "Cable Pull Through", muscle: "Hamstrings" },
  { id: "glute-ham-raise", name: "Glute Ham Raise", muscle: "Hamstrings", aliases: ["ghr"] },
  { id: "dumbbell-rdl", name: "Dumbbell RDL", muscle: "Hamstrings" },
  { id: "trap-bar-deadlift", name: "Trap Bar Deadlift", muscle: "Hamstrings", aliases: ["hex bar deadlift"] },
  { id: "kettlebell-swing", name: "Kettlebell Swing", muscle: "Hamstrings" },

  // ===== GLUTES =====
  { id: "hip-thrust", name: "Hip Thrust", muscle: "Glutes", aliases: ["barbell hip thrust"] },
  { id: "glute-bridge", name: "Glute Bridge", muscle: "Glutes" },
  { id: "single-leg-hip-thrust", name: "Single Leg Hip Thrust", muscle: "Glutes" },
  { id: "cable-kickback", name: "Cable Kickback", muscle: "Glutes" },
  { id: "donkey-kick", name: "Donkey Kick", muscle: "Glutes" },
  { id: "fire-hydrant", name: "Fire Hydrant", muscle: "Glutes" },
  { id: "smith-hip-thrust", name: "Smith Machine Hip Thrust", muscle: "Glutes" },
  { id: "frog-pump", name: "Frog Pump", muscle: "Glutes" },
  { id: "sumo-squat", name: "Sumo Squat", muscle: "Glutes" },

  // ===== CALVES =====
  { id: "calf-raise", name: "Calf Raise", muscle: "Calves", aliases: ["standing calf raise"] },
  { id: "seated-calf-raise", name: "Seated Calf Raise", muscle: "Calves" },
  { id: "leg-press-calf-raise", name: "Leg Press Calf Raise", muscle: "Calves" },
  { id: "smith-calf-raise", name: "Smith Machine Calf Raise", muscle: "Calves" },
  { id: "donkey-calf-raise", name: "Donkey Calf Raise", muscle: "Calves" },
  { id: "single-leg-calf-raise", name: "Single Leg Calf Raise", muscle: "Calves" },

  // ===== ABDUCTORS =====
  { id: "hip-abduction-machine", name: "Hip Abduction Machine", muscle: "Abductors" },
  { id: "banded-lateral-walk", name: "Banded Lateral Walk", muscle: "Abductors" },
  { id: "cable-hip-abduction", name: "Cable Hip Abduction", muscle: "Abductors" },
  { id: "side-lying-leg-raise", name: "Side Lying Leg Raise", muscle: "Abductors" },
  { id: "clamshell", name: "Clamshell", muscle: "Abductors" },

  // ===== ADDUCTORS =====
  { id: "hip-adduction-machine", name: "Hip Adduction Machine", muscle: "Adductors" },
  { id: "cable-hip-adduction", name: "Cable Hip Adduction", muscle: "Adductors" },
  { id: "copenhagen-plank", name: "Copenhagen Plank", muscle: "Adductors" },
  { id: "adductor-squeeze", name: "Adductor Squeeze", muscle: "Adductors" },
];

// Quick lookup maps
const _byMuscle = new Map<MuscleGroup, PresetExercise[]>();
const _byName = new Map<string, PresetExercise>();
const _aliasMap = new Map<string, PresetExercise>();

for (const ex of EXERCISE_LIBRARY) {
  // By muscle
  if (!_byMuscle.has(ex.muscle)) _byMuscle.set(ex.muscle, []);
  _byMuscle.get(ex.muscle)!.push(ex);
  // By normalized name
  _byName.set(ex.name.toLowerCase(), ex);
  // By alias
  if (ex.aliases) {
    for (const alias of ex.aliases) {
      _aliasMap.set(alias.toLowerCase(), ex);
    }
  }
}

export function getExercisesByMuscle(muscle: MuscleGroup): PresetExercise[] {
  return _byMuscle.get(muscle) || [];
}

/** Find a preset exercise by name or alias (case-insensitive) */
export function findPresetExercise(name: string): PresetExercise | undefined {
  const lower = name.toLowerCase().trim();
  return _byName.get(lower) || _aliasMap.get(lower);
}

/** Normalize an exercise name to canonical preset name if match found */
export function canonicalExerciseName(name: string): string {
  const preset = findPresetExercise(name);
  return preset ? preset.name : name;
}

/** Search exercises with query. Returns scored results (recent-boosted when recentNames provided) */
export function searchExercises(
  query: string,
  opts?: { recentNames?: Set<string>; excludeNames?: Set<string> }
): PresetExercise[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];
  
  const results: { ex: PresetExercise; score: number }[] = [];
  const excludeLower = new Set<string>();
  if (opts?.excludeNames) {
    for (const n of opts.excludeNames) excludeLower.add(n.toLowerCase());
  }

  for (const ex of EXERCISE_LIBRARY) {
    if (excludeLower.has(ex.name.toLowerCase())) continue;
    let score = 0;
    const nameLower = ex.name.toLowerCase();
    if (nameLower === q) score = 100;
    else if (nameLower.startsWith(q)) score = 80;
    else if (nameLower.includes(q)) score = 60;
    else if (ex.aliases?.some(a => a.toLowerCase().includes(q))) score = 50;
    else if (ex.muscle.toLowerCase().includes(q)) score = 30;

    if (score > 0) {
      if (opts?.recentNames?.has(ex.name)) score += 15;
      results.push({ ex, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.map(r => r.ex);
}

/** Get the canonical exercise name list as a string for AI prompts */
export function getCanonicalNameList(): string {
  return EXERCISE_LIBRARY.map(e => e.name).join(", ");
}
