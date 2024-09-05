const { Router } = require("express");
const {
  createPurchaseRequisition,
  getPurchaseRequisition,
  deletePurchaseRequisition,
  getAllPurchaseRequisition,
  updatePurchaseRequisition,
} = require("../../controller/PurchaseRequisition/purchaseRequisitionController");
const upload = require("../../middleware/multer");
const {
  validateBody,
} = require("../../middleware/validations/validationMiddleware");
const purchaseRequisitionShema = require("../../validation/purchaseRequisitionValidation");

const router = Router();

router
  .route("/create")
  .post(
    upload.single("document"),
    validateBody(purchaseRequisitionShema.createPurchaseRequisition),
    createPurchaseRequisition
  );
router.route("/").get(getAllPurchaseRequisition);
router.route("/:id").get(getPurchaseRequisition);
router.route("/:id").put(upload.single("document"), updatePurchaseRequisition);
router.route("/:id").delete(deletePurchaseRequisition);

module.exports = router;
