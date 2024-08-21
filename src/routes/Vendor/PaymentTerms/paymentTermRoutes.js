const { Router } = require("express");
const {
  createPaymentTerm,
  getAllPaymentTerms,
  getPaymentTerm,
  updatePaymentTerm,
  deletePaymentTerm,
} = require("../../../controller/Vendor/PaymentTerms/paymentTemsController");

const router = Router();

router.route("/create").post(createPaymentTerm);
router.route("/").get(getAllPaymentTerms);
router.route("/:id").get(getPaymentTerm);
router.route("/:id/update").patch(updatePaymentTerm);
router.route("/:id/delete").delete(deletePaymentTerm);

module.exports = router;
