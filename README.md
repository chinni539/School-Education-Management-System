# 🎓 EduCore — PostgreSQL Edition
## Free Deployment: Supabase + Render + Netlify
### No credit card needed · No Oracle Cloud · Live in 15 minutes

---

## 📁 Project Structure

```
educore-backend/
├── server.js                  ← Entry point
├── package.json
├── .env.example               ← Copy to .env
├── config/
│   └── db.js                  ← PostgreSQL connection pool
├── middleware/
│   └── errorHandler.js
├── routes/
│   ├── dashboard.js           ← KPIs + cash flow
│   ├── students.js            ← Student CRUD
│   ├── fees.js                ← Fee payments
│   ├── attendance.js          ← Attendance (single + bulk)
│   ├── exams.js               ← Exams + marks
│   ├── teachers.js            ← Staff management
│   ├── salaries.js            ← Payroll
│   └── promotions.js          ← Class promotions
└── sql/
    └── schema.sql             ← Run once in Supabase SQL Editor
```

---

## 🗄️ STEP 1 — Create Free Database on Supabase

**No credit card required.**

1. Go to **https://supabase.com** → Sign Up with GitHub (easiest)
2. Click **"New Project"**
   ```
   Organization:  Personal
   Name:          educore
   Database Password: Choose a strong password  ← SAVE THIS
   Region:        South Asia (Mumbai)  ← closest to India
   Plan:          Free
   ```
3. Click **"Create new project"** → wait ~2 minutes

4. **Run the schema** — create all tables:
   - Left sidebar → **SQL Editor** → **New query**
   - Paste the contents of `sql/schema.sql`
   - Click **Run** (green button)
   - You should see all 7 tables listed at the bottom ✅

5. **Get your connection string:**
   - Left sidebar → **Settings** → **Database**
   - Scroll to **"Connection string"** section
   - Click **"URI"** tab
   - Copy the string — it looks like:
     ```
     postgresql://postgres:[YOUR-PASSWORD]@db.abcdefgh.supabase.co:5432/postgres
     ```
   - Replace `[YOUR-PASSWORD]` with your actual password

---

## 🖥️ STEP 2 — Deploy Backend to Render.com

**No credit card required — just GitHub login.**

### 2a. Push code to GitHub

1. Create account at **https://github.com** (free)
2. Create a **new repository** called `educore-backend` (set to Private)
3. Upload your files:

```bash
cd educore-backend
git init
git add .
git commit -m "EduCore backend - PostgreSQL"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/educore-backend.git
git push -u origin main
```

### 2b. Deploy on Render

1. Go to **https://render.com** → Sign up with GitHub
2. Click **"New +"** → **"Web Service"**
3. Connect your `educore-backend` repository
4. Configure:
   ```
   Name:            educore-api
   Region:          Singapore  (closest free region to India)
   Branch:          main
   Runtime:         Node
   Build Command:   npm install
   Start Command:   npm start
   Instance Type:   Free
   ```
5. Click **"Advanced"** → **"Add Environment Variable"** — add these one by one:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | `postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres` |
   | `NODE_ENV` | `production` |
   | `PORT` | `3000` |
   | `ALLOWED_ORIGINS` | `https://your-app.netlify.app` *(update after Step 3)* |

6. Click **"Create Web Service"**
7. Wait 2–3 minutes for deployment
8. Your API URL will be: `https://educore-api.onrender.com`

✅ **Test it:** Visit `https://educore-api.onrender.com/health` — you should see:
```json
{ "status": "ok", "db": "connected" }
```

---

## 🌐 STEP 3 — Deploy Frontend to Netlify

**Drag & drop — no command line needed.**

1. Open `school-management.html` in a text editor
2. Find this line near the bottom in the `<script>` section:
   ```javascript
   const API = 'http://localhost:3000/api';
   ```
3. Replace it with your Render URL:
   ```javascript
   const API = 'https://educore-api.onrender.com/api';
   ```
4. Save the file

5. Go to **https://netlify.com** → Sign up (free, no card)
6. Click **"Add new site"** → **"Deploy manually"**
7. **Drag and drop** your `school-management.html` file into the box
8. Your app goes live instantly at a URL like:
   ```
   https://educore-school-abc123.netlify.app
   ```

9. Go back to Render → Your service → **Environment** tab
   → Update `ALLOWED_ORIGINS` to your Netlify URL
   → Click **"Save Changes"** → Render auto-redeploys

---

## ✅ That's It! Your EduCore App Is Live

| What | URL |
|------|-----|
| 🎓 School App | `https://educore-school-xxx.netlify.app` |
| 📡 API | `https://educore-api.onrender.com` |
| ❤️ Health | `https://educore-api.onrender.com/health` |
| 👥 Students | `https://educore-api.onrender.com/api/students` |

---

## 🔄 Connect Frontend to Live API

Replace static data arrays in `school-management.html` with real API calls:

```javascript
const API = 'https://educore-api.onrender.com/api';

// Load students on page open
async function loadStudents(filters = {}) {
  const params = new URLSearchParams(filters).toString();
  const res    = await fetch(`${API}/students?${params}`);
  const json   = await res.json();
  if (json.success) renderStudents(json.data);
}

// Enroll student (from modal Save button)
async function enrollStudent(formData) {
  const res  = await fetch(`${API}/students`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(formData),
  });
  const json = await res.json();
  if (json.success) {
    showToast('✅ Student enrolled! ID: ' + json.studentId);
    loadStudents(); // Refresh table
  } else {
    showToast('❌ Error: ' + json.error);
  }
}

// Load dashboard KPIs
async function loadDashboard() {
  const res  = await fetch(`${API}/dashboard`);
  const json = await res.json();
  if (json.success) {
    const d = json.data;
    // Update stat card values:
    // d.students.total      → Total students
    // d.fees.collected      → Fees collected
    // d.attendance.today_pct → Attendance %
    // d.exams.avg_pct       → Avg exam score
  }
}

// Record fee payment
async function recordFee(data) {
  const res  = await fetch(`${API}/fees`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const json = await res.json();
  if (json.success) showToast('✅ Fee recorded! Receipt: ' + json.receiptNo);
}

// Bulk attendance
async function saveAttendance(className, date, records) {
  const res  = await fetch(`${API}/attendance/bulk`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ className, attDate: date, records }),
  });
  const json = await res.json();
  if (json.success) showToast(`✅ Saved attendance for ${json.saved} students`);
}

// On page load
loadDashboard();
loadStudents();
```

---

## 📊 Complete API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | DB connection check |
| GET | `/api/dashboard` | All KPI stats |
| GET | `/api/dashboard/cashflow?months=6` | Income vs expenses chart data |
| GET | `/api/dashboard/recent` | Recent activity feed |
| GET | `/api/students?class=10A&search=arjun` | List/filter students |
| POST | `/api/students` | Enroll new student |
| GET | `/api/students/:id` | Student detail |
| PUT | `/api/students/:id` | Update student |
| DELETE | `/api/students/:id` | Deactivate student |
| GET | `/api/fees?status=Pending` | List fees |
| GET | `/api/fees/summary` | Fee collection totals |
| GET | `/api/fees/student/:id` | One student's fee history |
| POST | `/api/fees` | Record payment |
| PUT | `/api/fees/:receiptNo` | Update fee record |
| GET | `/api/attendance?class=8A&date=2026-03-06` | Get attendance |
| GET | `/api/attendance/summary?month=2026-03` | Class-wise stats |
| POST | `/api/attendance` | Mark single student |
| POST | `/api/attendance/bulk` | Mark whole class |
| GET | `/api/exams` | List all exams |
| POST | `/api/exams` | Create exam |
| GET | `/api/exams/:id/marks?class=10A` | Get exam results |
| POST | `/api/exams/:id/marks` | Enter student marks |
| GET | `/api/exams/student/:id` | Full mark history |
| GET | `/api/teachers` | List teachers |
| POST | `/api/teachers` | Add teacher |
| PUT | `/api/teachers/:id` | Update teacher |
| DELETE | `/api/teachers/:id` | Deactivate |
| GET | `/api/salaries?month=2026-03` | List salary payments |
| GET | `/api/salaries/summary` | Payroll totals |
| POST | `/api/salaries` | Process salary |
| GET | `/api/promotions/eligible` | Eligibility check |
| POST | `/api/promotions/promote/:id` | Promote one student |
| POST | `/api/promotions/bulk` | Promote all eligible |

---

## ⚠️ Render Free Tier Note

Render's free tier **spins down** after 15 minutes of inactivity.
The first request after idle takes ~30 seconds to wake up.

**Fix:** Add this to your frontend HTML to keep it alive:
```javascript
// Ping API every 14 minutes to prevent sleep
setInterval(() => fetch('https://educore-api.onrender.com/health'), 14 * 60 * 1000);
```

Or upgrade to Render's $7/month plan to avoid sleep entirely.

---

## 🆓 Free Tier Limits Summary

| Service | Free Limit | Notes |
|---------|-----------|-------|
| **Supabase DB** | 500 MB storage, 50K rows | More than enough for a school |
| **Supabase** | 2 GB bandwidth/month | Generous |
| **Render** | 750 hrs/month compute | Enough for 1 service |
| **Netlify** | 100 GB bandwidth | Very generous |
| **Total cost** | **₹0 / month** | Forever free |
