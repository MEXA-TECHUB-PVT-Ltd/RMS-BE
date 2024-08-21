const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");

// Create Currency
const createCurrency = async (req, res, next) => {
  const { currency } = req.body;

  if (!currency) {
    return responseSender(res, 422, false, "currency is required");
  }

  try {
    const { rows, rowCount } = await pool.query(
      `INSERT INTO currency (ccy) VALUES ($1) RETURNING *`,
      [currency.toUpperCase()]
    );

    if (rowCount === 0) {
      return responseSender(res, 400, false, "Currency Not Added");
    }

    return responseSender(res, 201, true, "Currency Added", rows[0]);
  } catch (error) {
    next(error);
  }
};

// Get All Currencies
const getAllCurrencies = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT * FROM currency`);

    return responseSender(res, 200, true, "Currencies Retrieved", rows);
  } catch (error) {
    next(error);
  }
};

// Get Single Currency by ID
const getCurrency = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM currency WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Currency Not Found");
    }

    return responseSender(res, 200, true, "Currency Retrieved", rows[0]);
  } catch (error) {
    next(error);
  }
};

// Update Currency
const updateCurrency = async (req, res, next) => {
  const { id } = req.params;
  const { currency } = req.body;

  if (!currency) {
    return responseSender(res, 422, false, "currency is required");
  }

  try {
    const { rows, rowCount } = await pool.query(
      `UPDATE currency SET ccy = $1 WHERE id = $2 RETURNING *`,
      [currency.toUpperCase(), id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Currency Not Found");
    }

    return responseSender(res, 200, true, "Currency Updated", rows[0]);
  } catch (error) {
    next(error);
  }
};

// Delete Currency
const deleteCurrency = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(
      `DELETE FROM currency WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Currency Not Found");
    }

    return responseSender(res, 200, true, "Currency Deleted");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCurrency,
  getAllCurrencies,
  getCurrency,
  updateCurrency,
  deleteCurrency,
};
