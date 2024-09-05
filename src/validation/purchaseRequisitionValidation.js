const Joi = require("joi");

const purchaseRequisitionShema = {
  createPurchaseRequisition: Joi.object({
    pr_number: Joi.string().required(),
    status: Joi.string()
      .valid("ACCEPTED", "REJECTED", "DRAFT", "PENDING")
      .required(),
    pr_detail: Joi.string().optional(),
    priority: Joi.string().valid("HIGH", "MEDIUM", "LOW").required(),
    requested_by: Joi.string().required(),
    requested_date: Joi.date().required(),
    required_date: Joi.date().required(),
    shipment_preferences: Joi.string().optional(),
    delivery_address: Joi.string().required(),
    items: Joi.string().required(),
    total_amount: Joi.number().required(),
    document: Joi.string().optional(),
  }),
};

module.exports = purchaseRequisitionShema;
