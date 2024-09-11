const { Router } = require("express");
const {
    createInvoice,
    getInvoices,
    getInvoiceById,
    updateInvoiceStatus
} = require("../../controller/Invoices/invoiceController");

const router = Router();

router.route("/create").post(createInvoice);
router.route("/get/list").get(getInvoices);
router.route("/get/specific").get(getInvoiceById);
router.route("/update/status").put(updateInvoiceStatus);

module.exports = router;