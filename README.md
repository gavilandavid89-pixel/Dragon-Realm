# Dragon Realm

Prototipo web de un RPG 2D inspirado en juegos de progresión tipo MMORPG. La API Node.js + PostgreSQL es la autoridad para el estado del personaje; el navegador solo envía acciones y presenta resultados.

## Estado implementado

- Registro e inicio de sesión con contraseñas hasheadas y JWT.
- Estado de personaje guardado en PostgreSQL.
- Mejoras de Vida, Ki y Ataque con Potencial.
- Misión inicial: derrotar 10 muñecos para recibir 50 Poder y 50 Potencial una sola vez.
- Misiones configurables: patrulla del Maestro (3 Saibamen en la Zona de entrenamiento; +100 Poder, Potencial y oro) y exploración de la Llanura (requiere 1.000 Poder; 3 Saibamen en la Llanura salvaje; +250 Poder, Potencial y oro). Cada recompensa se reclama una sola vez.
- Combate contra un Saibaman explorador de 100 HP y configuraciones de prueba para Saibamen de 250K/500K/700K/1M HP, Raditz, Vegeta y Vegeta Ozaru.
- El muñeco de entrenamiento es personal; cada aparición del mundo tiene vida, muerte y reaparición propias en PostgreSQL, compartidas entre jugadores. Dos apariciones del mismo tipo de enemigo no comparten HP.
- Poder y Potencial ganados juntos por golpe según el tier del enemigo.
- Botín calculado en servidor al morir: oro, gemas y equipo; no se vuelve a tirar loot por cada golpe.
- Inventario con acumulación por tipo de objeto, requisitos de Poder para equipar y bonificaciones de equipo.
- GitHub Actions ejecuta comprobación de sintaxis y pruebas automatizadas.
- Primera estructura de mundo: mapas `earth_training` y `earth_wilderness`, NPC iniciales y spawns persistidos por `spawn_id`.
- `GET /api/world` devuelve el snapshot inicial de mapas, NPC, obstáculos, enemigos y la firma global de revisión.
- `GET /api/world/changes?since=<firma>` permite recuperar cambios perdidos y `GET /api/world/stream?since=<firma>` mantiene un flujo SSE autenticado para recibir revisiones sin sondear desde cada cliente.
- Vista de mapa 2D responsive generada en SVG a partir de coordenadas globales del servidor; el mapa no se desplaza ni se reubica alrededor del jugador.
- Presencia multijugador inicial por mapa: el servidor publica las coordenadas autorizadas de otros personajes activos y el cliente dibuja sus marcadores en las mismas coordenadas lógicas del mundo. La presencia caduca tras 12 segundos sin heartbeat.

## Balance propio inicial

Los valores de combate y botín de Dragon Realm son decisiones de diseño configurables, no fórmulas extraídas del juego original. La configuración vive en `server/game-config.js`; la tirada de loot está en `server/loot-service.js`.

- Oro: 20% en enemigos normales, 30% en jefes; el oro de jefes recibe un multiplicador ×1,30.
- Gemas: 0,1% en enemigos normales, 0,5% en jefes.
- Equipo: guantes 0,5%, pantalones 2%, armadura 1%, botas 3%, ajustado por velocidad de eliminación.
- El inventario tiene un límite inicial de 30 tipos de objeto; si se llena, el servidor informa los drops de equipo que no pudo recoger.

## Límites actuales

- La tabla `world_mob_spawns` y `GET /api/world` ya describen mapas y apariciones persistidas por `spawn_id`. El cliente ya puede atacar por `spawnId`; el servidor bloquea y actualiza la fila de cada aparición dentro de la misma transacción que guarda el personaje. `mobId` se conserva temporalmente para compatibilidad con clientes antiguos.
- La vista del mapa es un prototipo con terreno decorativo generado por código y coordenadas lógicas globales: el mapa no gira alrededor del personaje. El movimiento por pasos HTTP y los portales se validan en servidor, y los ataques a spawns exigen estar en el mismo mapa y a distancia de alcance. Ya hay colisiones rectangulares estáticas validadas por el servidor, paneles funcionales de NPC y tienda con compras autorizadas por el servidor; todavía no hay pathfinding automático, IA, sprites finales, animaciones ni WebSocket para movimiento de jugadores. Los cambios discretos de enemigos se envían mediante SSE autenticado; un sondeo central del servidor consulta PostgreSQL cada 500 ms y difunde únicamente revisiones nuevas, con reconexión y recuperación incremental en el cliente. La presencia de jugadores se mantiene separada del flujo global de enemigos: `GET /api/world/players` conserva un sondeo de heartbeat cada 3 s y `GET /api/world/players/stream?mapId=...` entrega snapshots SSE del mapa. El servidor agrupa la lectura de presencia en un sondeo compartido cada 500 ms y solo envía snapshots cuando cambian; los jugadores inactivos expiran tras 12 segundos. El cliente interpola visualmente los snapshots, pero el movimiento sigue siendo por pasos HTTP y aún no hay WebSocket ni movimiento continuo de alta frecuencia. La tabla antigua `global_mob_instances` se conserva para no destruir datos existentes, pero las apariciones del mundo en `world_mob_spawns` son la autoridad actual.
- Bulma ofrece una tienda inicial con precios propios de Dragon Realm y compra validada en el servidor; el Maestro abre un menú de entrenamiento y mejoras de Potencial. El sistema de misiones ahora usa definiciones de datos para objetivos, mapa, NPC, requisito de Poder y recompensas, con progreso persistido y reclamo único. Siguen pendientes misiones de saga, límites de Kaio, grupos y oleadas.
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

La API expone `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`, `/api/world`, `/api/world/changes`, `/api/world/stream`, `/api/world/players`, `/api/mobs` y `/api/game/action`.

## Investigación de referencia

Ver [docs/INVESTIGACION_NRO_ARQUITECTURA.md](docs/INVESTIGACION_NRO_ARQUITECTURA.md) y [docs/REA_METODOLOGIA_REFERENCIAS.md](docs/REA_METODOLOGIA_REFERENCIAS.md). Los documentos separan hechos observados, inferencias y decisiones propias; no afirman conocer fórmulas del servidor oficial.

### World navigation and REA notes

Static obstacle geometry is defined in `server/world-config.js`, resolved by `server/world-navigation.js`, and returned to the client through `GET /api/world`. The client only renders the shapes. See `docs/INVESTIGACION_NRO_ARQUITECTURA.md` and `docs/REA_METODOLOGIA_REFERENCIAS.md` for multi-repository Ngọc Rồng research, the official REA reverse-engineering toolkit, confidence levels, and licensing notes.

 
## Bitácora de desarrollo autónomo

Esta bitácora registra avances comprobables, decisiones, problemas y el siguiente paso. Se actualiza junto con el trabajo de desarrollo; los estados de pruebas indican únicamente lo que se ejecutó o consultó realmente.

### 2026-10-17 — Inspección de estado, CI e investigación de referencias

**Estado inicial verificado**
- Rama de trabajo del PR: `feature/world-maps-spawns`.
- Head inspeccionado: `46dbc7b74df96f3423a6ff1be7c17c9a8e47354c`.
- Pull request #1: abierta, en borrador, no fusionada: https://github.com/gavilandavid89-pixel/Dragon-Realm/pull/1.
- Las ejecuciones push y pull-request correspondientes a ese head terminaron con resultado **success**: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39011699325) y [pull request](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39011701924).
- No se hizo despliegue a producción ni se ejecutó REA contra el juego.

**Fuentes públicas revisadas en este ciclo**
- `DANG-PH/ngoc-rong-online/Networking-MMORPG-2D.md`: documenta patrones de autoridad del servidor, sincronización e interpolación en una recreación de MMORPG 2D. Es evidencia de la arquitectura descrita por ese proyecto, no prueba de que el servidor oficial use exactamente el mismo protocolo.
- `DANG-PH/ngoc-rong-online/NpcLoading.md` y `NpcShopItem.md`: describen DTO de NPC, carga/caché por mapa y catálogo de tienda servido desde backend.
- `ElectroHeavenVN/DataNRO/README.md`: documenta estructuras de datos para mapas, plantillas de monstruos, NPC, objetos y habilidades; también advierte que ciertos datos/recursos pueden faltar o diferir y declara AGPL-3.0 para ese repositorio.
- `nvt25/Online_nro/Client/Source/MapTemplate.cs`: se confirmó que declara arreglos para dimensiones, tiles y tipos de mapa; por sí solo no demuestra el algoritmo completo de colisión ni el comportamiento del juego.
- `morluto/rea`: se consultó el repositorio y su historial público. En este ciclo se estudió la referencia documental; REA no fue instalada ni ejecutada sobre Ngọc Rồng.

**Conclusión técnica de investigación**
- La separación entre definición de entidad y aparición en un mapa es útil para Dragon Realm.
- Los catálogos de NPC y tienda deberían ser datos del servidor; el cliente solo debe representarlos y enviar intenciones.
- La interpolación de posiciones remotas será relevante al implementar multijugador en tiempo real, pero el proyecto actual sigue usando acciones HTTP por pasos y no debe describirse como sincronización en tiempo real.
- No se copiaron assets ni código de las referencias.

**Cambio iniciado en este ciclo**
- Se está encadenando la misión de la Llanura a la misión del Maestro: tener 1.000 de Poder ya no basta; primero debe reclamarse la recompensa de «Patrulla de Saibamen».
- La condición se valida en el servidor y el NPC presenta la misión como bloqueada hasta que se cumpla el requisito.
- Se añaden pruebas para bloqueo, estado de misión, mensaje de error y desbloqueo. Este cambio solo se considerará verificado cuando CI termine correctamente.

**Problemas y limitaciones detectados**
- La herramienta de GitHub rechazó una consulta de metadatos de rama por una URL API codificada incorrectamente; el estado de rama/head se verificó mediante los metadatos del PR y los workflows.
- En esta sesión no hay evidencia de que REA esté instalada ni de que pueda conectarse a un cliente de Ngọc Rồng. La ingeniería inversa ejecutada sigue pendiente.
- No se ha realizado una prueba manual en navegador ni una prueba de integración contra PostgreSQL real en este ciclo.

**Siguiente paso**
1. Revisar los cambios y comprobar que las pruebas de misión cubran el nuevo requisito.
2. Esperar los workflows de push y PR y analizar cualquier fallo.
3. Si pasan, continuar con una mejora adicional de progresión o con una revisión técnica de seguridad/consistencia del servidor.
4. Investigar REA con más detalle para determinar requisitos de ejecución y qué objetivo autorizado y accesible podría analizarse.

### 2026-10-17 — Análisis de CI y corrección de prueba

- **Fallo observado:** los checks del commit `d2c7abf` fallaron en el test de la misión de la Llanura. Se consultó el log del job de GitHub Actions; la causa fue que el test todavía esperaba el error del requisito de Poder antes de haber completado el requisito de misión previa.
- **Corrección aplicada:** el test ahora verifica en orden las dos reglas: primero que la misión previa bloquea la aceptación y, después de marcarla reclamada, que sigue siendo necesario alcanzar 1.000 de Poder. Se añadió/ajustó la cobertura para comprobar que el NPC presenta la misión como bloqueada y que la aceptación se habilita al completar la patrulla.
- **Estado de validación:** la sintaxis pasó en el workflow fallido, pero la suite no pasó en ese commit. La corrección quedó en el commit `b34e27b3ac832cf7236706df0b593c8b829faa7e`; se debe esperar su nueva ejecución de CI antes de declarar el cambio verificado.
- **Prueba local bloqueada:** se intentó clonar el repositorio para ejecutar `npm test` en este entorno, pero la resolución de `github.com` falló por una limitación de red (`Could not resolve host`). No se considera esto un fallo del juego; la validación local queda bloqueada y se usa CI remoto como alternativa.
- **Hallazgo adicional sobre REA:** el `package.json` público de `morluto/rea` declara `rea-agents` 6.5.0 y un requisito de Node.js `^22.19.0 || ^24.11.0 || >=26.0.0`. Dragon Realm declara Node.js 20+; por tanto, no se debe asumir que REA pueda ejecutarse dentro del mismo entorno de Node sin revisar la versión disponible. No se instaló ni ejecutó REA.
- **Próximo paso inmediato:** validar el cursor futuro y el stream SSE en CI; luego, diseñar una prueba de dos clientes y evaluar sincronización de posición por WebSocket con snapshots/interpolación inspirados en NRO.

### 2026-10-17 — Primera lectura de comentarios de jugadores

**Fuentes externas revisadas**
- Página oficial de presentación de Ngọc Rồng Online: https://ngocrongonline.com/gioi-thieu. Presenta mapas y NPC variados, progresión de atributos/habilidades, misiones principales y diarias, logros y jefes como partes del juego.
- Hilo público del foro oficial sobre el jefe Fide y la interferencia con misiones: https://forum.ngocrongonline.com/app/index.php?do=list&for=forum&p=0&sz=15&uid=19439922. En ese hilo un jugador describe que otros jugadores pueden interrumpir la misión y propone un mapa separado para completarla; una respuesta de moderación reconoce el problema y dice que lo revisarán.

**Interpretación y límites**
- El hilo es una observación concreta, antigua y no una encuesta representativa; no se debe convertir en una afirmación de que toda la comunidad comparte esa opinión.
- Como principio de diseño para Dragon Realm, los objetivos de misión que requieran un jefe o una interacción exclusiva deberían evitar que otros jugadores puedan bloquear el progreso. Cuando exista multijugador, evaluar instancias personales/de grupo para encuentros de misión, reglas de participación o crédito de objetivo, y pruebas para evitar que otro jugador robe el último golpe.
- La página oficial confirma que la progresión de misiones, NPC, mapas, habilidades y jefes son sistemas importantes, pero no demuestra las fórmulas internas ni el protocolo del servidor.
- No se cambió el juego por este hallazgo todavía; queda como criterio de diseño para la futura implementación de jefes y misiones de saga.

**Siguiente paso de investigación**
- Reunir más opiniones de varias fuentes y fechas antes de declarar tendencias comunitarias. Separar las quejas individuales de los patrones repetidos y registrar la muestra consultada.


### 2026-10-17 — Inspección directa de código y pruebas de configuración

- Se inspeccionaron archivos fuente del cliente público `DANG-PH/ngoc-rong-online` en el commit `cb648f49b69555865d6fc41e461c79e3172b85c1`: `HitboxDat.java`, `MapCoBan.java`, `PlayerState.java` y `WorldState.java`.
- Evidencia observada: hitboxes con comprobaciones direccionales; carga/caché de NPC por mapa; ciclo separado de snapshot, spawn, despawn y sync; buffer de snapshots con retardo de render configurado en 150 ms en esa implementación. Estos hallazgos no prueban que los valores sean óptimos ni que coincidan con el servidor oficial.
- Decisión: documentar patrones de movimiento, colisión y sincronización en tiempo real antes de adaptarlos. Reutilizar código de repos con licencia permisiva cuando encaje, preservando licencia/avisos y revisando dependencias; no asumir que la licencia del repositorio cubre assets o binarios de terceros.
- Se añadieron tests de integridad de `MISSION_DEFINITIONS`: mapas/NPC/mobs/spawns válidos, claves de progreso únicas, recompensas no negativas y grafo de prerrequisitos sin ciclos.
- **Validación verificada para el código en el commit `af61ea957403a6515b4f1b4d21fa0db9f54710fb`:** CI push y PR pasaron sintaxis y suite automatizada: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086324656), [PR](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086327119). La documentación de investigación y el README fueron actualizados después; el head `0d79b3effb66f6386150e192a82f5d3aeee46686` también pasó push y PR: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086372801), [PR](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086374279). Este último cambio del README será comprobado en su propia ejecución.
- **Estado REA:** se leyó la guía oficial de análisis estático de APK Android. Indica que el flujo requiere JDK 17+, un JAR de JADX cuya huella se verifica y, en Linux, `ps` compatible con procps. Esto no significa que REA esté instalado o que se haya analizado un APK. Falta un artefacto autorizado y un entorno de ejecución compatible.
- **Siguiente paso:** comprobar CI tras esta actualización documental; después, revisar la seguridad y consistencia del bucle de combate/loot y añadir pruebas a cualquier regla que no esté cubierta.

### 2026-10-17 — Cierre de ciclo y siguiente prioridad

- El head `0d79b3effb66f6386150e192a82f5d3aeee46686` terminó con **push y pull-request CI exitosos**. Los checks ejecutaron instalación de dependencias, comprobación de sintaxis y suite automatizada.
- El test de integridad de misiones añadió validación de mapa, NPC, enemigo, spawn, claves de progreso, recompensas y ciclos en prerrequisitos. Su commit `af61ea957403a6515b4f1b4d21fa0db9f54710fb` pasó tanto push como PR.
- Se mantiene una limitación de ejecución local: no se pudo clonar GitHub por DNS; por eso la evidencia de tests de este ciclo procede de GitHub Actions, no de una ejecución local.
- El PR continúa abierto como draft y no está fusionado. No hay despliegue realizado.
- **Próxima prioridad técnica:** auditar el flujo de combate/loot y persistencia para localizar reglas sin cobertura, especialmente los límites entre progreso individual y spawns compartidos. Después decidir si el siguiente bloque debe mejorar aislamiento de objetivos de misión o preparar la base para sincronización en tiempo real.


### 2026-10-17 — Endurecimiento del permiso CORS

- **Hallazgo:** la política previa permitía cualquier origen de navegador cuando `CLIENT_ORIGIN` estaba vacío. Aunque CORS no sustituye la autenticación, el valor por defecto no seguía el principio de denegar permisos cross-origin no configurados.
- **Cambio:** se añadió `server/origin-policy.js`; ahora las peticiones sin encabezado `Origin` siguen permitidas y los navegadores solo reciben permiso CORS para orígenes incluidos explícitamente en `CLIENT_ORIGIN`. Una lista vacía ya no equivale a wildcard. Los clientes de mismo origen no necesitan encabezados CORS.
- **Pruebas:** se añadieron tests para solicitudes sin Origin, origen autorizado, origen no autorizado y allowlist vacía. `npm run check` también valida la sintaxis del módulo y sus tests.
- **Riesgo/compatibilidad:** un frontend servido desde otro dominio debe configurar `CLIENT_ORIGIN` con su origen exacto; el cliente servido por Express en el mismo origen no necesita configuración adicional.
- **Estado:** pendiente de la ejecución de CI de este cambio; no se declara verificado hasta que terminen los workflows.


### 2026-10-17 — Resultado de la auditoría CORS

- **Fallo intermedio analizado:** los workflows de los commits `768dfbd` y `5c273d2` fallaron durante `npm run check` porque el script ya referenciaba `server/origin-policy.test.js` antes de que ese archivo se hubiera creado en el commit posterior. El log del job confirmó `MODULE_NOT_FOUND`; no era un fallo de la regla CORS.
- **Resolución:** se completaron el helper `server/origin-policy.js` y sus tests. El commit completo `745ab3b436f8965eb35533abb01b9bbd4e078304` pasó tanto el workflow push como el de PR: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086446572), [PR](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39086449325). La suite y la comprobación de sintaxis terminaron correctamente.
- **Resultado funcional:** origen ausente permitido; origen cross-origin permitido únicamente si figura en `CLIENT_ORIGIN`; lista vacía no otorga permiso wildcard. No se añadió bloqueo de solicitudes de mismo origen.
- **Siguiente paso:** comprobar la CI del commit documental que registra este resultado y después retomar la auditoría de combate, loot y persistencia.


### 2026-10-17 — Auditoría de persistencia de spawns

- **Hallazgo:** la inicialización de `world_mob_spawns` usaba `ON CONFLICT DO NOTHING`. Una vez creada una aparición, cambios posteriores a sus coordenadas, mapa o tipo en `world-config.js` no llegaban a la base de datos. Eso podía dejar una aparición en una ubicación antigua; cambiar el tipo de enemigo también podía conservar HP/respawn del enemigo anterior.
- **Cambio:** el seed ahora reconcilia mapa, tipo y coordenadas en cada arranque. Si el tipo de enemigo no cambia, conserva el HP actual (limitado al nuevo máximo), el temporizador de reaparición y el contador de derrotas. Si cambia el tipo, reinicia HP, temporizador y contador. Si cambia la ubicación, reinicia solo el reloj de inicio del combate para no medir velocidad de derrota desde una pelea anterior.
- **Persistencia protegida:** no se eliminan filas de apariciones antiguas automáticamente; quitar spawns del archivo de configuración no destruye datos silenciosamente. Esa política de retiro queda pendiente de un mecanismo explícito de desactivación.
- **Pruebas:** pendiente CI de sintaxis y suite automatizada. No hay PostgreSQL disponible en esta sesión para probar el comportamiento del `ON CONFLICT` contra una base real; se declara esa limitación por separado de la CI.
- **Siguiente paso:** añadir pruebas de integración de persistencia cuando haya una base PostgreSQL de pruebas, y continuar auditando validación de IDs de aparición y recompensas de botín con inventario lleno.


### 2026-10-17 — Validación de identidad del objetivo de combate

- **Hallazgo:** cuando el cliente enviaba a la vez `spawnId` y `mobId` incompatibles, el servidor resolvía el enemigo desde la fila de la aparición y silenciosamente ignoraba el tipo solicitado. No permitía saltarse el alcance ni el estado del servidor, pero hacía ambiguo el contrato de la API y podía producir un objetivo distinto del que el cliente creía atacar.
- **Cambio:** el servidor ahora acepta que el cliente omita `mobId` por compatibilidad, pero si lo envía debe ser un identificador válido y coincidir con el enemigo real de la aparición seleccionada. Si no coincide, responde con conflicto sin actualizar el estado.
- **Cobertura añadida:** tests para campo omitido, identidad coincidente, tipo incompatible y entrada malformada.
- **Estado de validación:** CI del commit de código pendiente; no se declara verificado hasta que terminen push y PR.
- **Siguiente paso:** terminar la auditoría de botín cuando el inventario está lleno y añadir pruebas de integración de la reconciliación de spawns si se dispone de PostgreSQL de pruebas.


### 2026-10-17 — Botín recuperable con inventario lleno

- **Hallazgo:** el combate devolvía `inventoryFullDrops` y el cliente avisaba que el equipo no se había recogido, pero el objeto no quedaba guardado en el personaje. En una futura expansión de objetos únicos esto provocaría pérdida permanente de botín.
- **Cambio:** se agregó `pendingLoot` al estado persistido del personaje. Si un drop no cabe en el inventario, se conserva en esa cola en lugar de perderse. La nueva acción `claim_pending_loot` recoge tantos objetos como permita el inventario y conserva el resto. La cola se guarda dentro del mismo JSONB del personaje y se inicializa vacía para personajes antiguos.
- **Interfaz:** el inventario muestra los objetos pendientes y un botón `Recoger`; el mensaje de combate indica que el equipo quedó guardado para recuperarlo.
- **Pruebas añadidas:** muerte con inventario lleno, conservación de los cuatro drops, rechazo sin pérdida cuando no hay espacio, recogida parcial, recogida final y migración de personaje antiguo.
- **Validación verificada:** push y PR pasaron para la implementación completa en el head documental `1ab633d4292ed8efbefb0577f6bd89249d0be5bd`: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39087681493), [PR](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39087684717). La suite automatizada no sustituye una sesión manual de juego ni una integración con PostgreSQL real.


### 2026-10-18 — Análisis y corrección de prueba de botín pendiente

- **Fallo de CI analizado:** en el primer commit que añadió el test de migración de `pendingLoot`, el test llamó a `mission_status` desde la posición inicial del personaje, lejos del Maestro. El servidor rechazó correctamente la interacción con `Acercate al NPC para interactuar.`; el fallo estaba en la preparación del test, no en la cola de botín.
- **Corrección:** el test ahora posiciona al personaje junto al Maestro antes de consultar el estado de la misión. Se conserva la validación real de proximidad.
- **Estado:** la corrección está en el commit `56026b7fa24c2b4c55f45094e16e1f107f924bc0`; CI de este commit pendiente. No se declara verificado hasta que termine.


### 2026-10-18 — Cierre de validación del ciclo

- **Verificado:** GitHub Actions push y PR pasaron en el head `1ab633d4292ed8efbefb0577f6bd89249d0be5bd`: [push](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39087681493), [PR](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39087684717). Ambos ejecutaron instalación de dependencias, comprobación de sintaxis y tests automatizados.
- **Verificado en tests:** identidad del enemigo y aparición; persistencia de botín cuando el inventario está lleno; rechazo sin pérdida si no hay espacio; recogida parcial y completa; migración de personajes antiguos sin cola de botín.
- **Fallido y corregido:** el test inicial de migración falló porque el personaje estaba fuera del rango del Maestro; se corrigió el estado inicial del test y la nueva suite pasó.
- **Pendiente/bloqueado:** integración real del upsert de spawns contra PostgreSQL, sesión manual de navegador y ejecución de REA sobre un APK autorizado. El clon local continúa bloqueado por fallo DNS al resolver GitHub.
- **Estado del PR:** sigue abierto como draft, sin merge ni despliegue.
- **Siguiente prioridad:** preparar una prueba de integración de persistencia de apariciones y revisar el ciclo de vida de spawns retirados sin eliminar datos automáticamente; después seguir con pruebas de seguridad de inventario/equipamiento y ampliar el contenido jugable.

### 2026-10-17 — Firma global y sincronización incremental de enemigos

**Cambio implementado**
- Se añadió `world_mob_spawns.revision` y un trigger de PostgreSQL que asigna una revisión creciente desde la fila transaccional `world_revision_state` en cada INSERT/UPDATE de una aparición. El contador global bloquea brevemente las mutaciones para que el orden de revisión siga el orden de commit; cada fila conserva la revisión de su estado más reciente.
- `GET /api/world` devuelve el snapshot inicial y la firma observada. `GET /api/world/changes?since=N` devuelve solo los enemigos con revisión posterior a N, limitados a la firma capturada por esa consulta para no saltarse escrituras concurrentes.
- El navegador mantiene un flujo SSE autenticado, con reconexión y cursor `since`; un poller central de servidor revisa cambios cada 500 ms y difunde por `spawnId`, evitando una consulta de base por jugador. `/api/world/changes` queda como recuperación incremental cuando el stream se interrumpe.
- Las reapariciones cuyo temporizador venció se resuelven en servidor durante la sincronización y también generan una nueva revisión global; los clientes no tienen que esperar a que alguien ataque para ver al enemigo reaparecer.
- Seleccionar un enemigo ya no mueve automáticamente al personaje hacia él. El jugador se desplaza por el mapa y el servidor sigue comprobando mapa y distancia al atacar.
- La firma es un cursor de sincronización, no una prueba criptográfica ni un registro histórico completo de cada valor intermedio. El contador transaccional evita que una escritura lenta con una revisión antigua quede confirmada después de otra revisión más nueva y sea omitida por los clientes. La base conserva el estado más reciente de cada aparición; para replay/auditoría detallada haría falta una tabla append-only de eventos. No se añadió eliminación de spawns, así que el flujo actual no necesita eventos de tombstone.

**Verificación y límites**
- CI ejecuta una prueba de integración contra PostgreSQL 16 efímero: la segunda transacción espera por el contador global, ambas revisiones aparecen en orden y vida/revisión sobreviven a una conexión nueva.
- La prueba verifica dos clientes SSE HTTP reales en CI, además de concurrencia y persistencia PostgreSQL; todavía no sustituye una prueba manual de dos navegadores ni mide latencia visual móvil. La reconexión está implementada, pero falta validar visualmente su comportamiento en navegador.


### Referencias de arquitectura NRO (2026-10-18)

- [DANG-PH/ngoc-rong-online](https://github.com/DANG-PH/ngoc-rong-online) incluye licencia MIT en la raíz y documentación `Networking-MMORPG-2D.md`. Sus conceptos útiles: servidor autoritativo, separar estado continuo (posición) de eventos discretos (combate/loot), sincronización por WebSocket y snapshots/interpolación. `WorldState` separa estado compartido por mapa. La licencia del repo no demuestra por sí sola derechos sobre cada asset de terceros.
- [nvt25/Online_nro](https://github.com/nvt25/Online_nro) se revisó como referencia de estructura del cliente (`Mob.cs`, `MapTemplate.cs`, `Net.cs`). No se presume una licencia permisiva para copiar código, recursos gráficos ni binarios.
- [morluto/rea](https://github.com/morluto/rea) queda como referencia para futuras pruebas autorizadas; no se ha ejecutado REA ni instrumentado un cliente.
- Para Dragon Realm, los mobs son estado compartido por aparición; sus cambios discretos se difunden por SSE con revisiones globales. El siguiente candidato es WebSocket con snapshots para posiciones de jugadores, separando estado continuo de eventos discretos. Se adaptan patrones arquitectónicos de NRO; el código/recursos se reutilizan solo cuando su licencia y atribución lo permiten.

### Prueba opcional de concurrencia PostgreSQL

`server/world-sync.integration.test.js` ejecuta el `db/schema.sql` real dentro de un esquema aislado, fuerza dos transacciones concurrentes y comprueba el orden global/persistencia. También arranca el servidor real contra PostgreSQL 16, abre dos conexiones SSE autenticadas con JWT, modifica una aparición y comprueba que ambos clientes reciben la misma firma global y el mismo lote sin realizar polling. GitHub Actions levanta PostgreSQL 16 efímero para ejecutar ambas pruebas en cada push/PR. Para ejecutarla localmente, configura `WORLD_SYNC_TEST_DATABASE_URL` con una base de pruebas dedicada y ejecuta `npm test`; sin esa variable la prueba se omite explícitamente.


### 2026-10-18 — Presencia de jugadores y coordenadas globales

**Regla de mundo**
- Las coordenadas son globales y estables dentro de cada mapa. El jugador cambia su posición; el servidor no reubica el mapa ni las entidades alrededor del jugador.
- Seleccionar un enemigo no mueve al personaje. El movimiento se solicita por coordenadas y el servidor devuelve el resultado autorizado.

**Implementación**
- Añadida la tabla `world_player_presence`, separada del contador de revisiones de enemigos.
- El movimiento y el viaje por portales actualizan la presencia dentro de la misma transacción que persiste el estado del personaje.
- Añadido `GET /api/world/players?mapId=...`: valida el mapa, toma un bloqueo del personaje al refrescar su presencia y devuelve únicamente otros jugadores activos de ese mapa. La presencia deja de publicarse después de 12 segundos sin heartbeat.
- El cliente dibuja los demás personajes en sus coordenadas mundiales y actualiza la lista cada tres segundos. Esto es presencia multijugador inicial, no movimiento en tiempo real de alta frecuencia.
- Añadida una prueba de integración para validar el movimiento autoritativo, el aislamiento entre mapas y la exclusión del propio jugador.
- La navegación al viajar por portal ahora vuelve a renderizar el mapa de destino. Se actualizaron las instrucciones de la interfaz para dejar claro que elegir un enemigo no hace que el jugador se acerque automáticamente.
- El workflow conserva logs de sintaxis/pruebas como artefacto cuando una ejecución llega a esos pasos y falla.

**Validación y límites**
- Los últimos intentos de GitHub Actions aparecen como fallidos, pero el conector no expone pasos ni logs descargables para esas ejecuciones; no es posible atribuir la causa con evidencia suficiente.
- La clonación local sigue bloqueada por resolución DNS de GitHub en este entorno. Por ello, los nuevos tests de presencia aún no están confirmados como pasados.
- No se fusionó el PR ni se desplegó el proyecto.
- Próximo paso: obtener una ejecución de CI con diagnóstico disponible, corregir cualquier fallo demostrado y después avanzar a snapshots agrupados e interpolación de posiciones remotas según la investigación de Ngọc Rồng Online.

### 2026-10-18 — Registro durable de cada cambio de enemigo

- Se añadió `world_mob_change_log`, un registro append-only que guarda una instantánea por revisión global de cada INSERT/UPDATE de una aparición.
- `GET /api/world/changes` y el flujo SSE `GET /api/world/stream` leen el registro de eventos en vez de consultar únicamente la fila mutable actual. Así, dos cambios rápidos de HP de una misma aparición no se fusionan en un solo estado al consultar después.
- La revisión global sigue incrementándose dentro de la transacción PostgreSQL; el registro y el estado actual se confirman o revierten juntos.
- La migración copia al registro el último estado conocido de las apariciones existentes con revisión mayor que cero. No puede reconstruir eventos intermedios anteriores a esta migración.
- Se añadió una prueba de integración que verifica que dos cambios consecutivos de la misma aparición sobreviven en orden y con revisiones distintas.
- El registro todavía no tiene política de retención/compactación: no se deben borrar eventos antiguos hasta definir un protocolo de cursores caducados y recuperación completa del snapshot.
- **Validación confirmada:** GitHub Actions run [#339](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39192103413) completó comprobación de sintaxis y 62 pruebas con PostgreSQL 16: 62 pasaron, 0 fallaron y 0 se omitieron.

### 2026-10-19 — Interpolación visual de otros jugadores

- Los marcadores remotos ahora conservan su elemento SVG entre snapshots y animan la transición entre la posición representada y la nueva posición autoritativa.
- La interpolación dura como máximo 2,8 segundos para los snapshots que llegan aproximadamente cada 3 segundos. No altera coordenadas lógicas, colisiones ni decisiones del servidor; es solo presentación visual.
- Las actualizaciones del mundo causadas por enemigos no reinician la animación de jugadores si sus coordenadas objetivo no cambiaron.
- Al cambiar de mapa o cerrar sesión se limpian el estado de los marcadores y el frame de animación pendiente.
- La presencia sigue usando sondeo HTTP cada 3 segundos; la interpolación disimula saltos, pero no reemplaza snapshots frecuentes ni constituye una solución de movimiento multijugador de baja latencia.
- **Validación confirmada:** [GitHub Actions run #348](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39196071749) pasó la comprobación de sintaxis y 62 pruebas con PostgreSQL 16: 62 aprobadas, 0 fallos y 0 omitidas.


### 2026-10-19 — Snapshots de jugadores agrupados por mapa

- Se añadió `GET /api/world/players/stream?mapId=...`, un canal SSE autenticado e independiente de las revisiones globales de enemigos.
- El servidor consulta las presencias activas en una única lectura compartida cada 100 ms cuando existen suscriptores, agrupa jugadores por mapa y evita reenviar snapshots idénticos a cada cliente.
- El canal excluye al propio jugador, usa posiciones guardadas por el servidor, mantiene heartbeats y se cierra de forma controlada en SIGTERM. El endpoint HTTP existente se conserva como heartbeat y fallback de reconexión.
- El cliente consume el stream con token/mapa/ejecución protegidos, reconecta tras interrupciones y conserva la interpolación visual. El sondeo HTTP cada 3 s sigue activo como heartbeat/fallback; no se afirma que esto sea WebSocket ni movimiento continuo.
- Se añadió una prueba de integración PostgreSQL que mueve un segundo jugador y espera el nuevo snapshot por SSE, sin reutilizar la firma de enemigos.
- **Validación verificada:** [GitHub Actions run #370](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39255610170) — comprobación de sintaxis y 62 pruebas aprobadas, 0 fallos, 0 omitidas, con PostgreSQL 16. No se ha fusionado el PR ni desplegado a producción.


### 2026-10-19 — Movimiento continuo autoritativo por WebSocket

- Se añadió el endpoint WebSocket autenticado `/api/world/movement`. El token JWT se envía en el primer mensaje, no en la URL; el servidor cierra conexiones que no se autentican en cinco segundos.
- El cliente manda un destino y puede reemplazarlo mientras camina. El servidor procesa pasos pequeños con un intervalo mínimo de 120 ms, valida el mapa, los límites, la velocidad y las colisiones mediante las reglas existentes, y persiste cada paso junto a la presencia del jugador.
- Los mensajes llevan un identificador de destino para que una respuesta atrasada de una orden anterior no complete el movimiento nuevo. El cliente interpola visualmente los pasos autoritativos; la ruta HTTP anterior queda como fallback si WebSocket no está listo.
- Los snapshots de otros jugadores se publican por el canal SSE independiente cada 100 ms cuando hay suscriptores. La firma y el registro global de enemigos no se mezclan con el movimiento.
- Se añadió una prueba de integración PostgreSQL para autenticar un WebSocket, recorrer un destino y verificar que la posición final quedó persistida. Se impide que dos conexiones WebSocket controlen simultáneamente el mismo personaje y se cierra el canal al expirar el JWT. También se corrigió una suposición frágil del test SSE: dos clientes que se suscriben en momentos distintos no tienen por qué recibir el mismo frame inicial, aunque ambos deben recibir cambios válidos.
- **Límite de escala:** cada paso autoritativo bloquea y persiste la fila del personaje; con el intervalo actual representa hasta unas 8 escrituras/s por jugador en movimiento, más el sondeo compartido de presencia a 10 Hz por proceso. Es una base funcional para validar latencia, no aún una arquitectura de miles de jugadores. El siguiente paso es medir carga y después separar simulación/ticks del guardado duradero si hace falta.
- **Validación confirmada:** [GitHub Actions run #400](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39263381991) pasó sintaxis y 62 pruebas con PostgreSQL 16: 62 aprobadas, 0 fallos y 0 omitidas. La ejecución cubre el servidor WebSocket, la prueba de movimiento persistido y el cliente de interpolación. No se ha fusionado el PR ni desplegado a producción.



## Personajes jugables\n\nLa sección **Personajes jugables** ofrece tres razas iniciales: **Saiyan** (+3 Ataque), **Namekiano** (+200 Vida máxima) y **Terrícola** (+150 Ki máximo). La selección se guarda en el estado del personaje y se valida en el servidor; en esta versión es permanente. Los bonos raciales se aplican a las estadísticas efectivas usadas por el combate, no solo a la interfaz. Los personajes antiguos sin raza pueden elegir una sin perder su progreso.\n\n## Contenido jugable añadido — La avanzada veterana

La Llanura salvaje ahora tiene una segunda capa de progresión:
- Tres apariciones persistentes de Saibamen veteranos, cada una con su propia vida, derrota y reaparición.
- Nueva misión encadenada **La avanzada veterana**, disponible con el Explorador después de reclamar **Exploración de la Llanura** y alcanzar 1.500 de Poder.
- Objetivo de cinco derrotas y recompensa única de 500 Poder, 500 Potencial, 350 de oro y una gema.
- La ficha de misión muestra progreso y bloqueo por requisito; el servidor vuelve a validar los requisitos y evita reclamar la recompensa dos veces.
- El catálogo de enemigos y las apariciones se mantienen separados: el tipo de enemigo define sus reglas y cada spawn define una instancia independiente del mundo.

La referencia de Ngọc Rồng sirve para identificar sistemas que vale la pena construir (misiones por NPC, catálogos de enemigos y progreso persistente). Dragon Realm usa sus propios valores, textos y contenido; no copia sprites ni lógica propietaria. La siguiente expansión prioriza más zonas, personajes NPC con diálogos útiles, recompensas y encuentros antes de invertir más tiempo en infraestructura multijugador.

## Multijugador en tiempo real — estado de desarrollo

El movimiento continuo usa WebSocket autenticado: el cliente envía un destino y el servidor valida cada paso, lo persiste y emite posiciones autoritativas a las demás sesiones conectadas en el mismo mapa. El cliente interpola los marcadores remotos. Los eventos de enemigos mantienen su propia revisión global y su flujo SSE independiente; el SSE agrupado de jugadores sigue disponible como fallback.

La implementación está inspirada en patrones documentados en [Ngọc Rồng Online / Dragon Boy](https://github.com/DANG-PH/ngoc-rong-online/blob/master/Networking-MMORPG-2D.md), en particular estado autoritativo del servidor, eventos por mapa y suavizado de snapshots. No reutiliza assets del juego de referencia.

**Límites conocidos:** cada paso de movimiento aún abre una transacción PostgreSQL; no se ha hecho prueba de carga ni una sesión manual con varios navegadores. El broadcast vive en el proceso actual, así que una futura arquitectura de varias réplicas necesitará un bus de eventos compartido. El PR de desarrollo sigue abierto como borrador; no se ha fusionado ni desplegado.
