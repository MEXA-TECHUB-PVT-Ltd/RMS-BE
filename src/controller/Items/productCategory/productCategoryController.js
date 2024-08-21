const pool = require("../../../config/db");
const { responseSender } = require("../../../utilities/responseHandlers");
const { pagination } = require('../../../utilities/pagination');

const createProductCategory = async (req, res, next) => {
    const { name } = req.body;

    // Check if name is provided
    if (!name) {
        return responseSender(res, 422, false, "Name is required for creating a product category");
    }

    try {
        // Insert the product category into the database
        const result = await pool.query('INSERT INTO product_category (name) VALUES ($1) RETURNING *', [name]);

        // Send success response with the created product category
        return responseSender(res, 201, true, "Product Category created successfully", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const getProductCategories = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;
    const searchName = req.query.name || '';

    try {
        // Fetch total count of product categories
        let countQuery = 'SELECT COUNT(*) FROM product_category';
        let fetchQuery = 'SELECT * FROM product_category';

        // Add search condition if name is provided
        let queryParams = [];
        if (searchName) {
            countQuery += ' WHERE name ILIKE $1';
            fetchQuery += ' WHERE name ILIKE $1';
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

        return responseSender(res, 200, true, "Product Categories fetched", { count: paginationInfo.totalItems, categories: result.rows });
    } catch (error) {
        next(error);
    }
};

const getProductById = async (req, res, next) => {
    const productId = req.query.id;

    try {
        // Validate product ID
        if (!productId) {
            return responseSender(res, 400, false, "Product ID is required");
        }

        // Fetch product by ID
        const result = await pool.query('SELECT * FROM product_category WHERE id = $1', [productId]);

        // Check if product exists
        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Product not found");
        }

        // Send success response with the product
        return responseSender(res, 200, true, "Product fetched successfully", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const updateProduct = async (req, res, next) => {
    const { name } = req.body;
    const productId = req.query.id;

    try {
        // Validate product ID
        if (!productId) {
            return responseSender(res, 400, false, "Product ID is required");
        }

        // Check if product exists
        const productResult = await pool.query('SELECT * FROM product_category WHERE id = $1', [productId]);
        if (productResult.rows.length === 0) {
            return responseSender(res, 404, false, "Product not found");
        }

        // Update the product
        const updateResult = await pool.query('UPDATE product_category SET name = $1 WHERE id = $2 RETURNING *', [name, productId]);

        // Send success response with the updated product
        return responseSender(res, 200, true, "Product updated successfully", updateResult.rows[0]);
    } catch (error) {
        next(error);
    }
};

const deleteProduct = async (req, res, next) => {
    const categoryId = req.query.id;

    try {
        // Validate category ID
        if (!categoryId) {
            return responseSender(res, 400, false, "Category ID is required");
        }

        // Check if category exists
        const categoryResult = await pool.query('SELECT * FROM product_category WHERE id = $1', [categoryId]);
        if (categoryResult.rows.length === 0) {
            return responseSender(res, 404, false, "Category not found");
        }

        // Delete the category
        await pool.query('DELETE FROM product_category WHERE id = $1', [categoryId]);

        // Send success response
        return responseSender(res, 200, true, "Category deleted successfully");
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createProductCategory,
    getProductCategories,
    getProductById,
    updateProduct,
    deleteProduct
};
