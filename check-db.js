// Script para verificar la estructura de la tabla usuarios
const mysql = require("mysql2/promise");
require("dotenv").config();

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL no está configurado en .env");
    process.exit(1);
  }

  const pool = mysql.createPool({
    uri: process.env.DATABASE_URL,
    waitForConnections: true,
    connectionLimit: 1,
  });

  try {
    console.log("🔍 Verificando conexión a la base de datos...");
    const [result] = await pool.execute("SELECT 1");
    console.log("✅ Conexión exitosa");

    console.log("\n📋 Columnas de la tabla 'usuarios':");
    const [columns] = await pool.execute(
      "DESCRIBE usuarios"
    );
    
    console.table(columns);

    console.log("\n📊 Total de usuarios registrados:");
    const [count] = await pool.execute("SELECT COUNT(*) as total FROM usuarios");
    console.log(`Total: ${count[0].total} usuarios`);

    if (count[0].total > 0) {
      console.log("\n👥 Primeros 5 usuarios (sin contraseñas):");
      const [users] = await pool.execute(
        "SELECT id, nombre, email, created_at FROM usuarios LIMIT 5"
      );
      console.table(users);
    }

  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.code === "ECONNREFUSED") {
      console.error("   No se pudo conectar a la base de datos.");
      console.error("   Verifica que MySQL esté corriendo y DATABASE_URL sea correcto.");
    } else if (error.code === "ER_NO_SUCH_TABLE") {
      console.error("   La tabla 'usuarios' no existe.");
      console.error("   Necesitas crearla primero.");
    }
  } finally {
    await pool.end();
  }
}

checkDatabase();
