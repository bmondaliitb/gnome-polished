import Pango from 'gi://Pango';

// Accent stays in interaction feedback; large surfaces remain neutral.
const ACCENTS = Object.freeze({
    blue: '65,130,215', teal: '45,145,155', green: '70,145,100',
    yellow: '175,145,55', orange: '190,120,65', red: '195,85,85',
    pink: '185,95,145', purple: '140,105,190', slate: '115,130,150', brown: '145,110,85',
});
export function readDesktopStyle(settings) {
    const accent = settings.settings_schema?.has_key('accent-color') ? settings.get_string('accent-color') : 'blue';
    const description = Pango.FontDescription.from_string(settings.get_string('font-name'));
    const family = (description.get_family() || 'Sans').replace(/[\\"\n\r\f]/g, ' ');
    const size = Math.max(6, Math.min(48, description.get_size() / Pango.SCALE || 11));
    return {
        selection: ACCENTS[accent] ?? ACCENTS.blue,
        fontStyle: `font-family: "${family}"; font-size: ${size}${description.get_size_is_absolute() ? 'px' : 'pt'};`,
    };
}
