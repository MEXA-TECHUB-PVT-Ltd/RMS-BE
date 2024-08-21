const pool = require("../../config/db");
const {
  uploadToCloudinary,
  deleteCloudinaryFile,
  updateCloudinaryFile,
} = require("../../utilities/cloudinary");
const { pagination } = require("../../utilities/pagination");
const { responseSender } = require("../../utilities/responseHandlers");

const createVendor = async (req, res, next) => {
  const {
    v_type,
    provider_type,
    first_name,
    last_name,
    company_name,
    vendor_display_name,
    email,
    phone_no,
    address,
    city,
    country,
    work_no,
    zip_code,
    state,
    fax_number,
    shipping_address,
    currency_id,
    payment_term_id,
    contact_person,
  } = req.body;

  try {
    const { rowCount: checkVendor } = await pool.query(
      `SELECT * FROM vendor WHERE email = $1 OR phone_no = $2`,
      [email, phone_no]
    );

    if (checkVendor > 0) {
      return responseSender(
        res,
        409,
        false,
        "Vendor with this email or phone number already exists"
      );
    }

    // Upload files to Cloudinary
    const uploadPromises = [];
    ["document", "cnic_front_img", "cnic_back_img"].forEach((field) => {
      if (req.files && req.files[field]) {
        uploadPromises.push(
          uploadToCloudinary(req.files[field][0].path, "Vendor")
        );
      } else {
        uploadPromises.push(null);
      }
    });

    // Wait for all uploads to complete
    const [document, cnic_front_img, cnic_back_img] = await Promise.all(
      uploadPromises
    );

    await pool.query("BEGIN");

    const { rows, rowCount } = await pool.query(
      `
    INSERT INTO vendor (
      v_type, provider_type, first_name, last_name, company_name, 
      vendor_display_name, email, phone_no, address, city, country, 
      work_no, zip_code, state, fax_number, shipping_address, 
      currency_id, payment_term_id, contact_person, document , cnic_front_img , cnic_back_img
    ) 
    VALUES (
      $1, $2, $3, $4, $5, 
      $6, $7, $8, $9, $10, 
      $11, $12, $13, $14, $15, 
      $16, $17, $18, $19, $20 , $21, $22
    ) 
    RETURNING *`,
      [
        v_type,
        provider_type,
        first_name,
        last_name,
        company_name,
        vendor_display_name,
        email,
        phone_no,
        address,
        city,
        country,
        work_no,
        zip_code,
        state,
        fax_number,
        shipping_address,
        currency_id,
        payment_term_id,
        contact_person,
        document,
        cnic_front_img,
        cnic_back_img,
      ]
    );

    if (rowCount === 0) {
      await pool.query("ROLLBACK");
      await Promise.all([
        cnic_front_img && deleteCloudinaryFile(cnic_front_img.public_id),
        cnic_back_img && deleteCloudinaryFile(cnic_back_img.public_id),
        document && deleteCloudinaryFile(document.public_id),
      ]);
      return responseSender(res, 400, false, "Vendor Not Added");
    }

    await pool.query("COMMIT");
    return responseSender(res, 201, true, "Vendor Added", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getVendor = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows, rowCount } = await pool.query(
      `SELECT v.* , c.ccy  , p.payment_term_name  FROM vendor v 
      LEFT JOIN currency c ON v.currency_id = c.id 
      LEFT JOIN payment_term p ON v.payment_term_id = p.id
      WHERE v.id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Vendor Not Found");
    }

    return responseSender(res, 200, true, "Vendor Retrieved", rows[0]);
  } catch (error) {
    next(error);
  }
};

const getVendors = async (req, res, next) => {
  try {
    let {
      page,
      limit,
      sortField,
      sortOrder,
      search,
      first_name,
      last_name,
      vendor_display_name,
      company_name,
      payment_term_id,
    } = req.query;
    page = parseInt(page, 10) || 1;
    limit = parseInt(limit, 10) || 100;
    sortField = sortField || "created_at";
    sortOrder = sortOrder || "DESC";
    const offset = (page - 1) * limit;

    let queryParams = [];
    let whereClauses = [];

    if (search) {
      whereClauses.push(
        `(company_name ILIKE $${queryParams.length + 1
        } OR vendor_display_name ILIKE $${queryParams.length + 1
        } OR first_name ILIKE $${queryParams.length + 1})`
      );
      queryParams.push(`%${search}%`);
    }

    if (first_name) {
      whereClauses.push(
        `LOWER(first_name) = LOWER($${queryParams.length + 1})`
      );
      queryParams.push(first_name);
    }

    if (last_name) {
      whereClauses.push(`LOWER(last_name) = LOWER($${queryParams.length + 1})`);
      queryParams.push(last_name);
    }

    if (vendor_display_name) {
      whereClauses.push(
        `LOWER(vendor_display_name) = LOWER($${queryParams.length + 1})`
      );
      queryParams.push(vendor_display_name);
    }

    if (company_name) {
      whereClauses.push(
        `LOWER(company_name) = LOWER($${queryParams.length + 1})`
      );
      queryParams.push(company_name);
    }

    if (payment_term_id) {
      whereClauses.push(`payment_term_id = $${queryParams.length + 1}`);
      queryParams.push(payment_term_id);
    }

    let whereClause =
      whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const query = `
      SELECT v.*, c.ccy, p.payment_term_name
      FROM vendor v
      LEFT JOIN currency c ON v.currency_id = c.id
      LEFT JOIN payment_term p ON v.payment_term_id = p.id
      ${whereClause}
      ORDER BY ${sortField} ${sortOrder}
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    queryParams.push(limit, offset);

    const { rows, rowCount } = await pool.query(query, queryParams);

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Vendors Not Found");
    }

    const countQuery = `
      SELECT COUNT(*)
      FROM vendor v
      ${whereClause}
    `;
    const totalRowsResult = await pool.query(
      countQuery,
      queryParams.slice(0, -2)
    ); // Pass only the filter parameters for the count query

    return responseSender(res, 200, true, "Vendors Retrieved", {
      vendors: rows,
      pagination: pagination(totalRowsResult.rows[0].count, limit, page),
    });
  } catch (error) {
    next(error);
  }
};

const updateVendor = async (req, res, next) => {
  const { id } = req.params;
  const {
    v_type,
    provider_type,
    first_name,
    last_name,
    company_name,
    vendor_display_name,
    email,
    phone_no,
    address,
    city,
    country,
    work_no,
    zip_code,
    state,
    fax_number,
    shipping_address,
    currency_id,
    payment_term_id,
    contact_person,
  } = req.body;

  try {
    const { rows, rowCount } = await pool.query(
      `SELECT * FROM vendor WHERE id = $1`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Vendor Not Found");
    }

    let query = `UPDATE vendor SET `;
    let index = 1;
    let values = [];

    if (v_type) {
      query += `v_type = $${index}, `;
      values.push(v_type);
      index++;
    }
    if (provider_type) {
      query += `provider_type = $${index}, `;
      values.push(provider_type);
      index++;
    }
    if (first_name) {
      query += `first_name = $${index}, `;
      values.push(first_name);
      index++;
    }
    if (last_name) {
      query += `last_name = $${index}, `;
      values.push(last_name);
      index++;
    }
    if (company_name) {
      query += `company_name = $${index}, `;
      values.push(company_name);
      index++;
    }
    if (vendor_display_name) {
      query += `vendor_display_name = $${index}, `;
      values.push(vendor_display_name);
      index++;
    }
    if (email) {
      query += `email = $${index}, `;
      values.push(email);
      index++;
    }
    if (phone_no) {
      query += `phone_no = $${index}, `;
      values.push(phone_no);
      index++;
    }
    if (address) {
      query += `address = $${index}, `;
      values.push(address);
      index++;
    }
    if (city) {
      query += `city = $${index}, `;
      values.push(city);
      index++;
    }
    if (country) {
      query += `country = $${index}, `;
      values.push(country);
      index++;
    }
    if (work_no) {
      query += `work_no = $${index}, `;
      values.push(work_no);
      index++;
    }
    if (zip_code) {
      query += `zip_code = $${index}, `;
      values.push(zip_code);
      index++;
    }
    if (state) {
      query += `state = $${index}, `;
      values.push(state);
      index++;
    }
    if (fax_number) {
      query += `fax_number = $${index}, `;
      values.push(fax_number);
      index++;
    }
    if (shipping_address) {
      query += `shipping_address = $${index}, `;
      values.push(shipping_address);
      index++;
    }
    if (currency_id) {
      query += `currency_id = $${index}, `;
      values.push(currency_id);
      index++;
    }
    if (payment_term_id) {
      query += `payment_term_id = $${index}, `;
      values.push(payment_term_id);
      index++;
    }
    if (contact_person) {
      query += `contact_person = $${index}, `;
      values.push(contact_person);
      index++;
    }

    if (req.files) {
      if (req.files["cnic_front_img"] && req.files["cnic_front_img"][0]) {
        const cnicFrontImg = rows[0]?.cnic_front_img;

        if (cnicFrontImg) {
          // If CNIC front image exists, update it
          const updateCnicFrontImg = await updateCloudinaryFile(
            req.files["cnic_front_img"][0].path,
            cnicFrontImg.public_id
          );
          query += `cnic_front_img = $${index},`;
          values.push(updateCnicFrontImg);
          index++;
        } else {
          // If CNIC front image doesn't exist, upload it
          const uploadCnicFrontImg = await uploadToCloudinary(
            req.files["cnic_front_img"][0].path,
            "Vendor"
          );
          query += `cnic_front_img = $${index}, `;
          values.push(uploadCnicFrontImg);
          index++;
        }
      }

      if (req.files["cnic_back_img"] && req.files["cnic_back_img"][0]) {
        const cnicBackImg = rows[0]?.cnic_back_img;

        if (cnicBackImg) {
          // If CNIC back image exists, update it
          const updateCnicBackImg = await updateCloudinaryFile(
            req.files["cnic_back_img"][0].path,
            cnicBackImg.public_id
          );
          query += `cnic_back_img = $${index},`;
          values.push(updateCnicBackImg);
          index++;
        } else {
          // If CNIC back image doesn't exist, upload it
          const uploadCnicBackImg = await uploadToCloudinary(
            req.files["cnic_back_img"][0].path,
            "Vendor"
          );
          query += `cnic_back_img = $${index}, `;
          values.push(uploadCnicBackImg);
          index++;
        }
      }

      if (req.files["document"] && req.files["document"][0]) {
        const document = rows[0]?.document;

        if (document) {
          // If document exists, update it
          const updateDocument = await updateCloudinaryFile(
            req.files["document"][0].path,
            document.public_id
          );
          query += `document = $${index},`;
          values.push(updateDocument);
          index++;
        } else {
          // If document doesn't exist, upload it
          const uploadDocument = await uploadToCloudinary(
            req.files["document"][0].path,
            "Vendor"
          );
          query += `document = $${index}, `;
          values.push(uploadDocument);
          index++;
        }
      }
    }

    query = query.replace(/,\s*$/, "");

    query += ` WHERE id = $${index} RETURNING *`;
    values.push(id);

    const { rows: vendor, rowCount: vendorCount } = await pool.query(
      query,
      values
    );

    if (vendorCount === 0) {
      await pool.query("ROLLBACK");
      return responseSender(res, 404, false, "Vendor not Found", null, req);
    }

    return responseSender(res, 200, true, "Vendor Updated", vendor[0]);
  } catch (error) {
    next(error);
  }
};

const deleteVendor = async (req, res, next) => {
  const { id } = req.params;
  try {
    const { rows, rowCount } = await pool.query(
      `DELETE FROM vendor WHERE id = $1 RETURNING *`,
      [id]
    );

    if (rowCount === 0) {
      return responseSender(res, 404, false, "Vendor Not Found");
    }

    if (rows[0].document.public_id) {
      await deleteCloudinaryFile(rows[0].document.public_id);
    }

    return responseSender(res, 200, true, "Vendor Deleted", rows[0]);
  } catch {
    next(error);
  }
};

module.exports = {
  createVendor,
  getVendor,
  getVendors,
  updateVendor,
  deleteVendor,
};
