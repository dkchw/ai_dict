import re

with open('frontend/src/App.jsx', 'r') as f:
    content = f.read()

# Add a wheel handler for all tab bars
content = re.sub(
    r'<div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto">',
    '<div className="flex bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-800 overflow-x-auto" onWheel={(e) => { if (e.deltaY !== 0) { e.currentTarget.scrollLeft += e.deltaY; } }}>',
    content
)

with open('frontend/src/App.jsx', 'w') as f:
    f.write(content)
