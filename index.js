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

// ── Model fallback chain ───────────────────────────────────────────
const MODELS = [
  "gemini-2.5-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite-preview-06-17",
];

async function generateWithFallback(prompt, parts = null) {
  let lastError;
  for (const modelName of MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const input = parts || prompt;
      const result = await model.generateContent(input);
      console.log(`✅ Used model: ${modelName}`);
      return result.response.text();
    } catch (err) {
      console.warn(`⚠️ Model ${modelName} failed: ${err.message}`);
      lastError = err;
      if (!err.message.includes("429") && !err.message.includes("503") && !err.message.includes("quota") && !err.message.includes("rate") && !err.message.includes("not found") && !err.message.includes("404") && !err.message.includes("overloaded") && !err.message.includes("unavailable")) {
        throw err;
      }
    }
  }
  throw lastError;
}

// ── Health check ───────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "LifeOS backend running", ai: "Gemini (with fallback)" });
});

// ── Goal Verification ──────────────────────────────────────────────
app.post("/api/verify-goal", async (req, res) => {
  const { goal, proof, imageBase64, imageMimeType } = req.body;
  if (!goal) return res.status(400).json({ error: "goal is required" });
  try {
    const prompt = `I set a goal: "${goal}".
${proof ? `My written proof: "${proof}"` : ""}
${imageBase64 ? "I have also uploaded an image as proof (see attached)." : ""}
Analyze the evidence and respond ONLY with a valid JSON object with these exact keys:
- "status": one of "Verified", "Likely Completed", or "Insufficient Evidence"
- "feedback": 1-2 sentences of constructive feedback
No markdown, no code blocks, just raw JSON.`;
    let parts = [{ text: prompt }];
    if (imageBase64 && imageMimeType) {
      parts.push({ inlineData: { mimeType: imageMimeType, data: imageBase64 } });
    }
    const text = await generateWithFallback(prompt, imageBase64 ? parts : null);
    res.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (err) {
    console.error("verify-goal error:", err.message);
    res.status(500).json({ status: "Insufficient Evidence", feedback: "Could not verify at this time." });
  }
});

// ── Nutrition Analysis ─────────────────────────────────────────────
app.post("/api/analyze-nutrition", async (req, res) => {
  const { foods } = req.body;
  if (!foods) return res.status(400).json({ error: "foods is required" });
  try {
    const prompt = `Estimate the nutritional content for this meal: "${foods}".
Respond ONLY with a valid JSON object with these exact keys (all numbers):
- "calories": total calories
- "protein": grams of protein
- "carbs": grams of carbohydrates
- "fat": grams of fat
Be realistic. No markdown, no code blocks, just raw JSON.`;
    const text = await generateWithFallback(prompt);
    res.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (err) {
    console.error("analyze-nutrition error:", err.message);
    res.status(500).json({ error: "All AI models are currently busy. Please try again in a minute." });
  }
});

// ── Journal Summary ────────────────────────────────────────────────
app.post("/api/journal-summary", async (req, res) => {
  const { entries } = req.body;
  if (!entries || !entries.length) return res.status(400).json({ error: "entries are required" });
  try {
    const formatted = entries.map(e =>
      `Date: ${e.date}\nWent well: ${e.wentWell}\nCould improve: ${e.couldBeBetter}\nLearned: ${e.learned}\nGrateful: ${e.grateful}`
    ).join("\n---\n");
    const prompt = `Based on these recent journal entries, write a concise weekly reflection summary (3-4 sentences).
Cover: patterns you notice, areas of growth, and one encouraging insight. Be warm and personal.
Entries:\n${formatted}\nRespond with plain text only, no formatting.`;
    const text = await generateWithFallback(prompt);
    res.json({ summary: text.trim() });
  } catch (err) {
    console.error("journal-summary error:", err.message);
    res.status(500).json({ error: "All AI models are currently busy. Please try again in a minute." });
  }
});

// ── Daily Summary ──────────────────────────────────────────────────
app.post("/api/daily-summary", async (req, res) => {
  const { goals, calories, protein, workout, spending } = req.body;
  try {
    const prompt = `Generate a brief, motivating daily summary (3-4 sentences) based on this data:
- Goals completed: ${goals.completed} out of ${goals.total}
- Calories consumed: ${calories.current} (target: ${calories.target})
- Protein: ${protein.current}g (target: ${protein.target}g)
- Workout: ${workout || "Rest day"}
- Money spent today: $${spending}
Be encouraging, specific, and point out one thing to improve tomorrow. Plain text only.`;
    const text = await generateWithFallback(prompt);
    res.json({ summary: text.trim() });
  } catch (err) {
    console.error("daily-summary error:", err.message);
    res.status(500).json({ error: "Could not generate summary." });
  }
});

// ── CSV Transaction Import ─────────────────────────────────────────
app.post("/api/import-csv", async (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: "csvText is required" });
  try {
    const prompt = `You are a financial data parser. Parse this bank/credit card statement and extract all purchase transactions.
The file may be comma-separated OR tab-separated. Handle both formats.
Common column names: "Trans. Date", "Transaction Date", "Date", "Post Date", "Description", "Amount", "Category"

STATEMENT DATA:
${csvText.slice(0, 10000)}

Rules:
- SKIP any row where amount is negative (those are payments or credits)
- SKIP rows with descriptions like "PAYMENT", "THANK YOU", "CREDIT", "REFUND", "TRANSFER"
- Clean up messy merchant names
- Convert all dates to YYYY-MM-DD format
- Amount must be a positive number

Map each transaction to ONE category from this exact list:
Groceries, Food & Dining, Restaurants, Fast Food, Coffee Shops, DoorDash, Uber Eats, Amazon, Clothes & Shoes, Transportation, Entertainment, Subscriptions, Rent, Travel, Other

Respond ONLY with a valid JSON array. Each item must have:
- "date": string in YYYY-MM-DD format
- "description": clean short merchant name
- "amount": positive number
- "category": one category from the list above

No markdown, no code blocks. Just the raw JSON array starting with [ and ending with ].`;
    const text = await generateWithFallback(prompt);
    const clean = text.replace(/```json|```/g, "").trim();
    const start = clean.indexOf("[");
    const end = clean.lastIndexOf("]") + 1;
    if (start === -1 || end === 0) return res.status(500).json({ error: "Could not parse transactions from CSV" });
    res.json({ transactions: JSON.parse(clean.slice(start, end)) });
  } catch (err) {
    console.error("import-csv error:", err.message);
    res.status(500).json({ error: "Could not parse CSV. Please try again." });
  }
});

// ── Parse Application Email ────────────────────────────────────────
app.post("/api/parse-application", async (req, res) => {
  const { emailText } = req.body;
  if (!emailText) return res.status(400).json({ error: "emailText is required" });
  try {
    const today = new Date().toISOString().split("T")[0];
    const prompt = `Extract job application details from this email confirmation text.

EMAIL:
${emailText.slice(0, 3000)}

Respond ONLY with a valid JSON object with these exact keys:
- "company": company name (e.g. "Tesla", "Goldman Sachs")
- "role": job title (e.g. "Accounting & Finance Intern")
- "location": location if mentioned, otherwise ""
- "dateApplied": "${today}"
- "status": "Applied"
- "notes": any useful info like position ID, department, deadline, otherwise ""

No markdown, no code blocks, just raw JSON.`;
    const text = await generateWithFallback(prompt);
    res.json(JSON.parse(text.replace(/```json|```/g, "").trim()));
  } catch (err) {
    console.error("parse-application error:", err.message);
    res.status(500).json({ error: "Could not parse email. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ LifeOS backend running on http://localhost:${PORT}`);
});