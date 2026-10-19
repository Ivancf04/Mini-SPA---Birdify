# Informe de Práctica: Instalabilidad de PWA y Manejo de Evento de Instalación

**Materia:** Aplicaciones Web Progresivas — 9no Semestre  
**Proyecto:** Birdify — Catálogo de Aves y Bitácora de Avistamientos  
**Estudiante / Equipo:** Ivancf04  

---

## 1. Enlaces del Proyecto (Entregable 1)

* **Repositorio de GitHub:** [https://github.com/Ivancf04/Mini-SPA---Birdify](https://github.com/Ivancf04/Mini-SPA---Birdify)
* **URL Pública en Producción (HTTPS):** [https://ivancf04.github.io/Mini-SPA---Birdify/](https://ivancf04.github.io/Mini-SPA---Birdify/)

---

## 2. Auditoría Inicial de Instalabilidad (Requisito 1 & Entregable 2)

Antes de realizar modificaciones, se inspeccionó el estado del Web App Manifest y los criterios de instalabilidad evaluados por Chromium en **DevTools → Application → Manifest → Installability**.

### Tabla de Criterios de Instalación (Estado Inicial vs. Corrección)

| Criterio Evaluado | Estado Inicial | Descripción del Problema / Observación | Estado Final | Solución Implementada |
| :--- | :---: | :--- | :---: | :--- |
| **1. Protocolo Seguro (HTTPS / Localhost)** | **Cumple** | La aplicación corre en `http://localhost` en desarrollo y `https://` en GitHub Pages. | **Cumple** | Validado mediante `window.isSecureContext`. |
| **2. Manifest enlazado correctamente** | **Cumple** | Etiqueta `<link rel="manifest" href="manifest.json">` presente en el `<head>`. | **Cumple** | Se mantuvieron rutas relativas universales. |
| **3. Nombre y Nombre Corto** | **Cumple** | Cuenta con `name` ("Birdify - Avistamientos de aves") y `short_name` ("Birdify"). | **Cumple** | Valores preservados y consistentes. |
| **4. Ícono de 192×192 px (PNG)** | **Cumple** | `icons/icon-192.png` presente con dimensiones 192×192 px y `purpose: "any"`. | **Cumple** | Verificado en sistema de archivos y precaché. |
| **5. Ícono de 512×512 px (PNG)** | **Cumple** | `icons/icon-512.png` presente con dimensiones 512×512 px y `purpose: "any"`. | **Cumple** | Verificado en sistema de archivos y precaché. |
| **6. Ícono Maskable (Android Adaptive)** | **Cumple** | `icons/icon-maskable-512.png` presente con `purpose: "maskable"`. | **Cumple** | Se ajustó para recorte de seguridad en Android. |
| **7. Modo de visualización (`display`)** | **Cumple** | Configurado como `"display": "standalone"`. | **Cumple** | Se agregó `"display_override": ["standalone", "minimal-ui", "browser"]` para compatibilidad moderna. |
| **8. URL de inicio (`start_url`) y Alcance (`scope`)** | **Requiere Ajuste** | Estaban declarados como ruta absoluta estática `"/Mini-SPA---Birdify/"`. Al probar localmente en `http://localhost:5500/` o `http://127.0.0.1:8080/`, causaba un conflicto de alcance (*page out of scope / start_url mismatch*). | **Cumple** | Se modificaron a valores relativos `"./"`, que el navegador resuelve dinámicamente según la ubicación del manifest tanto en localhost (`/`) como en GitHub Pages (`/Mini-SPA---Birdify/`). |
| **9. Identificador único de aplicación (`id`)** | **Requiere Ajuste** | Estaba fijado a `"/Mini-SPA---Birdify/"`. | **Cumple** | Se unificó a `"./"` para garantizar identidad multiplataforma. |
| **10. Service Worker registrado con controlador `fetch`** | **Cumple** | Service Worker `sw.js` activo con estrategias de red/caché para navegación y shell. | **Cumple** | Se actualizó a versión `v4` con el módulo de instalación precacheado. |
| **11. Atributos de usabilidad (shortcuts, categories, orientation)** | **Falta** | No se contaban con categorías semánticas ni atajos de aplicación (*app shortcuts*). | **Cumple** | Se añadieron categorías (`education`, `nature`, `utilities`), `orientation: "any"` y shortcuts para "Avistamientos" y "Diagnóstico PWA". |

> ### [Espacio para Captura 1 — Auditoría Inicial]
> *(Insertar aquí la captura de DevTools → Application → Manifest → Installability antes de los cambios o en estado inicial)*
> ```text
> [CAPTURA_AUDITORIA_INICIAL_DEVTOOLS.PNG]
> ```

---

## 3. DevTools Manifest e Installability Sin Errores (Requisito 2 & Entregable 3)

Tras las optimizaciones en `manifest.json` e `index.html`:
* La pestaña **Application → Manifest** muestra todos los campos validados en verde sin advertencias.
* Se validan los tamaños de íconos (192x192, 512x512 y maskable).
* El botón **"Install"** / **"Add to home screen"** nativo de DevTools se encuentra habilitado y operativo.

> ### [Espacio para Captura 2 — DevTools Installability Sin Errores]
> *(Insertar aquí la captura de DevTools → Application → Manifest con todos los criterios aprobados sin errores)*
> ```text
> [CAPTURA_DEVTOOLS_MANIFEST_SIN_ERRORES.PNG]
> ```

---

## 4. Captura del Evento de Instalación (Requisito 3)

Se implementó el módulo autónomo `src/pwa/installPrompt.js` que gestiona de manera centralizada el ciclo de vida de la instalación:
1. **Escucha global:** Se suscribe a `beforeinstallprompt` y `appinstalled` a nivel de aplicación en `main.js` inmediatamente al arrancar la SPA, sin depender de vistas secundarias.
2. **Prevención por defecto:** Ejecuta `event.preventDefault()` para impedir que el navegador muestre un banner intrusivo no deseado en momentos inoportunos.
3. **Persistencia temporal del evento:** Almacena la referencia en la variable interna `deferredPrompt`.
4. **Función disparadora `promptInstall()`:**
   - Invoca `deferredPrompt.prompt()`.
   - Espera la resolución del usuario con `await deferredPrompt.userChoice`.
   - Libera el evento (`deferredPrompt = null`) una vez consumido, notificando a la interfaz para actualizar los botones de instalación.
   - Retorna la elección (`{ outcome: 'accepted' | 'dismissed', platform }`).

---

## 5. Botón de Instalación en el Shell (Requisito 4)

* Se integró el botón interactivo `#install-btn` directamente en el **App Shell** (dentro del `<header>` / `<nav>` de `index.html`), manteniéndose visible a lo largo de toda la navegación de la SPA.
* **Comportamiento reactivo:**
  - Permanece oculto por defecto con el atributo `hidden`.
  - Se activa y visualiza automáticamente solo cuando el evento `beforeinstallprompt` ha sido capturado y la aplicación **no** se está ejecutando ya en modo instalado.
  - Al completarse la instalación (evento `appinstalled`), se oculta inmediatamente.

---

## 6. Detección de Modo Instalado y Plan B (Requisito 5)

### 6.1 Detección del modo de ejecución
Se desarrolló la función `isRunningStandalone()` que comprueba:
* `window.matchMedia('(display-mode: standalone)').matches`
* `window.matchMedia('(display-mode: fullscreen)').matches`
* `window.matchMedia('(display-mode: minimal-ui)').matches`
* `window.navigator.standalone === true` (específico de iOS Safari PWA).

### 6.2 Plan B para iOS / iPadOS
Los dispositivos Apple (Safari en iOS/iPadOS) no implementan el evento `beforeinstallprompt`. Por diseño de la plataforma, la instalación debe ser guiada manualmente:
* Si se detecta que el cliente es iOS/iPadOS y la app se abre en el navegador:
  - Se ofrece un botón y modal accesible de instrucciones claras:
    1. Tocar el botón de **Compartir** (icono del cuadro con flecha hacia arriba `⎋`) en la barra de navegación de Safari.
    2. Desplazarse y pulsar la opción **"Agregar a pantalla de inicio"** (`➕`).
    3. Confirmar tocando **"Agregar"**. Birdify quedará anclada como aplicación independiente con soporte offline.

### 6.3 Plan B para otros navegadores sin evento (Firefox, Safari Mac, etc.)
* En navegadores de escritorio que no emiten `beforeinstallprompt`, la aplicación muestra un mensaje orientativo explicando cómo instalarla o anclarla desde el menú principal del navegador (`Menú ⋮ → Instalar Birdify` o atajo a marcadores), sin interrumpir la experiencia.
* **Principio de no bloqueo:** Bajo ninguna circunstancia se bloquean funcionalidades; la bitácora de avistamientos (IndexedDB), la consulta del catálogo, el buscador en tiempo real y el cambio de tema funcionan íntegramente en todas las plataformas.

---

## 7. Pruebas de Instalación (Entregables 4 y 5)

> ### [Espacio para Captura 3 — App Instalada en Escritorio (Entregable 4)]
> *(Insertar aquí la captura de la aplicación ejecutándose en su propia ventana de escritorio, con su icono, barra de título y sin la barra de direcciones del navegador)*
> ```text
> [CAPTURA_ESCRITORIO_VENTANA_PROPIA.PNG]
> ```

> ### [Espacio para Captura 4 — App Instalada en Móvil (Entregable 5)]
> *(Insertar aquí la captura de la aplicación en el dispositivo móvil: ya sea el icono en la pantalla de inicio o la app abierta en pantalla completa en modo standalone)*
> ```text
> [CAPTURA_MOVIL_PANTALLA_INICIO_O_STANDALONE.PNG]
> ```

---

## 8. Reflexión Técnica (Entregable 6)

### 8.1 ¿Qué criterios faltaban y cómo se resolvieron?
* **Rutas absolutas vs. relativas en el Manifest:** Inicialmente, `start_url`, `scope` e `id` estaban configurados como `"/Mini-SPA---Birdify/"`. Esto funcionaba en producción pero provocaba que en entornos de desarrollo local (`localhost:5500`, `127.0.0.1:8080`) DevTools indicara que la página no pertenecía al alcance del manifest. Se resolvió transformando `start_url: "./"`, `scope: "./"` e `id: "./"`, permitiendo que la resolución sea contextual según la URL base donde se hospeda el archivo.
* **Metadatos extendidos para experiencia nativa:** Se integraron categorías semánticas (`education`, `nature`, `utilities`), `display_override` y shortcuts para navegación rápida hacia "Avistamientos" y "Diagnóstico", enriqueciendo el menú contextual del icono de la app en Android y Windows.
* **Metadatos complementarios para iOS:** Se reforzaron etiquetas `<meta name="apple-mobile-web-app-status-bar-style" content="default">` y `<meta name="application-name" content="Birdify">`.

### 8.2 ¿Qué ocurrió en iOS u otros navegadores sin evento?
En iOS/iPadOS, WebKit no dispara el estándar `beforeinstallprompt` por razones de política de usuario de Apple. Si una PWA se limita a depender de dicho evento, en iOS el usuario nunca vería opción alguna para instalar la app.
Para solucionar esto, se implementó una estrategia adaptativa:
* Se detecta la plataforma móvil de Apple mediante el `User-Agent` y características de pantalla táctil (`maxTouchPoints`).
* Al abrir la app en navegador normal, se muestra un modal ilustrativo con las instrucciones exactas de Safari ("Compartir → Agregar a pantalla de inicio").
* En navegadores de escritorio sin soporte directo (como Firefox), se explica de manera clara cómo acceder a la opción desde el menú del navegador.
* Si el usuario ya la agregó a la pantalla de inicio y la abre desde allí, `navigator.standalone` es `true` o `display-mode: standalone` coincide, por lo que la interfaz no solicita instalación alguna.

### 8.3 Dificultades encontradas y soluciones implementadas
1. **Naturaleza de un solo uso de `beforeinstallprompt`:** Una vez que se invoca `prompt()` sobre el evento diferido, el objeto queda invalidado y no puede reutilizarse. Si el usuario cierra el diálogo o cancela, volver a llamar a `prompt()` causa una excepción. Se solucionó asegurando que el módulo `installPrompt.js` gestione el estado limpiando la variable (`deferredPrompt = null`) y ocultando o actualizando el botón hasta que el navegador decida emitir un nuevo evento.
2. **Sincronización con el ciclo de vida del Service Worker:** Al agregar un nuevo módulo (`installPrompt.js`), era indispensable que estuviera disponible sin conexión. Se incrementó la versión de caché a `v4` en `sw.js` y se añadió el nuevo script a la lista `PRECACHE_LOCAL`. De este modo, la instalación fuera de línea y la experiencia en modo avión se mantienen 100% confiables.
