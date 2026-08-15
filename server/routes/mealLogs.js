// routes/mealLogs.js
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const auth = require('../middleware/auth');
const MealLog = require('../models/MealLog');

const router = express.Router();
router.use(auth);

// Client picks up GEMINI_API_KEY from process.env automatically
const client = new GoogleGenAI({});

// The schema Gemini is required to follow — this is what makes the
// response reliably parseable JSON, rather than hoping a plain-text
// prompt happens to come back clean.
const nutritionSchema = {
  type: 'object',
  properties: {
    foodDescription: { type: 'string' },
    estimatedCalories: { type: 'number' },
    protein: { type: 'number' }, // grams
    carbs: { type: 'number' }, // grams
    fat: { type: 'number' } // grams
  },
  required: ['foodDescription', 'estimatedCalories', 'protein', 'carbs', 'fat']
};

// Each model has its OWN separate free-tier quota — trying multiple
// models isn't just retry-on-failure, it pools several independent
// daily budgets into one effective combined quota. Only models that
// actually fit this task are included — many models on the dashboard
// (image/video/audio generation, embeddings, robotics, live/streaming
// APIs) can't take a photo and return text at all, so they're excluded
// regardless of their quota. Ordered by remaining daily headroom: the
// two Lite models (500 RPD each) first, then the smaller-quota models
// (20 RPD each, ~80 more combined), with gemini-3.5-flash last since
// its daily quota is already exhausted for today specifically.
const MODEL_FALLBACK_ORDER = [
  'gemini-3.5-flash-lite',   // 500 RPD
  'gemini-3.1-flash-lite',   // 500 RPD
  'gemini-2.5-flash-lite',   // 20 RPD
  'gemini-2.5-flash',        // 20 RPD
  'gemini-3-flash',          // 20 RPD
  'gemini-3.6-flash',        // 20 RPD
  'gemini-3.5-flash'         // 20 RPD, already exhausted for today
];

async function analyzeMealPhoto(image, mimeType, description) {
  let lastError;

  // The photo alone can't communicate things like "extra dressing" or
  // "double portion" — an optional user description gives Gemini real
  // additional context to improve the estimate, not just a label.
  const basePrompt = 'Identify the food in this photo and estimate its total calories, protein, carbohydrates, and fat in grams. Be realistic about portion size.';
  const promptText = description
    ? `${basePrompt} Additional context from the user: "${description}"`
    : basePrompt;

  for (const model of MODEL_FALLBACK_ORDER) {
    try {
      const interaction = await client.interactions.create({
        model,
        input: [
          { type: 'text', text: promptText },
          { type: 'image', data: image, mime_type: mimeType }
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: nutritionSchema
        }
      });
      return { ...JSON.parse(interaction.output_text), modelUsed: model }; // success — stop trying further models
    } catch (err) {
      lastError = err;
      // Only fall through to the next model on a genuine rate-limit
      // error. Any other failure (bad request, invalid schema, etc.)
      // would fail identically on every model — no point retrying it.
      if (err.status !== 429) throw err;
    }
  }

  throw lastError; // every model in the fallback list was rate-limited
}

router.post('/', async (req, res) => {
  try {
    const { image, mimeType, description } = req.body; // image = base64 string, never written to disk

    if (!image || !mimeType) {
      return res.status(400).json({ error: 'image and mimeType are required' });
    }

    const result = await analyzeMealPhoto(image, mimeType, description);
    console.log(`Meal photo analyzed using model: ${result.modelUsed}`);

    const mealLog = await MealLog.create({
      userId: req.user.id,
      foodDescription: result.foodDescription,
      estimatedCalories: result.estimatedCalories,
      protein: result.protein,
      carbs: result.carbs,
      fat: result.fat,
      userNote: description || undefined
    });

    res.status(201).json(mealLog);
    // Note: `image` (the base64 photo data) is never saved anywhere —
    // it existed only in memory for the duration of this request, and
    // is discarded the moment this function returns.
  } catch (err) {
    console.error('Meal photo analysis failed:', err);

    if (err.status === 429) {
      return res.status(429).json({ error: 'Meal analysis is rate-limited across all available models right now — try again shortly.' });
    }

    res.status(500).json({ error: 'Failed to analyze meal photo' });
  }
});

router.get('/', async (req, res) => {
  const mealLogs = await MealLog.find({ userId: req.user.id }).sort({ date: -1 });
  res.json(mealLogs);
});

// Looks up a scanned barcode against Open Food Facts and returns the
// product's per-100g nutrition. Does NOT save anything yet — the user
// still needs to confirm how much they actually ate.
router.get('/lookup-barcode/:code', async (req, res) => {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${req.params.code}.json`,
      { headers: { 'User-Agent': 'AI-Fitness-Coach/1.0 (personal project)' } }
    );
    const data = await response.json();

    // Open Food Facts returns HTTP 200 even for a barcode that doesn't
    // exist — the real success indicator is `status` in the body, not
    // the HTTP status code. Trusting a 200 alone would silently treat
    // "not found" as a valid, empty result.
    if (data.status !== 1) {
      return res.status(404).json({ error: 'No product found for this barcode' });
    }

    const { product_name, brands, nutriments = {} } = data.product;
    res.json({
      foodDescription: brands ? `${brands} — ${product_name}` : product_name,
      caloriesPer100g: nutriments['energy-kcal_100g'] ?? 0,
      proteinPer100g: nutriments['proteins_100g'] ?? 0,
      carbsPer100g: nutriments['carbohydrates_100g'] ?? 0,
      fatPer100g: nutriments['fat_100g'] ?? 0
    });
  } catch (err) {
    console.error('Barcode lookup failed:', err);
    res.status(500).json({ error: 'Failed to look up barcode' });
  }
});

// Confirms a barcode-scanned product and saves it — scales the looked-up
// per-100g values by the actual amount eaten, then converges on the same
// MealLog schema the photo pipeline uses, so both paths produce identical
// downstream data.
router.post('/barcode', async (req, res) => {
  try {
    const { foodDescription, caloriesPer100g, proteinPer100g, carbsPer100g, fatPer100g, gramsEaten } = req.body;

    if (!foodDescription || gramsEaten == null) {
      return res.status(400).json({ error: 'foodDescription and gramsEaten are required' });
    }

    const scale = gramsEaten / 100;
    const mealLog = await MealLog.create({
      userId: req.user.id,
      foodDescription,
      estimatedCalories: Math.round(caloriesPer100g * scale),
      protein: Math.round(proteinPer100g * scale * 10) / 10,
      carbs: Math.round(carbsPer100g * scale * 10) / 10,
      fat: Math.round(fatPer100g * scale * 10) / 10
    });

    res.status(201).json(mealLog);
  } catch (err) {
    console.error('Failed to save barcode meal log:', err);
    res.status(500).json({ error: 'Failed to log meal' });
  }
});

module.exports = router;