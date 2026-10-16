# Dragon Realm

Proyecto web 2D con API autoritativa y PostgreSQL para pruebas online.

## Estado

Base inicial de autenticación y persistencia. El combate multijugador completo todavía debe migrarse al servidor antes de considerarlo listo para producción.

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

## Investigación de arquitectura

El documento [Investigación técnica: Ngọc Rồng Online → Dragon Realm](docs/INVESTIGACION_NRO_ARQUITECTURA.md) registra fuentes, hallazgos confirmados, incógnitas, límites de licencia y el plan de implementación. Distingue entre lo que se observó en el código de referencia y las reglas propias de Dragon Realm.
