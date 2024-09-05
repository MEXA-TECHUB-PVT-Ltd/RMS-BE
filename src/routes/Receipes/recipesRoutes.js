const { Router } = require("express");
const {
    createRecipe,
    recipesList,
    specificRecipe,
    updateRecipe,
    deleteRecipe
} = require("../../controller/Receipes/recipeController");

const router = Router();

router.route("/create").post(createRecipe);
router.route("/list").get(recipesList);
router.route("/specific").get(specificRecipe);
router.route("/update").put(updateRecipe);
router.route("/delete").delete(deleteRecipe);

module.exports = router;