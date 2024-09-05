const { v4: uuidv4 } = require('uuid');
const pool = require("../../config/db");
const { responseSender } = require("../../utilities/responseHandlers");
const { pagination } = require('../../utilities/pagination');

const createRecipe = async (req, res, next) => {

    const {
        recipe_name,
        category,
        difficulty_level,
        added_by,
        price,
        cooking_time,
        selected_item,
        nutritional_info,
        allergen_info,
        presentation_instructions,
        equipment_needed,
        side_order,
        image,
        preparation_instructions
    } = req.body;

    if (!recipe_name,
        !category,
        !difficulty_level,
        !added_by,
        !price,
        !cooking_time,
        !selected_item,
        !nutritional_info,
        !allergen_info,
        // !presentation_instructions,
        // !equipment_needed,
        // !side_order,
        // !preparation_instructions,
        !image
    ) {
        return responseSender(res, 422, false, "Invalid data. Missing attributes");
    }

    if (difficulty_level !== 'HIGH' && difficulty_level !== 'MEDIUM' && difficulty_level !== 'LOW') {
        return responseSender(res, 422, false, "Invalid difficulty_level. Must be HIGH, MEDIUM or LOW.");
    }

    try {
        // Insert the product category into the database
        const result = await pool.query(
            'INSERT INTO recipes (recipe_name, category, difficulty_level, added_by, price, cooking_time, selected_item, nutritional_info, allergen_info, presentation_instructions, equipment_needed, side_order, image, preparation_instructions) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *',
            [
                recipe_name,
                category,
                difficulty_level,
                added_by,
                price,
                cooking_time,
                selected_item,
                nutritional_info,
                allergen_info,
                presentation_instructions,
                equipment_needed,
                side_order,
                image,
                preparation_instructions,
            ]
        );

        return responseSender(res, 201, true, "Recipe created successfully", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

const recipesList = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;
    const searchName = req.query.name || '';
    const searchCategory = req.query.category || '';

    try {
        // Initialize query parameters array
        let queryParams = [];

        // Base count and fetch queries
        let countQuery = 'SELECT COUNT(*) FROM recipes LEFT JOIN category ON recipes.category = category.id';
        let fetchQuery = `
            SELECT 
                recipes.id,
                recipes.recipe_name,
                category.category_name,
                recipes.difficulty_level,
                recipes.added_by,
                recipes.price,
                recipes.cooking_time,
                item.id AS selected_item_id,
                item.name AS selected_item_name,
                item.type AS selected_item_type,
                item.product_category AS selected_item_product_category,
                item.product_units AS selected_item_product_units,
                item.usage_unit AS selected_item_usage_unit,
                item.product_catalog AS selected_item_product_catalog,
                item.description AS selected_item_description,
                item.stock_in_hand AS selected_item_stock_in_hand,
                item.opening_stock_rate AS selected_item_opening_stock_rate,
                item.reorder_unit AS selected_item_reorder_unit,
                item.inventory_description AS selected_item_inventory_description,
                item.image AS selected_item_image,
                recipes.nutritional_info,
                recipes.allergen_info,
                recipes.presentation_instructions,
                recipes.equipment_needed,
                recipes.side_order,
                recipes.image,
                recipes.preparation_instructions,
                recipes.created_at,
                recipes.updated_at
            FROM recipes
            LEFT JOIN category ON recipes.category = category.id
            LEFT JOIN item ON recipes.selected_item = item.id
        `;

        // Add search conditions if recipe name or category is provided
        let conditions = [];
        if (searchName) {
            conditions.push(`recipes.recipe_name ILIKE $1`);
            queryParams.push('%' + searchName + '%');
        }
        if (searchCategory) {
            conditions.push(`category.category_name ILIKE $` + (queryParams.length + 1));
            queryParams.push('%' + searchCategory + '%');
        }

        // Add conditions to queries if there are any
        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            countQuery += whereClause;
            fetchQuery += whereClause;
        }

        const countResult = await pool.query(countQuery, queryParams);
        const totalItems = Number.parseInt(countResult.rows[0].count);

        // Calculate offset for pagination
        const offset = (currentPage - 1) * perPage;

        // Fetch paginated data
        fetchQuery += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        const result = await pool.query(fetchQuery, [...queryParams, perPage, offset]);

        // Format the results to include selected_item as a separate object
        const formattedResult = result.rows.map(recipe => ({
            id: recipe.id,
            recipe_name: recipe.recipe_name,
            category: recipe.category_name,
            difficulty_level: recipe.difficulty_level,
            added_by: recipe.added_by,
            price: recipe.price,
            cooking_time: recipe.cooking_time,
            nutritional_info: recipe.nutritional_info,
            allergen_info: recipe.allergen_info,
            presentation_instructions: recipe.presentation_instructions,
            equipment_needed: recipe.equipment_needed,
            side_order: recipe.side_order,
            image: recipe.image,
            preparation_instructions: recipe.preparation_instructions,
            selected_item: {
                id: recipe.selected_item_id,
                name: recipe.selected_item_name,
                type: recipe.selected_item_type,
                product_category: recipe.selected_item_product_category,
                product_units: recipe.selected_item_product_units,
                usage_unit: recipe.selected_item_usage_unit,
                product_catalog: recipe.selected_item_product_catalog,
                description: recipe.selected_item_description,
                stock_in_hand: recipe.selected_item_stock_in_hand,
                opening_stock_rate: recipe.selected_item_opening_stock_rate,
                reorder_unit: recipe.selected_item_reorder_unit,
                inventory_description: recipe.selected_item_inventory_description,
                image: recipe.selected_item_image,
            },
            created_at: recipe.created_at,
            updated_at: recipe.updated_at
        }));

        // Generate pagination info
        const paginationInfo = pagination(totalItems, perPage, currentPage);

        // Send the formatted list of recipes along with pagination metadata
        return responseSender(res, 200, true, "Recipes fetched successfully", {
            count: paginationInfo.totalItems,
            recipes: formattedResult
        });
    } catch (error) {
        next(error);
    }
}

const specificRecipe = async (req, res, next) => {
    const recipeId = req.query.id;

    try {

        const existence = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [recipeId]);

        if (existence.rows.length == 0) {
            return responseSender(res, 404, false, "Recipe not found");
        }

        let fetchQuery = `
    SELECT 
        recipes.id,
        recipes.recipe_name,
        category.category_name,
        recipes.difficulty_level,
        recipes.added_by,
        recipes.price,
        recipes.cooking_time,
        item.id AS selected_item_id,
        item.name AS selected_item_name,
        item.type AS selected_item_type,
        item.product_category AS selected_item_product_category,
        item.product_units AS selected_item_product_units,
        item.usage_unit AS selected_item_usage_unit,
        item.product_catalog AS selected_item_product_catalog,
        item.description AS selected_item_description,
        item.stock_in_hand AS selected_item_stock_in_hand,
        item.opening_stock_rate AS selected_item_opening_stock_rate,
        item.reorder_unit AS selected_item_reorder_unit,
        item.inventory_description AS selected_item_inventory_description,
        item.image AS selected_item_image,
        recipes.nutritional_info,
        recipes.allergen_info,
        recipes.presentation_instructions,
        recipes.equipment_needed,
        recipes.side_order,
        recipes.image,
        recipes.preparation_instructions,
        recipes.created_at,
        recipes.updated_at
    FROM recipes
    LEFT JOIN category ON recipes.category = category.id
    LEFT JOIN item ON recipes.selected_item = item.id
    WHERE recipes.id = $1
`;

        const result = await pool.query(fetchQuery, [recipeId]);

        const formattedResult = result.rows.map(recipe => ({
            id: recipe.id,
            recipe_name: recipe.recipe_name,
            category: recipe.category_name,
            difficulty_level: recipe.difficulty_level,
            added_by: recipe.added_by,
            price: recipe.price,
            cooking_time: recipe.cooking_time,
            nutritional_info: recipe.nutritional_info,
            allergen_info: recipe.allergen_info,
            presentation_instructions: recipe.presentation_instructions,
            equipment_needed: recipe.equipment_needed,
            side_order: recipe.side_order,
            image: recipe.image,
            preparation_instructions: recipe.preparation_instructions,
            selected_item: {
                id: recipe.selected_item_id,
                name: recipe.selected_item_name,
                type: recipe.selected_item_type,
                product_category: recipe.selected_item_product_category,
                product_units: recipe.selected_item_product_units,
                usage_unit: recipe.selected_item_usage_unit,
                product_catalog: recipe.selected_item_product_catalog,
                description: recipe.selected_item_description,
                stock_in_hand: recipe.selected_item_stock_in_hand,
                opening_stock_rate: recipe.selected_item_opening_stock_rate,
                reorder_unit: recipe.selected_item_reorder_unit,
                inventory_description: recipe.selected_item_inventory_description,
                image: recipe.selected_item_image,
            },
            created_at: recipe.created_at,
            updated_at: recipe.updated_at
        }));

        return responseSender(res, 200, true, "Recipe fetched successfully", formattedResult);

    } catch (error) {
        next(error);
    }

}

const updateRecipe = async (req, res, next) => {
    const recipeId = req.query.id;

    try {
        const {
            recipe_name,
            category,
            difficulty_level,
            added_by,
            price,
            cooking_time,
            selected_item,
            nutritional_info,
            allergen_info,
            presentation_instructions,
            equipment_needed,
            side_order,
            image,
            preparation_instructions
        } = req.body;

        // Check if at least one field to update is provided
        if (!recipe_name &&
            !category &&
            !difficulty_level &&
            !added_by &&
            !price &&
            !cooking_time &&
            !selected_item &&
            !nutritional_info &&
            !allergen_info &&
            !presentation_instructions &&
            !equipment_needed &&
            !side_order &&
            !image &&
            !preparation_instructions
        ) {
            return responseSender(res, 422, false, "No fields to update provided");
        }

        // Build the update query dynamically
        let updateQuery = 'UPDATE recipes SET ';
        let updateParams = [];
        let paramIndex = 1;

        // Append each field to update if provided
        if (recipe_name) {
            updateQuery += `recipe_name = $${paramIndex}, `;
            updateParams.push(recipe_name);
            paramIndex++;
        }
        if (category) {
            updateQuery += `category = $${paramIndex}, `;
            updateParams.push(category);
            paramIndex++;
        }
        if (difficulty_level) {
            updateQuery += `difficulty_level = $${paramIndex}, `;
            updateParams.push(difficulty_level);
            paramIndex++;
        }
        // Add conditions for other fields similarly

        // Remove the trailing comma and space
        updateQuery = updateQuery.slice(0, -2);

        // Add the WHERE clause for the recipe ID
        updateQuery += ` WHERE id = $${paramIndex}`;

        // Add the recipe ID to the parameters array
        updateParams.push(recipeId);

        // Execute the update query
        const result = await pool.query(updateQuery, updateParams);

        if (result.rowCount === 0) {
            return responseSender(res, 404, false, "Recipe not found");
        }

        // Fetch the updated recipe
        const updatedRecipe = await pool.query('SELECT * FROM recipes WHERE id = $1', [recipeId]);

        return responseSender(res, 200, true, "Recipe updated successfully", updatedRecipe.rows[0]);
    } catch (error) {
        next(error);
    }
};

const deleteRecipe = async (req, res, next) => {
    const recipeId = req.query.id;

    try {

        const existence = await pool.query(`SELECT * FROM recipes WHERE id = $1`, [recipeId]);

        if (existence.rows.length == 0) {
            return responseSender(res, 404, false, "Recipe not found");
        }

        let fetchQuery = `DELETE FROM recipes WHERE id = $1 RETURNING *`;

        const result = await pool.query(fetchQuery, [recipeId]);

        return responseSender(res, 200, true, "Recipe deleted successfully", result.rows[0]);

    } catch (error) {
        next(error);
    }

}

module.exports = {
    createRecipe,
    recipesList,
    specificRecipe,
    updateRecipe,
    deleteRecipe
};