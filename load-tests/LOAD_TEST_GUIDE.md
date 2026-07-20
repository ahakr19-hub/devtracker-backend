# DevTrack — k6 Load Testing Guide
> **Target:** 1,000 Virtual Users (VUs) · Node.js/Express · MongoDB · JWT

---

## Table of Contents
1. [Quick Start](#1-quick-start)
2. [Pre-Flight Checklist](#2-pre-flight-checklist)
3. [OS-Level Tweaks](#3-os-level-tweaks)
4. [Backend (Node.js / Express) Optimizations](#4-backend-nodejs--express-optimizations)
5. [MongoDB Optimizations](#5-mongodb-optimizations)
6. [Understanding the Test Script](#6-understanding-the-test-script)
7. [Reading k6 Output](#7-reading-k6-output)
8. [Post-Test Cleanup](#8-post-test-cleanup)
9. [Common Failure Patterns & Fixes](#9-common-failure-patterns--fixes)

---

## 1. Quick Start

```bash
# Install k6 (Windows — via Chocolatey)
choco install k6

# Install k6 (Linux / WSL)
sudo apt install k6

# Run the test
k6 run load-tests/devtrack.load.test.js

# Run against a specific environment
k6 run -e BASE_URL=https://staging.devtrack.io load-tests/devtrack.load.test.js

# Run with JSON output (for dashboards / HTML reports)
k6 run --out json=load-tests/results.json load-tests/devtrack.load.test.js
```

---

## 2. Pre-Flight Checklist

Before running the test, verify each item below.

| # | Check | Why |
|---|-------|-----|
| ✅ | k6 is installed (`k6 version`) | — |
| ✅ | DevTrack API is running and reachable | Test will fail at setup() otherwise |
| ✅ | **5 dedicated load-test accounts exist** in MongoDB | Avoids hammering real users; enables token pool |
| ✅ | Test accounts have the correct email/password in the script | See `TEST_ACCOUNTS` array |
| ✅ | A valid `projectId` exists for the test accounts | `GET /api/projects` must return ≥ 1 project |
| ✅ | OS file descriptors are raised (see Section 3) | Without this, sockets exhaust at ~200 VUs |
| ✅ | Node.js is running in Cluster mode (see Section 4) | Single-threaded Node will bottleneck |
| ✅ | MongoDB `maxPoolSize` is configured (see Section 5) | Default pool of 5 is catastrophic at 1k VUs |

---

## 3. OS-Level Tweaks

At 1,000 VUs, k6 opens thousands of concurrent TCP sockets. Without raising OS limits, you will hit socket exhaustion errors (`EMFILE`, `ECONNRESET`) long before reaching peak VUs.

### 3a. Linux / WSL (most common k6 environment)

```bash
# --- Check current limits ---
ulimit -n          # open file descriptors (default is usually 1024)
ulimit -u          # max user processes

# --- Raise limits for the current shell session ---
ulimit -n 65535
ulimit -u 65535

# --- Make the change PERMANENT (add to /etc/security/limits.conf) ---
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# --- Also update the system-wide kernel parameter ---
sudo sysctl -w net.core.somaxconn=65535
sudo sysctl -w net.ipv4.tcp_tw_reuse=1        # Reuse TIME_WAIT sockets faster
sudo sysctl -w net.ipv4.ip_local_port_range="1024 65535"  # More ephemeral ports

# Apply sysctl changes permanently
echo "net.core.somaxconn=65535"              | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.tcp_tw_reuse=1"              | sudo tee -a /etc/sysctl.conf
echo "net.ipv4.ip_local_port_range=1024 65535" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### 3b. Windows (Native k6)

Windows manages sockets differently. The main lever is the **dynamic port range**:

```powershell
# View current ephemeral port range
netsh int ipv4 show dynamicport tcp

# Expand it to support ~64k concurrent connections
netsh int ipv4 set dynamicport tcp start=1025 num=64510
netsh int ipv6 set dynamicport tcp start=1025 num=64510

# Increase max TCP connections (HKLM registry — requires reboot)
# Sets TcpTimedWaitDelay to 30s (default 240s) to recycle ports faster
reg add HKLM\SYSTEM\CurrentControlSet\Services\Tcpip\Parameters /v TcpTimedWaitDelay /t REG_DWORD /d 30 /f
```

> **Recommendation:** Run k6 inside **WSL2** on Windows for full Linux kernel control over sockets. This is the most reliable approach for 1k+ VU tests on a Windows host.

### 3c. macOS

```bash
sudo sysctl -w kern.maxfiles=65536
sudo sysctl -w kern.maxfilesperproc=65536
ulimit -n 65536
```

---

## 4. Backend (Node.js / Express) Optimizations

### 4a. PM2 Cluster Mode — Use All CPU Cores

Node.js is single-threaded. A single process will become the bottleneck under 1,000 VUs. PM2 Cluster Mode spawns one worker per CPU core, all sharing the same port.

```javascript
// ecosystem.config.js (project root)
module.exports = {
  apps: [{
    name:      'devtrack-api',
    script:    'src/server.js',
    instances: 'max',          // spawn one instance per CPU core
    exec_mode: 'cluster',      // enable cluster mode
    watch:     false,
    env_production: {
      NODE_ENV: 'production',
      PORT:     3000,
    },
  }],
};
```

```bash
# Start in cluster mode
pm2 start ecosystem.config.js --env production

# Monitor across all cores in real time
pm2 monit
```

### 4b. Event Loop — Protect Against Blocking Code

Under high concurrency, any synchronous/blocking code will freeze ALL requests sharing a core.

```javascript
// ❌ DANGEROUS under high load — blocks the event loop
const hash = bcrypt.hashSync(password, 12);

// ✅ CORRECT — async, non-blocking
const hash = await bcrypt.hash(password, 12);
```

```javascript
// ❌ DANGEROUS — synchronous file read
const data = fs.readFileSync('./config.json');

// ✅ CORRECT
const data = await fs.promises.readFile('./config.json');
```

**Monitor Event Loop Lag in production:**
```javascript
// Add to your Express app startup
const { monitorEventLoopDelay } = require('perf_hooks');
const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setInterval(() => {
  const lagMs = histogram.mean / 1e6; // nanoseconds → milliseconds
  if (lagMs > 100) {
    console.warn(`[EventLoop] High lag detected: ${lagMs.toFixed(1)}ms`);
  }
}, 5000);
```

### 4c. HTTP Keep-Alive — Reduce TCP Handshake Overhead

```javascript
// src/server.js
const http = require('http');

const server = http.createServer(app);

// Keep sockets alive for 60 seconds — critical for high concurrency
server.keepAliveTimeout    = 60_000; // ms
server.headersTimeout      = 65_000; // must be > keepAliveTimeout

server.listen(process.env.PORT || 3000);
```

### 4d. Express Response Compression

```bash
npm install compression
```

```javascript
// src/app.js
const compression = require('compression');
app.use(compression({ threshold: 1024 })); // compress responses > 1KB
```

### 4e. JWT Verification — Cache the Secret

Avoid reading the JWT secret from `process.env` on every request. Read it once at startup:

```javascript
// src/config/jwt.config.js
const JWT_SECRET = process.env.JWT_SECRET; // read once at module load

if (!JWT_SECRET) throw new Error('JWT_SECRET is not defined');

module.exports = { JWT_SECRET };
```

---

## 5. MongoDB Optimizations

### 5a. Connection Pool Size — The #1 Bottleneck

The Mongoose default `maxPoolSize` is **5**. At 1,000 VUs, hundreds of concurrent requests will queue waiting for a free connection. **This is the most common failure mode.**

```javascript
// src/config/database.js
const mongoose = require('mongoose');

await mongoose.connect(process.env.MONGO_URI, {
  maxPoolSize:        100,  // ← Raise from default 5. Tune based on your MongoDB server RAM.
  minPoolSize:        10,   // Keep at least 10 connections warm (avoids cold-start latency)
  serverSelectionTimeoutMS: 5000,   // Fail fast if MongoDB is unreachable
  socketTimeoutMS:          45000,  // Close idle sockets after 45s
  connectTimeoutMS:         10000,  // Connection establishment timeout
  heartbeatFrequencyMS:     10000,  // How often the driver checks server health
});
```

> **Rule of thumb:** `maxPoolSize` = (number of CPU cores × 10). On a 4-core machine → 40. On an 8-core → 80. Never go above what your MongoDB server can handle.

### 5b. Critical Indexes — Without These, Every Query Is a Full Collection Scan

Run these in `mongosh` against your DevTrack database:

```javascript
// ---- developers (auth) collection ----
// Login query: db.developers.findOne({ email })
db.developers.createIndex({ email: 1 }, { unique: true, name: "idx_email_unique" });

// ---- projects collection ----
// GET /api/projects filters by owner OR team member
db.projects.createIndex({ owner: 1 },             { name: "idx_projects_owner" });
db.projects.createIndex({ "members.user": 1 },    { name: "idx_projects_members" });
db.projects.createIndex({ owner: 1, createdAt: -1 }, { name: "idx_projects_owner_date" });

// ---- tasks collection ----
// POST /api/tasks inserts; GET queries filter by project
db.tasks.createIndex({ project: 1 },              { name: "idx_tasks_project" });
db.tasks.createIndex({ assignee: 1 },             { name: "idx_tasks_assignee" });
db.tasks.createIndex({ project: 1, status: 1 },   { name: "idx_tasks_project_status" });
db.tasks.createIndex({ title: "text" },           { name: "idx_tasks_title_text" }); // if you use $text search

// Verify indexes were created
db.developers.getIndexes();
db.projects.getIndexes();
db.tasks.getIndexes();
```

### 5c. Use `.lean()` for Read-Only Queries

Mongoose `.lean()` returns plain JS objects instead of full Mongoose Documents. This is **3–5x faster** for read-heavy endpoints:

```javascript
// ❌ Returns full Mongoose Document with getters/setters/prototype methods
const projects = await Project.find({ owner: userId });

// ✅ Returns plain JS object — much faster, lower memory
const projects = await Project.find({ owner: userId }).lean();
```

### 5d. Selective Field Projection

Don't fetch the entire document if you only need a few fields:

```javascript
// ❌ Fetches ALL fields including potentially large embedded arrays
const projects = await Project.find({ owner: userId }).lean();

// ✅ Only fetch what the client needs
const projects = await Project
  .find({ owner: userId })
  .select('title description status createdAt')
  .lean();
```

### 5e. Pagination — Never Return Unbounded Lists

```javascript
// GET /api/projects — always paginate
const PAGE_SIZE = 20;
const page      = parseInt(req.query.page) || 1;

const projects = await Project
  .find({ owner: req.user.id })
  .select('title description status')
  .sort({ createdAt: -1 })
  .skip((page - 1) * PAGE_SIZE)
  .limit(PAGE_SIZE)
  .lean();
```

---

## 6. Understanding the Test Script

### Architecture Overview

```
setup() ──► Authenticates N test accounts ONCE
              │
              └──► Returns { tokens: [...] } to all VUs
                              │
              ┌───────────────┘
              │
VU 1 ──► default(data) ──► Round-robin pick token from pool
VU 2 ──► default(data) ──┘
...
VU 1000 ──► default(data)
              │
              ├──► GROUP: GET /api/projects    (read)
              │         └──► check() status 200
              │         └──► sleep(1-2s)        ← realistic pacing
              │
              └──► GROUP: POST /api/tasks      (write)
                        └──► check() status 201
                        └──► sleep(2-3s)        ← form submit pacing
              │
teardown() ──► Logs cleanup instructions
```

### Why Token Pool in `setup()` Is Critical

Without `setup()`, every VU iteration would call `/api/auth/login`. At 1,000 VUs running for 9 minutes:

```
~1,000 VUs × ~60 iterations = ~60,000 login requests
```

That's a **self-inflicted DDoS on your own auth endpoint** — bcrypt is intentionally slow and will immediately saturate your CPU. The token pool approach:

```
5 accounts × 1 login each = 5 total login requests (in setup)
```

### Stage-by-Stage Behaviour

| Stage | Duration | VUs | Purpose |
|-------|----------|-----|---------|
| 1 | 1 min | 0 → 200 | Warm up JIT, connections, caches |
| 2 | 2 min | 200 → 500 | Moderate load — establish baseline |
| 3 | 3 min | 500 → 1000 | Ramp to peak — find breaking point |
| 4 | 2 min | 1000 | Sustained peak — stress test stability |
| 5 | 1 min | 1000 → 0 | Graceful shutdown — check recovery |

---

## 7. Reading k6 Output

A successful run looks like this:

```
✓ projects: status is 200
✓ tasks: status is 201

checks.........................: 99.20% ✓ 52847  ✗ 423
data_received..................: 1.2 GB  2.2 MB/s
data_sent......................: 180 MB  327 kB/s
duration_login.................: avg=412ms  p(95)=980ms   ✓
duration_projects..............: avg=87ms   p(95)=620ms   ✓
duration_tasks.................: avg=203ms  p(95)=890ms   ✓
http_error_rate................: 0.79%  ✓
http_req_duration..............: avg=145ms  p(95)=780ms   ✓
http_reqs......................: 53270  96.85/s
tasks_created_total............: 21308
vus............................: 1000   min=0  max=1000
```

### Key Metrics to Watch

| Metric | What it means | Fail signal |
|--------|--------------|-------------|
| `p(95)` of `http_req_duration` | 95th percentile latency | `> 1000ms` |
| `http_error_rate` | % of failed requests | `> 2%` |
| `checks` | % of `check()` assertions passing | `< 98%` |
| `http_req_blocked` | Time waiting for a free socket | `> 100ms avg` = OS limit hit |
| `http_req_connecting` | TCP handshake time | High = keep-alive not working |

---

## 8. Post-Test Cleanup

The test creates tasks prefixed with `[LoadTest]`. Clean them up after each run:

```javascript
// Run in mongosh
db.tasks.deleteMany({ title: /^\[LoadTest\]/ });
```

Or use the dedicated cleanup script:

```bash
node load-tests/cleanup.js
```

---

## 9. Common Failure Patterns & Fixes

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| `EMFILE: too many open files` at ~200 VUs | OS file descriptor limit | Raise `ulimit -n 65535` |
| `connection refused` bursts | Node.js process overloaded | Switch to PM2 Cluster mode |
| `p(95) > 5000ms` on projects | Missing MongoDB index | Add `{ owner: 1 }` index |
| `status 429` on all requests | Rate limiter triggered | Whitelist load-test IP or raise limit |
| `setup()` fails — 401 on login | Wrong credentials in script | Check `TEST_ACCOUNTS` array |
| `http_req_blocked avg > 500ms` | Ephemeral port exhaustion | Apply `tcp_tw_reuse` sysctl settings |
| Memory leak in Node process | Unresolved Promises / closures | Use `pm2 monit` to watch heap |
| MongoDB `MongoTimeoutError` | `maxPoolSize` too low | Raise to 80–100 in Mongoose config |

---

*Generated for DevTrack · k6 v0.52+ · July 2026*
