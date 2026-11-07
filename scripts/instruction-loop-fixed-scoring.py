"""Inspect a retained source subset and rerun a caller-pinned fixed calculator.
No extraction, candidate execution, models, authority or grading asset copying.
"""
import hashlib,importlib.util,importlib.abc,json,os,re,sys,tarfile
from pathlib import Path,PurePosixPath

def canonical(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
def digest(b):return 'sha256:'+hashlib.sha256(b).hexdigest()
def pairs(rows):
 d={}
 for k,v in rows:
  assert k not in d,'duplicate JSON key';d[k]=v
 return d
def read_json(b):return json.loads(b,object_pairs_hook=pairs)
def pinned(ref,maximum=16*1024*1024):
 p=Path(ref['path']);assert p.is_absolute() and p.resolve()==p and p.is_file() and not p.is_symlink()
 before=p.stat();assert 0<before.st_size<=maximum
 data=p.read_bytes();after=p.stat()
 assert (before.st_dev,before.st_ino,before.st_size,before.st_mtime_ns,before.st_ctime_ns)==(after.st_dev,after.st_ino,after.st_size,after.st_mtime_ns,after.st_ctime_ns)
 assert digest(data)==ref['digest'],'fixed scoring input drift'
 return data
def safe(name):
 assert isinstance(name,str) and name and '\\' not in name
 assert not PurePosixPath(name).is_absolute() and all(x not in {'','.','..'} for x in name.split('/')),'unsafe retained path'
 return name
def candidate_inventory(archive,expected):
 assert isinstance(expected,list) and 0<len(expected)<=4096
 selected={safe(f['path']):f for f in expected};assert len(selected)==len(expected)
 blocked={'.git','.codex','.aws','.ssh','.docker','.tmp','.runtime','node_modules','__pycache__','.agents','.claude'}
 assert all(not blocked.intersection(PurePosixPath(p).parts) for p in selected)
 result={};seen=set();prefix=None;expanded=0;count=0
 with tarfile.open(archive,'r|gz') as tar:
  for member in tar:
   count+=1;assert count<=100000,'retained capture entry limit'
   name=member.name
   while name.startswith('./'):name=name[2:]
   if member.isdir():name=name.rstrip('/')
   if name in {'','.'}:continue
   safe(name)
   if any(part.startswith('._') or part=='__MACOSX' for part in PurePosixPath(name).parts):continue
   if prefix is None:prefix='work/' if name=='work' or name.startswith('work/') else ''
   if prefix:
    if name=='work':continue
    assert name.startswith(prefix),'mixed archive roots';name=name[len(prefix):]
   safe(name);assert name not in seen,'duplicate retained path';seen.add(name)
   expanded+=member.size;assert expanded<=512*1024*1024,'retained capture expansion limit'
   if name not in selected:continue
   assert member.isfile(),'selected retained source is not regular'
   assert 0<=member.size<=64*1024*1024
   data=tar.extractfile(member).read(64*1024*1024+1);assert len(data)==member.size
   result[name]={'path':name,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'mode':'100755' if member.mode&0o111 else '100644'}
 assert len(result)==len(selected),'selected retained source missing'
 return [result[n] for n in sorted(result)]
def run(request):
 config=request['config'];refs=request['refs'];packet=read_json(pinned(refs['packet']));assessment=read_json(pinned(refs['assessment']));review=read_json(pinned(refs['independent_verification']));pinned(refs['review_document'])
 archive=request['archive'];pinned(archive,128*1024*1024)
 inv=candidate_inventory(archive['path'],packet['candidate_inventory'])
 assert inv==packet['candidate_inventory'],'retained source inventory differs from reviewed packet'
 actual=digest(canonical(inv));assert packet['candidate_digest']==actual==assessment['identity']['candidate_digest'],'assessment belongs to different retained source'
 assert not set(f['path'] for f in inv).intersection(request['public_paths']),'supplied public inputs cannot replace original grading authority'
 assert packet['task_id']==assessment['task_id']==refs['task_id']
 assert packet['assessment_public_input_digest']==assessment['identity']['public_input_digest']
 assert packet['policy_digest']==assessment['identity']['policy_digest']
 assert review['status'] in ['pass','pass_with_score_correction','pass_with_non_score_evidence_correction']
 assert review['assessment']==Path(refs['assessment']['path']).name
 assert review['assessment_sha256']==refs['assessment']['digest'].removeprefix('sha256:')
 assert review['review_sha256']==refs['review_document']['digest'].removeprefix('sha256:')
 calculator=config['calculator'];pinned(calculator)
 for pin in config['dependencies']:pinned(pin)
 class PinnedSourceLoader(importlib.abc.Loader):
  def __init__(self,ref):self.ref=ref
  def create_module(self,spec):return None
  def exec_module(self,module):
   module.__file__=self.ref['path']
   exec(compile(pinned(self.ref),self.ref['path'],'exec'),module.__dict__)
 modules={}
 for ref in config['dependencies']:
  if Path(ref['path']).suffix!='.py':continue
  name=ref.get('module',Path(ref['path']).stem)
  assert re.fullmatch(r'[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*',name),'invalid fixed dependency module'
  assert name not in modules,'duplicate fixed dependency module';modules[name]=ref
 class PinnedSourceFinder(importlib.abc.MetaPathFinder):
  def find_spec(self,fullname,path,target=None):
   if fullname in modules:return importlib.util.spec_from_loader(fullname,PinnedSourceLoader(modules[fullname]))
 sys.meta_path.insert(0,PinnedSourceFinder())
 spec=importlib.util.spec_from_loader('ask_fixed_reference_calculator',PinnedSourceLoader(calculator));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
 result=module.validate(assessment)
 assert canonical(result)==canonical(review['validation']),'fixed calculator and independent verification differ'
 pinned(calculator)
 for pin in config['dependencies']:pinned(pin)
 for key in ['packet','assessment','independent_verification','review_document']:pinned(refs[key])
 pinned(archive,128*1024*1024)
 return {'kind':'fixed_point_reference_result_v1','task_id':assessment['task_id'],'candidate_digest':actual,'source_inventory_digest':digest(canonical(inv)),
  'calculator_result':result,'items':[{k:item.get(k) for k in ['id','status','verification','known_defect']} for item in assessment['items']],
  'selected_source_files':len(inv),'capture_scope':'explicit_selected_regular_source_subset','capture_complete':False,'candidate_executed':False,'formal_admission':False,'evidence_truth_checked':False}
if __name__=='__main__':
 try:print(json.dumps(run(read_json(sys.stdin.buffer.read(4*1024*1024+1)))))
 except Exception as error:print(type(error).__name__+': '+str(error),file=sys.stderr);sys.exit(1)
