const rateLimit = require("express-rate-limit");

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
  trustProxy: true,
});

module.exports = limiter;
