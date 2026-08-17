import re

with open('frontend/src/App.jsx', 'r') as f:
    content = f.read()

replacement = """  useEffect(() => {
    if (containerRef.current && popupRef.current) {
      const parentRect = containerRef.current.parentElement.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const windowWidth = window.innerWidth;
      const popupHeight = popupRef.current.offsetHeight || 300;
      const popupWidth = popupRef.current.offsetWidth || 600;
      
      let newTop = 0;
      if (parentRect.bottom + popupHeight > windowHeight && parentRect.top > popupHeight) {
        // Place above
        newTop = parentRect.top - popupHeight - 8;
      } else {
        // Place below
        newTop = parentRect.bottom + 8;
      }

      let newLeft = parentRect.left;
      const overflowRight = (parentRect.left + popupWidth) - (windowWidth - 20);
      if (overflowRight > 0) {
        newLeft -= overflowRight;
      }
      
      // Prevent overflow on left
      if (newLeft < 20) {
          newLeft = 20;
      }

      setPosition({ top: newTop, left: newLeft });
    }
  }, [content, popupSize]);"""

# Replace useEffect
content = re.sub(r'  useEffect\(\(\) => \{[\s\S]*?\}, \[content\]\);', replacement, content)

# Change state variables
content = content.replace("const [position, setPosition] = useState('bottom');", "const [position, setPosition] = useState({ top: 0, left: 0 });")
content = content.replace("const [leftOffset, setLeftOffset] = useState(0);", "")

# Update return div
content = re.sub(
    r'<div\s+ref=\{containerRef\}\s+className=\{`absolute z-50 \$\{position === \'top\' \? \'bottom-full pb-2\' : \'top-full pt-2\'\}`\}\s+style=\{\{ left: leftOffset \}\}\s+>',
    '<div ref={containerRef} className="fixed z-[100]" style={{ top: position.top, left: position.left }}>',
    content
)

with open('frontend/src/App.jsx', 'w') as f:
    f.write(content)
