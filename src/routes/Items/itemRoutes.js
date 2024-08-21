const { Router } = require("express");
const {
    createItem,
    itemList,
    specifiItem,
    updateItem,
    deleteItem
} = require("../../controller/Items/itemController"); 

const router = Router();


router.route("/create").post(createItem);
router.route("/get/list").get(itemList);
router.route("/specific").get(specifiItem);
router.route("/update").put(updateItem);
router.route("/delete").delete(deleteItem); 

module.exports = router;