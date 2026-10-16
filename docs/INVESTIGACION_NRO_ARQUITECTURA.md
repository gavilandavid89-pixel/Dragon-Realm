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


### 9.6 Tercer paso PvE: vida compartida de enemigos en PostgreSQL

**Actualización posterior que reemplaza la limitación de 9.4 sobre instancias por personaje:** los mobs configurados salvo el muñeco de entrenamiento ahora usan `global_mob_instances`, una tabla compartida entre cuentas.

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

**Límites explícitos:** es una visualización de mapa, no movimiento jugable. No se implementaron coordenadas persistentes del jugador, controles direccionales, colisiones, límites transitables, alcance, interacción con NPC, animaciones de personaje ni sincronización en tiempo real. La selección de un enemigo no prueba que el personaje esté físicamente cerca; la validación de distancia deberá añadirse cuando exista posición autoritativa del jugador.
