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
5. No hace falta anotar la IP: la Windows la anuncia en la red y la Mac la encuentra sola, aunque cambie.

## 2. Mac (cliente)

1. Copia la carpeta `controlmause` a la Mac.
2. Crea `config.json` con la **misma clave**. Deja `"serverHost": "auto"` para que la Mac encuentre sola a la Windows.
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

## Inicio automático

Con esto ControlMause arranca solo al iniciar sesión, en segundo plano y sin ventanas. Si se cierra por un error, vuelve a arrancar solo.

| Comando | Qué hace |
| --- | --- |
| `npm run autostart` | Activa el inicio automático y lo arranca ya. |
| `npm run autostart:status` | Dice si está activado y corriendo, y muestra las últimas líneas del registro. |
| `npm run autostart:off` | Lo desactiva y lo detiene. |

- **Windows:** crea un acceso directo en la carpeta *Inicio* del usuario. Se ve en *Configuración → Aplicaciones → Inicio* como `ControlMause`. El registro queda en `%LOCALAPPDATA%\ControlMause\controlmause.log`.
- **Mac:** crea un agente de inicio (`~/Library/LaunchAgents/com.controlmause.client.plist`) y copia el programa a `~/Library/Application Support/ControlMause`. El registro queda en `~/Library/Logs/ControlMause/controlmause.log`.
  - En segundo plano el permiso de **Accesibilidad** es para `node`, no para Terminal. El comando muestra la ruta que hay que agregar.
  - Como usa una copia, cada vez que cambies `config.json` o hagas `git pull`, vuelve a correr `npm run autostart`.
- Con el inicio automático activo ya no hace falta `npm run server` ni `npm run client`. Si los corres igual, el servidor avisa que el puerto ya está en uso.

## Opciones de `config.json`

| Opción | Qué hace |
| --- | --- |
| `password` | Clave compartida (obligatoria, la misma en ambas). |
| `serverHost` | Solo en la Mac. `"auto"` (recomendado) busca la Windows en la red. Si pones una IP fija, se usa hasta que llegue el aviso de la Windows. |
| `discoveryPort` | Puerto UDP del aviso en la red, por defecto el siguiente al `port` (24811). |
| `port` | Puerto TCP, por defecto 24810. |
| `macSide` | `"left"` o `"right"`: lado donde está la Mac. |
| `mouseSpeed` | Velocidad del cursor en la Mac (1 = igual). Prueba 0.6 si va muy rápido. |
| `scrollSpeed` / `invertScroll` | Velocidad y sentido de la rueda. |
| `keepMacAwake` | `true` (por defecto): la Mac no entra en reposo sola mientras está conectada a la Windows (la pantalla sí se apaga y se enciende al entrar con el ratón). `false` para que duerma normal. |
| `modifiers` | A qué tecla de Mac va cada modificador: `ctrl`, `win` y `alt` → `command`, `control` u `option`. |

## Cómo funciona

- `helpers/win-hook.ps1`: PowerShell con un poco de C# (lo compila Windows). Captura el teclado y el ratón con *hooks* de bajo nivel y los bloquea mientras controlas la Mac.
- `helpers/mac-inject.js`: JavaScript for Automation (viene con macOS). Crea eventos reales de ratón y teclado.
- `src/server.js` y `src/client.js`: Node.js. Se conectan por TCP y deciden cuándo cambiar de pantalla.
- `npm test`: pruebas automáticas que no necesitan Windows ni Mac.

## Red y seguridad

- **La Mac encuentra sola a la Windows.** Cada 2 segundos la Windows avisa en la red local "aquí estoy" (UDP, puerto 24811). El aviso lleva una marca sacada de tu clave, así que la Mac ignora otras Windows con ControlMause.
- **Todo va cifrado** (TLS con tu clave, sin certificados): nadie en la red puede ver lo que escribes ni hacerse pasar por tu Windows. Si las claves no coinciden, no se conecta y lo avisa en las dos.
- Usa una clave larga: es lo único que protege la conexión.
- Si la Mac tiene el firewall activado, la primera vez preguntará si `node` puede recibir conexiones: pulsa **Permitir**.
- En redes de invitados o de hoteles, que suelen aislar a los equipos entre sí, la Mac no verá a la Windows.
- **Actualiza las dos a la vez.** Esta versión no se entiende con la anterior, porque la anterior no cifraba.

## Limitaciones conocidas

- Mientras controlas la Mac, el cursor de Windows queda quieto en el centro del monitor principal. Ocultarlo es parte del paso 2.
- Las teclas `Impr Pant` y `Pausa` no se envían.

## Próximos pasos

2. Mapa de pantallas para arrastrar, retardo o doble toque en el borde, y ocultar el cursor de Windows.
3. Portapapeles compartido (texto e imágenes), atajos para saltar de pantalla y bloquear el cursor en una pantalla.
4. App con Electron: icono en la barra, inicio automático, y reconexión.
