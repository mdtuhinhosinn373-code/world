import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot as firestoreOnSnapshot, 
  serverTimestamp, 
  getDocs,
  doc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { db, auth, isFirestoreShutdownError, triggerQuotaExceeded } from '../lib/firebase';

// Helper to deduplicate array contents by ID
function deduplicateById(arr: any[]): any[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    if (!item) return false;
    const id = item.id;
    if (!id) return false;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Unified safe onSnapshot listener wrapper
const onSnapshot = (query: any, ...args: any[]) => {
  if (typeof window !== 'undefined' && (window as any).firestoreQuotaExceeded) {
    console.warn("Firestore snapshot skipped due to active quota limits in DirectMessages.");
    return () => {};
  }

  let options: any = null;
  let observer: any = null;
  let onNext: any = null;
  let onError: any = null;

  if (args.length === 1) {
    observer = args[0];
  } else if (args.length === 2) {
    if (typeof args[0] === 'function') {
      onNext = args[0];
      onError = args[1];
    } else if (typeof args[0] === 'object' && typeof args[1] === 'object') {
      options = args[0];
      observer = args[1];
    } else if (typeof args[0] === 'object' && typeof args[1] === 'function') {
      options = args[0];
      onNext = args[1];
    }
  } else if (args.length === 3) {
    options = args[0];
    onNext = args[1];
    onError = args[2];
  }

  const safeErrorHandler = (err: any) => {
    if (err?.code === 'aborted' || isFirestoreShutdownError(err)) {
      console.warn("Firestore listener in DM safely aborted/ignored:", err.message);
      return;
    }
    if (err?.code === 'resource-exhausted' || err?.message?.toLowerCase().includes('quota') || err?.message?.toLowerCase().includes('exhausted')) {
      triggerQuotaExceeded();
      return;
    }
    
    if (onError) {
      try {
        onError(err);
      } catch (innerErr) {
        console.error("Uncaught inside custom DM snapshot error handler:", innerErr);
      }
    } else if (observer && observer.error) {
      try {
        observer.error(err);
      } catch (innerErr) {
        console.error("Uncaught inside custom observer DM error handler:", innerErr);
      }
    } else {
      console.warn("Safe DM onSnapshot caught unhandled error:", err);
    }
  };

  const finalArgs: any[] = [];
  if (options) {
    finalArgs.push(options);
  }

  if (onNext) {
    finalArgs.push(onNext);
    finalArgs.push(safeErrorHandler);
  } else if (observer) {
    const wrappedObserver = {
      ...observer,
      next: (val: any) => {
        if (observer.next) {
          try {
            observer.next(val);
          } catch (innerErr) {
            console.error("Error in snapshot observer next callback:", innerErr);
          }
        }
      },
      error: safeErrorHandler
    };
    finalArgs.push(wrappedObserver);
  } else {
    finalArgs.push(() => {});
    finalArgs.push(safeErrorHandler);
  }

  try {
    return (firestoreOnSnapshot as any)(query, ...finalArgs);
  } catch (err: any) {
    console.warn("Error setting up safe Firestore DM snapshot collection listener:", err);
    return () => {};
  }
};
import { getTranslation } from '../lib/languages';
import { 
  Search, 
  ArrowLeft, 
  Send, 
  MessageSquare, 
  User as UserIcon, 
  X, 
  Smile, 
  CheckCircle,
  MessageCircle,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils'; // Or standard className utility inside App

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  receiverId: string;
  receiverName: string;
  receiverPhoto?: string;
  text: string;
  participants: string[];
  isRead?: boolean;
  createdAt: any;
}

interface ChatUserInfo {
  id: string;
  fullName: string;
  profilePhoto?: string;
}

export default function DirectMessages({ 
  onBack, 
  appLanguage = 'en',
  onlineUsers = {},
  socket
}: { 
  onBack: () => void;
  appLanguage?: string;
  onlineUsers?: Record<string, boolean>;
  socket?: any;
}) {
  const currentUser = auth.currentUser;
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversations, setConversations] = useState<{
    otherUser: ChatUserInfo;
    lastMessage: Message;
    unreadCount: number;
  }[]>([]);
  
  const [selectedUser, setSelectedUser] = useState<ChatUserInfo | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ChatUserInfo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [globalLoading, setGlobalLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isOtherUserTyping, setIsOtherUserTyping] = useState(false);
  const typingTimeoutRef = useRef<any>(null);

  // Monitor other user's typing status over WebSocket
  useEffect(() => {
    if (!socket || !selectedUser) {
      setIsOtherUserTyping(false);
      return;
    }

    const handleTyping = (payload: any) => {
      if (payload && payload.senderId === selectedUser.id) {
        setIsOtherUserTyping(!!payload.isTyping);
      }
    };

    socket.on('typing-indicator', handleTyping);

    return () => {
      socket.off('typing-indicator', handleTyping);
    };
  }, [socket, selectedUser]);

  // Sync real-time message received directly over WebSocket
  useEffect(() => {
    const handleSocketPM = (e: Event) => {
      const msg = (e as CustomEvent).detail;
      if (!msg || !currentUser) return;
      
      // If we are currently talking to this sender, we add it to the state directly if it's not already there
      if (msg.senderId === selectedUser?.id && msg.receiverId === currentUser.uid) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          const newMsg: Message = {
            id: msg.id || 'dm-' + Date.now(),
            senderId: msg.senderId,
            senderName: msg.senderName,
            senderPhoto: msg.senderPhoto,
            receiverId: msg.receiverId,
            receiverName: msg.receiverName,
            receiverPhoto: msg.receiverPhoto,
            text: msg.text,
            participants: msg.participants,
            isRead: msg.isRead || false,
            createdAt: { toDate: () => new Date() }
          };
          return [...prev, newMsg];
        });
      }
    };

    window.addEventListener('socket-pm-received', handleSocketPM);
    return () => {
      window.removeEventListener('socket-pm-received', handleSocketPM);
    };
  }, [currentUser, selectedUser]);

  // Automatically scroll to the bottom of message list
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, selectedUser]);

  // Mark messages in current chat as read
  useEffect(() => {
    if (!currentUser || !selectedUser || messages.length === 0) return;

    const markAsRead = async () => {
      const batch = writeBatch(db);
      let updatedAny = false;

      const activeChatMessages = messages.filter(m => 
        (m.senderId === currentUser.uid && m.receiverId === selectedUser.id) ||
        (m.senderId === selectedUser.id && m.receiverId === currentUser.uid)
      );

      activeChatMessages.forEach((msg) => {
        if (msg.senderId === selectedUser.id && msg.receiverId === currentUser.uid && msg.isRead !== true) {
          const msgRef = doc(db, 'direct_messages', msg.id);
          batch.update(msgRef, { isRead: true });
          updatedAny = true;
        }
      });

      if (updatedAny) {
        try {
          await batch.commit();
        } catch (err) {
          console.error("Failed to mark messages as read:", err);
        }
      }
    };

    markAsRead();
  }, [selectedUser, messages, currentUser]);

  // Handle auto-opening chat if targetChatUserId is set globally
  useEffect(() => {
    const checkGlobalTarget = async () => {
      const targetId = (window as any).targetChatUserId;
      if (targetId && currentUser) {
        try {
          // Fetch user data
          const userDoc = await getDoc(doc(db, 'users', targetId));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setSelectedUser({
              id: targetId,
              fullName: data.fullName || 'User',
              profilePhoto: data.profilePhoto || ''
            });
          }
        } catch (error) {
          console.error("Error fetching target user for DM:", error);
        } finally {
          // Clear it
          delete (window as any).targetChatUserId;
        }
      }
    };
    checkGlobalTarget();
  }, [currentUser]);

  // Real-time listener for ALL direct messages involving the current user
  useEffect(() => {
    if (!currentUser) return;

    setGlobalLoading(true);
    const q = query(
      collection(db, 'direct_messages'),
      where('participants', 'array-contains', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMsgsDocMapped = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Guard against null createdAt from latency compensation
          createdAt: data.createdAt || { toDate: () => new Date() }
        } as Message;
      });
      const allMsgs = deduplicateById(allMsgsDocMapped);

      // Sort all messages chronology in memory
      allMsgs.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB;
      });

      setMessages(allMsgs);
      setGlobalLoading(false);

      // Aggregate conversations in-memory
      const groups: Record<string, Message[]> = {};
      allMsgs.forEach(m => {
        const otherId = m.senderId === currentUser.uid ? m.receiverId : m.senderId;
        if (!groups[otherId]) groups[otherId] = [];
        groups[otherId].push(m);
      });

      const conversationList = Object.entries(groups).map(([otherId, msgs]) => {
        const lastMsg = msgs[msgs.length - 1];
        const otherName = lastMsg.senderId === currentUser.uid ? lastMsg.receiverName : lastMsg.senderName;
        const otherPhoto = lastMsg.senderId === currentUser.uid ? lastMsg.receiverPhoto : lastMsg.senderPhoto;

        // Calculate actual unread count
        const unreadCount = msgs.filter(m => m.senderId === otherId && m.receiverId === currentUser.uid && m.isRead !== true).length;

        return {
          otherUser: {
            id: otherId,
            fullName: otherName || 'User',
            profilePhoto: otherPhoto || ''
          },
          lastMessage: lastMsg,
          unreadCount: unreadCount
        };
      });

      // Sort conversations so freshest is at top
      conversationList.sort((a, b) => {
        const timeA = a.lastMessage.createdAt?.toDate ? a.lastMessage.createdAt.toDate().getTime() : 0;
        const timeB = b.lastMessage.createdAt?.toDate ? b.lastMessage.createdAt.toDate().getTime() : 0;
        return timeB - timeA;
      });

      setConversations(conversationList);
    }, (err) => {
      console.error("Direct messages snapshot error:", err);
      setGlobalLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  // Handle Search users to start new chat
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const searchUsers = async () => {
      setIsSearching(true);
      try {
        const snap = await getDocs(collection(db, 'users'));
        const queryLower = searchQuery.toLowerCase();
        
        const filtered = snap.docs
          .map(d => ({ id: d.id, ...d.data() } as any))
          .filter(u => u.id !== currentUser?.uid && u.fullName?.toLowerCase().includes(queryLower))
          .map(u => ({
            id: u.id,
            fullName: u.fullName || 'User',
            profilePhoto: u.profilePhoto || ''
          }));

        setSearchResults(filtered);
      } catch (err) {
        console.error("Search users failed:", err);
      } finally {
        setIsSearching(false);
      }
    };

    const delayDebounce = setTimeout(searchUsers, 300);
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, currentUser]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !currentUser || !selectedUser) return;

    const messageText = inputText.trim();
    setInputText('');

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    if (socket) {
      socket.emit('typing-status', {
        senderId: currentUser.uid,
        receiverId: selectedUser.id,
        isTyping: false
      });
    }

    try {
      // Find current user's profile info to inject
      let currentFullName = currentUser.displayName || 'Me';
      let currentProfilePhoto = currentUser.photoURL || '';

      const docPayload = {
        senderId: currentUser.uid,
        senderName: currentFullName,
        senderPhoto: currentProfilePhoto,
        receiverId: selectedUser.id,
        receiverName: selectedUser.fullName,
        receiverPhoto: selectedUser.profilePhoto || '',
        text: messageText,
        participants: [currentUser.uid, selectedUser.id],
        isRead: false,
        createdAt: serverTimestamp()
      };

      // Set up document payload
      const docRef = await addDoc(collection(db, 'direct_messages'), docPayload);

      // Fire over WebSockets for instant Delivery
      if (socket) {
        socket.emit('send-private-message', {
          id: docRef.id,
          ...docPayload,
          createdAt: { toDate: () => new Date() } // Local timestamp simulation inside other client
        });
      }
    } catch (err) {
      console.error("Failed to send direct message:", err);
    }
  };

  // Filter messages for active chat screen
  const currentChatMessages = messages.filter(m => 
    selectedUser && (
      (m.senderId === currentUser?.uid && m.receiverId === selectedUser.id) ||
      (m.senderId === selectedUser.id && m.receiverId === currentUser?.uid)
    )
  );

  if (!currentUser) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <MessageSquare className="w-12 h-12 text-pink-500 mb-4 animate-pulse" />
        <h3 className="text-lg font-bold">Please log in to use messages</h3>
        <p className="text-xs text-gray-500 mt-1 max-w-xs">Connecting with people requires a verified account login.</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-[var(--bg-primary)] flex flex-col relative text-[var(--text-primary)]">
      {selectedUser ? (
        /* ==================== SCREEN 2: ACTIVE CHAT DIALOG ==================== */
        <div className="flex-1 flex flex-col h-full bg-black relative">
          {/* Chat Header */}
          <div className="sticky top-0 z-[100] bg-[var(--bg-card)] border-b border-[var(--border-secondary)] px-4 py-3.5 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => setSelectedUser(null)}
                className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center hover:opacity-80 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
              
              <div className="relative flex-shrink-0">
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                  {selectedUser.profilePhoto ? (
                    <img src={selectedUser.profilePhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <UserIcon className="w-full h-full p-2 text-gray-400" />
                  )}
                </div>
                {onlineUsers && onlineUsers[selectedUser.id] && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-black shadow-[0_0_6px_rgba(34,197,94,0.6)] z-10" />
                )}
              </div>
              
              <div className="text-left">
                <h4 className="text-xs font-black uppercase text-white tracking-widest">{selectedUser.fullName}</h4>
                {onlineUsers && onlineUsers[selectedUser.id] ? (
                  <span className="text-[9px] text-emerald-500 font-bold block mt-1 leading-none">● Active Now</span>
                ) : (
                  <span className="text-[9px] text-gray-500 font-bold block mt-1 leading-none">Offline</span>
                )}
              </div>
            </div>
            
            <button 
              onClick={() => setSelectedUser(null)}
              className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Flow Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3.5 no-scrollbar pb-24 bg-black">
            {currentChatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <div className="w-16 h-16 bg-gray-900 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-8 h-8 text-pink-500/80" />
                </div>
                <div>
                  <h3 className="text-white text-xs font-black uppercase tracking-widest">
                    {getTranslation(appLanguage, 'chatWith')} {selectedUser.fullName}
                  </h3>
                  <p className="text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-wider">Say hi to start a beautiful connection!</p>
                </div>
              </div>
            ) : (
              currentChatMessages.map((msg, idx) => {
                const isMe = msg.senderId === currentUser.uid;
                return (
                  <div 
                    key={`${msg.id || 'msg'}-${idx}`} 
                    className={cn(
                      "flex items-end space-x-2 w-full max-w-[85%]",
                      isMe ? "ml-auto flex-row-reverse space-x-reverse" : "mr-auto"
                    )}
                  >
                    {!isMe && (
                      <div className="w-6.5 h-6.5 rounded-lg overflow-hidden bg-gray-800 flex-shrink-0 border border-gray-800">
                        {msg.senderPhoto ? (
                          <img src={msg.senderPhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <UserIcon className="w-full h-full p-1.5 text-gray-500" />
                        )}
                      </div>
                    )}
                    
                    <div className="flex flex-col">
                      <div 
                        className={cn(
                          "px-3.5 py-2.5 text-xs rounded-2xl relative shadow-md break-words max-w-full selection:bg-pink-300 font-medium leading-relaxed",
                          isMe 
                            ? "bg-gradient-to-tr from-pink-500 to-[#FF4B91] text-white rounded-br-none" 
                            : "bg-gray-900 border border-gray-800/80 text-gray-100 rounded-bl-none"
                        )}
                      >
                        {msg.text}
                      </div>
                      
                      <span className={cn(
                        "text-[8px] text-gray-500 font-mono mt-0.5 px-1",
                        isMe ? "text-right" : "text-left"
                      )}>
                        {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Sending...'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sticky Chat Input Send Row */}
          <div className="relative">
            {isOtherUserTyping && (
              <div className="absolute -top-10 left-4 bg-zinc-900 border border-zinc-800 text-[10px] text-pink-400 font-bold tracking-tight px-3 py-1.5 rounded-full animate-bounce flex items-center gap-1.5 z-50 shadow-xl">
                <span className="w-1.5 h-1.5 rounded-full bg-pink-400 animate-pulse" />
                <span>{selectedUser?.fullName} {appLanguage === 'bn' ? 'টাইপ করছেন...' : 'is typing...'}</span>
              </div>
            )}

            <form 
              onSubmit={handleSendMessage}
              className="p-3 bg-black/95 border-t border-gray-900/60 backdrop-blur-xl flex items-center space-x-2 z-50 select-none pb-4"
            >
              <input 
                type="text"
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  if (socket && currentUser && selectedUser) {
                    socket.emit('typing-status', {
                      senderId: currentUser.uid,
                      receiverId: selectedUser.id,
                      isTyping: true
                    });

                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => {
                      socket.emit('typing-status', {
                        senderId: currentUser.uid,
                        receiverId: selectedUser.id,
                        isTyping: false
                      });
                    }, 1800);
                  }
                }}
                placeholder={getTranslation(appLanguage, 'typeMessage')}
                className="flex-1 py-3 px-4 rounded-xl bg-gray-950 border border-gray-900/80 text-xs text-white outline-none placeholder-gray-600 focus:border-pink-500/50 transition-all font-medium pr-10"
                onTouchStart={(e) => e.stopPropagation()}
              />
              
              <button 
                type="submit"
                disabled={!inputText.trim()}
                className="w-11 h-11 rounded-xl bg-[#FF4B91] text-white flex items-center justify-center hover:bg-pink-600 transition-all disabled:opacity-40 disabled:scale-100 active:scale-95 cursor-pointer shadow-lg shadow-pink-500/10"
              >
                <Send className="w-4 h-4 fill-white" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        /* ==================== SCREEN 1: CONVERSATIONS LISTING ==================== */
        <div className="flex-1 flex flex-col h-full bg-black">
          {/* Header */}
          <div className="sticky top-0 z-[100] bg-[var(--bg-card)] border-b border-[var(--border-secondary)] px-4 py-3.5 flex items-center justify-between select-none">
            <div className="flex items-center space-x-2.5">
              <button 
                onClick={onBack}
                className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center hover:opacity-80 active:scale-95 transition-transform"
              >
                <ArrowLeft className="w-4 h-4 text-white" />
              </button>
              <h2 className="text-sm font-black uppercase text-white tracking-widest">{getTranslation(appLanguage, 'messages')}</h2>
            </div>
            
            <button 
              onClick={onBack}
              className="w-8 h-8 bg-[var(--bg-secondary)] hover:bg-[var(--bg-secondary)]/80 rounded-xl flex items-center justify-center text-[var(--text-secondary)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Quick Search to start a new chat */}
          <div className="p-3 select-none">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text"
                placeholder={getTranslation(appLanguage, 'searchUsers')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-secondary)] rounded-xl py-3 pl-10 pr-4 text-xs text-white placeholder-gray-500 outline-none focus:border-[#FF4B91]/50 transition-colors"
                onTouchStart={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 w-5 h-5 bg-gray-800 rounded-full flex items-center justify-center text-gray-400 font-bold text-[8px]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          {/* Search Results Display */}
          {searchQuery ? (
            <div className="flex-1 overflow-y-auto px-1">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-[#FF4B91] px-4 py-2 mt-2">
                {getTranslation(appLanguage, 'startChat')}
              </h4>
              
              {isSearching ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1 px-3">
                  {searchResults.map((shUser, idx) => (
                    <div 
                      key={`${shUser.id || 'sh'}-${idx}`}
                      onClick={() => setSelectedUser(shUser)}
                      className="flex items-center space-x-3.5 p-3 hover:bg-[var(--bg-secondary)] active:scale-98 transition-all rounded-xl cursor-pointer border border-transparent hover:border-[var(--border-secondary)]"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
                          {shUser.profilePhoto ? (
                            <img src={shUser.profilePhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <UserIcon className="w-full h-full p-2.5 text-gray-400" />
                          )}
                        </div>
                        {onlineUsers && onlineUsers[shUser.id] && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_rgba(34,197,94,0.6)] z-10" />
                        )}
                      </div>
                      <div className="text-left flex-1">
                        <h4 className="text-xs font-black uppercase text-white tracking-widest">{shUser.fullName}</h4>
                        <span className="text-[9px] text-gray-500 font-bold">Start messaging</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-600" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-xs italic text-gray-500">
                  No users matched your search query.
                </div>
              )}
            </div>
          ) : (
            /* Conversations List Area */
            <div className="flex-1 overflow-y-auto px-1 pb-16 no-scrollbar">
              {globalLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                  <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-[10px] uppercase font-black tracking-widest text-gray-600">Syncing Inbox...</span>
                </div>
              ) : conversations.length > 0 ? (
                <div className="space-y-1.5 px-3">
                  {conversations.map((conv, idx) => (
                    <div 
                      key={`${conv.otherUser.id || 'conv'}-${idx}`}
                      onClick={() => setSelectedUser(conv.otherUser)}
                      className="flex items-center space-x-3.5 p-3 hover:bg-gray-900 active:scale-98 transition-all rounded-xl cursor-pointer border border-transparent hover:border-gray-800"
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-10 h-10 rounded-xl overflow-hidden bg-gray-900 border border-gray-800/80">
                          {conv.otherUser.profilePhoto ? (
                            <img src={conv.otherUser.profilePhoto} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <UserIcon className="w-full h-full p-2.5 text-gray-500" />
                          )}
                        </div>
                        {onlineUsers && onlineUsers[conv.otherUser.id] && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-black shadow-[0_0_8px_rgba(34,197,94,0.6)] z-10" />
                        )}
                      </div>
                      
                      <div className="text-left flex-1 min-w-0">
                        <h4 className={cn("text-xs font-black uppercase tracking-widest truncate", conv.unreadCount > 0 ? "text-[#FF4B91] font-black" : "text-white")}>
                          {conv.otherUser.fullName}
                        </h4>
                        <p className={cn("text-[11px] truncate mt-0.5 pr-2 font-medium", conv.unreadCount > 0 ? "text-white font-bold" : "text-gray-400")}>
                          {conv.lastMessage.senderId === currentUser.uid ? 'You: ' : ''}
                          {conv.lastMessage.text}
                        </p>
                      </div>
                      
                      <div className="text-right flex-shrink-0 flex flex-col items-end space-y-1 justify-center">
                        <span className={cn("text-[8px] font-mono", conv.unreadCount > 0 ? "text-pink-400 font-bold" : "text-gray-600")}>
                          {conv.lastMessage.createdAt?.toDate ? conv.lastMessage.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-5 h-5 px-1.5 bg-[#FF4B91] text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
                            {conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-28 text-center space-y-4 select-none px-6">
                  <div className="w-14 h-14 bg-gray-900 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-pink-500/75 animate-bounce" />
                  </div>
                  <div>
                    <h3 className="text-neutral-500 text-xs font-black uppercase tracking-widest">{getTranslation(appLanguage, 'noMessages')}</h3>
                    <p className="text-[9px] text-neutral-600 mt-1 uppercase font-bold tracking-wider max-w-[200px] leading-relaxed">
                      Search above to start a conversation with any verified user instantly!
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
