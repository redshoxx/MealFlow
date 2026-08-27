from pathlib import Path
p = Path('App.tsx')
s = p.read_text()
s = s.replace("const amountToken = firstMatch[1].toLocaleLowerCase('de-AT');", "const amountToken = (firstMatch[1] ?? '').toLocaleLowerCase('de-AT');")
s = s.replace("const parsedAmount = Number.isFinite(numeric) ? numeric : numberWords[amountToken];", "const parsedAmount = Number.isFinite(numeric) ? numeric : (numberWords[amountToken] ?? 0);")
s = s.replace("const remainder = firstMatch[2];", "const remainder = firstMatch[2] ?? '';")
p.write_text(s)
