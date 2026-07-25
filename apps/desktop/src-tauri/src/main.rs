fn main() {
    // WebKitGTK's hardware-accelerated DMA-BUF renderer aborts with "Could not
    // create surfaceless EGL display: EGL_BAD_ALLOC" on several NVIDIA +
    // Wayland setups, and even once that abort is avoided the WebProcess can
    // still fail to composite anything, leaving a blank window. Both
    // env vars fail over to the software path unless the user (or
    // packaging) already made an explicit choice. `std::env::set_var` is
    // unsafe and this workspace forbids unsafe code, so the vars are applied
    // by re-executing this same binary with them set, which is a safe API.
    #[cfg(target_os = "linux")]
    {
        const RENDER_FAILOVER_VARS: [(&str, &str); 4] = [
            ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
            ("WEBKIT_DISABLE_COMPOSITING_MODE", "1"),
            // The GPU driver on some hosts fails hardware queries outright
            // (e.g. amdgpu ACCEL_WORKING EACCES), which those two WebKit
            // flags alone don't route around. Forcing Mesa's llvmpipe
            // software rasterizer bypasses the kernel driver entirely.
            ("LIBGL_ALWAYS_SOFTWARE", "1"),
            // WebKitGTK's WebProcess/GPU Process run inside a bubblewrap
            // sandbox that does not inherit the parent's environment, so
            // none of the flags above ever reached it and it kept trying
            // (and aborting on) hardware EGL regardless. Disabling the
            // sandbox is what actually lets those subprocesses see them.
            ("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1"),
        ];
        // VS Code ships as a snap on most Linux distros and exports GTK/GDK/GIO
        // module-discovery vars pointing at its own bundled (core20) GTK stack
        // so its own window renders. A terminal opened inside that snap's
        // integrated terminal inherits those vars, so any other GTK app
        // launched from it — this one included — has WebKitGTK load GTK/GDK
        // modules built against the snap's bundled glibc instead of the
        // system's. Those modules pull in their own libpthread transitively,
        // which collides with the one already loaded in-process and aborts
        // with a "symbol lookup error ... GLIBC_PRIVATE" before any window
        // appears. Stripping the vars makes GTK fall back to the system's own
        // module paths.
        const SNAP_GTK_POLLUTION_VARS: [&str; 7] = [
            "GTK_PATH",
            "GTK_EXE_PREFIX",
            "GDK_PIXBUF_MODULE_FILE",
            "GDK_PIXBUF_MODULEDIR",
            "GIO_MODULE_DIR",
            "GSETTINGS_SCHEMA_DIR",
            "GTK_IM_MODULE_FILE",
        ];
        let is_snap_polluted = |key: &str| {
            std::env::var_os(key).is_some_and(|value| {
                value.to_string_lossy().contains("/snap/")
            })
        };
        let missing_failover = RENDER_FAILOVER_VARS
            .iter()
            .any(|(key, _)| std::env::var_os(key).is_none());
        let snap_polluted_vars: Vec<&str> = SNAP_GTK_POLLUTION_VARS
            .into_iter()
            .filter(|key| is_snap_polluted(key))
            .collect();
        if missing_failover || !snap_polluted_vars.is_empty() {
            use std::os::unix::process::CommandExt;
            let current_exe =
                std::env::current_exe().expect("the running binary has a resolvable path");
            let mut command = std::process::Command::new(current_exe);
            command
                .args(std::env::args_os().skip(1))
                .envs(RENDER_FAILOVER_VARS);
            for key in snap_polluted_vars {
                command.env_remove(key);
            }
            let error = command.exec();
            panic!("failed to relaunch with a software WebKit renderer: {error}");
        }
    }
    knowledge_os_desktop_lib::run();
}
