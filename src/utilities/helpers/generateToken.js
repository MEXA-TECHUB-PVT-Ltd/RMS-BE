const jwt = require("jsonwebtoken");

const generateToken = async (payload, secret, expireIn) => {
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      secret,
      {
        expiresIn: expireIn,
      },
      (error, token) => {
        if (error) {
          console.log(error);
          reject(error);
        } else {
          resolve(token);
        }
      }
    );
  });
};

module.exports = generateToken;
