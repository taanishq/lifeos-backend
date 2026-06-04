import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:4173",
    /\.vercel\.app$/,
  ],
  methods: ["POST", "GET"],
}));

app.use(express.json({ limit: "20mb" }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/", (req, res) => {
  res.json({ status: "LifeOS backend running", ai: "Gemini" });
});

// ── Goal Verification (text + optional image) ──────────────────────
app.post("/api/verify-goal", async (req, res) => {
  const { goal, proof, imageBase64, imageMimeType } = req.body;
  if (!goal) return res.status(400).json({ error: "goal is required" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = `I set a goal: "${goal}".
${proof ? `My written proof: "${proof}"` : ""}
${imageBase64 ? "I have also uploaded an image as proof (see attached)." : ""}

Analyze the evidence and respond ONLY with a valid JSON object with these exact keys:
- "status": one of "Verified", "Likely Completed", or "Insufficient Evidence"
- "feedback": 1-2 sentences of constructive feedback referencing what you saw

No markdown, no code blocks, just raw JSON.`;

    let parts = [{ text: prompt }];

    if (imageBase64 && imageMimeType) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64,
        },
      });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    console.error("verify-goal error:", err.message);
    res.status(500).json({ status: "Insufficient Evidence", feedback: "Could not verify at this time. Please try again." });
  }
});

// ── Nutrition Analysis ─────────────────────────────────────────────
app.post("/api/analyze-nutrition", async (req, res) => {
  const { foods } = req.body;
  if (!foods) return res.status(400).json({ error: "foods is required" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const prompt = `Estimate the nutritional content for this meal: "${foods}".
Respond ONLY with a valid JSON object with these exact keys (all numbers):
- "calories": total calories
- "protein": grams of protein
- "carbs": grams of carbohydrates
- "fat": grams of fat

Be realistic. No markdown, no code blocks, just raw JSON.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(text);
    res.json(parsed);
  } catch (err) {
    console.error("analyze-nutrition error:", err.message);
    res.status(500).json({ error: "Could not analyze nutrition. Please try again." });
  }
});

// ── Journal Summary ────────────────────────────────────────────────
app.post("/api/journal-summary", async (req, res) => {
  const { entries } = req.body;
  if (!entries || !entries.length) return res.status(400).json({ error: "entries are required" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const formatted = entries.map(e =>
      `Date: ${e.date}\nWent well: ${e.wentWell}\nCould improve: ${e.couldBeBetter}\nLearned: ${e.learned}\nGrateful: ${e.grateful}`
    ).join("\n---\n");

    const prompt = `Based on these recent journal entries, write a concise weekly reflection summary (3-4 sentences).
Cover: patterns you notice, areas of growth, and one encouraging insight. Be warm and personal.

Entries:
${formatted}

Respond with plain text only, no formatting.`;

    const result = await model.generateContent(prompt);
    res.json({ summary: result.response.text().trim() });
  } catch (err) {
    console.error("journal-summary error:", err.message);
    res.status(500).json({ error: "Could not generate summary. Please try again." });
  }
});

// ── Daily Summary ──────────────────────────────────────────────────
app.post("/api/daily-summary", async (req, res) => {
  const { goals, calories, protein, workout, spending } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    const prompt = `Generate a brief, motivating daily summary (3-4 sentences) based on this data:
- Goals completed: ${goals.completed} out of ${goals.total}
- Calories consumed: ${calories.current} (target: ${calories.target})
- Protein: ${protein.current}g (target: ${protein.target}g)
- Workout: ${workout || "Rest day"}
- Money spent today: $${spending}

Be encouraging, specific, and point out one thing to improve tomorrow. Plain text only.`;

    const result = await model.generateContent(prompt);
    res.json({ summary: result.response.text().trim() });
  } catch (err) {
    console.error("daily-summary error:", err.message);
    res.status(500).json({ error: "Could not generate summary." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ LifeOS backend running on http://localhost:${PORT}`);
});

// ── CSV Transaction Import ─────────────────────────────────────────
app.post("/api/import-csv", async (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: "csvText is required" });

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });

    const prompt = `You are a financial data parser. Parse this CSV bank/credit card statement and extract all transactions.

CSV DATA:
${csvText.slice(0, 8000)}

For each transaction, determine the best category from this exact list:
Groceries, Food & Dining, Restaurants, Fast Food, Coffee Shops, DoorDash, Uber Eats, Amazon, Clothes & Shoes, Transportation, Entertainment, Subscriptions, Rent, Travel, Other

Respond ONLY with a valid JSON array. Each item must have:
- "date": date in YYYY-MM-DD format
- "description": merchant/description (keep it short, clean)
- "amount": positive number (absolute value, no negatives)
- "category": one from the list above

Example format:
[{"date":"2024-01-15","description":"Whole Foods","amount":45.23,"category":"Groceries"}]

Only include actual purchase transactions. Skip payments, credits, refunds, and transfers.
No markdown, no code blocks, just the raw JSON array.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json|```/g, "").trim();

    // Find the JSON array in the response
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]") + 1;
    if (start === -1 || end === 0) {
      return res.status(500).json({ error: "Could not parse transactions from CSV" });
    }

    const parsed = JSON.parse(text.slice(start, end));
    res.json({ transactions: parsed });
  } catch (err) {
    console.error("import-csv error:", err.message);
    res.status(500).json({ error: "Could not parse CSV. Please try again." });
  }
});