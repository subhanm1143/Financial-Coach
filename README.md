# Smart Financial Coach

Smart Financial Coach is a full-stack app that turns raw transaction data into an AI-powered financial dashboard.
You can upload a CSV of transactions, see summarized spending, detect subscriptions and gray charges, and track goals with basic forecasting.

---

Video Link: https://youtu.be/Bp-XDyO6WDA

## 1. Prerequisites

Before running the project, make sure you have:

* **Node.js** (v18+ recommended)
* **npm** (comes with Node)
* **MongoDB** (Atlas or local instance)
* A **Hugging Face API token** with access to a chat model

---

## 2. Project Structure

The repo is organized as:

```bash
Financial-Coach/
  client/   # React frontend
  server/   # Node/Express backend
```

You will run the **server** and **client** separately.

---

## 3. Backend Setup (server)

1. Open a terminal and go to the server folder:

   ```bash
   cd server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create a `.env` file inside the `server` directory:

   ```bash
   touch .env
   ```

4. Add the following values to `server/.env`:

   ```env
   MONGO_URI=your_mongodb_connection_string
   HF_MODEL_ID=your_hf_model_id_here
   HF_TOKEN=your_hugging_face_token_here
   PORT=5000
   ```

   Examples:

   * `MONGO_URI` → a MongoDB Atlas URI like `mongodb+srv://user:pass@cluster/...`
   * `HF_MODEL_ID` → something like `meta-llama/Meta-Llama-3-8B-Instruct` (or any chat-completions model you’re using)
   * `HF_TOKEN` → your Hugging Face access token

5. Start the backend server:

   ```bash
   node server.js
   ```

   If everything is working, you should see something like:

   ```bash
   ✅ Connected to MongoDB
   ✅ API server running on http://localhost:5000
   ```

---

## 4. Frontend Setup (client)

1. Open a **second** terminal window and go to the client folder:

   ```bash
   cd client
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the React dev server:

   ```bash
   npm start
   ```

4. The app will usually open automatically at:

   ```text
   http://localhost:3000
   ```

   The frontend is configured to talk to the backend at `http://localhost:5000`.

---

## 5. How to Use the App (Demo Flow)

1. Make sure both servers are running:

   * Backend → `http://localhost:5000/api/health`
   * Frontend → `http://localhost:3000`

2. In the browser, open the dashboard (React app).

3. Scroll to the **“Upload sample transactions (CSV)”** area on the right.

4. Upload a CSV file with this header format:

   ```text
   date,description,merchant,amount,category,isSubscription
   ```

   Example rows:

   ```text
   2024-01-01,Netflix Subscription,Netflix,-15.99,Subscriptions,true
   2024-01-02,Groceries,Walmart,-82.43,Groceries,false
   ```

5. After upload, the app will:

   * Parse and store transactions in MongoDB
   * Auto-categorize any uncategorized transactions using AI
   * Recalculate dashboard metrics

6. Explore the dashboard:

   * **Top summary**: This month’s spending, projected savings, active goals
   * **Subscriptions card**: Recurring charges based on `isSubscription`
   * **AI Subscription Insights**: Automatically detected recurring patterns
   * **Gray Charges**: Small unusual fees flagged for review
   * **Goals section**: Create goals and see months left, required per month, and progress
   * **All Transactions table**: View and sort all transactions

---

## 6. Common Issues

**CORS / Network Errors**
Make sure:

* Backend is running on `http://localhost:5000`
* Frontend is pointing to that URL in `Dashboard.js` fetch calls

**MongoDB connection error**
Check:

* `MONGO_URI` is correct in `server/.env`
* Your IP is whitelisted in MongoDB Atlas (if using Atlas)

**HF / AI errors**
Check:

* `HF_TOKEN` and `HF_MODEL_ID` are set correctly
* Your token has permission to call the model via the Hugging Face Router

---

## 7. Stopping the App

To stop the servers:

* In the terminal running the backend: press `Ctrl + C`
* In the terminal running the frontend: press `Ctrl + C`

