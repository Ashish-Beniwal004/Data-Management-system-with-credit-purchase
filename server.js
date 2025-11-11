// server.js
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const cors = require("cors");
const morgan = require("morgan");
const { body, param, query, validationResult } = require("express-validator");
const path = require("path");
const fs = require("fs");

const app = express();

// === Database setup ===
const dbFile = path.join(__dirname, "retail.db");
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) console.error("❌ Database connection error:", err.message);
  else console.log("✅ Connected to SQLite database.");
});

// Run schema (create tables if not exist)
const schemaSql = fs.readFileSync(path.join(__dirname, "db_init.sql"), "utf8");
db.exec(schemaSql, (err) => {
  if (err) console.error("Schema error:", err.message);
});

// === Express middlewares ===
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());
app.use(morgan("dev"));

// === Helper to handle validation errors ===
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
}

// === Seed initial data if empty ===
db.get("SELECT COUNT(*) AS c FROM customers", (err, row) => {
  if (err) return console.error("Seed check failed:", err.message);
  if (row && row.c === 0) {
    console.log("🌱 Seeding initial data...");
    db.serialize(() => {
      db.run(
        `INSERT INTO customers (cust_id,cust_name,email,phone_no,house_no,street_name,city_name)
         VALUES ('C001','Asha Kumar','asha@example.com','9876543210','12A','MG Road','Jaipur'),
                ('C002','Ravi Singh','ravi@example.com','9123456780','5B','Station St','Delhi')`
      );
      db.run(
        `INSERT INTO suppliers (supplier_id,supplier_name,enterprise_name,email_id,phone_no,address)
         VALUES ('S001','Radha Supplies','Radha Co','contact@radha.com','9000000001','12 Market Rd, Jaipur')`
      );
      db.run(
        `INSERT INTO products (product_id,product_name,category,price,quantity_stock,supplier_id)
         VALUES ('P001','Widget A','Tools',250.0,20,'S001'),
                ('P002','Gadget B','Gadgets',450.0,10,'S001')`
      );
      db.run(
        `INSERT INTO stock (stock_id,supplier_id,product_id,quantity,date_added)
         VALUES ('ST001','S001','P001',20,'2025-10-01')`
      );
      db.run(
        `INSERT INTO invoices (invoice_id,cust_id,total_amt,date,payment_mode)
         VALUES ('I001','C001',500,'2025-10-15','Card')`
      );
      db.run(
        `INSERT INTO sales (sales_id,product_id,invoice_id,quantity_sold,price_total)
         VALUES ('SA001','P001','I001',2,500)`
      );
      db.run(
        `INSERT INTO loans (loan_id,cust_id,loan_amount,interest_rate,balance)
         VALUES ('L001','C002',10000,10,8000)`
      );
      db.run(
        `INSERT INTO payments (pay_id,loan_id,payment_date,amount_paid,payment_mode)
         VALUES ('P001','L001','2025-10-20',2000,'Cash')`
      );
    });
  }
});

// === Root route ===
app.get("/", (req, res) =>
  res.send("Retail Loan Inventory Backend running. Try /api/customers")
);

/* ----------------------------
   ROUTES: Customers
   ---------------------------- */
app.get(
  "/api/customers",
  [query("q").optional().isString(), query("page").optional().toInt()],
  handleValidation,
  (req, res) => {
    const q = req.query.q || "";
    const sql = q
      ? `SELECT * FROM customers WHERE lower(cust_id||' '||cust_name||' '||email||' '||phone_no||' '||city_name)
         LIKE ? ORDER BY cust_name`
      : `SELECT * FROM customers ORDER BY cust_name`;
    const params = q ? [`%${q.toLowerCase()}%`] : [];
    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  }
);

app.get("/api/customers/:id", [param("id").isString()], handleValidation, (req, res) => {
  db.get("SELECT * FROM customers WHERE cust_id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: "Customer not found" });
    res.json(row);
  });
});

app.post(
  "/api/customers",
  [
    body("cust_id").isString(),
    body("cust_name").isString().notEmpty(),
    body("email").optional().isEmail(),
    body("phone_no").optional().isString(),
  ],
  handleValidation,
  (req, res) => {
    const { cust_id, cust_name, email, phone_no, house_no, street_name, city_name } = req.body;
    db.run(
      `INSERT INTO customers (cust_id,cust_name,email,phone_no,house_no,street_name,city_name)
       VALUES (?,?,?,?,?,?,?)`,
      [cust_id, cust_name, email, phone_no, house_no, street_name, city_name],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({ message: "Customer created", id: cust_id });
      }
    );
  }
);

app.put("/api/customers/:id", [param("id").isString()], handleValidation, (req, res) => {
  const id = req.params.id;
  db.get("SELECT * FROM customers WHERE cust_id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: "Not found" });

    db.run(
      `UPDATE customers
       SET cust_name = COALESCE(?, cust_name),
           email = COALESCE(?, email),
           phone_no = COALESCE(?, phone_no),
           house_no = COALESCE(?, house_no),
           street_name = COALESCE(?, street_name),
           city_name = COALESCE(?, city_name)
       WHERE cust_id = ?`,
      [
        req.body.cust_name,
        req.body.email,
        req.body.phone_no,
        req.body.house_no,
        req.body.street_name,
        req.body.city_name,
        id,
      ],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.json({ message: "Updated" });
      }
    );
  });
});

app.delete("/api/customers/:id", (req, res) => {
  db.run("DELETE FROM customers WHERE cust_id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  });
});

/* ----------------------------
   ROUTES: Suppliers
   ---------------------------- */
app.get("/api/suppliers", (req, res) => {
  db.all("SELECT * FROM suppliers ORDER BY supplier_name", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/suppliers/:id", (req, res) => {
  db.get("SELECT * FROM suppliers WHERE supplier_id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ message: "Supplier not found" });
    res.json(row);
  });
});

app.post(
  "/api/suppliers",
  [body("supplier_id").isString(), body("supplier_name").isString().notEmpty()],
  handleValidation,
  (req, res) => {
    const { supplier_id, supplier_name, enterprise_name, email_id, phone_no, address } = req.body;
    db.run(
      `INSERT INTO suppliers (supplier_id,supplier_name,enterprise_name,email_id,phone_no,address)
       VALUES (?,?,?,?,?,?)`,
      [supplier_id, supplier_name, enterprise_name, email_id, phone_no, address],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({ message: "Created", id: supplier_id });
      }
    );
  }
);

/* ----------------------------
   ROUTES: Products
   ---------------------------- */
app.get("/api/products", (req, res) => {
  db.all(
    `SELECT p.*, s.supplier_name
     FROM products p LEFT JOIN suppliers s ON p.supplier_id = s.supplier_id
     ORDER BY product_name`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

app.post(
  "/api/products",
  [
    body("product_id").isString(),
    body("product_name").isString().notEmpty(),
    body("price").optional().isNumeric(),
    body("quantity_stock").optional().isInt(),
  ],
  handleValidation,
  (req, res) => {
    const { product_id, product_name, category, price, quantity_stock, supplier_id } = req.body;
    db.run(
      `INSERT INTO products (product_id,product_name,category,price,quantity_stock,supplier_id)
       VALUES (?,?,?,?,?,?)`,
      [product_id, product_name, category, price || 0, quantity_stock || 0, supplier_id],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        res.status(201).json({ message: "Product added" });
      }
    );
  }
);

/* ----------------------------
   ROUTES: Stock
   ---------------------------- */
app.get("/api/stock", (req, res) => {
  db.all(
    `SELECT s.*, p.product_name
     FROM stock s LEFT JOIN products p ON s.product_id = p.product_id
     ORDER BY date_added DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

/* ----------------------------
   ROUTES: Loans, Invoices, Payments
   ---------------------------- */
app.get("/api/loans", (req, res) => {
  db.all("SELECT * FROM loans ORDER BY loan_id DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get("/api/payments", (req, res) => {
  db.all("SELECT * FROM payments ORDER BY payment_date DESC", (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/* ----------------------------
   Dashboard Summary
   ---------------------------- */
app.get("/api/summary", (req, res) => {
  let summary = {};
  db.get("SELECT COUNT(*) AS c FROM customers", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    summary.totalCustomers = row.c;
    db.get("SELECT COUNT(*) AS c FROM products", (err2, row2) => {
      summary.totalProducts = row2.c;
      db.get("SELECT COUNT(*) AS c FROM loans", (err3, row3) => {
        summary.totalLoans = row3.c;
        db.get("SELECT SUM(balance) AS s FROM loans", (err4, row4) => {
          summary.pendingPayments = row4.s || 0;
          res.json(summary);
        });
      });
    });
  });
});
/* ----------------------------
   ROUTES: Invoices
   ---------------------------- */
app.get('/api/invoices', (req, res) => {
  db.all('SELECT * FROM invoices ORDER BY date DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/invoices', [
  body('invoice_id').isString(),
  body('cust_id').isString(),
  body('total_amt').isNumeric()
], handleValidation, (req, res) => {
  const { invoice_id, cust_id, total_amt, date, payment_mode } = req.body;
  db.run(
    'INSERT INTO invoices (invoice_id, cust_id, total_amt, date, payment_mode) VALUES (?, ?, ?, ?, ?)',
    [invoice_id, cust_id, total_amt, date || new Date().toISOString().slice(0,10), payment_mode || 'Cash'],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      res.status(201).json({ message: 'Invoice created', id: invoice_id });
    }
  );
});

/* ----------------------------
   ROUTES: Sales
   ---------------------------- */
app.get('/api/sales', (req, res) => {
  db.all('SELECT * FROM sales ORDER BY sales_id DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/sales', [
  body('sales_id').isString(),
  body('product_id').isString(),
  body('quantity_sold').isInt({ min: 1 }),
  body('price_total').isNumeric()
], handleValidation, (req, res) => {
  const { sales_id, product_id, invoice_id, quantity_sold, price_total } = req.body;
  db.run(
    'INSERT INTO sales (sales_id, product_id, invoice_id, quantity_sold, price_total) VALUES (?, ?, ?, ?, ?)',
    [sales_id, product_id, invoice_id || null, quantity_sold, price_total],
    function(err) {
      if (err) return res.status(400).json({ error: err.message });
      // Update product stock quantity
      db.run('UPDATE products SET quantity_stock = quantity_stock - ? WHERE product_id = ?', [quantity_sold, product_id]);
      res.status(201).json({ message: 'Sale recorded', id: sales_id });
    }
  );
});


/* ----------------------------
   Error handling & start
   ---------------------------- */
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
const HOST = "localhost";
app.listen(PORT, HOST, () => {
  console.log(`✅ Backend listening on http://${HOST}:${PORT}`);
});
