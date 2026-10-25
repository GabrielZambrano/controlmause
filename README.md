# ControlMause

Un solo teclado y ratón para tu Windows y tu Mac, como ShareMouse o Deskflow, pero tuyo y sin límites.

**Estado: paso 1 de 4.** La Windows (con el teclado y el ratón) controla la Mac. Pasas a la Mac moviendo el cursor por el borde izquierdo del monitor y vuelves moviéndolo por el borde derecho de la Mac.

Tu configuración:

```
[ Mac ]  [ Monitor (principal) ]  [ Laptop ]
  cliente          servidor: la Windows
```

## Requisitos

- Node.js 18 o más reciente en **las dos** computadoras.
- Las dos conectadas a la misma red (WiFi o cable).
- No hace falta `npm install`: no usa dependencias.

## 1. Windows (servidor)

1. Copia la carpeta `controlmause` a la Windows.
2. Copia `config.example.json` a `config.json` y cambia `"password"` por una clave tuya.
3. Abre una terminal en la carpeta y ejecuta:
   ```
   npm run server
   ```
4. Si Windows pregunta por el firewall, permite el acceso en **redes privadas**.
5. Anota la IP que aparece (por ejemplo, `192.168.1.50`).

## 2. Mac (cliente)

1. Copia la carpeta `controlmause` a la Mac.
2. Crea `config.json` con la **misma clave** y pon en `"serverHost"` la IP de la Windows.
3. Abre Terminal en la carpeta y ejecuta:
   ```
   npm run client
   ```
4. La primera vez, macOS pedirá permiso de **Accesibilidad**. Ve a *Ajustes del Sistema → Privacidad y seguridad → Accesibilidad* y activa **Terminal** (o la app de terminal que uses). Después vuelve a ejecutar `npm run client`.

## Cómo se usa

- Mueve el ratón por el borde **izquierdo** del monitor principal y el cursor aparece en la Mac. El teclado escribe en la Mac.
- Para volver, mueve el ratón por el borde **derecho** de la Mac.
- **Emergencia:** `Ctrl+Alt+F12` te devuelve a Windows siempre. Si la Mac se desconecta o el programa se cierra, Windows recupera el control solo.
- Mientras controlas la Mac, `Ctrl` funciona como `Cmd` (Ctrl+C copia, Ctrl+V pega). Esto se cambia en `"modifiers"`.
- El teclado funciona por posición física de las teclas. Pon la misma distribución (por ejemplo, Español) en la Mac.

## Opciones de `config.json`

| Opción | Qué hace |
| --- | --- |
| `password` | Clave compartida (obligatoria, la misma en ambas). |
| `serverHost` | IP de la Windows (solo en la Mac). |
| `port` | Puerto TCP, por defecto 24810. |
| `macSide` | `"left"` o `"right"`: lado donde está la Mac. |
| `mouseSpeed` | Velocidad del cursor en la Mac (1 = igual). Prueba 0.6 si va muy rápido. |
| `scrollSpeed` / `invertScroll` | Velocidad y sentido de la rueda. |
| `modifiers` | A qué tecla de Mac va cada modificador: `ctrl`, `win` y `alt` → `command`, `control` u `option`. |

## Cómo funciona

- `helpers/win-hook.ps1`: PowerShell con un poco de C# (lo compila Windows). Captura el teclado y el ratón con *hooks* de bajo nivel y los bloquea mientras controlas la Mac.
- `helpers/mac-inject.js`: JavaScript for Automation (viene con macOS). Crea eventos reales de ratón y teclado.
- `src/server.js` y `src/client.js`: Node.js. Se conectan por TCP y deciden cuándo cambiar de pantalla.
- `npm test`: pruebas automáticas que no necesitan Windows ni Mac.

## Limitaciones conocidas (paso 1)

- Mientras controlas la Mac, el cursor de Windows queda quieto en el centro del monitor principal. Ocultarlo es parte del paso 2.
- La conexión aún no va cifrada (solo la protege la clave). El cifrado es parte del paso 4.
- Las teclas `Impr Pant` y `Pausa` no se envían.

## Próximos pasos

2. Mapa de pantallas para arrastrar, retardo o doble toque en el borde, ocultar el cursor de Windows y búsqueda automática de la IP.
3. Portapapeles compartido (texto e imágenes), atajos para saltar de pantalla y bloquear el cursor en una pantalla.
4. App con Electron: icono en la barra, inicio automático, reconexión y cifrado.
