const pool = require("../../config/db");
const {
  uploadToCloudinary,
  updateCloudinaryFile,
  deleteCloudinaryFile,
} = require("../../utilities/cloudinary");
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const generatePrNumber = async () => {
  const prefix = "PR-";
  const timestamp = new Date().getTime(); // Use timestamp to generate unique number
  return `${prefix}${timestamp}`;
};

const createPurchaseRequisition = async (req, res, next) => {
  const {
    status,
    pr_detail,
    priority,
    requested_by,
    requested_date,
    required_date,
    shipment_preferences,
    delivery_address,
    items,
    total_amount,
  } = req.body;

  try {
    await pool.query(`BEGIN`);

    // Generate pr_number automatically
    const pr_number = await generatePrNumber();

    for (const item of JSON.parse(items)) {
      if (
        !item.item_id ||
        item.available_stock === undefined ||
        item.required_quantity === undefined ||
        item.price === undefined ||
        !Array.isArray(item.preffered_vendor_ids) ||
        item.preffered_vendor_ids.length === 0
      ) {
        await pool.query("ROLLBACK");
        return responseSender(
          res,
          400,
          false,
          "All item fields must be filled."
        );
      }
    }

    let purchase_item_ids = [];

    for (const item of JSON.parse(items)) {
      const { rows, rowCount } = await pool.query(
        `INSERT INTO purchase_items (item_id, available_stock, required_quantity , price , preffered_vendor_ids) VALUES ($1, $2, $3 , $4 , $5) RETURNING *`,
        [
          item.item_id,
          item.available_stock,
          item.required_quantity,
          item.price,
          item.preffered_vendor_ids,
        ]
      );

      if (rowCount === 0) {
        await pool.query(`ROLLBACK`);
        return responseSender(res, 400, false, "Item Not Added");
      }

      purchase_item_ids.push(rows[0].id);
    }

    let uplodadDoc = null;

    if (req.file) {
      uplodadDoc = await uploadToCloudinary(
        req.file.path,
        "Purchase Requisition"
      );
    }

    const { rows, rowCount } = await pool.query(
      `INSERT INTO purchase_requisition (pr_number, status, pr_detail, priority, requested_by, requested_date, required_date, shipment_preferences, delivery_address , purchase_item_ids , document , total_amount) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9 , $10 , $11 , $12) RETURNING *`,
      [
        pr_number, // Use generated pr_number
        status.toUpperCase(),
        pr_detail,
        priority.toUpperCase(),
        requested_by,
        requested_date,
        required_date,
        shipment_preferences,
        delivery_address,
        purchase_item_ids,
        uplodadDoc,
        total_amount,
      ]
    );

    if (rowCount === 0) {
      await deleteCloudinaryFile(uplodadDoc.public_id);
      await pool.query("ROLLBACK");
      return responseSender(res, 400, false, "Purchase Requisition Not Added");
    }

    await pool.query("COMMIT");

    return responseSender(
      res,
      201,
      true,
      "Purchase Requisition Added",
      rows[0]
    );
  } catch (error) {
    await pool.query("ROLLBACK");
    console.log(error);
    next(error);
  }
};

const getPurchaseRequisition = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows, rowCount } = await pool.query(
      `SELECT pr.*, 
        json_agg(
          json_build_object(
              'id', pi.id, 
              'item_id', pi.item_id, 
              'available_stock', pi.available_stock, 
              'required_quantity', pi.required_quantity, 
              'price', pi.price, 
              'item_detail', json_build_object(
                  'id', i.id,
                  'name', i.name,
                  'image', i.image,
                  'category', c.category_name,
                  'type', i.type
              ),
              'preffered_vendor', (
                  SELECT json_agg(
                      json_build_object(
                          'id', v.id, 
                          'vendor_display_name', v.vendor_display_name,
                          'vendor_email', v.email,
                          'vendor_phone_no', v.phone_no,
                           'vendor_first_name', v.first_name,
                            'vendor_last_name', v.last_name
                      )
                  )
                  FROM vendor v 
                  WHERE v.id::text = ANY(pi.preffered_vendor_ids)
              )
          )
      ) AS items_detail 
      FROM purchase_requisition pr 
      LEFT JOIN purchase_items pi 
      ON pi.id::text = ANY(pr.purchase_item_ids) 
      LEFT JOIN item i 
      ON pi.item_id = i.id
      LEFT JOIN category c 
      ON i.product_category = c.id
      WHERE pr.id = $1
      GROUP BY pr.id`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Purhcase Requisition not found");
    }

    return responseSender(
      res,
      200,
      true,
      "Purchase Requisition Retrieved",
      rows[0]
    );
  } catch (error) {
    next(error);
  }
};

const getAllPurchaseRequisition = async (req, res, next) => {
  try {
    let {
      page,
      limit,
      sortField,
      sortOrder,
      search,
      status,
      priority,
      required_date,
    } = req.query;

    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 100;
    sortField = sortField || "created_at";
    sortOrder = sortOrder || "DESC";
    const offset = (page - 1) * limit;

    let queryParams = [];
    let whereClauses = [];

    // Apply search filter
    if (search) {
      whereClauses.push(
        `(pr.pr_number ILIKE $${queryParams.length + 1} OR pr.purchase_order_number ILIKE $${queryParams.length + 1})`
      );
      queryParams.push(`%${search}%`);
    }

    // Apply other filters
    if (status) {
      whereClauses.push(`LOWER(pr.status) = LOWER($${queryParams.length + 1})`);
      queryParams.push(status);
    }

    if (priority) {
      whereClauses.push(`LOWER(pr.priority) = LOWER($${queryParams.length + 1})`);
      queryParams.push(priority);
    }

    if (required_date) {
      whereClauses.push(`pr.required_date = $${queryParams.length + 1}`);
      queryParams.push(required_date);
    }

    // Construct WHERE clause
    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    // Construct main query
    const query = `
      SELECT pr.*, 
      json_agg(
          json_build_object(
              'id', pi.id, 
              'item_id', pi.item_id, 
              'available_stock', pi.available_stock, 
              'required_quantity', pi.required_quantity, 
              'price', pi.price, 
              'preffered_vendor', (
                  SELECT json_agg(
                      json_build_object(
                          'id', v.id, 
                          'vendor_display_name', v.vendor_display_name,
                          'vendor_email', v.email,
                          'vendor_phone_no', v.phone_no
                      )
                  )
                  FROM vendor v 
                  WHERE v.id::text = ANY(pi.preffered_vendor_ids)
              )
          )
      ) AS items_detail 
      FROM purchase_requisition pr 
      LEFT JOIN purchase_items pi 
      ON pi.id::text = ANY(pr.purchase_item_ids) 
      ${whereClause}
      GROUP BY pr.id
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    queryParams.push(limit, offset);

    // Execute main query
    const { rows, rowCount } = await pool.query(query, queryParams);

    // Check if rows were returned
    if (rowCount === 0) {
      return responseSender(res, 404, false, "Purchase Requisition not found");
    }

    // Construct count query
    const countQuery = `
      SELECT COUNT(*)
      FROM purchase_requisition pr
      ${whereClause}
    `;
    // Execute count query
    const totalRowsResult = await pool.query(
      countQuery,
      queryParams.slice(0, -2) // Pass only the filter parameters for the count query
    );

    // Send response
    return responseSender(res, 200, true, "Purchase Requisition Retrieved", {
      p_requisitions: rows,
      pagination: {
        totalItems: parseInt(totalRowsResult.rows[0].count, 10),
        totalPages: Math.ceil(totalRowsResult.rows[0].count / limit),
        currentPage: page,
        perPage: limit,
      },
      totalCount: totalRowsResult.rows[0].count,
    });
  } catch (error) {
    next(error);
  }
};

const updatePurchaseRequisition = async (req, res, next) => {
  const {
    pr_number,
    status,
    pr_detail,
    priority,
    requested_by,
    requested_date,
    required_date,
    shipment_preferences,
    delivery_address,
    items,
    total_amount,
  } = req.body;
  const { id } = req.params;

  try {
    // Check if the purchase requisition exists
    const { rows: existingRows, rowCount } = await pool.query(
      `SELECT * FROM purchase_requisition WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Purchase requisition not found");
    }

    const fields = [];
    const values = [];
    let index = 1;

    // Generate pr_number if not provided
    let newPrNumber = pr_number;
    if (!pr_number) {
      // Generate the pr_number based on a predefined logic, e.g., PR-YYYYMMDD-XXX
      const currentDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const { rows: prCountRows } = await pool.query(
        `SELECT COUNT(*) FROM purchase_requisition WHERE requested_date = $1`,
        [new Date().toISOString().slice(0, 10)]
      );
      const prCount = prCountRows[0].count || 0;
      newPrNumber = `PR-${currentDate}-${String(Number(prCount) + 1).padStart(3, "0")}`;

      fields.push(`pr_number = $${index}`);
      values.push(newPrNumber);
      index++;
    } else {
      fields.push(`pr_number = $${index}`);
      values.push(pr_number);
      index++;
    }

    if (status) {
      fields.push(`status = $${index}`);
      values.push(status.toUpperCase());
      index++;
    }

    if (pr_detail) {
      fields.push(`pr_detail = $${index}`);
      values.push(pr_detail);
      index++;
    }

    if (priority) {
      fields.push(`priority = $${index}`);
      values.push(priority.toUpperCase());
      index++;
    }

    if (requested_by) {
      fields.push(`requested_by = $${index}`);
      values.push(requested_by);
      index++;
    }

    if (requested_date) {
      fields.push(`requested_date = $${index}`);
      values.push(requested_date);
      index++;
    }

    if (required_date) {
      fields.push(`required_date = $${index}`);
      values.push(required_date);
      index++;
    }

    if (shipment_preferences) {
      fields.push(`shipment_preferences = $${index}`);
      values.push(shipment_preferences);
      index++;
    }

    if (delivery_address) {
      fields.push(`delivery_address = $${index}`);
      values.push(delivery_address);
      index++;
    }

    if (total_amount) {
      fields.push(`total_amount = $${index}`);
      values.push(total_amount);
      index++;
    }

    let updateDoc = null;

    if (req.file) {
      const doc = existingRows[0]?.document;
      if (doc) {
        updateDoc = await updateCloudinaryFile(req.file.path, doc.public_id);
        fields.push(`document = $${index}`);
        values.push(updateDoc);
        index++;
      } else {
        updateDoc = await uploadToCloudinary(
          req.file.path,
          "Purchase Requisition"
        );
        fields.push(`document = $${index}`);
        values.push(updateDoc);
        index++;
      }
    }

    // Start the transaction
    await pool.query("BEGIN");

    if (items && items.length > 0) {
      for (const item of JSON.parse(items)) {
        if (
          !item.item_id ||
          item.available_stock === undefined ||
          item.required_quantity === undefined ||
          item.price === undefined ||
          !Array.isArray(item.preffered_vendor_ids) ||
          item.preffered_vendor_ids.length === 0
        ) {
          await pool.query("ROLLBACK");
          return responseSender(
            res,
            400,
            false,
            "All item fields must be filled."
          );
        }
      }

      // Delete existing items
      await pool.query(
        `DELETE FROM purchase_items WHERE id::text = ANY(
          SELECT unnest(purchase_item_ids) FROM purchase_requisition WHERE id = $1
        )`,
        [id]
      );

      // Insert new items and collect their IDs
      const newItems = [];
      if (items && items.length > 0) {
        for (const item of JSON.parse(items)) {
          const {
            item_id,
            available_stock,
            required_quantity,
            price,
            preffered_vendor_ids,
          } = item;

          const insertItemQuery = `
        INSERT INTO purchase_items (
            item_id,
            available_stock,
            required_quantity,
              price,
              preffered_vendor_ids
            ) VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
          `;

          const { rows } = await pool.query(insertItemQuery, [
            item_id,
            available_stock,
            required_quantity,
            price,
            preffered_vendor_ids,
          ]);

          newItems.push(rows[0].id);
        }
      }

      if (newItems.length > 0) {
        fields.push(`purchase_item_ids = $${index}`);
        values.push(newItems);
        index++;
      }
    }

    const updatePurchaseRequisitionQuery = `
        UPDATE purchase_requisition
        SET ${fields.join(", ")}
        WHERE id = $${index}
        RETURNING *;
      `;

    values.push(id);
    const { rows: updatedRequisitionRows } = await pool.query(
      updatePurchaseRequisitionQuery,
      values
    );

    if (updatedRequisitionRows.rowCount === 0) {
      await pool.query("ROLLBACK");
      if (updateDoc) {
        await deleteCloudinaryFile(updateDoc.public_id);
      }
      return responseSender(res, 404, false, "Purchase Requisition not found");
    }

    await pool.query("COMMIT");

    const updatedRequisitionQuery = `
    SELECT pr.*, 
    json_agg(
        json_build_object(
            'id', pi.id, 
            'item_id', pi.item_id, 
            'available_stock', pi.available_stock, 
            'required_quantity', pi.required_quantity, 
            'price', pi.price, 
            'preffered_vendor', (
                SELECT json_agg(
                    json_build_object(
                        'id', v.id, 
                        'vendor_display_name', v.vendor_display_name,
                        'vendor_email', v.email,
                        'vendor_phone_no', v.phone_no
                    )
                )
                FROM vendor v 
                WHERE v.id::text = ANY(pi.preffered_vendor_ids)
            )
        )
    ) AS items_detail 
FROM purchase_requisition pr 
LEFT JOIN purchase_items pi 
ON pi.id::text = ANY(pr.purchase_item_ids) 
WHERE pr.id = $1
GROUP BY pr.id;
      `;
    const { rows: updatedRequisitionDetails } = await pool.query(
      updatedRequisitionQuery,
      [id]
    );

    return responseSender(
      res,
      200,
      true,
      "Purchase Requisition Updated",
      updatedRequisitionDetails[0]
    );
  } catch (error) {
    await pool.query("ROLLBACK");
    next(error);
  }
};

const deletePurchaseRequisition = async (req, res, next) => {
  const { id } = req.params;

  try {
    const { rows, rowCount } = await pool.query(
      `DELETE FROM purchase_requisition WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Purchase Requisition Not Found");
    }

    return responseSender(
      res,
      200,
      true,
      "Purchase Requisition Deleted",
      rows[0]
    );
  } catch (error) {
    next(error);
  }
};

const converToPO = async (req, res, next) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return responseSender(res, 400, false, 'Invalid input. Must provide an array of IDs.');
  }

  try {
    const query = `
      WITH accepted_reqs AS (
        SELECT id
        FROM purchase_requisition
        WHERE id = ANY($1) AND status = 'ACCEPTED'
      ),
      updated_reqs AS (
        UPDATE purchase_requisition
        SET po_status = TRUE
        WHERE id IN (SELECT id FROM accepted_reqs)
        RETURNING id
      )
      SELECT id FROM purchase_requisition
      WHERE id = ANY($1) AND status <> 'ACCEPTED';
    `;

    const result = await pool.query(query, [ids]);

    // Extract updated IDs and non-accepted IDs from the result
    const updatedIds = result.rows.filter(row => row.id).map(row => row.id);
    const nonAcceptedIds = ids.filter(id => !updatedIds.includes(id));

    if (updatedIds.length === 0) {
      return responseSender(
        res,
        404,
        false,
        'No purchase requisitions were updated. All provided IDs may not have status ACCEPTED.',
        nonAcceptedIds
      );
    }

    let message = 'Purchase requisitions updated successfully.';
    if (nonAcceptedIds.length > 0) {
      message += ' Some provided IDs did not have a status of "ACCEPTED" and were not updated.';
    }

    return responseSender(
      res,
      200,
      true,
      message,
      { updatedIds, nonAcceptedIds }
    );
  } catch (error) {
    console.error('Error updating purchase requisitions:', error);
    return responseSender(
      res,
      500,
      false,
      'Internal server error.'
    );
  }
}

module.exports = {
  createPurchaseRequisition,
  getPurchaseRequisition,
  deletePurchaseRequisition,
  getAllPurchaseRequisition,
  updatePurchaseRequisition,
  converToPO
};
