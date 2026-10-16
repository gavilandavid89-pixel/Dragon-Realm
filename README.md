# Dragon Realm

Prototipo web de un RPG 2D inspirado en juegos de progresión tipo MMORPG. La API Node.js + PostgreSQL es la autoridad para el estado del personaje; el navegador solo envía acciones y presenta resultados.

## Estado implementado

- Registro e inicio de sesión con contraseñas hasheadas y JWT.
- Estado de personaje guardado en PostgreSQL.
- Mejoras de Vida, Ki y Ataque con Potencial.
- Misión inicial: derrotar 10 muñecos para recibir 50 Poder y 50 Potencial una sola vez.
- Combate contra un Saibaman explorador de 100 HP y configuraciones de prueba para Saibamen de 250K/500K/700K/1M HP, Raditz, Vegeta y Vegeta Ozaru.
- El muñeco de entrenamiento es personal; los demás enemigos usan una aparición compartida persistida en PostgreSQL, con vida, muerte y temporizador de reaparición globales.
- Poder y Potencial ganados juntos por golpe según el tier del enemigo.
- Botín calculado en servidor al morir: oro, gemas y equipo; no se vuelve a tirar loot por cada golpe.
- Inventario con acumulación por tipo de objeto, requisitos de Poder para equipar y bonificaciones de equipo.
- GitHub Actions ejecuta comprobación de sintaxis y pruebas automatizadas.
- Primera estructura de mundo: mapas `earth_training` y `earth_wilderness`, NPC iniciales y spawns persistidos por `spawn_id`.
- `GET /api/world` devuelve mapas, NPC y el estado persistido de los spawns para el cliente autenticado.

## Balance propio inicial

Los valores de combate y botín de Dragon Realm son decisiones de diseño configurables, no fórmulas extraídas del juego original. La configuración vive en `server/game-config.js`; la tirada de loot está en `server/loot-service.js`.

- Oro: 20% en enemigos normales, 30% en jefes; el oro de jefes recibe un multiplicador ×1,30.
- Gemas: 0,1% en enemigos normales, 0,5% en jefes.
- Equipo: guantes 0,5%, pantalones 2%, armadura 1%, botas 3%, ajustado por velocidad de eliminación.
- El inventario tiene un límite inicial de 30 tipos de objeto; si se llena, el servidor informa los drops de equipo que no pudo recoger.

## Límites actuales

- La tabla `world_mob_spawns` y `GET /api/world` ya describen mapas y apariciones persistidas por `spawn_id`. El cliente ya puede atacar por `spawnId`; el servidor bloquea y actualiza la fila de cada aparición dentro de la misma transacción que guarda el personaje. `mobId` se conserva temporalmente para compatibilidad con clientes antiguos.
- Los jefes de millones de HP son configuraciones para balance y pruebas; aún no hay movimiento, IA, alcance, animaciones, habilidades ni sincronización en tiempo real.
- El equipo se consigue mediante loot; todavía no hay tiendas, misiones de saga, límites de Kaio, grupos, oleadas ni una pantalla de mapa.
- El primer muñeco mantiene su comportamiento especial de entrenamiento y no suelta botín.
- Los valores de oro de tiers superiores y las bonificaciones del equipo son decisiones iniciales que deberán ajustarse mediante pruebas.

## Ejecutar

Requisitos: Node.js 20+, PostgreSQL y variables de entorno `DATABASE_URL`, `JWT_SECRET` (mínimo 32 caracteres) y opcionalmente `CLIENT_ORIGIN`.

```bash
npm install
npm run check
npm test
npm start
```

La API expone `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`, `/api/world`, `/api/mobs` y `/api/game/action`.

## Investigación de referencia

Ver [docs/INVESTIGACION_NRO_ARQUITECTURA.md](docs/INVESTIGACION_NRO_ARQUITECTURA.md). Ese documento separa hechos observados, inferencias y decisiones propias; no afirma conocer fórmulas del servidor oficial.
