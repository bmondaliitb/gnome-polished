import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import {framebufferCapture} from '../polished@local/frostGeometry.js';
import {FROST_DECLARATIONS,FROST_CODE} from '../polished@local/frostShader.js';
function assert(value,message){if(!value)throw new Error(message);}
const [,bytes]=GLib.file_get_contents('polished@local/frostEffect.js');
const source=new TextDecoder().decode(bytes).replace(/^import .*;\n/gm,'').replace('export const FrostEffect','const FrostEffect');
const uniforms=new Map();let copies=0,filters=0,queued=0,fallback=0,flagsSeen=-1;
const pipeline={get_uniform_location:name=>name,set_uniform_float:(name,n,count,values)=>{
    assert(values.length===n*count,'Uniform vector shape');uniforms.set(name,values);
},set_layer_texture(){},set_layer_combine(){},set_layer_filters(){},set_layer_wrap_mode(){},set_blend(){}};
class Parent {
    constructor(){this._init();}_init(){}
    get_actor(){return this._actor;}get_pipeline(){return pipeline;}
    get_texture(){return {get_width:()=>100,get_height:()=>80};}
    vfunc_paint(_node,_context,flags){flagsSeen=flags;}vfunc_paint_target(){}
    queue_repaint(){queued++;}
}
class Texture {constructor(w,h){this.w=w;this.h=h;}get_width(){return this.w;}get_height(){return this.h;}}
const types={Texture2D:{new_with_size:(_ctx,w,h)=>new Texture(w,h)},
    Offscreen:{new_with_texture:()=>({allocate(){}})},PipelineFilter:{LINEAR:0},PipelineWrapMode:{CLAMP_TO_EDGE:0}};
const Effect=new Function('Clutter','Cogl','GObject','Shell','FROST_DECLARATIONS','FROST_CODE','framebufferCapture','BlurBuffer','console',source+'\nreturn FrostEffect;')(
    {EffectPaintFlags:{ACTOR_DIRTY:1,BYPASS_EFFECT:2}},types,{registerClass:(_meta,cls)=>cls},{GLSLEffect:Parent},
    FROST_DECLARATIONS,FROST_CODE,framebufferCapture,class{render(texture){filters++;return texture;}},{error:()=>fallback++});
const effect=new Effect();
let width=100,height=80,scale=1,clone=false;
effect._actor={get_size:()=>[width,height],get_resource_scale:()=>1,get_paint_opacity:()=>255,is_in_clone_paint:()=>clone,
    continue_pick:()=>effect.picked=true};
const framebuffer={get_context(){},get_width:()=>1920,get_height:()=>1080,blit:()=>{copies++;return true;},
    get_modelview_matrix:()=>{const m=new Graphene.Matrix();m.init_translate(new Graphene.Point3D({x:10,y:20,z:0}));return m;},
    get_projection_matrix:()=>{const m=new Graphene.Matrix();m.init_ortho(0,1920/scale,1080/scale,0,-1,1);return m;},
    get_viewport_x:()=>0,get_viewport_y:()=>0,get_viewport_width:()=>1920,get_viewport_height:()=>1080};
const context={get_framebuffer:()=>framebuffer};
assert(effect._updateBackdrop(context),'Actual framebuffer matrices activate the backdrop without private StageView APIs');
effect.vfunc_paint_target(null,context);
assert(copies===1&&filters===1&&uniforms.get('polishedActive')[0]===1&&!fallback,'First capture/filter and shader activation');
const original=effect._texture;
for(let i=0;i<120;i++)effect.vfunc_paint(null,context,0);
assert(copies===1&&filters===1&&effect._texture===original&&flagsSeen===0,
    'Cached frost reuses GPU storage for every unchanged paint without forcing foreground redraw');
effect.invalidateBackdrop();effect.vfunc_paint(null,context,0);
assert(copies===2&&queued===1,'Explicit focus/menu/manual invalidation captures exactly once');
scale=2;effect._updateBackdrop(context);
assert(effect._capture.scale>1.99&&effect._capture.rect.width>=200,'Framebuffer matrices handle scale changes');
scale=1;width=101;height=81;effect._updateBackdrop(context);
assert(effect._texture.get_width()===effect._capture.rect.width&&effect._texture.get_width()<128,
    'Resize uses exact capture storage without padding outside repainted bounds');
const beforeMotion=copies;
Effect.setInteractiveMotion(true);
for(let i=0;i<120;i++) {
    width++;height++;
    effect.vfunc_paint(null,context,0);
}
assert(copies===beforeMotion,'Interactive resize reuses frost with no per-frame capture or filter');
Effect.setInteractiveMotion(false);
effect.invalidateBackdrop();effect.vfunc_paint(null,context,0);
assert(copies===beforeMotion+1&&effect._capture.rect.width>=width,
    'Release captures final geometry once');
const afterGrab=copies;
Effect.setWorkspaceMotion(true);
const invalidContext={get_framebuffer:()=>{throw Error('Clone matrices must not be read');}};
for(let i=0;i<60;i++)effect.vfunc_paint(null,invalidContext,0);
Effect.setWorkspaceMotion(false);
assert(copies===afterGrab,'Workspace animation performs no new captures');
clone=true;effect.vfunc_paint(null,invalidContext,0);clone=false;
assert(copies===afterGrab,'Other clone paints reuse the snapshot safely');
effect.vfunc_paint(null,context,2);effect.vfunc_paint_target(null,context);
assert(uniforms.get('polishedActive')[0]===0,'Native bypass disables the material pipeline for that paint');
effect._updateBackdrop(context);
for(let i=0;i<6;i++)effect._updateBackdrop({get_framebuffer:()=>({...framebuffer})});
assert(effect._sources.size===4,'Mixed/transient framebuffers have a bounded GPU storage cache');
const originalBlit=framebuffer.blit;framebuffer.blit=()=>false;
effect.invalidateBackdrop();assert(!effect._updateBackdrop(context),'Failed framebuffer copies safely fall back');
effect.vfunc_paint_target(null,context);assert(uniforms.get('polishedActive')[0]===0&&fallback===1,'Failure leaves native paint active and logs once');
framebuffer.blit=originalBlit;effect._updateBackdrop(context);
effect.nativeShape=true;effect.clientTintOpacity=0.74;effect.vfunc_paint_target(null,context);
assert(uniforms.get('polishedNativeShape')[0]===1&&uniforms.get('polishedNativeTintOpacity')[0]===0.74,
    'Popup alpha-shape and expanded fill opacity reach the shader');
effect.vfunc_pick({});assert(effect.picked,'Material picking always delegates to the native actor');

const [,blurBytes]=GLib.file_get_contents('polished@local/frostBlur.js');
const blurSource=new TextDecoder().decode(blurBytes).replace(/^import .*;\n/gm,'').replace(/export /g,'');
let draws=0,allocations=0;
const filterTypes={...types,Pipeline:{new:()=>({...pipeline,add_snippet(){}})},Snippet:{new:()=>({})},SnippetHook:{FRAGMENT:0},
    Offscreen:{new_with_texture:()=>({allocate(){allocations++;},set_viewport(){},orthographic(){},draw_textured_rectangle(){draws++;}})}};
const blur=new Function('Cogl',blurSource+'\nreturn {BlurBuffer,blurSize,BLUR_BUDGET,FILTER_DECLARATIONS,DOWNSAMPLE_CODE,BLUR_CODE};')(filterTypes);
for(const [w,h]of [[1920,1080],[3840,2160],[7680,4320],[1,1]]){
    const size=blur.blurSize(w,h,36);
    assert(size.width*size.height<=blur.BLUR_BUDGET.pixels&&size.factor>=8,'Single Eco budget remains bounded through 8K');
    assert(36/(2*size.factor)<=1,'Gaussian taps never skip reduced-image texels');
}
const buffer=new blur.BlurBuffer({}),input=new Texture(3840,2160);
const output=buffer.render(input,36),size=blur.blurSize(3840,2160,36);
assert(output.get_width()===size.width&&draws===7&&allocations===7,
    'Actual filter uses progressive 2x reduction followed by two 5-tap passes');
buffer.render(input,56);
assert(allocations===7&&draws===14,'Stable reduction levels reuse every intermediate target');
GLib.file_set_contents('/tmp/polished-frost-shader.json',JSON.stringify({declarations:FROST_DECLARATIONS,code:FROST_CODE,
    filterDeclarations:blur.FILTER_DECLARATIONS,downsample:blur.DOWNSAMPLE_CODE,blur:blur.BLUR_CODE}));
print('Cached-only capture, GPU storage, geometry/scale, clone safety, fallback, uniforms and bounded filtering checks passed');
