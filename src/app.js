const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");

// other imports
const router = require("./routes/index.js");
// const limiter = require("./middleware/limiter.js");

// create express app
const app = express();

// middlewares
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev")); // For consoling API request and other info
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(cookieParser());
app.use(compression());
app.use(cors());
// app.use(limiter);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
    },
  })
);

// Routes
app.use("/api/v1", router);

// Error handling
app.use((req, res, next) => {
  const notFoundError = {
    status: 404,
    code: "ROUTE_NOT_FOUND",
    success: false,
    message: "This route does not exist.",
  };
  next(notFoundError);
});

app.use(async (err, req, res, next) => {
  const status = err.status || 500;

  res.status(status).json({
    error: {
      status: status,
      code: err.code || "INTERNAL_SERVER_ERROR",
      success: false,
      message: err.message || "Internal Server Error",
    },
  });
});

module.exports = app;
