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

const fs = require('fs');
const multer = require('multer');
const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.API_KEY,
  api_secret: process.env.API_SECRET,
  secure: true,
});

const upload = multer({ dest: 'uploads/' }); // temp storage before upload to Cloudinary

// Endpoint for uploading the file
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const file = req.file;

    // Upload the file to Cloudinary
    const result = await cloudinary.uploader.upload(file.path, {
      resource_type: 'auto', // Auto-detects the type of file (image, video, etc.)
      access_mode: 'public'
    });

    console.log("result", result);

    // Remove the file from the server after uploading to Cloudinary
    fs.unlinkSync(file.path);

    // Return the URL
    res.json({
      success: true,
      url: result.secure_url, // This is the file URL in Cloudinary
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'File upload failed' });
  }
});

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
