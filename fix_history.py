import re

with open('frontend/src/App.jsx', 'r') as f:
    content = f.read()

# Add New Session button
content = re.sub(
    r'<button onClick=\{\(\) => exportData\(\'words\'\)\} className="px-2 py-1 bg-gray-100',
    '''<button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('words')} className="px-2 py-1 bg-gray-100''',
    content
)

content = re.sub(
    r'<button onClick=\{\(\) => exportData\(\'comparisons\'\)\} className="px-2 py-1 bg-gray-100',
    '''<button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('comparisons')} className="px-2 py-1 bg-gray-100''',
    content
)

content = re.sub(
    r'<button onClick=\{\(\) => exportData\(\'explains\'\)\} className="px-2 py-1 bg-gray-100',
    '''<button onClick={() => {
                              const sessionId = "Session " + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
                              localStorage.setItem('active_session_id', sessionId);
                              alert("Started " + sessionId);
                            }} className="px-2 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-xs font-medium transition-colors">New Session</button>
                            <button onClick={() => exportData('explains')} className="px-2 py-1 bg-gray-100''',
    content
)

# Add Delete Group button to all three history tabs
content = re.sub(
    r'\{historySort === \'date\' && <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-3 border-b dark:border-gray-800 pb-1">\{groupName\}</h3>\}',
    '''{historySort === 'date' && (
                              <div className="flex items-center justify-between mb-3 border-b dark:border-gray-800 pb-1">
                                <h3 className="text-lg font-bold text-gray-500 dark:text-gray-400">{groupName}</h3>
                                {groupName.startsWith('Session') && (
                                  <button 
                                    onClick={async () => {
                                      if(!confirm(`Delete all data in ${groupName}?`)) return;
                                      await fetch(`/api/sessions/${groupName}`, { method: 'DELETE' });
                                      if(localStorage.getItem('active_session_id') === groupName) localStorage.removeItem('active_session_id');
                                      fetchWords();
                                      fetchComparisons();
                                      fetchExplains();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                                  >
                                    Delete Group
                                  </button>
                                )}
                              </div>
                            )}''',
    content
)

with open('frontend/src/App.jsx', 'w') as f:
    f.write(content)
