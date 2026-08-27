from pathlib import Path
import json

p = Path('App.tsx')
s = p.read_text()
start = s.index('function ShoppingSwipeRow(')
end = s.index('\nfunction ShoppingScreen(', start)
replacement = r'''function ShoppingProductRow({ item, compact, onToggle, onDelete }: { item: ShoppingItem; compact: boolean; onToggle: (item: ShoppingItem) => void; onDelete: (item: ShoppingItem) => void }) {
  const meta = [`${formatAmount(item.amount)} ${item.unit}`, item.addedByName ? `von ${item.addedByName}` : null, item.done && item.completedByName ? `erledigt von ${item.completedByName}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.shoppingRowV214, compact && styles.shoppingRowCompact]}>
      <Pressable accessibilityLabel={item.done ? `${item.name} als offen markieren` : `${item.name} als erledigt markieren`} onPress={() => onToggle(item)} style={[styles.checkbox, item.done && styles.checkboxDone]}>
        {item.done ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.flex1}>
        <Text style={[styles.shoppingName, item.done && styles.shoppingNameDone]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.shoppingMetaTiny} numberOfLines={1}>{meta}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} löschen`}
        hitSlop={8}
        onPress={() => onDelete(item)}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.dangerSoft : colors.surfaceMuted,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}
'''
s = s[:start] + replacement + s[end:]
s = s.replace('<ShoppingSwipeRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onDelete={remove} />', '<ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onDelete={remove} />')
s = s.replace('<Text style={styles.swipeHint}>Zum Löschen einen Artikel nach links wischen.</Text>', '<Text style={styles.swipeHint}>Zum Löschen den kleinen Papierkorb beim Produkt verwenden.</Text>')
p.write_text(s)

p = Path('app.json')
config = json.loads(p.read_text())
config['expo']['version'] = '2.2.4'
config['expo']['ios']['buildNumber'] = '16'
config['expo']['android']['versionCode'] = 16
p.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')

p = Path('package.json')
pkg = json.loads(p.read_text())
pkg['version'] = '2.2.4'
p.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n')
