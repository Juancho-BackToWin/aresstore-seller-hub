# Carril N · <nombre>

Rama `carril/<n>-<nombre>` · desde `base/2026-09` · PR en borrador contra la base.

## Qué pregunta responde

Una o dos frases sobre qué sabe el hub después de esto que antes no sabía. No la
lista de funciones: la pregunta del negocio. Si no se puede escribir así, casi
siempre es que el carril está construyendo algo que nadie ha pedido.

## Qué NO hace

Lo que queda fuera a propósito, y por qué. Esto vale tanto como lo anterior: la
siguiente sesión tiene que poder distinguir lo que se decidió no hacer de lo que
se olvidó.

## Pruebas, y en qué dirección se vieron fallar

Una línea por comprobación que persigue un fallo. Para cada una: qué demuestra,
y **el mensaje exacto con el que sale roja sin el arreglo**. Una prueba que no se
ha visto fallar no demuestra nada; y si al fallar escupe un stack en vez de decir
qué falta, no sobrevive a que alguien borre lo que comprueba.

| Prueba | Qué demuestra | Mensaje en rojo, sin el arreglo |
|---|---|---|
| | | |

## Costuras que pide a otros carriles

Lo que este carril ha implementado en mínimo en su propio fichero porque tocarlo
de verdad era de otro. Marcado en el código como
`// COSTURA → carril N: <qué y por qué>`.

| Marca en el código | Carril destino | Qué hay que unificar al integrar |
|---|---|---|
| | | |

## Qué queda por medir

Lo que no se ha podido comprobar y por qué: sin fichero real, sin documentación
oficial localizada, sin decisión de Juancho. Cada punto, con lo que desbloquea.

### Medido contra ficheros reales

Qué ficheros, cuántas filas antes y después de deduplicar, qué salió y qué
debería haber salido.

> **Las cifras reales no van aquí.** Este fichero está en el repositorio, y el
> repositorio es público. Aquí solo van números de fixture, dichos como tales.
> Lo medido sobre ficheros reales va al documento del proyecto
> `seller-hub/carriles-2026-09/<carril>.md`, o de vuelta al orquestador si no
> hay acceso al proyecto.
