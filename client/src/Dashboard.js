import React, { useEffect, useState } from "react";

function Dashboard() {
    const [summary, setSummary] = useState({
    totalSpending: 0,
    projectedSavings: 0,
    activeGoals: 0,
    mostSpentCategory: null,
    coachFeed: [],
    subscriptionsSummary: {
        items: [],
        totalMonthly: 0,
        totalYearly: 0,
    },
    mainInsight: "",
    savingSuggestion: "",
    goalInsight: "",          // 🔹 NEW
    monthOverMonthChangePct: null,
    currentMonthLabel: null,
    enrichedGoals: [],        // 🔹 NEW
    });




  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Transactions and sorting state
  const [transactions, setTransactions] = useState([]);
  const [txError, setTxError] = useState(null);
  const [txSortConfig, setTxSortConfig] = useState({
    key: "date",
    direction: "desc",
  });

  // Goal creation form state
    const [goalName, setGoalName] = useState("");
    const [goalTargetAmount, setGoalTargetAmount] = useState("");
    const [goalDeadline, setGoalDeadline] = useState("");
    const [goalSaving, setGoalSaving] = useState(false);
    const [goalError, setGoalError] = useState("");
    const [goalMessage, setGoalMessage] = useState("");

  const [detectedSubs, setDetectedSubs] = useState([]);
const [grayCharges, setGrayCharges] = useState([]);

  // Helper to load summary from API
  const loadSummary = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch("http://localhost:5000/api/dashboard-summary", {
        // if you later add user scoping, add "x-user-id" here
        // headers: { "x-user-id": "demo-user-1" },
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();

        setSummary({
        totalSpending: data.totalSpending || 0,
        projectedSavings: data.projectedSavings || 0,
        activeGoals: data.activeGoals || 0,
        mostSpentCategory: data.mostSpentCategory || null,
        coachFeed: data.coachFeed || [],
        subscriptionsSummary:
            data.subscriptionsSummary || {
            items: [],
            totalMonthly: 0,
            totalYearly: 0,
            },
        mainInsight: data.mainInsight || "",
        savingSuggestion: data.savingSuggestion || "",
        goalInsight: data.goalInsight || "",                 // 🔹 NEW
        monthOverMonthChangePct: data.monthOverMonthChangePct ?? null,
        currentMonthLabel: data.currentMonthLabel || null,
        enrichedGoals: Array.isArray(data.enrichedGoals)     // 🔹 NEW
            ? data.enrichedGoals
            : [],
        });


    } catch (err) {
      console.error("Failed to load dashboard summary:", err);
      setError("Failed to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to load transactions from API
  const loadTransactions = async () => {
    try {
      setTxError(null);

      const res = await fetch("http://localhost:5000/api/transactions", {
        // headers: { "x-user-id": "demo-user-1" },
      });

      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setTransactions(data || []);
    } catch (err) {
      console.error("Failed to load transactions:", err);
      setTxError("Failed to load transactions.");
    }
  };
  const loadDetectedSubscriptions = async () => {
  try {
    const res = await fetch("http://localhost:5000/api/subscriptions/detected");
    const data = await res.json();

    setDetectedSubs(data.detectedSubscriptions || []);
    setGrayCharges(data.grayCharges || []);
  } catch (err) {
    console.error("Failed to load detected subs:", err);
  }
};


  useEffect(() => {
    // Load both dashboard summary and transactions
    loadSummary();
    loadTransactions();
    loadDetectedSubscriptions();
  }, []);

    const {
    totalSpending,
    projectedSavings,
    activeGoals,
    mostSpentCategory,
    coachFeed,
    subscriptionsSummary,
    mainInsight,
    savingSuggestion,
    goalInsight,         // 🔹 NEW
    monthOverMonthChangePct,
    currentMonthLabel,
    enrichedGoals,       // 🔹 NEW
    } = summary;


    const handleCreateGoal = async (e) => {
  e.preventDefault();
  setGoalError("");
  setGoalMessage("");

  if (!goalName || !goalTargetAmount || !goalDeadline) {
    setGoalError("Please fill in all fields before creating a goal.");
    return;
  }

  const targetAmountNum = parseFloat(goalTargetAmount);
  if (Number.isNaN(targetAmountNum) || targetAmountNum <= 0) {
    setGoalError("Target amount must be a positive number.");
    return;
  }

  try {
    setGoalSaving(true);

    const res = await fetch("http://localhost:5000/api/goals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // "x-user-id": "demo-user-1", // later if you add user auth
      },
      body: JSON.stringify({
        name: goalName,
        targetAmount: targetAmountNum,
        deadline: goalDeadline,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Failed to create goal");
    }

    setGoalMessage(`Goal "${data.name}" created successfully.`);
    setGoalName("");
    setGoalTargetAmount("");
    setGoalDeadline("");

    // Reload dashboard so enrichedGoals + goalInsight update
    await loadSummary();
  } catch (err) {
    console.error("Failed to create goal:", err);
    setGoalError(err.message || "Failed to create goal.");
  } finally {
    setGoalSaving(false);
  }
};


  // Handle CSV upload
  const handleCsvUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadError("");
    setUploadMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        "http://localhost:5000/api/transactions/upload-csv",
        {
          method: "POST",
          // headers: { "x-user-id": "demo-user-1" }, // later if needed
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadMessage(
        data.message || `Imported ${data.importedCount || 0} transactions.`
      );

      // Reload dashboard + transactions after upload
      await Promise.all([loadSummary(), loadTransactions()]);
    } catch (err) {
      console.error("CSV upload failed:", err);
      setUploadError(err.message || "CSV upload failed");
    } finally {
      setUploading(false);
      // Clear the file input value so the same file can be re-uploaded if needed
      event.target.value = "";
    }
  };

  // ----- Sorting helpers for transactions -----
  const handleSort = (key) => {
    setTxSortConfig((prev) => {
      if (prev.key === key) {
        // toggle direction
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "asc" };
    });
  };

  const getSortIndicator = (key) => {
    if (txSortConfig.key !== key) return "";
    return txSortConfig.direction === "asc" ? " ▲" : " ▼";
  };

  const sortedTransactions = [...transactions].sort((a, b) => {
    const { key, direction } = txSortConfig;
    const dir = direction === "asc" ? 1 : -1;

    if (key === "date") {
      const da = new Date(a.date);
      const db = new Date(b.date);
      return da < db ? -1 * dir : da > db ? 1 * dir : 0;
    }

    if (key === "amount") {
      return (a.amount - b.amount) * dir;
    }

    // String fields
    const va = (a[key] || "").toString().toLowerCase();
    const vb = (b[key] || "").toString().toLowerCase();
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  });

  return (
    <div className="dashboard">
      {/* Top app header */}
      <header className="dashboard-header">
        <div>
          <h1>Smart Financial Coach</h1>
          <p>
            AI-powered insights that turn your raw transactions into clear,
            actionable advice.
          </p>
        </div>
        <div className="dashboard-month">
          <span>Current view</span>
          <strong>{currentMonthLabel || "Current month"}</strong>
        </div>
      </header>

      {/* Loading / error messages */}
      {loading && (
        <p style={{ color: "#9ca3af", fontSize: "14px" }}>
          Loading your dashboard...
        </p>
      )}
      {error && (
        <p style={{ color: "#f97373", fontSize: "14px", marginBottom: "8px" }}>
          {error}
        </p>
      )}

      {/* Hero: center circle + 4 corner notes */}
      <main className="dashboard-main">
        {/* Top-left: Subscriptions */}
        <section className="note-card top-left">
          <h2>Subscriptions</h2>
          <p className="note-subtitle">
            Recurring charges detected from your transaction history (based on{" "}
            <code>isSubscription</code>).
          </p>

          {subscriptionsSummary.items &&
          subscriptionsSummary.items.length > 0 ? (
            <>
              <ul className="note-list">
                {subscriptionsSummary.items.map((sub) => (
                  <li key={sub.merchant}>
                    <span>{sub.merchant}</span>
                    <span>${sub.monthlyAmount.toFixed(2)} / mo</span>
                  </li>
                ))}
              </ul>
              <p className="note-footer">
                Estimated yearly cost:{" "}
                <strong>${subscriptionsSummary.totalYearly.toFixed(2)}</strong>
              </p>
            </>
          ) : (
            <p className="note-text muted">
              No subscriptions detected yet. Mark recurring charges with{" "}
              <code>isSubscription: true</code> in your CSV.
            </p>
          )}
          
        </section>

        {/* Top-right: Most spent category */}
        <section className="note-card top-right">
          <h2>Most Spent</h2>
          <p className="note-subtitle">
            Category where you spent the most based on your transactions.
          </p>

          {mostSpentCategory ? (
            <>
              <p className="note-highlight">{mostSpentCategory.name}</p>
              <p className="note-text">
                ${mostSpentCategory.amount.toFixed(2)}{" "}
                <span className="muted">
                  ({mostSpentCategory.percent}% of total spending)
                </span>
              </p>
            </>
          ) : (
            <p className="note-text muted">
              Not enough data yet. Add more transactions to see this.
            </p>
          )}

          <p className="note-footer">
            Tip: Set a weekly cap and let the coach warn you when you’re close.
          </p>
        </section>
        {/* NEW AI Subscription Insight Card (Top-Center) */}
        <section className="note-card top-center">
        <h2>AI Subscription Insights</h2>
        <p className="note-subtitle">
            Automatically detected recurring patterns in your transactions.
        </p>

        {detectedSubs.length === 0 ? (
            <p className="note-text muted">No recurring patterns detected.</p>
        ) : (
            <ul className="note-list small">
            {detectedSubs.map((sub, i) => (
                <li key={i}>
                <span>{sub.merchant}</span>
                <span>${sub.amount.toFixed(2)} / mo</span>
                </li>
            ))}
            </ul>
        )}
        </section>
        {/* NEW Gray-Charge Detector Card (Bottom-Center) */}
        <section className="note-card bottom-center">
        <h2>Possible Gray Charges</h2>
        <p className="note-subtitle">
            Small unusual fees that may be accidental or forgotten charges.
        </p>

        {grayCharges.length === 0 ? (
            <p className="note-text muted">No gray charges detected.</p>
        ) : (
            <ul className="note-list small">
            {grayCharges.map((g, i) => (
                <li key={i}>
                <span>{g.description}</span>
                <strong>${g.amount.toFixed(2)}</strong>
                </li>
            ))}
            </ul>
        )}
        </section>


        {/* Bottom-left: Insight */}
        <section className="note-card bottom-left">
        <h2>Insight</h2>
        <p className="note-subtitle">
            AI-generated insight based on your spending and goals.
        </p>
        <p className="note-text">
            {goalInsight || mainInsight || "Upload some transactions and add a goal to see personalized insights here."}
        </p>
        </section>


        {/* Bottom-right: Ways to save */}
        <section className="note-card bottom-right">
          <h2>What You Can Do to Save</h2>
          <p className="note-subtitle">
            Simple, non-judgmental suggestions you can start with today.
          </p>
          <p className="note-text">
            {savingSuggestion ||
              "Start by picking one flexible category (like eating out or shopping) and aiming to spend a little less next month. Move the difference into savings automatically."}
          </p>
          <ul className="note-list small">
            <li>Pick one category to focus on this week.</li>
            <li>Set a target (e.g., $15–$25 less).</li>
            <li>Schedule an automatic transfer of the difference.</li>
          </ul>
        </section>

        {/* Center: Total spending circle */}
        <section className="center-circle">
          <div className="circle">
            <p className="circle-label">Total Spending</p>
            <p className="circle-amount">
              $
              {totalSpending.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="circle-caption">for this month so far</p>
          </div>
        </section>
      </main>

      {/* Bottom part: metrics, coach feed, trust/security, upload placeholder */}
      <section className="dashboard-bottom">
        {/* Key metrics row */}
        <div className="metrics-row">
          <div className="metric-card">
            <p className="metric-label">This Month&apos;s Spending</p>
            <p className="metric-value">
              $
              {totalSpending.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="metric-caption">
                Compared to last month:{" "}
                {Number.isFinite(monthOverMonthChangePct) ? (
                    <span
                    className={
                        monthOverMonthChangePct <= 0 ? "good" : "bad"
                    }
                    >
                    {monthOverMonthChangePct > 0 ? "+" : ""}
                    {monthOverMonthChangePct.toFixed(1)}%
                    </span>
                ) : (
                    <span className="muted">n/a</span>
                )}
                </p>
          </div>

          <div className="metric-card">
            <p className="metric-label">Projected Savings</p>
            <p className="metric-value">
              $
              {projectedSavings.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="metric-caption">
              If you follow this week&apos;s suggestions.
            </p>
          </div>

          <div className="metric-card">
            <p className="metric-label">Active Goals</p>
            <p className="metric-value">{activeGoals}</p>
            <p className="metric-caption">
              e.g., down payment, emergency fund, debt payoff.
            </p>
          </div>
        </div>

        {/* Coach feed + security / upload */}
        <div className="bottom-panels">
          <div className="panel coach-feed">
            <h3>Coach Feed</h3>
            <p className="panel-subtitle">
              Personalized insights generated from your recent transactions.
            </p>
            {coachFeed && coachFeed.length > 0 ? (
              <ul>
                {coachFeed.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className="note-text muted">
                No insights yet. Add more transactions to see your coach feed.
              </p>
            )}
          </div>

          <div className="panel security-panel">
            <h3>Trust &amp; Security</h3>
            <p className="panel-subtitle">
              Why it&apos;s safe to connect your financial data.
            </p>
            <ul>
              <li>Read-only access to your transactions.</li>
              <li>Bank-level encryption for all sensitive data.</li>
              <li>No passwords or card numbers are stored in plain text.</li>
            </ul>

            <div className="upload-placeholder">
              <p className="upload-title">Upload sample transactions (CSV)</p>
              <p className="upload-text">
                Use a CSV with headers{" "}
                <code>
                  date, description, merchant, amount, category, isSubscription
                </code>
                . Negative amounts = spending.
              </p>

              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                disabled={uploading}
                style={{ marginBottom: "8px" }}
              />

              {uploading && (
                <p className="note-text muted">Uploading and processing...</p>
              )}
              {uploadMessage && (
                <p className="note-text" style={{ color: "#4ade80" }}>
                  {uploadMessage}
                </p>
              )}
              {uploadError && (
                <p className="note-text" style={{ color: "#f97373" }}>
                  {uploadError}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
      <section className="goals-section">
        <h2>Your Goals</h2>
          {/* New: quick goal creation form */}
  <form className="goal-form" onSubmit={handleCreateGoal}>
    <div className="goal-form-row">
      <div className="goal-form-field">
        <label>Goal name</label>
        <input
          type="text"
          value={goalName}
          onChange={(e) => setGoalName(e.target.value)}
          placeholder="e.g., Down payment, Emergency fund"
        />
      </div>

      <div className="goal-form-field">
        <label>Target amount ($)</label>
        <input
          type="number"
          step="0.01"
          value={goalTargetAmount}
          onChange={(e) => setGoalTargetAmount(e.target.value)}
          placeholder="3000"
        />
      </div>

      <div className="goal-form-field">
        <label>Deadline</label>
        <input
          type="date"
          value={goalDeadline}
          onChange={(e) => setGoalDeadline(e.target.value)}
        />
      </div>
    </div>

    <div className="goal-form-actions">
      <button type="submit" disabled={goalSaving}>
        {goalSaving ? "Saving..." : "Add Goal"}
      </button>

      {goalError && (
        <span className="goal-form-message error">{goalError}</span>
      )}
      {goalMessage && (
        <span className="goal-form-message success">{goalMessage}</span>
      )}
    </div>
  </form>
            
        {(!enrichedGoals || enrichedGoals.length === 0) ? (
            <p className="note-text muted">
            You don&apos;t have any goals yet. In a full version of this app, you could add a goal like
            &quot;Save $3,000 for a down payment in 10 months&quot; and I&apos;d forecast whether you&apos;re on track.
            </p>
        ) : (
            <div className="goals-grid">
            {enrichedGoals.map((goal) => (
                <div key={goal._id} className="goal-card">
                <h3>{goal.name}</h3>

                <p className="goal-meta">
                    Target:{" "}
                    <strong>${goal.targetAmount.toFixed(2)}</strong>
                </p>
                <p className="goal-meta">
                    Months left:{" "}
                    <strong>{goal.monthsLeft}</strong>
                </p>
                <p className="goal-meta">
                    Required / month:{" "}
                    <strong>${goal.requiredPerMonth.toFixed(2)}</strong>
                </p>
                <p className="goal-meta">
                    Estimated savings / month:{" "}
                    <strong>${goal.avgMonthlySavings.toFixed(2)}</strong>
                </p>
                <p className="goal-meta">
                Saved so far: <strong>${goal.amountSavedSoFar.toFixed(2)}</strong>
                </p>

                <div className="goal-progress-bar">
                <div
                    className="goal-progress-fill"
                    style={{ width: `${goal.progressPct}%` }}
                ></div>
                </div>

                <p className="goal-progress-text">{goal.progressPct}% complete</p>


                <p className={`goal-status ${goal.status}`}>
                    {goal.status === "on_track"
                    ? "🟢 On track"
                    : goal.status === "behind"
                    ? "🔴 Behind"
                    : "⚪ Not enough data yet"}
                </p>
                </div>
            ))}
            </div>
        )}

        {goalInsight && (
            <div className="goal-insight-box">
            <h3>Goal Forecast</h3>
            <p>{goalInsight}</p>
            </div>
        )}
        </section>


      {/* 🔽 New: Transactions table under the dashboard */}
      <section className="transactions-section">
        <h2>All Transactions</h2>
        <p className="panel-subtitle">
          Sorted and AI-enriched with categories where missing.
        </p>

        {txError && (
          <p style={{ color: "#f97373", fontSize: "14px", marginBottom: "8px" }}>
            {txError}
          </p>
        )}

        {transactions.length === 0 ? (
          <p className="note-text muted">
            No transactions yet. Upload a CSV to see them here.
          </p>
        ) : (
          <div className="transactions-table-wrapper">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("date")}>
                    Date{getSortIndicator("date")}
                  </th>
                  <th onClick={() => handleSort("description")}>
                    Description{getSortIndicator("description")}
                  </th>
                  <th onClick={() => handleSort("merchant")}>
                    Merchant{getSortIndicator("merchant")}
                  </th>
                  <th onClick={() => handleSort("amount")}>
                    Amount{getSortIndicator("amount")}
                  </th>
                  <th onClick={() => handleSort("category")}>
                    Category{getSortIndicator("category")}
                  </th>
                  <th onClick={() => handleSort("isSubscription")}>
                    Subscription{getSortIndicator("isSubscription")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedTransactions.map((tx) => (
                  <tr key={tx._id}>
                    <td>
                      {tx.date
                        ? new Date(tx.date).toLocaleDateString()
                        : "-"}
                    </td>
                    <td>{tx.description}</td>
                    <td>{tx.merchant || "-"}</td>
                    <td
                      className={
                        tx.amount < 0 ? "amount-negative" : "amount-positive"
                      }
                    >
                      $
                      {tx.amount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td>{tx.category || "Uncategorized"}</td>
                    <td>{tx.isSubscription ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
