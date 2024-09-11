const { Router } = require("express");
const {
    createTax,
    updateTax,
    getTaxes,
    getTaxById,
    deleteTax
} = require("../../../controller/Invoices/invoiceTaxController");

const router = Router();

router.route("/create").post(createTax);
router.route("/update").put(updateTax);
router.route("/get/list").get(getTaxes);
router.route("/get/specific").get(getTaxById);
router.route("/delete").delete(deleteTax);

module.exports = router;
