const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");
const { pagination } = require('../../../utilities/pagination');

const validUnits = {
    mass: ['kg', 'g', 'mg'],
    volume: ['l', 'ml'],
    quantity: ['packs', 'bottles', 'dozen'] // Any number can be given as a unit
};

const createUnits = async (req, res, next) => {
    const { category, unit, quantity } = req.body;

    if (!category || !unit) {
        return responseSender(res, 422, false, "Category and unit are required");
    }

    const validCategories = Object.keys(validUnits);
    if (!validCategories.includes(category)) {
        return responseSender(res, 422, false, "Invalid category. Must be 'mass', 'liquid', or 'quantity'");
    }

    if (category === 'quantity') {
        // Check if the unit is valid for 'quantity' category
        if (!validUnits[category].includes(unit)) {
            return responseSender(res, 422, false, `Invalid unit for category '${category}'. Valid units are: ${validUnits[category].join(', ')}`);
        }

        // Validate the quantity
        const quantityAsNumber = Number(quantity);
        if (!quantity || isNaN(quantityAsNumber) || quantityAsNumber <= 0) {
            return responseSender(res, 422, false, "Invalid quantity. Quantity must be a positive number.");
        }
    } else if (!validUnits[category].includes(unit)) {
        return responseSender(res, 422, false, `Invalid unit for category '${category}'. Valid units are: ${validUnits[category].join(', ')}`);
    }

    try {
        // Insert the unit into the database
        const result = await pool.query(
            'INSERT INTO units (category, unit, quantity) VALUES ($1, $2, $3) RETURNING *',
            [category, unit, category === 'quantity' ? quantity : null]
        );

        return responseSender(res, 201, true, "Unit Added", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const unitsList = async (req, res, next) => {
    try {
        // Fetch all units
        const result = await pool.query('SELECT * FROM units');

        // Get the units as a single array
        const units = result.rows;

        // Count total units
        const totalUnits = units.length;

        return responseSender(res, 200, true, "Units fetched", {
            count: totalUnits,
            units: units
        });
    } catch (error) {
        next(error);
    }
};

const getUnitsByCategory = async (req, res, next) => {
    const { category } = req.query;
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;

    // Validate category
    if (!validUnits[category]) {
        return responseSender(res, 422, false, "Invalid category, Category can be only mass, volume and quantity");
    }

    try {
        // Fetch total count of items for the given category
        const countResult = await pool.query('SELECT COUNT(*) FROM units WHERE category = $1', [category]);
        const totalItems = Number.parseInt(countResult.rows[0].count);

        // Calculate offset for pagination
        const offset = (currentPage - 1) * perPage;

        // Fetch paginated data
        const result = await pool.query('SELECT * FROM units WHERE category = $1 LIMIT $2 OFFSET $3', [category, perPage, offset]);

        // Generate pagination info
        const paginationInfo = pagination(totalItems, perPage, currentPage);

        return responseSender(res, 200, true, "Units fetched", { count: paginationInfo.totalItems, units: result.rows });
    } catch (error) {
        next(error);
    }
};

const updateUnit = async (req, res, next) => {
    const { id, category, unit, quantity } = req.body;

    if (!category || !unit) {
        return responseSender(res, 422, false, "Category and unit are required");
    }

    const validCategories = Object.keys(validUnits);
    if (!validCategories.includes(category)) {
        return responseSender(res, 422, false, "Invalid category. Must be 'mass', 'liquid', or 'quantity'");
    }

    if (category === 'quantity') {
        // Check if the unit is valid for 'quantity' category
        if (!validUnits[category].includes(unit)) {
            return responseSender(res, 422, false, `Invalid unit for category '${category}'. Valid units are: ${validUnits[category].join(', ')}`);
        }

        // Validate the quantity
        const quantityAsNumber = Number(quantity);
        if (!quantity || isNaN(quantityAsNumber) || quantityAsNumber <= 0) {
            return responseSender(res, 422, false, "Invalid quantity. Quantity must be a positive number.");
        }
    } else if (!validUnits[category].includes(unit)) {
        return responseSender(res, 422, false, `Invalid unit for category '${category}'. Valid units are: ${validUnits[category].join(', ')}`);
    }

    try {
        // Validate unit ID
        const unitResult = await pool.query('SELECT * FROM units WHERE id = $1', [id]);
        if (unitResult.rowCount === 0) {
            return responseSender(res, 404, false, "Unit not found");
        }

        // Update the unit
        const result = await pool.query(
            'UPDATE units SET category = $1, unit = $2, quantity = $3, updated_at = NOW() WHERE id = $4 RETURNING *',
            [category, unit, category === 'quantity' ? quantity : null, id]
        );

        return responseSender(res, 200, true, "Unit Updated", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const deleteUnit = async (req, res, next) => {
    const { id } = req.query;

    try {
        // Validate unit ID
        const unitResult = await pool.query('SELECT * FROM units WHERE id = $1', [id]);
        if (unitResult.rowCount === 0) {
            return responseSender(res, 404, false, "Unit not found");
        }

        // Delete the unit
        await pool.query('DELETE FROM units WHERE id = $1', [id]);

        return responseSender(res, 200, true, "Unit deleted successfully");
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createUnits,
    unitsList,
    getUnitsByCategory,
    updateUnit,
    deleteUnit
};
