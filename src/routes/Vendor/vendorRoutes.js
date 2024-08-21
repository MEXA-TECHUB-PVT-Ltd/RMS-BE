const { Router } = require("express");
const {
  createVendor,
  getVendor,
  getVendors,
  deleteVendor,
  updateVendor,
} = require("../../controller/Vendor/vendorController");
const {
  validateBody,
} = require("../../middleware/validations/validationMiddleware");
const vendorSchema = require("../../validation/vendorValidation");
const upload = require("../../middleware/multer");

const router = Router();

const uploadFields = upload.fields([
  { name: "document", maxCount: 1 },
  { name: "cnic_front_img", maxCount: 1 },
  { name: "cnic_back_img", maxCount: 1 },
]);

router
  .route("/create")
  .post(uploadFields, validateBody(vendorSchema.createVendor), createVendor);
router.route("/").get(getVendors);
router.route("/:id").get(getVendor);
router.route("/:id").put(uploadFields, updateVendor);
router.route("/:id").delete(deleteVendor);

module.exports = router;
