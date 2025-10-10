
import React from 'react';
import ChatInterface from './components/ChatInterface';

const App: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-black text-gray-200 font-sans flex flex-col">
      <header className="bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 p-4 shadow-lg flex items-center justify-center">
        <div className="text-center">
            <h1 className="text-2xl font-bold text-white tracking-wide">Peñorita</h1>
            <p className="text-sm text-cyan-400 font-medium">Your BYLT4U Automation Architect</p>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <ChatInterface />
      </main>
    </div>
  );
};

export default App;
