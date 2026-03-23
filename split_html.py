import os

with open('gemini_canvas_full.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

css_lines = lines[26:113]
js_lines = lines[1146:3538]

html_lines = lines[0:25]
html_lines.append('<link rel=\"stylesheet\" href=\"assets/css/styles.css\">\n')
html_lines.extend(lines[114:1145])
html_lines.append('<script type=\"module\" src=\"assets/js/app.js\"></script>\n')
html_lines.extend(lines[3539:])

os.makedirs('assets/css', exist_ok=True)
os.makedirs('assets/js', exist_ok=True)

with open('assets/css/styles.css', 'w', encoding='utf-8') as f:
    f.writelines(css_lines)

with open('assets/js/app.js', 'w', encoding='utf-8') as f:
    f.writelines(js_lines)

with open('index.html', 'w', encoding='utf-8') as f:
    f.writelines(html_lines)
print('Extraction complete using exact line slicing.')
