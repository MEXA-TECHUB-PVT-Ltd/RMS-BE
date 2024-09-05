const pool = require("../../config/db");
const { v4: uuidv4 } = require('uuid');
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const purchaseOrder = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;

    try {
        // Fetch records with status 'ACCEPTED'
        const { rows: requisitions } = await pool.query(
            `SELECT id, pr_number FROM purchase_requisition WHERE status = 'ACCEPTED'`
        );

        // Check for records whose status changed from 'ACCEPTED'
        const { rows: changedRequisitions } = await pool.query(
            `SELECT po.purchase_requisition_id
            FROM purchase_order po                  
            JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
            WHERE pr.status != 'ACCEPTED'`
        );

        // Delete records from purchase_order if their status changed from 'ACCEPTED'
        for (const requisition of changedRequisitions) {
            await pool.query(
                `DELETE FROM purchase_order WHERE purchase_requisition_id = $1`,
                [requisition.purchase_requisition_id]
            );
        }

        if (requisitions.length === 0) {
            // If no new accepted purchase requisitions are found, fetch previous purchase orders
            const totalCountResult = await pool.query(`SELECT COUNT(*) FROM purchase_order`);
            const totalItems = parseInt(totalCountResult.rows[0].count);

            const offset = (currentPage - 1) * perPage;

            const { rows: previousOrders } = await pool.query(
                `SELECT po.*, pr.*
                FROM purchase_order po
                JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
                LIMIT $1 OFFSET $2`,
                [perPage, offset]
            );

            if (previousOrders.length === 0) {
                return responseSender(res, 422, false, "No Purchase order found");
            } else {
                const paginationInfo = pagination(totalItems, perPage, currentPage);

                // Fetch purchase items for each order
                for (const order of previousOrders) {
                    const { rows: purchaseItems } = await pool.query(
                        `SELECT * FROM purchase_items WHERE id = ANY($1::uuid[])`,
                        [order.purchase_item_ids]
                    );

                    // Fetch vendor details for each purchase item
                    for (const item of purchaseItems) {
                        const { rows: vendors } = await pool.query(
                            `SELECT * FROM vendor WHERE id = ANY($1::uuid[])`,
                            [item.preferred_vendor_ids]
                        );
                        item.preferred_vendors = vendors;
                    }

                    order.purchase_items = purchaseItems;
                }

                // Store preferred vendors
                await storePreferredVendors(previousOrders);

                return responseSender(res, 200, true, "Purchase orders fetched", { count: totalItems, orders: previousOrders });
            }
        }

        // Insert records into purchase_order table
        let newOrderCreated = false;
        const insertedPurchaseOrderIds = [];
        for (const requisition of requisitions) {
            const purchaseOrderId = uuidv4(); // Ensure unique ID for purchase order
            const purchaseOrderNumber = `PO-${Date.now()}`;

            // Check if the purchase_requisition_id already exists in purchase_order table
            const { rowCount } = await pool.query(
                `SELECT 1 FROM purchase_order WHERE purchase_requisition_id = $1`,
                [requisition.id]
            );

            if (rowCount === 0) {
                await pool.query(
                    `INSERT INTO purchase_order (id, purchase_order_number, purchase_requisition_id)
                    VALUES ($1, $2, $3)`,
                    [purchaseOrderId, purchaseOrderNumber, requisition.id]
                );
                newOrderCreated = true;
                insertedPurchaseOrderIds.push(purchaseOrderId);
            }
        }

        // Fetch all purchase orders created so far
        const totalCountResult = await pool.query(`SELECT COUNT(*) FROM purchase_order`);
        const totalItems = parseInt(totalCountResult.rows[0].count);

        const offset = (currentPage - 1) * perPage;

        const { rows: allOrders } = await pool.query(
            `SELECT po.id as purchase_order_id, po.purchase_order_number, po.purchase_requisition_id, po.created_at, po.updated_at, pr.*
            FROM purchase_order po
            JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
            LIMIT $1 OFFSET $2`,
            [perPage, offset]
        );

        // Fetch purchase items for each order
        for (const order of allOrders) {
            const { rows: purchaseItems } = await pool.query(
                `SELECT * FROM purchase_items WHERE id = ANY($1::uuid[])`,
                [order.purchase_item_ids]
            );

            // Fetch vendor details for each purchase item
            for (const item of purchaseItems) {
                const { rows: vendors } = await pool.query(
                    `SELECT * FROM vendor WHERE id = ANY($1::uuid[])`,
                    [item.preffered_vendor_ids] // Typo corrected from preffered_vendor_ids to preferred_vendor_ids
                );
                item.preferred_vendors = vendors;
            }

            order.purchase_items = purchaseItems;
        }

        // Store preferred vendors
        await storePreferredVendors(allOrders);

        const paginationInfo = pagination(totalItems, perPage, currentPage);

        return responseSender(res, 200, true, "Purchase orders fetched", { count: totalItems, orders: allOrders });

    } catch (error) {
        next(error);
    }
};

// Function to store preferred vendors
const storePreferredVendors = async (orders) => {
    try {
        for (const order of orders) {
            for (const item of order.purchase_items) {
                for (const vendor of item.preferred_vendors) {
                    await pool.query(
                        `INSERT INTO purchase_order_preferred_vendors (purchase_order_id, purchase_item_id, vendor_id)
                        VALUES ($1, $2, $3)
                        ON CONFLICT (purchase_order_id, purchase_item_id, vendor_id) DO NOTHING`,
                        [order.purchase_order_id, item.id, vendor.id]
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error storing preferred vendors:', error);
        throw error; // Re-throw the error to be caught by the main function
    }
};

const updateVendorPOSendingStatus = async (req, res, next) => {
    const purchaseOrderId = req.query.purchase_order_id;
    const { vendorIds } = req.body;

    if (!purchaseOrderId) {
        return responseSender(res, 422, false, "Provide purchase order ID");
    }

    if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0) {
        return responseSender(res, 422, false, "Invalid input. Please provide a non-empty array of vendor IDs.");
    }

    try {
        // Check if purchase order exists
        const purchaseOrderResult = await pool.query('SELECT 1 FROM purchase_order_preferred_vendors WHERE purchase_order_id = $1', [purchaseOrderId]);
        if (purchaseOrderResult.rowCount === 0) {
            return responseSender(res, 422, false, "Purchase order not found.");
        }

        // Check if all vendor IDs exist
        const vendorResult = await pool.query('SELECT id FROM vendor WHERE id = ANY($1::uuid[])', [vendorIds]);
        const foundVendorIds = vendorResult.rows.map(row => row.id);
        const missingVendorIds = vendorIds.filter(id => !foundVendorIds.includes(id));

        if (missingVendorIds.length > 0) {
            return responseSender(res, 422, false, `Vendors not found for the following IDs: ${missingVendorIds.join(', ')}`);
        }

        // Update po_sending_status
        const updateQuery = `
            UPDATE vendor
            SET po_sending_status = true
            WHERE id = ANY($1::uuid[])
            AND id IN (
                SELECT vendor_id FROM purchase_order_preferred_vendors
                WHERE purchase_order_id = $2
            )
        `;
        await pool.query(updateQuery, [vendorIds, purchaseOrderId]);

        // Update purchase order status to 'ISSUED'
        const updatePOStatusQuery = `
            UPDATE purchase_order
            SET status = 'ISSUED'
            WHERE id = $1
        `;
        await pool.query(updatePOStatusQuery, [purchaseOrderId]);

        return responseSender(res, 200, true, "Purchase order sent to the vendor.");
    } catch (error) {
        next(error);
    }
};

const purchaseOrderv2 = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;
    const searchQuery = req.query.purchase_order_number || ''; // Get the search query from the request

    try {
        let totalCountResult, allOrdersQuery, allOrdersParams;

        if (searchQuery) {
            // If there is a search query, count the filtered results
            totalCountResult = await pool.query(
                `SELECT COUNT(*) FROM purchase_order WHERE purchase_order_number ILIKE $1`,
                [`%${searchQuery}%`]
            );

            // Prepare the query with the search filter
            allOrdersQuery = `
                SELECT po.id as purchase_order_id, po.purchase_order_number, po.purchase_requisition_id, po.created_at, po.updated_at, po.status,
                        pr.pr_number, pr.pr_detail, pr.priority, pr.requested_by, pr.requested_date, pr.required_date, pr.shipment_preferences,
                        pr.document, pr.delivery_address, pr.purchase_item_ids, pr.total_amount
                FROM purchase_order po
                JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
                WHERE po.purchase_order_number ILIKE $1
                ORDER BY po.created_at DESC
                LIMIT $2 OFFSET $3
            `;
            allOrdersParams = [`%${searchQuery}%`, perPage, (currentPage - 1) * perPage];
        } else {
            // If no search query, count all results
            totalCountResult = await pool.query(`SELECT COUNT(*) FROM purchase_order`);

            // Prepare the query without the search filter
            allOrdersQuery = `
                SELECT po.id as purchase_order_id, po.purchase_order_number, po.purchase_requisition_id, po.created_at, po.updated_at, po.status,
                        pr.pr_number, pr.pr_detail, pr.priority, pr.requested_by, pr.requested_date, pr.required_date, pr.shipment_preferences,
                        pr.document, pr.delivery_address, pr.purchase_item_ids, pr.total_amount
                FROM purchase_order po
                JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
                ORDER BY po.created_at DESC
                LIMIT $1 OFFSET $2
            `;
            allOrdersParams = [perPage, (currentPage - 1) * perPage];
        }

        const totalItems = parseInt(totalCountResult.rows[0].count);

        // Fetch purchase orders with related purchase requisition details
        const { rows: allOrders } = await pool.query(allOrdersQuery, allOrdersParams);

        // Collect all purchase item IDs and preferred vendor IDs
        const itemIds = [];
        const vendorIds = new Set();

        for (const order of allOrders) {
            itemIds.push(...order.purchase_item_ids);
        }

        // Fetch purchase items
        const { rows: purchaseItems } = await pool.query(
            `SELECT * FROM purchase_items WHERE id = ANY($1::uuid[])`,
            [itemIds]
        );

        // Collect vendor IDs for each item and prepare vendor details map
        const itemsWithVendors = [];
        const vendorDetailsMap = new Map();

        for (const item of purchaseItems) {
            const preferredVendorIds = item.preffered_vendor_ids || [];
            const vendors = [];

            for (const vendorId of preferredVendorIds) {
                vendorIds.add(vendorId);

                // Retrieve vendor details if not already fetched
                if (!vendorDetailsMap.has(vendorId)) {
                    const { rows: vendorDetails } = await pool.query(
                        `SELECT * FROM vendor WHERE id = $1`,
                        [vendorId]
                    );
                    vendorDetailsMap.set(vendorId, vendorDetails[0]);
                }

                vendors.push(vendorDetailsMap.get(vendorId));
            }

            itemsWithVendors.push({
                ...item,
                preferred_vendors: vendors
            });
        }

        // Add purchase items with vendor details to each order
        for (const order of allOrders) {
            const itemsForOrder = itemsWithVendors.filter(item => order.purchase_item_ids.includes(item.id));
            order.purchase_items = itemsForOrder;
        }

        // Convert vendor IDs set to an array and add it to each order
        const vendorIdsArray = Array.from(vendorIds);

        for (const order of allOrders) {
            order.vendors_ids = vendorIdsArray;
        }

        // Prepare pagination information
        const paginationInfo = {
            totalItems,
            perPage,
            currentPage,
            totalPages: Math.ceil(totalItems / perPage),
        };

        // Send response with pagination info
        return responseSender(res, 200, true, "Purchase orders fetched", {
            count: totalItems,
            orders: allOrders,
            pagination: paginationInfo
        });

    } catch (error) {
        next(error);
    }
};

const getPurchaseOrderDetails = async (req, res, next) => {
    const { purchase_order_id } = req.query;

    if (!purchase_order_id) {
        return responseSender(res, 404, false, `Purchase order ID is required.`);
    }

    try {
        const { rows: purchaseOrderRows } = await pool.query(
            `SELECT po.id as purchase_order_id, po.purchase_order_number, po.purchase_requisition_id, po.created_at, po.updated_at, po.status,
                pr.pr_number, pr.pr_detail, pr.priority, pr.requested_by, pr.requested_date, pr.required_date, pr.shipment_preferences,
                pr.document, pr.delivery_address, pr.purchase_item_ids, pr.total_amount
            FROM purchase_order po
            JOIN purchase_requisition pr ON po.purchase_requisition_id = pr.id
            WHERE po.id = $1`,
            [purchase_order_id]
        );

        if (purchaseOrderRows.length === 0) {
            return responseSender(res, 404, false, 'Purchase order not found.');
        }

        const purchaseOrder = purchaseOrderRows[0];

        const { rows: purchaseItems } = await pool.query(
            `SELECT * FROM purchase_items WHERE id = ANY($1::uuid[])`,
            [purchaseOrder.purchase_item_ids]
        );

        for (const item of purchaseItems) {
            // Fetch item details including category name
            const { rows: itemDetails } = await pool.query(
                `SELECT i.id, i.name, i.type, i.image, c.category_name 
                 FROM item i
                 LEFT JOIN category c ON i.product_category = c.id
                 WHERE i.id = $1`,
                [item.item_id]
            );

            if (itemDetails.length > 0) {
                item.item_details = itemDetails[0];
            } else {
                item.item_details = null;
            }

            // Fetch preferred vendors
            const preferredVendorIds = item.preffered_vendor_ids;

            if (preferredVendorIds.length > 0) {
                const { rows: vendors } = await pool.query(
                    `SELECT * FROM vendor WHERE id = ANY($1::uuid[])`,
                    [preferredVendorIds]
                );
                item.preferred_vendors = vendors;
            } else {
                item.preferred_vendors = [];
            }
        }

        purchaseOrder.purchase_items = purchaseItems;

        return responseSender(res, 200, true, "Purchase order details fetched", { result: purchaseOrder });

    } catch (error) {
        console.error('Error fetching purchase order details', error.stack);
        next(error);
    }
};

const deletePurchaseOrder = async (req, res, next) => {
    const { purchase_order_id } = req.query;

    if (!purchase_order_id) {
        return responseSender(res, 404, false, "Purchase order ID is required.");
    }

    try {
        // Start transaction
        await pool.query('BEGIN');

        // Fetch purchase requisition ID and status from the purchase order
        const { rows: purchaseOrderRows } = await pool.query(
            `SELECT purchase_requisition_id, status FROM purchase_order WHERE id = $1`,
            [purchase_order_id]
        );

        if (purchaseOrderRows.length === 0) {
            await pool.query('ROLLBACK');
            return responseSender(res, 404, false, 'Purchase order not found.');
        }

        const { purchase_requisition_id, status } = purchaseOrderRows[0];

        // Check if the status is 'DRAFT'
        if (status !== 'DRAFT') {
            await pool.query('ROLLBACK');
            return responseSender(res, 400, false, 'Only purchase orders with status DRAFT can be deleted.');
        }

        // Delete the purchase order
        await pool.query(
            `DELETE FROM purchase_order WHERE id = $1`,
            [purchase_order_id]
        );

        // Update the status of the purchase requisition to 'REJECTED'
        await pool.query(
            `UPDATE purchase_requisition SET status = 'REJECTED' WHERE id = $1`,
            [purchase_requisition_id]
        );

        // Commit transaction
        await pool.query('COMMIT');

        return responseSender(res, 200, true, "Purchase order deleted successfully");

    } catch (error) {
        // Rollback transaction in case of error
        await pool.query('ROLLBACK');
        console.error('Error deleting purchase order', error.stack);
        next(error);
    }
};

const cancelPurchaseOrder = async (req, res, next) => {
    const { purchase_order_id } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Check if the purchase_order_id exists in the purchase_order table
        const checkPurchaseOrderQuery = `
            SELECT id, status FROM purchase_order WHERE id = $1;
        `;
        const checkPurchaseOrderResult = await client.query(checkPurchaseOrderQuery, [purchase_order_id]);

        if (checkPurchaseOrderResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return responseSender(res, 422, false, "Invalid purchase_order_id. The purchase order does not exist.");
        }

        const purchaseOrder = checkPurchaseOrderResult.rows[0];

        // Check if the purchase order is already fully delivered or cancelled
        if (purchaseOrder.status === 'FULLY DELIVERED') {
            await client.query('ROLLBACK');
            return responseSender(res, 422, false, "Purchase order is already fully delivered, cannot be cancelled.");
        }

        if (purchaseOrder.status === 'CANCELLED') {
            await client.query('ROLLBACK');
            return responseSender(res, 422, false, "Purchase order is already cancelled.");
        }

        // Check if any associated items have required_quantity greater than 0
        const checkRemainingItemsQuery = `
            SELECT pi.id, pi.required_quantity
            FROM purchase_items pi
            JOIN purchase_order_preferred_vendors popv ON pi.id = popv.purchase_item_id
            WHERE popv.purchase_order_id = $1
            AND pi.required_quantity > 0;
        `;
        const checkRemainingItemsResult = await client.query(checkRemainingItemsQuery, [purchase_order_id]);

        if (checkRemainingItemsResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return responseSender(res, 422, false, "No items with remaining quantity found for the purchase order.");
        }

        // Update the purchase_order status to 'CANCELLED'
        const updateStatusQuery = `
            UPDATE purchase_order
            SET status = $1
            WHERE id = $2;
        `;
        await client.query(updateStatusQuery, ['CANCELLED', purchase_order_id]);

        // Set required_quantity to 0 for all associated items
        const updateItemsQuery = `
            UPDATE purchase_items pi
            SET required_quantity = 0
            FROM purchase_order_preferred_vendors popv
            WHERE pi.id = popv.purchase_item_id
            AND popv.purchase_order_id = $1;
        `;
        await client.query(updateItemsQuery, [purchase_order_id]);

        await client.query('COMMIT');
        client.release();

        return responseSender(res, 200, true, "Purchase order cancelled successfully");
    } catch (error) {
        await client.query('ROLLBACK');
        client.release();
        console.error('Error canceling purchase order:', error); // Log the error for debugging
        next(error);
    }
};


module.exports = {
    purchaseOrder,
    updateVendorPOSendingStatus,
    purchaseOrderv2,
    getPurchaseOrderDetails,
    deletePurchaseOrder,
    cancelPurchaseOrder
};
