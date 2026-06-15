import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, addDoc, getDoc, orderBy, limit, writeBatch
} from 'firebase/firestore';
import { UserProfile, ChatRoom, Message } from '../types';
import { Send, Image, X, ArrowLeft, MoreVertical, LogOut, Check, CheckCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatsViewProps {
  currentUser: UserProfile;
  activeRoomId: string | null;
  onSelectRoom: (roomId: string | null) => void;
}

export default function ChatsView({ currentUser, activeRoomId, onSelectRoom }: ChatsViewProps) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [roomUsers, setRoomUsers] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  
  // File Upload states (with Drag & Drop support)
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Custom slang filtering (금칙어)
  const [bannedKeywords, setBannedKeywords] = useState<string[]>(['시발', '개새끼', '바보', '미친', '좆']);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showRoomMenu, setShowRoomMenu] = useState(false);

  // Fetch administrator bad words list
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'adminSettings/badWords';
    const unsub = onSnapshot(doc(db, 'adminSettings', 'badWords'), (snap) => {
      if (snap.exists()) {
        const words = snap.data().words as string[];
        if (words && words.length > 0) {
          setBannedKeywords(words);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    });
    return () => unsub();
  }, []);

  // Fetch Rooms list
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'chatRooms';
    const q = query(
      collection(db, path),
      where('type', '==', 'direct'),
      where('members', 'array-contains', currentUser.userId)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list: ChatRoom[] = [];
      const userIdsToFetch = new Set<string>();

      snapshot.forEach((d) => {
        const r = d.data() as ChatRoom;
        list.push(r);
        r.members.forEach(m => {
          if (m !== currentUser.userId) userIdsToFetch.add(m);
        });
      });

      // Sort by last message date desc in-memory
      list.sort((a,b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime());
      setRooms(list);

      // Fetch other user profile data to display real-time nicknames and avatars
      for (const uId of Array.from(userIdsToFetch)) {
        if (!roomUsers[uId]) {
          const userSnap = await getDoc(doc(db, 'users', uId));
          if (userSnap.exists()) {
            setRoomUsers(prev => ({
              ...prev,
              [uId]: userSnap.data() as UserProfile
            }));
          }
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [currentUser.userId]);

  // Handle active room messages subscription
  useEffect(() => {
    if (!auth.currentUser) return;
    if (!activeRoomId) {
      setMessages([]);
      return;
    }

    const path = `chatRooms/${activeRoomId}/messages`;
    const q = query(
      collection(db, path),
      orderBy('createdAt', 'asc'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Message[] = [];
      const batchUpdateRefs: any[] = [];

      snapshot.forEach((d) => {
        const msg = d.data() as Message;
        list.push(msg);

        // Standard read receipt functionality: If I haven't read this message, add me to readBy list
        if (!msg.readBy.includes(currentUser.userId)) {
          batchUpdateRefs.push(d.ref);
        }
      });

      setMessages(list);
      scrollToBottom();

      // Read receipts sync batch update
      if (batchUpdateRefs.length > 0) {
        const batch = writeBatch(db);
        batchUpdateRefs.forEach(ref => {
          batch.update(ref, {
            readBy: [...(list.find(m => m.messageId === ref.id)?.readBy || []), currentUser.userId]
          });
        });
        batch.commit().catch(err => console.error('Read batch commit failed', err));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [activeRoomId, currentUser.userId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Drag & Drop File Handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const processFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 전송하실 수 있습니다.');
      return;
    }

    if (file.size > 800 * 1024) { // 800KB Limit to fit standard Firestore document limits
      alert('파일 크기가 너무 큽니다. 800KB 이하의 이미지만 가능합니다.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setSelectedImage(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  };

  // Slander filtering helper
  const filterSlangWords = (inputText: string): string => {
    let filteredText = inputText;
    bannedKeywords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filteredText = filteredText.replace(regex, '***');
    });
    return filteredText;
  };

  // Send message action
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId) return;
    if (!text.trim() && !selectedImage) return;

    // Filter bad words (금칙어 필터링)
    const cleanedText = filterSlangWords(text);

    const msgId = `msg_${Date.now()}`;
    const path = `chatRooms/${activeRoomId}/messages/${msgId}`;

    const newMsg: Message = {
      messageId: msgId,
      senderId: currentUser.userId,
      senderName: currentUser.nickname,
      senderProfile: currentUser.profileImage || '',
      text: cleanedText || '',
      imageUrl: selectedImage || undefined,
      readBy: [currentUser.userId],
      createdAt: new Date().toISOString()
    };

    setText('');
    setSelectedImage(null);

    try {
      // 1. Create message document
      await setDoc(doc(db, 'chatRooms', activeRoomId, 'messages', msgId), newMsg).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      // 2. Update room's last message
      const roomPath = `chatRooms/${activeRoomId}`;
      await updateDoc(doc(db, 'chatRooms', activeRoomId), {
        lastMessage: selectedImage ? '📷 사진을 전송했습니다.' : cleanedText,
        lastMessageAt: new Date().toISOString()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, roomPath);
        throw err;
      });

      scrollToBottom();
    } catch (err) {
      console.error(err);
    }
  };

  // Leave active room
  const handleLeaveRoom = async () => {
    if (!activeRoomId) return;
    if (!confirm('정말 이 채팅방을 나가시겠습니까? 대화 기록이 완전히 지워집니다.')) return;

    const path = `chatRooms/${activeRoomId}`;
    try {
      const roomRef = doc(db, 'chatRooms', activeRoomId);
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const room = roomSnap.data() as ChatRoom;
        
        // Filter ourselves out of membership
        const remainingMembers = room.members.filter(uid => uid !== currentUser.userId);

        if (remainingMembers.length === 0) {
          // No members left -> Delete room
          await deleteDoc(roomRef).catch((err) => {
            handleFirestoreError(err, OperationType.DELETE, path);
            throw err;
          });
        } else {
          // Simply update membership
          await updateDoc(roomRef, {
            members: remainingMembers
          }).catch((err) => {
            handleFirestoreError(err, OperationType.UPDATE, path);
            throw err;
          });
        }
      }
      
      setShowRoomMenu(false);
      onSelectRoom(null);
      alert('채팅방을 성공적으로 퇴장했습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Render individual chat list item
  const renderRoomItem = (room: ChatRoom) => {
    const companionId = room.members.find(uid => uid !== currentUser.userId) || '';
    const companion = roomUsers[companionId];
    
    // Fallback if not loaded yet
    const displayTitle = companion ? companion.nickname : room.title;
    const displayAvatar = companion ? companion.profileImage : `https://api.dicebear.com/7.x/adventurer/svg?seed=${companionId}`;
    const displayStatus = companion ? companion.statusMessage : '';

    return (
      <div
        key={room.roomId}
        onClick={() => onSelectRoom(room.roomId)}
        className="bg-brand-sand border border-brand-border rounded-2xl p-4 shadow-sm flex items-center justify-between hover:border-brand-orange/40 transition-all cursor-pointer"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <img 
              src={displayAvatar} 
              alt="Avatar" 
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full border-2 border-brand-border object-cover bg-white" 
            />
            {companion && !companion.banned && (
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-emerald-500 border-2 border-brand-bg rounded-full"></span>
            )}
          </div>
          <div>
            <h4 className="font-extrabold text-brand-green text-sm">{displayTitle}</h4>
            <p className="text-xs text-stone-500 line-clamp-1 mt-0.5 font-medium">
              {room.lastMessage || '대화를 시작하세요!'}
            </p>
          </div>
        </div>

        <div className="text-right">
          <span className="text-[10px] text-stone-400 block font-mono font-bold">
            {room.lastMessageAt ? new Date(room.lastMessageAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
          </span>
        </div>
      </div>
    );
  };

  // Active chat companion
  const activeRoom = rooms.find(r => r.roomId === activeRoomId);
  const companionId = activeRoom?.members.find(uid => uid !== currentUser.userId) || '';
  const companionUser = roomUsers[companionId];
  const activeRoomTitle = companionUser ? companionUser.nickname : (activeRoom?.title || '이어톡 대화');
  const activeRoomAvatar = companionUser ? companionUser.profileImage : `https://api.dicebear.com/7.x/adventurer/svg?seed=${companionId}`;

  // If inside active room detail
  if (activeRoomId) {
    return (
      <div className="flex flex-col h-screen max-h-screen bg-brand-cream relative pb-[60px]">
        {/* Header */}
        <div className="bg-brand-bg border-b-2 border-brand-border px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onSelectRoom(null)}
              className="p-1.5 hover:bg-brand-cream hover:border-brand-border/40 border border-transparent rounded-xl transition-all text-brand-green"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <img 
                src={activeRoomAvatar} 
                alt="Avatar" 
                referrerPolicy="no-referrer"
                className="w-9 h-9 rounded-full object-cover border-2 border-brand-border bg-white" 
              />
              <div>
                <h3 className="font-extrabold text-brand-green text-sm leading-tight">{activeRoomTitle}</h3>
                <span className="text-[10px] text-brand-green font-bold flex items-center gap-1 mt-0.5">
                  <span className="w-2 h-2 bg-brand-yellow border border-brand-green rounded-full animate-pulse"></span> 1:1 이어톡 활성화
                </span>
              </div>
            </div>
          </div>

          <div className="relative">
            <button 
              onClick={() => setShowRoomMenu(!showRoomMenu)}
              className="p-1.5 hover:bg-brand-cream rounded-xl border border-transparent hover:border-brand-border/40 transition-all text-brand-green"
            >
              <MoreVertical className="w-5 h-5" />
            </button>

            {showRoomMenu && (
              <div className="absolute right-0 mt-1 bg-brand-bg border-2 border-brand-border rounded-2xl shadow-lg p-1.5 w-36 z-30">
                <button
                  onClick={handleLeaveRoom}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" /> 채팅방 나가기
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Message Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-20 text-stone-500">
              <div className="w-12 h-12 bg-brand-yellow border border-brand-border rounded-full flex items-center justify-center mx-auto mb-3">
                <Send className="w-5 h-5 text-brand-green translate-x-0.5 -translate-y-0.5" />
              </div>
              <p className="text-xs font-bold">상대방에게 반가운 인사를 보내 대화를 열어보세요!</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.senderId === currentUser.userId;
              
              // Formatting dates
              const showDateDivider = idx === 0 || 
                new Date(messages[idx-1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

              return (
                <div key={msg.messageId} className="space-y-2">
                  {showDateDivider && (
                    <div className="flex justify-center my-4">
                      <span className="bg-brand-yellow/50 border border-brand-border/40 text-brand-green text-[10px] font-extrabold px-3 py-1 rounded-full">
                        {new Date(msg.createdAt).toLocaleDateString([], {year: 'numeric', month: 'long', day: 'numeric'})}
                      </span>
                    </div>
                  )}

                  <div className={`flex items-start gap-2.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {!isMine && (
                      <img 
                        src={msg.senderProfile || `https://api.dicebear.com/7.x/adventurer/svg?seed=${msg.senderId}`} 
                        alt="Profile" 
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-full border border-brand-border bg-white object-cover mt-0.5" 
                      />
                    )}

                    <div className={`max-w-[70%] space-y-0.5 ${isMine ? 'text-right' : 'text-left'}`}>
                      {!isMine && (
                        <span className="text-[10px] font-bold text-brand-green ml-1">
                          {msg.senderName}
                        </span>
                      )}

                      <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                        {/* Text / Image balloon wrapper */}
                        <div className={`p-3 rounded-2xl text-xs leading-relaxed break-all shadow-xs border ${isMine ? 'bg-brand-yellow text-brand-green border-brand-border rounded-tr-none font-bold' : 'bg-brand-bg text-brand-dark border-brand-border rounded-tl-none font-medium'}`}>
                          {msg.imageUrl && (
                            <div className="mb-2 max-w-[200px] rounded-xl overflow-hidden shadow-xs border border-brand-border bg-brand-sand">
                              <img src={msg.imageUrl} referrerPolicy="no-referrer" alt="Attached" className="w-full h-auto object-cover" />
                            </div>
                          )}
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>

                        {/* Read/Time Indicators */}
                        <div className="text-right space-y-0.5 flex-shrink-0">
                          {/* Unread receipt indicator: 1:1 direct room has exactly 2 members. If readBy < 2, and it's mine, show single block */}
                          {isMine && (
                            <span className="text-[9px] block text-brand-orange font-black mr-0.5 animate-pulse">
                              {msg.readBy.length < 2 ? '1' : ''}
                            </span>
                          )}
                          <span className="text-[9px] text-stone-400 block font-mono font-bold">
                            {new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* DRAGGABLE & CLICKABLE DRIP-ZONE BANNER PREVIEW */}
        <AnimatePresence>
          {selectedImage && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-brand-sand border-t-2 border-brand-border p-3 flex gap-3 items-center"
            >
              <div className="relative w-16 h-16 rounded-xl border-2 border-brand-border overflow-hidden bg-white shadow-sm flex-shrink-0">
                <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute top-1 right-1 bg-brand-green hover:bg-brand-orange text-white rounded-full p-1 transition-all"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
              <div>
                <p className="text-xs font-extrabold text-brand-green">전송할 이미지 준비 완료</p>
                <p className="text-[10px] text-stone-500 font-bold">메시지와 함께 전송됩니다.</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drag to drop mask overlay */}
        {isDragOver && (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="absolute inset-0 bg-brand-yellow/30 border-4 border-dashed border-brand-green rounded-2xl flex items-center justify-center z-50 p-6 pointer-events-auto"
          >
            <div className="bg-brand-bg border-4 border-brand-border p-5 rounded-[28px] shadow-xl text-center space-y-2">
              <Image className="w-10 h-10 text-brand-green mx-auto animate-bounce" />
              <p className="text-sm font-extrabold text-brand-green">여기에 이미지를 내립니다.</p>
              <p className="text-xs text-stone-500 font-bold">(800KB 이하의 파일만 지원)</p>
            </div>
          </div>
        )}

        {/* Input Footer with Drag & Drop entry points */}
        <div 
          onDragOver={handleDragOver}
          className="bg-brand-bg border-t-2 border-brand-border p-3 sticky bottom-0 z-20 pb-5"
        >
          <form onSubmit={handleSendMessage} className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-brand-sand hover:bg-brand-yellow/30 border border-brand-border rounded-xl transition-all text-brand-green flex-shrink-0 font-bold"
              title="이미지 파일 추가"
            >
              <Image className="w-5 h-5" />
            </button>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*"
              className="hidden" 
            />

            <input 
              type="text" 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="따뜻한 청주 청년 메시지를 작성해주세요..."
              className="flex-1 bg-brand-sand border border-brand-border rounded-xl px-4 py-3 text-xs focus:outline-none focus:border-brand-orange placeholder:text-stone-400 font-bold text-brand-green"
            />
            
            <button
              type="submit"
              disabled={!text.trim() && !selectedImage}
              className="p-3 bg-brand-green disabled:bg-stone-100 text-white disabled:text-stone-400 rounded-xl transition-all flex-shrink-0 shadow-sm border border-brand-border"
            >
              <Send className="w-5 h-5 translate-x-0.5 -translate-y-0.5" />
            </button>
          </form>
          <p className="text-[9px] text-stone-500 mt-1.5 text-center font-bold">
            이미지 파일을 드래그하여 채팅 창에 올려놓아도 손쉽게 전송할 수 있습니다. 🖲️
          </p>
        </div>
      </div>
    );
  }

  // If viewing the general list of chat rooms
  return (
    <div className="flex flex-col h-full bg-brand-bg pb-24">
      <div className="bg-brand-bg border-b-2 border-brand-border px-4 pt-4 pb-3 sticky top-0 z-20 shadow-[0_2px_8px_rgba(0,45,-32,0.02)]">
        <h2 className="text-xl font-black text-brand-green tracking-tight">
          실시간 <span className="text-brand-orange">채팅</span>
        </h2>
        <p className="text-[10px] text-stone-500 mt-0.5 font-bold">이웃과의 실시간 메세지가 안전하게 필터링 및 조율됩니다.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {rooms.length === 0 ? (
          <div className="bg-brand-sand border-2 border-brand-border rounded-[28px] p-12 text-center text-stone-500 text-sm">
            <p className="font-extrabold text-brand-green mb-2">대화 중인 채팅방이 없습니다.</p>
            <p className="text-xs text-stone-600 font-medium">친구 탭에서 이웃들의 인연 카드를 열고 1:1 대화를 걸어 소통을 넓혀 보세요!</p>
          </div>
        ) : (
          rooms.map(room => renderRoomItem(room))
        )}
      </div>
    </div>
  );
}
