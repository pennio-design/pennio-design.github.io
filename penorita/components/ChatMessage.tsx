
import React from 'react';
import type { Message } from '../types';
import { BotIcon, UserIcon } from '../constants';

interface ChatMessageProps {
  message: Message;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isBot = message.sender === 'bot';

  const messageBubbleClasses = isBot
    ? 'bg-gray-800 text-gray-200'
    : 'bg-cyan-600 text-white';
  
  const containerClasses = isBot
    ? 'justify-start'
    : 'justify-end';

  return (
    <div className={`flex items-end gap-3 my-4 ${containerClasses}`}>
      {isBot && (
        <div className="flex-shrink-0">
          <BotIcon />
        </div>
      )}
      <div className={`max-w-md md:max-w-lg lg:max-w-xl p-4 rounded-2xl shadow-md ${messageBubbleClasses}`}>
        <p className="whitespace-pre-wrap">{message.text}</p>
      </div>
      {!isBot && (
         <div className="flex-shrink-0">
          <UserIcon />
        </div>
      )}
    </div>
  );
};

export default ChatMessage;
