# Dragon Realm

Proyecto web 2D con API autoritativa y PostgreSQL para pruebas online.

## Estado actual

- Registro/inicio de sesión y persistencia de personajes.
- Primer bucle PvE en servidor: golpe al muñeco, cooldown y misión de 10 derrotas.
- Configuración de balance y servicio de tiradas de loot con pruebas.
- El loot todavía no está conectado a enemigos que suelten objetos: el muñeco de entrenamiento no da botín.
- Todavía faltan enemigos con HP/respawn, inventario de equipo, misiones generales, mapas jugables y multijugador en tiempo real.

## Desarrollo

- Requisitos: Node.js 20+
- Instalar dependencias: `npm install`
- Comprobar sintaxis: `npm run check`
- Ejecutar pruebas unitarias: `npm test`
- Iniciar servidor: `npm start`

## Despliegue

- Render Web Service: `npm install` / `npm start`
- Variables obligatorias: `DATABASE_URL`, `JWT_SECRET` (32+ caracteres)
- Health check: `/health`
- Base de datos: ejecutar `db/schema.sql` (el servidor también inicializa el esquema al arrancar).

Nunca incluir secretos en el repositorio ni en el cliente web.

## Comprobación automática

El workflow [Dragon Realm checks](.github/workflows/test.yml) ejecuta el chequeo de sintaxis y las pruebas unitarias en Node.js 20.

## Investigación de arquitectura

El documento [Investigación técnica: Ngọc Rồng Online → Dragon Realm](docs/INVESTIGACION_NRO_ARQUITECTURA.md) registra fuentes, hallazgos confirmados, incógnitas, límites de licencia y el plan de implementación. Distingue entre lo que se observó en el código de referencia y las reglas propias de Dragon Realm.
