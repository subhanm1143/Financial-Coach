require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const fetch = require("node-fetch");
const Goal = require("./models/Goal");


const app = express();

// Config
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Middleware
app.use(cors());
app.use(express.json());

// ----- Mongoose models -----
// For now we'll define Transaction here; later we can move it to its own file.
const transactionSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    description: { type: String, required: true },
    merchant: { type: String },
    amount: { type: Number, required: true }, // negative = expense, positive = income
    category: { type: String, default: "Uncategorized" },
    isSubscription: { type: Boolean, default: false }
    // later we can add userId when we add auth
  },
  { timestamps: true }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

// ----- Subscription + Gray Charge Detection -----

function detectRecurringCharges(transactions) {
  const groups = {};

  // Group by merchant + rounded amount
  transactions.forEach(t => {
    if (!t.merchant) return;
    const amt = Math.abs(t.amount);
    if (amt === 0) return;

    const key = `${t.merchant.toLowerCase()}-${Math.round(amt)}`;

    groups[key] = groups[key] || [];
    groups[key].push(t);
  });

  const detected = [];

  for (const key in groups) {
    const list = groups[key];
    if (list.length < 3) continue; // must appear 3+ times

    // Check if spaced monthly-ish
    const dates = list.map(t => new Date(t.date)).sort((a, b) => a - b);

    let isMonthly = true;
    for (let i = 1; i < dates.length; i++) {
      const diff = (dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24); // days
      if (diff < 20 || diff > 40) {
        isMonthly = false;
        break;
      }
    }

    if (isMonthly) {
      const sample = list[0];
      detected.push({
        merchant: sample.merchant,
        amount: Math.abs(sample.amount),
        count: list.length,
        confidence: "high",
        reason: "Recurring monthly charge detected across multiple months"
      });
    }
  }

  return detected;
}

function detectGrayCharges(transactions) {
  const gray = [];

  transactions.forEach(t => {
    const amt = Math.abs(t.amount);
    const desc = t.description.toLowerCase();

    const isLow = amt > 0 && amt <= 10;
    const weird =
      desc.includes("fee") ||
      desc.includes("charge") ||
      desc.includes("service") ||
      desc.includes("processing");

    if (isLow && weird) {
      gray.push({
        merchant: t.merchant || "Unknown",
        description: t.description,
        amount: amt,
        confidence: "medium",
        reason: "Small unexplained transaction—possible gray charge"
      });
    }
  });

  return gray;
}


// ----- Routes -----

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Smart Financial Coach API is running" });
});

// Create a transaction (for now, use this to seed data via Postman)
app.post("/api/transactions", async (req, res) => {
  try {
    const { date, description, merchant, amount, category, isSubscription } =
      req.body;

    const tx = await Transaction.create({
      date,
      description,
      merchant,
      amount,
      category,
      isSubscription
    });

    res.status(201).json(tx);
  } catch (err) {
    console.error("Error creating transaction:", err);
    res.status(500).json({ error: "Failed to create transaction" });
  }
});

// Get all transactions (we'll later add filters)
app.get("/api/transactions", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: -1 }).limit(100);
    res.json(transactions);
  } catch (err) {
    console.error("Error fetching transactions:", err);
    res.status(500).json({ error: "Failed to fetch transactions" });
  }
});

// Dashboard summary based on DB
app.get("/api/dashboard-summary", async (req, res) => {
  try {
    const transactions = await Transaction.find();
    const goals = await Goal.find().sort({ createdAt: -1 });

    if (transactions.length === 0) {
      // No transactions: still return goals, but no spending stats
      const today = new Date();

      const enrichedGoals = goals.map((goal) => {
        const deadline = new Date(goal.deadline);
        const monthsLeft = Math.max(
          1,
          (deadline.getFullYear() - today.getFullYear()) * 12 +
            (deadline.getMonth() - today.getMonth())
        );

        const requiredPerMonth = goal.targetAmount / monthsLeft;

        return {
        ...goal.toObject(),
        monthsLeft,
        requiredPerMonth,
        avgMonthlySavings: 0,
        amountSavedSoFar: 0,
        progressPct: 0,
        status: "unknown",
        };
      });

      return res.json({
        totalSpending: 0,
        projectedSavings: 0,
        activeGoals: enrichedGoals.length,
        mostSpentCategory: null,
        subscriptionsSummary: {
          items: [],
          totalMonthly: 0,
          totalYearly: 0,
        },
        mainInsight: "",
        goalInsight:
          "Once you upload some transactions, I can forecast how your goals are tracking.",
        savingSuggestion: "",
        coachFeed: [],
        currentMonthSpending: 0,
        lastMonthSpending: 0,
        monthOverMonthChangePct: null,
        currentMonthLabel: null,
        enrichedGoals,
      });
    }

    // ----- Use the latest transaction month as the "current view" -----
    const latestTx = transactions.reduce((latest, t) => {
      if (!latest) return t;
      return new Date(t.date) > new Date(latest.date) ? t : latest;
    }, null);

    const viewDate = new Date(latestTx.date);
    const cm = viewDate.getMonth(); // current view month
    const cy = viewDate.getFullYear(); // current view year

    const lastMonthDate = new Date(viewDate);
    lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
    const lm = lastMonthDate.getMonth();
    const ly = lastMonthDate.getFullYear();

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const currentMonthLabel = `${monthNames[cm]} ${cy}`;

    // ----- Current & last month spending -----
    let currentMonthSpending = 0;
    let lastMonthSpending = 0;

    for (const t of transactions) {
      if (t.amount >= 0) continue; // expenses only
      const d = new Date(t.date);
      const absAmount = Math.abs(t.amount);

      if (d.getFullYear() === cy && d.getMonth() === cm) {
        currentMonthSpending += absAmount;
      } else if (d.getFullYear() === ly && d.getMonth() === lm) {
        lastMonthSpending += absAmount;
      }
    }

    // ----- Month-over-month % change -----
    let monthOverMonthChangePct = null;
    if (lastMonthSpending > 0) {
      monthOverMonthChangePct =
        ((currentMonthSpending - lastMonthSpending) / lastMonthSpending) * 100;
    }

    // We'll use *current month* for totalSpending
    const totalSpending = currentMonthSpending;

    // ----- Category aggregation (all time) -----
    const categoryTotals = {};
    for (const t of transactions) {
      if (t.amount < 0) {
        const cat = t.category || "Uncategorized";
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(t.amount);
      }
    }

    let mostSpentCategory = null;
    let max = 0;
    const totalForPercent = Object.values(categoryTotals).reduce(
      (sum, v) => sum + v,
      0
    );

    for (const [cat, val] of Object.entries(categoryTotals)) {
      if (val > max) {
        max = val;
        mostSpentCategory = {
          name: cat,
          amount: val,
          percent:
            totalForPercent > 0
              ? Math.round((val / totalForPercent) * 100)
              : 0,
        };
      }
    }

    // ----- Subscriptions summary -----
    const subscriptionTotals = {};
    for (const t of transactions) {
      if (t.isSubscription && t.amount < 0) {
        const key = t.merchant || t.description;
        const value = Math.abs(t.amount);
        subscriptionTotals[key] = (subscriptionTotals[key] || 0) + value;
      }
    }

    const subscriptionItems = Object.entries(subscriptionTotals).map(
      ([merchant, monthlyAmount]) => ({
        merchant,
        monthlyAmount,
      })
    );

    const totalMonthlySubscriptions = subscriptionItems.reduce(
      (sum, item) => sum + item.monthlyAmount,
      0
    );
    const totalYearlySubscriptions = totalMonthlySubscriptions * 12;

    const subscriptionsSummary = {
      items: subscriptionItems,
      totalMonthly: totalMonthlySubscriptions,
      totalYearly: totalYearlySubscriptions,
    };

    // ----- Projected savings (simple heuristic) -----
    // e.g., “If you trim 20% from flexible categories, you could save this much”
// ----- REAL net savings calculation (income - expenses) -----
let totalIncome = 0;
let totalExpenses = 0;

for (const t of transactions) {
  const amt = t.amount;
  if (amt > 0) totalIncome += amt;
  else totalExpenses += Math.abs(amt);
}

// Average monthly net savings over last 3 months
// (Simple smoothing for better forecasting)
const months = {};
transactions.forEach((t) => {
  const d = new Date(t.date);
  const key = `${d.getFullYear()}-${d.getMonth()}`;
  months[key] = months[key] || { income: 0, expenses: 0 };
  if (t.amount > 0) months[key].income += t.amount;
  else months[key].expenses += Math.abs(t.amount);
});

const last3 = Object.values(months)
  .slice(-3)
  .map((m) => m.income - m.expenses);

const avgMonthlyNetSavings =
  last3.length > 0
    ? last3.reduce((s, v) => s + v, 0) / last3.length
    : totalIncome - totalExpenses;

const projectedSavings = avgMonthlyNetSavings;
    const activeGoals = goals.length;

    // ----- Enrich goals with forecast data -----
    const today = new Date();

const enrichedGoals = goals.map((goal) => {
  const goalCreated = new Date(goal.createdAt);
  const deadline = new Date(goal.deadline);

  const monthsLeft = Math.max(
    1,
    (deadline.getFullYear() - today.getFullYear()) * 12 +
      (deadline.getMonth() - today.getMonth())
  );

  const requiredPerMonth = goal.targetAmount / monthsLeft;

  // Months since goal creation
  const monthsSinceCreation = Math.max(
    0,
    (today.getFullYear() - goalCreated.getFullYear()) * 12 +
      (today.getMonth() - goalCreated.getMonth())
  );

  // Estimated actual progress
  let amountSavedSoFar = avgMonthlyNetSavings * monthsSinceCreation;
  if (amountSavedSoFar > goal.targetAmount) {
    amountSavedSoFar = goal.targetAmount;
  }

  const progressPct = Math.min(
    100,
    ((amountSavedSoFar / goal.targetAmount) * 100).toFixed(0)
  );

  const status =
    avgMonthlyNetSavings >= requiredPerMonth ? "on_track" : "behind";

  return {
    ...goal.toObject(),
    monthsLeft,
    requiredPerMonth,
    avgMonthlySavings: avgMonthlyNetSavings,
    amountSavedSoFar,
    progressPct,
    status,
  };
});


    // ----- Build summary for AI (including goals) -----
    const summaryForAI = {
      totalSpending: currentMonthSpending,
      categoryTotals,
      currentMonthCategories: {}, // optional: you can keep your existing logic if you want
      subscriptionsTotal: totalMonthlySubscriptions,
      transactionCount: transactions.length,
      goals: enrichedGoals.map((g) => ({
        name: g.name,
        targetAmount: g.targetAmount,
        monthsLeft: g.monthsLeft,
        requiredPerMonth: g.requiredPerMonth,
        status: g.status,
      })),
    };

    // ----- Ask Hugging Face model for AI insights -----
    const { mainInsight, goalInsight, savingSuggestion, coachFeed } =
      await generateInsightsWithHF(summaryForAI);

    res.json({
      totalSpending,
      projectedSavings,
      activeGoals,
      mostSpentCategory,
      subscriptionsSummary,
      mainInsight,
      goalInsight,
      savingSuggestion,
      coachFeed,
      currentMonthSpending,
      lastMonthSpending,
      monthOverMonthChangePct,
      currentMonthLabel,
      enrichedGoals,
    });
  } catch (err) {
    console.error("Error building dashboard summary:", err);
    res.status(500).json({ error: "Failed to build dashboard summary" });
  }
});



// Upload CSV of transactions
// Expected CSV headers: date,description,merchant,amount,category,isSubscription
app.post(
  "/api/transactions/upload-csv",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const csvString = req.file.buffer.toString("utf-8");
      const lines = csvString.split(/\r?\n/).filter((line) => line.trim() !== "");

      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV appears to be empty" });
      }

      // Parse header
      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

      const requiredHeaders = [
        "date",
        "description",
        "merchant",
        "amount",
        "category",
        "issubscription",
      ];

      const missing = requiredHeaders.filter(
        (h) => !headers.includes(h.toLowerCase())
      );
      if (missing.length > 0) {
        return res.status(400).json({
          error: "Missing required columns",
          missing,
        });
      }

      const dateIndex = headers.indexOf("date");
      const descriptionIndex = headers.indexOf("description");
      const merchantIndex = headers.indexOf("merchant");
      const amountIndex = headers.indexOf("amount");
      const categoryIndex = headers.indexOf("category");
      const isSubscriptionIndex = headers.indexOf("issubscription");

      let docsToInsert = [];


      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(",").map((v) => v.trim());
        if (row.length === 1 && row[0] === "") continue; // skip blank

        const rawDate = row[dateIndex];
        const rawDescription = row[descriptionIndex];
        const rawMerchant = row[merchantIndex];
        const rawAmount = row[amountIndex];
        const rawCategory = row[categoryIndex];
        const rawIsSub = row[isSubscriptionIndex];

        if (!rawDate || !rawDescription || !rawAmount) {
          // skip incomplete rows
          continue;
        }

        const amountNum = parseFloat(rawAmount);
        if (Number.isNaN(amountNum)) continue;

        const isSubscription =
          typeof rawIsSub === "string"
            ? rawIsSub.toLowerCase() === "true" || rawIsSub === "1"
            : false;

        docsToInsert.push({
          date: new Date(rawDate),
          description: rawDescription,
          merchant: rawMerchant || undefined,
          amount: amountNum,
          category: rawCategory || "Uncategorized",
          isSubscription,
        });
      }

            if (docsToInsert.length === 0) {
        return res
          .status(400)
          .json({ error: "No valid rows found in CSV to import" });
      }

      // 🔹 AI auto-categorization step
      try {
        docsToInsert = await autoCategorizeTransactionsWithHF(docsToInsert);
      } catch (aiErr) {
        console.error("Auto-categorization failed:", aiErr);
        // If AI fails, we just continue with original categories from CSV
      }
      const result = await Transaction.insertMany(docsToInsert);

      res.json({
        importedCount: result.length,
        message: `Imported ${result.length} transactions from CSV`,
      });

    } catch (err) {
      console.error("Error processing CSV upload:", err);
      res.status(500).json({ error: "Failed to process CSV file" });
    }
  }
);
// ----- AI: Generate natural-language insights using Hugging Face Router (OpenAI-style) -----
async function generateInsightsWithHF(summary) {
  const modelId = process.env.HF_MODEL_ID;
  const hfToken = process.env.HF_TOKEN;

  if (!modelId || !hfToken) {
    throw new Error("HF_MODEL_ID or HF_TOKEN not set in .env");
  }

  const prompt = `
You are a friendly personal financial coach. You will receive JSON with a user's spending summary.

Respond ONLY with a valid JSON object, no extra text, in this exact format:

{
  "mainInsight": "one short paragraph about their current spending, in plain language",
  "goalInsight": "one short paragraph about whether they are on track to reach their financial goals, based on deadlines and required monthly savings",
  "savingSuggestion": "one practical, non-judgmental suggestion for how they could save a bit more next month",
  "coachFeed": [
    "short bullet-style tip 1",
    "short bullet-style tip 2",
    "short bullet-style tip 3"
  ]
}


Rules:
- Keep the tone supportive, not shaming.
- Use dollar amounts when helpful.
- Do not mention that you are an AI or language model.
- Do not include any markdown or bullet characters, just plain sentences.

Here is the JSON summary of their data:

${JSON.stringify(summary, null, 2)}
`;

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content:
            "You are a concise, friendly personal financial coach. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 400,
      temperature: 0.5,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("HF API error:", response.status, text);
    throw new Error(`HF request failed with status ${response.status}`);
  }

  const data = await response.json();

  const rawText =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  // Extract JSON portion from the output
  let jsonText = rawText;
  const firstBrace = rawText.indexOf("{");
  const lastBrace = rawText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    jsonText = rawText.slice(firstBrace, lastBrace + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to parse HF JSON response:", rawText);
    throw new Error("Could not parse AI insights JSON");
  }

const mainInsight =
  parsed.mainInsight ||
  "Here’s an overview of how your money is being used this month.";

const goalInsight =
  parsed.goalInsight ||
  "Based on your current savings pattern, we can help you understand if your goals are on track once more data is available.";

const savingSuggestion =
  parsed.savingSuggestion ||
  "Pick one category to reduce slightly and move the difference into savings automatically.";

const coachFeed = Array.isArray(parsed.coachFeed) ? parsed.coachFeed : [];

return { mainInsight, goalInsight, savingSuggestion, coachFeed };

}
// ----- AI: Auto-categorize transactions using Hugging Face Router -----
async function autoCategorizeTransactionsWithHF(transactions) {
  const modelId = process.env.HF_MODEL_ID;
  const hfToken = process.env.HF_TOKEN;

  if (!modelId || !hfToken) {
    throw new Error("HF_MODEL_ID or HF_TOKEN not set in .env");
  }

  // Find transactions that need a category
  const itemsToCategorize = [];
  transactions.forEach((t, index) => {
    const cat = (t.category || "").trim();
    if (!cat || cat.toLowerCase() === "uncategorized") {
      itemsToCategorize.push({
        index,
        description: t.description || "",
        merchant: t.merchant || "",
        amount: t.amount,
      });
    }
  });

  if (itemsToCategorize.length === 0) {
    // Nothing to do
    return transactions;
  }

  // To avoid enormous prompts, limit how many we send at once
  const MAX_ITEMS_FOR_AI = 25;
  const batch = itemsToCategorize.slice(0, MAX_ITEMS_FOR_AI);

  const prompt = `
You are a personal finance assistant that categorizes transactions.

You will receive a list of transactions with fields: index, description, merchant, amount.
Your task is to assign a spending category to each transaction.

Allowed categories (choose the closest one):
- "Bills"
- "Groceries"
- "Eating Out"
- "Transportation"
- "Shopping"
- "Entertainment"
- "Health & Fitness"
- "Travel"
- "Subscriptions"
- "Income"
- "Transfer"
- "Other"

Important:
- Always return one of the allowed categories.
- Use "Subscriptions" for recurring digital services (Netflix, Spotify, phone plans, etc.).
- Use "Income" only when the amount is positive and looks like salary, paycheck, or refund.
- Use "Transfer" when it looks like money moved between accounts, ATM, or generic transfer.
- If unsure, use "Other".

Respond ONLY with a valid JSON array, no extra text, in this exact format:

[
  { "index": 0, "category": "Groceries" },
  { "index": 3, "category": "Eating Out" }
]

Here are the transactions to categorize:

${JSON.stringify(batch, null, 2)}
`;

  const response = await fetch("https://router.huggingface.co/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${hfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        {
          role: "system",
          content:
            "You are a precise transaction categorization engine. Always respond with valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 400,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("HF category API error:", response.status, text);
    throw new Error(`HF category request failed with status ${response.status}`);
  }

  const data = await response.json();

  const rawText =
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content
      ? data.choices[0].message.content.trim()
      : "";

  // Extract JSON array
  let jsonText = rawText;
  const firstBracket = rawText.indexOf("[");
  const lastBracket = rawText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    jsonText = rawText.slice(firstBracket, lastBracket + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (err) {
    console.error("Failed to parse HF category JSON response:", rawText);
    throw new Error("Could not parse AI category JSON");
  }

  // Apply categories back to original transactions
  parsed.forEach((item) => {
    if (
      typeof item.index === "number" &&
      transactions[item.index]
    ) {
      const cat = (item.category || "").trim();
      if (cat) {
        transactions[item.index].category = cat;
      }
    }
  });

  return transactions;
}
app.post("/api/goals", async (req, res) => {
  try {
    const { name, targetAmount, deadline } = req.body;

    const goal = await Goal.create({
      name,
      targetAmount,
      deadline: new Date(deadline)
    });

    res.status(201).json(goal);
  } catch (err) {
    console.error("Error creating goal:", err);
    res.status(500).json({ error: "Failed to create goal" });
  }
});
app.get("/api/goals", async (req, res) => {
  try {
    const goals = await Goal.find().sort({ createdAt: -1 });
    res.json(goals);
  } catch (err) {
    console.error("Error fetching goals:", err);
    res.status(500).json({ error: "Failed to fetch goals" });
  }
});
// ----- GET detected subscriptions + gray charges -----
app.get("/api/subscriptions/detected", async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ date: 1 });

    const recurring = detectRecurringCharges(transactions);
    const gray = detectGrayCharges(transactions);

    res.json({
      detectedSubscriptions: recurring,
      grayCharges: gray
    });
  } catch (err) {
    console.error("Error detecting subscriptions:", err);
    res.status(500).json({ error: "Failed to detect subscriptions" });
  }
});
app.post("/api/subscriptions/mark-not", async (req, res) => {
  try {
    const { merchant, amount } = req.body;

    await Transaction.updateMany(
      {
        merchant,
        amount: amount * -1 // stored negative
      },
      { isSubscription: false }
    );

    res.json({ message: "Marked as not a subscription" });
  } catch (err) {
    console.error("Error marking not subscription:", err);
    res.status(500).json({ error: "Failed to update" });
  }
});

// ----- Connect to Mongo and start server -----
async function start() {
  try {
    if (!MONGO_URI) {
      throw new Error("MONGO_URI is not defined in .env");
    }

    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`✅ API server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err);
    process.exit(1);
  }
}

start();
