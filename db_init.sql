-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  cust_id TEXT PRIMARY KEY,
  cust_name TEXT NOT NULL,
  email TEXT,
  phone_no TEXT,
  house_no TEXT,
  street_name TEXT,
  city_name TEXT
);

-- Suppliers
CREATE TABLE IF NOT EXISTS suppliers (
  supplier_id TEXT PRIMARY KEY,
  supplier_name TEXT NOT NULL,
  enterprise_name TEXT,
  email_id TEXT,
  phone_no TEXT,
  address TEXT
);

-- Products
CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  product_name TEXT NOT NULL,
  category TEXT,
  price REAL DEFAULT 0,
  quantity_stock INTEGER DEFAULT 0,
  supplier_id TEXT,
  FOREIGN KEY(supplier_id) REFERENCES suppliers(supplier_id)
);

-- Stock entries
CREATE TABLE IF NOT EXISTS stock (
  stock_id TEXT PRIMARY KEY,
  supplier_id TEXT,
  product_id TEXT,
  quantity INTEGER,
  date_added TEXT,
  FOREIGN KEY(supplier_id) REFERENCES suppliers(supplier_id),
  FOREIGN KEY(product_id) REFERENCES products(product_id)
);

-- Sales
CREATE TABLE IF NOT EXISTS sales (
  sales_id TEXT PRIMARY KEY,
  product_id TEXT,
  invoice_id TEXT,
  quantity_sold INTEGER,
  price_total REAL,
  FOREIGN KEY(product_id) REFERENCES products(product_id),
  FOREIGN KEY(invoice_id) REFERENCES invoices(invoice_id)
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  invoice_id TEXT PRIMARY KEY,
  cust_id TEXT,
  total_amt REAL,
  date TEXT,
  payment_mode TEXT,
  FOREIGN KEY(cust_id) REFERENCES customers(cust_id)
);

-- Loans
CREATE TABLE IF NOT EXISTS loans (
  loan_id TEXT PRIMARY KEY,
  cust_id TEXT,
  loan_amount REAL,
  interest_rate REAL,
  balance REAL,
  FOREIGN KEY(cust_id) REFERENCES customers(cust_id)
);

-- Payments (loan payments)
CREATE TABLE IF NOT EXISTS payments (
  pay_id TEXT PRIMARY KEY,
  loan_id TEXT,
  payment_date TEXT,
  amount_paid REAL,
  payment_mode TEXT,
  FOREIGN KEY(loan_id) REFERENCES loans(loan_id)
);
