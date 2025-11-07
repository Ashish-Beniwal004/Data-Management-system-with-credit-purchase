// server.js
const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const morgan = require('morgan');
const { body, param, query, validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'retail.db');
const db = new Database(DB_FILE);

// Create tables if not exist (simple migrations)
const schemaSql = fs.readFileSync(path.join(__dirname, 'db_init.sql'), 'utf8');
db.exec(schemaSql);

// Optional: seed some data if empty (idempotent)
(function seed() {
  const count = db.prepare('SELECT COUNT(1) as c FROM customers').get().c;
  if (count === 0) {
    const insertCustomer = db.prepare('INSERT INTO customers (cust_id,cust_name,email,phone_no,house_no,street_name,city_name) VALUES (?,?,?,?,?,?,?)');
    insertCustomer.run('C001','Asha Kumar','asha@example.com','9876543210','12A','MG Road','Jaipur');
    insertCustomer.run('C002','Ravi Singh','ravi@example.com','9123456780','5B','Station St','Delhi');

    const insertSupplier = db.prepare('INSERT INTO suppliers (supplier_id,supplier_name,enterprise_name,email_id,phone_no,address) VALUES (?,?,?,?,?,?)');
    insertSupplier.run('S001','Radha Supplies','Radha Co','contact@radha.com','9000000001','12 Market Rd, Jaipur');

    const insertProduct = db.prepare('INSERT INTO products (product_id,product_name,category,price,quantity_stock,supplier_id) VALUES (?,?,?,?,?,?)');
    insertProduct.run('P001','Widget A','Tools',250.0,20,'S001');
    insertProduct.run('P002','Gadget B','Gadgets',450.0,10,'S001');

    const insertStock = db.prepare('INSERT INTO stock (stock_id,supplier_id,product_id,quantity,date_added) VALUES (?,?,?,?,?)');
    insertStock.run('ST001','S001','P001',20,'2025-10-01');

    const insertInvoice = db.prepare('INSERT INTO invoices (invoice_id,cust_id,total_amt,date,payment_mode) VALUES (?,?,?,?,?)');
    insertInvoice.run('I001','C001',500,'2025-10-15','Card');

    const insertSale = db.prepare('INSERT INTO sales (sales_id,product_id,invoice_id,quantity_sold,price_total) VALUES (?,?,?,?,?)');
    insertSale.run('SA001','P001','I001',2,500);

    const insertLoan = db.prepare('INSERT INTO loans (loan_id,cust_id,loan_amount,interest_rate,balance) VALUES (?,?,?,?,?)');
    insertLoan.run('L001','C002',10000,10,8000);

    const insertPayment = db.prepare('INSERT INTO payments (pay_id,loan_id,payment_date,amount_paid,payment_mode) VALUES (?,?,?,?,?)');
    insertPayment.run('P001','L001','2025-10-20',2000,'Cash');
  }
})();

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Simple middleware to return validation errors
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// Generic helpers: pagination & search wrapper
function paginateAndSearch(baseQuery, params = {}, q = null, page = 1, perPage = 25) {
  // baseQuery should be a SQL string possibly with WHERE placeholders already applied
  const offset = (page - 1) * perPage;
  const items = db.prepare(`${baseQuery} LIMIT ? OFFSET ?`).all(...Object.values(params), perPage, offset);
  return items;
}

/* ----------------------------
   ROUTES: Customers
   ---------------------------- */
app.get('/api/customers', [
  query('q').optional().isString(),
  query('page').optional().toInt()
], handleValidation, (req, res) => {
  const q = req.query.q || '';
  const page = req.query.page || 1;
  let results;
  if (q) {
    results = db.prepare(`SELECT * FROM customers WHERE lower(cust_id||' '||cust_name||' '||email||' '||phone_no||' '||city_name) LIKE ? ORDER BY cust_name LIMIT ? OFFSET ?`).all(`%${q.toLowerCase()}%`, 1000, 0);
  } else {
    results = db.prepare('SELECT * FROM customers ORDER BY cust_name LIMIT ? OFFSET ?').all(1000,0);
  }
  res.json(results);
});

app.get('/api/customers/:id', [param('id').isString()], handleValidation, (req,res)=>{
  const row = db.prepare('SELECT * FROM customers WHERE cust_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Customer not found' });
  res.json(row);
});

app.post('/api/customers', [
  body('cust_id').isString(),
  body('cust_name').isString().notEmpty(),
  body('email').optional().isEmail(),
  body('phone_no').optional().isString()
], handleValidation, (req,res)=>{
  const { cust_id, cust_name, email, phone_no, house_no, street_name, city_name } = req.body;
  try {
    db.prepare(`INSERT INTO customers (cust_id,cust_name,email,phone_no,house_no,street_name,city_name) VALUES (?,?,?,?,?,?,?)`)
      .run(cust_id,cust_name,email,phone_no,house_no,street_name,city_name);
    res.status(201).json({ message:'Customer created', id: cust_id });
  } catch(err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/customers/:id', [
  param('id').isString(),
  body('cust_name').optional().isString(),
  body('email').optional().isEmail()
], handleValidation, (req,res)=>{
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM customers WHERE cust_id = ?').get(id);
  if (!row) return res.status(404).json({ message:'Not found' });

  const upd = db.prepare(`UPDATE customers SET cust_name = COALESCE(?,cust_name), email = COALESCE(?,email), phone_no = COALESCE(?,phone_no), house_no=COALESCE(?,house_no), street_name=COALESCE(?,street_name), city_name=COALESCE(?,city_name) WHERE cust_id = ?`);
  upd.run(req.body.cust_name, req.body.email, req.body.phone_no, req.body.house_no, req.body.street_name, req.body.city_name, id);
  res.json({ message:'Updated' });
});

app.delete('/api/customers/:id', [param('id').isString()], handleValidation, (req,res)=>{
  const info = db.prepare('DELETE FROM customers WHERE cust_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ message:'Not found' });
  res.json({ message:'Deleted' });
});

/* ----------------------------
   ROUTES: Suppliers
   ---------------------------- */
app.get('/api/suppliers', (req,res)=>{
  const items = db.prepare('SELECT * FROM suppliers ORDER BY supplier_name').all();
  res.json(items);
});
app.get('/api/suppliers/:id', (req,res)=>{
  const row = db.prepare('SELECT * FROM suppliers WHERE supplier_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ message: 'Supplier not found' });
  res.json(row);
});
app.post('/api/suppliers', [
  body('supplier_id').isString(),
  body('supplier_name').isString().notEmpty()
], handleValidation, (req,res)=>{
  const { supplier_id, supplier_name, enterprise_name, email_id, phone_no, address } = req.body;
  try {
    db.prepare(`INSERT INTO suppliers (supplier_id,supplier_name,enterprise_name,email_id,phone_no,address) VALUES (?,?,?,?,?,?)`)
      .run(supplier_id,supplier_name,enterprise_name,email_id,phone_no,address);
    res.status(201).json({ message:'Created', id: supplier_id });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.put('/api/suppliers/:id', (req,res)=>{
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM suppliers WHERE supplier_id = ?').get(id);
  if (!row) return res.status(404).json({ message:'Not found' });
  db.prepare(`UPDATE suppliers SET supplier_name = COALESCE(?,supplier_name), enterprise_name = COALESCE(?,enterprise_name), email_id = COALESCE(?,email_id), phone_no = COALESCE(?,phone_no), address = COALESCE(?,address) WHERE supplier_id = ?`)
    .run(req.body.supplier_name, req.body.enterprise_name, req.body.email_id, req.body.phone_no, req.body.address, id);
  res.json({ message:'Updated' });
});
app.delete('/api/suppliers/:id', (req,res)=>{
  const info = db.prepare('DELETE FROM suppliers WHERE supplier_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ message:'Not found' });
  res.json({ message:'Deleted' });
});

/* ----------------------------
   ROUTES: Products
   ---------------------------- */
app.get('/api/products', (req,res)=>{
  // include supplier name join
  const rows = db.prepare(`SELECT p.*, s.supplier_name FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id ORDER BY product_name`).all();
  res.json(rows);
});
app.get('/api/products/:id', (req,res)=>{
  const row = db.prepare('SELECT * FROM products WHERE product_id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ message:'Not found' });
  res.json(row);
});
app.post('/api/products', [
  body('product_id').isString(),
  body('product_name').isString().notEmpty(),
  body('price').optional().isNumeric(),
  body('quantity_stock').optional().isInt()
], handleValidation, (req,res)=>{
  try {
    db.prepare(`INSERT INTO products (product_id,product_name,category,price,quantity_stock,supplier_id) VALUES (?,?,?,?,?,?)`)
      .run(req.body.product_id, req.body.product_name, req.body.category, req.body.price || 0, req.body.quantity_stock || 0, req.body.supplier_id);
    res.status(201).json({ message:'Created' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});
app.put('/api/products/:id', (req,res)=>{
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM products WHERE product_id = ?').get(id);
  if (!row) return res.status(404).json({ message:'Not found' });
  db.prepare(`UPDATE products SET product_name=COALESCE(?,product_name), category=COALESCE(?,category), price=COALESCE(?,price), quantity_stock=COALESCE(?,quantity_stock), supplier_id=COALESCE(?,supplier_id) WHERE product_id = ?`)
    .run(req.body.product_name, req.body.category, req.body.price, req.body.quantity_stock, req.body.supplier_id, id);
  res.json({ message:'Updated' });
});
app.delete('/api/products/:id', (req,res)=>{
  const info = db.prepare('DELETE FROM products WHERE product_id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ message:'Not found' });
  res.json({ message:'Deleted' });
});

/* ----------------------------
   ROUTES: Stock
   ---------------------------- */
app.get('/api/stock', (req,res)=>{
  const rows = db.prepare(`SELECT s.*, p.product_name FROM stock s LEFT JOIN products p ON s.product_id = p.product_id ORDER BY date_added DESC`).all();
  res.json(rows);
});
app.post('/api/stock', [
  body('stock_id').isString(),
  body('product_id').isString(),
  body('quantity').isInt({ min:1 })
], handleValidation, (req,res)=>{
  try {
    db.prepare('INSERT INTO stock (stock_id,supplier_id,product_id,quantity,date_added) VALUES (?,?,?,?,?)')
      .run(req.body.stock_id, req.body.supplier_id, req.body.product_id, req.body.quantity, req.body.date_added || new Date().toISOString().slice(0,10));
    // update product quantity_stock
    db.prepare('UPDATE products SET quantity_stock = quantity_stock + ? WHERE product_id = ?').run(req.body.quantity, req.body.product_id);
    res.status(201).json({ message:'Stock added' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

/* ----------------------------
   ROUTES: Invoices & Sales
   ---------------------------- */
// create invoice
app.get('/api/invoices', (req,res) => {
  const rows = db.prepare('SELECT * FROM invoices ORDER BY date DESC').all();
  res.json(rows);
});
app.post('/api/invoices', [
  body('invoice_id').isString(),
  body('cust_id').isString(),
  body('total_amt').isNumeric()
], handleValidation, (req,res)=>{
  try {
    db.prepare('INSERT INTO invoices (invoice_id,cust_id,total_amt,date,payment_mode) VALUES (?,?,?,?,?)')
      .run(req.body.invoice_id, req.body.cust_id, req.body.total_amt, req.body.date || new Date().toISOString().slice(0,10), req.body.payment_mode);
    res.status(201).json({ message:'Invoice created' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

// sales
app.get('/api/sales', (req,res)=>{
  const rows = db.prepare('SELECT * FROM sales ORDER BY sales_id DESC').all();
  res.json(rows);
});
app.post('/api/sales', [
  body('sales_id').isString(),
  body('product_id').isString(),
  body('quantity_sold').isInt({ min:1 }),
  body('price_total').isNumeric()
], handleValidation, (req,res)=>{
  const { sales_id, product_id, invoice_id, quantity_sold, price_total } = req.body;
  try {
    const ins = db.prepare('INSERT INTO sales (sales_id,product_id,invoice_id,quantity_sold,price_total) VALUES (?,?,?,?,?)');
    ins.run(sales_id, product_id, invoice_id || null, quantity_sold, price_total);
    // reduce product stock
    db.prepare('UPDATE products SET quantity_stock = quantity_stock - ? WHERE product_id = ?').run(quantity_sold, product_id);
    res.status(201).json({ message:'Sale recorded' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

/* ----------------------------
   ROUTES: Loans & Payments
   ---------------------------- */
app.get('/api/loans', (req,res) => {
  const rows = db.prepare('SELECT * FROM loans ORDER BY loan_id DESC').all();
  res.json(rows);
});
app.post('/api/loans', [
  body('loan_id').isString(),
  body('cust_id').isString(),
  body('loan_amount').isNumeric()
], handleValidation, (req,res)=>{
  try {
    db.prepare('INSERT INTO loans (loan_id,cust_id,loan_amount,interest_rate,balance) VALUES (?,?,?,?,?)')
      .run(req.body.loan_id, req.body.cust_id, req.body.loan_amount, req.body.interest_rate || 0, req.body.balance || req.body.loan_amount);
    res.status(201).json({ message:'Loan recorded' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

app.get('/api/payments', (req,res) => {
  const rows = db.prepare('SELECT * FROM payments ORDER BY payment_date DESC').all();
  res.json(rows);
});
app.post('/api/payments', [
  body('pay_id').isString(),
  body('loan_id').isString(),
  body('amount_paid').isNumeric(),
], handleValidation, (req,res)=>{
  try {
    db.prepare('INSERT INTO payments (pay_id,loan_id,payment_date,amount_paid,payment_mode) VALUES (?,?,?,?,?)')
      .run(req.body.pay_id, req.body.loan_id, req.body.payment_date || new Date().toISOString().slice(0,10), req.body.amount_paid, req.body.payment_mode || 'Cash');
    // adjust loan balance
    db.prepare('UPDATE loans SET balance = balance - ? WHERE loan_id = ?').run(req.body.amount_paid, req.body.loan_id);
    res.status(201).json({ message:'Payment recorded' });
  } catch(err){ res.status(400).json({ error: err.message }); }
});

/* ----------------------------
   Simple dashboard endpoints (aggregates)
   ---------------------------- */
app.get('/api/summary', (req,res) => {
  const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
  const totalProducts = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  const totalLoans = db.prepare('SELECT COUNT(*) as c FROM loans').get().c;
  const pendingPayments = db.prepare('SELECT SUM(balance) as s FROM loans').get().s || 0;
  res.json({ totalCustomers, totalProducts, totalLoans, pendingPayments });
});

/* ----------------------------
   Error handling & start
   ---------------------------- */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
