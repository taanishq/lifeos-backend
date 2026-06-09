# LifeOS Backend

Express.js REST API powering the AI features of LifeOS. Handles all Google Gemini API calls server-side so the API key is never exposed to the browser.

**Live:** [lifeos-backend-dj4f.onrender.com](https://lifeos-backend-dj4f.onrender.com)

---

## Tech Stack

- **Node.js** with ES Modules
- **Express.js**
- **Google Generative AI SDK** (`@google/generative-ai`)
- **CORS** for cross-origin requests
- **dotenv** for environment variables

---

## AI Model Fallback Chain

Every endpoint uses an automatic fallback system across 4 Gemini models. If one model hits its rate limit or is unavailable (429, 503), it silently falls through to the next:

```
gemini-3.1-flash-lite → gemini-2.5-flash → gemini-3.5-flash
```

This ensures zero downtime on AI features even during high demand periods.

---

## API Endpoints

### `GET /`
Health check.

**Response:**
```json
{ "status": "LifeOS backend running", "ai": "Gemini (with fallback)" }
```

---

### `POST /api/verify-goal`
Verifies goal completion using text proof and/or an image.

**Request:**
```json
{
  "goal": "Run 5km",
  "proof": "Ran 5.2km on Nike Run Club",
  "imageBase64": "base64string...",
  "imageMimeType": "image/jpeg"
}
```

**Response:**
```json
{
  "status": "Verified",
  "feedback": "Great job completing your 5km run!"
}
```

Status values: `"Verified"` | `"Likely Completed"` | `"Insufficient Evidence"`

---

### `POST /api/analyze-nutrition`
Estimates macros from a plain English meal description.

**Request:**
```json
{ "foods": "4 eggs, 2 slices toast, 250ml milk" }
```

**Response:**
```json
{ "calories": 480, "protein": 32, "carbs": 30, "fat": 18 }
```

---

### `POST /api/journal-summary`
Generates a weekly reflection summary from journal entries.

**Request:**
```json
{
  "entries": [
    {
      "date": "2026-06-01",
      "wentWell": "Hit protein goal",
      "couldBeBetter": "Skipped morning run",
      "learned": "DCF modeling",
      "grateful": "Family"
    }
  ]
}
```

**Response:**
```json
{ "summary": "This week showed strong consistency in nutrition..." }
```

---

### `POST /api/daily-summary`
Generates a personalized daily performance summary.

**Request:**
```json
{
  "goals": { "completed": 3, "total": 4 },
  "calories": { "current": 2400, "target": 2800 },
  "protein": { "current": 160, "target": 180 },
  "workout": "Push day",
  "spending": 45.50
}
```

**Response:**
```json
{ "summary": "Solid day overall — 3 out of 4 goals completed..." }
```

---

### `POST /api/import-csv`
Parses a bank CSV statement and extracts categorized transactions.

**Request:**
```json
{ "csvText": "Trans. Date\tPost Date\tDescription\tAmount\n01/15/2026\t01/16/2026\tWhole Foods\t45.23" }
```

**Response:**
```json
{
  "transactions": [
    {
      "date": "2026-01-15",
      "description": "Whole Foods",
      "amount": 45.23,
      "category": "Groceries"
    }
  ]
}
```

Supports tab-separated and comma-separated formats. Automatically skips payments, credits, and refunds. Cleans up messy merchant names.

Available categories: Groceries, Food & Dining, Restaurants, Fast Food, Coffee Shops, DoorDash, Uber Eats, Amazon, Clothes & Shoes, Transportation, Entertainment, Subscriptions, Rent, Travel, Other

---

### `POST /api/parse-application`
Extracts job application details from a confirmation email.

**Request:**
```json
{ "emailText": "We have received your Tesla application for Accounting & Finance Intern (Fall 2026)..." }
```

**Response:**
```json
{
  "company": "Tesla",
  "role": "Accounting & Finance Intern",
  "location": "",
  "dateApplied": "2026-06-09",
  "status": "Applied",
  "notes": "Position ID: 271328, Fall 2026"
}
```

---

## Getting Started

### Prerequisites
- Node.js v22+
- Google Gemini API key (free at [aistudio.google.com](https://aistudio.google.com))

### Installation

```bash
git clone https://github.com/taanishq/lifeos-backend.git
cd lifeos-backend
npm install
```

### Environment Variables

Create a `.env` file:

```
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3001
```

### Run Locally

```bash
npm run dev
```

Server runs at `http://localhost:3001`

### Run in Production

```bash
npm start
```

---

## Deployment

Deployed on **Render** (free tier) with automatic CI/CD — every push to `main` triggers a redeployment.

Set `GEMINI_API_KEY` in Render dashboard under **Environment**.

To keep the free tier from spinning down, use [UptimeRobot](https://uptimerobot.com) to ping the health check endpoint every 5 minutes.

---

## CORS Configuration

The backend allows requests from:
- `http://localhost:5173` (local development)
- `http://localhost:4173` (local preview)
- Any `*.vercel.app` domain (production)

To add a custom domain, update the `origin` array in `index.js`.

---

## Request Limits

- JSON body limit: **20MB** (supports base64 encoded images for goal verification)
- CSV text limit: first **10,000 characters** are sent to Gemini

---

## Project Structure

```
lifeos-backend/
├── index.js          # All routes and Gemini integration
├── package.json
├── .env              # Never committed (in .gitignore)
└── .gitignore
```
