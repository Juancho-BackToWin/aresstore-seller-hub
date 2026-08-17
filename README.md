# Aresstore Seller Hub

Gestión de la cuenta de vendedor de Amazon de Aresstore. Contenedor de aplicaciones
con **Gestión Seller** dentro: rentabilidad real, tesorería a 90 días, inventario por
país, compras, publicidad y cumplimiento. FBA y FBM. PanEU.

Todo ocurre en el navegador. No hay servidor, ni cuenta, ni telemetría. Los datos
viven en el almacenamiento local y se exportan a JSON.

**En producción:** https://aresstore-seller-hub.vercel.app

---

## Cómo se compila

El archivo `index.html` que sirve Vercel **no se edita a mano**: se genera.
Se editan las piezas de `src/` y se ejecuta:

```bash
./build.sh          # versión desde package.json
./build.sh 0.6      # versión explícita
```

El script ensambla `index.html`, sella la versión visible en la interfaz, regenera
`manifest.webmanifest`, escribe `sw.js` con una versión de caché nueva —que es lo
que dispara la actualización automática en los dispositivos— y rasteriza los iconos.

### Orden de las piezas

| Archivo | Contenido |
|---|---|
| `src/01-head.html` | `<head>`, CSS completo, iconos incrustados, lanzador de apps |
| `src/02-views.html` | Panel, Datos, Rentabilidad, Tesorería, Catálogo, Inventario, Compras, Publicidad, Cumplimiento |
| `src/03-calculadora.html` | Validar producto y Comparador PanEU |
| `src/04-acerca.html` | Cómo está montado |
| `src/05-auditoria.html` | Auditoría del modelo financiero |
| `src/06-guia.html` | Guía Amazon Europa 2026 |
| `src/07-close.html` | Cierre, modal, toast |
| `src/10-const.js` | Países, tarifas del rate card, objetivos |
| `src/11-motor-validacion.js` | Motor de la calculadora de margen |
| `src/12-datos.js` | Estado, persistencia, importador, derivados |
| `src/13-render.js` | Lanzador, navegación, renderizado, modales, autoactualización |

---

## Pruebas

```bash
npm install
npm run fixtures     # genera informes de Amazon simulados, en inglés y español
npm test             # suite general en navegador real
npm run test:es      # informes en español dan las mismas cifras que en inglés
```

`tests/mkfixtures.js` y `tests/mkfixtures-es.js` generan ficheros con las
**cabeceras literales de Amazon**, incluidos los casos que rompen importadores
caseros: TSV disfrazado de CSV, codificación Latin-1, cabeceras con mayúsculas y
espacios, guiones bajos, y un CSV desalineado por decimales de coma.

---

## Decisiones de diseño que no conviene reabrir

1. **Un solo objeto Producto y un solo Pedido de compra** atraviesan todos los
   módulos. Es la diferencia estructural con las herramientas del mercado, donde
   cada módulo mantiene su propia versión del SKU y por eso los números no cuadran
   entre pantallas.
2. **El país es una columna, no un filtro.** Es el hueco europeo que no cubre nadie.
3. **Rentabilidad y Tesorería están separadas.** Devengo contra caja.
4. **Nombres funcionales, nunca de marca.** Si hay que explicar el nombre, está mal.
5. **La detección de informes no depende del idioma:** cabeceras inglesas, luego
   alias en español, luego el contenido de cada columna, y si nada basta se pregunta
   una vez y se recuerda.
6. **Cada cifra declara si está medida o estimada.**

---

## Estado y hoja de ruta

Ver `PLAN-sellerboard.md`. Resumen del orden de ejecución:

- **M0** · Histórico y fotos diarias de stock ← *lo siguiente, y urgente: el dato no capturado no se recupera*
- **M1** · Motor financiero: costes por lotes, las 21 métricas, gastos indirectos, IVA
- **M2** · Inventario: velocidad excluyendo días sin stock, seis parámetros de reposición
- **M3** · Compras y caja: el pedido crea el lote de coste, depósitos de producción
- **M4** · Publicidad: ACOS de equilibrio por palabra clave
- **M5** · Reembolsos: cuatro detectores de dinero que Amazon debe
- **M6** · Diferenciales europeos: multidivisa, IVA/OSS, EPR, histórico sin límite
- **M7** · Alertas de listado — solo con API, decidir más adelante

---

*Las tarifas de Amazon proceden del rate card europeo vigente el 1 de julio de 2026
y cambian sin previo aviso. Esto no es asesoramiento fiscal ni contable.*
