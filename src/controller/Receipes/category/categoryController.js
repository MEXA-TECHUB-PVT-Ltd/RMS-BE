const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");
const { pagination } = require('../../../utilities/pagination');

const createCategory = async (req, res, next) => {
    const { category_name } = req.body;

    // Validate category and unit
    if (!category_name) {
        return responseSender(res, 422, false, "Category name required");
    }

    try {
        const result = await pool.query('INSERT INTO category (category_name) VALUES ($1) RETURNING *', [category_name]);
        return responseSender(res, 201, true, "Category Added", result.rows[0]);
    } catch (error) {
        next(error);
    }

};

const getCategoriesList = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;
    const searchName = req.query.category_name || '';

    try {
        // Fetch total count of product categories
        let countQuery = 'SELECT COUNT(*) FROM category';
        let fetchQuery = 'SELECT * FROM category';

        // Add search condition if name is provided
        let queryParams = [];
        if (searchName) {
            countQuery += ' WHERE category_name ILIKE $1';
            fetchQuery += ' WHERE category_name ILIKE $1';
            queryParams.push(searchName + '%');
        }

        const countResult = await pool.query(countQuery, queryParams);
        const totalItems = Number.parseInt(countResult.rows[0].count);

        // Calculate offset for pagination
        const offset = (currentPage - 1) * perPage;

        // Fetch paginated data
        let result;
        if (searchName) {
            result = await pool.query(fetchQuery + ' LIMIT $2 OFFSET $3', [...queryParams, perPage, offset]);
        } else {
            result = await pool.query(fetchQuery + ' LIMIT $1 OFFSET $2', [perPage, offset]);
        }

        // Generate pagination info
        const paginationInfo = pagination(totalItems, perPage, currentPage);

        return responseSender(res, 200, true, "Categories fetched", { count: paginationInfo.totalItems, categories: result.rows });
    } catch (error) {
        next(error);
    }
};

const getSpecificCategory = async (req, res, next) => {
    const categoryId = req.query.id;

    try {
        // Validate product ID
        if (!categoryId) {
            return responseSender(res, 400, false, "Category ID is required");
        }

        // Fetch product by ID
        const result = await pool.query('SELECT * FROM category WHERE id = $1', [categoryId]);

        // Check if product exists
        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Category not found");
        }

        // Send success response with the product
        return responseSender(res, 200, true, "Category fetched successfully", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateCategory = async (req, res, next) => {
    const categoryId = req.query.id;
    const { category_name } = req.body;

    if (!categoryId) {
        return responseSender(res, 422, false, "Category ID required");
    }

    if (!category_name) {
        return responseSender(res, 422, false, "Category name required");
    }

    const result = await pool.query('SELECT * FROM category WHERE id = $1', [categoryId]);

    if (result.rows.length == 0) {
        return responseSender(res, 422, false, "Category not found");
    }

    try {
        const result = await pool.query('UPDATE category SET category_name = $1 WHERE id = $2 RETURNING *', [category_name, categoryId]);
        return responseSender(res, 201, true, "Category Updated", result.rows[0]);
    } catch (error) {
        next(error);
    }

};

const deleteCategory = async (req, res, next) => {
    const categoryId = req.query.id;

    if (!categoryId) {
        return responseSender(res, 422, false, "Category ID required");
    }

    const result = await pool.query('SELECT * FROM category WHERE id = $1', [categoryId]);

    if (result.rows.length == 0) {
        return responseSender(res, 422, false, "Category not found");
    }

    try {
        const result = await pool.query('DELETE FROM category WHERE id = $1 RETURNING *', [categoryId]);
        return responseSender(res, 201, true, "Category Deleted", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createCategory,
    getCategoriesList,
    getSpecificCategory,
    updateCategory,
    deleteCategory
};
