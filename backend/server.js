const express = require('express');
const { Client } = require('pg');
const cors = require('cors');

const app = express();
const port = 8000;

app.use(cors());

// Configura la conexión a la base de datos (ajusta los valores)
const dbConfig = {
  host: "168.90.177.232",
  user: "cid_admin_user",
  password: "vmtdmtcidccm",
  database: "bbdd-monitoreo-cid",
  port: 2024,
};

const client = new Client(dbConfig); // Crea un nuevo cliente


// Conecta a la base de datos
client.connect((err) => {
  if (err) {
    console.error("Error al conectar a la base de datos PostgreSQL:", err); // Mensaje corregido
    return;
  }
  console.log("Conectado a la base de datos PostgreSQL");
});

app.get('/empresas', async (req, res) => {
  try {
    const result = await client.query('SELECT id_eot_vmt_hex, eot_nombre FROM eots WHERE permisionario = true ORDER BY eot_nombre');
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener empresas:', err);
    res.status(500).send('Error al obtener empresas');
  }
});


// Ruta para obtener los itinerarios de una empresa
// Backend: Obtener itinerarios y sus shapes por empresa
// Ordenar primero los que tienen shapes y luego los que no
app.get('/empresas/:empresaId/itinerarios', async (req, res) => {
  const empresaId = req.params.empresaId;
  try {
    const result = await client.query(`
      SELECT
        c.ruta_hex,
        c.linea,
        c.ramal,
        c.origen,
        c.destino,
        json_agg(json_build_object('lat', ST_Y(punto), 'lng', ST_X(punto))) AS shape_points
      FROM catalogo_rutas c
      JOIN eots e ON c.id_eot_catalogo = e.cod_catalogo
      LEFT JOIN LATERAL (
        SELECT (ST_DumpPoints(c.geom)).geom AS punto
      ) AS puntos ON true
      WHERE e.id_eot_vmt_hex = $1
      GROUP BY c.ruta_hex, c.linea, c.ramal, c.origen, c.destino
      ORDER BY (COUNT(punto) = 0) ASC, c.ruta_hex
    `, [empresaId]);

    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener itinerarios:', err);
    res.status(500).send('Error al obtener itinerarios');
  }
});

app.get('/itinerarios/:rutaHex/paradas', async (req, res) => {
  const rutaHex = req.params.rutaHex;
  try {
    const result = await client.query(`
      SELECT nombre, latitud AS lat, longitud AS lng
      FROM paradas
      WHERE ruta_hex = $1
      ORDER BY orden
    `, [rutaHex]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error al obtener paradas:', err);
    res.status(500).send('Error al obtener paradas');
  }
});


// // Ruta para obtener el shape de un itinerario
// app.get('/itinerarios/:rutaHex/shape', async (req, res) => {
//   const rutaHex = req.params.rutaHex;
//   try {
//     const result = await client.query(`
//       SELECT ST_X(point) AS lng, ST_Y(point) AS lat
//       FROM (
//         SELECT (ST_DumpPoints(shape)).geom AS point
//         FROM catalogo_rutas
//         WHERE ruta_hex = $1
//       ) AS puntos
//     `, [rutaHex]);

//     res.json(result.rows);
//   } catch (err) {
//     console.error('Error al obtener shape desde catalogo_rutas:', err);
//     res.status(500).send('Error al obtener shape');
//   }
// });

app.listen(port, () => {
  console.log(`Servidor backend escuchando en http://localhost:${port}`);
});