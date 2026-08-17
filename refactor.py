import re

with open("frontend/src/App.jsx", "r") as f:
    content = f.read()

# I will just write a new App component for the tabs part.
# Let's check how long App.jsx is.
print(len(content))
