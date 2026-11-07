"""Model-free legacy monitor-path compatibility regression."""
import importlib.util,unittest,tempfile,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('native_prepare',Path(__file__).with_name('instruction-loop-native-prepare.py'))
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class NativeRootTest(unittest.TestCase):
    def test_sibling_accepts_the_config_file_parent(self):
        self.assertTrue(module.compatible_native_host_root('/host/project/preparation/new','/host/project/preparation/original/config.json'))
    def test_extra_directory_is_refused(self):
        self.assertFalse(module.compatible_native_host_root('/host/project/deeper/preparation/new','/host/project/preparation/original/config.json'))
    def test_short_paths_are_refused(self):
        self.assertFalse(module.compatible_native_host_root('/host/new','/host/project/preparation/original/config.json'))
    def prepared_request(self,base):
        operator=base/'operator';template=operator/'preparation/template';template.mkdir(parents=True)
        baseline=operator/'baseline';candidate=operator/'candidate';baseline.mkdir();candidate.mkdir()
        for path in [baseline,candidate]:(path/'AGENTS.md').write_text('Synthetic declared context.')
        oldwork=base/'old/work';wrapper=template/'wrapper';body={'filesystem':{str(operator):'deny',str(oldwork):'write'},'network':{'enabled':False}}
        override='permissions.old='+module.toml(body)
        wrapper.write_text('TARGET = '+repr('/never-executed')+'\nEXPECTED = []\nOVERRIDES = '+repr(['-c',override])+'\n')
        source_pins={}
        for name in ['control.py','monitor-template.py.txt','prompt.txt']:
            f=template/name;f.write_text('Synthetic model-free preparation; never executed.');source_pins[name]=module.sha(f)
        public=operator/'public';(public/'case').mkdir(parents=True);task=public/'case/task.md';task.write_text('Synthetic task.');entry={'path':'task.md','bytes':task.stat().st_size,'mode':task.stat().st_mode&511,'sha256':module.sha(task)}
        config=template/'config.json';config.write_text(json.dumps({'rows':[{'wrapper':str(wrapper),'work_root':str(oldwork),'fixture_id':'case','public_inventory':[entry]}],'public_source_snapshot':str(public),'dependency_pins':[],'runner':str(template/'control.py')}))
        fake=Path(module.__file__).parent/'fixtures/instruction-loop/fake-codex.py'
        return {'profile':{'templateConfig':str(config),'templateConfigDigest':module.sha(config),'wrapperDigest':module.sha(wrapper),'protectedRoot':str(operator),'root':str(operator/'missing-parent/native'),'workRoot':str(base/'missing-work/population'),'baselineFullRoot':str(baseline),'sourcePins':source_pins,'executionKind':'model_free_fixture','fixtureExecutable':str(fake),'fixtureExecutableDigest':module.sha(fake)},'selection':{'case_ids':['case']},'candidate':{'full_root':str(candidate)},'policy':{'id':'synthetic-prepare','repetitions':1,'conditions':['baseline','candidate']}}
    def test_full_preparation_allocates_fresh_parent_paths_and_never_reuses_roots(self):
        with tempfile.TemporaryDirectory() as raw:
            r=self.prepared_request(Path(raw).resolve());result=module.prepare(r);n=Path(r['profile']['root']);self.assertFalse(result['models_started']);self.assertTrue(result['control_identical']);self.assertEqual(len(json.loads((n/'config.json').read_text())['rows']),2)
            before=(n/'preparation-manifest.json').read_bytes()
            with self.assertRaises(FileExistsError):module.prepare(r)
            self.assertEqual((n/'preparation-manifest.json').read_bytes(),before)
    def test_parent_symlink_refuses_before_new_root_allocation(self):
        with tempfile.TemporaryDirectory() as raw:
            base=Path(raw).resolve();r=self.prepared_request(base);elsewhere=base/'elsewhere';elsewhere.mkdir();Path(r['profile']['root']).parent.symlink_to(elsewhere,target_is_directory=True)
            with self.assertRaisesRegex(AssertionError,'canonical'):module.prepare(r)
            self.assertFalse(Path(r['profile']['workRoot']).exists());self.assertEqual(list(elsewhere.iterdir()),[])
if __name__=='__main__':unittest.main()
