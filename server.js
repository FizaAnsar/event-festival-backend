require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const seedDummyAdmin = require('./seed_script/seedAdmin');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
app.use(express.static('public'));
app.get("/", (req, res) => {
  res.send("Node + ngrok is working! 🎉");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    credentials: true
  }
});

// ======================
// ENHANCED CORS CONFIGURATION
// ======================
const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition']
};

app.use(cors(corsOptions));

// ======================
// SECURITY MIDDLEWARE
// ======================
app.use(helmet({
  crossOriginResourcePolicy: false // Disable the default same-origin policy
}));

// ======================
// STATIC FILE SERVING WITH CORS
// ======================
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
  setHeaders: (res, path) => {
    res.set("Access-Control-Allow-Origin", process.env.FRONTEND_URL);
    res.set("Access-Control-Expose-Headers", "Content-Disposition");
    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    
    // Cache control for production
    if (process.env.NODE_ENV === 'production') {
      res.set('Cache-Control', 'public, max-age=31536000');
    }
  }
}));

// ======================
// RATE LIMITING
// ======================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

// ======================
// DATABASE CONNECTION
// ======================
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 5000
})
.then(async () => {
  console.log('✅ MongoDB connected');
  await seedDummyAdmin();
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

// ======================
// APPLICATION MIDDLEWARE
// ======================
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// ======================
// ROUTES
// ======================
const routes = [
  require('./apis/admin_api'),
  // require('./apis/menu_item_api'),
  // require('./apis/review_api'),
  // require('./apis/transaction_api'),
  // require('./apis/user_api')(io),
  require('./apis/dashboard_api')(io),
  require('./apis/user_auth_api')(io),
  require('./apis/vendor_api')(io), 
  require('./apis/sales_api')(io), 
  require('./apis/festival_api')(io),
  require('./apis/booth_api')(io),
  require('./apis/vendor_performance_api')(io),
  require('./apis/notification_api')(io),
  require('./apis/booth-assignment_api')(io),
  require('./apis/event_api')(io),
  require('./apis/user_ticket_api')(io),
  require('./apis/menu_item_api')(io),
  require('./apis/review_api')(io),
  require('./apis/festival_review_api')(io),
];

routes.forEach(route => app.use('/api', route));

// ======================
// WEBSOCKET CONNECTION
// ======================
io.on("connection", (socket) => {
  console.log(`⚡ A user connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
  });
});

// ======================
// ERROR HANDLING MIDDLEWARE
// ======================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// ======================
// PRODUCTION SECURITY
// ======================
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ======================
// SERVER INIT
// ======================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🛡️  Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL}`);
});