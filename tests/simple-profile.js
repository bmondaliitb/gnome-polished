import GLib from 'gi://GLib';
import {memorySettings} from './settings.js';
import {initializeProfile, applyRecommended, applyStrength, applyDesktopProfile, DESKTOP_PROFILES, materialValues} from '../polished@local/simpleProfile.js';
import {SOFT_TINT} from '../polished@local/materials.js';
function assert(value,message){if(!value)throw new Error(message);}
const settings=memorySettings();
assert(settings.settings_schema.list_keys().length===6,'Only six current settings remain');
initializeProfile(settings);
assert(settings.get_string('desktop-profile')==='airy'&&settings.get_int('material-strength')===50,'Independent comfort default');
assert(materialValues(50).windowOpacity===96,'Default keeps working text nearly opaque');
settings.set_boolean('enabled',false);settings.set_boolean('reduce-transparency',true);settings.set_string('appearance','dark');
const current=materialValues(50);
const defaults={opacity:current.windowOpacity/100,detail:current.detail/100,tint:SOFT_TINT,profiles:{}};
let previous=101;
for(const id of ['subtle','balanced','airy','mist']){
    applyDesktopProfile(settings,id);
    const v=materialValues(settings.get_int('material-strength'));
    assert(v.windowOpacity<previous,'Named densities are ordered');previous=v.windowOpacity;
    defaults.profiles[id]={opacity:v.windowOpacity/100,detail:v.detail/100};
}
assert(Object.keys(DESKTOP_PROFILES).length===4,'No retired or unused presets');
previous=0;
for(let i=0;i<=100;i++){
    applyStrength(settings,i);const v=materialValues(i);
    assert(v.windowOpacity>=previous&&v.windowOpacity>=92&&v.windowOpacity<=100,'Custom preserves foreground clarity');
    previous=v.windowOpacity;
}
applyStrength(settings,17);initializeProfile(settings);
assert(settings.get_int('material-strength')===17&&settings.get_string('desktop-profile')==='custom','Custom survives initialization');
applyRecommended(settings);
assert(!settings.get_boolean('enabled')&&settings.get_boolean('reduce-transparency')&&settings.get_string('appearance')==='dark','Appearance changes preserve user and accessibility choices');
GLib.file_set_contents('/tmp/polished-profile-default.json',JSON.stringify(defaults));
print('Polished preset density, Custom clarity, independent settings and accessibility checks passed');
