"""Rebase prepared inputs around the existing runner/control; never launch a model."""
import ast,copy,hashlib,json,os,stat,sys
from pathlib import Path
def sha(p):return 'sha256:'+hashlib.sha256(p.read_bytes()).hexdigest()
def read(p):return json.loads(Path(p).read_text())
def put(p,v):
    with p.open('x') as f:json.dump(v,f,indent=2);f.write('\n');f.flush();os.fsync(f.fileno())
def inv(root):
    assert not any(p.is_symlink() for p in root.rglob('*'))
    return [dict(path=p.relative_to(root).as_posix(),bytes=p.stat().st_size,mode=p.stat().st_mode&511,sha256=sha(p)) for p in sorted(root.rglob('*')) if p.is_file()]
def toml(v):
    if isinstance(v,dict):return '{'+','.join(json.dumps(k)+'='+toml(x) for k,x in v.items())+'}'
    return ('true' if v else 'false') if isinstance(v,bool) else json.dumps(v)
def clone(source,target,digest):
    assert not source.is_symlink() and sha(source)==digest
    target.parent.mkdir(parents=True,exist_ok=True)
    with target.open('xb') as f:f.write(source.read_bytes())
    target.chmod(source.stat().st_mode&511)
def clone_bound_public(pin,target,entry):
    source=Path(pin['source']);assert source.is_absolute() and source.resolve()==source
    fd=os.open(source,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    try:
      before=os.fstat(fd);assert stat.S_ISREG(before.st_mode) and before.st_size==entry['bytes'] and before.st_size<=16*1024*1024
      with os.fdopen(fd,'rb',closefd=False) as stream:data=stream.read(16*1024*1024+1)
      after=os.fstat(fd);current=source.stat(follow_symlinks=False)
      for key in ['st_dev','st_ino','st_size','st_mode','st_mtime_ns','st_ctime_ns']:
        assert getattr(before,key)==getattr(after,key)==getattr(current,key),'public source changed during copy'
      assert source.resolve()==source and len(data)==entry['bytes']
      assert 'sha256:'+hashlib.sha256(data).hexdigest()==entry['sha256']==pin['digest']
      target.parent.mkdir(parents=True,exist_ok=True)
      with target.open('xb') as out:out.write(data)
      target.chmod(entry['mode'])
    finally:os.close(fd)
def compatible_native_host_root(native_root,template_config):
    n=Path(native_root);template=Path(template_config).parent
    return len(n.parents)>=3 and len(template.parents)>=3 and n.parents[2]==template.parents[2]
def prepare(request):
    import tomllib
    os.umask(0o077);p=request['profile'];selection=request['selection'];candidate=request['candidate'];policy=request['policy']
    assert sha(Path(p['templateConfig']))==p['templateConfigDigest'];base=read(p['templateConfig'])
    old=base['rows'][0];template=Path(old['wrapper']).read_text();assert sha(Path(old['wrapper']))==p['wrapperDigest']
    nodes={x.targets[0].id:x for x in ast.parse(template).body if isinstance(x,ast.Assign)}
    values={k:ast.literal_eval(nodes[k].value) for k in ['EXPECTED','OVERRIDES','TARGET']}
    oldwork=old['work_root'];oldprofile=next(iter(tomllib.loads(next(v for v in values['OVERRIDES'] if v.startswith('permissions.')))['permissions']))
    oldbody=tomllib.loads(next(v for v in values['OVERRIDES'] if v.startswith('permissions.')))['permissions'][oldprofile]
    assert oldbody['filesystem'].get(p['protectedRoot'])=='deny','operator root is not protected by the existing profile'
    n=Path(p['root']);population=Path(p['workRoot'])
    # The unchanged legacy control derives its monitor placeholders from this
    # host-root depth. Refuse a profile that could retain a different workspace.
    assert compatible_native_host_root(n,p['templateConfig']), 'native root must preserve the existing control host-root depth'
    assert n.is_absolute() and population.is_absolute() and n.resolve()==n and population.resolve()==population, 'native preparation roots must be canonical and non-symlink'
    n.mkdir(parents=True,exist_ok=False);population.mkdir(parents=True,exist_ok=False)
    (n/'wrappers').mkdir()
    templates={'baseline':Path(p['baselineFullRoot']),'candidate':Path(candidate['full_root'])}
    rows=[]
    for fixture in selection['case_ids']:
      public=next(r['public_inventory'] for r in base['rows'] if r['fixture_id']==fixture)
      for repetition in range(1,policy['repetitions']+1):
       for variant in (policy['conditions'] if repetition%2 else list(reversed(policy['conditions']))):
        sequence=len(rows)+1;ident=policy['id']+'-'+str(sequence).zfill(3)
        rows.append(dict(sequence=sequence,trial_id=ident,fixture_id=fixture,variant=variant,repetition=repetition,ask='on',public_inventory=public,
          work_root=str(population/ident/'work'),trial_root=str(n/'trials'/ident),wrapper=str(n/'wrappers'/ident)))
    for row in rows:
      work=Path(row['work_root']);work.mkdir(parents=True,exist_ok=False)
      for f in inv(templates[row['variant']]):clone(templates[row['variant']]/f['path'],work/f['path'],f['sha256'])
      for f in row['public_inventory']:
        assert f['path']=='task.md' or f['path'].startswith('workspace/');assert '..' not in Path(f['path']).parts
        resolved=request.get('delivery_sources',{}).get(row['fixture_id'])
        if resolved is None:clone(Path(base['public_source_snapshot'])/row['fixture_id']/f['path'],work/f['path'],f['sha256'])
        else:
          pin=next(x for x in resolved if x['target']==f['path'])
          assert pin['digest']==f['sha256'] and pin['bytes']==f['bytes'] and pin['mode']==f['mode']
          clone_bound_public(pin,work/f['path'],f)
      (work/'.tmp/npm-cache').mkdir(parents=True);(work/'.runtime').mkdir()
      for name in ['npm-user.npmrc','npm-global.npmrc']:(work/'.runtime'/name).write_bytes(b'');(work/'.runtime'/name).chmod(0o444)
      profile='ask_loop_'+row['trial_id'].replace('-','_');over=[]
      for value in values['OVERRIDES']:
        value=value.replace(oldwork,str(work)).replace(oldprofile,profile)
        if value.startswith('permissions.'):
          body=copy.deepcopy(oldbody);fs={k.replace(oldwork,str(work)):v for k,v in body['filesystem'].items()}
          fs[str(Path(oldwork).parent)]='deny'
          for peer in rows:
            if peer['trial_id']!=row['trial_id']:fs[str(Path(peer['work_root']).parent)]='deny'
          assert str(population) not in fs and str(work.parent) not in fs,'population parent deny is prohibited'
          body['filesystem']=fs;value='permissions.'+profile+'='+toml(body)
        over.append(value)
      lines=template.splitlines();lines[nodes['EXPECTED'].lineno-1]='EXPECTED = '+repr([v.replace(oldwork,str(work)) for v in values['EXPECTED']])
      lines[nodes['OVERRIDES'].lineno-1]='OVERRIDES = '+repr(over)
      if p['executionKind']=='model_free_fixture':
        assert sha(Path(p['fixtureExecutable']))==p['fixtureExecutableDigest'];lines[nodes['TARGET'].lineno-1]='TARGET = '+repr(p['fixtureExecutable'])
      else:assert p['executionKind']=='real_codex'
      wrapper=Path(row['wrapper']);wrapper.write_text('\n'.join(lines)+'\n');wrapper.chmod(0o700);row['initial_inventory']=inv(work)
    for name in ['control.py','monitor-template.py.txt','prompt.txt']:
      source=Path(p['templateConfig']).parent/name;assert sha(source)==p['sourcePins'][name];clone(source,n/name,p['sourcePins'][name])
    config={**base,'series':policy['id'],'rows':rows,'planned_rows':rows,'kind':'supervised_full_instruction_native_v1',
      'permission_delta':'Only own/peer path rebasing; original features, network and exclusions retained; no population-parent deny',
      'execution_kind':p['executionKind']}
    if p['executionKind']=='model_free_fixture':
      config['dependency_pins']=[*config['dependency_pins'],dict(path=p['fixtureExecutable'],sha256=p['fixtureExecutableDigest'])]
      config['native_sessions']=str(n/'empty-native-sessions');Path(config['native_sessions']).mkdir()
      config['native_database']=str(n/'empty-native-database.sqlite')
    put(n/'config.json',config)
    files=[n/'config.json',n/'control.py',n/'monitor-template.py.txt',n/'prompt.txt',*sorted((n/'wrappers').iterdir())]
    put(n/'preparation-manifest.json',dict(kind='frozen_prepared_existing_runner_comparison',files=[dict(path=f.relative_to(n).as_posix(),sha256=sha(f)) for f in files],model_starts=0))
    return dict(config_path=str(n/'config.json'),manifest_digest=sha(n/'preparation-manifest.json'),execution_kind=p['executionKind'],models_started=False,
      runner_digest=sha(Path(config['runner'])),control_identical=sha(n/'control.py')==p['sourcePins']['control.py'])
if __name__=='__main__':print(json.dumps(prepare(read(sys.argv[1]))))
