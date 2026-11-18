# 📱 Plataforma QR

Plataforma web para **crear, personalizar, administrar y medir** códigos QR. Sustituye al
generador inicial de una sola URL por un sistema completo con editor visual, plantillas,
exportaciones profesionales, QR dinámicos con analítica y generación masiva.

Desarrollada con **Python + Flask**, con renderizado del QR en el navegador
(`qr-code-styling`) y respaldo en el servidor (`segno`) para descargas y usos sin JavaScript.

---

## ✨ Funcionalidades

### Tipos de contenido (17 visibles)

| Categoría | Tipos |
|---|---|
| Contenido y enlaces | URL, texto, correo, teléfono, SMS, WhatsApp, Wi-Fi |
| Información de contacto | vCard, contacto MECARD, tarjeta de presentación digital (página alojada) |
| Contenido multimedia | galería de imágenes (página alojada) |
| Marketing y negocios | múltiples enlaces, página de negocio, cupón, menú digital, evento, ubicación |

Un QR de **PDF, vídeo, audio, redes sociales, encuesta o reseña** es simplemente un enlace:
se crean con el tipo **URL**, pegando la dirección correspondiente. Esos siete tipos se
conservan en el catálogo marcados como heredados para que los códigos ya guardados sigan
funcionando y editándose.

Las páginas alojadas (múltiples enlaces, tarjeta, negocio, menú y galería) se publican en
`/l/<slug>` y siempre usan una URL corta dinámica.

### Editor visual de diseño

- Colores sólidos, **degradado lineal** y **radial** con selector HEX.
- Formas de módulos: cuadrado, redondeado, extra redondeado, puntos, clásico y clásico suave.
- **Esquinas independientes**: forma y color del marco exterior y del centro.
- **Logotipo**: PNG/JPG/WebP, tamaño, margen, fondo y ajuste automático de legibilidad.
  El QR se regenera dejando libres los módulos que ocupa el logo, así el hueco sigue su
  proporción y nunca corta ni tapa módulos. Las imágenes con transparencia se recortan a su
  contenido, así el logo ocupa el hueco disponible en vez de quedar diminuto dentro de un
  lienzo vacío.
- **Posición del logotipo**: sobre el QR (valor por defecto, con hueco de seguridad) o en
  una banda arriba/abajo, para que no tape módulos. Si el logo es oscuro y no tiene fondo
  detrás, se avisa en el panel (sin mover la posición elegida).
- **Tamaño máximo verificado**: el deslizador se limita al tamaño más grande que un lector
  real sigue decodificando; si necesitas un logotipo mayor, se coloca fuera del QR. Nunca
  se recorta el tamaño sin avisar.
- **Marcos**: borde, redondeado, tarjeta, banda superior o inferior, con texto y tipografía,
  y control de **grosor del borde**, **redondeo**, color del marco, color del borde y color del
  texto. Los ajustes del marco se activan al elegir un estilo (con «Sin marco» quedan
  deshabilitados).
- Fondo transparente, zona de silencio configurable y nivel de corrección de errores.

### Legibilidad garantizada

Cada cambio dispara una verificación automática que se muestra en el panel:

- Contraste real (WCAG) entre módulos y fondo, incluyendo los extremos del degradado.
- Zona de silencio mínima y recomendada.
- Tamaño seguro del logotipo y recomendación de nivel H.
- **Decodificación real con `jsQR`** del PNG generado, comparando el contenido leído.

### Exportación

PNG, SVG, JPG, WebP y PDF (A4), con resolución (256–4096 px), fondo transparente y
descarga individual o por lotes en ZIP.

### Administración

Búsqueda, filtros por tipo/modo/carpeta, carpetas, edición, duplicado, descarga y borrado.
Cada código guarda su configuración completa de diseño para volver a editarlo.

### QR dinámicos y analítica

- URL corta `/r/<slug>`: cambia el destino sin reimprimir, pausa, expiración y estado.
- Registro de escaneos con dispositivo, sistema operativo, navegador y país aproximado.
- Panel con series por día/semana/mes, mejor día, promedios y desgloses.
- **Privacidad**: no se guarda la IP ni el agente de usuario completo.

### Generación masiva

Importación de CSV, validación fila a fila con errores por registro, vista previa,
progreso y descarga de todos los códigos en un ZIP.

---

## 🚀 Puesta en marcha

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
# → http://127.0.0.1:5000
```

Variables de entorno opcionales:

| Variable | Uso |
|---|---|
| `PORT` | Puerto del servidor (por defecto `5000`). |
| `PUBLIC_BASE_URL` | URL pública para los enlaces cortos (por defecto se usa el host de la petición). |
| `DATABASE_PATH` | Ruta del archivo SQLite (por defecto `instance/plataforma_qr.db`). |
| `FLASK_DEBUG` | `0` desactiva el modo depuración. |

El servidor se ejecuta con `use_reloader=False` para mantener un único proceso (evita
estado duplicado en memoria, según `aplicacion.md` §4.1).

---

## 🧱 Arquitectura modular por funcionalidades

```
app.py                    Punto de entrada (modo desarrollo)
version.py                ÚNICA fuente de verdad de la versión
modules/
  core/                   Configuración, SQLite, utilidades, fábrica de la app
  catalog/                Catálogo de tipos QR: formularios, validación y contenido
  design/                 Esquema del diseño, normalización y plantillas
  codes/                  CRUD de códigos, carpetas y render de respaldo (segno)
  analytics/              Registro de escaneos y agregados
  dynamic/                Redirección /r/<slug> y páginas alojadas /l/<slug>
  bulk/                   Validación y creación por lotes
  pages/                  Rutas HTML y generador clásico
  system/                 /version, /diagnostico, /salud
data/
  qr_types.json           Especificación de los tipos QR (17 visibles + 7 heredados)
  design_presets.json     Biblioteca de diseños
templates/                Vistas Jinja (interfaz, landing, estados)
static/js/core/           API, diseño, contenido, render, gráficas, tarjetas
static/js/pages/          Controladores por página
static/css/app.css        Sistema de diseño (claro/oscuro, responsive)
static/vendor/            qr-code-styling, jsQR, jsPDF, JSZip (locales, sin CDN)
```

**Separación de responsabilidades**: la *generación del contenido* (`catalog` +
`payload.js`) es independiente del *diseño visual* (`design` + `renderer.js`), de modo
que añadir un tipo nuevo solo requiere editar `data/qr_types.json`.

---

## 🔌 API principal

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/tipos` | Catálogo de tipos con campos y plantillas de contenido. |
| `POST` | `/api/contenido` | Construye y valida el contenido de un tipo. |
| `GET` | `/api/plantillas` | Plantillas de diseño normalizadas. |
| `GET/POST` | `/api/codigos` | Listado con filtros / creación. |
| `GET/PUT/DELETE` | `/api/codigos/<id>` | Detalle, edición y borrado. |
| `POST` | `/api/codigos/<id>/duplicar` | Duplica un código con nuevo slug. |
| `GET` | `/api/codigos/<id>.<fmt>` | Render de respaldo (`png`, `svg`, `jpg`, `webp`, `pdf`). |
| `GET/POST/DELETE` | `/api/carpetas` | Gestión de carpetas. |
| `GET` | `/api/estadisticas?codigo=&dias=` | Métricas agregadas. |
| `GET` | `/api/resumen` | Datos del panel. |
| `POST` | `/api/lote/crear` | Valida/crea un código por fila. |
| `GET` | `/r/<slug>` | Redirección dinámica (registra el escaneo). |
| `GET` | `/l/<slug>` | Página alojada. |
| `GET` | `/version`, `/diagnostico`, `/salud` | Diagnóstico del servicio. |

---

## 🔐 Notas de seguridad y privacidad

- Los enlaces de destino se validan (`http`/`https`) antes de redirigir, evitando
  redirecciones abiertas a esquemas peligrosos.
- Las imágenes de logotipo se procesan y reducen en el navegador antes de guardarse.
- Solo se registran datos agregables de escaneo; no se almacenan IPs.
- Los secretos y la base de datos quedan fuera del repositorio (`.gitignore`).

---

## 🗂️ Versionado

La versión vive únicamente en [`version.py`](version.py) y se expone en `/version`.
El historial de cambios está en [CHANGELOG.md](CHANGELOG.md). Las reglas de publicación
(compilar solo bajo petición, no reutilizar números, etc.) siguen `aplicacion.md`.

---

## 🛠️ Tecnologías

- **Flask** — servidor y API.
- **segno** — QR en el servidor (SVG/PNG/PDF de respaldo).
- **Pillow** — composición del logotipo y conversión de formatos.
- **qrcode** — generador clásico conservado en `/clasico`.
- **qr-code-styling**, **jsQR**, **jsPDF** y **JSZip** — empaquetados localmente en
  `static/vendor` (la aplicación funciona sin CDN).
