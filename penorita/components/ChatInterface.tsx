
import React, { useState, useRef, useEffect, FormEvent } from 'react';
// Fix: Import Gemini API modules according to the coding guidelines.
import { GoogleGenAI, Chat, GenerateContentResponse } from '@google/genai';
import { Message } from '../types';
import { INITIAL_BOT_MESSAGE, PENORITA_SYSTEM_PROMPT, SendIcon } from '../constants';
import ChatMessage from './ChatMessage';

const ChatInterface: React.FC = () => {
  // State for messages, user input, and loading status
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'initial-bot-message',
      text: INITIAL_BOT_MESSAGE,
      sender: 'bot',
    },
  ]);
  const [userInput, setUserInput] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Ref for the Gemini chat session
  const chatRef = useRef<Chat | null>(null);
  
  // Ref for the message container to enable auto-scrolling
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize the Gemini chat session
  useEffect(() => {
    try {
      // Fix: Initialize GoogleGenAI with a named apiKey parameter from environment variables.
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      // Fix: Use ai.chats.create to establish a chat session with conversation history.
      const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
          systemInstruction: PENORITA_SYSTEM_PROMPT,
        },
      });
      chatRef.current = chat;
    } catch (e: any) {
      console.error("Failed to initialize Gemini AI:", e);
      setError("Failed to initialize the chat service. Please try again later.");
    }
  }, []);

  // Effect to scroll to the latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle form submission
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedInput = userInput.trim();
    if (!trimmedInput || isLoading || !chatRef.current) return;

    setIsLoading(true);
    setError(null);
    const userMessage: Message = {
      id: Date.now().toString(),
      text: trimmedInput,
      sender: 'user',
    };

    setMessages((prevMessages) => [...prevMessages, userMessage]);
    setUserInput('');

    try {
      // Fix: Use chat.sendMessage to send messages within the session.
      const response: GenerateContentResponse = await chatRef.current.sendMessage({
        message: trimmedInput,
      });
      
      // Fix: Extract the bot's reply directly from the `response.text` property and remove asterisks.
      const botMessage: Message = {
        id: Date.now().toString() + '-bot',
        text: response.text.replace(/\*/g, ''),
        sender: 'bot',
      };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (e: any) {
      console.error("Error sending message:", e);
      const errorMessage = "I'm having trouble connecting right now. Please try again in a moment.";
      setError(errorMessage);
       const errorBotMessage: Message = {
        id: Date.now().toString() + '-error',
        text: errorMessage,
        sender: 'bot',
      };
      setMessages((prevMessages) => [...prevMessages, errorBotMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 rounded-lg shadow-2xl m-4 border border-gray-700">
      {/* Message display area */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* Input form area */}
      <div className="p-4 border-t border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        {error && <p className="text-red-400 text-sm text-center mb-2">{error}</p>}
        <form onSubmit={handleSubmit} className="flex items-center gap-4">
          <input
            type="text"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            placeholder="What operational headache can I solve for you?"
            className="flex-1 bg-gray-800 border border-gray-600 rounded-full py-3 px-6 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition duration-300"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !userInput.trim()}
            className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-full p-3 transition duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-gray-900"
          >
            {isLoading ? (
              <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <SendIcon />
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;