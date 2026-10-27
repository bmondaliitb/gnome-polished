import {WorkspaceResume} from '../polished@local/workspaceResume.js';
function assert(value,message){if(!value)throw new Error(message);}
const callbacks=new Map();let id=0,priority=null,resumes=0;
const loop={PRIORITY_LOW:300,SOURCE_REMOVE:false,
    idle_add:(p,callback)=>{priority=p;callbacks.set(++id,callback);return id;},
    source_remove:key=>callbacks.delete(key)};
const stage={handlers:new Map(),next:0,
    connect(name,callback){assert(name==='after-paint','Resume waits for a painted frame');this.handlers.set(++this.next,callback);return this.next;},
    disconnect(key){this.handlers.delete(key);},
    paint(){for(const callback of [...this.handlers.values()])callback();}};
function flush(){for(const [key,callback]of [...callbacks]){callbacks.delete(key);callback();}}
const resume=new WorkspaceResume(stage,()=>resumes++,loop);
resume.schedule();resume.schedule();
assert(stage.handlers.size===1&&callbacks.size===0&&resumes===0,'Repeated requests coalesce without running in the finishing frame');
stage.paint();assert(stage.handlers.size===0&&callbacks.size===1&&resumes===0&&priority===300,
    'The settled frame completes before one low-priority follow-up is queued');
flush();assert(resumes===1&&callbacks.size===0,'Follow-up executes once');
resume.schedule();resume.cancel();stage.paint();flush();
assert(resumes===1&&stage.handlers.size===0,'A new switch or disable cancels the frame listener');
resume.schedule();stage.paint();resume.cancel();flush();
assert(resumes===1&&callbacks.size===0,'A new switch or disable also cancels an already queued task');
print('Workspace finishing-frame deferral, coalescing and cancellation passed');
