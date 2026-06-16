const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const helmet = require("helmet");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const dbConnection = require("./config/db");
const regRouter = require("./modules/auth/routes/auth.routes");
const errorMiddleware = require("./middlewares/error.middleware");
const { projectRouter } = require("./modules/auth/routes/project.routes");
const taskRouter = require("./modules/auth/routes/task.routes");
const TaskActivity = require("./modules/auth/routes/taskActivity.routes");
const { developerRouter } = require("./modules/auth/routes/developer.routes");
const { invitaionsRouter } = require("./modules/auth/routes/invitations.routes");
const subscriptionRouter = require("./modules/subscriptions/routes/subscription.routes");
const feedbackRouter = require("./modules/feedbacks/routers/feedback.routes");
const githubRouter = require("./modules/github/routes/github.routes");
const { onboardingRouter } = require("./modules/onboarding/onboarding.routes");
require('./utils/taskQueue');

const app = express();
const port = process.env.PORT || 3000;

const ALLOWED_ORIGINS = [
  "http://localhost:4200",
  "https://extraordinary-tartufo-5bfdd1.netlify.app",
  "https://dev-tracker-production-3ef3.up.railway.app",
];

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// ✅ Middleware واحد بس — بيدي الـ webhook raw body والباقي json
app.use((req, res, next) => {
  if (req.originalUrl.includes('/webhooks/')) {
    express.raw({ type: 'application/json' })(req, res, next);
  } else {
    express.json({ limit: "10kb" })(req, res, next);
  }
});

global.io = io;

io.use((socket, next) => {
  const token = socket.handshake.auth.token;

  if (!token) {
    return next(new Error("Authentication error: No token provided"));
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "your_jwt_secret_here");
    socket.userId = decoded.id || decoded._id;
    next();
  } catch (err) {
    return next(new Error("Authentication error: Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(`User connected securely: ${socket.userId}`);
  socket.join(socket.userId.toString());
  console.log(`User ${socket.userId} joined their private room`);

  socket.on("disconnect", () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.) or matching allowed list
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: origin '${origin}' not allowed`));
    }
  },
  credentials: true
}));

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  })
);

app.get("/", (req, res) => {
  res.json({ message: "Hello from secure socket server" });
});

app.use('/auth', regRouter);
app.use('/developer', projectRouter);
app.use('/project', taskRouter);
app.use('/activityproject', TaskActivity);
app.use('/developerSettings', developerRouter);
app.use('/invitations', invitaionsRouter);
app.use('/subscribe', subscriptionRouter);
app.use('/feedbacks', feedbackRouter);

// ── Agent 3: GitHub Integration Routes ──────────────────────────────────────────
// POST /github/link           → link GitHub account + activate 30-day trial (protect only)
// GET  /github/trial-status   → UI banner data (protect only)
// GET  /github/repos          → list repos (protect + requireProAccess)
// POST /github/select-repos   → persist repo selection (protect + requireProAccess)
app.use('/github', githubRouter);
app.use('/onboarding', onboardingRouter);

app.use(errorMiddleware);

server.listen(port, () => {
  console.log(`Server running on port ${port} with SECURE Socket.io support`);
  console.log(`Allowed CORS origins: ${ALLOWED_ORIGINS.join(", ")}`);
});

dbConnection();