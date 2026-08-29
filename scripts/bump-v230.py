from pathlib import Path
import json


def update_json(path: str, mutate):
    p = Path(path)
    data = json.loads(p.read_text())
    mutate(data)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")

update_json('package.json', lambda data: data.__setitem__('version', '2.3.0'))

def app_mutate(data):
    expo = data['expo']
    expo['version'] = '2.3.0'
    expo['ios']['buildNumber'] = '24'
    expo['android']['versionCode'] = 24
update_json('app.json', app_mutate)

def lock_mutate(data):
    data['version'] = '2.3.0'
    if '' in data.get('packages', {}):
        data['packages']['']['version'] = '2.3.0'
update_json('package-lock.json', lock_mutate)

changelog = Path('CHANGELOG.md')
text = changelog.read_text()
entry = '''## 2.3.0\n\n- Versionssprung auf MealFlow 2.3.0.\n- Enthält den aktuellen schnellen App-Start und die automatische Lidl-orientierte Kategorisierung der Einkaufsliste.\n- iOS Build 24, Android Version Code 24.\n\n'''
if '## 2.3.0' not in text:
    marker = '# MealFlow Changelog\n\n'
    if marker not in text:
        raise SystemExit('Changelog header missing')
    text = text.replace(marker, marker + entry, 1)
    changelog.write_text(text)

print('MealFlow bumped to 2.3.0 / build 24')
