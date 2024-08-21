const Joi = require("joi");

const commentSchema = {
  createComment: Joi.object({
    user_id: Joi.string().guid({ version: "uuidv4" }).required().messages({
      "any.required": "User id is required",
      "string.guid": "User id  must be a valid UUID",
    }),
    pr_id: Joi.string().guid({ version: "uuidv4" }).required().messages({
      "any.required": "PR id is required",
      "string.guid": "PR id  must be a valid UUID",
    }),
    comment: Joi.string().required(),
  }),
};

module.exports = commentSchema;
