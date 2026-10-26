import {readDesktopStyle} from '../polished@local/polish.js';
import {surfacePalette,configureMaterials,materialStyle} from '../polished@local/materials.js';
function assert(value,message){if(!value)throw new Error(message);}
let accent='teal',font='Cantarell 11';
const settings={settings_schema:{has_key:()=>true},get_string:key=>key==='font-name'?font:accent};
let style=readDesktopStyle(settings);
assert(style.fontStyle.includes('"Cantarell"')&&style.fontStyle.includes('11pt'),'System typography is shared without changing the system setting');
configureMaterials(style);
assert(surfacePalette(true).selection==='45,145,155'&&surfacePalette(false).selection==='45,145,155','One restrained accent across appearances');
assert(!materialStyle(true).includes('45,145,155'),'Large surfaces stay neutral');
font='Sans 14px';accent='unknown';style=readDesktopStyle(settings);
assert(style.fontStyle.includes('14px')&&style.selection==='65,130,215','Absolute font units and unknown accent fallback');
settings.settings_schema.has_key=()=>false;
assert(readDesktopStyle(settings).selection==='65,130,215','Older desktop settings tolerate absent accent');
print('Polished typography, accent consistency and neutral-surface policy checks passed');
