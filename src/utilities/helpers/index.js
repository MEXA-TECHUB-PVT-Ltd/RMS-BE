// index.js
const comparePassword = require("./comparePassword");
const generatePasswordHash = require("./generateHashedPassword");
const generateToken = require("./generateToken");

module.exports = {
  comparePassword,
  generatePasswordHash,
  generateToken,
};
