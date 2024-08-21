const bcrypt = require("bcrypt");

const comparePassword = async (plainPassword, hashedPassword) => {
  try {
    const passwordMatch = await bcrypt.compare(plainPassword, hashedPassword);
    return passwordMatch;
  } catch (error) {
    console.log("Error comparing passwords:", error);
    return false;
  }
};

module.exports = comparePassword;
