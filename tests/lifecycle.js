import GLib from 'gi://GLib';
import {memorySettings} from './settings.js';
import {initializeProfile,materialValues} from '../polished@local/simpleProfile.js';
import {clientSurfaceRoot} from '../polished@local/windowSurface.js';
import {eligible,materialStyle,configureMaterials,surfacePalette} from '../polished@local/materials.js';
import {comfortPolicy} from '../polished@local/experience.js';
function assert(value,message){if(!value)throw new Error(message);}
const [,bytes]=GLib.file_get_contents('polished@local/extension.js');
const source='const ExtensionState={ACTIVE:1,ACTIVATING:8};\n'+new TextDecoder().decode(bytes).replace(/^import .*;\n/gm,'').replace('export default class Polished','class Polished');
class Widget {
    constructor(properties){this.properties=properties;this.redraws=0;}
    add_effect(effect){this.effect=effect;}
    set_position(x,y){this.position=[x,y];} set_size(w,h){this.size=[w,h];}
    set_style(style){this.style=style;} queue_redraw(){this.redraws++;}
    destroy(){this.destroyed=true;}
}
class MockFrost {
    invalidateBackdrop(){this.invalidations=(this.invalidations??0)+1;}
    static setWorkspaceMotion(value){this.motion=value;}
    static setInteractiveMotion(value){this.interactive=value;}
}
const types={NORMAL:0,MENU:1,DROPDOWN_MENU:2,POPUP_MENU:3,TOOLTIP:4,COMBO:5,DIALOG:6,MODAL_DIALOG:7,UTILITY:8,TOOLBAR:9,DESKTOP:10};
let windowType=0,fullscreen=false,minimized=false;
const win={get_window_type:()=>windowType,is_fullscreen:()=>fullscreen,get minimized(){return minimized;},
    get_frame_rect:()=>({x:15,y:25,width:500,height:400}),get_buffer_rect:()=>({x:10,y:20}),
    get_transient_for:()=>null};
const display={focus_window:win};
const main={overview:{visible:false},sessionMode:{isLocked:false},wm:{_workspaceAnimation:{_switchData:null}}};
const Polished=new Function('Extension','Gio','Meta','St','Main','global','eligible','materialStyle','FrostEffect',
    'GObject','clientSurfaceRoot','VisualBackdrop','BackdropRefreshEffect','gtkMenuCss','comfortPolicy','materialValues','surfacePalette',
    source+'\nreturn Polished;')(class{},{},{WindowType:types},{},main,{display},eligible,materialStyle,MockFrost,
    {type_name_from_instance:actor=>actor.constructor.$gtype},clientSurfaceRoot,Widget,class{},(dark,alpha)=>dark+':'+alpha,comfortPolicy,materialValues,surfacePalette);
const extension=new Polished();extension._settings=memorySettings();initializeProfile(extension._settings);
extension._interface={get_string:()=> 'prefer-dark'};
const surface={opacity:240,effects:[],constructor:{$gtype:'MetaSurfaceContainerActorWayland'},
    add_effect(effect){this.effects.push(effect);},remove_effect(effect){this.effects=this.effects.filter(item=>item!==effect);}};
const decoration={opacity:255,constructor:{$gtype:'OtherExtensionDecoration'}};
const actor={effects:[],get_children:()=>[decoration,surface],insert_child_at_index(){},add_child(child){this.rim=child;},
    add_effect(effect){this.effects.push(effect);},remove_effect(effect){this.effects=this.effects.filter(item=>item!==effect);}};
const state={actor,window:win};
extension._update(actor,state);
assert(surface.opacity===230&&decoration.opacity===255,'Airy applies to the actual native client without app selection');
assert(state.rim.style.includes(surfacePalette(true).activeEdge), 'Focused windows get the shared active edge');
assert(state.rim===actor.rim&&!state.rim.effect&&!state.rim.properties.reactive, 'Visible window rim never captures or intercepts input');
assert(state.layer.position.join()==='5,5'&&state.layer.size.join()==='500,400','Frame/buffer/shadow bounds remain correct');
assert(state.effect.radii.join()==='12,12,12,12'&&state.effect.veil[3]===0.14,'Native-corner-safe backdrop and density are retained');
assert(!state.layer.properties.reactive&&!state.layer.properties.can_focus&&!state.layer.properties.track_hover,'Decorative material cannot intercept input');
assert(actor.effects.length===1&&state.effect.invalidations===1,'First capture has redraw/culling protection and explicit invalidation');
extension._update(actor,state);
assert(surface.opacity===230&&state.effect.invalidations===1&&state.layer.redraws===1,'Repeated refresh neither fades cumulatively nor recaptures a snapshot');
const focusedLayer=state.layer;
display.focus_window=null;extension._update(actor,state);
assert(state.layer===focusedLayer&&surface.opacity===235&&state.rim.style.includes(surfacePalette(true).inactiveEdge),
    'Losing focus quiets the edge and backdrop without replacing the cached layer');
display.focus_window=win;extension._update(actor,state);
assert(state.layer===focusedLayer&&surface.opacity===230&&state.rim.style.includes(surfacePalette(true).activeEdge),
    'Returning focus restores emphasis and clarity without cumulative fading');
extension._settings.set_boolean('enabled',false);extension._update(actor,state);
assert(state.rim===null,'Master off removes the foreground rim');
assert(state.layer===null&&surface.opacity===240&&actor.effects.length===0,'Master off restores opacity and removes all effects');
extension._settings.set_boolean('enabled',true);
for(const excluded of ['fullscreen','minimized','desktop','overview','lock']){
    fullscreen=excluded==='fullscreen';minimized=excluded==='minimized';windowType=excluded==='desktop'?10:0;
    main.overview.visible=excluded==='overview';main.sessionMode.isLocked=excluded==='lock';
    extension._update(actor,state);assert(!state.layer&&surface.opacity===240,'Exclusion remains: '+excluded);
}
fullscreen=false;minimized=false;windowType=0;main.overview.visible=false;main.sessionMode.isLocked=false;
extension._experience={state:{highContrast:true}};
extension._update(actor,state);assert(!state.layer,'System high contrast retains native UI');
extension._experience.state={onBattery:true,powerSaver:false};
const background={actor,window:{...win}};
extension._update(actor,background);
assert(background.effect&&surface.opacity===235,'Battery retains cached material on background windows');
assert(background.rim.style.includes(surfacePalette(true).inactiveEdge), 'Background windows get a quieter edge');
extension._clear(background);
extension._experience.state.powerSaver=true;
extension._update(actor,background);
assert(background.layer&&!background.effect&&surface.opacity===235&&actor.effects.length===0,'Power Saver retains background tint without capture/culling guard');
extension._clear(background);
extension._update(actor,state);assert(state.effect,'Focused window retains frost in Power Saver');extension._clear(state);
extension._experience.state={};
windowType=6;extension._update(actor,state);
assert(state.effect&&surface.opacity===238,'Dialogs remain enabled with stronger native-content opacity');extension._clear(state);
windowType=3;extension._update(actor,state);
assert(!state.layer&&state.popupEffect.nativeShape&&surface.opacity===240&&state.popupEffect.clientTintOpacity===0.88,
    'Separate app popups preserve their native silhouette and opaque text');extension._clear(state);
windowType=0;extension._settings.set_int('material-strength',0);extension._update(actor,state);
assert(surface.opacity===221,'Custom retains at least 92% client clarity');extension._clear(state);
extension._settings.set_int('material-strength',50);
let writes=0;extension._gtkMenus={apply:()=>writes++};extension._syncGtkMenus();extension._syncGtkMenus();
assert(writes===1,'Unchanged GTK material performs no repeated stylesheet IO');
extension._settings.set_int('material-strength',0);extension._syncGtkMenus();
assert(writes===2,'Derived density changes update matching GTK menus');
extension._syncGtkMenus(true);assert(writes===3,'Disable removes owned GTK styles');
let suspended=false,paused=false,shellScans=0;
extension._redrawGuard={setSuspended:value=>suspended=value,track(){},untrack(){}};
extension._shellSurfaces={refresh:()=>shellScans++,setMotionPaused:value=>paused=value};
extension._windows=new Map();extension._refresh(false);assert(shellScans===0,'Focus refresh avoids scanning the Shell tree');
extension._settings.set_int('material-strength',50);extension._update(actor,state);extension._windows.set(actor,state);
const layer=state.layer;
main.wm._workspaceAnimation._switchData={};extension._syncWorkspaceMotion();
extension._settings.set_int('material-strength',0);extension._update(actor,state);
assert(suspended&&paused&&state.layer===layer&&surface.opacity===230,'Workspace motion freezes materials and suspends broad redraw protection');
main.wm._workspaceAnimation._switchData=null;extension._syncWorkspaceMotion();extension._refresh();
assert(!suspended&&!paused&&state.layer===layer&&surface.opacity===221,'Motion completion applies deferred density without rebuilding the backdrop');
extension._clear(state);
assert(surface.opacity===240&&surface.effects.length===0&&actor.effects.length===0,'Final cleanup releases popup and window effects');
print('Unified window/popup lifecycle, cached focus, Power Saver, density, GTK IO and workspace checks passed');

// Exercise enable/disable wiring too: constructor argument changes must not
// silently pass a Settings object where the new surface permission callback goes.
class Events {
    constructor(){this.handlers=new Map();this.next=0;}
    connect(name,callback){this.handlers.set(++this.next,[name,callback]);return this.next;}
    disconnect(id){this.handlers.delete(id);}queue_redraw(){}
}
const stage=new Events(),wm=new Events(),bootDisplay=new Events(),overview=new Events(),session=new Events();
overview.visible=false;session.isLocked=false;
const iface=new Events();iface.get_string=()=> 'prefer-dark';
let gtkRemoved=false,buttonDestroyed=false;
class Button {
    constructor(){this.menu={addMenuItem(){},addAction(){},close(){}};}
    add_child(){}destroy(){buttonDestroyed=true;}
}
class Switch {connect(){return 1;}setToggleState(){}}
class Lifetime {destroy(){this.destroyed=true;}refresh(){}setMotionPaused(){}}
class Surfaces extends Lifetime {
    constructor(root,panel,isDark,permitted,guard,context){super();
        assert(typeof isDark==='function'&&typeof permitted==='function'&&context().windowOpacity===96,
            'Shell manager receives the derived context and new constructor arguments');}
}
class Overview extends Lifetime {
    constructor(layout,permitted,context){super();assert(typeof permitted==='function'&&context().overviewOpacity===26,'Overview constructor wiring');}
}
class Lock extends Lifetime {
    constructor(shield,permitted){super();assert(typeof permitted==='function','Lock constructor wiring');}
}
const bootMain={overview,sessionMode:session,wm:{_workspaceAnimation:{_switchData:null}},uiGroup:{},screenShield:{},
    layoutManager:{},panel:{addToStatusArea(){}}};
const Boot=new Function('Extension','Gio','St','Main','global','RedrawGuard','GtkMenuStyle','PanelMenu','PopupMenu',
    'Experience','ShellSurfaces','OverviewMaterial','LockMaterial','initializeProfile','comfortPolicy','materialValues',
    'FrostEffect','gtkMenuCss','configureMaterials','readDesktopStyle',source+'\nreturn Polished;')(
    class{getSettings(){const s=memorySettings();initializeProfile(s);return s;}},
    {Settings:class{constructor(){return iface;}}},{Icon:class{}},bootMain,
    {display:bootDisplay,window_manager:wm,stage,get_window_actors:()=>[]},
    class extends Lifetime{setSuspended(){}},class{apply(css){if(css===null)gtkRemoved=true;}},
    {Button},{PopupSwitchMenuItem:Switch},class extends Lifetime{state={highContrast:false};},
    Surfaces,Overview,Lock,initializeProfile,comfortPolicy,materialValues,MockFrost,(dark,alpha)=>dark+':'+alpha,configureMaterials,()=>({fontStyle:'',selection:'65,130,215'}));
const boot=new Boot();boot.enable();
const grabbed={};let refreshed=0,unrelated=0;
boot._windows.set({}, {window:grabbed,effect:{invalidateBackdrop(){refreshed++;}}});
boot._windows.set({}, {window:{},effect:{invalidateBackdrop(){unrelated++;}}});
for(const [, [name,callback]] of bootDisplay.handlers) if(name==='grab-op-begin')callback(bootDisplay,grabbed);
assert(MockFrost.interactive,'Interactive grabs freeze cached backdrops');
for(const [, [name,callback]] of bootDisplay.handlers) if(name==='grab-op-end')callback(bootDisplay,grabbed);
assert(!MockFrost.interactive&&refreshed===1&&unrelated===0,'Release refreshes only the grabbed window');
boot._windows.clear();boot.disable();
bootMain.extensionManager={lookup:()=>({state:1})};
let conflict=false;try{new Boot().enable();}catch(error){conflict=error.message.includes('Disable Prism');}
assert(conflict,'Prism conflict is rejected before materials or styles are changed');
assert(!MockFrost.interactive,'Disable clears the interactive freeze');
assert(buttonDestroyed&&gtkRemoved&&[stage,wm,bootDisplay,overview,session,iface].every(item=>item.handlers.size===0),
    'A complete enable/disable releases signal wiring, status button and GTK material');
print('Extension enable/disable and surface constructor wiring checks passed');
