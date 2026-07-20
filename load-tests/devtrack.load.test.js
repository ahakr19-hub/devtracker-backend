/**
 * ============================================================
 *  DevTrack — k6 Load Test Script  (Cookie-Auth Edition)
 *  Target:  1,000 Virtual Users (VUs)
 *  Stack:   Node.js / Express / MongoDB / HTTP-only Cookie JWT
 * ============================================================
 *
 *  IMPORTANT — Auth Architecture:
 *  DevTrack uses HTTP-only cookie-based JWT authentication.
 *  The `token` cookie is SET by the server at login and must be
 *  forwarded on every subsequent request via the Cookie header.
 *  The token is NEVER exposed in the response body.
 *
 *  Verified Real Routes (from app.js):
 *    POST  /auth/dev/login/logindevs           → Login
 *    GET   /developer/dev/projectdev/projects  → Get projects (read-heavy)
 *    POST  /project/dev/tasks/createtask/:id   → Create task  (write-heavy)
 *
 *  Run Command:
 *    k6 run load-tests/devtrack.load.test.js
 *
 *  With JSON output (for reports):
 *    k6 run --out json=load-tests/results.json load-tests/devtrack.load.test.js
 *
 *  Target a different environment:
 *    k6 run -e BASE_URL=https://api.devtrack.io load-tests/devtrack.load.test.js
 * ============================================================
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Helper for human pacing without external dependencies
function randomIntBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// ============================================================
// SECTION 1: Configuration
// ============================================================

// Base URL — override with: k6 run -e BASE_URL=https://... devtrack.load.test.js
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';

// Dedicated load-test accounts (seeded by seed-load-test-accounts.js)
// These match exactly what was inserted into MongoDB.
const TEST_ACCOUNTS = new SharedArray('test-accounts', function () {
  return [
    { email: 'loadtest1@devtrack.io', password: 'LoadTest@123' },
    { email: 'loadtest2@devtrack.io', password: 'LoadTest@123' },
    { email: 'loadtest3@devtrack.io', password: 'LoadTest@123' },
    { email: 'loadtest4@devtrack.io', password: 'LoadTest@123' },
    { email: 'loadtest5@devtrack.io', password: 'LoadTest@123' },
  ];
});

// Realistic task titles for the write-heavy endpoint
const TASK_TITLES = new SharedArray('task-titles', function () {
  return [
    'Implement JWT refresh token rotation',
    'Refactor MongoDB aggregation pipeline',
    'Add WebSocket real-time notifications',
    'Fix race condition in task assignment',
    'Write unit tests for auth service',
    'Optimize project list query with indexes',
    'Set up CI/CD pipeline for staging',
    'Design API rate limiting middleware',
    'Document Teams API endpoints',
    'Audit RBAC permission matrix',
    'Migrate legacy REST endpoints to GraphQL',
    'Add Stripe webhook signature verification',
    'Build GitHub OAuth account merging logic',
    'Profile and optimize event loop latency',
    'Implement Redis-backed session caching',
  ];
});

// ============================================================
// SECTION 2: Custom Metrics
// ============================================================

const errorRate        = new Rate('http_error_rate');
const loginDuration    = new Trend('duration_login',    true);
const projectsDuration = new Trend('duration_projects', true);
const tasksDuration    = new Trend('duration_tasks',    true);
const tasksCreated     = new Counter('tasks_created_total');

// ============================================================
// SECTION 3: Load Profile & Thresholds
// ============================================================

export const options = {
  stages: [
    { duration: '1m',  target: 200  }, // Warm-up:         0 → 200 VUs
    { duration: '2m',  target: 500  }, // Ramp-up:       200 → 500 VUs
    { duration: '3m',  target: 1000 }, // Peak approach: 500 → 1000 VUs
    { duration: '2m',  target: 1000 }, // Sustained load at 1000 VUs
    { duration: '1m',  target: 0    }, // Ramp-down:    1000 → 0 VUs
  ],
  setupTimeout: '5m', // Allow up to 5 minutes for authenticating and fetching project IDs

  thresholds: {
    'http_req_duration': ['p(95)<1000'],  // Global: 95% of all requests < 1s
    'duration_login':    ['p(95)<1500'],  // Login has bcrypt overhead → 1.5s budget
    'duration_projects': ['p(95)<800'],   // Read + index = should be fast
    'duration_tasks':    ['p(95)<1200'],  // Write + DB insert → slightly more
    'http_error_rate':   ['rate<0.02'],   // Less than 2% errors
    'checks':            ['rate>0.98'],   // 98%+ of assertions must pass
  },
};

// ============================================================
// SECTION 4: setup() — Runs ONCE before VU iterations begin
//
// COOKIE-AUTH STRATEGY:
// Because DevTrack uses HTTP-only cookies, we cannot simply read
// the token from the response body. Instead we:
//   1. POST to the login endpoint for each test account.
//   2. Extract the raw `Set-Cookie` header from the response.
//   3. Parse out just the `token=<value>` portion.
//   4. Return an array of { cookie, projectId } session objects.
//
// VUs receive this array and pick a session by round-robin.
// Each request manually sets the `Cookie` header — this works
// because k6 is not a browser and can set any header freely.
// ============================================================

export function setup() {
  console.log(`[setup] Starting — authenticating ${TEST_ACCOUNTS.length} accounts...`);

  const sessions = [];

  for (let i = 0; i < TEST_ACCOUNTS.length; i++) {
    const account = TEST_ACCOUNTS[i];

    // ── Step A: Login ────────────────────────────────────────
    const loginRes = http.post(
      `${BASE_URL}/auth/dev/login/logindevs`,
      JSON.stringify({ email: account.email, password: account.password }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags:    { endpoint: 'auth_setup' },
        // Disable k6's automatic redirect following so we keep the Set-Cookie header
        redirects: 0,
      }
    );

    loginDuration.add(loginRes.timings.duration);

    if (loginRes.status !== 200) {
      console.error(
        `[setup] Login FAILED for ${account.email}: ` +
        `HTTP ${loginRes.status} — ${loginRes.body}`
      );
      continue;
    }

    // ── Step B: Extract the session cookie ───────────────────
    // The server sends: Set-Cookie: token=<jwt>; Path=/; HttpOnly; ...
    // We grab the raw header value and strip to just: "token=<jwt>"
    const rawSetCookie = loginRes.headers['Set-Cookie'] || loginRes.headers['set-cookie'];

    if (!rawSetCookie) {
      console.error(`[setup] No Set-Cookie header for ${account.email} — skipping`);
      continue;
    }

    // Handle both string and array (some k6 versions return array for multi-cookie)
    const cookieStr = Array.isArray(rawSetCookie) ? rawSetCookie[0] : rawSetCookie;
    // Extract "token=<value>" — everything before the first ";"
    const tokenCookie = cookieStr.split(';')[0].trim(); // e.g. "token=eyJhbGci..."

    if (!tokenCookie.startsWith('token=')) {
      console.error(`[setup] Cookie parse failed for ${account.email}: ${cookieStr}`);
      continue;
    }

    // ── Step C: Fetch a projectId for this account ───────────
    // Task creation requires a projectId — we grab the first available project.
    const projectsRes = http.get(
      `${BASE_URL}/developer/dev/projectdev/projects`,
      {
        headers: { 'Cookie': tokenCookie },
        tags:    { endpoint: 'setup_projects' },
      }
    );

    let projectId = null;
    if (projectsRes.status === 200) {
      try {
        const body = JSON.parse(projectsRes.body);
        // Try common response shapes: body.data[], body.projects[], body[]
        const list = body.Projects || body.projects || body.data || body;
        if (Array.isArray(list) && list.length > 0) {
          projectId = list[0]._id || list[0].id;
        }
      } catch (e) {
        console.warn(`[setup] Could not parse projects for ${account.email}`);
      }
    }

    if (!projectId) {
      console.warn(
        `[setup] No project found for ${account.email}. ` +
        'Task creation will be skipped for this session. ' +
        'Create at least 1 project manually via the DevTrack UI.'
      );
    }

    sessions.push({ cookie: tokenCookie, projectId, email: account.email });
    console.log(
      `[setup] ✓ Session ${i + 1}: ${account.email} | projectId: ${projectId || 'NONE'}`
    );
  }

  if (sessions.length === 0) {
    throw new Error('[setup] No sessions acquired — is the API server running?');
  }

  console.log(`[setup] ✅ ${sessions.length} sessions ready. Starting VU ramp...\n`);
  return { sessions };
}

// ============================================================
// SECTION 5: Default VU Function
//
// Each VU picks a session by round-robin (__VU is 1-based).
// Both endpoints use the captured cookie in the Cookie header.
// ============================================================

export default function (data) {
  if (!data || !data.sessions || data.sessions.length === 0) {
    console.warn('[VU] No sessions available — skipping iteration');
    sleep(1);
    return;
  }

  // Round-robin: distribute VUs evenly across the session pool
  const session = data.sessions[(__VU - 1) % data.sessions.length];
  const { cookie, projectId } = session;

  // Shared header: Cookie header carries the HTTP-only token
  const cookieHeader = { 'Cookie': cookie };

  // ── Scenario A: Read Projects (~60% of real-world traffic) ──
  group('GET /developer/dev/projectdev/projects', function () {
    const res = http.get(
      `${BASE_URL}/developer/dev/projectdev/projects`,
      {
        headers: cookieHeader,
        tags:    { endpoint: 'get_projects' },
      }
    );

    projectsDuration.add(res.timings.duration);

    const passed = check(res, {
      'projects: status 200':           (r) => r.status === 200,
      'projects: response is JSON':     (r) => (r.headers['Content-Type'] || '').includes('application/json'),
      'projects: body not empty':       (r) => r.body && r.body.length > 2,
    });

    errorRate.add(!passed);

    // Human pacing: 1–2 seconds after reading a list
    sleep(randomIntBetween(1, 2));
  });

  // ── Scenario B: Create Task (~40% of real-world traffic) ────
  // Only runs when this session has a known projectId
  if (projectId) {
    group('POST /project/dev/tasks/createtask/:id', function () {
      const taskTitle      = TASK_TITLES[randomIntBetween(0, TASK_TITLES.length - 1)];
      const estimatedHours = randomIntBetween(1, 8);

      const payload = JSON.stringify({
        title:          `[LoadTest] ${taskTitle}`,
        estimatedHours: estimatedHours,
      });

      const res = http.post(
        `${BASE_URL}/project/dev/tasks/createtask/${projectId}`,
        payload,
        {
          headers: {
            ...cookieHeader,
            'Content-Type': 'application/json',
          },
          tags: { endpoint: 'create_task' },
        }
      );

      tasksDuration.add(res.timings.duration);

      const passed = check(res, {
        'tasks: status 201':      (r) => r.status === 201,
        'tasks: has id in body':  (r) => {
          try {
            const body = JSON.parse(r.body);
            const task = body.data || body.task || body;
            return !!(task._id || task.id);
          } catch { return false; }
        },
      });

      errorRate.add(!passed);

      if (passed) {
        tasksCreated.add(1);
      }

      // Human pacing: slightly longer after a write action
      sleep(randomIntBetween(2, 3));
    });
  } else {
    // If no projectId, do a second projects read instead (still generates realistic load)
    sleep(randomIntBetween(2, 3));
  }
}

// ============================================================
// SECTION 6: teardown() — Cleanup instructions
// ============================================================

export function teardown(data) {
  const sessionCount = data?.sessions?.length ?? 0;
  console.log(`\n[teardown] ✅ Load test complete.`);
  console.log(`[teardown] Sessions used: ${sessionCount}`);
  console.log(`[teardown] To clean up synthetic tasks, run:`);
  console.log(`           node load-tests/cleanup.js`);
  console.log(`           OR in mongosh:`);
  console.log(`           db.tasks.deleteMany({ title: /^\\[LoadTest\\]/ })`);
}
