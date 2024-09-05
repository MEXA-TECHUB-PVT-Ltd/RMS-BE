const { Router } = require("express");
const {
    createProductCategory,
    getProductCategories,
    getProductById,
    updateProduct,
    deleteProduct
} = require("../../../controller/Items/productCategory/productCategoryController");

const router = Router();

router.route("/create").post(createProductCategory);
router.route("/get/all").get(getProductCategories);
router.route("/get/specific").get(getProductById);
router.route("/update").put(updateProduct);
router.route("/delete").delete(deleteProduct);

module.exports = router;
