# Investigación técnica: Ngọc Rồng Online → Dragon Realm

> Estado: investigación y diseño. Este documento separa hechos observados en el código público consultado, inferencias de arquitectura y decisiones propias de Dragon Realm. No afirma conocer fórmulas del servidor original.

## 1. Fuentes consultadas

- Cliente de estudio: https://github.com/DANG-PH/ngoc-rong-online
- Documentación de networking: https://github.com/DANG-PH/ngoc-rong-online/blob/master/Networking-MMORPG-2D.md
- Carga de NPC: https://github.com/DANG-PH/ngoc-rong-online/blob/master/NpcLoading.md
- Tiendas de NPC: https://github.com/DANG-PH/ngoc-rong-online/blob/master/NpcShopItem.md
- Backend de datos de juego: https://github.com/DANG-PH/dragonboy-game-data-service
- Gateway de juego: https://github.com/DANG-PH/dragonboy-game-service
- Servicio de usuario: https://github.com/DANG-PH/dragonboy-user-service
- Estado del proyecto Dragon Realm: este repositorio, especialmente `server/game-service.js`, `server/index.js` y `db/schema.sql`.

El cliente de estudio declara licencia MIT. La licencia del cliente no concede automáticamente permisos sobre otros repositorios, assets de terceros, marcas ni recursos del juego comercial original. Antes de reutilizar código de un servicio separado, verificar su LICENSE y conservar los avisos requeridos. La estrategia recomendada es estudiar patrones y escribir implementaciones adaptadas a Dragon Realm.

## 2. Hallazgos confirmados en las fuentes

### 2.1 Red en tiempo real y movimiento

La documentación del proyecto de referencia explica la evolución desde JSON por Socket.IO hacia WebSocket binario y sincronización por snapshots. En el cliente, `PlayerState` contiene coordenadas objetivo del servidor y un buffer de interpolación. La intención es no dibujar directamente cada posición recibida, porque eso hace que los personajes remotos salten entre paquetes.

Patrón útil para Dragon Realm:
1. El cliente envía intención de movimiento, no un resultado autoritativo.
2. El servidor valida y calcula la posición.
3. El servidor emite snapshots/eventos a los clientes del mismo mapa.
4. El cliente interpola solo la representación de otros jugadores.
5. Teletransportes, entrada a mapa y reconexiones requieren resincronización explícita.

No copiar una frecuencia o demora como constante universal: medir en dispositivos y redes objetivo. El usuario desarrolla desde Android y debemos priorizar conexiones móviles y uso de datos razonable.

### 2.2 NPC y mapas cargados desde datos

En `NpcLoading.md`, la carga documentada separa un DTO de datos de NPC de los objetos visuales del cliente. El cliente consulta NPC por mapa, mantiene una caché y aplica los objetos al hilo gráfico mediante el mecanismo seguro de LibGDX. Los NPC inactivos se filtran.

En el backend de datos consultado:
- `MapBaseEntity` representa un mapa por identificador y nombre.
- `NpcSpawnEntity` relaciona un NPC base con un mapa, coordenadas `x/y` y `is_active`.
- El servicio consulta un mapa con sus apariciones y devuelve los NPC asociados.

Decisión para Dragon Realm: mantener separados los datos de definición (qué NPC es, qué hace) y aparición (en qué mapa y coordenadas aparece). No hace falta adoptar NestJS ni microservicios para conseguir esa separación; la API actual puede implementarla modularmente.

### 2.3 Tiendas configurables

En `NpcShopItem.md`, la tienda no se define completamente en el cliente. La definición de una oferta relaciona NPC, objeto, precio, tipo de moneda, pestaña y estado activo. El cliente obtiene la lista, la convierte a objetos de presentación y puede cachearla.

El modelo consultado del servicio de datos enumera tipos de moneda `VANG` y `NGOC`, pestañas de tienda y un estado de activación. Esto demuestra un esquema de tienda configurable en esa implementación, no que sean necesariamente las reglas del juego oficial.

Decisión para Dragon Realm:
- El servidor será la autoridad del precio, moneda, inventario y compra.
- El cliente solo presenta el catálogo y solicita comprar un ID de oferta con cantidad.
- En la compra, validar precio actual, saldo, espacio de inventario y oferta activa en una transacción.
- Nunca aceptar del cliente un precio final, un saldo o un objeto que se deba conceder.

### 2.4 Persistencia y estado de jugador

El servicio de usuario consultado separa la posición persistente (x, y, mapa) de estadísticas de juego. El gateway de juego utiliza sesiones y estado temporal en Redis para representar a los jugadores conectados y publica eventos de aparición/desaparición y snapshots por mapa.

En Dragon Realm actual, `characters.state` es un JSONB con estadísticas, inventario y misiones. `server/game-service.js` contiene una función central `performAction`; `server/index.js` ejecuta la acción dentro de una transacción PostgreSQL con bloqueo de fila (`FOR UPDATE`). Esta base es pequeña y útil, pero todas las nuevas acciones deben seguir siendo validadas en servidor y guardarse transaccionalmente.

No introducir Redis, microservicios o WebSockets hasta que una necesidad real lo justifique. Primero completar correctamente el bucle PvE en el servidor actual.

## 3. Qué no está demostrado

La fuente de estudio no demuestra por sí sola:
- Las fórmulas de daño, defensa, crítico, evasión o ganancia de Poder/Potencial del juego oficial.
- Las probabilidades originales de loot ni los pesos de sus tablas.
- Que el backend de la recreación tenga implementado el combate completo; la descripción de lanzamiento dice que el combate y los monstruos estaban incompletos.
- Que los servidores/configuraciones que aparecen en el cliente sigan activos.
- Que las reglas de una recreación independiente coincidan con el juego oficial.

Las probabilidades y fórmulas de Dragon Realm serán propias, configurables y testeables. No presentar valores de diseño como hechos extraídos.

## 3.1 Progresión de misiones en cadena

La configuración de Dragon Realm puede declarar `prerequisiteMissionId` en una misión. La misión de exploración de la Llanura requiere reclamar previamente la recompensa de `scout_patrol`; el servidor valida el requisito al aceptar la misión. El diálogo del NPC muestra la misión como bloqueada y el endpoint de estado informa que falta la misión previa.

Esto es una decisión de diseño de Dragon Realm inspirada en la estructura habitual de progresión por objetivos; no se presenta como una regla verificada del juego oficial.

## 4. Modelo de combate recomendado para Dragon Realm

### Autoridad

El cliente manda una intención con identificador de acción, objetivo y habilidad solicitada. El servidor valida sesión, distancia, mapa, cooldown, coste de KI, estado vivo y frecuencia de acciones. El servidor decide impacto, daño, HP restante, muerte, recompensa y botín. El cliente no manda `damage`, `loot`, `gold`, `gems`, `power` ni `potential` como resultado válido.

### Orden lógico de una acción

1. Validar petición y rate limit.
2. Cargar estado de personaje y objetivo en una transacción o sección crítica.
3. Validar que ambos existen, están vivos y son alcanzables.
4. Validar skill/cooldown/KI.
5. Calcular hit o evasión con un generador aleatorio del servidor.
6. Aplicar daño y actualizar HP.
7. Si el objetivo muere, marcar la muerte una sola vez.
8. Calcular recompensas mediante configuración del servidor.
9. Guardar estado y un registro de recompensa/idempotencia en la misma transacción.
10. Emitir resultado confirmado a los clientes.

Evitar pagar recompensas dos veces por reintentos, doble toque, desconexión o dos jugadores matando al mismo objetivo simultáneamente. Para el primer prototipo, la base de datos PostgreSQL puede resolverlo con bloqueo de filas y una tabla de eventos/recompensas idempotentes.

### Datos sugeridos (no implementados todavía)

- `mob_definitions`: id, nombre, tier, HP base, ataque/defensa base, parámetros de movimiento, respawn.
- `mob_spawns`: definición, mapa, x/y, activo.
- `loot_tables`: grupo, ítem/recurso, probabilidad o peso, cantidad mínima/máxima, condiciones.
- `loot_modifiers`: reglas por velocidad de muerte, jefe, grupo o evento.
- `combat_events`: identificador único, actor, objetivo, resultado, timestamp.
- `reward_claims`: identificador único de muerte/recompensa, jugador, recursos concedidos.

Las tablas anteriores son una propuesta para cuando salgamos del prototipo JSONB; no se han creado en la base actual. Mantener primero el diseño lógico y migrar cuando sea necesario, no introducir tablas por anticipado sin una prueba que las justifique.

## 5. Balance inicial propio de Dragon Realm

Usar la especificación de diseño ya acordada, no atribuirla al juego estudiado:
- Poder y Potencial se ganan juntos en las recompensas que correspondan; el Potencial se gasta y el Poder no.
- Poder también se gana golpeando enemigos, con cantidad variable según la diferencia de fuerza, tier, estadísticas y equipo.
- Una evasión/fallo puede otorgar 1 punto como avance mínimo intencional.
- Mejoras individuales de HP/KI suman 40 por compra.
- Probabilidades de loot configurables en servidor; los valores actuales son decisiones de Dragon Realm, no hallazgos del APK.
- Los jefes, misiones, recompensas únicas y objetos de primera eliminación deben tener claves de concesión únicas.

Mantener un archivo de configuración versionado para balance, validar rangos al arrancar y registrar qué versión de configuración produjo cada recompensa importante.

## 6. Estado real del repositorio Dragon Realm

La base actual incluye:
- Registro e inicio de sesión con hash de contraseña y JWT.
- Persistencia PostgreSQL de cuenta y estado de personaje.
- Endpoint autenticado de estado del jugador.
- Acción `training_dummy` de una sola reclamación que da 50 Poder y 50 Potencial.
- Acción `spend_potential` para mejorar estadísticas con valores iniciales de prototipo.
- Cliente web pequeño en `public/`.

El servidor aún no tiene el bucle completo de enemigos, combate, loot, equipamiento, misiones ni multijugador en tiempo real. La documentación README lo reconoce.

## 7. Plan de implementación por fases

### Fase A — pruebas y endurecimiento del núcleo
- Añadir pruebas para recompensas duplicadas, Potencial insuficiente, estadísticas permitidas y estados corruptos.
- Asegurar que Poder/Potencial y recursos no acepten números negativos, NaN o enteros fuera de rango.
- Definir y validar un esquema de estado, incluyendo migración/normalización de personajes existentes.
- Mantener los secretos fuera del cliente y de los commits.

### Fase B — PvE de servidor en una sola instancia
- Añadir definiciones de mobs configurables y spawns.
- Añadir acciones de ataque con distancia, cooldown, daño y muerte validados en servidor.
- Añadir loot configurado en servidor y recompensa idempotente.
- Emitir al cliente el resultado autorizado; el cliente solo anima y muestra el HUD.
- Probar con mobs de entrenamiento antes de jefes.

### Fase C — progresión
- Integrar Poder/Potencial por golpe y misión.
- Añadir mejoras x1/x5/x10 solo si el saldo alcanza para la cantidad seleccionada.
- Añadir inventario/equipamiento y recalcular estadísticas efectivas en servidor.
- Añadir límites, habilidades y NPC cuando las reglas de cada sistema estén definidas.

### Fase D — mapas y multijugador
- Separar definiciones de mapa, colisiones, NPC y spawns.
- Implementar estado de jugador por mapa y eventos de entrada/salida.
- Si se necesita tiempo real, añadir WebSocket con snapshots y reconciliación.
- Evaluar interpolación y reconexión en Android con redes móviles reales.

## 8. Criterios para considerar un sistema entendido

Para cada mecánica registrar:
1. Fuente y archivo exactos.
2. Qué afirma explícitamente el código/documentación.
3. Qué es inferencia y nivel de confianza.
4. Qué no sabemos todavía.
5. Diseño elegido para Dragon Realm.
6. Pruebas que demostrarían que funciona.
7. Restricciones de licencia/atribución.

Este documento es la referencia de investigación viva. Actualizarlo cuando se inspeccionen nuevas fuentes o se implementen fases; no marcar como implementado algo que solo está diseñado.


## 9. Implementación real posterior a esta investigación

En la rama `main` se añadieron los siguientes cambios y se verificaron con GitHub Actions:

### 9.1 Primer bucle PvE: muñeco de entrenamiento

- `server/game-service.js` ahora admite `attack_mob` y conserva `training_dummy` como alias compatible.
- Cada golpe al muñeco aplica 1 de daño, concede el mínimo de 1 Poder y 1 Potencial, y guarda el progreso.
- La primera misión se completa al derrotar 10 muñecos; entonces concede 50 Poder y 50 Potencial adicionales.
- El servidor aplica un intervalo mínimo de 250 ms entre golpes por personaje.
- Se valida que Poder y Potencial sean enteros no negativos y que Potencial no supere Poder.
- El frontend muestra el progreso de la misión y envía la intención de ataque, sin enviar cantidades de recompensa.

Esto implementa únicamente el primer bucle de entrenamiento. El muñeco reaparece en cada petición y no concede oro, gemas ni equipo.

### 9.2 Configuración propia de loot

Se añadieron `server/game-config.js` y `server/loot-service.js`. Los valores definidos son decisiones de balance de Dragon Realm:

- Oro: 20% en mobs normales y 30% en jefes.
- Gemas: 0,1% en mobs normales y 0,5% en jefes.
- Equipamiento: guantes 0,5%, pantalones 2%, armadura 1% y botas 3%.
- Multiplicadores de equipo por velocidad: muy rápida ×1,20; rápida ×1,10; normal ×1,00; lenta ×0,95; muy lenta ×0,90.
- Oro de tier 1: 10–30 unidades; los jefes reciben un multiplicador de cantidad ×1,30.

El servicio de loot ya es una función determinista bajo un generador aleatorio inyectado y cuenta con pruebas de probabilidad, multiplicadores y entradas inválidas. **Todavía no se invoca desde una muerte de enemigo real**: el combate actual solo incluye el muñeco, que no debe soltar botín. El siguiente paso es añadir definiciones de mobs con vida persistente, muerte y respawn, y entonces conectar el resultado de `rollLoot` dentro de la misma transacción que registra la muerte y recompensa.

### 9.3 Pruebas automatizadas

Se añadieron pruebas para:
- Mínimo de Poder/Potencial por golpe.
- Recompensa única de la misión en el décimo muñeco.
- Cooldown anti-spam.
- Mobs desconocidos y estadísticas inválidas.
- Costes de mejoras y restricción Potencial ≤ Poder.
- Probabilidades de oro/gemas y modificadores de equipo.

El workflow `.github/workflows/test.yml` ejecuta comprobación de sintaxis y pruebas con Node.js 20 en cada push a `main` y en pull requests.


### 9.4 Segundo bucle PvE: mobs, muerte, respawn, loot e inventario

Implementado en `server/game-config.js` y `server/game-service.js`:

- Definiciones configurables para Saibaman explorador (100 HP), Saibamen de 250K/500K/700K/1M HP, Raditz (1M), Vegeta (1,2M) y Vegeta Ozaru (1,7M).
- Cada personaje mantiene su propio HP y temporizador de reaparición por ID de mob en su estado JSONB. El endpoint bloquea la fila del personaje con `FOR UPDATE`, por lo que las acciones concurrentes de esa cuenta se serializan.
- Los mobs normales otorgan Poder y Potencial juntos por golpe, usando el rango del tier configurado. El muñeco conserva su recompensa especial y el progreso de la primera misión.
- El loot se calcula únicamente al derrotar un mob, y los recursos se agregan al estado antes de guardar la acción en la transacción PostgreSQL existente.
- Inventario con acumulación de objetos iguales, cuatro ranuras de equipo, requisito de Poder para equipar y estadísticas efectivas recalculadas por el servidor.
- La interfaz permite atacar los mobs configurados, ver la vida restante, los recursos y el equipo del inventario.

**Límite importante:** estas instancias son por personaje, no compartidas entre jugadores. No hay todavía un identificador global de aparición ni una tabla global de muertes/recompensas. Esto evita presentar el prototipo como un MMORPG multijugador ya terminado. Antes de compartir enemigos entre usuarios habrá que crear instancias globales con bloqueo de fila, IDs únicos de muerte y reclamaciones idempotentes.

Los valores de HP/defensa/respawn de mobs superiores, rangos de oro y bonificaciones de equipo son valores iniciales de diseño para Dragon Realm. Los HP nominales de los Saibamen, Raditz, Vegeta y Vegeta Ozaru respetan las cifras de progresión definidas para el proyecto; el resto de los números no se consideran datos confirmados del juego original.

### 9.5 Pruebas añadidas para el bucle PvE

Las nuevas pruebas verifican que el Saibaman explorador concede PP por golpe, el botín aparece solo en la muerte, el enemigo no puede volver a dar recompensas durante su temporizador de respawn, y el equipo exige el Poder correspondiente y aplica su bonificación. Estas pruebas complementan las de la misión de entrenamiento, el cooldown y las mejoras de estadísticas.


### 9.6 (Histórico, sustituido en 9.7–9.8) Tercer paso PvE: vida compartida de enemigos en PostgreSQL

**Estado histórico de ese commit:** los mobs configurados salvo el muñeco de entrenamiento usaban `global_mob_instances`, una tabla compartida entre cuentas. Las secciones 9.7–9.8 documentan la evolución posterior a `world_mob_spawns`, que es la fuente de autoridad actual por aparición.

- Al iniciar, el servidor crea las filas que falten para cada mob configurado sin reiniciar ni curar las apariciones existentes.
- `GET /api/mobs` devuelve HP, HP máximo, respawn, contador de derrotas y marca de jefe.
- Para atacar, la API bloquea primero el personaje y después la fila del mob con `FOR UPDATE`; calcula daño, PP y botín en la misma transacción PostgreSQL.
- La actualización de HP global y la concesión del botín al personaje que da el golpe final se confirman juntas. Si la transacción falla, se revierten ambas. Un segundo atacante no puede cobrar la misma muerte: ve el mob muerto y recibe el tiempo de reaparición.
- La tabla conserva HP, temporizador y contador de derrotas tras reinicios de la aplicación. El cliente muestra el estado actual de las apariciones al iniciar sesión y después de cada acción.

**Alcance exacto:** hay una aparición compartida por cada tipo de mob, no un sistema completo de spawns por mapa. El último golpe recibe el botín; todavía no hay reparto por daño/grupo, bloqueo de objetivo, distancias, mapas, movimiento, IA, eventos WebSocket ni múltiples instancias de un mismo tipo. Los mobs siguen siendo endpoints de combate por botón, no un personaje animado en un mundo 2D.

Pruebas añadidas: la vida del mob es externa al estado individual, un jugador no cobra la muerte que otro ya reclamó, el respawn permite continuar el combate y el contador de derrotas solo incrementa una vez por muerte confirmada.


### 9.7 Vista visual 2D de mapas y selección de objetivo

Implementado en la rama de trabajo `feature/world-maps-spawns`:

- El cliente dibuja una vista SVG escalable usando dimensiones y coordenadas lógicas entregadas por `GET /api/world`.
- Hay selector entre `earth_training` y `earth_wilderness`; los NPC y las apariciones se colocan en las coordenadas configuradas para cada mapa.
- Tocar/clicar un enemigo lo selecciona; también se puede seleccionarlo desde la lista de apariciones y solicitar un ataque.
- El cliente vuelve a consultar el estado del mundo después de sus acciones. No hay todavía difusión automática de cambios causados por otros jugadores.
- El terreno decorativo se genera localmente y no son sprites ni recursos extraídos de Ngọc Rồng Online.

**Límites explícitos al cierre de la sección 9.7:** en ese commit era solo una visualización; el movimiento y la validación de alcance se incorporaron en la sección 9.8. Siguen pendientes las colisiones, obstáculos transitables, animaciones, IA, interacciones completas con NPC y sincronización en tiempo real.


### 9.8 Movimiento autoritativo, portales y alcance de combate

Implementado posteriormente en la rama de trabajo:

- Los personajes nuevos comienzan en `earth_training` en coordenadas lógicas `(150, 420)`. Los personajes existentes sin posición válida reciben una posición inicial segura al normalizar su estado.
- La acción `move_player` recibe un destino, pero el servidor calcula el siguiente paso según el tiempo transcurrido, limita la distancia por petición y rechaza coordenadas fuera de los límites del mapa o cambios de mapa directos.
- El cliente permite tocar el suelo para desplazarse y tocar un enemigo para seleccionarlo y aproximarse a una posición de ataque.
- Se añadieron portales en ambos mapas. `travel_map` solo permite viajar a un mapa conectado y exige estar cerca del portal de la zona actual; el personaje aparece junto al portal de destino.
- Los ataques a apariciones del mundo comprueban en el servidor que el personaje esté en el mismo mapa y dentro del alcance configurado. Los clientes antiguos que envían solo `mobId` se resuelven a una aparición de su mapa actual y siguen sujetos a la comprobación de alcance.
- Las pruebas cubren límite de movimiento por petición, destinos fuera de mapa, frecuencia mínima, viajes por portal, proximidad al portal y alcance de combate.

**Límites registrados en esta etapa:** el movimiento es por pasos HTTP, no una simulación continua ni un sistema de networking en tiempo real. Las colisiones rectangulares y las interacciones con NPC se implementaron en las secciones 9.9 y 9.10. Siguen pendientes pathfinding automático, IA, sincronización de posición entre jugadores y animaciones finales. El alcance de combate usa una distancia lógica simple; deberá calibrarse cuando haya arte, hitboxes y movimiento de producción.

### 9.9 Colisiones de mundo validadas por servidor

Implementado en la rama `feature/world-maps-spawns`:

- `server/world-config.js` define obstáculos rectangulares por mapa con identificador, posición, dimensiones y tipo visual.
- `server/world-navigation.js` concentra las reglas de colisión: radio lógico del personaje, límites seguros y muestreo de segmentos cortos para evitar que un paso atraviese un obstáculo.
- El movimiento intenta resolver primero el eje con mayor desplazamiento y después el otro. Esto permite deslizarse por algunos bordes sin introducir todavía un pathfinder completo.
- `GET /api/world` devuelve las geometrías. `public/app.js` las representa con SVG, pero no decide si un movimiento es válido: el servidor sigue siendo la autoridad.
- Las pruebas cubren dimensiones dentro de los mapas, colisión, deslizamiento por borde, límites del personaje y bloqueo de movimiento desde `performAction`.

**Limitaciones:** las colisiones actuales son rectángulos estáticos y aproximan al jugador como un círculo de radio fijo. No hay navegación automática, detección de colisiones entre jugadores, alturas, saltos, plataformas, puertas, zonas dinámicas ni geometría basada en tiles. Las posiciones y dimensiones son propias de Dragon Realm, no extraídas de assets o datos de Ngọc Rồng.

**Fundamento REA:** DANG-PH documenta la separación de datos de NPC/mapa y presentación del cliente; nvt25 contiene estructuras `TileMap` y `MapTemplate`; DataNRO enumera mapas y plantillas de entidades. Estas fuentes justifican investigar geometría de mapa como dato separado, pero no prueban que usen el mismo formato de colisión. Ver `docs/REA_METODOLOGIA_REFERENCIAS.md` para la bitácora y las limitaciones de licencia.

### 9.10 Interacción de NPC y tienda

Implementado en `feature/world-maps-spawns`:

- `npc_interact` exige que el NPC exista, no sea un portal, esté en el mismo mapa y se encuentre a no más de 100 unidades lógicas del personaje.
- Bulma (`bulma_training`) devuelve un catálogo de cuatro piezas de equipo configurado en `server/game-config.js`. Los precios son decisiones de Dragon Realm y no se presentan como valores del juego original.
- `buy_item` valida en servidor el NPC vendedor, el ID de producto, el oro disponible y el espacio de inventario antes de descontar oro y conceder el objeto. El cliente no envía el precio y la acción se guarda dentro de la transacción existente.
- El Maestro (`master_training`) ofrece diálogo, entrenamiento con muñeco y accesos a mejoras de Vida, Ki y Ataque. Las acciones solicitadas desde su menú validan proximidad y rol; las mejoras globales existentes se mantienen por compatibilidad.
- El cliente puede tocar un NPC, acercarse mediante movimiento validado y abrir un panel responsivo con diálogo y opciones. Los portales mantienen su acción específica de viaje.

**REA / comparación:** `NpcShopItem.md` de DANG-PH documenta una tienda modelada como ofertas configurables y presentada por el cliente; se adapta ese concepto con un catálogo propio y compras autoritativas. El repositorio oficial de la herramienta de ingeniería inversa asistida es [morluto/rea](https://github.com/morluto/rea). Se revisó su documentación pública como referencia de método, pero no se ha ejecutado su servidor MCP sobre Ngọc Rồng en esta sesión; no se atribuyen a REA hallazgos que no produjo.

**Pruebas añadidas:** proximidad y zona del NPC, catálogo de Bulma, compra con saldo suficiente, rechazo por oro insuficiente, rol vendedor incorrecto, entrenamiento y mejora de Potencial junto al Maestro.


### 9.11 Misión de patrulla del Maestro y recompensas idempotentes

Implementado en la rama de trabajo:

- El Maestro permite aceptar la misión `scout_patrol`; el estado `accepted`, el contador `missionProgress.scoutPatrolKills` y el indicador `claimed` se guardan dentro del JSON persistido del personaje, sin una migración destructiva de la base de datos.
- El objetivo es derrotar tres Saibamen exploradores (`saibaman_scout`) en `earth_training`. El progreso solo avanza en el servidor al confirmar una derrota completa de una aparición compartida de ese mapa; golpear sin dar el último golpe o derrotar el mismo tipo de mob fuera de la zona no incrementa el contador.
- La recompensa se reclama hablando con el Maestro después de completar el objetivo: 100 Poder, 100 Potencial y 100 de oro. El servidor rechaza la aceptación duplicada, el reclamo prematuro y el reclamo repetido.
- La acción de juego bloquea la fila del personaje con `FOR UPDATE` y guarda la misión y la recompensa dentro de la transacción existente. Esto evita que dos solicitudes concurrentes del mismo personaje cobren dos veces.
- El cliente muestra progreso y estado de misión, pero no envía ni decide la cantidad de enemigos ni los premios.
- Las pruebas cubren progresión, aceptación desde el NPC correcto, bloqueo de reclamo anticipado, progreso antes de aceptar y prevención del doble pago.

**Límites:** es una misión inicial lineal, no un motor de sagas genérico. El contador actual se incrementa cuando el jugador consigue la derrota final de un Saibaman explorador; todavía no existe reparto de contribución por daño, grupo, misiones con múltiples etapas ni reinicio diario.


### 9.12 Definiciones reutilizables de misiones y progresión entre mapas

Se añadió `MISSION_DEFINITIONS` a `server/game-config.js`. Cada misión define su identificador, título, descripción, NPC responsable, mapa y tipo de enemigo objetivo, cantidad requerida, Poder mínimo, clave de progreso y recompensa. El servidor usa esta configuración para mostrar opciones, aceptar/rechazar la misión, registrar derrotas y pagar la recompensa; el cliente no elige cantidades ni valores de premio.

Misión de entrenamiento existente:
- `scout_patrol`: tres `saibaman_scout` en `earth_training`; la gestiona el Maestro; recompensa de 100 Poder, 100 Potencial y 100 de oro.

Nueva misión de progresión:
- `wilderness_patrol`: requiere 1.000 Poder; tres `saibaman_scout` en `earth_wilderness`; la gestiona el Explorador de la Llanura; recompensa de 250 Poder, 250 Potencial y 250 de oro.
- Se añadió una aparición de Saibaman explorador en la Llanura y el NPC que entrega la misión.
- El cliente presenta un rastreador de progreso independiente para ambas misiones.
- Los campos nuevos se inicializan al cargar personajes antiguos, preservando el progreso previo.
- La acción de reclamo continúa dentro de la transacción con bloqueo de fila del personaje, por lo que los reclamos concurrentes no duplican premios.

Las recompensas y el requisito de 1.000 Poder son valores de diseño propios de Dragon Realm, no estadísticas verificadas del juego original. El sistema es data-driven para los tipos de misión actualmente soportados (derrotar una cantidad de enemigos); todavía no implementa cadenas de etapas, temporizadores, misiones diarias, contribución de grupo ni árboles de saga.


## 10. Inspección directa de código del cliente de referencia

Revisión de archivos fuente en el repositorio público `DANG-PH/ngoc-rong-online`, rama `master`, árbol/commit consultado `cb648f49b69555865d6fc41e461c79e3172b85c1`.

### 10.1 Hitboxes direccionales
Archivo: `core/src/main/java/com/dang/dragonboy/xu_ly_map/HitboxDat.java`.

La clase guarda rectángulos `x/y/width/height` y separa pruebas de colisión según dirección: aterrizaje desde arriba, golpe desde abajo y contacto por lados. Las comprobaciones también consideran velocidad vertical en los casos superior/inferior. Esto es evidencia de cómo esta recreación organiza hitboxes direccionales; no demuestra que Dragon Realm deba usar la misma física.

**Aplicación potencial:** si Dragon Realm evoluciona desde desplazamiento en plano hacia plataformas, salto o caída, necesitará colisión direccional y pruebas de borde en vez de tratar todos los obstáculos como rectángulos sólidos equivalentes. No se implementó física de plataformas en este ciclo.

### 10.2 Carga de mapas y NPC
Archivo: `core/src/main/java/com/dang/dragonboy/xu_ly_map/MapCoBan.java`.

La inicialización llama primero a `taiDuLieuMap()`; para `mapId == 0` termina sin consultar NPC del servidor; en otros mapas consulta `MapDataCache` o llama a `ApiService.layNpcCuaMap`, almacena el resultado en caché y aplica los NPC activos. La conversión del campo `loai_npc` a enum y la creación de objetos visuales se realizan en la capa del mapa.

**Aplicación:** separar datos de NPC, caché y representación visual es un patrón útil. Dragon Realm mantiene los NPC configurados en `server/world-config.js` y valida interacción en el servidor; no necesita replicar la arquitectura Java/LibGDX.

### 10.3 Estado y sincronización de jugadores
Archivos:
- `core/src/main/java/com/dang/dragonboy/websocket/PlayerState.java`
- `core/src/main/java/com/dang/dragonboy/websocket/WorldState.java`

`PlayerState` conserva un buffer de snapshots, usa un retardo de render configurado en 150 ms y documenta la intención de interpolar entre snapshots para amortiguar jitter. `WorldState` contiene una colección concurrente de jugadores y métodos separados para snapshot de mapa, aparición, desaparición y sincronización. Son detalles de esa implementación, no una medición universal ni una garantía de que 150 ms sea ideal.

**Aplicación:** la sincronización de enemigos discretos ya usa una firma global transaccional y un flujo SSE autenticado: el servidor sondea PostgreSQL una sola vez cada 500 ms y difunde cambios por revisión a todos los clientes conectados; el cliente reconecta usando su cursor y puede recuperar cambios con la ruta HTTP incremental. Esto no sustituye WebSocket para datos de movimiento de alta frecuencia. Para jugadores, el siguiente paso sería un canal WebSocket con snapshots por mapa y buffer de interpolación, con RTT/jitter medidos antes de elegir un retardo fijo. Se adapta el patrón de arquitectura documentado en NRO, no se copian binarios ni assets no verificados.

## 11. Estado de REA tras inspeccionar documentación

La documentación de REA describe análisis estático de APK Android mediante JADX y requiere suministrar un JDK 17+ y un JAR de JADX verificado; en Linux también documenta una dependencia `ps` compatible con procps. El paquete público consultado declara requisitos de Node.js más nuevos que el mínimo de Dragon Realm. Esto identifica requisitos, no una ejecución satisfactoria.

No se ejecutó REA, no se analizó ningún APK y no se inspeccionó un cliente oficial. Para continuar por esa vía se necesita un artefacto de prueba cuyo análisis esté autorizado y un entorno con los requisitos instalados; mientras tanto, la investigación continúa con código y documentación públicos.


## 12. Auditoría de persistencia del registro de apariciones

El seed de `server/index.js` usaba `ON CONFLICT (spawn_id) DO NOTHING`. Eso preservaba el estado dinámico, pero también congelaba para siempre los datos estáticos de mapa, tipo y coordenadas en la primera inserción. Si se ajustaba una aparición en `world-config.js`, la base podía seguir publicando la ubicación anterior.

La inicialización ahora sincroniza los metadatos estáticos de las apariciones. Para el mismo tipo de enemigo conserva el HP/respawn/contador y limita HP al máximo configurado; para un cambio de tipo reinicia el estado específico del enemigo. Un cambio de coordenadas o mapa limpia `combat_started_at_ms`, pero no reinicia el HP ni el respawn. Las filas que ya no figuran en la configuración no se borran automáticamente.

**Estado de verificación:** la lógica fue revisada estáticamente y se enviará a CI; no se ejecutó contra PostgreSQL real en esta sesión. La validación de CI no sustituye una prueba de integración de base de datos.


## 13. Auditoría de pérdida de botín

La ruta de combate ya protegía el estado de HP y recompensas con la transacción de personaje/appearance, pero el caso de inventario lleno dejaba los objetos en una lista de respuesta sin persistirlos. Como el cliente no ofrecía una recogida posterior, el equipo no se podía recuperar.

Se añadió una cola `pendingLoot` dentro del estado JSONB del personaje. Tanto los enemigos locales como los spawns compartidos depositan ahí los objetos que no caben. El jugador puede recoger lo que entre en el inventario; el resto permanece en cola. El campo ausente se migra a una lista vacía al actualizar personajes antiguos.

**Riesgo/alcance:** no es un sistema de objetos tirados en el mapa ni un almacén externo; es una cola personal persistente. Sigue dependiendo de la transacción existente de `/api/game/action` para que el cambio de inventario y la cola se guarden juntos. CI y tests unitarios se ejecutarán; falta validación de extremo a extremo con PostgreSQL real.


## 14. Flujo SSE para cambios compartidos de enemigos

En la fase siguiente se añadió `GET /api/world/stream?since=N`, autenticado con el mismo Bearer JWT que la API. El cliente consume el cuerpo HTTP como stream, procesa eventos `world-changes`, conserva el cursor global y reabre la conexión si se interrumpe. El servidor mantiene un único sondeo central por proceso cada 500 ms, no un timer de base de datos por jugador; cada evento incluye la firma y el estado más reciente de las apariciones modificadas. Los heartbeats mantienen la conexión y el cierre de proceso termina los streams.

El endpoint `GET /api/world/changes?since=N` sigue disponible para catch-up cuando el stream no está disponible. La suscripción se registra antes de consultar el catch-up para evitar una ventana perdida; revisiones repetidas se ignoran en el cliente. SSE se eligió para cambios unidireccionales de enemigos. Para posiciones de jugadores, inputs y snapshots frecuentes, el patrón NRO de WebSocket/snapshots/interpolación es una futura fase, no algo que esta implementación afirme haber resuelto.

**Verificación:** CI con PostgreSQL 16 comprueba el trigger, la serialización de dos transacciones concurrentes y la persistencia al reconectar a la base. El endpoint SSE necesita además pasar CI de sintaxis y una validación manual de dos clientes; no se afirma haber realizado esa prueba de navegador en esta sesión.


## 10. Regla arquitectónica permanente: el mundo no gira alrededor del jugador

- Las coordenadas de personaje, enemigos, NPC, portales y obstáculos son coordenadas lógicas del mundo, no offsets relativos al jugador.
- El cliente envía una intención de movimiento; el servidor valida colisiones, límites, velocidad y mapa, y devuelve la posición autorizada.
- El mapa mantiene geometría y coordenadas estables. La cámara puede seguir visualmente al personaje en una futura escena de juego, pero eso no debe cambiar la posición lógica de entidades ni simular que el mundo se reordena.
- El estado de enemigos utiliza revisiones globales discretas y SSE. La presencia/posición de jugadores es un flujo distinto, limitado al mapa y con expiración por inactividad; no se mezcla con el contador global de cambios de enemigos.
- La primera presencia de jugadores se sincroniza por HTTP cada tres segundos y usa las coordenadas persistidas en `characters.state`; no acepta coordenadas publicadas por el cliente. La siguiente evolución será sustituir el sondeo de movimiento por snapshots agrupados a frecuencia medida y con interpolación de presentación, siguiendo el patrón estudiado en Ngọc Rồng Online.
- Esta implementación es un primer paso multijugador: no demuestra todavía capacidad para miles de jugadores, y debe medirse bajo carga antes de adoptar Redis, WebSocket o un servicio dedicado.

## 15. Registro append-only de revisiones de enemigos (2026-10-18)

La tabla `world_mob_spawns` representa el estado actual de cada aparición; por sí sola no puede conservar todos los estados anteriores de una misma fila. Si un enemigo recibe varias actualizaciones entre dos sondeos, consultar solo esa tabla puede devolver una única revisión final y perder las intermedias.

Para evitarlo, el esquema crea `world_mob_change_log` y un trigger `AFTER INSERT OR UPDATE` que registra una instantánea de cada mutación con la revisión asignada por el contador global transaccional. El estado actual, el incremento de revisión y el evento quedan dentro de la misma transacción: un rollback no deja una revisión publicada sin estado confirmado. El endpoint HTTP incremental y el stream SSE leen este registro ordenado por revisión.

La migración rellena las últimas instantáneas conocidas de filas existentes con revisión positiva. Los cambios históricos intermedios previos a instalar el registro no pueden recuperarse retrospectivamente. El log es append-only y aún no aplica retención; antes de compactarlo debe definirse cómo detectar cursores demasiado antiguos y forzar una descarga completa del snapshot.

Se agregó una prueba PostgreSQL para modificar dos veces la misma aparición y comprobar que ambas instantáneas se leen en orden. GitHub Actions run [#339](https://github.com/gavilandavid89-pixel/Dragon-Realm/actions/runs/39192103413) confirmó sintaxis y 62 pruebas aprobadas con PostgreSQL 16: 62 pasaron, 0 fallaron y 0 se omitieron.

## 16. Interpolación de presentación para presencia remota (2026-10-19)

El cliente conserva marcadores SVG remotos por nombre de usuario y anima su transformación entre la posición que estaba mostrando y el siguiente snapshot de servidor. El cambio de destino toma como origen la posición interpolada actual, para que una nueva actualización no provoque un salto al reiniciar el movimiento. Un render disparado por actualizaciones de enemigos no reinicia una interpolación si las coordenadas del snapshot de jugador siguen iguales.

La duración visual máxima es 2,8 s, ligeramente menor que el intervalo actual de sondeo HTTP de 3 s. Esto reduce la apariencia de teletransporte sin inventar coordenadas autoritativas ni afectar colisiones. Al cerrar sesión o cambiar de mapa se limpian los marcadores y la animación.

Este es un ajuste de presentación, no una mejora de la frecuencia de red: el servidor sigue actualizando presencia con movimientos autenticados y los clientes consultan otros jugadores cada 3 s. La próxima mejora de red debe introducir snapshots agrupados de mayor frecuencia y medir latencia/carga antes de adoptar WebSocket o un servicio dedicado.
