const express = require("express");
const admin = require("firebase-admin");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 4000;

const serviceAccount = require("./firebase-config.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const games = db.collection("games");

app.use(cors()); // permite peticiones desde frontend
app.use(express.json());

// GET all games
app.get("/games", async (req, res) => {
  try {
    const snapshot = await games.get();
    const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET one game
app.post("/games/data", (req, res) => {
  // Espera un array de juegos en el body
  const gamesData = req.body;
  // Puedes agregar validaciones aquí si lo deseas
  res.json({
    message: "Datos de juegos recibidos correctamente",
    games: gamesData,
  });
});
app.get("/games/:id", async (req, res) => {
  try {
    const doc = await games.doc(req.params.id).get();
    if (!doc.exists) return res.status(404).json({ error: "Not found" });
    res.json({ id: doc.id, ...doc.data() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST new game
app.post("/games", async (req, res) => {
  try {
    // Recibe todos los parámetros del body según gamesData
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

    // Todos los campos son obligatorios
    if (
      !title ||
      price === undefined ||
      originalPrice === undefined ||
      discount === undefined ||
      !image ||
      !category ||
      !platform ||
      rating === undefined ||
      !description ||
      !requirements ||
      !requirements.os ||
      !requirements.processor ||
      !requirements.memory ||
      !requirements.graphics ||
      !requirements.storage ||
      !features ||
      !releaseDate ||
      !publisher ||
      featured === undefined
    ) {
      return res.status(400).json({ error: "Faltan campos obligatorios" });
    }

    const newGame = {
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
      createdAt: new Date(),
    };
    const ref = await games.add(newGame);
    res.status(201).json({ id: ref.id, ...newGame });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update game
app.put("/games/:id", async (req, res) => {
  try {
    const { title, price, platform, image_url } = req.body;
    const updatedGame = { title, price, platform, image_url };
    await games.doc(req.params.id).update(updatedGame);
    res.json({ id: req.params.id, ...updatedGame });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE game
app.delete("/games/:id", async (req, res) => {
  try {
    await games.doc(req.params.id).delete();
    res.status(204).send();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en http://localhost:${PORT}`);
});
