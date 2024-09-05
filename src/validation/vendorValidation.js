const Joi = require("joi");

const vendorSchema = {
  createVendor: Joi.object({
    v_type: Joi.string().valid("SUPPLIER", "STORE").required().messages({
      "any.only": "v_type must be one of SUPPLIER or STORE",
      "any.required": "v_type is required",
    }),
    provider_type: Joi.string()
      .valid("SERVICE", "PRODUCTS")
      .required()
      .messages({
        "any.only": "provider_type must be one of SERVICE or PRODUCTS",
        "any.required": "provider_type is required",
      }),
    first_name: Joi.string()
      .when("v_type", {
        is: "STORE",
        then: Joi.string().allow(null, ""),
        otherwise: Joi.string().required(),
      })
      .messages({
        "any.required": "first_name is required for SUPPLIER type",
      }),
    last_name: Joi.string()
      .when("v_type", {
        is: "STORE",
        then: Joi.string().allow(null, ""),
        otherwise: Joi.string().required(),
      })
      .messages({
        "any.required": "last_name is required for SUPPLIER type",
      }),
    company_name: Joi.string().allow(null, ""),
    vendor_display_name: Joi.string().required().messages({
      "any.required": "vendor_display_name is required",
    }),
    email: Joi.string().email().required().messages({
      "any.required": "email is required",
      "string.email": "email must be a valid email address",
    }),
    phone_no: Joi.string().required().messages({
      "any.required": "phone_no is required",
    }),
    work_no: Joi.string().allow(null, ""),
    country: Joi.string().allow(null, ""),
    address: Joi.string().required().messages({
      "any.required": "address is required",
    }),
    city: Joi.string().allow(null, ""),
    state: Joi.string().allow(null, ""),
    zip_code: Joi.string().allow(null, ""),
    fax_number: Joi.string().allow(null, ""),
    shipping_address: Joi.string().allow(null, ""),
    currency_id: Joi.string().guid({ version: "uuidv4" }).required().messages({
      "any.required": "currency_id is required",
      "string.guid": "currency_id must be a valid UUID",
    }),
    payment_term_id: Joi.string()
      .guid({ version: "uuidv4" })
      .required()
      .messages({
        "any.required": "payment_term_id is required",
        "string.guid": "payment_term_id must be a valid UUID",
      }),
    contact_person: Joi.string().allow(null, ""),
    document: Joi.object().allow(null, ""),
    cnic_front_img: Joi.object().allow(null, ""),
    cnic_back_img: Joi.object().allow(null, ""),
  }),
};

module.exports = vendorSchema;
