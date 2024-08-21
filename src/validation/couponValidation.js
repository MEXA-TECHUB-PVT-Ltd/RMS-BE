const Joi = require("joi");

const couponSchema = {
  createCoupon: Joi.object({
    code: Joi.string().required(),
    percentage: Joi.number().required(),
  }),
};

module.exports = couponSchema;
