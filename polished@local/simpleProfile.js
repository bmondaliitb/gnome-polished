// Polished has its own settings; no Prism preferences or migrations are read.
export const DESKTOP_PROFILES = Object.freeze({
    subtle: Object.freeze({label: 'Subtle · maximum clarity', strength: 85}),
    balanced: Object.freeze({label: 'Balanced', strength: 69}),
    airy: Object.freeze({label: 'Airy · comfort default', strength: 50}),
    mist: Object.freeze({label: 'Mist · more background', strength: 35}),
});
export function materialValues(strength) {
    const value = Math.max(0, Math.min(100, Math.round(strength)));
    const density = value < 50 ? -100 + value * 2.4 : 20 + (value - 50) * 1.6;
    return {
        windowOpacity: Math.round(80 + value * 0.12),
        detail: Math.max(0, Math.round(10 + density * 0.20)),
        popupOpacity: Math.round(86 + density * 0.12),
        shellOpacity: Math.round(70 + density * 0.30),
        panelOpacity: Math.max(0, Math.round(10 + density * 0.30)),
        overviewOpacity: Math.max(0, Math.round(20 + density * 0.30)),
    };
}
export function applyStrength(settings, strength, profile = 'custom') {
    const value = Math.max(0, Math.min(100, Math.round(strength)));
    if (settings.get_int('material-strength') !== value) settings.set_int('material-strength', value);
    if (settings.get_string('desktop-profile') !== profile) settings.set_string('desktop-profile', profile);
}
export function applyDesktopProfile(settings, profile) {
    if (profile === 'custom') settings.set_string('desktop-profile', 'custom');
    else if (Object.hasOwn(DESKTOP_PROFILES, profile)) applyStrength(settings, DESKTOP_PROFILES[profile].strength, profile);
}
export function applyRecommended(settings) { applyDesktopProfile(settings, 'airy'); }
export function initializeProfile(settings) {
    applyDesktopProfile(settings, settings.get_string('desktop-profile'));
}
