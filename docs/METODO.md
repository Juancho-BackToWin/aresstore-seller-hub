# Método de trabajo — Aresstore Seller Hub

**Esto no es una nota de una conversación. Es la norma del proyecto.** Cualquier
sesión que retome el Hub la lee antes de escribir una línea de código y trabaja
así, aunque le pidan otra cosa por comodidad.

Fijada por Juancho el 18 de agosto de 2026.

---

## La regla

**Primero se monta la herramienta y se deja apta para usarse. Después entran los
datos reales del negocio. Nunca al revés.**

Y una segunda, que es la que da sentido a la primera:

**Ningún número se da por bueno hasta que su funcionalidad esté verificada.**
Juancho no va a creerse nada de lo que aparezca en pantalla mientras no hayamos
comprobado que esa parte concreta funciona. Eso no es desconfianza: es la única
postura sensata ante una herramienta que decide dónde se mete el dinero.

---

## Por qué, y qué error concreto evita

Un hub de gestión no falla dando error. Falla dando **un número creíble y
falso**, que es el que hace que se escale un producto que pierde dinero o que se
deje de reponer uno que se está agotando.

Ya ha pasado en este proyecto, varias veces, y cada una se detectó tarde:

- El margen bruto daba 72 % y salía verde siempre, porque solo restaba el coste
  de producto.
- FIFO se volvía a gastar un contenedor de hace un año y el coste salía un 44 %
  por debajo, con el semáforo en verde y la pantalla afirmando «100 % medido».
- `iso()` devolvía el día anterior en horario español, así que las ventas del día
  en que cambiaba un lote se costeaban con el precio equivocado.
- El beneficio por mercado hacía que el país que vendía el producto caro saliera
  igual de rentable que el que vendía el barato. Justo al revés de la realidad.

Todos esos números eran perfectamente creíbles. Si en ese momento hubiera habido
datos reales encima, se habrían tomado decisiones con ellos. **Por eso los datos
reales entran al final, cuando la herramienta ya está comprobada, y no antes.**

---

## El ciclo

Cinco pasos. Los tres primeros se repiten herramienta a herramienta; los dos
últimos se hacen **una sola vez, al final, sobre todo el conjunto**.

**1 · Montar.** Construir la funcionalidad completa, no un esqueleto. Enlazada
con el resto del hub: si toca al coste, el coste se mueve en Rentabilidad, en
Inventario y en Tesorería, y cuadra entre las tres.

**2 · Verificar con datos sintéticos.** Pruebas automáticas con la aritmética
hecha a mano en el comentario, para que cuando una prueba falle se sepa quién de
los dos está equivocado. Revisión adversarial buscando el número creíble y falso,
no el error visible. Y comprobación en pantalla, no solo en el motor.

**3 · Enseñar qué hace y qué NO hace.** Antes de que entre un solo dato real,
Juancho tiene que saber qué pregunta responde esa herramienta, con qué precisión
y con qué límites. Una funcionalidad cuyos límites no están dichos no está
terminada.

Los pasos 1 a 3 no necesitan a Juancho: se encadenan de una herramienta a la
siguiente sin parar. Lo que aparezca por el camino y dependa de él se anota en
`docs/PENDIENTE-JUANCHO.md` y se sigue. **No se para a esperar.**

**4 · Cargar los datos reales, guiado. Al final, y de una vez.** Qué informe, de
dónde se descarga, en qué orden, y qué debería aparecer después de cargarlo.

**5 · Verificar contra la realidad, también al final y de una vez.** Contrastar
lo que dice el hub con lo que Juancho sabe de su negocio, herramienta por
herramienta pero en una sola tanda. Lo que no cuadre se arregla. Solo entonces
algo queda **apto**.

*Corregido el 18 de agosto de 2026 por Juancho: no se verifica tras cada
herramienta, se construye todo y se verifica al final. Se gana ritmo y se cargan
los datos una sola vez, porque todas las herramientas comen del mismo sitio. El
riesgo asumido a cambio: si algo está mal en la base, estará mal en varias
herramientas a la vez, y por eso los pasos 2 y 3 —pruebas con aritmética a mano y
revisión adversarial— dejan de ser una formalidad y son lo único que sostiene el
edificio hasta el final.*

---

## Antes de las herramientas: la fontanería

Lo primero no es un módulo nuevo. Es que la aplicación esté **montada y enlazada**:

- Que todas las pantallas naveguen y ninguna sea una maqueta disfrazada de
  funcionalidad. Donde haya maqueta, que lo diga.
- Que la **entrada de información** funcione de verdad para cada uno de los
  informes que el hub dice reconocer, en español y en inglés, y que cuando no
  reconozca algo lo diga en vez de tragárselo mal.
- Que la **salida** funcione: copia de seguridad, restauración, y las
  exportaciones de cada módulo.
- Que los **accesos** funcionen: la app instalable en móvil y PC con su icono
  correcto, la autoactualización al desplegar, y el funcionamiento sin conexión.

*Hecho el 18 de agosto de 2026.* El manifest y el `apple-touch-icon` iban
incrustados como `data:` URL mientras `build.sh` generaba un
`manifest.webmanifest` real que no enlazaba nadie —iOS ignora los
`apple-touch-icon` en `data:`, así que el icono del iPhone no era el bueno—, y
`pwa.test.js` llevaba fallando por eso desde antes de M0. Ahora se enlazan los
ficheros reales, el manifest declara un `id` explícito para que la app ya
instalada en móvil y PC se actualice en vez de duplicarse, y `pwa.test.js`
levanta su propio servidor y corre dentro de `npm run test:all`.

Lo que sigue abierto de esta fase está en la tabla de abajo: tres informes que
se importan y todavía no alimentan ningún cálculo.

---

## Lo que esta norma prohíbe

- Dar por buena una pantalla porque «se ve bien».
- Cargar datos reales para «ir probando» mientras se construye.
- Avanzar a la siguiente herramienta con la anterior a medias, aunque la
  siguiente parezca más interesante. Encadenar no es dejar cosas a medio hacer:
  cada herramienta se cierra en sus pasos 1 a 3 antes de tocar la siguiente.
- Pararse a esperar respuesta de Juancho. Lo que dependa de él se anota en
  `docs/PENDIENTE-JUANCHO.md` y se sigue con lo siguiente.
- Presentar como medido lo que es estimado. Si el hub no puede saber algo, la
  pantalla lo dice; no se disimula con un número plausible.
- Silenciar un límite porque afea el resultado.

---

## Estado de las herramientas

Se mantiene al día. Una herramienta solo pasa a **apta** después del paso 5, que
es de Juancho y va al final.

Lo que dice cada estado, para que no haya que interpretarlo:

- **maqueta** · se ve, no calcula nada con tus datos.
- **registro manual** · funciona, pero lo que enseña lo has escrito tú: no se
  alimenta de ningún informe.
- **construido, sin probar** · hay código y no hay prueba automática que lo
  sujete. Los números pueden ser correctos; no hay quien lo diga.
- **verificado con datos sintéticos** · hay pruebas con la aritmética hecha a
  mano y ha pasado una revisión adversarial. Sigue sin haber visto un dato real.
- **apta** · paso 5 hecho, contrastada contra el negocio.

Revisado el 18 de agosto de 2026 ejecutando cada pantalla, no leyéndola.

| Herramienta | Estado | Qué falta |
|---|---|---|
| Entrada · importador de los doce informes | verificado con datos sintéticos | los 12 se reconocen en inglés y los 7 traducibles en español, uno a uno (`informes.test.js`). Tres se guardan y **todavía no alimentan ningún cálculo**: libro de inventario, tarifas de almacenamiento e IVA por país. La pantalla lo dice |
| Salida · copia, restauración y exportaciones | verificado con datos sintéticos | ida y vuelta sin pérdida y siete exportaciones a CSV (`salida.test.js`) |
| Accesos · PWA, icono, autoactualización, sin conexión | verificado con datos sintéticos | `pwa.test.js` en verde y dentro de `test:all`. El icono del iPhone ya es el bueno |
| Histórico (M0) | verificado con datos sintéticos | su resolución depende de la costumbre de importar (P-3). Con una foto de stock semanal, la velocidad real se queda por debajo de la verdadera y la pantalla lo dice |
| Costes por lotes (M1.1) | verificado con datos sintéticos | los lotes reales de Juancho (P-2) |
| Rentabilidad / P&L | verificado con datos sintéticos | **M1.2** las 10 métricas que faltan de 21 · **M1.3** gastos indirectos con amortización diaria · **M1.4** IVA como línea propia |
| Catálogo | verificado con datos sintéticos | nada bloqueante |
| Tesorería | verificado con datos sintéticos | la fase del ciclo de cobro de Amazon se asume, y eso mueve el mínimo entre 1.424 € y 5.501 € en el ejemplo. Va en P-8 |
| Inventario | verificado con datos sintéticos | **M2**: cobertura por país cuando haya informe multipaís, y previsión |
| Compras | verificado con datos sintéticos | **M3**: cuándo lanzar el pedido para no romper stock. Necesita P-5 |
| Publicidad | verificado con datos sintéticos | **M4**: ACOS de equilibrio. El gasto se prorratea y se dice que se prorratea |
| Cumplimiento | registro manual | **M6**: diferenciales europeos. Hoy es una ficha que rellenas tú; no lee ningún informe, ni siquiera el de IVA por país, que se importa y se queda parado |
| Validar producto · Comparador PanEU | construido, sin probar | calculadora independiente: **no usa tus datos importados**, todo se teclea. Su modelo de devoluciones es el más completo del hub y es el que se ha llevado al P&L |
| Detectores de reembolso (M5) | no construido | el informe de reembolsos ya se importa y suma en el P&L; los detectores que buscan lo que Amazon te debe y no te ha pagado, no |

**Ninguna es apta todavía.** Todas están verificadas contra aritmética hecha a
mano y contra una revisión adversarial que buscaba el número creíble y falso —de
la que salieron veintitantos—, pero ninguna ha visto un dato real. Eso es el
paso 5 y es de Juancho.

---

*El detalle técnico, el estado del despliegue y los errores ya corregidos están
en `docs/TRASPASO.md`. Esto es el cómo; aquello es el qué.*
