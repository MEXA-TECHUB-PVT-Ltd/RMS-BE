const { Router } = require("express");
const {
  createCoupon,
  getAllCoupons,
  getCoupon,
  deleteCoupon,
  updateCoupon,
} = require("../../../controller/POS/Coupon/couponController");
const {
  validateBody,
} = require("../../../middleware/validations/validationMiddleware");
const couponSchema = require("../../../validation/couponValidation");

const router = Router();

router
  .route("/create")
  .post(validateBody(couponSchema.createCoupon), createCoupon);
router.route("/").get(getAllCoupons);
router.route("/:id").get(getCoupon);
router.route("/:id/update").patch(updateCoupon);
router.route("/:id/delete").delete(deleteCoupon);

module.exports = router;
