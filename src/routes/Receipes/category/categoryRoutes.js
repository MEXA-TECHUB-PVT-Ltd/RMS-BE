const { Router } = require("express");
const {
    createCategory,
    getCategoriesList,
    getSpecificCategory,
    updateCategory,
    deleteCategory
} = require("../../../controller/receipes/category/categoryController");

const router = Router();

router.route("/create").post(createCategory);
router.route("/get/list").get(getCategoriesList);
router.route("/specific").get(getSpecificCategory);
router.route("/update").put(updateCategory);
router.route("/delete").delete(deleteCategory);

module.exports = router;
