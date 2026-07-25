fn main() {
    // WebKitGTK's DMA-BUF renderer crashes with "Could not create surfaceless
    // EGL display: EGL_BAD_ALLOC" on several NVIDIA + Wayland setups. Software
    // compositing still works there, so fail over to it unless the user (or
    // packaging) already made an explicit choice. `std::env::set_var` is
    // unsafe and this workspace forbids unsafe code, so the var is applied by
    // re-executing this same binary with it set, which is a safe API.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        use std::os::unix::process::CommandExt;
        let current_exe =
            std::env::current_exe().expect("the running binary has a resolvable path");
        let error = std::process::Command::new(current_exe)
            .args(std::env::args_os().skip(1))
            .env("WEBKIT_DISABLE_DMABUF_RENDERER", "1")
            .exec();
        panic!("failed to relaunch with a software WebKit renderer: {error}");
    }
    knowledge_os_desktop_lib::run();
}
