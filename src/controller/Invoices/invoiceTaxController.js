const pool = require("../../config/db");
const { v4: uuidv4 } = require('uuid');
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const createTax = async (req, res, next) => {
    const { tax_value } = req.body;

    // Validate the tax_value field
    if (!tax_value) {
        return responseSender(res, 422, false, "Tax value is required.");
    }

    try {
        // Check if the tax_value already exists in the table
        const existingTax = await pool.query('SELECT * FROM invoice_tax WHERE tax_value = $1', [tax_value]);

        if (existingTax.rows.length > 0) {
            return responseSender(res, 409, false, "Same tax value already exists.");
        }

        // Insert the tax_value into the database if it doesn't already exist
        const result = await pool.query(
            'INSERT INTO invoice_tax (tax_value) VALUES ($1) RETURNING *',
            [tax_value]
        );

        // Send the successful response
        return responseSender(res, 201, true, "Tax added successfully", result.rows[0]);
    } catch (error) {
        // Handle errors
        next(error);
    }
};

const updateTax = async (req, res, next) => {
    const { id } = req.query; // Get the id from the query
    const { tax_value } = req.body; // Get the new tax_value from the body

    // Validate the id and tax_value fields
    if (!id) {
        return responseSender(res, 422, false, "Tax ID is required.");
    }

    if (!tax_value) {
        return responseSender(res, 422, false, "Tax value is required.");
    }

    try {
        // Check if the tax with the given ID exists
        const existingTaxById = await pool.query('SELECT * FROM invoice_tax WHERE id = $1', [id]);

        if (existingTaxById.rows.length === 0) {
            return responseSender(res, 404, false, "Tax with the provided ID does not exist.");
        }

        // Check if the new tax value already exists in another row (ignoring the current row)
        const existingTaxByValue = await pool.query(
            'SELECT * FROM invoice_tax WHERE tax_value = $1 AND id != $2',
            [tax_value, id]
        );

        if (existingTaxByValue.rows.length > 0) {
            return responseSender(res, 409, false, "Same tax value already exists.");
        }

        // Update the tax_value in the database for the given ID
        const result = await pool.query(
            'UPDATE invoice_tax SET tax_value = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [tax_value, id]
        );

        // Send the successful response
        return responseSender(res, 200, true, "Tax updated successfully", result.rows[0]);
    } catch (error) {
        // Handle errors
        next(error);
    }
};

const getTaxes = async (req, res, next) => {
    try {
        // Query to fetch all taxes from the database
        const result = await pool.query('SELECT * FROM invoice_tax ORDER BY created_at DESC');

        // Return the list of taxes
        return responseSender(res, 200, true, "List of taxes fetched successfully", result.rows);
    } catch (error) {
        // Handle errors
        next(error);
    }
};

const getTaxById = async (req, res, next) => {
    const { id } = req.query; // Get the id from the query

    // Validate the id field
    if (!id) {
        return responseSender(res, 422, false, "Tax ID is required.");
    }

    try {
        // Query to fetch the tax with the given ID
        const result = await pool.query('SELECT * FROM invoice_tax WHERE id = $1', [id]);

        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Tax with the provided ID does not exist.");
        }

        // Return the tax record
        return responseSender(res, 200, true, "Tax fetched successfully", result.rows[0]);
    } catch (error) {
        // Handle errors
        next(error);
    }
};

const deleteTax = async (req, res, next) => {
    const { id } = req.query; // Get the id from the query

    // Validate the id field
    if (!id) {
        return responseSender(res, 422, false, "Tax ID is required.");
    }

    try {
        // Check if the tax with the given ID exists
        const existingTax = await pool.query('SELECT * FROM invoice_tax WHERE id = $1', [id]);

        if (existingTax.rows.length === 0) {
            return responseSender(res, 404, false, "Tax with the provided ID does not exist.");
        }

        // Delete the tax record with the given ID
        await pool.query('DELETE FROM invoice_tax WHERE id = $1', [id]);

        // Send successful response
        return responseSender(res, 200, true, "Tax deleted successfully.");
    } catch (error) {
        // Handle errors
        next(error);
    }
};

module.exports = {
    createTax,
    updateTax,
    getTaxes,
    getTaxById,
    deleteTax
};
