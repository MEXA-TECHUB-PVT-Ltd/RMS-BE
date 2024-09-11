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
        nutritional_info,
        allergen_info,
        presentation_instructions,
        equipment_needed,
        side_order,
        image,
        preparation_instructions,
        serving_details,
        signature,
        items // Array of objects with { item_id, quantity }
    } = req.body;

    // Validate required fields
    if (
        !recipe_name ||
        !category ||
        !difficulty_level ||
        !added_by ||
        !price ||
        !cooking_time ||
        !nutritional_info ||
        !items ||
        !items.length ||
        !serving_details ||
        (signature === undefined || signature === null) ||
        !image
    ) {
        return responseSender(res, 422, false, "Invalid data. Missing attributes");
    }

    // Validate difficulty level
    if (difficulty_level !== 'HIGH' && difficulty_level !== 'MEDIUM' && difficulty_level !== 'LOW') {
        return responseSender(res, 422, false, "Invalid difficulty level. Must be HIGH, MEDIUM, or LOW.");
    }

    try {
        // Insert the recipe into the recipes table
        const recipeResult = await pool.query(
            `INSERT INTO recipes (
                recipe_name, category, difficulty_level, added_by, price, cooking_time, nutritional_info, allergen_info, 
                presentation_instructions, equipment_needed, side_order, image, preparation_instructions, serving_details, signature
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            RETURNING id`,
            [
                recipe_name, category, difficulty_level, added_by, price, cooking_time, nutritional_info, allergen_info,
                presentation_instructions, equipment_needed, side_order, image, preparation_instructions, serving_details, signature
            ]
        );

        const recipeId = recipeResult.rows[0].id;

        // Array to store details of items added to the recipe
        const addedItems = [];

        // Loop through each item and fetch the measuring_unit if not provided
        for (const item of items) {
            const { item_id, quantity } = item;

            // Fetch the complete item details from the item table
            const itemResult = await pool.query(
                `SELECT * FROM item WHERE id = $1`,
                [item_id]
            );

            if (itemResult.rows.length === 0) {
                return responseSender(res, 404, false, "Item not found");
            }

            const itemDetails = itemResult.rows[0];

            let { usage_unit, name, description, type, product_category, unit_category, quantity_units, product_units, product_catalog, stock_in_hand, opening_stock_rate, reorder_unit, inventory_description, image: itemImage } = itemDetails;

            // Check if the usage_unit is a UUID (for units table lookup) or a direct string value
            const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4|5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(usage_unit);
            let measuring_unit;

            if (isUUID) {
                // Fetch the unit name from the units table if usage_unit is a UUID
                const unitResult = await pool.query('SELECT unit FROM units WHERE id = $1', [usage_unit]);

                if (unitResult.rows.length === 0) {
                    return responseSender(res, 404, false, "Unit not found for the selected item");
                }

                measuring_unit = unitResult.rows[0].unit; // Use the unit name from the units table
            } else {
                // If usage_unit is not a UUID, use the stored data directly
                measuring_unit = usage_unit;
            }

            // Insert the item, quantity, and measuring unit into the recipe_items table
            await pool.query(
                `INSERT INTO recipe_items (recipe_id, item_id, quantity, measuring_unit) VALUES ($1, $2, $3, $4)`,
                [recipeId, item_id, quantity, measuring_unit]
            );

            // Push the added item details to the array
            addedItems.push({
                item_id,
                name,
                description,
                type,
                product_category,
                unit_category,
                quantity_units,
                product_units,
                product_catalog,
                stock_in_hand,
                opening_stock_rate,
                reorder_unit,
                inventory_description,
                image: itemImage,
                quantity,
                measuring_unit
            });
        }

        // Fetch the complete details of the newly created recipe
        const completeRecipeResult = await pool.query(
            `SELECT r.*, ri.item_id, ri.quantity, ri.measuring_unit, i.name as item_name, i.image as item_image, i.description 
            FROM recipes r 
            LEFT JOIN recipe_items ri ON r.id = ri.recipe_id 
            LEFT JOIN item i ON ri.item_id = i.id 
            WHERE r.id = $1`,
            [recipeId]
        );

        const completeRecipe = completeRecipeResult.rows.map(row => ({
            id: row.id,
            recipe_name: row.recipe_name,
            category: row.category,
            difficulty_level: row.difficulty_level,
            added_by: row.added_by,
            price: row.price,
            cooking_time: row.cooking_time,
            nutritional_info: row.nutritional_info,
            allergen_info: row.allergen_info,
            presentation_instructions: row.presentation_instructions,
            equipment_needed: row.equipment_needed,
            side_order: row.side_order,
            image: row.image,
            preparation_instructions: row.preparation_instructions,
            serving_details: row.serving_details,
            signature: row.signature,
            items: addedItems
        }));

        return responseSender(res, 200, true, "Recipe created successfully", completeRecipe[0]);
    } catch (error) {
        console.error(error);
        next(error); // Pass error to the next middleware (error handler)
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
        let countQuery = `
            SELECT COUNT(DISTINCT r.id) 
            FROM recipes r
            LEFT JOIN category c ON r.category = c.id
            WHERE 1=1
        `;
        let fetchQuery = `
            SELECT 
                r.id AS recipe_id,
                r.recipe_name,
                r.category,
                c.category_name,
                r.difficulty_level,
                r.added_by,
                r.price,
                r.cooking_time,
                r.nutritional_info,
                r.allergen_info,
                r.presentation_instructions,
                r.equipment_needed,
                r.side_order,
                r.image,
                r.preparation_instructions,
                r.serving_details,
                r.signature,
                ri.item_id,
                ri.quantity,
                ri.measuring_unit,
                i.name AS item_name,
                i.image AS item_image,
                i.description AS item_description
            FROM recipes r
            LEFT JOIN category c ON r.category = c.id
            LEFT JOIN recipe_items ri ON r.id = ri.recipe_id
            LEFT JOIN item i ON ri.item_id = i.id
            WHERE 1=1
        `;

        // Add search conditions if recipe name or category is provided
        let conditions = [];
        if (searchName) {
            conditions.push(`r.recipe_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${searchName}%`);
        }
        if (searchCategory) {
            conditions.push(`c.category_name ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${searchCategory}%`);
        }

        // Add conditions to queries if there are any
        if (conditions.length > 0) {
            const whereClause = ' AND ' + conditions.join(' AND ');
            countQuery += whereClause;
            fetchQuery += whereClause;
        }

        // Execute count query to get total items
        const countResult = await pool.query(countQuery, queryParams);
        const totalItems = Number.parseInt(countResult.rows[0].count);

        // Calculate offset for pagination
        const offset = (currentPage - 1) * perPage;

        // Add limit and offset to fetchQuery for pagination
        fetchQuery += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
        const result = await pool.query(fetchQuery, [...queryParams, perPage, offset]);

        // Format the results to group items by recipe
        const recipesMap = new Map();

        result.rows.forEach(row => {
            const recipeId = row.recipe_id;
            if (!recipesMap.has(recipeId)) {
                recipesMap.set(recipeId, {
                    id: recipeId,
                    recipe_name: row.recipe_name,
                    category: row.category,
                    category_name: row.category_name,
                    difficulty_level: row.difficulty_level,
                    added_by: row.added_by,
                    price: row.price,
                    cooking_time: row.cooking_time,
                    nutritional_info: row.nutritional_info,
                    allergen_info: row.allergen_info,
                    presentation_instructions: row.presentation_instructions,
                    equipment_needed: row.equipment_needed,
                    side_order: row.side_order,
                    image: row.image,
                    preparation_instructions: row.preparation_instructions,
                    serving_details: row.serving_details,
                    signature: row.signature,
                    items: []
                });
            }

            if (row.item_id) {
                recipesMap.get(recipeId).items.push({
                    item_id: row.item_id,
                    name: row.item_name,
                    image: row.item_image,
                    description: row.item_description,
                    quantity: row.quantity,
                    measuring_unit: row.measuring_unit
                });
            }
        });

        const formattedRecipes = Array.from(recipesMap.values());

        const paginationInfo = pagination(totalItems, perPage, currentPage);

        return responseSender(res, 200, true, "Recipes fetched successfully", { count: paginationInfo.totalItems, recipes: formattedRecipes });
    } catch (error) {
        console.error(error);
        next(error); // Pass error to the next middleware (error handler)
    }
};

const specificRecipe = async (req, res, next) => {
    const recipeId = req.query.id;  // Extract the recipe ID from the query parameters

    if (!recipeId) {
        return responseSender(res, 400, false, "Recipe ID is required");
    }

    try {
        // Query to fetch a single recipe based on the provided ID
        const fetchQuery = `
            SELECT 
                r.id AS recipe_id,
                r.recipe_name,
                r.category,
                c.category_name,
                r.difficulty_level,
                r.added_by,
                r.price,
                r.cooking_time,
                r.nutritional_info,
                r.allergen_info,
                r.presentation_instructions,
                r.equipment_needed,
                r.side_order,
                r.image,
                r.preparation_instructions,
                r.serving_details,
                r.signature,
                ri.item_id,
                ri.quantity,
                ri.measuring_unit,
                i.name AS item_name,
                i.image AS item_image,
                i.description AS item_description
            FROM recipes r
            LEFT JOIN category c ON r.category = c.id
            LEFT JOIN recipe_items ri ON r.id = ri.recipe_id
            LEFT JOIN item i ON ri.item_id = i.id
            WHERE r.id = $1
        `;

        // Execute the query
        const result = await pool.query(fetchQuery, [recipeId]);

        // Check if the recipe was found
        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Recipe not found");
        }

        // Format the result to include selected_item as a separate object and aggregate items
        const recipeMap = new Map();

        result.rows.forEach(row => {
            const recipeId = row.recipe_id;

            if (!recipeMap.has(recipeId)) {
                recipeMap.set(recipeId, {
                    id: recipeId,
                    recipe_name: row.recipe_name,
                    category: row.category,
                    category_name: row.category_name,
                    difficulty_level: row.difficulty_level,
                    added_by: row.added_by,
                    price: row.price,
                    cooking_time: row.cooking_time,
                    nutritional_info: row.nutritional_info,
                    allergen_info: row.allergen_info,
                    presentation_instructions: row.presentation_instructions,
                    equipment_needed: row.equipment_needed,
                    side_order: row.side_order,
                    image: row.image,
                    preparation_instructions: row.preparation_instructions,
                    serving_details: row.serving_details,
                    signature: row.signature,
                    items: []
                });
            }

            if (row.item_id) {
                recipeMap.get(recipeId).items.push({
                    item_id: row.item_id,
                    name: row.item_name,
                    image: row.item_image,
                    description: row.item_description,
                    quantity: row.quantity,
                    measuring_unit: row.measuring_unit
                });
            }
        });

        const formattedRecipe = Array.from(recipeMap.values())[0];

        // Send the formatted recipe as the response
        return responseSender(res, 200, true, "Recipe fetched successfully", formattedRecipe);
    } catch (error) {
        next(error);  // Pass error to error-handling middleware
    }
};

const updateRecipe = async (req, res, next) => {
    const {
        recipe_id,
        recipe_name,
        category,
        difficulty_level,
        price,
        cooking_time,
        nutritional_info,
        allergen_info,
        presentation_instructions,
        equipment_needed,
        side_order,
        image,
        preparation_instructions,
        serving_details,
        signature,
        items // Array of objects with { item_id, quantity }
    } = req.body;

    // Check if recipe_id is provided
    if (!recipe_id) {
        return responseSender(res, 422, false, "Invalid data. Missing recipe_id");
    }

    // Build the update query dynamically
    let updateFields = [];
    let updateValues = [];
    let query = 'UPDATE recipes SET ';

    // Map the fields and values to be updated
    if (recipe_name !== undefined) {
        updateFields.push(`recipe_name = $${updateFields.length + 1}`);
        updateValues.push(recipe_name);
    }
    if (category !== undefined) {
        updateFields.push(`category = $${updateFields.length + 1}`);
        updateValues.push(category);
    }
    if (difficulty_level !== undefined) {
        if (difficulty_level !== 'HIGH' && difficulty_level !== 'MEDIUM' && difficulty_level !== 'LOW') {
            return responseSender(res, 422, false, "Invalid difficulty_level. Must be HIGH, MEDIUM, or LOW.");
        }
        updateFields.push(`difficulty_level = $${updateFields.length + 1}`);
        updateValues.push(difficulty_level);
    }
    if (price !== undefined) {
        updateFields.push(`price = $${updateFields.length + 1}`);
        updateValues.push(price);
    }
    if (cooking_time !== undefined) {
        updateFields.push(`cooking_time = $${updateFields.length + 1}`);
        updateValues.push(cooking_time);
    }
    if (nutritional_info !== undefined) {
        updateFields.push(`nutritional_info = $${updateFields.length + 1}`);
        updateValues.push(nutritional_info);
    }
    if (allergen_info !== undefined) {
        updateFields.push(`allergen_info = $${updateFields.length + 1}`);
        updateValues.push(allergen_info);
    }
    if (presentation_instructions !== undefined) {
        updateFields.push(`presentation_instructions = $${updateFields.length + 1}`);
        updateValues.push(presentation_instructions);
    }
    if (equipment_needed !== undefined) {
        updateFields.push(`equipment_needed = $${updateFields.length + 1}`);
        updateValues.push(equipment_needed);
    }
    if (side_order !== undefined) {
        updateFields.push(`side_order = $${updateFields.length + 1}`);
        updateValues.push(side_order);
    }
    if (image !== undefined) {
        updateFields.push(`image = $${updateFields.length + 1}`);
        updateValues.push(image);
    }
    if (preparation_instructions !== undefined) {
        updateFields.push(`preparation_instructions = $${updateFields.length + 1}`);
        updateValues.push(preparation_instructions);
    }
    if (serving_details !== undefined) {
        updateFields.push(`serving_details = $${updateFields.length + 1}`);
        updateValues.push(serving_details);
    }
    if (signature !== undefined) {
        updateFields.push(`signature = $${updateFields.length + 1}`);
        updateValues.push(signature);
    }

    // If no fields are provided to update, return an error
    if (updateFields.length === 0) {
        return responseSender(res, 422, false, "No fields provided to update");
    }

    // Complete the query
    query += updateFields.join(', ') + ` WHERE id = $${updateFields.length + 1} RETURNING *`;

    // Add recipe_id to values array
    updateValues.push(recipe_id);

    try {
        // Execute the update query for the recipe
        const result = await pool.query(query, updateValues);

        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Recipe not found");
        }

        // Update the associated items if provided
        if (items && items.length > 0) {
            // Remove existing items from the recipe
            await pool.query('DELETE FROM recipe_items WHERE recipe_id = $1', [recipe_id]);

            // Insert new items into the recipe_items table
            for (const item of items) {
                const { item_id, quantity } = item;

                // Fetch the complete item details from the item table
                const itemResult = await pool.query('SELECT * FROM item WHERE id = $1', [item_id]);

                if (itemResult.rows.length === 0) {
                    return responseSender(res, 404, false, "Item not found");
                }

                const itemDetails = itemResult.rows[0];
                const { usage_unit } = itemDetails;

                // Check if the usage_unit is a UUID (for units table lookup) or a direct string value
                const isUUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[4|5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(usage_unit);
                let measuring_unit;

                if (isUUID) {
                    // Fetch the unit name from the units table if usage_unit is a UUID
                    const unitResult = await pool.query('SELECT unit FROM units WHERE id = $1', [usage_unit]);

                    if (unitResult.rows.length === 0) {
                        return responseSender(res, 404, false, "Unit not found for the selected item");
                    }

                    measuring_unit = unitResult.rows[0].unit; // Use the unit name from the units table
                } else {
                    // If usage_unit is not a UUID, use the stored data directly
                    measuring_unit = usage_unit;
                }

                // Insert the item, quantity, and measuring unit into the recipe_items table
                await pool.query(
                    `INSERT INTO recipe_items (recipe_id, item_id, quantity, measuring_unit) VALUES ($1, $2, $3, $4)`,
                    [recipe_id, item_id, quantity, measuring_unit]
                );
            }
        }

        // Return the updated recipe with all associated items
        const updatedRecipeResult = await pool.query(
            `SELECT r.*, ri.item_id, ri.quantity, ri.measuring_unit, i.name as item_name, i.image as item_image, i.description 
            FROM recipes r 
            LEFT JOIN recipe_items ri ON r.id = ri.recipe_id 
            LEFT JOIN item i ON ri.item_id = i.id 
            WHERE r.id = $1`,
            [recipe_id]
        );

        const updatedRecipe = updatedRecipeResult.rows.map(row => ({
            id: row.id,
            recipe_name: row.recipe_name,
            category: row.category,
            difficulty_level: row.difficulty_level,
            price: row.price,
            cooking_time: row.cooking_time,
            nutritional_info: row.nutritional_info,
            allergen_info: row.allergen_info,
            presentation_instructions: row.presentation_instructions,
            equipment_needed: row.equipment_needed,
            side_order: row.side_order,
            image: row.image,
            preparation_instructions: row.preparation_instructions,
            serving_details: row.serving_details,
            signature: row.signature,
            items: row.item_id ? [{
                item_id: row.item_id,
                name: row.item_name,
                description: row.description,
                quantity: row.quantity,
                measuring_unit: row.measuring_unit,
                image: row.item_image
            }] : []
        }));

        return responseSender(res, 200, true, "Recipe updated successfully", updatedRecipe[0]);
    } catch (error) {
        next(error);
    }
};

const deleteRecipe = async (req, res, next) => {
    const recipeId = req.query.id;

    if (!recipeId) {
        return responseSender(res, 400, false, "Recipe ID is required");
    }

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