"""Compile and pixel-test the actual GLSL snippet on surfaceless Mesa GLES2."""
import ctypes as C
import json
import os
import statistics
import math
quality = 'cached'
factor, taps = 8, 5
small_size = 64 // factor
mid_size = small_size * 2
os.environ.setdefault('LIBGL_ALWAYS_SOFTWARE', '1')
os.environ.setdefault('EGL_PLATFORM', 'surfaceless')
E = C.CDLL('libEGL.so.1'); G = C.CDLL('libGLESv2.so.2')
def bind(lib, name, restype, *types):
    fn = getattr(lib, name); fn.restype = restype; fn.argtypes = types; return fn
P=C.c_void_p; I=C.c_int; U=C.c_uint; F=C.c_float
getdisplay=bind(E,'eglGetDisplay',P,P)
initialize=bind(E,'eglInitialize',U,P,C.POINTER(I),C.POINTER(I))
display=getdisplay(None); major=I();minor=I()
assert initialize(display,C.byref(major),C.byref(minor)), 'No surfaceless EGL display'
assert bind(E,'eglBindAPI',U,U)(0x30A0)
choose=bind(E,'eglChooseConfig',U,P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I))
attrs=(I*15)(0x3033,1,0x3040,4,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038,0,0)
config=P();num=I();assert choose(display,attrs,C.byref(config),1,C.byref(num)) and num.value
surf=bind(E,'eglCreatePbufferSurface',P,P,P,C.POINTER(I))(display,config,(I*5)(0x3057,64,0x3056,64,0x3038))
ctx=bind(E,'eglCreateContext',P,P,P,P,C.POINTER(I))(display,config,None,(I*3)(0x3098,2,0x3038))
assert ctx and surf and bind(E,'eglMakeCurrent',U,P,P,P,P)(display,surf,surf,ctx)
createShader=bind(G,'glCreateShader',U,U)
shaderSource=bind(G,'glShaderSource',None,U,I,C.POINTER(C.c_char_p),C.POINTER(I))
compileShader=bind(G,'glCompileShader',None,U)
getShader=bind(G,'glGetShaderiv',None,U,U,C.POINTER(I))
shaderLog=bind(G,'glGetShaderInfoLog',None,U,I,C.POINTER(I),C.c_char_p)
def shader(kind,text):
    ident=createShader(kind); encoded=C.c_char_p(text.encode()); shaderSource(ident,1,C.byref(encoded),None);compileShader(ident)
    ok=I();getShader(ident,0x8B81,C.byref(ok))
    if not ok.value:
        log=C.create_string_buffer(8192);shaderLog(ident,len(log),None,log);raise AssertionError(log.value.decode())
    return ident
with open('/tmp/polished-frost-shader.json') as stream: snippet=json.load(stream)
vertex=shader(0x8B31,'attribute vec2 position; varying vec2 cogl_tex_coord0_in; void main(){cogl_tex_coord0_in=(position+1.0)*0.5;gl_Position=vec4(position,0.0,1.0);}')
fragment=shader(0x8B30,'precision highp float; varying vec2 cogl_tex_coord0_in; uniform sampler2D cogl_sampler1; uniform vec4 sourceColor;'+snippet['declarations']+'void main(){vec4 cogl_color_out=sourceColor;'+snippet['code']+'gl_FragColor=cogl_color_out;}')
program=bind(G,'glCreateProgram',U)();attach=bind(G,'glAttachShader',None,U,U)
attach(program,vertex);attach(program,fragment);bind(G,'glLinkProgram',None,U)(program)
ok=I();bind(G,'glGetProgramiv',None,U,U,C.POINTER(I))(program,0x8B82,C.byref(ok));assert ok.value,'Program link failed'
bind(G,'glUseProgram',None,U)(program)
loc=bind(G,'glGetUniformLocation',I,U,C.c_char_p)
for name, values in {
 'polishedActive':[1], 'polishedSize':[64,64], 'polishedTexSize':[64,64], 'polishedPadding':[0,0],
 'polishedRadii':[12,12,12,12], 'polishedBasis':[64,0,0,64], 'polishedOrigin':[0,0], 'polishedBackdropSize':[64,64],
 'polishedRadius':[12], 'polishedScale':[1], 'polishedOpacity':[1], 'polishedBrightness':[1], 'polishedVeil':[0.1,0.11,0.14,0], 'polishedNativeShape':[0], 'polishedNativeTintOpacity':[1], 'sourceColor':[0,0,0,0],
}.items():
    bind(G,f'glUniform{len(values)}fv',None,I,I,C.POINTER(F))(loc(program,name.encode()),1,(F*len(values))(*values))
bind(G,'glUniform1i',None,I,I)(loc(program,b'cogl_sampler1'),0)
texture=U();bind(G,'glGenTextures',None,I,C.POINTER(U))(1,C.byref(texture))
bind(G,'glBindTexture',None,U,U)(0x0DE1,texture)
parameter=bind(G,'glTexParameteri',None,U,U,I)
for param,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:parameter(0x0DE1,param,value)
data=[]
for y in range(64):
 for x in range(64):
    gray=255 if (x//2+y//2)%2 else 0;data.extend([gray,gray,gray,255])
bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,64,64,0,0x1908,0x1401,(C.c_ubyte*len(data))(*data))
position=bind(G,'glGetAttribLocation',I,U,C.c_char_p)(program,b'position')
vertices=(F*8)(-1,-1,1,-1,-1,1,1,1)
bind(G,'glEnableVertexAttribArray',None,U)(position)
bind(G,'glVertexAttribPointer',None,U,I,U,U,I,P)(position,2,0x1406,0,0,vertices)
bind(G,'glViewport',None,I,I,I,I)(0,0,64,64)
draw=bind(G,'glDrawArrays',None,U,I,I); read=bind(G,'glReadPixels',None,I,I,I,I,U,U,P)
uniform1=bind(G,'glUniform1f',None,I,F)
# Exercise the actual reduced-resolution downsample + separable blur shaders,
# not just the final composite against a pre-blurred fixture.
use=bind(G,'glUseProgram',None,U)
bindTexture=bind(G,'glBindTexture',None,U,U)
viewport=bind(G,'glViewport',None,I,I,I,I)
bindFramebuffer=bind(G,'glBindFramebuffer',None,U,U)
set2=bind(G,'glUniform2f',None,I,F,F)
def filter_program(code):
 fragment=shader(0x8B30,'precision highp float; varying vec2 cogl_tex_coord0_in; uniform sampler2D cogl_sampler0;'+snippet['filterDeclarations']+'void main(){vec4 cogl_color_out=vec4(0.0);'+code+'gl_FragColor=cogl_color_out;}')
 result=bind(G,'glCreateProgram',U)();attach(result,vertex);attach(result,fragment)
 bind(G,'glBindAttribLocation',None,U,U,C.c_char_p)(result,position,b'position')
 bind(G,'glLinkProgram',None,U)(result)
 ok=I();bind(G,'glGetProgramiv',None,U,U,C.POINTER(I))(result,0x8B82,C.byref(ok));assert ok.value
 return result
filters=[filter_program(snippet['downsample']),filter_program(snippet['blur'])]
targets={}
def target(index,size):
 if (index,size) in targets: return targets[index,size]
 tex=U();bind(G,'glGenTextures',None,I,C.POINTER(U))(1,C.byref(tex));bindTexture(0x0DE1,tex)
 for param,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:parameter(0x0DE1,param,value)
 bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,size,size,0,0x1908,0x1401,None)
 fbo=U();bind(G,'glGenFramebuffers',None,I,C.POINTER(U))(1,C.byref(fbo));bindFramebuffer(0x8D40,fbo)
 bind(G,'glFramebufferTexture2D',None,U,U,U,U,I)(0x8D40,0x8CE0,0x0DE1,tex,0)
 assert bind(G,'glCheckFramebufferStatus',U,U)(0x8D40)==0x8CD5
 targets[index,size]=(tex,fbo,size)
 return targets[index,size]
def render(radius):
 input_texture=texture
 if radius>0:
  reduction=factor
  while reduction<radius/((taps-1)/2): reduction*=2
  stages=[]; current=2
  while current<=reduction:
   size=max(1,math.ceil(64/current)); stages.append((size,0,(0.25/size,0.25/size)));current*=2
  size=max(1,math.ceil(64/reduction))
  stages.extend([(size,1,(radius/((taps-1)*32),0)),(size,1,(0,radius/((taps-1)*32)))])
  for index,(size,filter_id,step) in enumerate(stages):
   tex,fbo,size=target(index,size); filter=filters[filter_id]
   use(filter);bindFramebuffer(0x8D40,fbo);viewport(0,0,size,size);bindTexture(0x0DE1,input_texture)
   set2(loc(filter,b'polishedStep'),*step);draw(5,0,4);input_texture=tex
 use(program);bindFramebuffer(0x8D40,0);viewport(0,0,64,64);bindTexture(0x0DE1,input_texture)
 uniform1(loc(program,b'polishedRadius'),radius); draw(5,0,4)
 pixels=(C.c_ubyte*(64*64*4))();read(0,0,64,64,0x1908,0x1401,pixels)
 return list(pixels)
sharp=render(0);frosted=render(12)
def spread(pixels):return statistics.pstdev(pixels[(y*64+x)*4] for y in range(16,48) for x in range(16,48))
assert frosted[3]==0,'Rounded corner must be transparent'
assert frosted[(32*64+32)*4+3]==255,'Surface center must remain filled'
assert spread(frosted)<spread(sharp)*0.4,(spread(frosted),spread(sharp))
set4=bind(G,'glUniform4fv',None,I,I,C.POINTER(F))
set4(loc(program,b'sourceColor'),1,(F*4)(1,1,1,1))
foreground=render(12)
assert foreground[(32*64+32)*4:(32*64+32)*4+4]==[255,255,255,255], 'Opaque foreground must remain sharp and opaque'
set4(loc(program,b'sourceColor'),1,(F*4)(0.3,0.3,0.3,0.5))
uniform1(loc(program,b'polishedOpacity'),0.5)
faded=render(12)
assert abs(faded[(32*64+32)*4+3]-128)<=1, 'Paint opacity must not be applied twice'
# A broad edge survives downsampling, so this also verifies both blur passes
# (the fine checkerboard alone could pass with downsampling and no blur).
set4(loc(program,b'sourceColor'),1,(F*4)(0,0,0,0))
uniform1(loc(program,b'polishedOpacity'),1)
for axis in [0,1]:
 edge=[]
 for y in range(64):
  for x in range(64):
   value=255 if (x if axis==0 else y)>=32 else 0
   edge.extend([value,value,value,255])
 bindTexture(0x0DE1,texture)
 bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,64,64,0,0x1908,0x1401,(C.c_ubyte*len(edge))(*edge))
 soft=render(12)
 x,y=(27,32) if axis==0 else (32,27)
 assert 10 < soft[(y*64+x)*4] < 120, 'Separable pass must soften a broad edge on each axis'
# Dense terminal-like glyph rows must lose their periodic horizontal structure.
rows=[]
for y in range(64):
 for x in range(64):
  value=240 if y%14<3 and x%7<5 else 20
  rows.extend([value,value,value,255])
bindTexture(0x0DE1,texture)
bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,64,64,0,0x1908,0x1401,(C.c_ubyte*len(rows))(*rows))
text_sharp=render(0); text_soft=render(24)
assert spread(text_soft)<spread(text_sharp)*0.25, (quality,spread(text_soft),spread(text_sharp))
set4(loc(program,b'polishedVeil'),1,(F*4)(0.1,0.11,0.14,0.5))
quiet=render(24)
assert spread(quiet)<spread(text_soft)*0.65+0.5, 'Detail reduction must further suppress backdrop contrast'
set4(loc(program,b'sourceColor'),1,(F*4)(1,1,1,1))
assert render(24)[(32*64+32)*4:(32*64+32)*4+4]==[255,255,255,255], 'Detail reduction must not alter opaque foreground text'
uniform1(loc(program,b'polishedNativeShape'),1)
uniform1(loc(program,b'polishedNativeTintOpacity'),0.8)
set4(loc(program,b'sourceColor'),1,(F*4)(0,0,0,0))
native_empty=render(24)
assert all(value==0 for value in native_empty), 'Native popup margins must stay completely transparent with no backdrop plate'
set4(loc(program,b'sourceColor'),1,(F*4)(0,0,0,0.1))
native_shadow=render(24)
assert abs(native_shadow[(32*64+32)*4+3]-26)<=1, 'Native low-alpha shadow must not fill with frost'
set4(loc(program,b'sourceColor'),1,(F*4)(0.17,0.17,0.17,0.85))
native_fill=render(24)
assert native_fill[(32*64+32)*4+3]==255, 'Translucent popup fill composites against blurred backdrop without leaking sharp text'
set4(loc(program,b'sourceColor'),1,(F*4)(1,1,1,1))
assert render(24)[(32*64+32)*4:(32*64+32)*4+4]==[255,255,255,255], 'Popup opacity keeps opaque labels and icons sharp'
# The expanded Custom range must also pass through the shader's old 75% floor.
bindTexture(0x0DE1,texture)
black=(C.c_ubyte*(64*64*4))(*([0,0,0,255]*(64*64)))
bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,64,64,0,0x1908,0x1401,black)
set4(loc(program,b'polishedVeil'),1,(F*4)(0,0,0,0))
set4(loc(program,b'sourceColor'),1,(F*4)(0.4,0.4,0.4,0.85))
uniform1(loc(program,b'polishedNativeTintOpacity'),0.70)
lower_fill=render(24)[(32*64+32)*4]
uniform1(loc(program,b'polishedNativeTintOpacity'),0.75)
upper_fill=render(24)[(32*64+32)*4]
assert upper_fill-lower_fill>=3, 'Custom popup translucency must not be silently clamped at 75%'
# Test the full normal-window composition, not just the backdrop shader. An
# opaque app faded over the material can hide nearly all of a correct blur.
with open('/tmp/polished-profile-default.json') as stream:
 profile=json.load(stream)
enable=bind(G,'glEnable',None,U); disable=bind(G,'glDisable',None,U)
blend=bind(G,'glBlendFunc',None,U,U)
def app_backdrop_contrast(opacity,detail):
 values=[]
 for background in [0,255]:
  use(program);bindTexture(0x0DE1,texture)
  solid=(C.c_ubyte*(64*64*4))(*([background,background,background,255]*(64*64)))
  bind(G,'glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x1908,64,64,0,0x1908,0x1401,solid)
  uniform1(loc(program,b'polishedNativeShape'),0)
  uniform1(loc(program,b'polishedActive'),1)
  uniform1(loc(program,b'polishedBrightness'),0.85)
  set4(loc(program,b'polishedVeil'),1,(F*4)(0.1,0.11,0.14,detail))
  tint=profile['tint']
  set4(loc(program,b'sourceColor'),1,(F*4)(25/255*tint,28/255*tint,35/255*tint,tint))
  render(36)
  # The original opaque app client is composited over the frosted layer at
  # the exact opacity selected by the real profile.
  uniform1(loc(program,b'polishedActive'),0)
  set4(loc(program,b'sourceColor'),1,(F*4)(0.12*opacity,0.12*opacity,0.12*opacity,opacity))
  enable(0x0BE2);blend(1,0x0303);draw(5,0,4);disable(0x0BE2)
  pixels=(C.c_ubyte*(64*64*4))();read(0,0,64,64,0x1908,0x1401,pixels)
  values.append(pixels[(32*64+32)*4])
 return values[1]-values[0]
old_contrast=app_backdrop_contrast(0.92,0.35)
new_contrast=app_backdrop_contrast(profile['opacity'],profile['detail'])
assert new_contrast>old_contrast*1.8 and new_contrast>=15, (old_contrast,new_contrast)
print(f'{quality} opaque-app composite: backdrop contrast {old_contrast} -> {new_contrast} levels')
contrasts={name:app_backdrop_contrast(values['opacity'],values['detail'])
           for name,values in profile['profiles'].items()}
order=['subtle','balanced','airy','mist']
assert all(contrasts[second]>contrasts[first] for first,second in zip(order,order[1:])), contrasts
print(f'{quality} coordinated presets, backdrop contrast: {contrasts}')
assert bind(G,'glGetError',U)()==0,'GL error'
print(f'Actual {quality} GLSL pixel test passed: detail deviation {spread(sharp):.1f} -> {spread(frosted):.1f}; transparent corners, opaque center')
bind(E,'eglMakeCurrent',U,P,P,P,P)(display,None,None,None)
bind(E,'eglDestroyContext',U,P,P)(display,ctx);bind(E,'eglDestroySurface',U,P,P)(display,surf);bind(E,'eglTerminate',U,P)(display)
