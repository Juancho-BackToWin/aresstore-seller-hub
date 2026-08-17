const {Document,Packer,Paragraph,TextRun,HeadingLevel,Table,TableRow,TableCell,WidthType,
  ShadingType,AlignmentType,BorderStyle,LevelFormat,TableOfContents,PageBreak,convertInchesToTwip} = require('docx');
const fs=require('fs');

const OR='FF6A00', ORD='D94E00', INK='171210', GREY='6B5B52', LIGHT='FFF3E6', HAIR='E7DED8';
const W=9360;

const R=(t,o={})=>new TextRun({text:t,size:o.size??21,bold:o.b,italics:o.i,color:o.color,font:'Calibri'});
const P=(t,o={})=>new Paragraph({spacing:{after:o.after??120,line:276},alignment:o.al,border:o.border,
  children:(Array.isArray(t)?t:[t]).map(x=>typeof x==='string'?R(x,o):x)});
const H1=t=>new Paragraph({heading:HeadingLevel.HEADING_1,spacing:{before:340,after:150},
  children:[R(t,{size:30,b:true,color:INK})]});
const H2=t=>new Paragraph({heading:HeadingLevel.HEADING_2,spacing:{before:260,after:110},
  children:[R(t,{size:24,b:true,color:ORD})]});
const H3=t=>new Paragraph({heading:HeadingLevel.HEADING_3,spacing:{before:200,after:80},
  children:[R(t,{size:21,b:true,color:INK})]});
const LI=(t)=>new Paragraph({numbering:{reference:'bul',level:0},spacing:{after:70,line:276},
  children:(Array.isArray(t)?t:[t]).map(x=>typeof x==='string'?R(x):x)});
const NUM=(t,inst=0)=>new Paragraph({numbering:{reference:'num',level:0,instance:inst},spacing:{after:70,line:276},
  children:(Array.isArray(t)?t:[t]).map(x=>typeof x==='string'?R(x):x)});
const RULE=()=>new Paragraph({spacing:{before:60,after:180},
  border:{bottom:{style:BorderStyle.SINGLE,size:6,color:HAIR}},children:[R('')]});
const GAP=(h=120)=>new Paragraph({spacing:{after:h},children:[R('')]});
const BOX=(title,body,col)=>new Table({width:{size:W,type:WidthType.DXA},columnWidths:[W],
  borders:{top:{style:BorderStyle.SINGLE,size:2,color:col},bottom:{style:BorderStyle.SINGLE,size:2,color:col},
    left:{style:BorderStyle.SINGLE,size:18,color:col},right:{style:BorderStyle.SINGLE,size:2,color:col},
    insideHorizontal:{style:BorderStyle.NONE},insideVertical:{style:BorderStyle.NONE}},
  rows:[new TableRow({children:[new TableCell({width:{size:W,type:WidthType.DXA},
    shading:{type:ShadingType.CLEAR,fill:LIGHT},margins:{top:150,bottom:150,left:200,right:200},
    children:[P([R(title+'  ',{b:true,color:ORD}),R(body)],{after:0})]})]})]});

function TBL(head,rows,widths){
  const tot=widths.reduce((a,b)=>a+b,0);
  const cols=widths.map(w=>Math.round(w/tot*W));
  const cell=(t,i,hd)=>new TableCell({width:{size:cols[i],type:WidthType.DXA},
    shading:hd?{type:ShadingType.CLEAR,fill:INK}:undefined,
    margins:{top:80,bottom:80,left:110,right:110},
    children:[P(t,{size:18,b:hd,color:hd?'FFFFFF':undefined,after:0})]});
  return new Table({width:{size:W,type:WidthType.DXA},columnWidths:cols,
    borders:{top:{style:BorderStyle.SINGLE,size:2,color:HAIR},bottom:{style:BorderStyle.SINGLE,size:2,color:HAIR},
      left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE},
      insideHorizontal:{style:BorderStyle.SINGLE,size:2,color:HAIR},insideVertical:{style:BorderStyle.NONE}},
    rows:[new TableRow({tableHeader:true,children:head.map((h,i)=>cell(h,i,true))})]
      .concat(rows.map(r=>new TableRow({children:r.map((c,i)=>cell(c,i,false))})))});
}

const doc=new Document({
  creator:'Aresstore', title:'Aresstore Seller Hub - plan de construcción',
  numbering:{config:[
    {reference:'bul',levels:[{level:0,format:LevelFormat.BULLET,text:'▪',alignment:AlignmentType.LEFT,
      style:{paragraph:{indent:{left:convertInchesToTwip(0.3),hanging:convertInchesToTwip(0.18)}}}}]},
    {reference:'num',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,
      style:{paragraph:{indent:{left:convertInchesToTwip(0.34),hanging:convertInchesToTwip(0.24)}}}}]}]},
  styles:{default:{document:{run:{font:'Calibri',size:21,color:'2C2320'}}}},
  sections:[{properties:{page:{margin:{top:1440,bottom:1440,left:1440,right:1440}}},children:[

  GAP(1300),
  new Paragraph({spacing:{after:50},children:[R('ARESSTORE',{size:54,b:true,color:INK})]}),
  new Paragraph({spacing:{after:280},children:[R('SELLER HUB',{size:54,b:true,color:OR})]}),
  new Paragraph({spacing:{after:130},border:{top:{style:BorderStyle.SINGLE,size:14,color:OR}},children:[R('')]}),
  P([R('Plan de construcción de la herramienta de gestión',{size:26,color:INK})],{after:80}),
  P([R('Análisis de Sellerboard, Vendorati y Helium 10. Arquitectura, módulos y orden de ejecución',{size:20,color:GREY})],{after:480}),
  P([R('Versión del plan 1.0  ·  17 de agosto de 2026',{size:19,color:GREY})],{after:40}),
  P([R('Sobre la aplicación v0.5, en producción',{size:19,color:GREY})],{after:40}),
  P([R('aresstore-seller-hub.vercel.app',{size:19,b:true,color:ORD})]),
  new Paragraph({children:[new PageBreak()]}),

  H1('Contenido'),
  P([R('1 · ',{b:true,color:ORD}),R('La decisión central')],{after:90}),
  P([R('2 · ',{b:true,color:ORD}),R('Las tres referencias: Sellerboard, Vendorati y Helium 10')],{after:90}),
  P([R('3 · ',{b:true,color:ORD}),R('Construir, comprar o importar')],{after:90}),
  P([R('4 · ',{b:true,color:ORD}),R('Dónde estamos hoy')],{after:90}),
  P([R('5 · ',{b:true,color:ORD}),R('Los módulos, de M0 a M7')],{after:90}),
  P([R('6 · ',{b:true,color:ORD}),R('Orden de ejecución')],{after:90}),
  P([R('7 · ',{b:true,color:ORD}),R('Cómo trabajamos ahora')],{after:90}),
  P([R('8 · ',{b:true,color:ORD}),R('Lo que necesito de ti')],{after:90}),
  P([R('9 · ',{b:true,color:ORD}),R('Riesgos y límites honestos')],{after:90}),
  new Paragraph({children:[new PageBreak()]}),

  H1('1 · La decisión central'),
  P([R('He desmontado tres herramientas: '),R('Sellerboard',{b:true}),R(' módulo a módulo desde su base de conocimiento oficial, '),
     R('Vendorati',{b:true}),R(' desde su web y una reseña independiente, y he tenido en cuenta que ya pagas '),
     R('Helium 10',{b:true}),R('. De ahí sale una conclusión que ordena todo el proyecto y conviene entender antes de mirar un solo módulo.')]),
  P([R('El 75% del valor de Sellerboard no depende de la API de Amazon.',{b:true}),
     R(' Todo el motor de costes por lotes, el P&L completo y sus agregaciones, los gastos indirectos, la tesorería, el planificador de inventario, los pedidos de compra y el análisis completo de publicidad —incluido el ACOS de equilibrio, que es su mejor idea— salen de informes que descargas a mano. Lo que exige API es el autoresponder, las etiquetas, la automatización de pujas, y una sola cosa genuinamente valiosa e insustituible: las alertas de listado y Buy Box, que necesitan consultar a Amazon continuamente.')]),
  P([R('La consecuencia práctica es que podemos construir el núcleo de un Sellerboard sin escribir una línea de integración, y dedicar el esfuerzo a los siete huecos que ninguna de las tres cubre y que a un vendedor PanEU europeo le importan de verdad.')]),
  BOX('Lo urgente que no se ve:','hay un dato que se pierde para siempre cada día que pasa. El planificador de inventario de Sellerboard funciona porque guarda una foto del stock cada día. Nosotros no guardamos nada: cada importación reemplaza la anterior. Cada día sin capturar es historia irrecuperable. Por eso el módulo cero va primero, aunque no se vea en pantalla.',OR),
  RULE(),

  H1('2 · Las tres referencias'),
  H2('2.1 · Sellerboard, el referente financiero'),
  P([R('SaaS alemán, 2017, unos 20.000 vendedores, 4,7/5 en G2 con 57 reseñas, 19-39 $/mes para nuestro volumen. Es el modelo a igualar en rentabilidad e inventario.')]),
  H3('Lo que copiamos entero'),
  LI([R('Costes por lotes',{b:true}),R(' con tres métodos: por periodo, FIFO y promedio ponderado. Con precios de proveedor y flete moviéndose, un coste constante falsea el margen justo donde decides si escalar.')]),
  LI([R('Velocidad de ventas que excluye los días sin stock.',{b:true}),R(' Es el detalle técnico que más valor aporta de todo su producto: si vendiste 60 unidades en 30 días pero estuviste 12 roto, tu velocidad no es 2 al día, es 3,3. Decidir la reposición con 2 te garantiza volver a romper.')]),
  LI([R('Las 21 métricas de su panel',{b:true}),R(': ventas, unidades, devoluciones, promociones, coste publicitario, envíos, coste de devolución, tarifas de Amazon, coste de producto, beneficio bruto, gastos indirectos, beneficio neto, cobro estimado, ACOS real, porcentaje de devoluciones, devoluciones revendibles, margen, ROI, suscripciones, sesiones y porcentaje de sesión por unidad.')]),
  LI([R('ACOS y puja de equilibrio por palabra clave',{b:true}),R(' calculados con tu margen real. Es el análisis publicitario que ninguna herramienta de Amazon te da, y sus fórmulas están publicadas.')]),
  LI([R('Cuatro detectores de reembolso',{b:true}),R(': devoluciones fantasma a 105 días, diferencia entre reembolso y coste real a 60, inventario perdido o dañado a 60, y cambios de tarifa FBA a 18 meses.')]),
  H3('Los siete huecos que deja'),
  TBL(['Hueco','Por qué te afecta'],[
    ['Una sola tasa de cambio, la del último día del periodo','Compras en USD o CNY y vendes en EUR, PLN y SEK'],
    ['IVA reducido a tres casillas','Tienes PanEU con registros locales y OSS'],
    ['Cero funcionalidad de EPR','El PPWR ya está en vigor: es tu único riesgo de apagón'],
    ['Borra los datos a los 18 meses','Sin histórico no hay estacionalidad, y la joyería la tiene marcada'],
    ['Previsión de caja que solo extrapola el pasado','No modela depósitos de producción ni plazos de fabricación'],
    ['Reparto de flete no documentado','No puedes auditar tu propio coste unitario'],
    ['Lentitud, su queja número uno','Tú tienes cinco familias de producto, no treinta mil'],
  ],[38,62]),
  GAP(),

  H2('2.2 · Vendorati, y por qué cambia una decisión'),
  P([R('Herramienta enfocada a '),R('informes contables y fiscales',{b:true}),
     R(' para vendedores de Amazon. Cubre IVA de once países europeos, informes de One-Stop Shop en esquemas de Unión e Importación, impuestos por estado en Estados Unidos e informes de comisiones. Se conecta a la API de Amazon con tu autorización en Seller Central. Cuesta entre 25 y 199 euros al mes según volumen, con 15 días de prueba. La empresa detrás es Spacewire LLC, en Wyoming.')]),
  P([R('Es relevante porque cubre exactamente el hueco fiscal que yo había identificado como nuestro diferencial. Y obliga a una decisión honesta.')]),
  BOX('Mi recomendación:','no reconstruyamos la declaración de IVA ni los informes de OSS. Es el terreno donde equivocarse tiene consecuencias legales, no solo un margen mal calculado, y donde una herramienta conectada a la API con quince días de prueba cuesta menos que el tiempo de construirlo bien. Lo que sí construimos es el eslabón que Vendorati no tiene: que el coste de cumplimiento por país entre en el margen unitario de cada SKU, para decidir en qué mercados merece la pena estar.',ORD),
  GAP(160),
  P([R('Dos avisos, sin embargo. Tiene una sola reseña de usuario y es negativa, y la ficha independiente señala atención al cliente limitada. Antes de pagar un año, agota los quince días de prueba con tus datos reales y comprueba que los informes cuadran con lo que te pide tu gestoría.')]),
  GAP(),

  H2('2.3 · Helium 10, lo que ya pagas'),
  P([R('Su fuerza está en investigación y palabras clave: Black Box, Cerebro y Magnet son el estándar del sector. Sus módulos operativos existen pero son secundarios, y su cobertura europea es desigual: en Polonia solo funcionan cuatro de sus herramientas y su constructor de listados no existe en Europa salvo Reino Unido.')]),
  P([R('La conclusión es cómoda: '),R('no construimos investigación de producto ni de palabras clave.',{b:true}),
     R(' Ya la tienes pagada y hecha mejor de lo que la haríamos. Lo que sí haremos es '),R('importar sus exportaciones',{b:true}),
     R(': listas de palabras clave de Cerebro, volumenes de búsqueda y seguimiento de posiciones, para cruzarlos con tu margen real y con el ACOS de equilibrio que Helium 10 no conoce porque no sabe lo que te cuesta el producto.')]),
  RULE(),

  H1('3 · Construir, comprar o importar'),
  P([R('Este es el marco de decisión del proyecto. Construir todo sería un error de juicio: hay cosas ya resueltas por terceros y cosas que solo podemos hacer nosotros.')]),
  TBL(['Función','Decisión','Por qué'],[
    ['P&L real por SKU y mercado','CONSTRUIR','El núcleo. Sin API y con nuestro modelo de datos único'],
    ['Costes por lotes y FIFO','CONSTRUIR','Es lo que hace creíble el margen'],
    ['Inventario y reposición','CONSTRUIR','Depende de nuestro histórico de fotos diarias'],
    ['Tesorería con plazos y depósitos','CONSTRUIR','Sellerboard no lo modela. Nuestro mejor diferencial'],
    ['Compras y proveedores','CONSTRUIR','Cierra el círculo coste a margen'],
    ['ACOS de equilibrio','CONSTRUIR','Fórmulas publicadas, y exige conocer tu coste real'],
    ['Detectores de reembolso','CONSTRUIR','Dinero encontrado con esfuerzo bajo'],
    ['EPR y PPWR','CONSTRUIR','Nadie lo cubre y es riesgo de bloqueo'],
    ['Declaración de IVA y OSS','COMPRAR','Vendorati, 25 euros al mes. Equivocarse tiene coste legal'],
    ['Investigación de producto y keywords','IMPORTAR','Helium 10, ya pagado y mejor'],
    ['Alertas de listado y Buy Box','COMPRAR o esperar','Exige consultar a Amazon en continuo'],
    ['Autoresponder de reseñas','NO HACER','Amazon ya tiene su botón. Añade riesgo de suspensión'],
    ['Automatizar pujas de PPC','NO HACER','Alto riesgo, y el sector está lleno de sustos'],
  ],[34,20,46]),
  RULE(),

  H1('4 · Dónde estamos hoy'),
  P([R('La versión 0.5 está en producción, es instalable en móvil y PC, funciona sin conexión y ya cubre bastante terreno. Esta es la distancia real hasta Sellerboard.')]),
  TBL(['Área','Sellerboard','Nosotros hoy','Distancia'],[
    ['Métricas del P&L','21','11','Faltan 10'],
    ['Coste de producto','Lotes, FIFO, ponderado','Constante por SKU','CRÍTICA'],
    ['Histórico','18 meses','Ninguno','CRÍTICA'],
    ['Velocidad de ventas','Excluye días sin stock','Media simple','Alta'],
    ['Planificador','6 parámetros por producto','Plazo y colchón','Media'],
    ['Gastos indirectos','Amortización y asignación','Prorrateo mensual','Media'],
    ['Tesorería','Por ciclo de cobro','Con vencimientos de pedidos','Vamos delante'],
    ['Publicidad','ACOS de equilibrio','Desperdicio y TACOS','Alta'],
    ['Reembolsos','4 detectores','Ninguno','Alta'],
    ['IVA y EPR','Casi nada / nada','Registro por país','Vamos delante'],
    ['Idioma de los informes','Solo inglés','Español e inglés','Vamos delante'],
  ],[26,26,26,22]),
  RULE(),

  H1('5 · Los módulos'),
  H2('M0 · Empezar a guardar historia'),
  P([R('Primero, y hoy.',{b:true}),R(' No se ve en pantalla y es el que más valor genera a doce meses. El dato que no captures hoy no se reconstruye.')]),
  NUM('Cada importación se archiva con su fecha en lugar de reemplazar a la anterior.'),
  NUM('Foto diaria de stock por SKU y por país, precio de venta, tarifa FBA y comisión aplicada.'),
  NUM('Registro de días sin stock por SKU, que es lo que permite calcular la velocidad de ventas de verdad.'),
  NUM('Compactación del detalle a partir de los 90 días para que el navegador no se ahogue.'),
  NUM('Copia de seguridad recordada cada semana, con aviso si llevas siete días sin descargarla.'),
  P([R('Lo que necesito de ti: ',{b:true}),R('importar el informe de pedidos y el de inventario una vez por semana, sin fallar. Es el único hábito que sostiene todo lo demás.')]),

  H2('M1 · El motor financiero'),
  H3('M1.1 · Costes por lotes'),
  P([R('Cada SKU pasa de tener un coste único a tener lotes con fecha, cantidad y coste unitario, con tres métodos a elegir: por periodo, FIFO y promedio ponderado.')]),
  H3('M1.2 · Las diez métricas que faltan'),
  P([R('Promociones, coste de devoluciones, devoluciones revendibles, cobro estimado, ACOS real, porcentaje de devoluciones, sesiones, porcentaje de sesión por unidad, beneficio bruto separado del neto, y suscripciones activas.')]),
  H3('M1.3 · Gastos indirectos como es debido'),
  P([R('Amortización diaria en lugar de prorrateo mensual, y asignación opcional a un producto o a un mercado. Los 1.200 euros de gestoría alemana deben caer sobre Alemania, no repartirse entre todo.')]),
  H3('M1.4 · El IVA como línea propia del P&L'),
  P([R('Restado del beneficio bruto. En Europa no es opcional y Sellerboard lo trata de pasada.')]),
  H3('M1.5 · Vistas y exportación'),
  P([R('Sus cinco vistas: tarjetas comparando periodos, gráfica temporal, tabla con meses en columnas, por producto y por mercado. Y exportación con '),
     R('columnas fijas',{b:true}),R(', aprendiendo de su fallo documentado: sus exportaciones cambian de columnas según el periodo y rompen cualquier hoja de cálculo que las consuma.')]),
  P([R('Lo que necesito de ti: ',{b:true}),R('los lotes de compra reales de tus cinco familias con fecha, cantidad, coste de fábrica y flete, y la lista de gastos fijos mensuales. Es la tarde de trabajo que hace creíble todo lo demás.')]),

  H2('M2 · Inventario que decide'),
  LI('Velocidad de ventas excluyendo los días sin stock.'),
  LI('Seis parámetros por producto: fabricación, tránsito, recepción en Amazon, colchón en días, rango de stock objetivo y frecuencia de pedido.'),
  LI('Stock en tránsito y reservado contados aparte del disponible.'),
  LI('Cobertura por país con aviso de tarifa por bajo inventario donde aplica.'),
  LI('Estacionalidad, en cuanto M0 acumule meses suficientes.'),

  H2('M3 · Compras y caja'),
  LI('El pedido de compra crea el lote de coste al recibirse, cerrando el círculo sin intervención.'),
  LI('Entregas parciales: un pedido recibido en dos veces genera dos lotes.'),
  LI('Reparto de flete auditable por unidades, valor o peso, con la base a la vista.'),
  LI('Las cinco categorías de caja de Sellerboard más lo que él no tiene: depósitos de producción programados y plazos de fabricación reales.'),
  LI('Multidivisa con tasa diaria en lugar de una tasa única por periodo.'),

  H2('M4 · Publicidad con criterio'),
  LI([R('ACOS de equilibrio por palabra clave',{b:true}),R(' calculado con tu margen real de ese SKU: el techo de gasto que puedes sostener.')]),
  LI('Puja de equilibrio, derivada del ACOS de equilibrio y tu tasa de conversión.'),
  LI('ACOS real y TACOS, separando lo orgánico de lo pagado.'),
  LI('Términos de búsqueda con histórico propio, e importación de las listas de Cerebro de Helium 10.'),
  LI('Registro de cambios de puja con la regla de las 72 horas incorporada.'),
  P([R('Lo que no hacemos: ',{b:true}),R('automatizar las pujas. Exige la API de publicidad en escritura y el riesgo no compensa.')]),

  H2('M5 · Dinero que Amazon te debe'),
  NUM('Devoluciones fantasma: hay reembolso al cliente, no hay devolución registrada y Amazon no compensó. Ventana de 105 días.',1),
  NUM('Diferencia de reembolso: Amazon reembolso menos que tu coste real. 60 días. Depende de M1.',1),
  NUM('Inventario perdido o dañado no compensado. 60 días.',1),
  NUM('Cambios de tarifa FBA para el mismo ASIN. Requiere el histórico de M0.',1),
  P([R('Cada caso con su importe estimado y la plantilla del mensaje para abrir la reclamación. Aviso: son estimaciones, Amazon puede reembolsar todo, parte o nada.')]),

  H2('M6 · Dónde le pasamos por encima'),
  LI('Coste de cumplimiento por país entrando en el margen unitario de cada SKU.'),
  LI('EPR y PPWR con vencimientos y documentación adjunta.'),
  LI('Histórico sin límite, frente a los 18 meses de Sellerboard.'),
  LI('Multidivisa con tasas diarias.'),
  LI('Caja con plazos de fabricación y depósitos.'),
  LI('Reparto de flete auditable.'),

  H2('M7 · Lo que exige API'),
  P([R('Alertas de listado, hijacking, Buy Box y supresiones. Es lo único verdaderamente valioso que no se replica descargando informes. Mi recomendación es no construirlo: cuando lo necesites, o pagas Sellerboard solo por eso, o registras la aplicación privada de SP-API. Pero eso convierte esto en software que hay que mantener, y ese día llega cuando el hábito ya está asentado.')]),
  RULE(),

  H1('6 · Orden de ejecución'),
  TBL(['Paso','Módulo','Qué desbloquea'],[
    ['1','M0 · Histórico y fotos diarias','Todo lo demás. Cada día de retraso es historia perdida'],
    ['2','M1.1 · Costes por lotes','Que el margen deje de ser aproximado'],
    ['3','M1.2 a M1.4 · Métricas, gastos, IVA','El P&L completo'],
    ['4','M2 · Velocidad e inventario','Dejar de romper stock y de sobrecomprar'],
    ['5','M5.1 y M5.2 · Dos detectores','Dinero recuperado con esfuerzo bajo'],
    ['6','M3 · Compras y caja','Cerrar el círculo del coste'],
    ['7','M4 · ACOS de equilibrio','Decidir presupuesto de publicidad con criterio'],
    ['8','M6 · Diferenciales europeos','Lo que nadie te vende'],
    ['9','M1.5 · Vistas y exportación','Comodidad, al final'],
  ],[10,38,52]),
  P([R('Los pasos 1 y 2 son los que cambian los números que ves en pantalla. Del 3 en adelante podemos reordenar según lo que pida el uso real.')]),
  RULE(),

  H1('7 · Cómo trabajamos ahora'),
  P([R('El repositorio está montado y con su primer commit: 39 archivos, código fuente separado del compilado, script de compilación, y dos suites de prueba que corren en un navegador real contra informes que replican las cabeceras literales de Amazon.')]),
  NUM('Yo edito las piezas de src/ y ejecuto el script de compilación.',2),
  NUM('Publico el cambio en el repositorio.',2),
  NUM('Vercel lo despliega solo, en la misma dirección de siempre.',2),
  NUM('Tu app se actualiza sola: al detectar versión nueva se recarga, salvo que estés escribiendo o tengas un formulario abierto, en cuyo caso te avisa y espera.',2),
  NUM('La versión y la fecha de compilación se ven en el pie de la aplicación, para que sepas siempre qué estás mirando.',2),
  P([R('Eso elimina el ciclo de comprimir, arrastrar y reinstalar que hemos hecho hasta ahora, y te deja ver los avances en cuanto existen.')]),
  RULE(),

  H1('8 · Lo que necesito de ti'),
  NUM([R('Conectar el repositorio',{b:true}),R(', que es lo que me permite construir por detrás sin pedirte nada cada vez.')],3),
  NUM([R('Importar cada semana',{b:true}),R(' el informe de pedidos y el de inventario. Sin este hábito, nada de esto sirve.')],3),
  NUM([R('Los lotes de compra reales',{b:true}),R(' de tus cinco familias: fecha, cantidad, coste de fábrica y flete.')],3),
  NUM([R('La lista de gastos fijos',{b:true}),R(' mensuales con su importe.')],3),
  NUM([R('La comisión real',{b:true}),R(' que te cobra Amazon, del informe de vista previa de tarifas. Si vendes joyería y estamos calculando al 15%, ese número es el que más te distorsiona el margen ahora mismo.')],3),
  NUM([R('Los plazos reales',{b:true}),R(' de tus dos proveedores: fabricación, tránsito y condiciones de pago.')],3),
  RULE(),

  H1('9 · Riesgos y límites honestos'),
  H2('Lo que no desaparece con ningún módulo'),
  P([R('El beneficio proyectado seguirá siendo lineal.',{b:true}),
     R(' Multiplicar margen por unidades asume que el coste publicitario por unidad no sube al escalar, y sube. Modelarlo bien exige una curva de respuesta que solo se construye con tu propio histórico. Trátalo siempre como techo, no como previsión.')]),
  P([R('La base de la comisión sigue sin cerrarse.',{b:true}),
     R(' El contrato europeo la define incluyendo impuestos, y así está implementada, pero hay fuentes reputadas que sostienen lo contrario con el servicio de cálculo de IVA activado. Son más de tres puntos de margen. Merece una consulta escrita a Seller Support.')]),
  P([R('Los datos son tan frescos como tu última importación.',{b:true}),
     R(' Un panel que se actualiza solo cambia el comportamiento; uno que depende de que te acuerdes, no. Por eso el aviso de antigüedad en rojo.')]),
  H2('Lo que puede salir mal en el plan'),
  LI('Que construyamos módulos que no abres. Mitigación: tres semanas de uso real antes de la fase de nuevas apps.'),
  LI('Que Vendorati no cuadre con tu gestoría. Mitigación: agotar los quince días de prueba con datos reales antes de pagar.'),
  LI('Que el hábito semanal de importar no se sostenga. Es el riesgo mayor del proyecto, y no lo resuelve el software.'),
  GAP(240),
  new Paragraph({spacing:{before:200},border:{top:{style:BorderStyle.SINGLE,size:6,color:HAIR}},
    children:[R('Tarifas contrastadas contra el rate card europeo de Amazon vigente el 1 de julio de 2026. Datos de Sellerboard de su base de conocimiento oficial, y de Vendorati de su web y de una reseña independiente, consultados en agosto de 2026. Los precios y valoraciones de terceros cambian. Este documento no es asesoramiento fiscal, contable ni jurídico.',{size:16,color:GREY,i:true})]}),
  ]}]});

Packer.toBuffer(doc).then(b=>{fs.writeFileSync('/home/claude/Aresstore-Seller-Hub-Plan.docx',b);
  console.log('docx escrito:',b.length,'bytes');});
