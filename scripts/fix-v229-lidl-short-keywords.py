from pathlib import Path

path = Path('App.tsx')
text = path.read_text()
old = '''function getLidlCategory(name: string): LidlCategoryKey {
  const normalized = normalizeTitle(name);

  // More specific packaged-food terms must win over generic words such as "Tomate".
  const priority: LidlCategoryKey[] = ['frozen', 'household', 'pantry', 'meat-fish', 'dairy', 'bakery', 'breakfast', 'snacks', 'drinks', 'staples', 'produce'];
  for (const key of priority) {
    if (LIDL_CATEGORY_KEYWORDS[key].some((keyword) => normalized.includes(keyword))) return key;
  }
  return 'other';
}
'''
new = '''function getLidlCategory(name: string): LidlCategoryKey {
  const normalized = normalizeTitle(name);
  const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean);

  // More specific packaged-food terms must win over generic words such as "Tomate".
  // Very short keywords (Ei, Öl, Tee, TK) only match complete tokens to avoid false positives.
  const matchesKeyword = (keyword: string) => {
    const clean = keyword.trim();
    return clean.length <= 3 ? tokens.includes(clean) : normalized.includes(keyword);
  };
  const priority: LidlCategoryKey[] = ['frozen', 'household', 'pantry', 'meat-fish', 'dairy', 'bakery', 'breakfast', 'snacks', 'drinks', 'staples', 'produce'];
  for (const key of priority) {
    if (LIDL_CATEGORY_KEYWORDS[key].some(matchesKeyword)) return key;
  }
  return 'other';
}
'''
if old not in text:
    raise SystemExit('getLidlCategory pattern missing')
path.write_text(text.replace(old, new, 1))
print('Lidl short keyword matching hardened')
