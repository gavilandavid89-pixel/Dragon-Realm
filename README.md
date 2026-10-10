# Dragon Realm

Proyecto web 2D con API autoritativa y PostgreSQL para pruebas online.

## Estado

Base inicial de autenticación y persistencia. El combate multijugador completo todavía debe migrarse al servidor antes de considerarlo listo para producción.

## Despliegue

- Render Web Service: `npm install` / `npm start`
- Variables obligatorias: `DATABASE_URL`, `JWT_SECRET` (32+ caracteres)
- Health check: `/health`
- Base de datos: ejecutar `db/schema.sql` (el servidor también inicializa el esquema al arrancar).

Nunca incluir secretos en el repositorio ni en el cliente web.
