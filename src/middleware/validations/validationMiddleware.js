const { responseSender } = require("../../utilities/responseHandlers");

// body validator
const validateBody = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.body);

  if (error) {
    return responseSender(res, 422, false, error.details[0].message, null, req);
  }
  next();
};

// params validator
const ValidateParams = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.params);
  if (error) {
    return responseSender(res, 422, false, error.details[0].message, null, req);
  }
  next();
};

// query validator
const validateQuery = (schema) => (req, res, next) => {
  const { error } = schema.validate(req.query);
  if (error) {
    return responseSender(res, 422, false, error.details[0].message, null, req);
  }
  next();
};

module.exports = {
  validateBody,
  ValidateParams,
  validateQuery,
};
