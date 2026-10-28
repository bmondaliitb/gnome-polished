import {surfaceOpacity,panelIsDark,wallpaperLuminance,solidLuminance,comfortPolicy,Experience} from '../polished@local/experience.js';
import GdkPixbuf from 'gi://GdkPixbuf';
function assert(value,message){if(!value)throw new Error(message);}
assert(surfaceOpacity('dialogs',0.85)>surfaceOpacity('menus',0.85) &&
    surfaceOpacity('dock',0.85)<surfaceOpacity('menus',0.85),'Material hierarchy remains');
assert(surfaceOpacity('dialogs',0.99)===1 && surfaceOpacity('dock',0.4)===0.4,'Opacity limits remain');
assert(panelIsDark(false,0.25,0.05) && !panelIsDark(true,0.25,0.95) &&
    panelIsDark(true,0.25,null),'Wallpaper-aware foreground policy remains');
const image=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,8,8);
image.fill(0xffffffff);assert(wallpaperLuminance(image)>0.99,'Real bright image sampling');
image.fill(0x000000ff);assert(wallpaperLuminance(image)===0,'Real dark image sampling');
assert(solidLuminance('#ffffff')>0.99 && solidLuminance('invalid')===null,'Solid wallpaper fallback');
const effects=['windowGlass','menuGlass','dockGlass','overviewGlass'];
assert(effects.every(key=>comfortPolicy({onBattery:false,powerSaver:false},true)[key]),'AC uses full glass by default');
const battery=comfortPolicy({onBattery:true,powerSaver:false},true);
assert(battery.batterySaving&&!battery.windowGlass&&battery.menuGlass&&!battery.dockGlass&&!battery.overviewGlass,
    'Battery defaults keep menu glass while reducing larger effects');
assert(comfortPolicy({onBattery:false,powerSaver:true},true).batterySaving,'System Power Saver applies battery choices on AC');
assert(effects.every(key=>comfortPolicy({onBattery:true,powerSaver:true},false)[key]),'Automatic saving can be bypassed');
assert(effects.every(key=>!comfortPolicy({onBattery:false},false,true)[key]),'Manual Low power mode overrides every glass effect on AC');
const custom=comfortPolicy({onBattery:true},true,false,{windows:true,menus:false,dock:true,overview:false});
assert(custom.windowGlass&&!custom.menuGlass&&custom.dockGlass&&!custom.overviewGlass,'Every battery effect is independently selectable');
assert(effects.every(key=>comfortPolicy({onBattery:false},true,false,{windows:false,menus:false,dock:false,overview:false})[key]),
    'Plugging in restores full glass regardless of battery choices');
let profile='balanced',onBattery=false,changes=0;
const probe={state:{},_upower:{get_cached_property:()=>({deep_unpack:()=>onBattery})},_a11y:{get_boolean:()=>false},
    _power:{get_cached_property:()=>({deep_unpack:()=>profile})},_changed:()=>changes++};
Experience.prototype._sync.call(probe);
assert(!probe.state.powerSaver,'Balanced profile does not trigger Power Saver');
profile='power-saver';Experience.prototype._sync.call(probe);
assert(probe.state.powerSaver&&changes===2,'Power profile changes refresh independently');
onBattery=true;Experience.prototype._sync.call(probe);
assert(probe.state.onBattery&&changes===3,'UPower unplug events refresh appearance independently');
onBattery=false;Experience.prototype._sync.call(probe);
assert(!probe.state.onBattery&&changes===4,'Plugging in restores AC state');
print('Hierarchy, wallpaper contrast and independent battery/Power Saver checks passed');

assert(surfaceOpacity('menus',0.76,true)===0.68 && surfaceOpacity('notifications',0.76,true)===0.73 &&
    surfaceOpacity('dock',0.76,true)===0.60, 'Airy glass exposes more backdrop color with role-specific density');
assert(surfaceOpacity('menus',1,true)===1 && surfaceOpacity('menus',0.4,true)>=0.56,
    'Glass tint relief preserves maximum clarity and a readable minimum');
