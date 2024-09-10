const pool = require("../../config/db");
const { v4: uuidv4 } = require('uuid');
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const createInvoice = async (req, res, next) => {
    const {
        purchase_receive_ids, // Array of UUIDs
        bill_date,
        due_date,
        tax_id,
        payment_term_id,
    } = req.body;

    try {
        // Validate that purchase_receive_ids is not empty
        if (!purchase_receive_ids || !Array.isArray(purchase_receive_ids) || purchase_receive_ids.length === 0) {
            return responseSender(res, 422, false, "Invalid or missing 'purchase_receive_ids'");
        }

        // Fetch total_items and total_price from purchase_receive_items
        const { rows: purchaseTotals } = await pool.query(
            `SELECT 
                SUM(quantity_received) AS total_items, 
                SUM(total_cost) AS total_price 
            FROM purchase_receive_items 
            WHERE purchase_receive_id = ANY($1)`,
            [purchase_receive_ids]
        );

        const total_items = purchaseTotals[0].total_items || 0;
        const total_price = purchaseTotals[0].total_price || 0;

        if (total_items === 0 || total_price === 0) {
            return responseSender(res, 422, false, "No matching purchase receive items found");
        }

        // Fetch the tax percentage from the invoice_tax table
        const taxResult = await pool.query(
            `SELECT tax_value FROM invoice_tax WHERE id = $1`,
            [tax_id]
        );

        if (taxResult.rows.length === 0) {
            return responseSender(res, 404, false, "Invalid tax ID");
        }

        const taxPercentage = parseFloat(taxResult.rows[0].tax_value) || 0;
        const taxDecimal = taxPercentage / 100;
        const taxAmount = total_price * taxDecimal;
        const net_price = total_price + taxAmount;

        // Auto-generate bill_number
        const bill_number = `INV-${Math.floor(Math.random() * 100000)}`;

        // Insert the new invoice with status set to 'Draft'
        const newInvoice = await pool.query(
            `INSERT INTO invoices (
                id, 
                total_items, 
                bill_date, 
                bill_number, 
                due_date, 
                total_price, 
                tax_id, 
                payment_term_id, 
                status, 
                net_price, 
                created_at, 
                updated_at
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, 'Draft', $9, NOW(), NOW()
            ) RETURNING *`,
            [
                uuidv4(),
                total_items,
                bill_date,
                bill_number,
                due_date || null, // Allow null for optional due_date
                total_price,
                tax_id,
                payment_term_id,
                net_price
            ]
        );

        const invoiceId = newInvoice.rows[0].id;

        // Insert records into invoice_purchase_receives
        const values = purchase_receive_ids
            .map(id => `('${invoiceId}', '${id}')`)
            .join(', ');

        await pool.query(
            `INSERT INTO invoice_purchase_receives (invoice_id, purchase_receive_id) 
         VALUES ${values}`
        );

        // Update the pr_invoice status in purchase_receives to true
        await pool.query(
            `UPDATE purchase_receives 
             SET pr_invoice = true, updated_at = NOW()
             WHERE id = ANY($1)`,
            [purchase_receive_ids]
        );

        // Return the created invoice 
        return responseSender(res, 201, true, "Invoice created successfully", newInvoice.rows[0]);

    } catch (error) {
        next(error);
    }
};

const getInvoices = async (req, res, next) => {
    const perPage = Number.parseInt(req.query.perPage) || 10;
    const currentPage = Number.parseInt(req.query.currentPage) || 1;
    const searchBillNumber = req.query.bill_number || '';
    const searchStatus = req.query.status || '';

    try {
        // Construct the base query
        let countQuery = `
            SELECT COUNT(*) 
            FROM invoices i
            LEFT JOIN invoice_tax it ON i.tax_id = it.id
            LEFT JOIN payment_term pt ON i.payment_term_id = pt.id`;

        let fetchQuery = `
            SELECT 
                i.id,
                i.total_items,
                i.bill_date,
                i.bill_number,
                i.due_date,
                i.total_price,
                i.tax_id,
                it.tax_value AS tax_percentage,
                i.payment_term_id,
                pt.payment_term_name,
                i.status,
                i.net_price,
                i.created_at,
                i.updated_at
            FROM invoices i
            LEFT JOIN invoice_tax it ON i.tax_id = it.id
            LEFT JOIN payment_term pt ON i.payment_term_id = pt.id`;

        // Add search conditions if bill_number or status are provided
        let queryParams = [];
        let whereClauses = [];

        if (searchBillNumber) {
            whereClauses.push(`i.bill_number ILIKE $${queryParams.length + 1}`);
            queryParams.push(`%${searchBillNumber}%`);
        }

        if (searchStatus) {
            whereClauses.push(`i.status = $${queryParams.length + 1}`);
            queryParams.push(searchStatus);
        }

        if (whereClauses.length > 0) {
            const whereClause = whereClauses.join(' AND ');
            countQuery += ` WHERE ${whereClause}`;
            fetchQuery += ` WHERE ${whereClause}`;
        }

        // Add ORDER BY clause for sorting
        fetchQuery += ` ORDER BY i.created_at DESC`;

        // Calculate offset for pagination
        const offset = (currentPage - 1) * perPage;

        // Fetch paginated data
        let result;
        if (queryParams.length > 0) {
            result = await pool.query(fetchQuery + ' LIMIT $' + (queryParams.length + 1) + ' OFFSET $' + (queryParams.length + 2), [...queryParams, perPage, offset]);
        } else {
            result = await pool.query(fetchQuery + ' LIMIT $1 OFFSET $2', [perPage, offset]);
        }

        // Fetch the total count of invoices
        const countResult = await pool.query(countQuery, queryParams);
        const totalItems = parseInt(countResult.rows[0].count, 10);

        // Fetch purchase receive IDs for each invoice
        const invoiceIds = result.rows.map(invoice => invoice.id);
        const { rows: purchaseReceives } = await pool.query(
            `SELECT 
                invoice_id,
                purchase_receive_id
            FROM invoice_purchase_receives
            WHERE invoice_id = ANY($1)`,
            [invoiceIds]
        );

        // Organize purchase receive IDs by invoice
        const invoiceMap = result.rows.reduce((acc, invoice) => {
            acc[invoice.id] = {
                ...invoice,
                purchase_receive_ids: []
            };
            return acc;
        }, {});

        purchaseReceives.forEach(pr => {
            if (invoiceMap[pr.invoice_id]) {
                invoiceMap[pr.invoice_id].purchase_receive_ids.push(pr.purchase_receive_id);
            }
        });

        // Convert invoiceMap back to array
        const invoicesWithReceives = Object.values(invoiceMap);

        // Generate pagination info
        const paginationInfo = pagination(totalItems, perPage, currentPage);

        return responseSender(res, 200, true, "Invoices fetched successfully", { count: paginationInfo.totalItems, items: invoicesWithReceives });
    } catch (error) {
        next(error);
    }
};

const getInvoiceById = async (req, res, next) => {
    const { id } = req.query; // Extract the invoice ID from the query parameters

    if (!id) {
        return responseSender(res, 400, false, "Invoice ID is required");
    }

    try {
        // Fetch the invoice details
        const invoiceResult = await pool.query(
            `SELECT 
                i.id,
                i.total_items,
                i.bill_date,
                i.bill_number,
                i.due_date,
                i.total_price,
                i.tax_id,
                it.tax_value AS tax_percentage,
                i.payment_term_id,
                pt.payment_term_name,
                i.status,
                i.net_price,
                i.created_at,
                i.updated_at
            FROM invoices i
            LEFT JOIN invoice_tax it ON i.tax_id = it.id
            LEFT JOIN payment_term pt ON i.payment_term_id = pt.id
            WHERE i.id = $1`,
            [id]
        );

        if (invoiceResult.rows.length === 0) {
            return responseSender(res, 404, false, "Invoice not found");
        }

        const invoice = invoiceResult.rows[0];

        // Fetch purchase receive IDs, vendor info, and purchase_received_number for the invoice
        const purchaseReceivesResult = await pool.query(
            `SELECT 
                pri.purchase_receive_id,
                pr.purchase_received_number,
                v.id AS vendor_id,
                v.vendor_display_name,
                v.email,
                v.phone_no,
                v.company_name,
                pri.total_quantity,
                pri.quantity_received,
                pri.rate,
                pri.total_cost
            FROM invoice_purchase_receives ipr
            JOIN purchase_receive_items pri ON ipr.purchase_receive_id = pri.purchase_receive_id
            JOIN purchase_receives pr ON pri.purchase_receive_id = pr.id
            JOIN vendor v ON pri.vendor_id = v.id
            WHERE ipr.invoice_id = $1`,
            [id]
        );

        // Organize purchase receive data by purchase_receive_id
        const purchaseReceiveData = purchaseReceivesResult.rows.map(pr => ({
            purchase_receive_id: pr.purchase_receive_id,
            purchase_received_number: pr.purchase_received_number,
            vendor: {
                vendor_id: pr.vendor_id,
                vendor_display_name: pr.vendor_display_name,
                email: pr.email,
                phone_no: pr.phone_no,
                company_name: pr.company_name
            },
            total_quantity: pr.total_quantity,
            quantity_received: pr.quantity_received,
            rate: pr.rate,
            total_cost: pr.total_cost
        }));

        // Attach purchase receive data to the invoice
        invoice.purchase_receives = purchaseReceiveData;

        return responseSender(res, 200, true, "Invoice fetched successfully", invoice);
    } catch (error) {
        next(error);
    }
};

const updateInvoiceStatus = async (req, res, next) => {
    const { id, status } = req.body;

    // Validate input
    if (!id || !status) {
        return responseSender(res, 400, false, "Invoice ID and status are required");
    }

    // Validate status value
    const validStatuses = ['Paid', 'Draft', 'Unpaid'];
    if (!validStatuses.includes(status)) {
        return responseSender(res, 400, false, "Invalid status value");
    }

    try {
        // Update the invoice status
        const result = await pool.query(
            `UPDATE invoices
            SET status = $1, updated_at = NOW()
            WHERE id = $2
            RETURNING *`,
            [status, id]
        );

        if (result.rows.length === 0) {
            return responseSender(res, 404, false, "Invoice not found");
        }

        // Return the updated invoice
        return responseSender(res, 200, true, "Invoice status updated successfully", result.rows[0]);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createInvoice,
    getInvoices,
    getInvoiceById,
    updateInvoiceStatus
};
