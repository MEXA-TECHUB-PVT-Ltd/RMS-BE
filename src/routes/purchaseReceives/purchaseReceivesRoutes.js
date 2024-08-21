const { Router } = require("express");
const {
    purchaseReceives,
    cancelPurchaseOrder,
    getPurchaseReceives,
    getPurchaseReceiveDetails
} = require("../../controller/PurchaseReceives/purchaseReceivesController");

const router = Router();

router.route("/create").post(purchaseReceives);
router.route("/cancel").delete(cancelPurchaseOrder);
router.route("/get/all").get(getPurchaseReceives);
router.route("/specific/get").get(getPurchaseReceiveDetails);

module.exports = router;
