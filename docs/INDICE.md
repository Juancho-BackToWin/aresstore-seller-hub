# Índice de la documentación

Qué hay y **cuándo se lee cada cosa**. Si solo vas a leer dos ficheros, son los
dos primeros.

---

## Para retomar el proyecto

| Fichero | Qué es | Cuándo |
|---|---|---|
| **`METODO.md`** | **La norma.** Cómo se trabaja aquí, qué está prohibido y la tabla de estado de cada herramienta | **Antes de escribir una línea**, siempre, aunque te pidan otra cosa por comodidad |
| **`TRASPASO.md`** | El estado técnico de fondo: qué es el hub, dónde vive, estructura de ficheros, errores ya corregidos | Al retomar desde cero |
| `ARRANQUE-SIGUIENTE-CHAT.md` | El plan de la sesión siguiente, listo para pegar | Al abrir una sesión nueva |
| `PENDIENTE-JUANCHO.md` | Cola de lo que **no puede resolver el agente** porque depende de una decisión suya o de un dato real | Cuando algo se atasque, para anotarlo y **seguir** |

## Traspasos por día

Un traspaso por sesión, con lo medido ese día y el rojo demostrado. `TRASPASO.md`
es el de fondo; estos son el registro.

| Fichero | Sesión |
|---|---|
| `TRASPASO-2026-10-03.md` | Bloques 2, 3 y 4: asignación por país, ventanas de reclamación y campañas renombradas |

## El plan del producto

| Fichero | Qué es |
|---|---|
| `PLAN-sellerboard.md` | El detalle módulo a módulo: qué sustituye de Sellerboard y qué no |
| `Aresstore-Seller-Hub-Plan.docx` | El razonamiento de fondo, 9 páginas. Regenerable con `node docs/plan-docx.js` |

## Los carriles

Uno por área. Cada uno dice **qué hace, qué NO hace y qué le falta** — y esa
tercera columna es la que importa: una funcionalidad cuyos límites no están
dichos no está terminada.

| Carril | |
|---|---|
| `carriles/1-importador.md` | Entrada de los doce informes |
| `carriles/2-catalogo.md` | Catálogo y familias de coste |
| `carriles/3-reclamaciones.md` | Detectores de reembolso (M5) |
| `carriles/4-publicidad.md` | PPC, solapes y ACOS de equilibrio |
| `carriles/5-rentabilidad.md` | P&L y margen |
| `carriles/6-inventario.md` | Stock, cobertura y previsión |
| `carriles/7-compras.md` | Cuándo lanzar el pedido |
| `carriles/8-cumplimiento.md` | IVA y diferenciales europeos |
| `carriles/9-spapi.md` | Lo que haría falta de la API, si algún día |
| `carriles/10-validador.md` | Comparador PanEU |
| `carriles/PROPIEDAD.md` | Quién manda sobre qué fichero |
| `carriles/_plantilla.md` | Plantilla para un carril nuevo |

---

## Dos reglas sobre esta carpeta

**Ninguna cifra real del negocio vive aquí.** Ni en el código, ni en las PR, ni
en `docs/`. Van en los documentos del proyecto. Lo que se escribe aquí sale de
fixtures sintéticas.

**Ningún informe real se sube al repositorio.** Las fixtures se generan al
arrancar las suites (`tests/mkfixtures*.js`) porque llevan fechas relativas a
hoy: versionarlas solo añadiría ruido a cada merge.
