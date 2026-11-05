/** Fixed CPython foreground runner. Unsupported dependencies do not earn a reuse attestation. */
export function sciencePythonBootstrap(script:string,declared:readonly string[],marker:string):string{return `
import sys,runpy,traceback,os,time,threading,atexit
if sys.implementation.name!='cpython':raise RuntimeError('受控复用仅支持已核验的 CPython，其他解释器请使用普通执行')
sys.dont_write_bytecode=True
_root=os.path.realpath(os.getcwd())
_allowed={os.path.realpath(os.path.join(_root,p)) for p in ${JSON.stringify(declared)}}
_trusted=tuple(os.path.realpath(p) for p in sys.path if p)
_dependencies=True
_code=0
def _inside(path,root):
 return path==root or path.startswith(root+os.sep)
_checking=False
_in_script=False
def _record(p,writing=False,metadata=False):
 global _dependencies,_checking
 if _checking:return
 _checking=True
 try:
  if not isinstance(p,(str,bytes,os.PathLike)):
   if p not in (0,1,2):_dependencies=False
   return
  p=os.path.realpath(os.fsdecode(p))
  trusted=not _inside(p,_root) and any(_inside(p,r) for r in _trusted)
  if metadata and _in_script and not trusted:_dependencies=False
  if p not in _allowed and not (trusted and not writing):_dependencies=False
 finally:_checking=False
def _audit(event,args):
 global _dependencies,_in_script
 if event=='exec' and getattr(args[0],'co_filename',None)==${JSON.stringify(script)}:_in_script=True
 if event in ('subprocess.Popen','os.system','os.fork','os.forkpty','os.posix_spawn','pty.spawn','os.exec','os.spawn','os.startfile','os.startfile/2'):
  _dependencies=False
  raise RuntimeError('受控同步科研执行不允许创建子进程或替换解释器；请交还主会话选择普通执行，不签发复用证明')
 if event.startswith('socket.') or event in ('ctypes.dlopen','ctypes.dlsym'):_dependencies=False
 if event=='open':
  flags=args[2] if len(args)>2 and isinstance(args[2],int) else 0
  _record(args[0],bool(flags & (os.O_WRONLY|os.O_RDWR|os.O_CREAT|os.O_TRUNC|os.O_APPEND)))
 if event in ('os.listdir','os.scandir'):_record(args[0] if args[0] is not None else '.',metadata=True)
 elif event.startswith('os.') or event.startswith('shutil.'):_dependencies=False
# These standard APIs do not emit an open audit event (exists/is_file delegate to stat).
# Patch the platform module too; normalization uses the saved implementation under _checking.
class _Metadata:
 # A callable object has no function descriptor: pathlib stores os.open/stat on
 # accessor classes on Python 3.9, where a Python function would bind an extra self.
 def __init__(self,fn,metadata):self._fn=fn;self._metadata=metadata
 def __call__(self,path='.',*args,**kwargs):
  global _dependencies
  if kwargs.get('dir_fd') is not None:_dependencies=False
  _record(path,metadata=self._metadata)
  return self._fn(path,*args,**kwargs)
_backend=__import__(os.name)
for _name in ('stat','lstat','access','readlink','listdir','scandir','open','fstat','fstatvfs','statvfs'):
 _original=getattr(os,_name,None)
 if _original is not None:
  _wrapped=_Metadata(_original,_name!='open')
  setattr(os,_name,_wrapped)
  if getattr(_backend,_name,None) is _original:setattr(_backend,_name,_wrapped)
sys.addaudithook(_audit)
try:
 runpy.run_path(${JSON.stringify(script)},run_name='__main__')
except SystemExit as e:
 _code=e.code if isinstance(e.code,int) else (0 if e.code is None else 1)
except BaseException:
 traceback.print_exc();_code=1
# Match normal CPython ordering: finish non-daemon threads, then exit callbacks.
try:
 threading._shutdown()
 atexit._run_exitfuncs()
except BaseException:
 traceback.print_exc();_code=1
sys.stdout.flush();sys.stderr.flush()
os.write(1,(${JSON.stringify('\n'+marker)}+str(_code)+':'+('1' if _dependencies else '0')+'\\n').encode())
time.sleep(3600)
`}
