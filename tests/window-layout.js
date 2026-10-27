import Gtk from 'gi://Gtk?version=4.0';
import {layoutFrame, arrangeWindow} from '../polished@local/windowLayout.js';
import {memorySettings} from './settings.js';
function assert(value,message){if(!value)throw new Error(message);}
for(const area of [{x:0,y:32,width:1920,height:1048},{x:-2560,y:-900,width:2560,height:1400},
    {x:0,y:32,width:800,height:568},{x:0,y:0,width:3440,height:1440}]) {
    const current={width:700,height:480};
    const frame=layoutFrame(area,current,true);
    assert(frame.x>=area.x&&frame.y>=area.y&&frame.x+frame.width<=area.x+area.width&&
        frame.y+frame.height<=area.y+area.height,'Comfortable frames fit the monitor work area');
    assert(Math.abs(frame.x-area.x-(area.width-frame.width)/2)<=0.5&&
        Math.abs(frame.y-area.y-(area.height-frame.height)/2)<=0.5,'Frames center on the current monitor');
    const centered=layoutFrame(area,current);
    assert(centered.width===700&&centered.height===480,'Centering never changes app size');
}
assert(layoutFrame({x:0,y:32,width:800,height:568},{width:1400,height:900}).y===32,
    'Oversized windows retain an accessible titlebar');
const calls=[];let maximized=false,fullscreen=false,resizable=true,type=0;
const window={get_window_type:()=>type,is_fullscreen:()=>fullscreen,is_override_redirect:()=>false,
    allows_move:()=>true,allows_resize:()=>resizable,is_maximized:()=>maximized,
    get_work_area_current_monitor:()=>({x:1920,y:40,width:1920,height:1040}),
    get_frame_rect:()=>({width:900,height:700}),unmaximize:()=>{calls.push('unmaximize');maximized=false;},
    move_frame:(...args)=>calls.push(['move',...args]),move_resize_frame:(...args)=>calls.push(['resize',...args])};
assert(arrangeWindow(window,false,0)&&calls[0][0]==='move','Center action uses native movement without resizing');
maximized=true;assert(!arrangeWindow(window,false,0),'Center action preserves maximized windows');
assert(arrangeWindow(window,true,0)&&calls[1]==='unmaximize'&&calls[2][0]==='resize',
    'Comfortable action explicitly restores and resizes a maximized window');
const count=calls.length;
fullscreen=true;assert(!arrangeWindow(window,true,0),'Fullscreen apps are excluded');fullscreen=false;
type=1;assert(!arrangeWindow(window,true,0),'Dialogs and popups are excluded');type=0;
resizable=false;assert(!arrangeWindow(window,true,0),'Fixed-size apps are not forced to resize');
assert(calls.length===count&&!arrangeWindow(null,true,0),'Excluded windows and absent focus do no work');
const settings=memorySettings();
for(const name of ['polished-center-window','polished-comfortable-window']) {
    const accelerators=settings.get_strv(name);
    assert(accelerators.length===1&&Gtk.accelerator_parse(accelerators[0])[0],'Default shortcut is a valid GTK accelerator');
    settings.set_strv(name,[]);assert(settings.get_strv(name).length===0,'Shortcuts can be disabled');
}
print('Window layout work-area geometry, native actions, exclusions and shortcut settings passed');
