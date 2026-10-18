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

La API expone `/health`, `/api/auth/register`, `/api/auth/login`, `/api/me`, `/api/world`, `/api/mobs` y `/api/game/action`.

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
- **Próximo paso inmediato:** revisar la ejecución push y la ejecución de PR para el commit de corrección; si fallan, consultar los logs y corregir antes de seguir con nuevas mecánicas. Luego, investigar el modo de análisis de aplicaciones Android/Java de REA y determinar si existe un cliente autorizado y accesible para analizar.

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
- Decisión: documentar los patrones para una futura fase de física de plataformas y sincronización en tiempo real. No copiar código ni incorporar una arquitectura WebSocket sin que el juego lo necesite.
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
