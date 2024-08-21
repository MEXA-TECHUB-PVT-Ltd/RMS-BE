const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");

const createPaymentTerm = async (req, res, next) => {
  const { payment_term_name } = req.body;

  if (!payment_term_name) {
    return responseSender(res, 422, false, "Payment Term is required");
  }

  try {
    const { rows, rowCount } = await pool.query(
      `INSERT INTO payment_term (payment_term_name) VALUES ($1) RETURNING *`,
      [payment_term_name]
    );

    if (rowCount === 0) {
      return responseSender(res, 400, false, "Payment Term Not Added");
    }

    return responseSender(res, 201, true, "Payment Term Added", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getAllPaymentTerms = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM payment_term`);

    return responseSender(res, 200, true, "Payment Terms Retrieved", rows);
  } catch (error) {
    next(error);
  }
};

const getPaymentTerm = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM payment_term WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Payment Term Not Found");
    }

    return responseSender(res, 200, true, "Payment Term Retrieved", rows[0]);
  } catch (error) {
    next(error);
  }
};

const updatePaymentTerm = async (req, res, next) => {
  const { id } = req.params;
  const { payment_term_name } = req.body;

  if (!payment_term_name) {
    return responseSender(res, 422, false, "payment_term_name is required");
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE payment_term SET payment_term_name = $1 WHERE id = $2 RETURNING *`,
      [payment_term_name, id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Payment Term Not Found");
    }

    return responseSender(res, 200, true, "Payment Term Updated", rows[0]);
  } catch (error) {
    next(error);
  }
};

const deletePaymentTerm = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM payment_term WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 400, false, "Payment Term Not Found");
    }

    return responseSender(res, 200, true, "Payment Term Deleted");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPaymentTerm,
  getAllPaymentTerms,
  getPaymentTerm,
  updatePaymentTerm,
  deletePaymentTerm,
};
