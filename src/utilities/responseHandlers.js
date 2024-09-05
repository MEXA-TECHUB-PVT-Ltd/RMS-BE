const { statusCodeMap } = require("./statusCodes");

const responseSender = (res, status, success, message, data = null) => {
  const responseData = {
    status: status,
    success: success,
    code: statusCodeMap[status] || "UNKNOWN_STATUS",
    message: message,
  };

  if (data !== null) {
    responseData.result = data;
  }

  return res.status(status).json(responseData);
};

module.exports = { responseSender };
