const { Router } = require("express");
const {
  createComment,
  updateComment,
  deleteComment,
  getComment,
  getAllComments,
} = require("../../../controller/PurchaseRequisition/Comments/commentsController");
const {
  validateBody,
} = require("../../../middleware/validations/validationMiddleware");
const commentSchema = require("../../../validation/commentsValidation");

const router = Router();

router
  .route("/create")
  .post(validateBody(commentSchema.createComment), createComment);
router.route("/update").patch(updateComment);
router.route("/:comment_id/delete").delete(deleteComment);
router.route("/all/:pr_id").get(getAllComments);
router.route("/:comment_id").get(getComment);

module.exports = router;
