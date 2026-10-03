# Prompt maestro de Code · Aresstore Seller Hub · desde el 4 de octubre de 2026

Para una sesión de Claude Code (o una tarea programada) con el repositorio
`Juancho-BackToWin/aresstore-seller-hub` y el proyecto «Asistente AMAZON SELLER».
Ejecuta de principio a fin sin preguntar. **Pégalo tal cual.**

---

> Retomamos el Aresstore Seller Hub. Contesta en español. Antes de escribir una
> línea, lee `docs/METODO.md` (la norma, entera), `docs/INDICE.md` (el mapa) y
> `docs/TRASPASO-2026-10-03.md` (lo último hecho). Este mensaje es el plan.
>
> **Modo de trabajo.** Ejecuta de principio a fin sin pararte a preguntarme:
> elige tú y decide con tu mejor criterio. Cuando un bloque se atasque por algo
> que solo puedo hacer yo, déjalo anotado en `docs/PENDIENTE-JUANCHO.md` y pasa
> al siguiente; no esperes. Cada vez que necesites algo mío, mándame una
> notificación al móvil con 🔔 al principio, en una línea, y sigue con otra cosa.
> Al final, todo lo que dependa de mí va en una lista numerada con enlaces.
>
> **Autorizado:** añadir el repositorio a la sesión, clonar, ramas, compilar,
> suites, leer mi carpeta de Descargas (pídela si no está conectada), medir en
> local, commitear, empujar, abrir y actualizar PR, escribir documentos del
> proyecto, mirar sin cambiar nada en Seller Central con mi Chrome, y **fusionar
> a `main`** si la sesión te lo permite. Si la sesión te lo bloquea, no busques
> otra vía: deja la PR lista y avísame.
> **No autorizado:** borrar ramas, tocar ajustes de GitHub, Vercel o Seller
> Central, subir ningún informe real al repositorio.
>
> **Reglas que no se negocian:** ningún informe real en el repositorio; ninguna
> cifra real del negocio en el código, las PR ni `docs/` (van en los documentos
> del proyecto); toda prueba de un fallo verificada en las dos direcciones y roja
> con mensaje; deduplicar y resolver solapes antes de contar; lo que no está en
> el remoto no existe; Vercel no compila (`index.html` y `sw.js` compilados en
> cada commit); nunca un diff como entrega; medir un informe es medir sus filas;
> **una sola rama y una sola PR por sesión**; y **cada bloque que mueva una
> cifra de dinero pasa por un revisor independiente** (un agente que no haya
> visto el código) antes de darlo por cerrado, y cada hallazgo confirmado se
> convierte en prueba.
>
> ### Bloque 0 · Punto de partida
> Clona. **`pip install Pillow` antes de compilar**: el contenedor no lo trae y
> sin él `build.sh` sale con código 1 y `costuras.test.js` da tres fallos que no
> son del código (ver P-20; si puedes, deja el `SessionStart` hook que lo
> arregle de una vez). Compila y corre `node tests/run-all.js`. Esperado:
> **33 suites, 1.389 comprobaciones, 0 fallos** (o más, si alguien ha añadido).
> Mira si las PR #18 y la de la noche del 3-oct están fusionadas; si lo están,
> trabaja desde `main`. Enumera mi carpeta de Descargas y apunta qué informes de
> Amazon hay **más nuevos que el 23 de agosto** (la tabla de P-21 dice cuáles
> desbloquean qué).
>
> ### Bloque 1 · Paso 5 de Publicidad, sobre producción
> **Solo si las dos PR están fusionadas.** Comprueba que
> `https://aresstore-seller-hub.vercel.app` sirve el `index.html` de `main`.
> Carga en producción, con mi Chrome, los quince .xlsx de términos de búsqueda
> en el orden en que se descargaron, y comprueba en pantalla las cifras del §1
> del traspaso del 3-oct —que está en los documentos del proyecto, no en el
> repositorio—. Recalcula la tabla de 30/90/365 días con
> `herramientas/medir/medir-ppc-xlsx.js`, porque cambia con el día. **Mira
> además el aviso de campañas renombradas**, que es nuevo: con quince informes
> reales encima es donde tiene que demostrar que no da falsos positivos. Si algo
> no cuadra, para ese bloque y averigua por qué. Deja escrito qué ha salido;
> **no la des por apta**: eso lo decido yo.
>
> ### Bloque 2 · Reclamaciones (M5) con informes más largos
> Si en Descargas hay un informe de devoluciones de más de 45 días, un libro
> mayor de inventario o una segunda vista previa de tarifas, cárgalos con
> `herramientas/medir/medir-reclamaciones.js` y mide **qué detecta cada
> detector, uno a uno**. Las cuatro ventanas están re-verificadas el 3-10 y las
> frases literales de Amazon están pegadas en la cabecera de
> `src/23-reclamaciones.js`: compara texto con texto, no cifra con recuerdo. Lo
> que salga mal, con su prueba roja.
>
> ### Bloque 3 · Inventario y las diez `FBASPB`
> Si hay informe de gestión de inventario nuevo, mídelo y cierra la cobertura
> por país (M2). **Lo de las `FBASPB` no lo desbloquea un informe**: es P-22 y
> necesita una factura mía. No lo adivines.
>
> ### Bloque 4 · Publicidad: lo que el aviso de renombradas deje a la vista
> `pubRenombradas()` avisa con el **suelo** del gasto en juego y no une los dos
> nombres solo, a propósito. Si con los informes reales aparecen candidatos
> ciertos, el siguiente paso es decidir **cómo** se unen sin que el hub pueda
> fusionar dos campañas de verdad distintas: propónlo con su prueba antes de
> escribirlo, y que la decisión de unir sea mía y quede fechada, como las
> familias de coste.
>
> ### Bloque 5 · Lo que encuentres
> Si en cualquier bloque aparece un número creíble y falso en otra parte del
> hub, se arregla antes de seguir, con su prueba. En la sesión del 3-oct los dos
> que salieron fueron **de las propias pruebas**, no del código: una fixture que
> hacía pasar una aserción por el motivo equivocado y una fecha duplicada en dos
> sitios de la misma suite. Mira con ese ojo.
>
> ### Cierre
> Revisión adversarial independiente de todo lo hecho; suites completas; PR
> única con los pasos para fusionar en el editor web; traspaso del día
> (`docs/TRASPASO-<fecha>.md`), tabla de estado del `METODO.md`, el `INDICE.md`
> y un `ARRANQUE-SIGUIENTE-CHAT.md` nuevo que siga este mismo formato.
> Notificación final al móvil con la PR y lo que depende de mí.
