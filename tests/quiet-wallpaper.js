import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import {QuietWallpaper} from '../polished@local/quietWallpaper.js';
import {memorySettings} from './settings.js';
function assert(value,message){if(!value)throw new Error(message);}
const settings=memorySettings();
const original={'picture-uri':'file:///old-light.jpg','picture-uri-dark':'file:///old-dark.jpg','picture-options':'scaled'};
const values={...original};let writes=0;
const background={get_string:key=>values[key],set_string:(key,value)=>{values[key]=value;writes++;}};
const directory=Gio.File.new_for_path('polished@local/wallpapers');
const wallpaper=new QuietWallpaper(background,settings,directory);
assert(writes===0&&!wallpaper.canRestore,'Construction never modifies desktop preferences');
wallpaper.apply();assert(wallpaper.canRestore&&values['picture-options']==='zoom'&&
    values['picture-uri'].endsWith('/quiet-dawn.svg')&&values['picture-uri-dark'].endsWith('/quiet-dusk.svg'),
    'One explicit action applies the coordinated light/dark pair');
wallpaper.apply();wallpaper.restore();
assert(JSON.stringify(values)===JSON.stringify(original)&&!wallpaper.canRestore,'Repeated application preserves the original backup');
wallpaper.apply();
const relocated=new QuietWallpaper(background,settings,Gio.File.new_for_path('/tmp/relocated-wallpapers'));
relocated.apply();relocated.restore();
assert(JSON.stringify(values)===JSON.stringify(original),'A relocated extension retains the previous wallpaper backup');
wallpaper.apply();values['picture-uri']='file:///user-new.jpg';wallpaper.restore();
assert(values['picture-uri']==='file:///user-new.jpg'&&values['picture-uri-dark']===original['picture-uri-dark'],
    'Restore preserves later user choices and restores only still-owned values');
wallpaper.apply();wallpaper.restore();
assert(values['picture-uri']==='file:///user-new.jpg','Applying after an external change backs up the new choice');
settings.set_string('wallpaper-backup','invalid');const before=writes;wallpaper.restore();
assert(!wallpaper.canRestore&&writes===before,'Malformed backup cannot write desktop settings');
if(ARGV.includes('--render')) for(const name of ['quiet-dawn','quiet-dusk']) {
    const image=GdkPixbuf.Pixbuf.new_from_file_at_scale(directory.get_child(name+'.svg').get_path(),960,540,true);
    assert(image.get_width()===960&&image.get_height()===540,'Packaged wallpaper renders at the correct aspect ratio');
    image.savev('/tmp/polished-'+name+'.png','png',[],[]);
}
print('Wallpaper explicit application, restoration and external-change checks passed');
if(ARGV.includes('--render')) print('Light/dark SVG wallpapers rendered successfully');
