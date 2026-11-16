# aplicacion.md — Guía de versionado para una IA

> **Propósito:** instrucciones operativas para que un agente de IA (opencode) gestione
> las **versiones de una aplicación Python** (local primero, ejecutable solo cuando se
> pida). Es genérica y reutilizable en cualquier proyecto: no describe ninguna
> aplicación concreta.
>
> **Cómo usarla:** este documento se lee antes de tocar versiones. Los nombres usados
> como ejemplo (`MiApp`, `app.py`, `USUARIO/REPO`, `x.y.z`) se sustituyen por los del
> proyecto donde se aplique.

---

## 0. Reglas del agente

| # | Regla |
|---|---|
| **R1** | **Localhost por defecto.** Todo el trabajo y la validación se hacen ejecutando la app en local. El agente no genera ejecutables, instaladores, tags ni releases por iniciativa propia. |
| **R2** | **El ejecutable solo bajo petición explícita.** Solo frases como "compila", "haz el .exe", "saca el instalador", "publica" o "sube la versión" autorizan el build. Cualquier otra petición es desarrollo. |
| **R3** | **Una sola fuente de verdad.** El número de versión vive en **un único archivo** (`version.py`). Ningún otro archivo lo repite a mano: todos lo leen. |
| **R4** | **La versión nunca baja.** Una versión publicada es inmutable. Para "volver atrás" se publica una versión nueva. |
| **R5** | **No se compila dos veces con el mismo número.** Subir versión y actualizar el changelog es paso previo obligatorio al build. |
| **R6** | **No se declara terminado sin verificar.** Un cambio de versión termina cuando la app ejecutándose reporta la versión nueva (y, si se pidió, el ejecutable arranca). |
| **R7** | **Nada de secretos ni artefactos en el repo.** No se versionan credenciales, `.venv/`, `build/`, `dist/`, `temp/` ni `__pycache__/`. |

### 0.1 Árbol de decisión

```
¿El usuario pidió compilar / publicar / ejecutable / instalador?
├── NO  → MODO DESARROLLO  (§4)
│         ejecutar en local · validar en el navegador · no tocar VERSION
└── SÍ  → MODO RELEASE     (§5 → §6 → §7)
          subir VERSION · changelog · compilar · verificar · publicar
```

Ante la duda, **preguntar**. Publicar un número equivocado es caro: los clientes ya
pueden haberlo detectado y no se puede retirar sin romper sus actualizaciones.

---

## 1. Esquema de versiones

Formato **SemVer**: `MAYOR.MENOR.PARCHE` (`1.2.3`). Sin ceros a la izquierda.

| Tipo de cambio | Qué sube | Ejemplo |
|---|---|---|
| Corrección de error, sin funcionalidad nueva | `PARCHE` | `1.1.4 → 1.1.5` |
| Funcionalidad nueva compatible | `MENOR` y `PARCHE` a 0 | `1.1.5 → 1.2.0` |
| Cambio incompatible (estructura, migración, API) | `MAYOR` | `1.2.0 → 2.0.0` |

Convenciones que se mantienen en todo el proyecto:

| Dónde | Formato | Ejemplo |
|---|---|---|
| Variable interna (`version.py`) | sin prefijo | `1.2.0` |
| Tag y título de la Release | con `v` | `v1.2.0` |
| Nombre del archivo distribuido | libre, pero con la versión | `MiApp v1.2.0.exe` |
| Build de desarrollo | reservado | `0.0.0` |

- **`0.0.0` está reservado** para desarrollo: la app detecta ese valor y **no busca
  actualizaciones**, para no molestar mientras se trabaja.
- Las versiones se comparan **como tuplas de enteros** `(1, 2, 0)`, nunca como texto
  (`"1.10.0" < "1.9.0"` es cierto en texto y falso en semántica).
- Opcional: sufijos de preestreno (`1.3.0-rc.1`) **no** deben llegar nunca a una
  Release estable; si se usan, el updater los ignora.

---

## 2. Archivos del sistema de versionado

| Archivo | Función | ¿Se edita a mano? |
|---|---|---|
| `version.py` | **Fuente de verdad**: `VERSION = "1.2.0"` | **Sí** (único lugar con el número) |
| `version.json` | Respaldo para el updater cuando la API de la Release falla | Sí, al publicar |
| `app.spec` | Receta de PyInstaller. **Lee** `version.py` para nombrar el binario | No |
| `updater.spec` | Receta del actualizador (si existe auto-actualización) | No |
| `installer.iss` | Script de Inno Setup; recibe la versión por `/DMyVersion=` | No |
| `build-installer.ps1` | Lee `version.py` y compila el instalador | No |
| `CHANGELOG.md` (o el changelog de la UI) | Historial legible por el usuario | **Sí**, una entrada por versión |
| CI (`build-*.yml`) | Compila por plataforma al publicar un tag | No |

### 2.1 `version.py`

```python
# Versión publicada. La leen la app, el .spec y build-installer.ps1.
VERSION = "1.2.0"
```

Debe ser una **línea simple y parseable**: el `.spec` y el script del instalador
extraen el número con una expresión regular, no importando el módulo (importarlo
ejecutaría el proyecto dentro de PyInstaller).

```python
re.search(r'VERSION\s*=\s*["\']([^"\']+)', contenido).group(1)
```

Nunca metas imports, lógica ni cálculos en `version.py`.

### 2.2 `version.json`

```json
{
    "version": "1.2.0",
    "url": "https://github.com/USUARIO/REPO/releases/download/v1.2.0/MiApp.v1.2.0.exe",
    "mensaje": "Nueva versión disponible."
}
```

- La `url` apunta al artefacto **de la plataforma correcta**.
- Su único papel es el respaldo: si la consulta a la API de Releases falla (sin red,
  límite de peticiones), la app usa este archivo.
- Si la URL no corresponde a la plataforma del usuario, la app debe **descartarla** y
  quedarse sin actualización, en lugar de descargar un binario inútil.

---

## 3. Estructura mínima recomendada

```
proyecto/
├─ app.py                  # punto de entrada en desarrollo
├─ launcher.py             # punto de entrada del ejecutable (opcional)
├─ version.py              # ← ÚNICA fuente de verdad
├─ version.json            # respaldo del updater
├─ updater.py              # reemplaza el binario y relanza (opcional)
├─ updater.spec            # receta del updater
├─ app.spec                # receta de la app (nombra el binario leyendo version.py)
├─ installer.iss           # Inno Setup (opcional)
├─ build-installer.ps1     # lee version.py y llama a ISCC
├─ CHANGELOG.md            # historial de versiones
├─ .github/workflows/      # CI por plataforma (opcional)
└─ .gitignore              # .venv/, build/, dist/, temp/, __pycache__/
```

**Un solo `app.spec`.** No se crea un `.spec` nuevo por versión (`app v1.1.0.spec`,
`app v1.1.1.spec`…): obliga a editar el comando de build en cada release y deja
archivos muertos. El nombre del binario sale del `.spec`, **no** del nombre del archivo.

---

## 4. Modo desarrollo (el habitual)

```powershell
# 1) Entorno (una vez por máquina)
python -m venv .venv

# 2) Dependencias
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install <dependencias del proyecto>

# 3) Ejecutar en local
.\.venv\Scripts\python.exe app.py
# → http://127.0.0.1:PUERTO
```

En Linux/macOS: `./.venv/bin/python app.py`.

**Checklist de cierre en modo desarrollo:**

- [ ] La app responde en `http://127.0.0.1:PUERTO/version` con el número de `version.py`.
- [ ] El endpoint de diagnóstico/salud responde sin excepción, si existe.
- [ ] La función modificada se probó **en la app real**, no solo "compila".

En este modo el agente **no** ejecuta `pyinstaller`, ni el script del instalador, ni
`git tag`.

### 4.1 Una sola instancia

Si el servidor local comprueba el puerto antes de arrancar, **conserva** esa
comprobación: dos procesos a la vez dividen estado en memoria (historial, progreso,
sesiones) y la interfaz parece "perder" datos. Configura el servidor con
`use_reloader=False` (o equivalente) para tener un único proceso estable.

---

## 5. Subir la versión (obligatorio antes de compilar)

1. **Elegir el número** según la tabla de §1.
2. Editar `version.py` → `VERSION = "x.y.z"`.
3. Añadir la entrada al changelog con **esa** versión y fecha ISO 8601 con zona:

```markdown
## [1.2.0] - 2026-11-16T10:00:00-07:00
- Una frase corta por cambio, sin tecnicismos internos.
```

4. Actualizar `version.json` **solo si se va a publicar** (§7).
5. Comprobar que no quedó ningún número antiguo escrito a mano:

```powershell
Select-String -Path *.py,*.spec,*.iss,*.ps1,*.md -Pattern '1\.1\.4' -List
```

6. Verificar que la app reporta la versión nueva:

```powershell
.\.venv\Scripts\python.exe app.py
curl.exe -s http://127.0.0.1:PUERTO/version
```

Si el número no cambia en ejecución, borra `__pycache__/` (bytecode de `version.py`
almacenado en caché).

---

## 6. Compilar el ejecutable (solo bajo petición)

### 6.1 Orden de compilación

Si la app empaqueta un actualizador, **el actualizador va primero**. El `.spec` de la
app incluye el binario del updater en sus `datas`; compilar la app antes mete un
updater viejo o inexistente.

```powershell
# 0) Dependencias al día + PyInstaller
.\.venv\Scripts\python.exe -m pip install -U <dependencias> pyinstaller

# 1) Actualizador PRIMERO (si existe)
.\.venv\Scripts\python.exe -m PyInstaller updater.spec --noconfirm

# 2) App DESPUÉS
.\.venv\Scripts\python.exe -m PyInstaller app.spec --noconfirm
```

Resultado:

```
dist\updater.exe
dist\MiApp v1.2.0.exe      ← nombre generado desde version.py
```

### 6.2 El `.spec` lee la versión, nunca la contiene

```python
import os, re, sys

_base = globals().get("SPECPATH") or os.getcwd()

try:
    with open(os.path.join(_base, "version.py"), encoding="utf-8") as f:
        _version = re.search(r'VERSION\s*=\s*["\']([^"\']+)', f.read()).group(1)
except Exception:
    _version = "dev"

_es_windows = sys.platform.startswith("win")
_script = "launcher.py" if _es_windows else "app.py"
_updater = "dist/updater.exe" if _es_windows else "dist/updater"

a = Analysis(
    [_script],
    datas=[(<datos del proyecto>), (_updater, ".")],
    hiddenimports=[],
)

exe = EXE(
    a.pure, a.scripts, a.binaries, a.datas, [],
    name=f"MiApp v{_version}",     # ← la versión entra aquí
    console=False,
    upx=True,
)
```

Prohibido: `name="MiApp v1.2.0"` escrito a mano.

### 6.3 Verificar el binario antes de entregarlo

```powershell
$v = (Select-String -Path version.py -Pattern 'VERSION\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
Test-Path "dist\MiApp v$v.exe"     # True
```

- [ ] Abre con doble clic y no muestra consola (si se compiló con `console=False`).
- [ ] Reporta la versión nueva.
- [ ] El diagnóstico indica modo empaquetado (`sys.frozen == True`).
- [ ] Una acción real del programa funciona (no solo que la ventana aparezca).
- [ ] Si lleva updater embebido, el binario del updater está dentro de `_MEIPASS`.

### 6.4 Instalador (solo si además se pidió)

Requiere Inno Setup 6 (`winget install JRSoftware.InnoSetup`) y el paquete portable ya
armado.

```powershell
.\build-installer.ps1
# → dist\Instalador MiApp v1.2.0.exe
```

El script lee `version.py` y lo pasa como `/DMyVersion=<versión>`; el `.iss` no
contiene el número.

---

## 7. Publicar una Release

1. `VERSION` subida y changelog actualizado (§5).
2. Binarios compilados y verificados (§6).
3. Commit y push:

```powershell
git add version.py version.json CHANGELOG.md
git commit -m "chore(release): v1.2.0"
git push origin main
```

4. Crear la **Release** con tag `v1.2.0` **y el mismo número en el título**. Si el
   tag y el título difieren, el updater toma el mayor para no perder actualizaciones;
   aun así deben coincidir, para no confundir a los usuarios.
5. Adjuntar los artefactos como **assets**, con la plataforma identificable en el
   nombre: `MiApp.v1.2.0.exe`, `MiApp.v1.2.0.linux-x86_64`, `MiApp.v1.2.0.dmg`…
6. Confirmar que la Release aparece como **Latest**: es la que consulta la app.
7. Opcional (respaldo): actualizar `version.json` en la rama principal con la URL del
   asset.
8. El CI por plataforma se dispara con el tag y adjunta su binario a esa misma Release.

No se compila otra plataforma desde Windows: PyInstaller no compila de forma cruzada.
Cada plataforma se compila en su runner o en su máquina.

---

## 8. Auto-actualización (si el proyecto la tiene)

Ciclo estándar y comprobaciones que no deben eliminarse:

```
app arranca
  └─ GET /actualizacion → API de Releases
        ├─ OK → { version, url, mensaje, tamaño } del asset de mi plataforma
        ├─ KO → respaldo version.json (validando que la URL sea de mi plataforma)
        └─ KO → { version: VERSION, url: "" }   (sin molestar al usuario)

usuario acepta
  └─ POST /actualizar { url, version, tamaño }
        ├─ rechazar si la app no está empaquetada (modo desarrollo)
        ├─ rechazar si el host de descarga no es el repositorio oficial
        ├─ rechazar si falta el updater empaquetado
        └─ hilo de descarga
              ├─ escribir a un archivo .part
              ├─ validar tamaño esperado
              ├─ validar firma del binario (MZ en Windows, ELF en Linux)
              ├─ renombrar .part → definitivo
              ├─ copiar el updater FUERA de _MEIPASS (esa carpeta se borra al cerrar)
              ├─ lanzar updater(nuevo_binario, binario_actual)
              └─ cerrar la app

updater
  ├─ esperar a que el binario actual se libere (reintentos, con límite)
  ├─ reemplazarlo
  └─ relanzar la app
```

Invariantes:

- Comparar versiones como tuplas, nunca como texto.
- Descargar **solo** del host oficial (mitiga URL manipulada).
- Verificar formato/firma del archivo antes de ejecutarlo.
- Copiar el updater fuera de `_MEIPASS` antes de lanzarlo.
- Con `VERSION == "0.0.0"` no se busca actualización.
- En modo desarrollo el endpoint de actualizar devuelve error, no intenta nada.

---

## 9. Verificación rápida (antes de decir "listo")

```powershell
curl.exe -s http://127.0.0.1:PUERTO/version
curl.exe -s http://127.0.0.1:PUERTO/diagnostico    # si existe
```

| Comprobación | Esperado |
|---|---|
| `/version` en local | El número de `version.py` |
| `/version` en el `.exe` | El mismo número |
| `/diagnostico` en el `.exe` | Indica modo empaquetado |
| `dist\` | Contiene el binario con la versión nueva, y nada con la vieja |
| Tag de Git | `vX.Y.Z`, idéntico al título de la Release |

---

## 10. Errores frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| El updater no detecta la versión nueva | Tag ≠ título de la Release | Mismo número en ambos |
| "La aplicación no incluye updater" | App compilada antes que el updater | Compilar `updater.spec` primero |
| El binario conserva la versión anterior en el nombre | Número escrito a mano en el `.spec` | Leer `version.py` con regex |
| `/version` devuelve el número viejo en local | Caché de bytecode | Borrar `__pycache__/` |
| Estado duplicado o "perdido" en la UI | Dos procesos del servidor | Comprobación de puerto + sin reloader |
| Instalador falla por archivo ausente | Falta el paquete portable/intermedio | Armar `dist\Portable\` antes |
| Se descarga un binario de otra plataforma | `version.json` con URL ajena | Corregir la URL; validar plataforma |
| Release publicada con número equivocado | Se compiló sin subir `VERSION` | Publicar un número nuevo; **no** reemplazar el asset |
| Credenciales en el repo | Falta en `.gitignore` | Añadir y **rotar** las credenciales |

---

## 11. Chuleta de comandos

```powershell
# --- Desarrollo (por defecto) ---
.\.venv\Scripts\python.exe -m pip install -U pip
.\.venv\Scripts\python.exe -m pip install <dependencias>
.\.venv\Scripts\python.exe app.py                 # http://127.0.0.1:PUERTO

# --- Subir versión ---
# editar version.py       → VERSION = "x.y.z"
# editar CHANGELOG.md     → entrada con versión + fecha + cambios

# --- Compilar (solo bajo petición) ---
.\.venv\Scripts\python.exe -m PyInstaller updater.spec --noconfirm
.\.venv\Scripts\python.exe -m PyInstaller app.spec --noconfirm

# --- Instalador (opcional) ---
.\build-installer.ps1

# --- Publicar ---
git tag v1.2.0
git push origin v1.2.0          # dispara el CI si está configurado
# crear la Release y adjuntar los binarios

# --- Comprobar ---
curl.exe -s http://127.0.0.1:PUERTO/version
```

---

## 12. Plantilla de instrucciones para el agente

```
Eres el agente de mantenimiento de este proyecto Python (empaquetado con PyInstaller).

MODO POR DEFECTO
- Trabajas en local (http://127.0.0.1:PUERTO). Validas ahí, no en el binario.
- NO generas ejecutables, instaladores, tags ni Releases salvo que se pida
  explícitamente ("compila", "haz el .exe", "publica", "saca versión").

VERSIONES
- Fuente de verdad única: version.py (VERSION = "x.y.z"). Nadie más repite el número.
- El .spec, build-installer.ps1 e installer.iss lo LEEN con regex.
- 0.0.0 = desarrollo (no busca actualizaciones).
- La versión solo sube. Nunca reutilizas ni reescribes una versión publicada.

AL PUBLICAR (en este orden)
1. Subir VERSION según el tipo de cambio (parche / menor / mayor).
2. Añadir la entrada al changelog (versión + fecha ISO + cambios).
3. Compilar el updater PRIMERO y la app DESPUÉS.
4. Verificar: el binario abre, reporta la versión nueva y funciona una acción real.
5. Actualizar version.json y publicar la Release con tag vX.Y.Z + assets.

VERIFICACIÓN MÍNIMA ANTES DE DECIR "LISTO"
- /version en local y en el binario devuelven el número esperado.
- El diagnóstico indica modo empaquetado (solo si compilaste).
- La funcionalidad modificada se probó de verdad.
```
