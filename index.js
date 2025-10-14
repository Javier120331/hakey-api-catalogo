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
    // Validación completa para PUT/POST
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
    // Validación parcial para PATCH - solo validar campos presentes
    if (
      title !== undefined &&
      (typeof title !== "string" || title.trim() === "")
    )
      errors.push("title debe ser un string no vacío");

    if (price !== undefined && (typeof price !== "number" || price < 0))
      errors.push("price debe ser un número >= 0");

    if (
      originalPrice !== undefined &&
      (typeof originalPrice !== "number" || originalPrice < 0)
    )
      errors.push("originalPrice debe ser un número >= 0");

    if (
      discount !== undefined &&
      (typeof discount !== "number" || discount < 0 || discount > 100)
    )
      errors.push("discount debe ser un número entre 0-100");

    if (
      image !== undefined &&
      (typeof image !== "string" || image.trim() === "")
    )
      errors.push("image debe ser un string no vacío");

    if (
      category !== undefined &&
      (typeof category !== "string" || category.trim() === "")
    )
      errors.push("category debe ser un string no vacío");

    if (platform !== undefined) {
      if (
        !Array.isArray(platform) ||
        !platform.every((p) => typeof p === "string")
      )
        errors.push("platform debe ser un array de strings");
    }

    if (
      rating !== undefined &&
      (typeof rating !== "number" || rating < 0 || rating > 5)
    )
      errors.push("rating debe ser un número entre 0-5");

    if (
      description !== undefined &&
      (typeof description !== "string" || description.trim() === "")
    )
      errors.push("description debe ser un string no vacío");

    if (requirements !== undefined) {
      if (typeof requirements !== "object" || Array.isArray(requirements))
        errors.push("requirements debe ser un objeto");
      else {
        // Validar estructura solo si se proporciona requirements
        const requiredProps = [
          "os",
          "processor",
          "memory",
          "graphics",
          "storage",
        ];
        for (const prop of requiredProps) {
          if (
            requirements[prop] !== undefined &&
            typeof requirements[prop] !== "string"
          )
            errors.push(`requirements.${prop} debe ser un string`);
        }
      }
    }

    if (features !== undefined) {
      if (
        !Array.isArray(features) ||
        !features.every((f) => typeof f === "string")
      )
        errors.push("features debe ser un array de strings");
    }

    if (
      releaseDate !== undefined &&
      (typeof releaseDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(releaseDate))
    )
      errors.push("releaseDate debe tener formato YYYY-MM-DD");

    if (
      publisher !== undefined &&
      (typeof publisher !== "string" || publisher.trim() === "")
    )
      errors.push("publisher debe ser un string no vacío");

    if (featured !== undefined && typeof featured !== "boolean")
      errors.push("featured debe ser un boolean");
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
    console.log(
      `[PUT /api/games/${req.params.id}] Request body:`,
      JSON.stringify(req.body, null, 2)
    );

    const errs = validateGamePayload(req.body, true);
    if (errs.length > 0) {
      console.log(`[PUT /api/games/${req.params.id}] Validation errors:`, errs);
      return res.status(400).json({
        error: "Faltan campos obligatorios o tienen formato inválido",
        missing: errs,
      });
    }

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

    console.log(
      `[PUT /api/games/${req.params.id}] Executing SQL with values:`,
      vals
    );
    const [result] = await pool.execute(updateSQL, vals);

    if (result.affectedRows === 0) {
      console.log(`[PUT /api/games/${req.params.id}] Game not found`);
      return res.status(404).json({ error: "Juego no encontrado" });
    }

    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      req.params.id,
    ]);
    console.log(`[PUT /api/games/${req.params.id}] Update successful`);
    return res.json(rows[0]);
  } catch (e) {
    console.error(`[PUT /api/games/${req.params.id}] Error:`, e);
    return res.status(500).json({
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
  }
});

// Update partial (PATCH /games/:id)
app.patch("/api/games/:id", async (req, res) => {
  try {
    console.log(
      `[PATCH /api/games/${req.params.id}] Request body:`,
      JSON.stringify(req.body, null, 2)
    );

    // Validar que el body no esté vacío
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log(`[PATCH /api/games/${req.params.id}] Empty request body`);
      return res
        .status(400)
        .json({ error: "No se proporcionaron campos para actualizar" });
    }

    const errs = validateGamePayload(req.body, false);
    if (errs.length > 0) {
      console.log(
        `[PATCH /api/games/${req.params.id}] Validation errors:`,
        errs
      );
      return res.status(400).json({ error: "Payload inválido", details: errs });
    }

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

        // Mapear nombres de JS a columnas de DB
        if (key === "originalPrice") column = "original_price";
        if (key === "releaseDate") column = "release_date";

        // Serializar JSON para campos complejos
        if (
          key === "platform" ||
          key === "requirements" ||
          key === "features"
        ) {
          val = JSON.stringify(val);
        }

        set.push(`${column}=?`);
        values.push(val);
      }
    }

    if (values.length === 0) {
      console.log(
        `[PATCH /api/games/${req.params.id}] No valid fields to update`
      );
      return res
        .status(400)
        .json({ error: "No hay campos válidos para actualizar" });
    }

    // Agregar updated_at
    set.push(`updated_at=CURRENT_TIMESTAMP`);

    const sql = `UPDATE games SET ${set.join(", ")} WHERE id=?`;
    values.push(req.params.id);

    console.log(`[PATCH /api/games/${req.params.id}] Executing SQL:`, sql);
    console.log(`[PATCH /api/games/${req.params.id}] With values:`, values);

    const [result] = await pool.execute(sql, values);

    if (result.affectedRows === 0) {
      console.log(`[PATCH /api/games/${req.params.id}] Game not found`);
      return res.status(404).json({ error: "Juego no encontrado" });
    }

    const [rows] = await pool.execute("SELECT * FROM games WHERE id = ?", [
      req.params.id,
    ]);
    console.log(`[PATCH /api/games/${req.params.id}] Update successful`);
    return res.json(rows[0]);
  } catch (e) {
    console.error(`[PATCH /api/games/${req.params.id}] Error:`, e);
    return res.status(500).json({
      error: e.message,
      stack: process.env.NODE_ENV === "development" ? e.stack : undefined,
    });
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

// api para usuarios de hakey

app.get("/api/usuarios", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM usuarios ORDER BY id DESC"
    );
    return res.json(rows);
  } catch (e) {
    console.error(`[GET /api/usuarios/] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/usuarios/:id", async (req, res) => {
  try {
    const [rows] = await pool.execute("SELECT * FROM usuarios WHERE id = ?", [
      req.params.id,
    ]);
    if (rows.length === 0)
      return res.status(404).json({
        error: "No se encontro el usuario, fue borrado o nunca existio",
      });
    console.log(`[GET /api/usuarios/${req.params.id}] User found:`, rows[0]);
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/usuarios", async (req, res) => {
  try {
    const { nombre, email, password } = req.body;
    const insertSQL = `INSERT INTO usuarios (nombre, email, password) VALUES (?,?,?)`;
    const vals = [nombre, email, password];
    const [result] = await pool.execute(insertSQL, vals);
    const [rows] = await pool.execute("SELECT * FROM usuarios WHERE id = ?", [
      result.insertId,
    ]);
    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error(`[POST /api/usuarios] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
});

// ejemplo de json para crear un usuario
/*{
    "nombre" : "Javier",
    "email":"jr.tecnon",
    "password":"1203317380Jj"
}*/

app.delete("/api/usuarios/:id", async (req, res) => {
  try {
    const [result] = await pool.execute("DELETE FROM usuarios WHERE id=?", [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Not found" });
    return res.status(204).send();
  } catch (e) {
    console.error(`[DELETE /api/usuarios/${req.params.id}] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
});

app.put("/api/usuarios/:id", async (req, res) => {
  try {
    console.log(
      `[PUT /api/usuarios/${req.params.id}] Request body:`,
      JSON.stringify(req.body, null, 2)
    );

    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      console.log(
        `[PUT /api/usuarios/${req.params.id}] Validation errors: Missing fields`
      );
      return res.status(400).json({
        error: "Faltan campos requeridos",
      });
    }

    const [result] = await pool.execute(
      "UPDATE usuarios SET nombre = ?, email = ?, password = ? WHERE id = ?",
      [nombre, email, password, req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        error: "No se encontro el usuario, fue borrado o nunca existio",
      });
    }

    return res.json({ id: req.params.id, nombre, email });
  } catch (e) {
    console.error(`[PUT /api/usuarios/${req.params.id}] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
});

app.patch("/api/usuarios/:id", async (req, res) => {
  try {
    console.log(
      `[PATCH /api/usuarios/${req.params.id}] Request body:`,
      JSON.stringify(req.body, null, 2)
    );
    if (!req.body || Object.keys(req.body).length === 0) {
      console.log(`[PATCH /api/usuarios/${req.params.id}] Empty request body`);
      return res
        .status(400)
        .json({ error: "No se proporcionaron campos para actualizar" });
    }
    const allowed = ["nombre", "email", "password"];
    const set = [];
    const values = [];
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        let column = key;
        let val = req.body[key];
        set.push(`${column}=?`);
        values.push(val);
      }
    }
    if (values.length === 0) {
      console.log(
        `[PATCH /api/usuarios/${req.params.id}] No valid fields to update`
      );
      return res
        .status(400)
        .json({ error: "No hay campos válidos para actualizar" });
    }
    const sql = `UPDATE usuarios SET ${set.join(", ")} WHERE id=?`;
    values.push(req.params.id);
    console.log(`[PATCH /api/usuarios/${req.params.id}] Executing SQL:`, sql);
    console.log(`[PATCH /api/usuarios/${req.params.id}] With values:`, values);
    const [result] = await pool.execute(sql, values);
    if (result.affectedRows === 0) {
      console.log(`[PATCH /api/usuarios/${req.params.id}] User not found`);
      return res.status(404).json({ error: "Usuario no encontrado" });
    }
    const [rows] = await pool.execute("SELECT * FROM usuarios WHERE id = ?", [
      req.params.id,
    ]);
    console.log(`[PATCH /api/usuarios/${req.params.id}] Update successful`);
    return res.json(rows[0]);
  } catch (e) {
    console.error(`[PATCH /api/usuarios/${req.params.id}] Error:`, e);
    return res.status(500).json({ error: e.message });
  }
});

app.post("/api/usuarios/login", async (req, res) => {
  try {
    // 1. Recibe el correo y la contraseña del cuerpo de la petición
    const { email, password } = req.body;

    // Valida que los datos no estén vacíos
    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "El correo y la contraseña son obligatorios" });
    }

    // 2. Busca en la base de datos un usuario con ese correo
    const [rows] = await pool.execute(
      "SELECT * FROM usuarios WHERE email = ?",
      [email]
    );

    // 3. Si no se encuentra un usuario, devuelve un error 401
    // Es importante usar un mensaje genérico para no revelar si un correo existe o no
    if (rows.length === 0) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const user = rows[0];

    // 4. Compara la contraseña de la petición con la guardada (como texto plano)
    // Si no coinciden, devuelve el mismo error 401
    if (user.password !== password) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    // 5. Si todo coincide, la validación es exitosa
    // Se crea un objeto de usuario sin la contraseña para devolverlo
    const { password: userPassword, ...safeUser } = user;

    return res.status(200).json({
      message: "Login exitoso",
      usuario: safeUser,
    });
  } catch (e) {
    // Manejo de errores inesperados del servidor
    console.error(`[POST /api/login] Error:`, e);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
});

//{
//"email": "jr.tecnon@gmail.com",
//"password": "1203317380Jj"

//}
