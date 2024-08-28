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
          (purchase_receive_id, vendor_id, item_id, total_quantity, quantity_received, rate)
          VALUES ($1, $2, $3, $4, $5, $6)
          RETURNING *
        `;
        const itemResult = await client.query(insertItemQuery, [
          purchaseReceiveId,
          vendor_id,
          item_id,
          total_quantity,
          quantity_received,
          rate
        ]);

        insertedItems.push(itemResult.rows[0]);
      }

      if (remaining_quantity > 0) {
        hasRemainingItems = true;
      }

      // Update the purchase_items table
      const updateItemQuery = `
        UPDATE purchase_items
        SET available_stock = available_stock + $1,
            required_quantity = $2
        WHERE id = $3
      `;
      await client.query(updateItemQuery, [
        quantity_received,
        remaining_quantity,
        item_id
      ]);
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
        SELECT pi.id, pi.required_quantity, COALESCE(SUM(pr.quantity_received), 0) AS total_received
        FROM purchase_items pi
        LEFT JOIN purchase_receives pr ON pi.id = pr.item_id AND pr.purchase_order_id = $1
        WHERE pi.id = ANY($2::UUID[])
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
      SELECT pi.id, pi.required_quantity, COALESCE(SUM(pr.quantity_received), 0) AS total_received
      FROM purchase_items pi
      LEFT JOIN purchase_receives pr ON pi.id = pr.item_id AND pr.purchase_order_id = $1
      GROUP BY pi.id
      HAVING pi.required_quantity > COALESCE(SUM(pr.quantity_received), 0);
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

  try {
    const client = await pool.connect();

    // Fetch total count for pagination
    const totalCountResult = await client.query('SELECT COUNT(*) FROM purchase_receives');
    const totalItems = parseInt(totalCountResult.rows[0].count);

    // Fetch all purchase receives with pagination
    const purchaseReceivesQuery = `
      SELECT id, purchase_received_number, received_date, description
      FROM purchase_receives
      LIMIT $1 OFFSET $2;
    `;
    const purchaseReceivesResult = await client.query(purchaseReceivesQuery, [perPage, offset]);
    const purchaseReceives = purchaseReceivesResult.rows;

    // Fetch details for each purchase receive
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

    const itemIds = itemsResult.rows.map(item => item.item_id);
    const itemsQuery2 = `
      SELECT item_id
      FROM purchase_items
      WHERE id = ANY($1::uuid[])
    `;

    console.log("itemIds", itemIds);

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
        // Log item details assignment
        console.log("Assigned item details:", item.item_details);
      });
    });

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
      pagination: paginationInfo
    });

  } catch (error) {
    next(error);
  }
}; 

const getPurchaseReceiveDetails = async (req, res, next) => {
  const purchaseReceiveId = req.query.purchase_receive_id;

  if (!purchaseReceiveId) {
    return responseSender(res, 400, false, "purchase_receive_id query parameter is required");
  }

  try {
    const client = await pool.connect();

    // Fetch purchase receive details
    const purchaseReceiveQuery = `
      SELECT id, purchase_received_number, received_date, description
      FROM purchase_receives WHERE id = $1;
    `;
    const purchaseReceiveResult = await client.query(purchaseReceiveQuery, [purchaseReceiveId]);
    const purchaseReceive = purchaseReceiveResult.rows[0];

    if (!purchaseReceive) {
      return responseSender(res, 404, false, "Purchase receive not found");
    }

    // Fetch item details related to the purchase receive
    const itemsQuery = `
      SELECT * FROM purchase_receive_items WHERE purchase_receive_id = $1;
    `;
    const itemsResult = await client.query(itemsQuery, [purchaseReceiveId]);
    const items = itemsResult.rows;

    // Fetch unique vendor IDs
    const vendorIds = [...new Set(items.map(item => item.vendor_id))];

    // Fetch vendor details
    const vendorsQuery = `
      SELECT * FROM vendor WHERE id = ANY($1::uuid[]);
    `;
    const vendorsResult = await client.query(vendorsQuery, [vendorIds]);
    const vendorsById = vendorsResult.rows.reduce((acc, vendor) => {
      acc[vendor.id] = vendor;
      return acc;
    }, {});

    // Group items by vendor_id and attach vendor details
    const groupedItems = vendorIds.map(vendorId => ({
      vendor_id: vendorId,
      vendor_details: vendorsById[vendorId] || {},
      items: items.filter(item => item.vendor_id === vendorId)
    }));

    // Attach grouped items to the purchase receive
    purchaseReceive.items = groupedItems;

    client.release();

    return responseSender(res, 200, true, "Purchase receive details fetched", purchaseReceive);

  } catch (error) {
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

    // SQL Query to fetch vendors and items by purchase_order_id
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

    client.release();

    if (result.rowCount === 0) {
      return responseSender(res, 404, false, "No vendors or items found for the provided purchase_order_id");
    }

    // Process the result to group items by vendor_id
    const vendors = {};

    result.rows.forEach(row => {
      const { vendor_id, purchase_order_id, purchase_item_id } = row;

      if (!vendors[vendor_id]) {
        vendors[vendor_id] = {
          vendor_id,
          purchase_order_id,
          items: []
        };
      }

      vendors[vendor_id].items.push(purchase_item_id);
    });

    // Convert the vendors object to an array
    const response = Object.values(vendors);

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

    // Fetch all records from purchase_items for the obtained purchase_item_ids
    const itemsQuery = `
      SELECT 
          id, available_stock, required_quantity, price, preffered_vendor_ids
      FROM 
          purchase_items
      WHERE 
          id = ANY($1::uuid[]);
    `;

    const itemsResult = await client.query(itemsQuery, [purchaseItemIds]);

    client.release();

    if (itemsResult.rowCount === 0) {
      return responseSender(res, 404, false, "No purchase items details found for the provided purchase_item_ids");
    }

    // Add vendor_id to each item
    const itemsWithVendorId = itemsResult.rows.map(item => ({
      ...item,
      vendor_id: vendor_id  // Attach vendor_id to each item
    }));

    return responseSender(res, 200, true, "Purchase item IDs and details fetched successfully", {
      purchase_item_ids: purchaseItemIds,
      items: itemsWithVendorId
    });
  } catch (error) {
    next(error);
  }
};


module.exports = {
  purchaseReceives,
  cancelPurchaseOrder,
  getPurchaseReceives,
  getPurchaseReceiveDetails,

  getVendorsAndItemsByPurchaseOrderId,
  getPurchaseItemIdsByOrderIdAndVendorId
};
