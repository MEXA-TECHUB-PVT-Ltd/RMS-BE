const bcrypt = require("bcrypt");


const generatePasswordHash = async (password, saltRounds = 12) => {
  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(saltRounds);

    // Hash the password using the generated salt
    const hashedPassword = await bcrypt.hash(password, salt);

    return hashedPassword;
  } catch (error) {
    console.log("Error generating password hash:", error);
    throw error;
  }
};

module.exports = generatePasswordHash
