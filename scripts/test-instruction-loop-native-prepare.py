"""Model-free legacy monitor-path compatibility regression."""
import importlib.util,unittest
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
if __name__=='__main__':unittest.main()
