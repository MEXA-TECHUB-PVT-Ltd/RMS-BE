const jwt = require("jsonwebtoken");

const { responseSender } = require("../../utilities/responseHandlers.js");

const isLoggedIn = async (req, res, next) => {
  const { authorization } = req.headers;

  if (!authorization) {
    return responseSender(res, 401, false, "Unauthorized user.", null, req);
  }

  try {
    const token = authorization.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return responseSender(res, 401, false, "Unauthorized user.", null, req);
      }
      req.user = user;
      next();
    });
  } catch (error) {
    console.log("Error:", error);
    next(error);
  }
};

module.exports = { isLoggedIn };
