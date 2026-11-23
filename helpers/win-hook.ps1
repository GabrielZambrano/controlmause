# ControlMause - ayudante de Windows.
# Captura el teclado y el raton con hooks de bajo nivel. Cuando el cursor toca el
# borde hacia la Mac, bloquea la entrada local y la envia a Node por stdout.
#
# Salida (una linea por evento):
#   READY <izq> <arriba> <ancho> <alto>   escritorio virtual
#   ENTER <fraccion>                       el cursor cruzo el borde (posicion a lo largo del borde, 0..1)
#   M <dx> <dy>                            movimiento relativo mientras se controla la Mac
#   B <L|R|M> <D|U>                        botones
#   W <delta>  /  H <delta>                rueda vertical / horizontal (120 = un paso)
#   K <vk> <scan> <D|U> <extendida 0|1>    teclas
#   RELEASED                               se volvio a Windows por atajo o por seguridad
#   REHOOKED                               Windows habia quitado los hooks y se volvieron a poner
#
# Entrada (stdin):
#   EDGE left|right|top|bottom|none   en que borde esta la Mac (none = sin cliente conectado)
#   RELEASE <fraccion>     volver a Windows y colocar el cursor junto al borde
#   PING                   Node sigue vivo (si no llega en 3 s se suelta el control)
#   QUIT

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;

public static class CmHook {
    delegate IntPtr LowLevelProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)] struct POINT { public int x; public int y; }
    [StructLayout(LayoutKind.Sequential)] struct MSLLHOOKSTRUCT { public POINT pt; public uint mouseData; public uint flags; public uint time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct KBDLLHOOKSTRUCT { public uint vkCode; public uint scanCode; public uint flags; public uint time; public IntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct RECT { public int left; public int top; public int right; public int bottom; }
    [StructLayout(LayoutKind.Sequential)] struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr hwnd; public uint message; public IntPtr wParam; public IntPtr lParam; public uint time; public POINT pt; }

    [DllImport("user32.dll", SetLastError = true)] static extern IntPtr SetWindowsHookEx(int idHook, LowLevelProc fn, IntPtr hMod, uint threadId);
    [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool UnhookWindowsHookEx(IntPtr hhk);
    [DllImport("user32.dll")] static extern int GetMessage(out MSG msg, IntPtr hwnd, uint min, uint max);
    [DllImport("user32.dll")] static extern bool PostThreadMessage(uint threadId, uint msg, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out POINT p);
    [DllImport("user32.dll")] static extern int GetSystemMetrics(int index);
    [DllImport("user32.dll")] static extern IntPtr MonitorFromPoint(POINT pt, uint flags);
    [DllImport("user32.dll")] static extern bool GetMonitorInfo(IntPtr hMon, ref MONITORINFO info);
    [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr value);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
    [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string name);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();

    const int WH_KEYBOARD_LL = 13, WH_MOUSE_LL = 14;
    const int WM_MOUSEMOVE = 0x200, WM_LBUTTONDOWN = 0x201, WM_LBUTTONUP = 0x202,
              WM_RBUTTONDOWN = 0x204, WM_RBUTTONUP = 0x205, WM_MBUTTONDOWN = 0x207,
              WM_MBUTTONUP = 0x208, WM_MOUSEWHEEL = 0x20A, WM_MOUSEHWHEEL = 0x20E;
    const int WM_KEYDOWN = 0x100, WM_SYSKEYDOWN = 0x104;
    const uint WM_QUIT = 0x12;

    static LowLevelProc mouseProc = MouseHook, keyProc = KeyHook;   // evita que el GC los borre
    static IntPtr mouseHook, keyHook;
    static uint loopThread;
    static readonly BlockingCollection<string> outQueue = new BlockingCollection<string>();

    static volatile bool capturing = false;
    static volatile string edge = "none";
    static int buttonsDown = 0;
    static bool ctrlDown = false, altDown = false;
    static POINT center;
    static RECT enterMonitor;
    static long lastPing = 0;
    static int mouseEvents = 0;        // eventos que llegaron al hook desde la ultima revision
    static volatile bool warped = false;  // movimos el cursor nosotros (no genera eventos)
    const uint WM_REHOOK = 0x8001;     // WM_APP + 1

    static void Warp(int x, int y) { warped = true; SetCursorPos(x, y); }

    static void Emit(string s) { outQueue.Add(s); }

    static int VsLeft()   { return GetSystemMetrics(76); }
    static int VsTop()    { return GetSystemMetrics(77); }
    static int VsWidth()  { return GetSystemMetrics(78); }
    static int VsHeight() { return GetSystemMetrics(79); }

    static RECT MonitorAt(POINT p) {
        var info = new MONITORINFO();
        info.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        GetMonitorInfo(MonitorFromPoint(p, 2 /* MONITOR_DEFAULTTONEAREST */), ref info);
        return info.rcMonitor;
    }

    static bool HasMonitor(int x, int y) {
        POINT q; q.x = x; q.y = y;
        return MonitorFromPoint(q, 0 /* MONITOR_DEFAULTTONULL */) != IntPtr.Zero;
    }

    // Distancia a las esquinas en la que no se cambia de pantalla por arriba o por abajo,
    // para poder usar el boton de cerrar o el menu Inicio sin pasar a la Mac.
    const int CORNER = 60;

    /** Toca el cursor el borde por el que se pasa a la Mac? */
    static bool HitsEdge(POINT p, string e) {
        if (e == "left") return p.x <= VsLeft();
        if (e == "right") return p.x >= VsLeft() + VsWidth() - 1;
        if (e != "top" && e != "bottom") return false;
        RECT mon = MonitorAt(p);
        if (p.x < mon.left + CORNER || p.x > mon.right - 1 - CORNER) return false;
        if (e == "top") return p.y <= mon.top && !HasMonitor(p.x, mon.top - 1);
        return p.y >= mon.bottom - 1 && !HasMonitor(p.x, mon.bottom);
    }

    static bool Vertical(string e) { return e == "top" || e == "bottom"; }

    static void StartCapture(POINT p) {
        enterMonitor = MonitorAt(p);
        double frac;
        if (Vertical(edge)) {
            double w = Math.Max(1, enterMonitor.right - enterMonitor.left);
            frac = (p.x - enterMonitor.left) / w;
        } else {
            double h = Math.Max(1, enterMonitor.bottom - enterMonitor.top);
            frac = (p.y - enterMonitor.top) / h;
        }
        frac = Math.Min(1.0, Math.Max(0.0, frac));
        // Centro de la pantalla principal: desde ahi medimos cuanto se mueve el raton.
        center.x = GetSystemMetrics(0) / 2;
        center.y = GetSystemMetrics(1) / 2;
        capturing = true;
        Warp(center.x, center.y);
        Emit("ENTER " + frac.ToString(System.Globalization.CultureInfo.InvariantCulture));
    }

    static void Release(double frac) {
        if (!capturing) return;
        capturing = false;
        RECT m = enterMonitor;
        if (m.right <= m.left) { m.left = 0; m.top = 0; m.right = GetSystemMetrics(0); m.bottom = GetSystemMetrics(1); }
        int x, y;
        if (Vertical(edge)) {
            x = m.left + (int)Math.Round(frac * (m.right - m.left - 1));
            x = Math.Max(m.left + CORNER + 1, Math.Min(m.right - CORNER - 2, x));
            y = edge == "bottom" ? m.bottom - 3 : m.top + 2;
        } else {
            y = m.top + (int)Math.Round(frac * (m.bottom - m.top - 1));
            x = edge == "right" ? m.right - 3 : m.left + 2;
        }
        Warp(x, y);
    }

    static IntPtr MouseHook(int nCode, IntPtr wParam, IntPtr lParam) {
        Interlocked.Increment(ref mouseEvents);
        if (nCode >= 0) {
            var m = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            int msg = wParam.ToInt32();
            bool injected = (m.flags & 1) != 0;
            if (!capturing) {
                if (msg == WM_LBUTTONDOWN || msg == WM_RBUTTONDOWN || msg == WM_MBUTTONDOWN) buttonsDown++;
                if (msg == WM_LBUTTONUP || msg == WM_RBUTTONUP || msg == WM_MBUTTONUP) buttonsDown = Math.Max(0, buttonsDown - 1);
                // No cambiamos de pantalla si se esta arrastrando algo.
                if (msg == WM_MOUSEMOVE && !injected && buttonsDown == 0) {
                    if (HitsEdge(m.pt, edge)) { StartCapture(m.pt); return (IntPtr)1; }
                }
            } else if (!injected) {
                switch (msg) {
                    case WM_MOUSEMOVE: {
                        int dx = m.pt.x - center.x, dy = m.pt.y - center.y;
                        if (dx != 0 || dy != 0) Emit("M " + dx + " " + dy);
                        break;
                    }
                    case WM_LBUTTONDOWN: Emit("B L D"); break;
                    case WM_LBUTTONUP:   Emit("B L U"); break;
                    case WM_RBUTTONDOWN: Emit("B R D"); break;
                    case WM_RBUTTONUP:   Emit("B R U"); break;
                    case WM_MBUTTONDOWN: Emit("B M D"); break;
                    case WM_MBUTTONUP:   Emit("B M U"); break;
                    case WM_MOUSEWHEEL:  Emit("W " + (short)(m.mouseData >> 16)); break;
                    case WM_MOUSEHWHEEL: Emit("H " + (short)(m.mouseData >> 16)); break;
                }
                return (IntPtr)1;   // bloqueado: el cursor de Windows no se mueve
            }
        }
        return CallNextHookEx(mouseHook, nCode, wParam, lParam);
    }

    static IntPtr KeyHook(int nCode, IntPtr wParam, IntPtr lParam) {
        if (nCode >= 0) {
            var k = (KBDLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(KBDLLHOOKSTRUCT));
            int msg = wParam.ToInt32();
            bool down = msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN;
            bool injected = (k.flags & 0x10) != 0;
            uint vk = k.vkCode;
            if (vk == 0x11 || vk == 0xA2 || vk == 0xA3) ctrlDown = down;
            if (vk == 0x12 || vk == 0xA4 || vk == 0xA5) altDown = down;
            if (capturing && !injected) {
                // Ctrl+Alt+F12: volver a Windows pase lo que pase.
                if (down && vk == 0x7B && ctrlDown && altDown) {
                    Release(0.5);
                    Emit("RELEASED");
                    return (IntPtr)1;
                }
                bool ext = (k.flags & 1) != 0;
                Emit("K " + vk + " " + k.scanCode + " " + (down ? "D" : "U") + " " + (ext ? 1 : 0));
                return (IntPtr)1;
            }
        }
        return CallNextHookEx(keyHook, nCode, wParam, lParam);
    }

    static void ReadCommands() {
        var stdin = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
        string line;
        while ((line = stdin.ReadLine()) != null) {
            string[] p = line.Trim().Split(' ');
            if (p[0] == "EDGE" && p.Length > 1) {
                edge = p[1];
                if (edge == "none" && capturing) { Release(0.5); Emit("RELEASED"); }
            } else if (p[0] == "RELEASE") {
                double f = 0.5;
                if (p.Length > 1) double.TryParse(p[1], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out f);
                Release(f);
            } else if (p[0] == "PING") {
                Interlocked.Exchange(ref lastPing, DateTime.UtcNow.Ticks);
            } else if (p[0] == "QUIT") {
                break;
            }
        }
        // Node se cerro: devolver el control a Windows y salir.
        if (capturing) Release(0.5);
        PostThreadMessage(loopThread, WM_QUIT, IntPtr.Zero, IntPtr.Zero);
    }

    static void Watchdog() {
        while (true) {
            Thread.Sleep(500);
            long last = Interlocked.Read(ref lastPing);
            if (capturing && last > 0 && (DateTime.UtcNow.Ticks - last) > TimeSpan.FromSeconds(3).Ticks) {
                Release(0.5);
                Emit("RELEASED");
            }
        }
    }

    static void WriteOutput() {
        var stdout = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        stdout.AutoFlush = true;
        foreach (var s in outQueue.GetConsumingEnumerable()) stdout.WriteLine(s);
    }

    static bool InstallHooks() {
        IntPtr mod = GetModuleHandle(null);
        mouseHook = SetWindowsHookEx(WH_MOUSE_LL, mouseProc, mod, 0);
        keyHook = SetWindowsHookEx(WH_KEYBOARD_LL, keyProc, mod, 0);
        return mouseHook != IntPtr.Zero && keyHook != IntPtr.Zero;
    }

    // Windows quita en silencio los hooks de bajo nivel si alguna vez tardan en responder.
    // Lo detectamos asi: el cursor se movio pero al hook no le llego ningun evento.
    // Entonces pedimos al hilo principal que los vuelva a instalar.
    static void HookGuard() {
        POINT last;
        GetCursorPos(out last);
        while (true) {
            Thread.Sleep(1000);
            POINT now;
            if (!GetCursorPos(out now)) continue;
            int events = Interlocked.Exchange(ref mouseEvents, 0);
            bool moved = now.x != last.x || now.y != last.y;
            bool ourMove = warped;
            warped = false;
            last = now;
            if (moved && events == 0 && !ourMove) PostThreadMessage(loopThread, WM_REHOOK, IntPtr.Zero, IntPtr.Zero);
        }
    }

    static void Rehook() {
        UnhookWindowsHookEx(mouseHook);
        UnhookWindowsHookEx(keyHook);
        if (capturing) { Release(0.5); Emit("RELEASED"); }
        if (InstallHooks()) Emit("REHOOKED");
        else Emit("ERROR no se pudieron volver a instalar los hooks (" + Marshal.GetLastWin32Error() + ")");
    }

    public static void Run() {
        try { SetProcessDpiAwarenessContext((IntPtr)(-4)); } catch { }
        try { SetThreadDpiAwarenessContext((IntPtr)(-4)); } catch { }
        loopThread = GetCurrentThreadId();
        Interlocked.Exchange(ref lastPing, DateTime.UtcNow.Ticks);

        // Prioridad algo mayor para que Windows no considere lento al hook y lo quite.
        try { System.Diagnostics.Process.GetCurrentProcess().PriorityClass = System.Diagnostics.ProcessPriorityClass.AboveNormal; } catch { }
        new Thread(WriteOutput) { IsBackground = true }.Start();
        if (!InstallHooks()) {
            Emit("ERROR no se pudieron instalar los hooks (" + Marshal.GetLastWin32Error() + ")");
            Thread.Sleep(300);
            return;
        }
        Emit("READY " + VsLeft() + " " + VsTop() + " " + VsWidth() + " " + VsHeight());
        new Thread(ReadCommands) { IsBackground = true }.Start();
        new Thread(Watchdog) { IsBackground = true }.Start();
        new Thread(HookGuard) { IsBackground = true }.Start();

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) > 0) {
            if (msg.message == WM_REHOOK) Rehook();
        }

        capturing = false;
        UnhookWindowsHookEx(mouseHook);
        UnhookWindowsHookEx(keyHook);
        Thread.Sleep(100);
    }
}
'@

[CmHook]::Run()
