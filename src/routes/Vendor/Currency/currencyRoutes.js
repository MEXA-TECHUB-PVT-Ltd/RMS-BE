const { Router } = require("express");
const {
  createCurrency,
  getAllCurrencies,
  getCurrency,
  updateCurrency,
  deleteCurrency,
} = require("../../../controller/Vendor/Currency/currencyController");

const router = Router();

router.route("/create").post(createCurrency);
router.route("/").get(getAllCurrencies);
router.route("/:id").get(getCurrency);
router.route("/:id/update").patch(updateCurrency);
router.route("/:id/delete").delete(deleteCurrency);

module.exports = router;
