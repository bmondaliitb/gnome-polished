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
assert(!comfortPolicy({onBattery:true},true).blurFocusedOnly,'Battery retains background-window cached frost');
assert(comfortPolicy({onBattery:false,powerSaver:true},true).blurFocusedOnly,'Explicit Power Saver limits background capture on AC too');
assert(!comfortPolicy({onBattery:true,powerSaver:true},false).blurFocusedOnly,'Automatic saving can be bypassed');
let profile='balanced',changes=0;
const probe={state:{},_a11y:{get_boolean:()=>false},
    _power:{get_cached_property:()=>({deep_unpack:()=>profile})},_changed:()=>changes++};
Experience.prototype._sync.call(probe);
assert(!probe.state.powerSaver,'Balanced profile does not trigger Power Saver');
profile='power-saver';Experience.prototype._sync.call(probe);
assert(probe.state.powerSaver&&changes===2,'Power profile changes refresh independently');
print('Hierarchy, wallpaper contrast and independent battery/Power Saver checks passed');
