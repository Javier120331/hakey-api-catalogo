const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

// Configure MySQL pool for Aiven. Set DATABASE_URL in env.
// For Aiven, SSL is usually required
const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

/*
  Expected MySQL table (run once in your Aiven database):
  CREATE TABLE games (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title TEXT NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    discount DECIMAL(5,2) NOT NULL,
    image TEXT NOT NULL,
    category TEXT NOT NULL,
    platform JSON NOT NULL,
    rating DECIMAL(3,2) NOT NULL,
    description TEXT NOT NULL,
    requirements JSON NOT NULL,
    features JSON NOT NULL,
    release_date DATE NOT NULL,
    publisher TEXT NOT NULL,
    featured BOOLEAN NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );
*/

// Helper: validate game payload (types and required fields)
function validateGamePayload(body, requireAll = true) {
  const errors = [];
  const {
    title,
    price,
    originalPrice,
    discount,
    image,
    category,
    platform,
    rating,
    description,
    requirements,
    features,
    releaseDate,
    publisher,
    featured,
  } = body || {};

  if (requireAll) {
    if (!title || typeof title !== "string") errors.push("title (string)");
    if (price === undefined || typeof price !== "number" || price < 0)
      errors.push("price (number >= 0)");
    if (
      originalPrice === undefined ||
      typeof originalPrice !== "number" ||
      originalPrice < 0
    )
      errors.push("originalPrice (number >= 0)");
    if (
      discount === undefined ||
      typeof discount !== "number" ||
      discount < 0 ||
      discount > 100
    )
      errors.push("discount (number 0-100)");
    if (!image || typeof image !== "string") errors.push("image (string URL)");
    if (!category || typeof category !== "string")
      errors.push("category (string)");
    if (
      !platform ||
      !Array.isArray(platform) ||
      !platform.every((p) => typeof p === "string")
    )
      errors.push("platform (array of strings)");
    if (
      rating === undefined ||
      typeof rating !== "number" ||
      rating < 0 ||
      rating > 5
    )
      errors.push("rating (number 0-5)");
    if (!description || typeof description !== "string")
      errors.push("description (string)");

    if (!requirements || typeof requirements !== "object")
      errors.push("requirements (object)");
    else {
      if (!requirements.os || typeof requirements.os !== "string")
        errors.push("requirements.os (string)");
      if (!requirements.processor || typeof requirements.processor !== "string")
        errors.push("requirements.processor (string)");
      if (!requirements.memory || typeof requirements.memory !== "string")
        errors.push("requirements.memory (string)");
      if (!requirements.graphics || typeof requirements.graphics !== "string")
        errors.push("requirements.graphics (string)");
      if (!requirements.storage || typeof requirements.storage !== "string")
        errors.push("requirements.storage (string)");
    }

    if (
      !features ||
      !Array.isArray(features) ||
      !features.every((f) => typeof f === "string")
    )
      errors.push("features (array of strings)");
    if (
      !releaseDate ||
      typeof releaseDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
    )
      errors.push("releaseDate (YYYY-MM-DD)");
    if (!publisher || typeof publisher !== "string")
      errors.push("publisher (string)");
    if (featured === undefined || typeof featured !== "boolean")
      errors.push("featured (boolean)");
  } else {
    // Partial update: if provided, validate shapes minimally
    if (requirements && typeof requirements !== "object")
      errors.push("requirements (invalid)");
    if (
      platform &&
      (!Array.isArray(platform) ||
        !platform.every((p) => typeof p === "string"))
    )
      errors.push("platform (array of strings)");
    if (
      features &&
      (!Array.isArray(features) ||
        !features.every((f) => typeof f === "string"))
    )
      errors.push("features (array of strings)");
    if (
      rating !== undefined &&
      (typeof rating !== "number" || rating < 0 || rating > 5)
    )
      errors.push("rating (number 0-5)");
    if (price !== undefined && (typeof price !== "number" || price < 0))
      errors.push("price (number >= 0)");
    if (
      originalPrice !== undefined &&
      (typeof originalPrice !== "number" || originalPrice < 0)
    )
      errors.push("originalPrice (number >= 0)");
    if (
      discount !== undefined &&
      (typeof discount !== "number" || discount < 0 || discount > 100)
    )
      errors.push("discount (number 0-100)");
    if (
      releaseDate &&
      (typeof releaseDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate))
    )
      errors.push("releaseDate (YYYY-MM-DD)");
    if (featured !== undefined && typeof featured !== "boolean")
      errors.push("featured (boolean)");
  }

  return errors;
}
// Create (POST /games)
app.post("/games", async (req, res) => {
  try {
    const errs = validateGamePayload(req.body, true);
    if (errs.length > 0)
      return res
        .status(400)
        .json({ error: "Faltan campos obligatorios", missing: errs });

    const {
      title,
      price,
      originalPrice,
      discount,
      image,
      category,
      platform,
      rating,
      description,
      requirements,
      features,
      releaseDate,
      publisher,
      featured,
    } = req.body;

    const insertSQL = `INSERT INTO games (title, price, original_price, discount, image, category, platform, rating, description, requirements, features, release_date, publisher, featured)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
    const vals = [
      title,
      price,
      originalPrice,
      discount,
      image,
      category,
      JSON.stringify(platform),
      rating,
      description,
      JSON.stringify(requirements),
      JSON.stringify(features),
      releaseDate,
      publisher,
      featured,
    ];

    const [result] = await pool.execute(insertSQL, vals);
    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      result.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Read all (GET /games)
app.get("/api/games", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM games ORDER BY id DESC");
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Read one (GET /games/:id)
app.get("/api/games/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Update replace (PUT /games/:id)
app.put("/api/games/:id", async (req, res) => {
  try {
    const errs = validateGamePayload(req.body, true);
    if (errs.length > 0)
      return res
        .status(400)
        .json({ error: "Faltan campos obligatorios", missing: errs });

    const {
      title,
      price,
      originalPrice,
      discount,
      image,
      category,
      platform,
      rating,
      description,
      requirements,
      features,
      releaseDate,
      publisher,
      featured,
    } = req.body;

    const updateSQL = `UPDATE games SET title=?, price=?, original_price=?, discount=?, image=?, category=?, platform=?, rating=?, description=?, requirements=?, features=?, release_date=?, publisher=?, featured=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`;
    const vals = [
      title,
      price,
      originalPrice,
      discount,
      image,
      category,
      JSON.stringify(platform),
      rating,
      description,
      JSON.stringify(requirements),
      JSON.stringify(features),
      releaseDate,
      publisher,
      featured,
      req.params.id,
    ];

    const [result] = await pool.execute(updateSQL, vals);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });

    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      req.params.id,
    ]);
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Update partial (PATCH /games/:id)
app.patch("/api/games/:id", async (req, res) => {
  try {
    const errs = validateGamePayload(req.body, false);
    if (errs.length > 0)
      return res.status(400).json({ error: "Payload inválido", details: errs });

    // Build dynamic SET clause safely
    const allowed = [
      "title",
      "price",
      "originalPrice",
      "discount",
      "image",
      "category",
      "platform",
      "rating",
      "description",
      "requirements",
      "features",
      "releaseDate",
      "publisher",
      "featured",
    ];
    const set = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let column = key;
        let val = req.body[key];
        // map JS names to DB columns
        if (key === "originalPrice") column = "original_price";
        if (key === "releaseDate") column = "release_date";
        if (key === "platform" || key === "requirements" || key === "features")
          val = JSON.stringify(val);
        set.push(`${column}=?`);
        values.push(val);
      }
    }
    if (values.length === 0)
      return res.status(400).json({ error: "No hay campos para actualizar" });
    // updated_at
    set.push(`updated_at=CURRENT_TIMESTAMP`);
    const sql = `UPDATE games SET ${set.join(", ")} WHERE id=?`;
    values.push(req.params.id);
    const [result] = await pool.execute(sql, values);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });

    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      req.params.id,
    ]);
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Delete (DELETE /games/:id)
app.delete("/api/games/:id", async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM games WHERE id=?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });
    return res.status(204).send();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Export the express app for local server or cloud deployment
// If run directly (node index.js), start an HTTP server for local testing
if (require.main === module) {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () =>
    console.log(`API listening on http://localhost:${PORT}`)
  );
} else {
  module.exports = app;
}
