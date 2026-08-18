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

Hay un punto conocido y sin resolver aquí: el manifest y el `apple-touch-icon`
van incrustados como `data:` URL mientras `build.sh` genera un
`manifest.webmanifest` real que nadie enlaza. `pwa.test.js` falla por eso. En
iPhone el icono de la pantalla de inicio puede no ser el bueno. Entra en esta
fase.

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

Se mantiene al día. Una herramienta solo pasa a **apta** después del paso 5.

| Herramienta | Estado |
|---|---|
| Fontanería (navegación, importación, exportación, accesos, PWA) | por revisar |
| Datos · importador de informes de Seller Central | por verificar una a una |
| Histórico (M0) | construido y probado · sin verificar con datos reales |
| Costes por lotes (M1.1) | construido y probado · sin verificar con datos reales |
| Rentabilidad / P&L | incompleto · faltan M1.2, M1.3 y M1.4 |
| Tesorería | construido · sin verificar |
| Catálogo | construido · sin verificar |
| Inventario | construido · falta M2 |
| Compras | construido · falta M3 |
| Publicidad | construido · falta M4 |
| Cumplimiento | construido · sin verificar |
| Validar producto / Comparador PanEU | construido · sin verificar |
| Detectores de reembolso (M5) | no construido |

---

*El detalle técnico, el estado del despliegue y los errores ya corregidos están
en `docs/TRASPASO.md`. Esto es el cómo; aquello es el qué.*
