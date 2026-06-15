import React, { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, getDoc, orderBy, limit, arrayUnion, arrayRemove
} from 'firebase/firestore';
import { UserProfile, ChatRoom, Message, REGIONS } from '../types';
import { Users, Send, Image, X, ArrowLeft, PlusCircle, Sparkles, MessageCircle, MoreVertical, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface MeetingsViewProps {
  currentUser: UserProfile;
}

export default function MeetingsView({ currentUser }: MeetingsViewProps) {
  const [meetingRooms, setMeetingRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  
  // Custom meeting builder modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomRegion, setNewRoomRegion] = useState('성안길(시내)');

  // File Upload states inside Meetings Chat
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [bannedKeywords, setBannedKeywords] = useState<string[]>(['시발', '개새끼', '바보', '미친', '좆']);

  // Pre-seed default Cheongju community meetings list definition
  const defaultMeetingSeeds = [
    { id: 'meet_cheongju_free', title: '청주 자유톡', desc: '아무 이야기나 자유롭게 나누는 소통방 💬', region: '사창동' },
    { id: 'meet_chungbuk_friend', title: '충북대 친구방', desc: '충북대학교 주변 청년들의 실시간 네트워킹 🏫', region: '성안길(시내)' },
    { id: 'meet_cheongju_univ', title: '청주대 친구방', desc: '청주대학교 주변 이웃 청년 모임', region: '사창동' },
    { id: 'meet_seongangil_play', title: '성안길 놀 사람', desc: '시내 투어, 번개 약속, 오프라인 모임 매칭 ⚡', region: '성안길(시내)' },
    { id: 'meet_cafe_tour', title: '카페 같이 갈 사람', desc: '청주 소문난 예쁜 감성 카페 탐방러 모임 ☕', region: '동남지구' },
    { id: 'meet_soccer_futsal', title: '운동/축구방', desc: '풋살, 헬스, 러닝 메이트 구하는 청춘방 ⚽', region: '복대동(지웰)' },
    { id: 'meet_career_study', title: '취업/자기계발방', desc: '스터디 모집, 자격증, 취업 꿀팁 공유방 📚', region: '개신동' },
    { id: 'meet_eo_dream', title: '이어드림 활동방', desc: '이어드림 서포터즈 및 청주시 청년 꿀혜택 정보 교류 🌟', region: '율량동' }
  ];

  // Fetch admin settings for slang filter
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

  // Fetch meeting rooms and Seed missing ones automatically
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'chatRooms';
    const q = query(collection(db, path), where('type', '==', 'meeting'));

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const list: ChatRoom[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as ChatRoom);
      });

      // If missing default seeds, bootstrap them silently in Firestore
      if (list.length === 0) {
        setLoading(true);
        try {
          for (const seed of defaultMeetingSeeds) {
            const seedRef = doc(db, 'chatRooms', seed.id);
            const seedPayload: ChatRoom = {
              roomId: seed.id,
              type: 'meeting',
              title: seed.title,
              description: seed.desc,
              region: seed.region,
              members: [currentUser.userId], // Initially seed with the current creator
              createdAt: new Date().toISOString(),
              createdBy: 'system',
              lastMessage: '환영합니다! 모임방이 성공적으로 열렸습니다.',
              lastMessageAt: new Date().toISOString()
            };
            await setDoc(seedRef, seedPayload).catch((err) => {
              handleFirestoreError(err, OperationType.CREATE, `chatRooms/${seed.id}`);
            });
          }
        } catch (err) {
          console.error('Error seeding default meetings: ', err);
        } finally {
          setLoading(false);
        }
      } else {
        // Sort rooms by creation or last message
        list.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
        setMeetingRooms(list);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [currentUser.userId]);

  // Load active group room messages
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
      snapshot.forEach(d => {
        list.push(d.data() as Message);
      });
      setMessages(list);
      scrollToBottom();
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [activeRoomId]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Draggable Dropzone processing
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

    if (file.size > 800 * 1024) {
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

  // Filter bad words
  const filterSlangWords = (inputText: string): string => {
    let filteredText = inputText;
    bannedKeywords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filteredText = filteredText.replace(regex, '***');
    });
    return filteredText;
  };

  // Send message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoomId) return;
    if (!text.trim() && !selectedImage) return;

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
      // Create message document
      await setDoc(doc(db, 'chatRooms', activeRoomId, 'messages', msgId), newMsg).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      // Update room last updated details
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

  // Join a meeting group
  const handleJoinRoom = async (room: ChatRoom) => {
    const path = `chatRooms/${room.roomId}`;
    try {
      await updateDoc(doc(db, 'chatRooms', room.roomId), {
        members: arrayUnion(currentUser.userId)
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });
      setActiveRoomId(room.roomId);
    } catch (err) {
      console.error(err);
    }
  };

  // Leave meeting group
  const handleLeaveRoom = async (roomId: string) => {
    if (!confirm('이 모임 채팅방을 나가시겠습니까?')) return;
    const path = `chatRooms/${roomId}`;
    try {
      await updateDoc(doc(db, 'chatRooms', roomId), {
        members: arrayRemove(currentUser.userId)
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });
      setActiveRoomId(null);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete Room if custom created and I am owner or admin
  const handleDeleteRoom = async (room: ChatRoom) => {
    if (!confirm('정말 이 모임방을 완전히 삭제하시겠습니까? (방장 및 관리자 전용)')) return;
    const path = `chatRooms/${room.roomId}`;
    try {
      await deleteDoc(doc(db, 'chatRooms', room.roomId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      alert('모임방이 삭제되었습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Create Custom Room Submit
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomTitle.trim() || !newRoomDesc.trim()) return;

    const roomId = `meet_custom_${Date.now()}`;
    const path = `chatRooms/${roomId}`;
    
    try {
      const newRoomPayload: ChatRoom = {
        roomId,
        type: 'meeting',
        title: newRoomTitle,
        description: newRoomDesc,
        region: newRoomRegion,
        members: [currentUser.userId],
        createdAt: new Date().toISOString(),
        createdBy: currentUser.userId,
        lastMessage: '새로운 지역 모임방이 성공적으로 열렸습니다. 🙌',
        lastMessageAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'chatRooms', roomId), newRoomPayload).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      alert(`'${newRoomTitle}' 단체방을 생성했습니다.`);
      setShowCreateModal(false);
      setNewRoomTitle('');
      setNewRoomDesc('');
      setActiveRoomId(roomId);
    } catch (err) {
      console.error(err);
    }
  };

  const activeRoom = meetingRooms.find(r => r.roomId === activeRoomId);
  const isMemberOfActive = activeRoom?.members.includes(currentUser.userId);

  // Group Details View
  if (activeRoomId && activeRoom) {
    return (
      <div className="flex flex-col h-screen max-h-screen bg-brand-cream pb-[60px] relative">
        {/* Header */}
        <div className="bg-brand-bg border-b-2 border-brand-border px-4 py-3 flex items-center justify-between sticky top-0 z-20 shadow-xs">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveRoomId(null)}
              className="p-1.5 hover:bg-brand-cream hover:border-brand-border/40 border border-transparent rounded-xl transition-all text-brand-green font-bold"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h3 className="font-extrabold text-brand-green text-sm flex items-center gap-1.5 leading-tight">
                {activeRoom.title} 
                <span className="text-[10px] bg-brand-yellow text-brand-green font-extrabold px-2 py-0.5 rounded-full border border-brand-border">
                  #{activeRoom.region || '청주'}
                </span>
              </h3>
              <p className="text-[10px] text-stone-500 mt-0.5 max-w-[200px] line-clamp-1 font-bold">{activeRoom.description}</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <span className="text-xs bg-brand-sand text-brand-green border border-brand-border font-extrabold px-2 py-1 rounded-lg flex items-center gap-1 shadow-xs">
              <Users className="w-3.5 h-3.5" /> {activeRoom.members.length}명
            </span>
            {isMemberOfActive && (
              <button
                onClick={() => handleLeaveRoom(activeRoom.roomId)}
                className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 font-extrabold px-2.5 py-1 rounded-lg transition-colors border border-rose-200/50"
              >
                나가기
              </button>
            )}
          </div>
        </div>

        {/* Message Panel */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {!isMemberOfActive ? (
            <div className="text-center py-16 bg-brand-bg border-4 border-brand-border rounded-[28px] p-6 shadow-sm max-w-sm mx-auto space-y-4 my-8">
              <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center mx-auto text-brand-green border border-brand-border">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h4 className="font-extrabold text-brand-green text-base">모임 대화방 참가하기</h4>
                <p className="text-xs text-stone-600 mt-1.5 leading-relaxed font-semibold">
                  이 모임방은 청주 지역 이웃 청년들이 모여있습니다.<br/>들어가서 정겨운 교류를 시작해보세요!
                </p>
              </div>
              <button
                onClick={() => handleJoinRoom(activeRoom)}
                className="w-full bg-brand-green hover:bg-brand-green/95 text-white font-extrabold py-3.5 rounded-full text-xs transition-colors border border-brand-border shadow-md"
              >
                모임방 채널 입장하기
              </button>
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-20 text-stone-500">
              <div className="w-12 h-12 bg-brand-yellow border border-brand-border rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-5 h-5 text-brand-green" />
              </div>
              <p className="text-xs font-bold">이 모임방의 첫 마디를 보내 시작해 보세요! ✨</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.senderId === currentUser.userId;
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
                        <div className={`p-3 rounded-2xl text-xs leading-relaxed break-all border shadow-xs ${isMine ? 'bg-brand-green text-white border-brand-border rounded-tr-none font-bold' : 'bg-brand-bg text-brand-dark border-brand-border rounded-tl-none font-medium'}`}>
                          {msg.imageUrl && (
                            <div className="mb-2 max-w-[200px] rounded-xl overflow-hidden shadow-xs border border-brand-border bg-brand-sand">
                              <img src={msg.imageUrl} referrerPolicy="no-referrer" alt="Attached" className="w-full h-auto object-cover animate-fade-in" />
                            </div>
                          )}
                          {msg.text && <p className="whitespace-pre-wrap">{msg.text}</p>}
                        </div>

                        <div className="text-right space-y-0.5 flex-shrink-0">
                          <span className="text-[9px] text-stone-500 block font-mono font-bold">
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

        {/* Drag over overlay mask */}
        {isDragOver && isMemberOfActive && (
          <div 
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="absolute inset-0 bg-brand-yellow/30 border-4 border-dashed border-brand-green rounded-2xl flex items-center justify-center z-50 p-6 pointer-events-auto"
          >
            <div className="bg-brand-bg border-4 border-brand-border p-5 rounded-[28px] shadow-xl text-center space-y-2">
              <Image className="w-10 h-10 text-brand-green mx-auto animate-bounce" />
              <p className="text-sm font-extrabold text-brand-green">모임방 이미지 내려놓기</p>
              <p className="text-xs text-stone-500 font-bold">(800KB 이하만 사용 가능)</p>
            </div>
          </div>
        )}

        {/* Input Footer */}
        {isMemberOfActive && (
          <div 
            onDragOver={handleDragOver}
            className="bg-brand-bg border-t-2 border-brand-border p-3 sticky bottom-0 z-20 pb-5"
          >
            {/* DRAGGABLE & CLICKABLE DRIP-ZONE BANNER PREVIEW */}
            <AnimatePresence>
              {selectedImage && isMemberOfActive && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-brand-sand border border-brand-border rounded-xl p-3 flex gap-3 items-center mb-3"
                >
                  <div className="relative w-16 h-16 rounded-xl border-2 border-brand-border overflow-hidden bg-white shadow-xs flex-shrink-0">
                    <img src={selectedImage} alt="Preview" className="w-full h-full object-cover" />
                    <button 
                      type="button"
                      onClick={() => setSelectedImage(null)}
                      className="absolute top-1 right-1 bg-brand-green hover:bg-brand-orange text-white rounded-full p-1 transition-all"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-brand-green">모임방 이미지 첨부됨</p>
                    <p className="text-[10px] text-stone-500 font-bold">전송 시 단체 채널에 실시간 공유됩니다.</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSendMessage} className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-3 bg-brand-sand hover:bg-brand-yellow/30 border border-brand-border rounded-xl transition-all text-brand-green flex-shrink-0 font-bold"
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
                placeholder="청주 청년들과 함께 공유할 대화를 나누어보세요..."
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
          </div>
        )}
      </div>
    );
  }

  // General Meeting room list
  return (
    <div className="flex flex-col h-full bg-brand-bg pb-24">
      <div className="bg-brand-bg border-b-2 border-brand-border px-4 pt-4 pb-3 sticky top-0 z-20 flex justify-between items-center shadow-[0_2px_8px_rgba(0,45,-32,0.02)]">
        <div>
          <h2 className="text-xl font-black text-brand-green tracking-tight flex items-center gap-1.5">
            청주 청년 <span className="text-brand-orange">모임방</span>
          </h2>
          <p className="text-[10px] text-stone-500 mt-0.5 font-bold">지역 대학생 및 직장인들과 소모임을 꾸려 소통하세요.</p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-brand-orange hover:bg-brand-orange/90 text-white text-xs font-extrabold px-3.5 py-2.5 rounded-full border border-brand-border transition-all shadow-sm flex items-center gap-1"
        >
          <PlusCircle className="w-4 h-4" /> 방 개설
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-3 border-brand-green border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-stone-500 font-bold">모임방 정보를 불러오는 중...</p>
          </div>
        ) : meetingRooms.length === 0 ? (
          <p className="text-center py-10 text-stone-400 font-bold">모임방 개설을 클릭해 첫 방문을 시작해보세요!</p>
        ) : (
          meetingRooms.map(room => {
            const isMember = room.members.includes(currentUser.userId);
            const canDelete = room.createdBy === currentUser.userId || currentUser.role === 'admin';

            return (
              <div
                key={room.roomId}
                onClick={() => setActiveRoomId(room.roomId)}
                className="bg-brand-sand border border-brand-border rounded-[28px] p-5 shadow-xs hover:border-brand-orange/40 transition-all cursor-pointer relative"
              >
                <div className="flex justify-between items-start">
                  <span className="text-[10px] bg-brand-yellow text-brand-green border border-brand-border font-extrabold px-2.5 py-0.5 rounded-full mb-2 inline-block">
                    {room.region}
                  </span>
                  
                  {canDelete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoom(room);
                      }}
                      className="text-stone-400 hover:text-rose-600 p-1.5 rounded-lg transition-colors border border-transparent hover:border-brand-border/40"
                      title="방 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <h3 className="font-extrabold text-brand-green text-sm flex items-center gap-1.5">
                    {room.title}
                  </h3>
                  <p className="text-xs text-stone-600 leading-relaxed max-w-[270px] font-medium">
                    {room.description}
                  </p>
                </div>

                {/* Info Footer */}
                <div className="mt-4 pt-3 border-t border-brand-border/40 flex justify-between items-center text-xs text-stone-500 font-bold">
                  <div className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-brand-orange" />
                    <span>실시간 {room.members.length}명 참여중</span>
                  </div>

                  <span className={`font-black px-3 py-1 rounded-full text-[10px] border transition-all ${isMember ? 'bg-brand-yellow text-brand-green border-brand-border shadow-xs' : 'bg-brand-bg text-brand-green border-brand-border'}`}>
                    {isMember ? '입장 완료' : '들어가기'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CREATE NEW ROOM MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-brand-green/45 backdrop-blur-xs flex items-center justify-center p-6 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-brand-bg border-4 border-brand-green rounded-[32px] max-w-sm w-full p-6 shadow-2xl relative"
          >
            <button 
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-brand-green hover:text-brand-orange text-2xl font-black transition-colors"
            >
              &times;
            </button>

            <h3 className="text-base font-black text-brand-green mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-brand-orange" /> 청주 맞춤 모임방 개설
            </h3>

            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="text-xs font-extrabold text-brand-green mb-1 block">모임방 이름</label>
                <input 
                  type="text"
                  required
                  placeholder="예: 복대동 맛집 같이 가요!"
                  value={newRoomTitle}
                  onChange={(e) => setNewRoomTitle(e.target.value)}
                  className="w-full bg-brand-sand border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange placeholder:text-stone-400 font-bold text-brand-green"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-brand-green mb-1 block">서브 소개 문구</label>
                <textarea
                  required
                  rows={2}
                  placeholder="모이는 시간, 주제, 대상 등을 간단히 적어주세요."
                  value={newRoomDesc}
                  onChange={(e) => setNewRoomDesc(e.target.value)}
                  className="w-full bg-brand-sand border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange placeholder:text-stone-400 font-bold text-brand-green resize-none"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-brand-green mb-1 block">활동 동네(지역) 지정</label>
                <select 
                  value={newRoomRegion}
                  onChange={(e) => setNewRoomRegion(e.target.value)}
                  className="w-full bg-brand-sand border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange font-bold text-brand-green"
                >
                  {REGIONS.map(reg => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white font-black py-3 rounded-full border border-brand-border text-xs transition-colors shadow-sm"
              >
                모임방 생성 및 자동 참여
              </button>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
