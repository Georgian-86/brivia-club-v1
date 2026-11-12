# Regenerates site/scripts/chat-emoji-data.js (D-244) from unicode-emoji-json (MIT):
#   npm pack unicode-emoji-json@0.9.0 && tar xzf unicode-emoji-json-0.9.0.tgz
#   python3 -I scripts/gen-emoji-data.py package/data-by-group.json site/scripts/chat-emoji-data.js
import json, sys
src, out = sys.argv[1], sys.argv[2]
groups = json.load(open(src))
keys = {'Smileys & Emotion': ('smileys', 'Smileys'), 'People & Body': ('people', 'People'), 'Animals & Nature': ('animals', 'Animals'),
        'Food & Drink': ('food', 'Food'), 'Travel & Places': ('travel', 'Travel'), 'Activities': ('activities', 'Activities'),
        'Objects': ('objects', 'Objects'), 'Symbols': ('symbols', 'Symbols'), 'Flags': ('flags', 'Flags')}
def ok(e):
    try: return float(e['emoji_version']) <= 15.0
    except Exception: return False
lines = ["// Every emoji (D-244, founder 2026-11-12: \"I need all the emojis… I can't see chess or crying\"), generated from",
         "// unicode-emoji-json 0.9.0 (MIT, github.com/muan/unicode-emoji-json, Unicode's emoji-test data), Emoji 15.0 and",
         "// older so they draw on phones still in use. Base forms only: hands and people take the member's skin tone at render",
         "// time (emoji-tone.js). Regenerate with scripts/gen-emoji-data.py; do not edit by hand.",
         "// chatEmojiCategories[key]: the emoji in Unicode's order. EMOJI_TABS: [key, label]. emojiName(e): its English name.",
         "export const EMOJI_TABS = " + json.dumps([v for v in keys.values()], ensure_ascii=False) + ";",
         "export const chatEmojiCategories = {"]
names = {}
total = 0
for g in groups:
    key = keys[g['name']][0]
    items = [e for e in g['emojis'] if ok(e)]
    total += len(items)
    lines.append(f"  {key}: {json.dumps([e['emoji'] for e in items], ensure_ascii=False)},")
    for e in items: names[e['emoji']] = e['name']
lines.append("};")
lines.append("const NAMES = " + json.dumps(names, ensure_ascii=False) + ";")
lines.append("export const emojiName = (emoji) => NAMES[emoji] || '';")
open(out, 'w').write('\n'.join(lines) + '\n')
print(total, 'emojis')
