import GLib from 'gi://GLib';
import {shellSurfaceKind,shellSurfaceRole,surfacePalette} from '../polished@local/materials.js';
import {surfaceOpacity,panelIsDark} from '../polished@local/experience.js';
import {materialValues} from '../polished@local/simpleProfile.js';
function assert(value,message){if(!value)throw new Error(message);}
const [,bytes]=GLib.file_get_contents('polished@local/shellSurfaces.js');
const source=new TextDecoder().decode(bytes).replace(/^import .*;\n/gm,'').replace('export class','class');
const callbacks=new Map();let id=0;
const loop={PRIORITY_DEFAULT_IDLE:0,SOURCE_REMOVE:false,idle_add:(_priority,callback)=>{callbacks.set(++id,callback);return id;},source_remove:key=>callbacks.delete(key)};
class Actor {
    constructor(classes='',children=[]){this.classes=classes;this.children=children;this.style='border-radius: 8px;';this.radii=[12,12,12,12];this.effects=[];this.signals=new Map();this.next=0;this.redraws=0;}
    connect(name,callback){this.signals.set(++this.next,[name,callback]);return this.next;}
    disconnect(key){this.signals.delete(key);}
    emit(name,child){for(const [signal,callback] of [...this.signals.values()])if(signal===name)callback(this,child);}
    get_children(){return this.children;} get_style_class_name(){return this.classes;}get_style(){return this.style;}
    has_style_class_name(name){return this.classes.split(/\s+/).includes(name);}
    add_style_class_name(name){this.classes=(this.classes+' '+name).trim();this.emit('notify::style-class');}
    remove_style_class_name(name){this.classes=this.classes.split(/\s+/).filter(value=>value!==name).join(' ');this.emit('notify::style-class');}
    set_style(style){this.style=style;this.emit('notify::style');this.emit('style-changed');}
    get_theme_node(){return {get_border_radius:corner=>this.radii[corner]};}
    add_effect(effect){this.effects.push(effect);}remove_effect(effect){this.effects=this.effects.filter(item=>item!==effect);}
    queue_redraw(){this.redraws++;}is_mapped(){return true;}
}
class Frost {invalidateBackdrop(){this.invalidations=(this.invalidations??0)+1;}}
const Manager=new Function('GLib','St','shellSurfaceKind','shellSurfaceRole','surfacePalette','FrostEffect','surfaceOpacity','panelIsDark',source+'\nreturn ShellSurfaces;')(
    loop,{Label:class{static [Symbol.hasInstance](actor){return actor.label;}},Icon:class{static [Symbol.hasInstance](actor){return actor.icon;}}},
    shellSurfaceKind,shellSurfaceRole,surfacePalette,Frost,surfaceOpacity,panelIsDark);
const row=new Actor('popup-menu-item'),submenu=new Actor('popup-sub-menu',[new Actor('popup-menu-item')]);
const floating=new Actor('popup-sub-menu'),floatingPointer=new Actor('popup-menu-boxpointer',[floating]);
const calendar=new Actor('calendar'),card=new Actor('events-button');
const menu=new Actor('popup-menu-content',[row,submenu,floatingPointer,calendar,card]);
const dateMessage=new Actor('message');
const dateMenu=new Actor('popup-menu-content datemenu-popover',[new Actor('message-list',[dateMessage])]);
const quickSettings=new Actor('popup-menu-content quick-settings');
const pointer=new Actor('popup-menu-boxpointer',[menu]);let repaints=0;pointer._border={queue_repaint:()=>repaints++};
const orphan=new Actor('popup-menu-boxpointer',[new Actor('unknown-tray-content')]);
const clock=new Actor('clock');clock.label=true;const icon=new Actor('system-status-icon');icon.icon=true;
const dot=new Actor('workspace-dot'),layout=new Actor('workspace-indicator',[dot]);
const button=new Actor('panel-button',[clock,icon,layout]);
const popupLabel=new Actor('popup-menu-item');
const panelPopup=new Actor('popup-menu-content',[popupLabel]);
const panel=new Actor('panel',[button,panelPopup]);panel.style='background-color: #131313 !important;';
const dock=new Actor('dash-background polished-material-dark'),dialog=new Actor('modal-dialog'),message=new Actor('message');
const banner=new Actor('notification-banner',[message]),looseCalendar=new Actor('calendar');
const overlays=['osd-window','switcher-list','dash-label','tooltip'].map(name=>new Actor(name));
const root=new Actor('',[pointer,new Actor('popup-menu-boxpointer',[dateMenu]),new Actor('popup-menu-boxpointer',[quickSettings]),orphan,panel,dock,dialog,banner,looseCalendar,...overlays]);
let active=false,dark=true,context={...materialValues(50),luminance:null,powerSaver:false};
const tracked=new Map(),guard={track:(actor,on)=>on?tracked.set(actor,true):tracked.delete(actor),untrack:actor=>tracked.delete(actor)};
const manager=new Manager(root,panel,()=>dark,()=>active,guard,()=>context);
function flush(){for(const [key,callback]of [...callbacks]){callbacks.delete(key);callback();}}
active=true;manager.refresh();
assert(menu.effects.length===1&&floating.effects.length===1&&dock.effects.length===1,'Unified menus, floating submenus and dock receive cached frost');
for(const actor of [menu,dateMenu,quickSettings,dock,dialog,banner])
    assert(actor.effects.length===1&&actor.effects[0].nativeShape===true,
        'Shell glass follows native paint coverage rather than filling transparent margins and shadows');
assert(submenu.effects.length===0&&submenu.style.includes('background-color: transparent'),'Inline submenus share parent tint and filter');
assert(panel.effects.length===0&&overlays.every(actor=>!actor.effects.length),'Panel and lightweight overlays never capture a backdrop');
assert(pointer.style.includes('-arrow-background-color: transparent')&&repaints>0&&pointer.effects.length===0,'BoxPointer backing does not duplicate the material');
assert(orphan.style.includes('-arrow-background-color: rgba(25,28,35,0.76)'),'Unknown popup keeps tinted backing');
assert(calendar.style.includes('transparent')&&card.style.includes('transparent')&&!calendar.effects.length&&
    looseCalendar.style==='border-radius: 8px;','Calendar inset clearing stays scoped');
assert(message.style.includes('transparent')&&banner.effects.length===1,'Notifications share a single backdrop');
assert(!dateMessage.style.includes('background-color:') && dateMessage.effects.length===0,
    'Date-menu notification cards use CSS hover/focus states without another capture or forced inline fill');
assert(menu.style.includes('border-color: rgba(')&&!menu.style.includes('border: 1px'),'Native border geometry is preserved');
assert(dock.style.includes('box-shadow: inset 0 0 0 1px rgba(')&&
    !dock.style.includes('border-width:')&&!dock.style.includes('border-radius: 12px'),
    'Dock rim is visible without a native border and preserves theme geometry');
assert(clock.style.includes('color: rgb(')&&icon.style.includes('color: rgb(')&&
    button.style==='border-radius: 8px;'&&dot.style==='border-radius: 8px;'&&layout.style==='border-radius: 8px;',
    'Panel leaf foregrounds are readable without touching workspace geometry');
assert(popupLabel.style==='border-radius: 8px;','Panel foreground overrides do not leak into popup rows');
assert(panel.has_style_class_name('polished-panel-dark'),'Top-bar typography is scoped to an owned contrast class');
assert(menu.has_style_class_name('polished-material-dark'),'Owned palette class scopes row styling');
const redraws=menu.redraws;manager.refresh();card.emit('style-changed');flush();
assert(menu.effects.length===1&&menu.redraws===redraws&&callbacks.size===0,'Hover/owned styles neither duplicate effects nor invalidate snapshots');
for(const actor of [row,clock,icon,panel,menu,card])actor.emit('style-changed');
assert(callbacks.size===0,'Inherited hover/focus notifications on rows, panel labels and unchanged surfaces never rescan the Shell tree');
menu.radii=[18,18,18,18];menu.emit('style-changed');
assert(callbacks.size===1,'A real surface shape change still queues a material refresh');flush();
assert(menu.effects[0].radii.join()==='18,18,18,18','Theme radius changes reach the blur shape');
menu.emit('notify::mapped');assert(menu.effects[0].invalidations===1,'Reopened popup gets a fresh backdrop');
manager.refreshBackdrops();assert(menu.effects[0].invalidations===2,'Manual refresh invalidates snapshots');
dark=false;manager.refresh();
assert(menu.has_style_class_name('polished-material-light')&&!menu.has_style_class_name('polished-material-dark')&&
    overlays.every(actor=>actor.has_style_class_name('polished-material-dark')),'Appearance replacement keeps native-light overlays dark');
const effect=menu.effects[0];context={...context,...materialValues(0)};manager.refresh();
assert(menu.effects[0]===effect&&menu.style.includes('rgba(236,239,244,0.76)')&&effect.clientTintOpacity<1&&effect.veil[3]===0,
    'Changing density reuses the existing filter and updates only material weights');
context.powerSaver=true;context.dockGlass=false;manager.refresh();
assert(dock.effects.length===0&&dock.style.includes('background-color: rgba(')&&menu.effects.length===1,
    'Power Saver retains dock tint and transient menu frost');
context.powerSaver=false;context.dockGlass=true;manager.refresh();assert(dock.effects.length===1,'Leaving Power Saver restores dock frost');
const trackedBeforeMotion=tracked.size,menuBeforeMotion=menu.effects[0];
manager.setMotionPaused(true);manager.setMotionPaused(false);
assert(tracked.size===trackedBeforeMotion&&tracked.has(menu)&&menu.effects[0]===menuBeforeMotion,
    'Workspace pause/resume preserves effect records and observers without untracking and rearming every surface');
const oldTheme=menu.get_theme_node;menu.get_theme_node=undefined;manager.refresh();
assert(menu.effects.length===0&&menu.style.includes('rgba('),'Unknown native shape remains corner-safe tint');
menu.get_theme_node=oldTheme;manager.refresh();
const clones=new Actor('workspace-animation-group',[new Actor('',[new Actor('')])]);
root.children.push(clones);root.emit('child-added',clones);
assert(callbacks.size===0,'Adding a workspace clone group without material surfaces does not schedule a full Shell refresh');
root.children=root.children.filter(child=>child!==clones);root.emit('child-removed',clones);
assert(callbacks.size===0&&clones.signals.size===0,'Removing clone groups avoids refresh work and releases discovery handlers');
manager.setMotionPaused(true);
const duringMotion=new Actor('popup-menu-content');root.children.push(duringMotion);root.emit('child-added',duringMotion);flush();
assert(callbacks.size===0&&duringMotion.effects.length===0,'Material discovery waits while a workspace is moving');
manager.setMotionPaused(false);flush();
assert(duringMotion.effects.length===1,'A real popup discovered during motion receives its material after resume');
root.children=root.children.filter(child=>child!==duringMotion);root.emit('child-removed',duringMotion);flush();
const dynamic=new Actor('popup-menu-content');root.children.push(dynamic);root.emit('child-added',dynamic);flush();
assert(dynamic.effects.length===1,'New surfaces are discovered without polling');
root.children=root.children.filter(child=>child!==dynamic);root.emit('child-removed',dynamic);
assert(dynamic.effects.length===0&&dynamic.signals.size===0&&dynamic.style==='border-radius: 8px;','Detached surface is restored');
context.smoothPerformance=true;manager.refresh();
assert(panel.style.includes('rgba(236,239,244,0.72)')&&panel.has_style_class_name('polished-panel-light'),
    'Smooth top bar uses the shared neutral palette with a stable readable backing');
assert(tracked.size===0&&[menu,floating,dock,dialog,banner,...overlays].every(actor=>actor.effects.length===0),
    'Smooth mode removes all owned Shell backdrop effects and releases broad-redraw tracking');
assert(menu.style.includes('rgba(236,239,244,0.94)')&&dock.style.includes('rgba(236,239,244,0.94)')&&
    menu.has_style_class_name('polished-material-light')&&dock.style.includes('box-shadow: inset'),
    'Smooth menus and dock retain denser material, styling and separation');
manager.refresh();assert(tracked.size===0,'Repeated smooth refresh never re-enables capture protection');
context.smoothPerformance=false;manager.refresh();
assert(menu.effects.length===1&&tracked.has(menu),'Glass mode restores backdrop effects and tracking live');
context.menuGlass=false;context.dockGlass=true;manager.refresh();
assert(menu.effects.length===0&&menu.style.includes('rgba(236,239,244,0.94)')&&dock.effects.length===1,
    'Menu and dock glass can be controlled independently');
context.menuGlass=true;context.dockGlass=false;manager.refresh();
assert(menu.effects.length===1&&dock.effects.length===0,'Battery defaults preserve menu frost while dropping dock frost');
context.smoothPerformance=true;manager.refresh();
menu.set_style('external-style: preserved;');active=false;manager.refresh();
assert(menu.style==='external-style: preserved;'&&panel.style==='background-color: #131313 !important;'&&
    !panel.has_style_class_name('polished-panel-light')&&!menu.has_style_class_name('polished-material-light'),'Suspension preserves external styles and removes owned classes');

context={...materialValues(50)};dark=true;manager._permitted=()=>true;manager.refresh();
for(const actor of [menu,dateMenu,quickSettings,dock,banner]) {
    const effect=actor.effects[0];
    assert(effect && effect.clientTintOpacity>=0.70 && effect.clientTintOpacity<1,
        'Floating glass lightens background tint without fading native text');
    assert(effect.radius===36 && effect.brightness===0.90,
        'More visible glass reuses the same blur radius with a gentler dark veil');
}
assert(dock.style.includes('rgba(25,28,35,0.76)') && menu.style.includes('border-top-color:'),
    'Native coverage stays above the shape threshold and glass edges get a faint highlight');
context={...materialValues(100)};manager.refresh();
assert(menu.effects[0].clientTintOpacity===1,'Maximum clarity keeps a fully dense menu tint');


manager.destroy();assert(!callbacks.size&&!tracked.size,'Disable releases pending work and redraw references');
assert(dock.has_style_class_name('polished-material-dark'),'Cleanup preserves a preexisting palette class');
function clean(actor){assert(!actor.signals.size&&!actor.effects.length,'Actor lifecycle is fully released');for(const child of actor.children)clean(child);}
clean(root);
print('Unified Shell material layering, corners, palette, workspace, dynamic discovery and cleanup checks passed');
