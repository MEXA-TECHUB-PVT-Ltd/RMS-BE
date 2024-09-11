CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS currency (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    ccy VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE
    IF NOT EXISTS vendor (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
        v_type VARCHAR(255) NOT NULL CHECK (v_type IN ('SUPPLIER', 'STORE')),
        provider_type VARCHAR(255) NOT NULL CHECK (provider_type IN ('SERVICE', 'PRODUCTS')),
        first_name VARCHAR(255) DEFAULT NULL,
        last_name VARCHAR(255) DEFAULT NULL,
        company_name VARCHAR(255) DEFAULT NULL,
        vendor_display_name VARCHAR(255) NOT NULL,
        email VARCHAR(255)  UNIQUE NOT NULL,
        phone_no VARCHAR(255)  UNIQUE NOT NULL,
        work_no VARCHAR(255) DEFAULT NULL,
        country VARCHAR(255) DEFAULT NULL,
        address VARCHAR(255) NOT NULL,
        city VARCHAR(255) DEFAULT NULL,
        state VARCHAR(255) DEFAULT NULL,
        zip_code VARCHAR(255) DEFAULT NULL,
        fax_number VARCHAR(255) DEFAULT NULL,
        shipping_address VARCHAR(255) DEFAULT NULL,
        currency_id UUID REFERENCES currency (id) ON DELETE CASCADE,
        payment_term_id UUID REFERENCES payment_term (id) ON DELETE CASCADE,
        document JSONB DEFAULT NULL,
        cnic_front_img JSONB DEFAULT NULL,
        cnic_back_img JSONB DEFAULT NULL,
        contact_person JSONB DEFAULT NULL,
        po_sending_status BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW (),
        updated_at TIMESTAMP DEFAULT NOW ()
    );

CREATE TABLE IF NOT EXISTS payment_term (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    payment_term_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category VARCHAR(50),
    unit VARCHAR(50),
    quantity INTEGER,
    usage_quantity INTEGER,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS product_category (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    name VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS item (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    type VARCHAR(50) CHECK (type IN ('PRODUCT', 'SERVICE')),
    name VARCHAR(255),
    product_category UUID REFERENCES product_category (id),
    unit_category TEXT NOT NULL,
    quantity_units TEXT NOT NULL,
    product_units TEXT NOT NULL,
    usage_unit TEXT NOT NULL,
    product_catalog VARCHAR(50) CHECK (product_catalog IN ('CONSUMER', 'ASSETS')),
    description VARCHAR(50),
    stock_in_hand INT NOT NULL,
    opening_stock_rate INT NOT NULL,
    reorder_unit INT NOT NULL,
    inventory_description VARCHAR(50),
    image TEXT,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS item_preferred_vendor (
    item_id UUID REFERENCES item (id),
    vendor_id UUID REFERENCES vendor (id),
    PRIMARY KEY (item_id, vendor_id)
);

CREATE TABLE IF NOT EXISTS purchase_items(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    item_id UUID REFERENCES item (id) ON DELETE CASCADE,
    available_stock NUMERIC NOT NULL,
    required_quantity NUMERIC NOT NULL,
    price NUMERIC NOT NULL,
    preffered_vendor_ids TEXT [] NOT NULL,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS purchase_requisition (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    pr_number VARCHAR(255) NOT NULL,
    status VARCHAR(255) CHECK (
        status IN ('ACCEPTED', 'REJECTED', 'DRAFT', 'PENDING')
    ),
    pr_detail VARCHAR(255) DEFAULT NULL,
    priority VARCHAR(255) NOT NULL CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
    requested_by VARCHAR(255) NOT NULL,
    requested_date TIMESTAMP NOT NULL,
    required_date TIMESTAMP NOT NULL,
    shipment_preferences VARCHAR(255) DEFAULT NULL,
    document JSONB DEFAULT NULL,
    delivery_address VARCHAR(255) NOT NULL,
    purchase_item_ids TEXT [] NOT NULL,
    total_amount VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);

CREATE TABLE IF NOT EXISTS category (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    category_name VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW ()
);  


CREATE TABLE IF NOT EXISTS pr_comments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pr_id UUID REFERENCES purchase_requisition(id),
    user_id UUID REFERENCES users(id),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS coupon(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(255) UNIQUE NOT NULL,
    percentage NUMERIC(10) NOT NULL,
    status VARCHAR(255) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW() 
);

-- CREATE TABLE IF NOT EXISTS ordered_recipies (
--     id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--     recipe_id UUID REFERENCES recipes(id) NOT NULL,
--     quantity NUMERIC NOT NULL,
--     created_at TIMESTAMP DEFAULT NOW(),
--     updated_at TIMESTAMP DEFAULT NOW()
-- );

CREATE TABLE IF NOT EXISTS ordered_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID REFERENCES item(id) NOT NULL,
    quantity NUMERIC NOT NULL,
    size VARCHAR(255) NOT NULL CHECK (size IN ('SMALL' , 'MEDIUM' , 'LARGE')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos(
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_number VARCHAR(255) NOT NULL,
    order_type VARCHAR(255) NOT NULL  CHECK (order_type IN ('DINE IN' , 'TAKE WAY' , 'DELIVERY')),
    order_recipies TEXT[] NOT NULL,
    modifiers TEXT,
    side_dishes TEXT[],
    drinks TEXT[],
    note TEXT,
    order_date TIMESTAMP NOT NULL ,
    table_number VARCHAR(255),
    preparation_time TIMESTAMP,
    discount NUMERIC ,
    total_payment NUMERIC,
    order_status VARCHAR(255) CHECK (order_status IN ('RECEIVED', 'PREPARATION' , 'READY')),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
); 

CREATE TABLE IF NOT EXISTS recipes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_name VARCHAR(50), 
    category UUID REFERENCES category(id),
    difficulty_level VARCHAR(50) CHECK (difficulty_level IN ('HIGH', 'MEDIUM', 'LOW')),
    added_by VARCHAR(50),
    price INT,
    cooking_time TEXT,
    nutritional_info VARCHAR(100),
    allergen_info VARCHAR(100),
    equipment_needed VARCHAR(100),
    presentation_instructions VARCHAR(100),
    side_order VARCHAR(100),
    image VARCHAR(255),
    preparation_instructions VARCHAR(500),
    serving_details TEXT,
    signature BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipe_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    item_id UUID REFERENCES item(id),
    quantity TEXT,
    measuring_unit VARCHAR(20),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

 CREATE TABLE 
    IF NOT EXISTS purchase_order (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4 (),
    purchase_order_number VARCHAR(255) NOT NULL,
    purchase_requisition_id UUID NOT NULL,
    created_at TIMESTAMP DEFAULT NOW (),
    updated_at TIMESTAMP DEFAULT NOW (),
    status VARCHAR(255) DEFAULT 'DRAFT' CHECK (
        status IN ('DRAFT', 'ISSUED', 'FULLY DELIVERED', 'PARTIALLY RECEIVED', 'RECEIVED', 'CANCELLED')
    ), 
    UNIQUE(purchase_requisition_id)
); 

CREATE TABLE IF NOT EXISTS purchase_order_preferred_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    purchase_order_id UUID NOT NULL,
    purchase_item_id UUID NOT NULL,
    vendor_id UUID NOT NULL,
    UNIQUE (purchase_order_id, purchase_item_id, vendor_id)
); 

CREATE TABLE IF NOT EXISTS purchase_receives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_order(id),
  purchase_received_number VARCHAR(255) UNIQUE,
  received_date DATE NOT NULL,
  description TEXT,
  pr_invoice BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS purchase_receive_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_receive_id UUID NOT NULL REFERENCES purchase_receives(id),
  vendor_id UUID NOT NULL REFERENCES vendor(id),
  item_id UUID NOT NULL REFERENCES purchase_items(id),
  total_quantity INTEGER NOT NULL,
  quantity_received INTEGER NOT NULL,
  remaining_quantity TEXT NOT NULL,
  rate DECIMAL(10, 2),
  total_cost DECIMAL(10, 2) GENERATED ALWAYS AS (quantity_received * rate) STORED,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoice_tax (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tax_value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  total_items INTEGER NOT NULL, -- Total number of items in the invoice
  bill_date DATE NOT NULL, -- The date when the bill is issued
  bill_number VARCHAR(255) UNIQUE NOT NULL, -- Auto-generated bill number
  due_date DATE, -- Optional due date
  total_price TEXT NOT NULL, -- Total price of the invoice
  tax_id UUID NOT NULL REFERENCES invoice_tax(id), -- Single tax ID from invoice_tax table
  payment_term_id UUID NOT NULL REFERENCES payment_term(id), -- Foreign key reference to payment_term table
  status VARCHAR(50) CHECK (status IN ('Paid', 'Draft', 'Unpaid')) NOT NULL, -- Status of the invoice
  net_price TEXT NOT NULL, -- net price of the invoice after adding tax
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Junction table to associate multiple purchase_receive_ids with an invoice
CREATE TABLE IF NOT EXISTS invoice_purchase_receives (
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  purchase_receive_id UUID NOT NULL REFERENCES purchase_receives(id) ON DELETE CASCADE,
  PRIMARY KEY (invoice_id, purchase_receive_id)
);

