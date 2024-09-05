const { Router } = require("express");
const {
    createUnits,
    unitsList,
    getUnitsByCategory,
    updateUnit,
    deleteUnit
} = require("../../../controller/Items/Units/unitsController");

const router = Router();

router.route("/create").post(createUnits);
router.route("/list").get(unitsList);
router.route("/get").get(getUnitsByCategory);
router.route("/update").put(updateUnit);
router.route("/delete").delete(deleteUnit);

module.exports = router;
