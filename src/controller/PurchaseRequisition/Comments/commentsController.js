const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");

const createComment = async (req, res, next) => {
  const { user_id, pr_id, comment } = req.body;

  try {
    await pool.query("BEGIN");

    const { rows, rowCount } = await pool.query(
      `INSERT INTO pr_comments (user_id, pr_id, comment) VALUES ($1, $2, $3) RETURNING *`,
      [user_id, pr_id, comment]
    );

    if (rowCount === 0) {
      await pool.query("ROLLBACK");
      return responseSender(res, 400, false, "Comment Not Added");
    }

    await pool.query("COMMIT");

    return responseSender(res, 201, true, "Comment Added", rows[0]);
  } catch (error) {
    await pool.query("ROLLBACK");
    next(error);
  }
};

const updateComment = async (req, res, next) => {
  const { comment_id, comment } = req.body;

  try {
    await pool.query("BEGIN");

    const { rowCount, rows } = await pool.query(
      `UPDATE pr_comments SET comment = $1 WHERE id = $2 RETURNING *`,
      [comment, comment_id]
    );

    if (rowCount === 0) {
      await pool.query("ROLLBACK");
      return responseSender(res, 404, false, "Comment Not Found");
    }

    await pool.query("COMMIT");

    return responseSender(res, 200, true, "Comment Updated", rows[0]);
  } catch (error) {
    await pool.query("ROLLBACK");
    next(error);
  }
};

const deleteComment = async (req, res, next) => {
  const { comment_id } = req.params;

  try {
    await pool.query("BEGIN");

    const { rowCount } = await pool.query(
      `DELETE FROM pr_comments WHERE id = $1`,
      [comment_id]
    );

    if (rowCount === 0) {
      await pool.query("ROLLBACK");
      return responseSender(res, 404, false, "Comment Not Found");
    }

    await pool.query("COMMIT");

    return responseSender(res, 200, true, "Comment Deleted");
  } catch (error) {
    await pool.query("ROLLBACK");
    next(error);
  }
};

const getComment = async (req, res, next) => {
  const { comment_id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM pr_comments WHERE id = $1`,
      [comment_id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Comment Not Found");
    }

    return responseSender(res, 200, true, "Comment Retrieved", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getAllComments = async (req, res, next) => {
  const { pr_id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM pr_comments WHERE pr_id = $1`,
      [pr_id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "No Comments Found");
    }

    return responseSender(res, 200, true, "Comments Retrieved", rows);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComment,
  updateComment,
  deleteComment,
  getComment,
  getAllComments,
};
