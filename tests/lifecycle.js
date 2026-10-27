import GLib from 'gi://GLib';
import {memorySettings} from './settings.js';
import {initializeProfile,materialValues} from '../polished@local/simpleProfile.js';
import {clientSurfaceRoot} from '../polished@local/windowSurface.js';
import {eligible,materialStyle,configureMaterials,surfacePalette} from '../polished@local/materials.js';
import {comfortPolicy} from '../polished@local/experience.js';
import {WorkspaceResume} from '../polished@local/workspaceResume.js';
function assert(value,message){if(!value)throw new Error(message);}
const [,bytes]=GLib.file_get_contents('polished@local/extension.js');
const source='const ExtensionState={ACTIVE:1,ACTIVATING:8};\n'+new TextDecoder().decode(bytes).replace(/^import .*;\n/gm,'').replace('export default class Polished','class Polished');
class Widget {
    constructor(properties){this.properties=properties;this.redraws=0;}
    add_effect(effect){this.effect=effect;}
    set_position(x,y){this.position=[x,y];this.positionWrites=(this.positionWrites??0)+1;} set_size(w,h){this.size=[w,h];this.sizeWrites=(this.sizeWrites??0)+1;}
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
const resumeTasks=new Map();let resumeTaskId=0;
const resumeLoop={PRIORITY_LOW:300,SOURCE_REMOVE:false,
    idle_add:(_priority,callback)=>{resumeTasks.set(++resumeTaskId,callback);return resumeTaskId;},source_remove:id=>resumeTasks.delete(id)};
const workspaceStage={handlers:new Map(),next:0,
    connect(name,callback){this.handlers.set(++this.next,[name,callback]);return this.next;},
    disconnect(id){this.handlers.delete(id);},
    emit(name){for(const [signal,callback]of [...this.handlers.values()])if(name===signal)callback();}};
function resumeAfterFrame(){workspaceStage.emit('after-paint');for(const [id,callback]of [...resumeTasks]){resumeTasks.delete(id);callback();}}
const main={overview:{visible:false},sessionMode:{isLocked:false},wm:{_workspaceAnimation:{_switchData:null}}};
const Polished=new Function('Extension','Gio','Meta','St','Main','global','eligible','materialStyle','FrostEffect',
    'GObject','clientSurfaceRoot','VisualBackdrop','BackdropRefreshEffect','gtkMenuCss','comfortPolicy','materialValues','surfacePalette',
    source+'\nreturn Polished;')(class{},{},{WindowType:types},{},main,{display},eligible,materialStyle,MockFrost,
    {type_name_from_instance:actor=>actor.constructor.$gtype},clientSurfaceRoot,Widget,class{},(dark,alpha)=>dark+':'+alpha,comfortPolicy,materialValues,surfacePalette);
const extension=new Polished();extension._settings=memorySettings();initializeProfile(extension._settings);
extension._settings.set_boolean('smooth-performance',false);
extension._motionSignal=1; // Isolated window tests simulate the glass observer.
extension._workspaceDirtyWindows=new Set();
extension._workspaceResume=new WorkspaceResume(workspaceStage,()=>extension._finishWorkspaceMotion(),resumeLoop);
extension._interface={get_string:()=> 'prefer-dark'};
extension._redrawGuard={track:(_actor,on,_effect,protect)=>protect?.(on),untrack(){}};
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
assert(!background.effect&&!background.layer&&surface.opacity===240,'Battery keeps app windows native and removes full-window glass');
assert(background.rim.style.includes(surfacePalette(true).inactiveEdge), 'Background windows get a quieter edge');
extension._clear(background);
extension._experience.state.powerSaver=true;
extension._update(actor,background);
assert(!background.layer&&!background.effect&&surface.opacity===240&&actor.effects.length===0,'Power Saver avoids full-window effects and fading');
extension._clear(background);
extension._update(actor,state);assert(!state.effect&&surface.opacity===240,'Power Saver also removes focused-window glass by default');extension._clear(state);
extension._settings.set_boolean('battery-window-glass',true);extension._update(actor,state);
assert(state.effect,'Battery app-window glass can be enabled independently');extension._clear(state);
extension._settings.set_boolean('battery-window-glass',false);
windowType=3;extension._update(actor,state);
assert(state.popupEffect&&surface.opacity===240,'Battery still preserves native-shaped glass menus by default');extension._clear(state);
extension._settings.set_boolean('battery-menu-glass',false);extension._update(actor,state);
assert(!state.popupEffect&&surface.opacity===240,'Battery menu glass can also be turned off');extension._clear(state);
extension._settings.set_boolean('battery-menu-glass',true);windowType=0;
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
extension._redrawGuard={setSuspended:value=>suspended=value,track:(_actor,on,_effect,protect)=>protect?.(on),untrack(){}};
extension._shellSurfaces={refresh:()=>shellScans++,setMotionPaused:value=>paused=value};
extension._windows=new Map();extension._refresh(false);assert(shellScans===0,'Focus refresh avoids scanning the Shell tree');
extension._settings.set_int('material-strength',50);extension._update(actor,state);extension._windows.set(actor,state);
const layer=state.layer;
main.wm._workspaceAnimation._switchData={};extension._syncWorkspaceMotion();
extension._settings.set_int('material-strength',0);extension._update(actor,state);
assert(suspended&&paused&&state.layer===layer&&surface.opacity===230,'Workspace motion freezes materials and suspends broad redraw protection');
const scansBeforeFinish=shellScans;
main.wm._workspaceAnimation._switchData=null;extension._syncWorkspaceMotion();
assert(suspended&&paused&&extension._workspaceSettling&&surface.opacity===230&&shellScans===scansBeforeFinish,
    'The finishing frame keeps the cached material and performs no Shell refresh');
resumeAfterFrame();
assert(!suspended&&!paused&&state.layer===layer&&surface.opacity===221&&shellScans===scansBeforeFinish,
    'Deferred geometry/material changes apply after a painted frame without a whole-Shell refresh');
let boundaryUpdates=0;const updateAtBoundary=extension._update;
extension._update=(...args)=>{boundaryUpdates++;updateAtBoundary.apply(extension,args);};
main.wm._workspaceAnimation._switchData={};extension._syncWorkspaceMotion();display.focus_window=null;
main.wm._workspaceAnimation._switchData=null;extension._syncWorkspaceMotion();
workspaceStage.emit('after-paint');
main.wm._workspaceAnimation._switchData={};extension._syncWorkspaceMotion();
assert(resumeTasks.size===0&&suspended&&boundaryUpdates===0,'A chained switch cancels queued work before any focus/material update');
main.wm._workspaceAnimation._switchData=null;extension._syncWorkspaceMotion();resumeAfterFrame();
assert(boundaryUpdates===1&&shellScans===scansBeforeFinish,'A normal completed switch updates only the affected focus family');
extension._update=updateAtBoundary;display.focus_window=win;
main.wm._workspaceAnimation._switchData={};extension._syncWorkspaceMotion();extension._refresh();
assert(extension._workspaceFullRefresh&&shellScans===scansBeforeFinish,'Explicit appearance changes are deferred during animation');
main.wm._workspaceAnimation._switchData=null;extension._syncWorkspaceMotion();resumeAfterFrame();
assert(shellScans===scansBeforeFinish+1&&!extension._workspaceFullRefresh&&extension._workspaceDirtyWindows.size===0,
    'A real deferred appearance change still refreshes every material exactly once after the settled frame');
extension._clear(state);
assert(surface.opacity===240&&surface.effects.length===0&&actor.effects.length===0,'Final cleanup releases popup and window effects');
// Switch live between glass and smooth rendering, including existing popups.
extension._settings.set_int('material-strength',50);
extension._update(actor,state);
const glassRim=state.rim, glassLayer=state.layer;
extension._settings.set_boolean('smooth-performance',true);
extension._update(actor,state);
assert(!state.layer&&!state.effect&&!state.refreshEffect&&actor.effects.length===0&&surface.opacity===240,
    'Smooth mode restores original native opacity and removes window backdrop/culling effects');
assert(glassLayer.destroyed&&state.rim===glassRim&&!glassRim.destroyed,
    'Switching to smooth mode keeps the existing lightweight focus rim');
extension._update(actor,state);
assert(state.rim===glassRim&&surface.opacity===240,'Smooth refresh reuses the rim without fading the client');
display.focus_window=null;extension._update(actor,state);
assert(state.rim===glassRim&&state.rim.style.includes(surfacePalette(true).inactiveEdge),
    'Smooth mode keeps quiet focus feedback with original client opacity');
display.focus_window=win;
windowType=3;extension._settings.set_boolean('smooth-performance',false);extension._update(actor,state);
assert(state.popupEffect&&surface.effects.length===1,'Glass popup is active before a live mode change');
extension._settings.set_boolean('smooth-performance',true);extension._update(actor,state);
assert(!state.rim&&!state.popupEffect&&surface.effects.length===0&&surface.opacity===240,
    'Smooth native popups keep their original silhouette, opacity and effect chain');
windowType=0;extension._update(actor,state);
extension._syncGtkMenus();assert(extension._gtkCss==='true:94','Smooth GTK menus use a readable dense fill');
extension._settings.set_boolean('smooth-performance',false);extension._update(actor,state);
assert(state.effect&&state.refreshEffect&&surface.opacity===230,'Glass mode can be restored live');
extension._clear(state);
extension._settings.set_boolean('smooth-performance',true);extension._update(actor,state);
const steadyRim=state.rim,geometryWrites=steadyRim.positionWrites+steadyRim.sizeWrites;
main.overview.visible=true;extension._update(actor,state);
main.overview.visible=false;extension._update(actor,state);
assert(state.rim===steadyRim&&!steadyRim.destroyed&&steadyRim.positionWrites+steadyRim.sizeWrites===geometryWrites,
    'Smooth overview transitions retain window rims without recreation or geometry writes');
let focusUpdates=0;
const originalUpdate=extension._update;
extension._windows=new Map([[actor,state],[{}, {window:{get_transient_for:()=>null},cachedFocus:false}]]);
extension._update=(...args)=>{focusUpdates++;originalUpdate.apply(extension,args);};
extension._refreshFocus();assert(focusUpdates===0,'Unchanged focus does not refresh any window');
display.focus_window=null;extension._refreshFocus();
assert(focusUpdates===1&&state.rim===steadyRim,'Focus loss updates just the old focus family');
extension._refreshFocus();assert(focusUpdates===1,'Repeated focus notifications do not repeat rendering work');
display.focus_window=win;extension._refreshFocus();assert(focusUpdates===2,'Focus return updates just the new focus family');
extension._update=originalUpdate;extension._windows.clear();
extension._settings.set_boolean('reduce-transparency',true);extension._update(actor,state);
assert(!state.rim&&surface.opacity===240,'Reduce transparency still restores the native appearance in smooth mode');
extension._settings.set_boolean('reduce-transparency',false);
print('Unified window/popup lifecycle, cached focus, Power Saver, density, GTK IO and workspace checks passed');

// Exercise enable/disable wiring too: constructor argument changes must not
// silently pass a Settings object where the new surface permission callback goes.
class Events {
    constructor(){this.handlers=new Map();this.next=0;}
    connect(name,callback){this.handlers.set(++this.next,[name,callback]);return this.next;}
    disconnect(id){this.handlers.delete(id);}queue_redraw(){}
    emit(name){for(const [signal,callback]of [...this.handlers.values()])if(name===signal)callback();}
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
        assert(typeof isDark==='function'&&typeof permitted==='function'&&context().windowOpacity===96&&context().smoothPerformance,
            'Shell manager receives the derived context and new constructor arguments');}
}
class Overview extends Lifetime {
    constructor(layout,permitted,context){super();assert(typeof permitted==='function'&&context().overviewOpacity===26,'Overview constructor wiring');}
}
class Lock extends Lifetime {
    constructor(shield,permitted){super();assert(typeof permitted==='function','Lock constructor wiring');}
}
const bindings=new Map();let layoutCalls=0;
const bootMain={overview,sessionMode:session,wm:{_workspaceAnimation:{_switchData:null}},uiGroup:{},screenShield:{},
    layoutManager:{},panel:{addToStatusArea(){}}};
bootMain.wm.addKeybinding=(name,_settings,_flags,mode,callback)=>{assert(mode===1,'Layouts only run in normal desktop mode');bindings.set(name,callback);};
bootMain.wm.removeKeybinding=name=>bindings.delete(name);
const Boot=new Function('Extension','Gio','St','Main','global','RedrawGuard','GtkMenuStyle','PanelMenu','PopupMenu',
    'Experience','ShellSurfaces','OverviewMaterial','LockMaterial','initializeProfile','comfortPolicy','materialValues',
    'FrostEffect','gtkMenuCss','configureMaterials','readDesktopStyle','Meta','Shell','arrangeWindow','WorkspaceResume',source+'\nreturn Polished;')(
    class{getSettings(){const s=memorySettings();initializeProfile(s);s.set_boolean('smooth-performance',true);return s;}},
    {Settings:class{constructor(){return iface;}}},{Icon:class{}},bootMain,
    {display:bootDisplay,window_manager:wm,stage,get_window_actors:()=>[]},
    class extends Lifetime{setSuspended(){}},class{apply(css){if(css===null)gtkRemoved=true;}},
    {Button},{PopupSwitchMenuItem:Switch},class extends Lifetime{state={highContrast:false};},
    Surfaces,Overview,Lock,initializeProfile,comfortPolicy,materialValues,MockFrost,(dark,alpha)=>dark+':'+alpha,configureMaterials,()=>({fontStyle:'',selection:'65,130,215'}),
    {WindowType:types,KeyBindingFlags:{NONE:0}},{ActionMode:{NORMAL:1}},()=>layoutCalls++,
    class extends WorkspaceResume{constructor(stage,resume){super(stage,resume,resumeLoop);}});
const boot=new Boot();boot.enable();
assert([...stage.handlers.values()].every(([name])=>name!=='before-paint'),
    'Smooth mode registers no per-frame motion callback');
assert(bindings.size===2&&!boot._button.visible,'Layout shortcuts are registered and the optional panel icon starts hidden');
boot._settings.set_boolean('show-panel-indicator',true);
assert(boot._button.visible,'The panel menu can be shown from preferences');
bindings.get('polished-center-window')();assert(layoutCalls===1,'Shortcut invokes explicit window arrangement');
session.isLocked=true;boot._refresh();bindings.get('polished-center-window')();
assert(!boot._button.visible&&layoutCalls===1,'Lock hides the menu and prevents window arrangement');
session.isLocked=false;
boot._settings.set_boolean('enabled',false);bindings.get('polished-comfortable-window')();
assert(layoutCalls===1,'Master off prevents window arrangement');
boot._settings.set_boolean('enabled',true);
boot._settings.set_boolean('smooth-performance',false);
assert([...stage.handlers.values()].filter(([name])=>name==='before-paint').length===1,
    'Glass mode registers exactly one workspace motion observer');
const savedDensity=boot._settings.get_int('material-strength');
boot._experience.state.onBattery=true;boot._syncMotionTracking();boot._refresh();
assert(!boot._context().windowGlass&&boot._context().menuGlass&&!boot._context().dockGlass&&!boot._context().overviewGlass&&
    [...stage.handlers.values()].every(([name])=>name!=='before-paint'),
    'Unplugging uses the battery effect policy and removes the workspace observer');
boot._settings.set_boolean('battery-dock-glass',true);
assert(boot._context().dockGlass&&[...stage.handlers.values()].filter(([name])=>name==='before-paint').length===1,
    'Enabling battery dock glass restores the required observer');
boot._settings.set_boolean('battery-dock-glass',false);
boot._experience.state.onBattery=false;boot._syncMotionTracking();boot._refresh();
assert(boot._context().windowGlass&&boot._context().dockGlass&&boot._context().overviewGlass&&
    boot._settings.get_int('material-strength')===savedDensity&&[...stage.handlers.values()].filter(([name])=>name==='before-paint').length===1,
    'Reconnecting AC restores full glass and the observer without changing density');
boot._settings.set_boolean('smooth-performance',true);
assert([...stage.handlers.values()].every(([name])=>name!=='before-paint'),
    'Returning to smooth mode removes the per-frame observer');
const grabbed={};let refreshed=0,unrelated=0;
boot._windows.set({}, {window:grabbed,effect:{invalidateBackdrop(){refreshed++;}}});
boot._windows.set({}, {window:{},effect:{invalidateBackdrop(){unrelated++;}}});
for(const [, [name,callback]] of bootDisplay.handlers) if(name==='grab-op-begin')callback(bootDisplay,grabbed);
assert(MockFrost.interactive,'Interactive grabs freeze cached backdrops');
for(const [, [name,callback]] of bootDisplay.handlers) if(name==='grab-op-end')callback(bootDisplay,grabbed);
assert(!MockFrost.interactive&&refreshed===1&&unrelated===0,'Release refreshes only the grabbed window');
boot._windows.clear();boot._settings.set_boolean('smooth-performance',false);
bootMain.wm._workspaceAnimation._switchData={};stage.emit('before-paint');
bootMain.wm._workspaceAnimation._switchData=null;stage.emit('before-paint');stage.emit('after-paint');
assert(resumeTasks.size===1,'A workspace resume is queued before disable');
boot.disable();assert(resumeTasks.size===0,'Disable cancels all queued workspace work');
bootMain.extensionManager={lookup:()=>({state:1})};
let conflict=false;try{new Boot().enable();}catch(error){conflict=error.message.includes('Disable Prism');}
assert(conflict,'Prism conflict is rejected before materials or styles are changed');
assert(!MockFrost.interactive,'Disable clears the interactive freeze');
assert(bindings.size===0&&buttonDestroyed&&gtkRemoved&&[stage,wm,bootDisplay,overview,session,iface].every(item=>item.handlers.size===0),
    'A complete enable/disable releases signal wiring, status button and GTK material');
print('Extension enable/disable and surface constructor wiring checks passed');
