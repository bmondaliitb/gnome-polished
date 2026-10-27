// Work-area coordinates already exclude panels/docks and use logical pixels.
// Layout is an explicit action: never fight application placement on launch.
export function layoutFrame(area, current, resize = false) {
    const gap = Math.min(32, Math.floor(Math.min(area.width, area.height) / 16));
    const width = resize ? Math.min(area.width - gap * 2,
        Math.max(960, Math.round(area.width * 0.76))) : current.width;
    const height = resize ? Math.min(area.height - gap * 2,
        Math.max(640, Math.round(area.height * 0.82))) : current.height;
    return {x: Math.round(area.x + Math.max(0, (area.width - width) / 2)),
        y: Math.round(area.y + Math.max(0, (area.height - height) / 2)), width, height};
}

export function arrangeWindow(window, resize, normalType) {
    if (!window || window.get_window_type() !== normalType || window.is_fullscreen() ||
        window.is_override_redirect() || !window.allows_move() ||
        (resize && !window.allows_resize()) || (!resize && window.is_maximized())) return false;
    const area = window.get_work_area_current_monitor();
    if (area.width <= 0 || area.height <= 0) return false;
    const frame = layoutFrame(area, window.get_frame_rect(), resize);
    if (resize) {
        if (window.is_maximized()) window.unmaximize();
        window.move_resize_frame(true, frame.x, frame.y, frame.width, frame.height);
    } else {
        window.move_frame(true, frame.x, frame.y);
    }
    return true;
}
