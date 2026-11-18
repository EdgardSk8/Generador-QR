# Historial de versiones

## [2.0.2] - 2026-11-17T20:57:00-07:00
- **Marco editable**: nuevos controles de **grosor del borde** (`frame.width`, 0,2–3 %) y **redondeo** de esquinas (`frame.radius`, 0–20 %), junto a estilo, colores del marco/borde/texto, tipografía, tamaño del texto y espaciado. Los ajustes del marco se habilitan al elegir un estilo y se deshabilitan con «Sin marco», con un aviso que lo explica; el grosor se aplica en la vista previa y en las exportaciones PNG/JPG/WebP/SVG/PDF.
- **Panel siempre sincronizado**: cada cambio reescribe todos los controles desde el diseño (valores, etiquetas, deshabilitados y avisos). Se corrigieron los campos de color que no actualizaban su pareja HEX, la barra superior de margen/fondo transparente tras aplicar una plantilla, y los desfases al recortar tamaño/margen del logotipo. Los controles que solo emiten `change` también se aplican.
- **QR excavado alrededor del logotipo**: el código se regenera dejando sin dibujar los módulos que ocupa el logo (más su margen), de modo que ningún módulo queda cortado ni tapado por una caja blanca. El hueco sigue la proporción de la imagen, se ajusta a la rejilla y se recalcula al cambiar el tamaño, el margen, el contenido o el nivel de corrección; aplica a la vista previa, las miniaturas y las exportaciones PNG/JPG/WebP/SVG/PDF.
- El render del servidor recorta igual el hueco del logotipo a módulos completos, así las descargas guardadas se ven como la vista previa.
- La posición del logotipo vuelve a ser «Sobre el QR» al subir una imagen: se eliminó el cambio automático a la banda inferior, que movía el logo sin pedirlo y dejaba el QR más pequeño. Ahora solo se avisa en el panel cuando un logotipo oscuro se vería como una mancha (sin fondo detrás y sobre los módulos).
- Las imágenes **sin fondo** se recortan a su contenido al subirlas: un logo exportado dentro de un lienzo grande ya no se dibuja diminuto y descentrado, ocupa el hueco completo que marca el control de tamaño. Los avisos de logotipo oscuro y de logotipo-QR se calculan sobre la imagen ya recortada.

## [2.0.1] - 2026-11-16T12:20:00-07:00
- **Logotipo fuera del QR**: nuevo selector de *Posición* (Sobre el QR / Arriba / Debajo) que coloca la imagen en una banda propia para que no tape ningún módulo. La zona del QR queda idéntica píxel a píxel, comprobado con la decodificación real.
- Detección automática de logotipos oscuros (mediana de luminancia del contenido): se colocan debajo del código al subirlos, porque sobre los módulos negros se veían como una mancha.
- Con el logotipo fuera del QR se desactivan el margen de separación y el fondo detrás del logotipo (no hay hueco que rellenar) y el control de tamaño pasa a escalar el logo dentro de su banda.
- La banda del logotipo respeta marcos y textos, funciona con exportaciones PNG, JPG, WebP, PDF y SVG, y mantiene el fondo transparente cuando se pide.
- El render del servidor (descargas `/api/codigos/<id>.<formato>`) replica la misma composición en PNG y SVG, y se corrigió la escala del SVG generado por el servidor, que dibujaba el logotipo a una décima parte de su tamaño.
- **Tamaño máximo medido con lectura real**: el deslizador del logotipo se limita al tamaño más grande que un lector decodifica para el contenido actual (búsqueda binaria con `jsQR`), con la nota «Máximo con lectura segura: NN %» y la sugerencia de mover el logo fuera del QR. Ya no hay recortes inesperados ni avisos repetidos.
- Aviso cuando la imagen del logotipo **ya es un código QR**: al escanear podría leerse ese otro contenido, así que se recomienda colocarla arriba o debajo.
- El panel de diseño conserva abiertas las secciones que el usuario tenía desplegadas al actualizarse.
- La verificación de lectura exige que el contenido decodificado coincida con el del código, no solo que exista un QR legible.

## [2.0.0] - 2026-11-16T09:40:00-07:00
- Plataforma completa de generación, personalización y administración de códigos QR.
- 24 tipos de contenido organizados en 4 categorías, con formulario propio por tipo.
- Editor visual de diseño: colores sólidos y degradados, formas de módulos, esquinas independientes, logotipo, fondo transparente y marcos con texto.
- Vista previa en tiempo real con verificación automática de legibilidad (contraste, zona de silencio, tamaño del logotipo y decodificación real del QR).
- Exportación a PNG, SVG, JPG, WebP y PDF con resolución, margen y fondo transparente configurables.
- Biblioteca de 10 plantillas de diseño aplicables con un clic.
- Administración de códigos: búsqueda, filtros, carpetas, duplicado y edición posterior.
- QR dinámicos con URL corta controlada, pausa, expiración y cambio de destino.
- Páginas alojadas para múltiples enlaces, tarjeta digital, página de negocio, menú digital y galería.
- Panel de estadísticas de escaneos por día, dispositivo, sistema operativo, navegador y país.
- Generación masiva desde CSV con descarga en ZIP y reporte de errores por registro.
- Interfaz compacta y minimalista: barra lateral estrecha, métricas reducidas, scroll fino en azul y pie con datos de TellezSoftware.
- Editor con modos «Sencillo» (QR negro con logo opcional) y «Completo», paleta de colores sólidos en vivo, tarjeta de contenido plegable y selector de tema en la barra lateral.
- Selector simplificado a 17 tipos: PDF, vídeo, audio, redes sociales, encuestas y reseñas se crean con «URL»; sus tipos previos quedan como heredados para no romper códigos existentes.
- Selector de tipos en tarjetas compactas de dos columnas (icono a la izquierda, texto a la derecha), contenido del QR opcional, control de margen 0–10 módulos visible en la vista previa y color de fondo editable.
- Ayudas contextuales como icono flotante, formulario sin carpeta ni fecha de expiración y controles de descarga perfectamente alineados.
- La tarjeta de contenido arranca plegada (48 px) y se despliega solo al pulsar su cabecera.
- Barra superior de exportación en una sola fila (formato, resolución, margen, transparencia, descargar, guardar y restablecer) que queda fija al desplazarse; los avisos ya no se duplican al repetir la misma acción.
- Logotipo revisado a fondo: proporción original respetada, hueco rectangular ajustado a la forma real del logo (sin esquinas redondeadas ni recorte circular), límites automáticos de tamaño/margen, formatos PNG/JPG/WebP validados, cargas optimizadas y render del servidor alineado en PNG y SVG.
- Con logotipo, el diseño se corrige solo: tamaño máximo 28 %, margen limitado para que el hueco no supere el 26 % del ancho y corrección H automática; si aun así no se lee, se reduce el logo hasta que decodifique.
- Generador clásico conservado en `/clasico`.

## [1.0.0]
- Generador de QR a partir de una URL o texto, con descarga en PNG.
