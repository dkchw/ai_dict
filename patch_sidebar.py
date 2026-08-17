import re

with open("frontend/src/App.jsx", "r") as f:
    content = f.read()

# Add Menu to lucide-react imports
content = re.sub(r"import \{(.*?)\} from 'lucide-react'", r"import {\1, Menu} from 'lucide-react'", content)

# Add sidebarCollapsed state
state_injection = "  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)\n"
content = re.sub(r"(const \[darkMode, setDarkMode\] = useState\(false\))", r"\1\n" + state_injection, content)

# Update the Sidebar container class
sidebar_container_re = r'<div className="w-16 md:w-64 bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-10 shadow-sm">'
sidebar_container_new = r'<div className={`bg-white dark:bg-gray-900 border-r dark:border-gray-800 flex flex-col z-10 shadow-sm transition-all duration-300 ${sidebarCollapsed ? "w-16" : "w-16 md:w-64"}`}>'
content = content.replace(sidebar_container_re, sidebar_container_new)

# Add Menu button to header
header_start_re = r'<div className="h-16 flex items-center justify-between md:px-6 border-b dark:border-gray-800">'
header_start_new = r"""<div className={`h-16 flex items-center justify-between border-b dark:border-gray-800 ${sidebarCollapsed ? "px-2 justify-center" : "md:px-6 px-2"}`}>"""
content = content.replace(header_start_re, header_start_new)

logo_btn_re = r"""          <button 
            onClick={handleHomeClick}
            className="font-bold text-xl text-blue-600 dark:text-blue-500 tracking-tight flex-1 flex items-center justify-center md:justify-start gap-2 hover:opacity-80 transition-opacity"
            title="Home / New Search"
          >
            <Library size={24} />
            <span className="hidden md:inline">AI Dict</span>
          </button>"""
logo_btn_new = r"""          <button 
            onClick={handleHomeClick}
            className={`font-bold text-xl text-blue-600 dark:text-blue-500 tracking-tight flex items-center justify-center md:justify-start gap-2 hover:opacity-80 transition-opacity ${sidebarCollapsed ? "hidden" : "flex-1 hidden md:flex"}`}
            title="Home / New Search"
          >
            <Library size={24} />
            <span className="hidden md:inline">AI Dict</span>
          </button>
          
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors hidden md:flex mx-auto"
            title="Toggle Sidebar"
          >
            <Menu size={20} />
          </button>"""
content = content.replace(logo_btn_re, logo_btn_new)

# Update dark mode button to hide if collapsed
dark_btn_re = r"""          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className="hidden md:flex p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
          >"""
dark_btn_new = r"""          <button 
            onClick={() => setDarkMode(!darkMode)} 
            className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors ${sidebarCollapsed ? "hidden" : "hidden md:flex"}`}
          >"""
content = content.replace(dark_btn_re, dark_btn_new)

# Update bottom dark mode button for md:hidden so it works correctly on mobile 
# (Actually mobile is always collapsed-like w-16, but we'll leave it as is)

# Update NavItem props in the map
# Wait, NavItem is rendered directly like `<NavItem icon={<Search />} label="Search" active={activeTab === 'search'} onClick={() => setActiveTab('search')} />`
content = content.replace("<NavItem ", "<NavItem collapsed={sidebarCollapsed} ")

# Update NavItem definition
navitem_def_re = r'function NavItem\(\{ icon, label, active, onClick \}\) \{'
navitem_def_new = r'function NavItem({ icon, label, active, onClick, collapsed }) {'
content = content.replace(navitem_def_re, navitem_def_new)

navitem_span_re = r'<span className="hidden md:inline">\{label\}</span>'
navitem_span_new = r'<span className={collapsed ? "hidden" : "hidden md:inline"}>{label}</span>'
content = content.replace(navitem_span_re, navitem_span_new)

navitem_btn_re = r'className={`w-full flex items-center justify-center md:justify-start gap-3 p-3 rounded-lg transition-colors \$\{active \? \'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium\' : \'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400\'\}`\}'
navitem_btn_new = r'className={`w-full flex items-center gap-3 p-3 rounded-lg transition-colors ${collapsed ? "justify-center" : "justify-center md:justify-start"} ${active ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium" : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"}`}'
content = content.replace(navitem_btn_re, navitem_btn_new)

with open("frontend/src/App.jsx", "w") as f:
    f.write(content)

print("Done")
