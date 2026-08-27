from pathlib import Path
import json

p = Path('app.json')
config = json.loads(p.read_text())
plugins = config['expo'].setdefault('plugins', [])
name = '@react-native-community/datetimepicker'
if name not in plugins:
    plugins.append(name)
p.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
