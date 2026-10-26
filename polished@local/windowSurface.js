// Native Mutter render roots, not application classes. Other extensions may insert
// decorations before these children, so get_first_child() is not a surface API.
export function clientSurfaceRoot(children, typeName) {
    return children.find(actor => typeName(actor) === 'MetaSurfaceContainerActorWayland') ??
        children.find(actor => /^MetaSurfaceActor(?:X11|Wayland)?$/.test(typeName(actor))) ?? null;
}
