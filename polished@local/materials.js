export const SOFT_TINT = 0.28;

// One palette across compositor and GTK materials. Density and geometry remain
// role-specific; overview/OSD/authentication use the dark palette for native
// light foregrounds even when application appearance is light.
const PALETTES = Object.freeze({
    dark: Object.freeze({background: '25,28,35', foreground: '242,242,242',
        edge: '255,255,255,0.20', highlight: '255,255,255'}),
    light: Object.freeze({background: '236,239,244', foreground: '28,30,40',
        edge: '20,25,35,0.18', highlight: '28,30,40'}),
});
export const MATERIAL_STATES = Object.freeze({hover: 0.08, focus: 0.16, pressed: 0.22, disabled: 0.4});
let desktopStyle = {fontStyle: '', selection: '80,140,220'};
export function configureMaterials(style) { desktopStyle = {...desktopStyle, ...style}; }
export function surfacePalette(dark) { return {...PALETTES[dark ? 'dark' : 'light'], ...desktopStyle}; }

export function materialStyle(dark, {focused = true, emphasis = false} = {}) {
    const inactive = emphasis && !focused;
    const tint = SOFT_TINT + (inactive ? 0.12 : 0);
    const color = surfacePalette(dark).background;
    const edge = inactive ? '255,255,255,0.12' : surfacePalette(dark).edge;
    return `background-color: rgba(${color}, ${tint}); border: 1px solid rgba(${edge});`;
}

export function eligible({normal, fullscreen, minimized}) {
    return normal && !fullscreen && !minimized;
}

export function shellSurfaceKind(classes) {
    const names = new Set(classes.split(/\s+/));
    if (['switcher-list', 'osd-window', 'dash-label', 'screenshot-ui-tooltip', 'tooltip']
        .some(name => names.has(name))) return 'overlays';
    if (names.has('dash-background')) return 'dock';
    if (['popup-menu-content', 'quick-settings', 'popup-menu-boxpointer',
        'candidate-popup-boxpointer', 'candidate-popup-content', 'datemenu-popover',
        'popup-sub-menu', 'quick-toggle-menu'].some(name => names.has(name))) return 'menus';
    if (names.has('notification-banner')) return 'notifications';
    if (names.has('modal-dialog')) return 'dialogs';
    return null;
}

export function shellSurfaceRole(classes) {
    const names = new Set(classes.split(/\s+/));
    if (names.has('popup-menu-boxpointer') || names.has('candidate-popup-boxpointer')) return 'pointer';
    if (shellSurfaceKind(classes)) return 'surface';
    if (['calendar', 'datemenu-today-button', 'datemenu-calendar-column',
        'datemenu-displays-box', 'datemenu-displays-section', 'message-list',
        'message', 'events-button', 'world-clocks-button', 'weather-button'].some(name => names.has(name))) return 'inset';
    return null;
}
