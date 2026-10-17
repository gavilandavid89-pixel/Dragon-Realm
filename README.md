# Dragon Realm

Prototipo web de un RPG 2D inspirado en juegos de progresión tipo MMORPG. La API Node.js + PostgreSQL es la autoridad para el estado del personaje; el navegador solo envía acciones y presenta resultados.

## Estado implementado

- Registro e inicio de sesión con contraseñas hasheadas y JWT.
- Estado de personaje guardado en PostgreSQL.
- Mejoras de Vida, Ki y Ataque con Potencial.
- Misión inicial: derrotar 10 muñecos para recibir 50 Poder y 50 Potencial una sola vez.
- Misión del Maestro: aceptar una patrulla, derrotar 3 Saibamen exploradores y reclamar una sola vez 100 Poder, 100 Potencial y 100 de oro.
- Combate contra un Saibaman explorador de 100 HP y configuraciones de prueba para Saibamen de 250K/500K/700K/1M HP, Raditz, Vegeta y Vegeta Ozaru.
- El muñeco de entrenamiento es personal; cada aparición del mundo tiene vida, muerte y reaparición propias en PostgreSQL, compartidas entre jugadores. Dos apariciones del mismo tipo de enemigo no comparten HP.
- Poder y Potencial ganados juntos por golpe según el tier del enemigo.
- Botín calculado en servidor al morir: oro, gemas y equipo; no se vuelve a tirar loot por cada golpe.
- Inventario con acumulación por tipo de objeto, requisitos de Poder para equipar y bonificaciones de equipo.
- GitHub Actions ejecuta comprobación de sintaxis y pruebas automatizadas.
- Primera estructura de mundo: mapas `earth_training` y `earth_wilderness`, NPC iniciales y spawns persistidos por `spawn_id`.
- `GET /api/world` devuelve mapas, NPC, obstáculos de colisión y el estado persistido de los spawns para el cliente autenticado.
- Vista de mapa 2D responsive generada en SVG a partir de las coordenadas del servidor, con selección de mapa, marcadores de NPC y enemigos, selección de objetivo y ataque desde la interfaz.

## Balance propio inicial

Los valores de combate y botín de Dragon Realm son decisiones de diseño configurables, no fórmulas extraídas del juego original. La configuración vive en `server/game-config.js`; la tirada de loot está en `server/loot-service.js`.

- Oro: 20% en enemigos normales, 30% en jefes; el oro de jefes recibe un multiplicador ×1,30.
- Gemas: 0,1% en enemigos normales, 0,5% en jefes.
- Equipo: guantes 0,5%, pantalones 2%, armadura 1%, botas 3%, ajustado por velocidad de eliminación.
- El inventario tiene un límite inicial de 30 tipos de objeto; si se llena, el servidor informa los drops de equipo que no pudo recoger.

## Límites actuales

- La tabla `world_mob_spawns` y `GET /api/world` ya describen mapas y apariciones persistidas por `spawn_id`. El cliente ya puede atacar por `spawnId`; el servidor bloquea y actualiza la fila de cada aparición dentro de la misma transacción que guarda el personaje. `mobId` se conserva temporalmente para compatibilidad con clientes antiguos.
- La vista del mapa es un prototipo con terreno decorativo generado por código. El movimiento por pasos HTTP y los portales se validan en servidor, y los ataques a spawns exigen estar en el mismo mapa y a distancia de alcance. Ya hay colisiones rectangulares estáticas validadas por el servidor, paneles funcionales de NPC y tienda con compras autorizadas por el servidor; todavía no hay pathfinding automático, IA, sprites finales, animaciones ni sincronización en tiempo real. Los cambios hechos por otros jugadores no se reflejan automáticamente: hay que actualizar o ejecutar una acción. La tabla antigua `global_mob_instances` se conserva para no destruir datos existentes, pero las apariciones del mundo en `world_mob_spawns` son la autoridad actual.
- Bulma ofrece una tienda inicial con precios propios de Dragon Realm y compra validada en el servidor; el Maestro abre un menú de entrenamiento y mejoras de Potencial. Ya existe una misión persistida de patrulla del Maestro con aceptación, progreso por derrotas y recompensa de un solo reclamo. Siguen pendientes misiones de saga, límites de Kaio, grupos y oleadas.
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

Ver [docs/INVESTIGACION_NRO_ARQUITECTURA.md](docs/INVESTIGACION_NRO_ARQUITECTURA.md) y [docs/REA_METODOLOGIA_REFERENCIAS.md](docs/REA_METODOLOGIA_REFERENCIAS.md). Los documentos separan hechos observados, inferencias y decisiones propias; no afirman conocer fórmulas del servidor oficial.

### World navigation and REA notes

Static obstacle geometry is defined in `server/world-config.js`, resolved by `server/world-navigation.js`, and returned to the client through `GET /api/world`. The client only renders the shapes. See `docs/INVESTIGACION_NRO_ARQUITECTURA.md` and `docs/REA_METODOLOGIA_REFERENCIAS.md` for multi-repository Ngọc Rồng research, the official REA reverse-engineering toolkit, confidence levels, and licensing notes.
