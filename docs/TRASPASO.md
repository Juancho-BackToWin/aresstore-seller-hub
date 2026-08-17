# Aresstore Seller Hub — traspaso a sesión nueva

Estado a 17 de agosto de 2026. Este documento es lo único que hace falta leer para
retomar el proyecto desde cero. Todo lo demás está en el repositorio.

---

## 1. Qué es esto

Herramienta propia de gestión del negocio de Amazon de Juancho (Grupo Arestora,
marcas **18KOra** y **VEHILEX**, joyería/pulseras, PanEU, ~3-10 k€/mes).

Sustituye a un Sellerboard en lo esencial sin depender de la API de Amazon: se
alimenta de los informes que se descargan a mano de Seller Central, **en español o
en inglés indistintamente**. Es una PWA de un solo archivo, instalable en móvil y
PC, que funciona sin conexión.

**Decisión de fondo del proyecto:** el 75 % del valor de Sellerboard no necesita
API. Se construye el núcleo financiero y de inventario; se compra lo fiscal
(Vendorati); se importa lo de investigación (Helium 10, ya pagado); no se toca
la automatización de pujas ni el autoresponder.

El razonamiento completo está en `docs/Aresstore-Seller-Hub-Plan.docx` (9 páginas,
regenerable con `node docs/plan-docx.js`) y el detalle técnico módulo a módulo en
`docs/PLAN-sellerboard.md`.

---

## 2. Dónde vive

| | |
|---|---|
| Repositorio | `/home/claude/repo` — 2 commits, `81dbcb1` el último |
| GitHub | **pendiente de crear.** Usuario: `Juancho-BackToWin` |
| Vercel | proyecto `aresstore-seller-hub`, cuenta *Juancho Back To Win's projects* |
| URL viva hoy | `aresstore-seller-hub-nu.vercel.app` |
| URL que debe quedar | `aresstore-seller-hub.vercel.app` ← **pendiente** |
| Versión | v0.5, en producción, instalada en móvil y PC |

### Estructura

```
src/01-head.html      cabecera, CSS completo, lanzador de apps, barra lateral
src/02-views.html     Panel, Datos, Rentabilidad, Tesorería, Catálogo,
                      Inventario, Compras, Publicidad, Cumplimiento
src/03-calculadora.html  validador de producto (FBA/FBM) + comparador PanEU
src/04..07            Acerca de, auditoría, guía, cierre
src/10-const.js       países, tarifas, constantes fiscales
src/11-motor-validacion.js  motor de márgenes
src/12-datos.js       estado, persistencia e IMPORTADOR (lo más delicado)
src/13-render.js      navegación, render, modales, arranque, autoactualización
build.sh              ensambla index.html, sella versión, regenera sw.js
tests/                dos suites Playwright + generadores de fixtures
```

`./build.sh` ensambla, sella `v{VER} · {BUILD} UTC` en el pie, escribe un `sw.js`
con identificador de caché nuevo (que es lo que dispara la actualización en los
dispositivos) y valida la sintaxis. **Nunca editar `index.html` a mano**: se
sobrescribe en cada compilación.

---

## 3. Lo pendiente, en orden

### 3.1 · Dominio (Vercel, 2 minutos, lo hace Juancho)

El proyecto viejo ya está borrado, pero Vercel no ha reasignado la dirección: el
proyecto sigue sirviéndose en `-nu`. Solución: Settings → Project Name, cambiar a
cualquier cosa, Save, volver a poner `aresstore-seller-hub`, Save. Ese ida y
vuelta fuerza la reasignación. Verificar después en Settings → Domains.

Importa porque el icono del móvil y el marcador del PC apuntan a la dirección sin
`-nu`, y porque **los datos guardados están atados a esa dirección** (viven en el
navegador, no en el servidor).

### 3.2 · GitHub (lo que desbloquea todo lo demás)

Falta crear el repositorio privado `aresstore-seller-hub` y darme acceso de
escritura mediante un *fine-grained token* acotado a ese único repositorio con
permiso **Contents: Read and write**. Sin eso, cada avance vuelve a ser un zip que
Juancho tiene que subir a mano, que es justo lo que queremos eliminar.

Después: en Vercel, *Connect Git Repository* → ese repo. A partir de ahí cada
commit se despliega solo y la app se autoactualiza en sus dispositivos.

El zip listo para subir está en `/home/claude/aresstore-seller-hub-repo.zip`.

### 3.3 · M0 — empezar a guardar historia (primer módulo a construir)

**Urgente y silencioso.** Hoy cada importación reemplaza a la anterior: no hay
histórico. Cada día que pasa es un dato que no se recupera. Todo lo demás
(velocidad real de ventas, estacionalidad, detección de cambios de tarifa)
depende de esto.

Alcance: archivar cada importación con su fecha; foto diaria de stock por SKU y
país, precio, tarifa FBA y comisión; registro de días sin stock; compactación del
detalle a los 90 días; recordatorio semanal de copia de seguridad.

### 3.4 · M1.1 — costes por lotes

Cada SKU pasa de coste único a lotes con fecha, cantidad y coste unitario, con
tres métodos: por periodo, FIFO y promedio ponderado. Es lo que hace creíble el
margen.

### 3.5 · Después

M1.2 métricas que faltan (10 de las 21) · M1.3 gastos indirectos con amortización
diaria · M1.4 IVA como línea del P&L · M2 velocidad e inventario · M5.1 y M5.2
detectores de reembolso · M3 compras y caja · M4 ACOS de equilibrio · M6
diferenciales europeos · M1.5 vistas y exportación.

---

## 4. Lo que hace falta de Juancho (datos, no decisiones)

1. Los **lotes de compra reales** de sus cinco familias: fecha, cantidad, coste de
   fábrica y flete.
2. La **lista de gastos fijos** mensuales con su importe.
3. La **comisión real** que le cobra Amazon, del informe de vista previa de
   tarifas. Estamos calculando al 15 % por defecto y en joyería casi seguro no es
   ese número: es lo que más distorsiona el margen ahora mismo.
4. **Plazos de sus dos proveedores**: fabricación, tránsito, condiciones de pago.
5. El **hábito semanal** de importar pedidos e inventario. Sin esto nada funciona.

---

## 5. Errores ya corregidos — no reintroducir

Cada uno costó una iteración. Están documentados aquí para que nadie los repita.

- **Margen bruto que solo restaba el coste de producto.** Daba 72 % y estaba
  siempre en verde. Sustituido por *margen de contribución* (precio − coste −
  comisión − tarifa FBA), que da 33,5 %.
- **Devoluciones modeladas como un 3 % del PVP.** Falso y optimista justo en
  categorías de devolución alta. Ahora se modela la mecánica real: la tarifa FBA
  no se devuelve, la tasa de gestión del reembolso es `mín(5 €, 20 % de la
  comisión)`, hay tasa de procesamiento de devolución, y solo las unidades
  revendibles recuperan coste de producto.
- **Comparador de países determinista.** Alemania ganaba siempre porque solo
  variaba el IVA. Ahora cada país tiene PVP, tarifa, unidades y gestoría
  editables, y un mercado puede salir con margen unitario positivo y contribución
  anual negativa.
- **`normHdr` eliminaba los acentos en vez de plegarlos.** Este único fallo hacía
  imposible reconocer la mitad de las cabeceras en español. La función `fold()`
  es intocable.
- **Huella de contenido usada como filtro excluyente.** Descartaba informes en
  español. Ahora la identificación es por puntuación aditiva (`scoreReport`), con
  evidencia negativa (`forbid`) y campos obligatorios.
- **Alias laxos que casaban con columnas vacías.** La vista previa de tarifas se
  identificaba como pedidos. Se exige `orderId` en pedidos y devoluciones y se
  descartan columnas sin valores.
- **CSV español desalineado** (decimales con coma y separador coma): desplazaba
  todas las columnas dos posiciones y «Gasto» leía otra cosa. Ahora `parseDelimited`
  detecta el desajuste de recuento de celdas y **rechaza la importación**. Es la
  protección más importante del importador: el peor fallo posible no es un error
  visible, son números creíbles y falsos.
- **Parche aplicado a un archivo intermedio que nunca llegaba al compilado.** De
  ahí que el código fuente esté separado en `src/` y solo se toque ahí.

---

## 6. Riesgos abiertos y límites honestos

- **La base de la comisión no está cerrada.** El contrato europeo la define sobre
  el precio con impuestos, y así está implementada, pero hay fuentes que sostienen
  lo contrario con el servicio de cálculo de IVA activado. Son más de tres puntos
  de margen. Merece consulta escrita a Seller Support.
- **El beneficio proyectado es lineal.** Multiplicar margen por unidades asume que
  el coste publicitario por unidad no sube al escalar, y sube. Tratarlo como techo,
  nunca como previsión.
- **PPWR: la fecha del 12 de agosto de 2026 ya ha pasado** y hay mercados activos
  sin registro de EPR completo. Es el único riesgo real de bloqueo de listados.
- **No están modeladas** las sobretasas de utilización de almacenamiento ni de
  inventario añejo.
- Los datos son tan frescos como la última importación. Un panel que se actualiza
  solo cambia el comportamiento; uno que depende de acordarse, no.

---

## 7. Mensaje para arrancar la sesión nueva

> Retomamos el Aresstore Seller Hub. Lee `docs/TRASPASO.md` del repositorio
> (zip adjunto) y sigue desde ahí. Prioridad: conectar GitHub y construir M0.
