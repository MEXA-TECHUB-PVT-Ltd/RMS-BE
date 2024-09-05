const { Router } = require("express");
const {
    purchaseReceives,
    updatePurchaseReceive,
    cancelPurchaseOrder,
    getPurchaseReceives,
    getPurchaseReceiveDetails,

    getVendorsAndItemsByPurchaseOrderId,
    getPurchaseItemIdsByOrderIdAndVendorId
} = require("../../controller/PurchaseReceives/purchaseReceivesController");

const router = Router();

router.route("/create").post(purchaseReceives);
router.route("/update").put(updatePurchaseReceive);  
router.route("/cancel").delete(cancelPurchaseOrder);
router.route("/get/all").get(getPurchaseReceives);
router.route("/specific/get").get(getPurchaseReceiveDetails);
router.route("/get/vendors").get(getVendorsAndItemsByPurchaseOrderId);
router.route("/get/purchase/item").get(getPurchaseItemIdsByOrderIdAndVendorId); 

module.exports = router;
