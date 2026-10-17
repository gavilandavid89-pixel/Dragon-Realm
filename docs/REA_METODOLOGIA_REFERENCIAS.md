# Referencias múltiples y metodología REA para Dragon Realm

> Estado: plan de investigación. REA significa aquí ingeniería inversa aplicada al estudio de sistemas y comportamientos; no se asume que exista un único repositorio llamado REA.

## Objetivo

Estudiar varios repositorios públicos relacionados con Ngọc Rồng Online porque cada uno puede contener piezas diferentes: cliente, servidor, mapas, datos, NPC, objetos, sincronización o herramientas. Ningún repositorio se considera automáticamente la fuente definitiva ni se presupone que todas las recreaciones compartan las mismas reglas.

## Fuentes candidatas registradas

| Fuente | Qué aporta según la documentación pública | Tratamiento |
|---|---|---|
| https://github.com/DANG-PH/ngoc-rong-online | Cliente Java/LibGDX y documentación de networking, carga de NPC y tiendas; su archivo LICENSE declara MIT para ese repositorio. | Fuente principal para estudiar arquitectura del cliente y patrones documentados. Verificar por separado licencias de dependencias, recursos y repositorios asociados. |
| https://github.com/ElectroHeavenVN/DataNRO | Repositorio de datos documentado para mapas, NPC, monstruos, objetos, habilidades y partes; su README declara AGPL-3.0 y advierte que algunos recursos pueden faltar o diferir. | Usarlo para entender categorías y relaciones de datos, no para importar recursos sin revisar licencias y condiciones específicas. |
| https://github.com/baodubaiiii/NgocRongOnline_Data | Repositorio de datos/recursos con carpetas para mapas, monstruos, NPC, tiendas, iconos y efectos. | Útil como índice para saber qué tipos de datos existen. No copiar ni redistribuir recursos hasta comprobar licencia, titularidad y procedencia de cada carpeta/archivo. |
| https://github.com/nntruong02069999/ngoc-rong-online | Fork público que contiene directorios de cliente y servidor. | Comparar estructura y comportamiento con otras fuentes; licencia y procedencia deben verificarse antes de reutilizar código o assets. |
| https://github.com/DANG-PH/ngoc-rong-online-release | README de una recreación Java/LibGDX con backend NestJS + Go y notas sobre sincronización de jugadores. | Usar la descripción como pista para investigar arquitectura; contrastar con código y estado real de cada componente. |
| https://github.com/DANG-PH/dragonboy-game-data-service | Servicio de datos de juego referenciado por la documentación del cliente. | Inspeccionar licencia, modelos, migraciones y endpoints antes de tomar decisiones. |
| https://github.com/DANG-PH/dragonboy-game-service | Servicio de juego referenciado por la documentación del cliente. | Inspeccionar por separado; no inferir su licencia a partir de la del cliente. |
| https://github.com/DANG-PH/dragonboy-user-service | Servicio de usuarios referenciado por la documentación del cliente. | Inspeccionar por separado; no inferir su licencia a partir de la del cliente. |

La lista es una selección inicial, no un inventario exhaustivo. Los repositorios pueden cambiar, estar incompletos o contener materiales de terceros. Registrar la fecha y el commit revisado al realizar un análisis detallado.

## Método REA

Para cada sistema que estudiemos:

1. **Definir la pregunta.** Ejemplo: cómo se representa un NPC por mapa o cómo se sincroniza la posición de un jugador.
2. **Reunir evidencia permitida.** Leer código, documentación, esquemas y pruebas disponibles; observar comportamiento accesible de forma autorizada. No intentar acceder a cuentas, servicios privados ni datos ajenos.
3. **Separar niveles de certeza.**
   - **Confirmado:** explícito en código, esquema, documentación o prueba reproducible.
   - **Inferencia:** explicación plausible que encaja con la evidencia.
   - **Desconocido:** no hay evidencia suficiente.
4. **Triangular fuentes.** Comparar dos o más repositorios. Si difieren, documentar la diferencia en lugar de elegir arbitrariamente uno como “el original”.
5. **Extraer el concepto, no copiar a ciegas.** Diseñar una solución compatible con la arquitectura web actual de Dragon Realm y escribir código propio cuando sea posible.
6. **Revisar licencias y procedencia.** Comprobar el LICENSE del repositorio exacto y los avisos de archivos concretos. Una licencia MIT de un cliente no concede automáticamente derechos sobre otros repositorios, assets, marcas o contenido del juego comercial.
7. **Implementar en una rama aislada.** Añadir pruebas, migraciones compatibles y documentación; evitar romper el bucle PvE que ya funciona.
8. **Validar y registrar.** Ejecutar tests y checks de CI, describir límites y actualizar este documento con commit/archivo de referencia.

## Matriz de análisis por sistema

Para cada hallazgo, registrar:

- Sistema: mapa, movimiento, colisiones, NPC, tiendas, inventario, combate, enemigos, loot, misiones, sincronización o persistencia.
- Fuente exacta: repositorio, ruta del archivo y commit revisado.
- Evidencia: comportamiento o fragmento relevante resumido, sin atribuirle más de lo que demuestra.
- Confianza: confirmado / inferencia / desconocido.
- Comparación: qué coincide y qué difiere entre fuentes.
- Decisión para Dragon Realm: qué adaptaremos y por qué.
- Pruebas: cómo demostrar que la implementación propia funciona.
- Licencia y atribución: estado verificado, obligaciones y restricciones.

## Reglas de arquitectura para Dragon Realm

- Mantener el servidor como autoridad para estadísticas, movimiento validado, combate, inventario, economía y recompensas.
- Separar definición de entidad de sus apariciones en el mundo: un tipo de NPC/enemigo puede aparecer en distintos mapas y coordenadas.
- Mantener primero una arquitectura modular de Node.js + Express + PostgreSQL. Adoptar WebSocket, Redis o servicios separados solo cuando el juego y las pruebas lo justifiquen.
- Diseñar controles móviles primero: botones grandes, información legible y ninguna acción crítica dependiente de hover.
- No etiquetar una función como implementada hasta que exista código y pruebas; una idea investigada sigue siendo diseño.
- No asumir que las fórmulas o probabilidades de una recreación equivalen a las del juego oficial. El balance de Dragon Realm debe quedar configurable y documentado como decisión propia.

## Primer orden de investigación recomendado

1. Mapas, definiciones y apariciones de NPC/enemigos.
2. Movimiento, límites de mapa y colisiones.
3. Sincronización de jugadores y reconexión.
4. Interacción con NPC y catálogo de tiendas.
5. Combate, habilidades, muerte y recompensas.
6. Misiones, progresión, equipo y sistemas avanzados.

Este orden complementa la rama de mapas/spawns y evita introducir multijugador en tiempo real antes de que las reglas del mundo y las pruebas del servidor estén claras.

## Bitácora de investigación — 2026-10-17

### Fuentes contrastadas para mundo, NPC y navegación

- **DANG-PH/ngoc-rong-online**: `Networking-MMORPG-2D.md` describe una arquitectura que evoluciona de mensajes JSON/Socket.IO a WebSocket binario y snapshots/interpolación. `NpcLoading.md` documenta DTO separados de los objetos visuales y carga de NPC por mapa. `NpcShopItem.md` muestra ofertas de tienda servidas por API y cacheadas en cliente. El `LICENSE` del repositorio declara MIT; eso no concede automáticamente permisos sobre otros repositorios o assets externos.
- **nvt25/Online_nro**: el árbol público contiene `Client/Source/TileMap.cs` y `Client/Source/MapTemplate.cs`, además de código/recursos del servidor y mapas. Es un fork con estructura distinta del cliente Java/LibGDX; debe tratarse como evidencia independiente, no como autoridad equivalente.
- **ElectroHeavenVN/DataNRO**: el README enumera datasets separados para mapas, plantillas de monstruos, NPC, objetos, clases/habilidades y partes. Declara AGPL-3.0 para el código del proyecto y avisa que no todos los recursos están disponibles o son idénticos. La licencia del código no demuestra por sí sola la licencia de cada recurso de juego ni autoriza asumir derechos sobre contenido de terceros.

### Snapshots de las fuentes revisadas

Estos son los commits de las ramas públicas consultadas durante esta sesión (2026-10-17); no son commits de Dragon Realm:

| Repositorio | Rama/commit observado | Archivos o datos consultados |
|---|---|---|
| [DANG-PH/ngoc-rong-online](https://github.com/DANG-PH/ngoc-rong-online) | `master` · `cb648f49b69555865d6fc41e461c79e3172b85c1` | `Networking-MMORPG-2D.md`, `NpcLoading.md`, `NpcShopItem.md`, `LICENSE` |
| [nvt25/Online_nro](https://github.com/nvt25/Online_nro) | `main` · `1732e1f258b69dd812de96d35fd223624b950128` | árbol del repositorio; `Client/Source/TileMap.cs`, `Client/Source/MapTemplate.cs` existen en ese árbol |
| [ElectroHeavenVN/DataNRO](https://github.com/ElectroHeavenVN/DataNRO) | `main` · `4bccf581523f148e4f288684dd36d1ef1efeff7a` | `README.md`, `LICENSE` |

El contenido remoto puede cambiar; antes de basar una decisión futura en detalles concretos, volver a revisar el archivo y registrar el nuevo commit. La existencia de un archivo en el árbol no equivale a haber validado su implementación.

### Comparación y certeza

| Hallazgo | Estado | Decisión para Dragon Realm |
|---|---|---|
| Las fuentes separan al menos parte de los datos de mapa/NPC/objetos de su representación en cliente. | Confirmado en documentación/código de las recreaciones revisadas. | Mantener configuración de mundo en servidor y una representación visual desacoplada. |
| Un cliente MMORPG puede necesitar suavizado de posiciones y tratamiento explícito de teletransportes/reconexiones. | Confirmado como recomendación técnica en la documentación de networking de DANG-PH; no implica que el juego oficial use exactamente ese diseño. | Dejar WebSocket/snapshots para una fase posterior; primero estabilizar movimiento, colisiones y transiciones de mapa. |
| Los datos públicos de mapas pueden ser incompletos, específicos de versión o de una recreación. | Confirmado por las advertencias del README de DataNRO y por las diferencias entre repositorios. | No importar coordenadas ni fórmulas automáticamente; triangular y documentar las discrepancias. |
| Los obstáculos del mundo deberían tener una fuente de autoridad independiente de la imagen que los dibuja. | Decisión de arquitectura propia, inspirada en la separación de datos y visuales; no se atribuye como implementación idéntica de las fuentes. | `server/world-config.js` define obstáculos; `server/world-navigation.js` los valida en servidor; el cliente solo los dibuja. |

### Aplicación concreta en la etapa de colisiones

Se añadieron rectángulos de colisión configurables para los dos mapas actuales. El servidor limita el radio del personaje, comprueba el desplazamiento por segmentos cortos para evitar atravesar obstáculos en un solo paso y permite deslizarse por un borde intentando resolver cada eje por separado. El cliente representa las mismas geometrías recibidas en `GET /api/world` y detiene el movimiento si no logra avanzar.

Esto es una primera implementación propia, no una réplica exacta del formato de mapas de Ngọc Rồng. Aún no hay pathfinding automático, hitboxes de tilemap, rampas/plataformas ni pruebas con arte definitivo.

### Próximas preguntas REA

1. ¿Qué estructura de tiles/colisiones usa cada fuente y cómo codifica las zonas caminables?
2. ¿Qué comportamiento se observa cuando un NPC o enemigo ocupa un punto de paso?
3. ¿Qué eventos de red hacen falta al entrar/salir de mapa y al reconectar?
4. ¿Qué datos de tienda deben refrescarse en vivo y cuáles pueden cachearse?
5. ¿Qué repositorios y carpetas tienen licencia verificable para cada código/recurso que se pretenda reutilizar?

Cada análisis futuro debe anotar repositorio, ruta, commit y licencia comprobados; las fuentes candidatas anteriores no sustituyen una revisión por archivo.