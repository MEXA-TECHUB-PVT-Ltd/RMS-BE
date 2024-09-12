const pool = require("../../config/db");
const { v4: uuidv4 } = require('uuid');
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const generatePurchaseReceivedNumber = () => {
  const timestamp = Date.now(); // Get current timestamp in milliseconds
  return `PR-${timestamp}-${Math.floor(Math.random() * 10000)}`;
};

const purchaseReceives = async (req, res, next) => {
  const { purchase_order_id, vendor_ids, items, received_date, description } = req.body;

  try {
    const client = await pool.connect();

    // Check if the purchase_order_id exists and its status
    const checkPurchaseOrderQuery = 'SELECT id, status FROM purchase_order WHERE id = $1';
    const checkPurchaseOrderResult = await client.query(checkPurchaseOrderQuery, [purchase_order_id]);

    if (checkPurchaseOrderResult.rowCount === 0) {
      client.release();
      return responseSender(res, 422, false, "Invalid purchase_order_id. The purchase order does not exist.");
    }

    const purchaseOrderStatus = checkPurchaseOrderResult.rows[0].status;

    // If the purchase order is fully delivered, prevent creating a new purchase receive
    if (purchaseOrderStatus === 'FULLY DELIVERED') {
      client.release();
      return responseSender(res, 422, false, "Cannot create a purchase receive. The purchase order has already been fully delivered.");
    }

    // Generate a unique purchase_received_number
    const purchase_received_number = generatePurchaseReceivedNumber();

    // Insert the general purchase receive record
    const insertReceiveQuery = `
      INSERT INTO purchase_receives 
      (purchase_order_id, purchase_received_number, received_date, description)
      VALUES ($1, $2, $3, $4)
      RETURNING id, purchase_received_number
    `;
    const result = await client.query(insertReceiveQuery, [purchase_order_id, purchase_received_number, received_date, description]);
    const purchaseReceiveId = result.rows[0].id;
    const receivedNumber = result.rows[0].purchase_received_number;

    const insertedItems = [];
    let hasRemainingItems = false;

    for (const item of items) {
      const { item_id, quantity_received, rate } = item;

      // Check if the item_id exists
      const checkItemQuery = `
        SELECT id, required_quantity, available_stock
        FROM purchase_items
        WHERE id = $1
      `;
      const checkItemResult = await client.query(checkItemQuery, [item_id]);

      if (checkItemResult.rowCount === 0) {
        client.release();
        return responseSender(res, 422, false, `Invalid item_id ${item_id}. This item does not exist in the purchase_items table.`);
      }

      const purchaseItem = checkItemResult.rows[0];
      const { required_quantity, available_stock } = purchaseItem;
      const total_quantity = required_quantity;
      const remaining_quantity = total_quantity - quantity_received;

      if (quantity_received > required_quantity) {
        client.release();
        return responseSender(res, 422, false, `Received quantity cannot be greater than required quantity ${required_quantity} for item ${item_id}.`);
      }

      for (const vendor_id of vendor_ids) {
        // Check if the vendor_id exists
        const checkVendorQuery = `
          SELECT id FROM purchase_order_preferred_vendors
          WHERE purchase_order_id = $1 AND vendor_id = $2
        `;
        const checkVendorResult = await client.query(checkVendorQuery, [purchase_order_id, vendor_id]);

        if (checkVendorResult.rowCount === 0) {
          client.release();
          return responseSender(res, 422, false, `Invalid vendor_id ${vendor_id} for the provided purchase_order_id.`);
        }

        // Insert item-specific record into purchase_receive_items
        const insertItemQuery = `
          INSERT INTO purchase_receive_items 
          (purchase_receive_id, vendor_id, item_id, total_quantity, quantity_received, rate, remaining_quantity)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING *
        `;
        const itemResult = await client.query(insertItemQuery, [
          purchaseReceiveId,
          vendor_id,
          item_id,
          total_quantity,
          quantity_received,
          rate,
          remaining_quantity
        ]);

        // Update the purchase_items table
        const updateItemQuery = `
          UPDATE purchase_items
          SET available_stock = available_stock + $1,
              required_quantity = $2
          WHERE id = $3
          RETURNING required_quantity  -- Add RETURNING clause to fetch the updated required_quantity
        `;
        const updateItemResult = await client.query(updateItemQuery, [
          quantity_received,
          remaining_quantity,
          item_id
        ]);

        const updatedRequiredQuantity = updateItemResult.rows[0].required_quantity;

        // Add the updated required_quantity to the item result
        insertedItems.push({
          ...itemResult.rows[0],
          remaining_quantity: updatedRequiredQuantity
        });
      }

      if (remaining_quantity > 0) {
        hasRemainingItems = true;
      }
    }

    // Update the purchase_order status
    const updateStatusQuery = `
      UPDATE purchase_order
      SET status = $1
      WHERE id = $2
    `;
    const newStatus = hasRemainingItems ? 'PARTIALLY RECEIVED' : 'FULLY DELIVERED';
    await client.query(updateStatusQuery, [newStatus, purchase_order_id]);

    client.release();

    return responseSender(res, 200, true, "Purchase receive created successfully", {
      purchase_received_number: receivedNumber,
      items: insertedItems
    });
  } catch (error) {
    next(error);
  }
};

const updatePurchaseReceive = async (req, res, next) => {
  const { purchase_receive_id, vendor_ids, items, received_date, description } = req.body;

  try {
    const client = await pool.connect();

    // Check if the purchase_receive_id exists
    const checkReceiveQuery = `
      SELECT id, purchase_order_id FROM purchase_receives WHERE id = $1
    `;
    const checkReceiveResult = await client.query(checkReceiveQuery, [purchase_receive_id]);

    if (checkReceiveResult.rowCount === 0) {
      client.release();
      return responseSender(res, 422, false, "Invalid purchase_receive_id. The purchase receive does not exist.");
    }

    const purchaseOrderID = checkReceiveResult.rows[0].purchase_order_id;

    // Update the general purchase receive record
    const updateReceiveQuery = `
      UPDATE purchase_receives 
      SET received_date = $1, description = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING id, purchase_order_id
    `;
    const result = await client.query(updateReceiveQuery, [received_date, description, purchase_receive_id]);

    const insertedItems = [];
    let hasRemainingItems = false;

    for (const item of items) {
      const { item_id, quantity_received, rate } = item;

      // Check if the item_id exists
      const checkItemQuery = `
        SELECT id, required_quantity, available_stock
        FROM purchase_items
        WHERE id = $1
      `;
      const checkItemResult = await client.query(checkItemQuery, [item_id]);

      if (checkItemResult.rowCount === 0) {
        client.release();
        return responseSender(res, 422, false, `Invalid item_id ${item_id}. This item does not exist in the purchase_items table.`);
      }

      const purchaseItem = checkItemResult.rows[0];
      const { required_quantity, available_stock } = purchaseItem;
      const total_quantity = required_quantity;
      const remaining_quantity = total_quantity - quantity_received;

      if (quantity_received > required_quantity) {
        client.release();
        return responseSender(res, 422, false, `Received quantity cannot be greater than required quantity ${required_quantity} for item ${item_id}.`);
      }

      for (const vendor_id of vendor_ids) {
        // Check if the vendor_id exists
        const checkVendorQuery = `
          SELECT id FROM purchase_order_preferred_vendors
          WHERE purchase_order_id = $1 AND vendor_id = $2
        `;
        const checkVendorResult = await client.query(checkVendorQuery, [purchaseOrderID, vendor_id]);

        if (checkVendorResult.rowCount === 0) {
          client.release();
          return responseSender(res, 422, false, `Invalid vendor_id ${vendor_id} for the provided purchase_order_id.`);
        }

        // Update item-specific record in purchase_receive_items
        const updateItemQuery = `
          UPDATE purchase_receive_items
          SET quantity_received = $1, rate = $2, remaining_quantity = $3, updated_at = NOW()
          WHERE purchase_receive_id = $4 AND vendor_id = $5 AND item_id = $6
          RETURNING *
        `;
        const itemResult = await client.query(updateItemQuery, [
          quantity_received,
          rate,
          remaining_quantity,
          purchase_receive_id,
          vendor_id,
          item_id
        ]);

        // If the record doesn't exist, insert it
        if (itemResult.rowCount === 0) {
          const insertItemQuery = `
            INSERT INTO purchase_receive_items 
            (purchase_receive_id, vendor_id, item_id, total_quantity, quantity_received, rate, remaining_quantity)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
          `;
          const newItemResult = await client.query(insertItemQuery, [
            purchase_receive_id,
            vendor_id,
            item_id,
            total_quantity,
            quantity_received,
            rate,
            remaining_quantity
          ]);

          insertedItems.push(newItemResult.rows[0]);
        } else {
          insertedItems.push(itemResult.rows[0]);
        }

        // Update the purchase_items table
        const updatePurchaseItemQuery = `
          UPDATE purchase_items
          SET available_stock = available_stock + $1,
              required_quantity = $2,
              updated_at = NOW()
          WHERE id = $3
          RETURNING required_quantity
        `;
        const updateItemResult = await client.query(updatePurchaseItemQuery, [
          quantity_received,
          remaining_quantity,
          item_id
        ]);

        const updatedRequiredQuantity = updateItemResult.rows[0].required_quantity;

        // Add the updated required_quantity to the item result
        insertedItems[insertedItems.length - 1].remaining_quantity = updatedRequiredQuantity;
      }

      if (remaining_quantity > 0) {
        hasRemainingItems = true;
      }
    }

    // Update the purchase_order status
    const updateStatusQuery = `
      UPDATE purchase_order
      SET status = $1, updated_at = NOW()
      WHERE id = $2
    `;
    const newStatus = hasRemainingItems ? 'PARTIALLY RECEIVED' : 'FULLY DELIVERED';
    await client.query(updateStatusQuery, [newStatus, purchaseOrderID]);

    client.release();

    return responseSender(res, 200, true, "Purchase receive updated successfully", {
      purchase_receive_id,
      items: insertedItems
    });
  } catch (error) {
    next(error);
  }
};

// const purchaseReceives = async (req, res, next) => {
//   const { purchase_order_id, item_ids, items, received_date, description } = req.body;

//   try {
//     const client = await pool.connect();

//     // Check if the purchase_order_id exists in the purchase_order table
//     const checkPurchaseOrderQuery = `
//       SELECT id FROM purchase_order WHERE id = $1;
//     `;
//     const checkPurchaseOrderResult = await pool.query(checkPurchaseOrderQuery, [purchase_order_id]);

//     if (checkPurchaseOrderResult.rowCount === 0) {
//       return responseSender(res, 422, false, "Invalid purchase_order_id. The purchase order does not exist.");
//     }

//     const insertedItems = [];
//     let hasRemainingItems = false;

//     // Loop over item_ids
//     for (let i = 0; i < item_ids.length; i++) {
//       const item_id = item_ids[i];
//       const { vendor_ids, quantity_received, rate } = items[i];

//       // Check if the item_id exists in the purchase_items table and get required_quantity
//       const checkItemQuery = `
//         SELECT id, required_quantity, available_stock
//         FROM purchase_items
//         WHERE id = $1;
//       `;
//       const checkItemResult = await pool.query(checkItemQuery, [item_id]);

//       if (checkItemResult.rowCount === 0) {
//         return responseSender(res, 422, false, `Invalid item_id ${item_id}. This item does not exist in the purchase_items table.`);
//       }

//       const purchaseItem = checkItemResult.rows[0];
//       const { required_quantity, available_stock } = purchaseItem;
//       const total_quantity = required_quantity;
//       const remaining_quantity = total_quantity - quantity_received;

//       // Validate quantity_received against required_quantity
//       if (quantity_received > required_quantity) {
//         return responseSender(res, 422, false, `Received quantity cannot be greater than required quantity ${required_quantity} for item ${item_id}.`);
//       }

//       // Loop over vendor_ids
//       for (const vendor_id of vendor_ids) {
//         // Generate a unique purchase_received_number for each record
//         const purchase_received_number = generatePurchaseReceivedNumber();

//         // Check if the vendor_id exists in the purchase_order_preferred_vendors table for the provided purchase_order_id
//         const checkVendorQuery = `
//           SELECT id FROM purchase_order_preferred_vendors
//           WHERE purchase_order_id = $1 AND vendor_id = $2;
//         `;
//         const checkVendorResult = await pool.query(checkVendorQuery, [purchase_order_id, vendor_id]);

//         if (checkVendorResult.rowCount === 0) {
//           return responseSender(res, 422, false, `Invalid vendor_id ${vendor_id} for the provided purchase_order_id. This vendor does not exist for the given purchase order.`);
//         }

//         // Proceed to insert the purchase_receives record for each vendor
//         const insertQuery = `
//           INSERT INTO purchase_receives 
//           (purchase_order_id, purchase_received_number, vendor_id, item_id, total_quantity, quantity_received, rate, received_date, description)
//           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
//           RETURNING *;
//         `;

//         const result = await pool.query(insertQuery, [
//           purchase_order_id,
//           purchase_received_number,
//           vendor_id,
//           item_id,
//           total_quantity,
//           quantity_received,
//           rate,
//           received_date,
//           description
//         ]);

//         const newItem = result.rows[0];
//         insertedItems.push(newItem);
//       }

//       if (remaining_quantity > 0) {
//         hasRemainingItems = true;
//       }

//       // Update the purchase_items table
//       const updateItemQuery = `
//         UPDATE purchase_items
//         SET available_stock = available_stock + $1,
//             required_quantity = $2
//         WHERE id = $3;
//       `;
//       await pool.query(updateItemQuery, [
//         quantity_received,
//         remaining_quantity,
//         item_id
//       ]);
//     }

//     // Update the purchase_order status based on remaining quantities
//     const updateStatusQuery = `
//       UPDATE purchase_order
//       SET status = $1
//       WHERE id = $2;
//     `;
//     const newStatus = hasRemainingItems ? 'PARTIALLY RECEIVED' : 'FULLY DELIVERED';
//     await pool.query(updateStatusQuery, [newStatus, purchase_order_id]);

//     return responseSender(res, 200, true, "Purchase receive created successfully", { items: insertedItems });
//   } catch (error) {
//     next(error);
//   }
// };

const cancelPurchaseOrder = async (req, res, next) => {
  const { purchase_order_id, purchase_item_ids } = req.body;

  try {
    const client = await pool.connect();

    // Check if the purchase_order_id exists in the purchase_order table
    const checkPurchaseOrderQuery = `
      SELECT id, status FROM purchase_order WHERE id = $1;
    `;
    const checkPurchaseOrderResult = await client.query(checkPurchaseOrderQuery, [purchase_order_id]);

    if (checkPurchaseOrderResult.rowCount === 0) {
      client.release();
      return responseSender(res, 422, false, "Invalid purchase_order_id. The purchase order does not exist.");
    }

    const purchaseOrder = checkPurchaseOrderResult.rows[0];

    // Check if the purchase order is already fully delivered or cancelled
    if (purchaseOrder.status === 'FULLY DELIVERED') {
      client.release();
      return responseSender(res, 422, false, "Purchase order is already fully delivered, cannot be cancelled.");
    }

    if (purchaseOrder.status === 'CANCELLED') {
      client.release();
      return responseSender(res, 422, false, "Purchase order is already cancelled.");
    }

    // Update the purchase_order status to 'CANCELLED'
    const updateStatusQuery = `
      UPDATE purchase_order
      SET status = $1
      WHERE id = $2;
    `;
    await client.query(updateStatusQuery, ['CANCELLED', purchase_order_id]);

    if (purchase_item_ids && purchase_item_ids.length > 0) {
      const checkItemsQuery = `
      SELECT pi.id, pi.required_quantity, COALESCE(SUM(pri.quantity_received), 0) AS total_received
      FROM purchase_items pi
      LEFT JOIN purchase_receive_items pri ON pi.id = pri.item_id
      LEFT JOIN purchase_receives pr ON pri.purchase_receive_id = pr.id
      WHERE pr.purchase_order_id = $1 AND pi.id = ANY($2::UUID[])
      GROUP BY pi.id;
  `;
      const checkItemsResult = await client.query(checkItemsQuery, [purchase_order_id, purchase_item_ids]);

      const itemsToUpdate = checkItemsResult.rows;

      if (itemsToUpdate.length === 0) {
        client.release();
        return responseSender(res, 422, false, "No valid items found for cancellation with provided purchase_item_ids.");
      }

      // Update remaining quantities for specific purchase_item_ids to zero
      const updateItemsPromises = itemsToUpdate.map(async (item) => {
        // Update the purchase_items table to set required_quantity to zero for the specified item
        const updateItemQuery = `
          UPDATE purchase_items
          SET required_quantity = 0
          WHERE id = $1;
        `;
        await client.query(updateItemQuery, [item.id]);
      });

      await Promise.all(updateItemsPromises);
    }

    // Check if any items for the purchase order have remaining quantities greater than zero
    const checkRemainingItemsQuery = `
    SELECT pi.id, pi.required_quantity, COALESCE(SUM(pri.quantity_received), 0) AS total_received
    FROM purchase_items pi
    LEFT JOIN purchase_receive_items pri ON pi.id = pri.item_id
    LEFT JOIN purchase_receives pr ON pri.purchase_receive_id = pr.id
    WHERE pr.purchase_order_id = $1
    GROUP BY pi.id
    HAVING pi.required_quantity > COALESCE(SUM(pri.quantity_received), 0);
`;
    const checkRemainingItemsResult = await client.query(checkRemainingItemsQuery, [purchase_order_id]);


    const remainingItemsCount = checkRemainingItemsResult.rowCount;

    client.release();

    if (remainingItemsCount === 0) {
      return responseSender(res, 422, false, "No items left to cancel for the purchase order.");
    }

    return responseSender(res, 200, true, "Purchase order cancelled successfully");
  } catch (error) {
    next(error);
  }
};

const getPurchaseReceives = async (req, res, next) => {
  const perPage = Number.parseInt(req.query.perPage) || 10;
  const currentPage = Number.parseInt(req.query.currentPage) || 1;
  const offset = (currentPage - 1) * perPage;
  const searchPurchaseReceivedNumber = req.query.purchase_received_number || '';

  try {
    const client = await pool.connect();

    // Construct the base query
    let countQuery = 'SELECT COUNT(*) FROM purchase_receives';
    let purchaseReceivesQuery = `
      SELECT id, purchase_order_id, purchase_received_number, received_date, pr_invoice, description
      FROM purchase_receives
    `;

    // Add search condition if purchase_received_number is provided
    let queryParams = [];
    if (searchPurchaseReceivedNumber) {
      countQuery += ` WHERE purchase_received_number ILIKE $1`;
      purchaseReceivesQuery += ` WHERE purchase_received_number ILIKE $1`;
      queryParams.push(`%${searchPurchaseReceivedNumber}%`);
    }

    // Add ORDER BY, LIMIT, and OFFSET clauses
    purchaseReceivesQuery += ` ORDER BY created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(perPage, offset);

    // Fetch total count for pagination
    const totalCountResult = await client.query(countQuery, queryParams.slice(0, queryParams.length - 2));
    const totalItems = parseInt(totalCountResult.rows[0].count);

    // Fetch purchase receives with pagination
    const purchaseReceivesResult = await client.query(purchaseReceivesQuery, queryParams);
    const purchaseReceives = purchaseReceivesResult.rows;

    // Fetch additional details only if there are results
    if (purchaseReceives.length > 0) {
      const purchaseReceiveIds = purchaseReceives.map(receive => receive.id);

      // Fetch item details for each purchase receive
      const itemsQuery = `
        SELECT *
        FROM purchase_receive_items
        WHERE purchase_receive_id = ANY($1::uuid[])
      `;
      const itemsResult = await client.query(itemsQuery, [purchaseReceiveIds]);
      const itemsByReceiveId = itemsResult.rows.reduce((acc, item) => {
        if (!acc[item.purchase_receive_id]) {
          acc[item.purchase_receive_id] = [];
        }
        acc[item.purchase_receive_id].push(item);
        return acc;
      }, {});

      // Fetch vendor details for each item
      const vendorIds = itemsResult.rows.map(item => item.vendor_id);
      const vendorsQuery = `
        SELECT * FROM vendor
        WHERE id = ANY($1::uuid[])
      `;
      const vendorsResult = await client.query(vendorsQuery, [vendorIds]);
      const vendorsById = vendorsResult.rows.reduce((acc, vendor) => {
        acc[vendor.id] = vendor;
        return acc;
      }, {});

      // Fetch item details for each item
      const itemIds = itemsResult.rows.map(item => item.item_id);
      const itemsQuery2 = `
        SELECT id, item_id
        FROM purchase_items
        WHERE id = ANY($1::uuid[])
      `;
      const itemsResult2 = await client.query(itemsQuery2, [itemIds]);
      const itemsByItemId = itemsResult2.rows.reduce((acc, item) => {
        acc[item.id] = item;
        return acc;
      }, {});

      // Attach details to the purchase receives
      purchaseReceives.forEach(receive => {
        receive.items = itemsByReceiveId[receive.id] || [];
        receive.items.forEach(item => {
          item.vendor_details = vendorsById[item.vendor_id] || {};
          item.item_details = itemsByItemId[item.item_id] || {};
        });
      });
    }

    const paginationInfo = {
      totalItems,
      perPage,
      currentPage,
      totalPages: Math.ceil(totalItems / perPage),
    };

    client.release();

    return responseSender(res, 200, true, "Purchase receives details fetched", {
      count: totalItems,
      purchase_receives: purchaseReceives,
      pagination: paginationInfo,
    });

  } catch (error) {
    next(error);
  }
};

const getPurchaseReceiveDetails = async (req, res, next) => {
  const { id } = req.query; // Get purchase_receive_id from the query parameters

  if (!id) {
    return res.status(400).json({ success: false, message: "purchase_receive_id query parameter is required." });
  }

  try {
    const client = await pool.connect(); // Connect to the database

    const query = `
      SELECT 
        pr.id AS purchase_receive_id,
        pr.purchase_order_id,
        pr.purchase_received_number,
        pr.received_date,
        pr.description,
        pri.item_id AS purchase_item_id,
        pri.vendor_id,
        pri.total_quantity,
        pri.quantity_received,
        pri.remaining_quantity,
        pri.rate,
        pri.total_cost,
        pi.required_quantity,
        v.vendor_display_name,
        v.email,
        v.phone_no,
        v.address,
        v.city,
        v.state,
        v.zip_code,
        i.id AS item_id,
        i.name AS item_name,
        i.type AS item_type,
        i.description AS item_description,
        i.stock_in_hand,
        i.opening_stock_rate,
        i.reorder_unit,
        i.inventory_description,
        i.image
      FROM 
        purchase_receives pr
      JOIN 
        purchase_receive_items pri ON pr.id = pri.purchase_receive_id
      JOIN
        vendor v ON pri.vendor_id = v.id
      JOIN
        purchase_items pi ON pri.item_id = pi.id
      JOIN
        item i ON pi.item_id = i.id
      WHERE 
        pr.id = $1;
    `;

    const result = await client.query(query, [id]); // Execute the query with the purchase_receive_id

    client.release(); // Release the database connection

    if (result.rowCount === 0) {
      // If no rows are found, return a 404 status
      return res.status(404).json({ success: false, message: "Purchase receive not found." });
    }

    // Group items by item_id to ensure vendors are associated with the correct items
    const itemsMap = new Map();

    result.rows.forEach(row => {
      if (!itemsMap.has(row.purchase_item_id)) {
        itemsMap.set(row.purchase_item_id, {
          item_id: row.purchase_item_id,  // Add purchase_item_id to each item
          // item_id: row.item_id,
          name: row.item_name,
          type: row.item_type,
          description: row.item_description,
          stock_in_hand: row.stock_in_hand,
          opening_stock_rate: row.opening_stock_rate,
          reorder_unit: row.reorder_unit,
          inventory_description: row.inventory_description,
          image: row.image,
          total_quantity: row.total_quantity,
          quantity_received: row.quantity_received,
          remaining_quantity: row.remaining_quantity,
          rate: row.rate,
          total_cost: row.total_cost,
          required_quantity: row.required_quantity,
          vendors: []
        });
      }

      itemsMap.get(row.purchase_item_id).vendors.push({
        vendor_id: row.vendor_id,
        vendor_display_name: row.vendor_display_name,
        email: row.email,
        phone_no: row.phone_no,
        address: row.address,
        city: row.city,
        state: row.state,
        zip_code: row.zip_code
      });
    });

    const purchaseReceive = {
      purchase_receive_id: result.rows[0].purchase_receive_id,
      purchase_order_id: result.rows[0].purchase_order_id,
      purchase_received_number: result.rows[0].purchase_received_number,
      received_date: result.rows[0].received_date,
      description: result.rows[0].description,
      items: Array.from(itemsMap.values())  // items array contains each item with purchase_item_id
    };

    // If rows are found, return the data with a 200 status
    return res.status(200).json({
      success: true,
      message: "Purchase receive fetched successfully",
      result: purchaseReceive
    });
  } catch (error) {
    // Handle any errors
    next(error);
  }
};

///////////////////////////////////

const getVendorsAndItemsByPurchaseOrderId = async (req, res, next) => {
  const { purchase_order_id } = req.query;

  if (!purchase_order_id) {
    return responseSender(res, 400, false, "purchase_order_id query parameter is required");
  }

  try {
    const client = await pool.connect();

    // Fetch vendors and items by purchase_order_id
    const query = `
      SELECT 
        pov.vendor_id,
        pov.purchase_item_id,
        pov.purchase_order_id 
      FROM 
        purchase_order_preferred_vendors pov
      WHERE 
        pov.purchase_order_id = $1;
    `;
    const result = await client.query(query, [purchase_order_id]);

    if (result.rowCount === 0) {
      client.release();
      return responseSender(res, 404, false, "No vendors or items found for the provided purchase_order_id");
    }

    // Process the result to group items by vendor_id
    const vendors = {};
    const vendorIds = new Set();

    result.rows.forEach(row => {
      const { vendor_id, purchase_item_id } = row;

      if (!vendors[vendor_id]) {
        vendors[vendor_id] = {
          vendor_id,
          items: []
        };
      }

      vendors[vendor_id].items.push(purchase_item_id);
      vendorIds.add(vendor_id); // Collect vendor IDs
    });

    // Fetch vendor details
    const vendorIdsArray = Array.from(vendorIds);
    const vendorQuery = `
      SELECT 
        id, v_type, provider_type, first_name, last_name, company_name, 
        vendor_display_name, email, phone_no, work_no, country, address, 
        city, state, zip_code, fax_number, shipping_address 
      FROM 
        vendor 
      WHERE 
        id = ANY($1::uuid[]);
    `;
    const vendorResult = await client.query(vendorQuery, [vendorIdsArray]);
    const vendorsDetails = vendorResult.rows.reduce((acc, vendor) => {
      acc[vendor.id] = vendor;
      return acc;
    }, {});

    // Attach vendor details to each vendor entry
    Object.keys(vendors).forEach(vendor_id => {
      vendors[vendor_id].vendor_details = vendorsDetails[vendor_id] || {};
    });

    // Convert the vendors object to an array
    const response = Object.values(vendors);

    client.release();

    return responseSender(res, 200, true, "Vendors and items fetched successfully", response);
  } catch (error) {
    next(error);
  }
};

const getPurchaseItemIdsByOrderIdAndVendorId = async (req, res, next) => {
  const { purchase_order_id, vendor_id } = req.query;

  if (!purchase_order_id || !vendor_id) {
    return responseSender(res, 400, false, "Both purchase_order_id and vendor_id query parameters are required");
  }

  try {
    const client = await pool.connect();

    // SQL Query to fetch distinct purchase_item_id by purchase_order_id and vendor_id
    const query = `
      SELECT 
          DISTINCT purchase_item_id
      FROM 
          purchase_order_preferred_vendors
      WHERE 
          purchase_order_id = $1 
          AND vendor_id = $2;
    `;

    const result = await client.query(query, [purchase_order_id, vendor_id]);

    if (result.rowCount === 0) {
      client.release();
      return responseSender(res, 404, false, "No purchase items found for the provided purchase_order_id and vendor_id");
    }

    const purchaseItemIds = result.rows.map(row => row.purchase_item_id);

    // Fetch all records from purchase_items and join with item table for additional details
    const itemsQuery = `
      SELECT 
          pi.id AS purchase_item_id,
          pi.available_stock,
          pi.required_quantity,
          pi.price,
          pi.preffered_vendor_ids,
          i.name,
          i.type,
          i.image
      FROM 
          purchase_items pi
      JOIN 
          item i ON pi.item_id = i.id
      WHERE 
          pi.id = ANY($1::uuid[]);
    `;

    const itemsResult = await client.query(itemsQuery, [purchaseItemIds]);

    client.release();

    if (itemsResult.rowCount === 0) {
      return responseSender(res, 404, false, "No purchase items details found for the provided purchase_item_ids");
    }

    // Separate out item details and map items with vendor_id
    const itemsWithDetails = itemsResult.rows.map(item => {
      const isPreferredVendor = item.preffered_vendor_ids.includes(vendor_id);
      return {
        ...item,
        vendor_id: isPreferredVendor ? vendor_id : null  // Attach vendor_id if it's a preferred vendor, otherwise null
      };
    });

    // Create a list of item details without item IDs
    const itemDetails = itemsResult.rows.map(item => ({
      name: item.name,
      type: item.type,
      image: item.image
    }));

    return responseSender(res, 200, true, "Purchase item IDs and details fetched successfully", {
      purchase_item_ids: purchaseItemIds,
      items: itemsWithDetails,
      item_details: itemDetails
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  purchaseReceives,
  updatePurchaseReceive,
  cancelPurchaseOrder,
  getPurchaseReceives,
  getPurchaseReceiveDetails,

  getVendorsAndItemsByPurchaseOrderId,
  getPurchaseItemIdsByOrderIdAndVendorId
};
