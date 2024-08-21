const pool = require("../../config/db");
const { v4: uuidv4 } = require('uuid');
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const generatePurchaseReceivedNumber = () => {
  const timestamp = Date.now(); // Get current timestamp in milliseconds
  return `PR-${timestamp}`;
};

const purchaseReceives = async (req, res, next) => {
  const { purchase_order_id, vendor_id, items, received_date, description } = req.body;
  const purchase_received_number = generatePurchaseReceivedNumber();

  try {
    const client = await pool.connect();

    // Check if the purchase_order_id exists in the purchase_order table
    const checkPurchaseOrderQuery = `
      SELECT id FROM purchase_order WHERE id = $1;
    `;
    const checkPurchaseOrderResult = await pool.query(checkPurchaseOrderQuery, [purchase_order_id]);

    if (checkPurchaseOrderResult.rowCount === 0) {
      // pool.release(); 
      return responseSender(res, 422, false, "Invalid purchase_order_id. The purchase order does not exist.");
    }

    // Check if the vendor_id exists in the purchase_order_preferred_vendors table for the provided purchase_order_id
    const checkVendorQuery = `
      SELECT id FROM purchase_order_preferred_vendors
      WHERE purchase_order_id = $1 AND vendor_id = $2;
    `;
    const checkVendorResult = await pool.query(checkVendorQuery, [purchase_order_id, vendor_id]);

    if (checkVendorResult.rowCount === 0) {
      return responseSender(res, 422, false, "Invalid vendor_id for the provided purchase_order_id. This vendor does not exist for the given purchase order.");
    }

    const insertedItems = [];
    let hasRemainingItems = false;

    for (const item of items) {
      const { item_id, quantity_received, rate } = item;

      // Check if the item_id exists in the purchase_items table and get required_quantity
      const checkItemQuery = `
        SELECT id, required_quantity, available_stock
        FROM purchase_items
        WHERE id = $1;
      `;
      const checkItemResult = await pool.query(checkItemQuery, [item_id]);

      if (checkItemResult.rowCount === 0) {
        // pool.release(); 
        return responseSender(res, 422, false, `Invalid item_id ${item_id}. This item does not exist in the purchase_items table.`);
      }

      const purchaseItem = checkItemResult.rows[0];
      const { required_quantity, available_stock } = purchaseItem;
      const total_quantity = required_quantity;
      const remaining_quantity = total_quantity - quantity_received;

      console.log("quantity_received", quantity_received);
      console.log("required_quantity", required_quantity);

      // Validate quantity_received against required_quantity
      if (quantity_received > required_quantity) {
        // pool.release(); 
        return responseSender(res, 422, false, `Received quantity  cannot be greater than required quantity ${required_quantity} for item ${item_id}.`);
      }

      // Proceed to insert the purchase_receives record for each item
      const insertQuery = `
        INSERT INTO purchase_receives 
        (purchase_order_id, purchase_received_number, vendor_id, item_id, total_quantity, quantity_received, rate, received_date, description)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *;
      `;

      const result = await pool.query(insertQuery, [
        purchase_order_id,
        purchase_received_number,
        vendor_id,
        item_id,
        total_quantity,
        quantity_received,
        rate,
        received_date,
        description
      ]);

      const newItem = result.rows[0];
      insertedItems.push(newItem);

      if (remaining_quantity > 0) {
        hasRemainingItems = true;
      }

      // Update the purchase_items table
      const updateItemQuery = `
        UPDATE purchase_items
        SET available_stock = available_stock + $1,
            required_quantity = $2
        WHERE id = $3;
      `;
      await pool.query(updateItemQuery, [
        quantity_received,
        remaining_quantity,
        item_id
      ]);
    }

    // Update the purchase_order status based on remaining quantities
    const updateStatusQuery = `
      UPDATE purchase_order
      SET status = $1
      WHERE id = $2;
    `;
    const newStatus = hasRemainingItems ? 'PARTIALLY RECEIVED' : 'FULLY DELIVERED';
    await pool.query(updateStatusQuery, [newStatus, purchase_order_id]);

    // pool.release();  
    return responseSender(res, 200, true, "Purchase receive created successfully", { purchase_received_number, items: insertedItems });
  } catch (error) {
    next(error);
  }
};

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
      SELECT * FROM purchase_receives
      LIMIT $1 OFFSET $2;
    `;
    const purchaseReceivesResult = await client.query(purchaseReceivesQuery, [perPage, offset]);
    const purchaseReceives = purchaseReceivesResult.rows;

    // Fetch details for each purchase receive
    for (const receive of purchaseReceives) {
      // Fetch purchase order details
      const purchaseOrderQuery = `
        SELECT * FROM purchase_order WHERE id = $1;
      `;
      const purchaseOrderResult = await client.query(purchaseOrderQuery, [receive.purchase_order_id]);
      const purchaseOrder = purchaseOrderResult.rows[0];

      // Fetch vendor details
      const vendorQuery = `
        SELECT * FROM vendor WHERE id = $1;
      `;
      const vendorResult = await client.query(vendorQuery, [receive.vendor_id]);
      const vendor = vendorResult.rows[0];

      // Fetch purchase item details
      const purchaseItemQuery = `
        SELECT * FROM purchase_items WHERE id = $1;
      `;
      const purchaseItemResult = await client.query(purchaseItemQuery, [receive.item_id]);
      const purchaseItem = purchaseItemResult.rows[0];

      // Fetch item details
      const itemQuery = `
        SELECT * FROM item WHERE id = $1;
      `;
      const itemResult = await client.query(itemQuery, [purchaseItem.item_id]);
      const itemDetails = itemResult.rows[0];

      // Fetch preferred vendor details for the item
      const preferredVendors = [];
      for (const vendorId of purchaseItem.preffered_vendor_ids) {
        const preferredVendorQuery = `
          SELECT * FROM vendor WHERE id = $1;
        `;
        const preferredVendorResult = await client.query(preferredVendorQuery, [vendorId]);
        const preferredVendor = preferredVendorResult.rows[0];
        preferredVendors.push(preferredVendor);
      }

      // Attach details to the purchase receive
      receive.purchase_order = purchaseOrder;
      // receive.purchase_order.vendor = vendor;
      receive.purchase_item = purchaseItem;
      receive.item_details = itemDetails;
      receive.purchase_item.preferred_vendors = preferredVendors;
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
    });

  } catch (error) {
    next(error);
  }
};

const getPurchaseReceiveDetails = async (req, res, next) => {
  const purchaseReceiveId = req.query.purchase_receive_id;

  if (!purchaseReceiveId) {
    return responseSender(res, 404, false, "purchase_receive_id query parameter is required");
  }

  try {
    const client = await pool.connect();

    // Fetch purchase receive details
    const purchaseReceiveQuery = `
      SELECT * FROM purchase_receives WHERE id = $1;
    `;
    const purchaseReceiveResult = await client.query(purchaseReceiveQuery, [purchaseReceiveId]);
    const purchaseReceive = purchaseReceiveResult.rows[0];

    if (!purchaseReceive) {
      return responseSender(res, 404, false, "Purchase receive not found");
    }

    // Fetch purchase order details
    const purchaseOrderQuery = `
      SELECT * FROM purchase_order WHERE id = $1;
    `;
    const purchaseOrderResult = await client.query(purchaseOrderQuery, [purchaseReceive.purchase_order_id]);
    const purchaseOrder = purchaseOrderResult.rows[0];

    // Fetch vendor details
    const vendorQuery = `
      SELECT * FROM vendor WHERE id = $1;
    `;
    const vendorResult = await client.query(vendorQuery, [purchaseReceive.vendor_id]);
    const vendor = vendorResult.rows[0];

    // Fetch purchase item details
    const purchaseItemQuery = `
      SELECT * FROM purchase_items WHERE id = $1;
    `;
    const purchaseItemResult = await client.query(purchaseItemQuery, [purchaseReceive.item_id]);
    const purchaseItem = purchaseItemResult.rows[0];

    // Fetch item details
    const itemQuery = `
      SELECT * FROM item WHERE id = $1;
    `;
    const itemResult = await client.query(itemQuery, [purchaseItem.item_id]);
    const itemDetails = itemResult.rows[0];

    // Fetch preferred vendor details for the item
    const preferredVendors = [];
    for (const vendorId of purchaseItem.preffered_vendor_ids) {
      const preferredVendorQuery = `
        SELECT * FROM vendor WHERE id = $1;
      `;
      const preferredVendorResult = await client.query(preferredVendorQuery, [vendorId]);
      const preferredVendor = preferredVendorResult.rows[0];
      preferredVendors.push(preferredVendor);
    }

    // Attach details to the purchase receive
    purchaseReceive.purchase_order = purchaseOrder;
    // purchaseReceive.purchase_order.vendor = vendor;
    purchaseReceive.purchase_item = purchaseItem;
    purchaseReceive.item_details = itemDetails;
    purchaseReceive.purchase_item.preferred_vendors = preferredVendors;

    client.release();

    return responseSender(res, 200, true, "Purchase receive details fetched", purchaseReceive);

  } catch (error) {
    next(error);
  }
};

// const getPurchaseReceiveDetails = async (req, res, next) => {
//   const purchaseReceiveId = req.query.purchase_receive_id;

//   if (!purchaseReceiveId) {
//     return responseSender(res, 404, false, "purchase_receive_id query parameter is required");
//   }

//   try {
//     const client = await pool.connect();

//     // Fetch purchase receive details
//     const purchaseReceiveQuery = `
//       SELECT * FROM purchase_receives WHERE id = $1;
//     `;
//     const purchaseReceiveResult = await client.query(purchaseReceiveQuery, [purchaseReceiveId]);
//     const purchaseReceive = purchaseReceiveResult.rows[0];

//     if (!purchaseReceive) {
//       return responseSender(res, 404, false, "Purchase receive not found");
//     }

//     // Fetch purchase order details
//     const purchaseOrderQuery = `
//       SELECT * FROM purchase_order WHERE id = $1;
//     `;
//     const purchaseOrderResult = await client.query(purchaseOrderQuery, [purchaseReceive.purchase_order_id]);
//     const purchaseOrder = purchaseOrderResult.rows[0];

//     // Fetch vendor details
//     const vendorQuery = `
//       SELECT * FROM vendor WHERE id = $1;
//     `;
//     const vendorResult = await client.query(vendorQuery, [purchaseReceive.vendor_id]);
//     const vendor = vendorResult.rows[0];

//     // Fetch purchase item details
//     const purchaseItemQuery = `
//       SELECT * FROM purchase_items WHERE id = $1;
//     `;
//     const purchaseItemResult = await client.query(purchaseItemQuery, [purchaseReceive.item_id]);
//     const purchaseItem = purchaseItemResult.rows[0];

//     // Fetch item details
//     const itemQuery = `
//       SELECT * FROM item WHERE id = $1;
//     `;
//     const itemResult = await client.query(itemQuery, [purchaseItem.item_id]);
//     const itemDetails = itemResult.rows[0];

//     // Fetch preferred vendor details for the item
//     const preferredVendors = [];
//     for (const vendorId of purchaseItem.preffered_vendor_ids) {
//       const preferredVendorQuery = `
//         SELECT * FROM vendor WHERE id = $1;
//       `;
//       const preferredVendorResult = await client.query(preferredVendorQuery, [vendorId]);
//       const preferredVendor = preferredVendorResult.rows[0];
//       preferredVendors.push(preferredVendor);
//     }

//     // Attach details to the purchase receive
//     purchaseReceive.purchase_order = purchaseOrder;
//     // purchaseReceive.purchase_order.vendor = vendor;
//     purchaseReceive.purchase_item = purchaseItem;
//     purchaseReceive.item_details = itemDetails;
//     purchaseReceive.purchase_item.preferred_vendors = preferredVendors;

//     client.release();

//     return responseSender(res, 200, true, "Purchase receive details fetched", purchaseReceive);

//   } catch (error) {
//     next(error);
//   }
// };

module.exports = {
  purchaseReceives,
  cancelPurchaseOrder,
  getPurchaseReceives,
  getPurchaseReceiveDetails
};
