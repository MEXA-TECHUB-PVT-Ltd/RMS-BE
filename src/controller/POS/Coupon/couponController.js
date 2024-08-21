const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");

const createCoupon = async (req, res, next) => {
  const { code, percentage } = req.body;

  try {
    const { rowCount: checkCode } = await pool.query(
      `SELECT * FROM coupon WHERE LOWER(code) = LOWER($1) LIMIT 1`,
      [code]
    );

    if (checkCode > 0) {
      return responseSender(
        res,
        409,
        false,
        "Coupon with this code already exists"
      );
    }

    const { rowCount, rows } = await pool.query(
      `INSERT INTO coupon (code, percentage) VALUES ($1, $2) RETURNING *`,
      [code, percentage]
    );

    if (rowCount === 0) {
      return responseSender(res, 400, false, "Coupon Not Created");
    }

    return responseSender(res, 201, true, "Coupon Created", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getCoupon = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM coupon WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Coupon Not Found");
    }

    return responseSender(res, 200, true, "Coupon Retrieved", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getAllCoupons = async (req, res, next) => {
  try {
    const { rows, rowCount } = await pool.query(`SELECT * FROM coupon`);

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Coupon Not Found");
    }

    return responseSender(res, 200, true, "Coupons Retrieved", rows);
  } catch (error) {
    next(error);
  }
};

const updateCoupon = async (req, res, next) => {
  const { code, status, percentage } = req.body;
  const { id } = req.params;

  try {
    let query = `UPDATE coupon SET `;
    let index = 1;
    let values = [];

    if (code) {
      query += `code = $${index}, `;
      values.push(code);
      index++;
    }

    if (status) {
      query += `status = $${index}, `;
      values.push(status.toUpperCase());
      index++;
    }

    if (percentage) {
      query += `percentage = $${index}, `;
      values.push(percentage);
      index++;
    }

    query = query.replace(/,\s*$/, "");

    query += ` WHERE id = $${index} RETURNING *`;
    values.push(id);

    const { rows, rowCount } = await pool.query(query, values);

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Coupon Not Found");
    }

    return responseSender(res, 200, true, "Coupon Updated", rows[0]);
  } catch (error) {
    next(error);
  }
};

const deleteCoupon = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rowCount } = await pool.query(`DELETE FROM coupon WHERE id = $1`, [
      id,
    ]);

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Coupon Not Found");
    }

    return responseSender(res, 200, true, "Coupon Deleted");
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCoupon,
  getCoupon,
  getAllCoupons,
  updateCoupon,
  deleteCoupon,
};
