import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, query, where, getDocs, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, serverTimestamp, writeBatch, getDoc 
} from 'firebase/firestore';
import { UserProfile, FriendRelation, FriendRequest, RoomType, ChatRoom, REGIONS, SCHOOLS } from '../types';
import { Search, UserPlus, UserCheck, MessageSquare, ShieldAlert, UserX, UserMinus, ToggleLeft, ToggleRight, ArrowRightLeft } from 'lucide-react';
import { motion } from 'motion/react';

interface FriendsProps {
  currentUser: UserProfile;
  onNavigateToChat: (roomId: string) => void;
}

export default function FriendsView({ currentUser, onNavigateToChat }: FriendsProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'search' | 'requests' | 'blocked'>('list');
  const [friends, setFriends] = useState<FriendRelation[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all' | 'region' | 'school' | 'interests'>('all');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  
  // Detail Modal
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Reporting state
  const [reportingUser, setReportingUser] = useState<UserProfile | null>(null);
  const [reportReason, setReportReason] = useState('사칭/보이스피싱');
  const [reportDetail, setReportDetail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  // Load friends
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = `users/${currentUser.userId}/friends`;
    const q = query(collection(db, path));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: FriendRelation[] = [];
      snapshot.forEach((doc) => {
        list.push(doc.data() as FriendRelation);
      });
      setFriends(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, [currentUser.userId]);

  // Load friend requests
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'friendRequests';
    
    // Incoming requests: toUserId == currentUser
    const qIncoming = query(
      collection(db, path), 
      where('toUserId', '==', currentUser.userId),
      where('status', '==', 'pending')
    );
    const unsubIncoming = onSnapshot(qIncoming, (snapshot) => {
      const reqs: FriendRequest[] = [];
      snapshot.forEach((d) => {
        reqs.push(d.data() as FriendRequest);
      });
      setIncomingRequests(reqs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    // Outgoing requests: fromUserId == currentUser
    const qOutgoing = query(
      collection(db, path), 
      where('fromUserId', '==', currentUser.userId),
      where('status', '==', 'pending')
    );
    const unsubOutgoing = onSnapshot(qOutgoing, (snapshot) => {
      const reqs: FriendRequest[] = [];
      snapshot.forEach((d) => {
        reqs.push(d.data() as FriendRequest);
      });
      setOutgoingRequests(reqs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => {
      unsubIncoming();
      unsubOutgoing();
    };
  }, [currentUser.userId]);

  // Search Action
  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setLoading(true);
    setSearchResults([]);
    const path = 'users';
    
    try {
      const q = query(collection(db, path));
      const snapshot = await getDocs(q).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        throw err;
      });

      const list: UserProfile[] = [];
      const queryLower = searchQuery.toLowerCase().trim();

      snapshot.forEach((doc) => {
        const u = doc.data() as UserProfile;
        
        // Exclude self and banned users
        if (u.userId === currentUser.userId || u.banned) return;

        let match = false;
        
        if (searchFilter === 'all') {
          const nicknameMatch = u.nickname.toLowerCase().includes(queryLower);
          const eeortalkIdMatch = u.eeortalkId.toLowerCase().includes(queryLower);
          const regionMatch = u.region?.toLowerCase().includes(queryLower);
          const schoolMatch = u.school?.toLowerCase().includes(queryLower);
          const interestsMatch = u.interests?.some(i => i.toLowerCase().includes(queryLower));
          match = nicknameMatch || eeortalkIdMatch || !!regionMatch || !!schoolMatch || !!interestsMatch;
        } else if (searchFilter === 'region') {
          match = !!u.region?.toLowerCase().includes(queryLower);
        } else if (searchFilter === 'school') {
          match = !!u.school?.toLowerCase().includes(queryLower);
        } else if (searchFilter === 'interests') {
          match = !!u.interests?.some(i => i.toLowerCase().includes(queryLower));
        }

        if (match) {
          list.push(u);
        }
      });

      setSearchResults(list);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Send Friend Request
  const sendFriendRequest = async (targetUser: UserProfile) => {
    const rId = `${currentUser.userId}_${targetUser.userId}`;
    const path = `friendRequests/${rId}`;
    
    try {
      // Setup payload matching spec
      const requestPayload: FriendRequest = {
        requestId: rId,
        fromUserId: currentUser.userId,
        fromNickname: currentUser.nickname,
        fromProfileImage: currentUser.profileImage || '',
        toUserId: targetUser.userId,
        status: 'pending',
        createdAt: new Date().toISOString() // serverTimestamp is ideal, string timestamp fits the blueprint schema format
      };

      await setDoc(doc(db, 'friendRequests', rId), requestPayload).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      alert(`${targetUser.nickname}님에게 친구 신청을 보냈습니다.`);
      // Refresh search results to reflect changes or set local state
      handleSearch();
    } catch (err) {
      console.error(err);
    }
  };

  // Accept Friend Request
  const acceptRequest = async (request: FriendRequest) => {
    const requestPath = `friendRequests/${request.requestId}`;
    
    try {
      // 1. Update friend request status to accepted
      await updateDoc(doc(db, 'friendRequests', request.requestId), {
        status: 'accepted'
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, requestPath);
        throw err;
      });

      // 2. Fetch target user's details to write to our friends list
      const targetUserRef = doc(db, 'users', request.fromUserId);
      const targetSnap = await getDoc(targetUserRef);
      const targetUser = targetSnap.data() as UserProfile;

      // Add to our friends collection (users/{myUid}/friends/{friendUid})
      const myFriendsPath = `users/${currentUser.userId}/friends/${request.fromUserId}`;
      await setDoc(doc(db, 'users', currentUser.userId, 'friends', request.fromUserId), {
        friendUserId: request.fromUserId,
        nickname: targetUser.nickname,
        profileImage: targetUser.profileImage || '',
        statusMessage: targetUser.statusMessage || '',
        blocked: false,
        createdAt: new Date().toISOString()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, myFriendsPath);
        throw err;
      });

      // Add to friend's friends collection (users/{friendUid}/friends/{myUid})
      const friendFriendsPath = `users/${request.fromUserId}/friends/${currentUser.userId}`;
      await setDoc(doc(db, 'users', request.fromUserId, 'friends', currentUser.userId), {
        friendUserId: currentUser.userId,
        nickname: currentUser.nickname,
        profileImage: currentUser.profileImage || '',
        statusMessage: currentUser.statusMessage || '',
        blocked: false,
        createdAt: new Date().toISOString()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, friendFriendsPath);
        throw err;
      });

      // Clean up the request document in DB
      await deleteDoc(doc(db, 'friendRequests', request.requestId));

      alert('친구 신청을 수락했습니다!');
    } catch (err) {
      console.error(err);
    }
  };

  // Reject / Cancel Request
  const rejectRequest = async (request: FriendRequest) => {
    const path = `friendRequests/${request.requestId}`;
    try {
      await deleteDoc(doc(db, 'friendRequests', request.requestId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      alert('신청을 삭제했습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Block/Unblock Friend
  const toggleBlockFriend = async (friend: FriendRelation) => {
    const isBlocking = !friend.blocked;
    const path = `users/${currentUser.userId}/friends/${friend.friendUserId}`;
    try {
      await updateDoc(doc(db, 'users', currentUser.userId, 'friends', friend.friendUserId), {
        blocked: isBlocking
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });

      alert(isBlocking ? '해당 친구를 차단했습니다.' : '차단을 해제했습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Remove Friend Relationship
  const removeFriend = async (friendUserId: string) => {
    if (!confirm('정말 이 친구를 목록에서 삭제하시겠습니까?')) return;
    
    const myFriendsPath = `users/${currentUser.userId}/friends/${friendUserId}`;
    const friendFriendsPath = `users/${friendUserId}/friends/${currentUser.userId}`;
    
    try {
      await deleteDoc(doc(db, 'users', currentUser.userId, 'friends', friendUserId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, myFriendsPath);
        throw err;
      });
      await deleteDoc(doc(db, 'users', friendUserId, 'friends', currentUser.userId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, friendFriendsPath);
        throw err;
      });
      setSelectedUser(null);
      alert('친구가 삭제되었습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Create or Open 1:1 Chatroom
  const startChat = async (friendId: string, friendNickname: string) => {
    setSelectedUser(null);
    setLoading(true);
    const path = 'chatRooms';

    try {
      // Look for an existing direct room
      const q = query(
        collection(db, path),
        where('type', '==', 'direct'),
        where('members', 'array-contains', currentUser.userId)
      );

      const snap = await getDocs(q).catch((err) => {
        handleFirestoreError(err, OperationType.LIST, path);
        throw err;
      });

      let foundRoomId = '';
      snap.forEach((d) => {
        const room = d.data() as ChatRoom;
        if (room.members.includes(friendId)) {
          foundRoomId = room.roomId;
        }
      });

      if (foundRoomId) {
        onNavigateToChat(foundRoomId);
      } else {
        // Create a brand new direct room
        const newRoomId = `direct_${currentUser.userId}_${friendId}`;
        const roomPath = `chatRooms/${newRoomId}`;
        const newRoomPayload: ChatRoom = {
          roomId: newRoomId,
          type: 'direct',
          title: friendNickname, // In UI we display other user's name
          members: [currentUser.userId, friendId],
          lastMessage: '대화를 시작해 보세요. ✨',
          lastMessageAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          createdBy: currentUser.userId
        };

        await setDoc(doc(db, 'chatRooms', newRoomId), newRoomPayload).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, roomPath);
          throw err;
        });

        onNavigateToChat(newRoomId);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Submit Report
  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingUser) return;
    
    setReportSubmitting(true);
    const rId = `report_${Date.now()}`;
    const path = `reports/${rId}`;

    try {
      await setDoc(doc(db, 'reports', rId), {
        reportId: rId,
        reporterId: currentUser.userId,
        reporterEmail: currentUser.email,
        targetUserId: reportingUser.userId,
        targetNickname: reportingUser.nickname,
        reason: reportReason,
        detail: reportDetail,
        status: 'pending',
        createdAt: new Date().toISOString()
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      alert('신고가 성공적으로 접수되었습니다. 관리자 확인 후 즉시 조치됩니다.');
      setReportingUser(null);
      setReportDetail('');
    } catch (err) {
      console.error(err);
    } finally {
      setReportSubmitting(false);
    }
  };

  // Open Detailed User Card
  const openUserDetail = async (userId: string) => {
    setLoading(true);
    const path = `users/${userId}`;
    try {
      const snap = await getDoc(doc(db, 'users', userId)).catch((err) => {
        handleFirestoreError(err, OperationType.GET, path);
        throw err;
      });
      if (snap.exists()) {
        setSelectedUser(snap.data() as UserProfile);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filter blocked out of general friends list
  const activeFriends = friends.filter(f => !f.blocked);
  const blockedFriends = friends.filter(f => f.blocked);

  return (
    <div className="flex flex-col h-full bg-brand-bg pb-24 relative">
      {/* Top Banner / Tab Selector */}
      <div className="bg-brand-bg border-b-2 border-brand-border px-4 pt-4 pb-2 sticky top-0 z-20 shadow-[0_2px_8px_rgba(0,45,-32,0.02)]">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black text-brand-green tracking-tight flex items-center gap-1.5">
            우리의 <span className="text-brand-orange">인연</span>
          </h2>
          <span className="text-xs bg-brand-yellow text-brand-green font-extrabold px-2.5 py-0.5 rounded-full border border-brand-border shadow-sm">
            친구 {activeFriends.length}명
          </span>
        </div>

        {/* View Tabs */}
        <div className="flex border-b border-brand-border/40">
          <button
            onClick={() => setActiveTab('list')}
            className={`flex-1 pb-2 text-center text-sm font-extrabold transition-all relative ${activeTab === 'list' ? 'text-brand-green font-black scale-102' : 'text-stone-400'}`}
          >
            목록
            {activeTab === 'list' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-brand-orange rounded-full"></span>}
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 pb-2 text-center text-sm font-extrabold transition-all relative ${activeTab === 'search' ? 'text-brand-green font-black scale-102' : 'text-stone-400'}`}
          >
            청주 친구 찾기
            {activeTab === 'search' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-brand-orange rounded-full"></span>}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex-1 pb-2 text-center text-sm font-extrabold transition-all relative ${activeTab === 'requests' ? 'text-brand-green font-black scale-102' : 'text-stone-400'}`}
          >
            대기신청
            {incomingRequests.length > 0 && (
              <span className="ml-1 bg-brand-orange text-white text-[9px] font-black w-4 h-4 inline-flex items-center justify-center rounded-full">
                {incomingRequests.length}
              </span>
            )}
            {activeTab === 'requests' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-brand-orange rounded-full"></span>}
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`flex-1 pb-2 text-center text-sm font-extrabold transition-all relative ${activeTab === 'blocked' ? 'text-brand-green font-black scale-102' : 'text-stone-400'}`}
          >
            차단
            {activeTab === 'blocked' && <span className="absolute bottom-0 left-0 right-0 h-1 bg-brand-orange rounded-full"></span>}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* TAB 1: FRIENDS LIST */}
        {activeTab === 'list' && (
          <div className="space-y-3">
            {activeFriends.length === 0 ? (
              <div className="bg-brand-sand border-2 border-brand-border rounded-[28px] p-8 text-center text-stone-500 text-sm">
                <p className="font-extrabold text-brand-green mb-2">아직 등록된 친구가 없습니다.</p>
                <p className="text-xs text-stone-600 leading-relaxed mb-4 font-medium">청주 청년 친구 찾기 탭에서 새로운 친구의<br/>이어톡 ID나 태그를 검색해 보세요!</p>
                <button 
                  onClick={() => setActiveTab('search')}
                  className="bg-brand-green hover:bg-brand-green/95 text-white font-black px-5 py-2.5 rounded-full text-xs transition-colors shadow-sm border border-brand-border"
                >
                  새 친구 탐색하기
                </button>
              </div>
            ) : (
              activeFriends.map(f => (
                <div 
                  key={f.friendUserId} 
                  className="bg-brand-sand border border-brand-border rounded-2xl p-4 shadow-sm flex items-center justify-between hover:border-brand-orange/40 transition-all cursor-pointer"
                  onClick={() => openUserDetail(f.friendUserId)}
                >
                  <div className="flex items-center gap-3">
                    <img 
                      src={f.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${f.friendUserId}`} 
                      alt="Profile" 
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-full border-2 border-brand-border object-cover bg-white" 
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-brand-green text-sm">{f.nickname}</span>
                      </div>
                      <p className="text-xs text-stone-500 line-clamp-1 mt-0.5">
                        {f.statusMessage || "상태메시지가 없습니다."}
                      </p>
                    </div>
                  </div>
                  
                  {/* Action Direct Message */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startChat(f.friendUserId, f.nickname);
                    }}
                    className="p-2.5 bg-brand-yellow/30 hover:bg-brand-yellow/50 text-brand-green border border-brand-border/40 rounded-xl transition-all"
                    title="1:1 채팅"
                  >
                    <MessageSquare className="w-5 h-5" />
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 2: CHEONGJU FRIEND SEARCH */}
        {activeTab === 'search' && (
          <div className="space-y-4">
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="flex-1 flex gap-2 relative bg-white border border-stone-200 rounded-xl px-3 py-1 items-center">
                <Search className="w-4 h-4 text-stone-400 flex-shrink-0" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="닉네임, ID, 학교 또는 관심사 검색" 
                  className="flex-1 bg-transparent text-sm text-stone-800 focus:outline-none placeholder:text-stone-400 py-1.5"
                />
              </div>
              <button 
                type="submit" 
                className="bg-stone-900 hover:bg-stone-800 text-white px-4 font-bold rounded-xl text-sm transition-colors"
              >
                검색
              </button>
            </form>

            {/* Quick Tag Recommendations */}
            <div className="bg-white border border-stone-100 rounded-2xl p-4 space-y-3">
              <span className="text-xs font-bold text-stone-400 block mb-1">인기 태그 검색</span>
              <div className="flex flex-wrap gap-1.5">
                {['충북대', '청주대', '성안길', '오창', '율량동', '카페 투어', '맛집 탐방', '축구/풋살', '스터디/취업'].map(tag => (
                  <button
                    key={tag}
                    onClick={() => {
                      setSearchQuery(tag);
                      // Formulate search programmatically
                      setSearchFilter('all');
                      setTimeout(() => handleSearch(), 100);
                    }}
                    className="text-xs bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold px-2.5 py-1 rounded-lg transition-colors border border-amber-100"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            </div>

            {/* Search Results */}
            {loading ? (
              <div className="text-center py-10">
                <div className="w-8 h-8 border-3 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                <p className="text-xs text-stone-400">새로운 청주 친구들을 탐색하는 중...</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-3">
                {searchResults.map(user => {
                  const alreadyFriend = friends.some(f => f.friendUserId === user.userId);
                  const incomingPending = incomingRequests.some(r => r.fromUserId === user.userId);
                  const outgoingPending = outgoingRequests.some(r => r.toUserId === user.userId);

                  return (
                    <div 
                      key={user.userId}
                      onClick={() => openUserDetail(user.userId)}
                      className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm space-y-3 hover:border-amber-200 transition-all cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <img 
                            src={user.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.userId}`} 
                            alt="Profile" 
                            referrerPolicy="no-referrer"
                            className="w-12 h-12 rounded-full border border-stone-100 object-cover" 
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-stone-900 text-sm">{user.nickname}</span>
                              <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded font-mono">
                                {user.eeortalkId}
                              </span>
                            </div>
                            <span className="inline-block text-[10px] bg-amber-100 text-amber-800 font-semibold px-1.5 mt-0.5 rounded">
                              {user.school || "미지정"} · {user.region || "미지정"}
                            </span>
                          </div>
                        </div>

                        {/* Friend Action Button */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {alreadyFriend ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-100">
                              <UserCheck className="w-3.5 h-3.5" /> 친구
                            </span>
                          ) : incomingPending ? (
                            <button
                              onClick={() => {
                                const req = incomingRequests.find(r => r.fromUserId === user.userId);
                                if (req) acceptRequest(req);
                              }}
                              className="bg-amber-400 hover:bg-amber-500 text-stone-900 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm"
                            >
                              수락하기
                            </button>
                          ) : outgoingPending ? (
                            <span className="text-xs font-semibold text-stone-400 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
                              신청대기중
                            </span>
                          ) : (
                            <button
                              onClick={() => sendFriendRequest(user)}
                              className="bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-colors shadow-sm inline-flex items-center gap-1"
                            >
                              <UserPlus className="w-3.5 h-3.5" /> 신청
                            </button>
                          )}
                        </div>
                      </div>
                      
                      {user.statusMessage && (
                        <p className="text-xs text-stone-500 bg-stone-50 p-2 rounded-xl text-left border border-stone-100/50">
                          {user.statusMessage}
                        </p>
                      )}

                      {/* Interests tag list */}
                      {user.interests && user.interests.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {user.interests.slice(0, 4).map(tag => (
                            <span key={tag} className="text-[10px] text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 bg-white border border-stone-100 rounded-3xl text-sm text-stone-400">
                <p>청주 청년 친구들을 검색해보세요!</p>
                <p className="text-xs text-stone-400 mt-1">이름, ID, 대학교, 혹은 성안길 등의 단어를 쳐보세요.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: PENDING REQUEST PANEL */}
        {activeTab === 'requests' && (
          <div className="space-y-4">
            {/* Incoming requests (수신된 신청) */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-stone-400 tracking-wider">받은 신청 ({incomingRequests.length})</h3>
              {incomingRequests.length === 0 ? (
                <p className="text-xs text-stone-400 bg-white border border-stone-100 rounded-2xl p-4 text-center">
                  수신된 친구 요청이 없습니다.
                </p>
              ) : (
                incomingRequests.map(req => (
                  <div key={req.requestId} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <img 
                        src={req.fromProfileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${req.fromUserId}`} 
                        alt="Profile" 
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 rounded-full border border-stone-100" 
                      />
                      <div>
                        <span className="font-bold text-stone-900 text-sm block">{req.fromNickname}</span>
                        <span className="text-[10px] text-stone-400">청주 지역 청년</span>
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <button 
                        onClick={() => acceptRequest(req)}
                        className="bg-amber-400 hover:bg-amber-500 text-stone-900 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors"
                      >
                        수락
                      </button>
                      <button 
                        onClick={() => rejectRequest(req)}
                        className="bg-stone-100 hover:bg-stone-200 text-stone-500 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors"
                      >
                        거절
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Outgoing requests (송신한 신청) */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-stone-400 tracking-wider">내가 보낸 신청 ({outgoingRequests.length})</h3>
              {outgoingRequests.length === 0 ? (
                <p className="text-xs text-stone-400 bg-white border border-stone-100 rounded-2xl p-4 text-center">
                  송신한 친구 요청이 없습니다.
                </p>
              ) : (
                outgoingRequests.map(req => (
                  <div key={req.requestId} className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center font-bold text-[10px] text-amber-700 font-mono">
                        UID
                      </div>
                      <div>
                        <span className="text-xs text-stone-500 block">ID: {req.toUserId.slice(0, 8)}...</span>
                        <span className="text-[10px] text-stone-400">답변 대기 중</span>
                      </div>
                    </div>
                    <button 
                      onClick={() => rejectRequest(req)}
                      className="bg-stone-100 hover:bg-stone-200 text-stone-500 font-semibold px-2.5 py-1.5 rounded-xl text-xs transition-colors"
                    >
                      취소
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 4: BLOCKED USERS */}
        {activeTab === 'blocked' && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-stone-400 tracking-wider">차단된 친구 ({blockedFriends.length})</h3>
            {blockedFriends.length === 0 ? (
              <p className="text-sm text-stone-400 bg-white border border-stone-100 rounded-2xl p-6 text-center">
                차단한 사용자가 없습니다.
              </p>
            ) : (
              blockedFriends.map(friend => (
                <div key={friend.friendUserId} className="bg-stone-100 border border-stone-200 rounded-2xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3 opacity-60">
                    <img 
                      src={friend.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${friend.friendUserId}`} 
                      alt="Profile" 
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full border border-stone-200 grayscale" 
                    />
                    <div>
                      <span className="font-bold text-stone-700 text-sm block">{friend.nickname}</span>
                      <span className="text-[10px] text-stone-400">메시지 수신이 영구 차단됨</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleBlockFriend(friend)}
                    className="bg-white hover:bg-stone-200 border border-stone-200 text-stone-700 text-xs font-bold px-3 py-1.5 rounded-xl transition-all"
                  >
                    차단 해제
                  </button>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* USER DETAIL MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl relative text-center"
          >
            {/* Close */}
            <button 
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 text-stone-400 hover:text-stone-700 text-xl font-bold"
            >
              &times;
            </button>

            {/* Banner block */}
            <div className="w-24 h-24 rounded-full bg-amber-100 border-3 border-amber-400 mx-auto overflow-hidden shadow-md mb-4">
              <img 
                src={selectedUser.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${selectedUser.userId}`} 
                alt="Profile" 
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover" 
              />
            </div>

            <div className="space-y-1 mb-4">
              <h3 className="text-xl font-bold text-stone-900">{selectedUser.nickname}</h3>
              <p className="text-xs text-stone-400 font-mono">{selectedUser.eeortalkId}</p>
              
              <div className="flex justify-center gap-1.5 mt-2">
                <span className="bg-amber-100 text-amber-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {selectedUser.school || "미지정 대학교"}
                </span>
                <span className="bg-neutral-100 text-neutral-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                  {selectedUser.region || "미지정 동네"}
                </span>
              </div>
            </div>

            {selectedUser.statusMessage && (
              <p className="text-xs text-stone-600 bg-stone-50 p-3 rounded-2xl border border-stone-100 leading-relaxed max-w-xs mx-auto mb-4">
                "{selectedUser.statusMessage}"
              </p>
            )}

            {/* Key Interests */}
            {selectedUser.interests && selectedUser.interests.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-bold text-stone-400 tracking-wider mb-2">청년 주요 관심사</p>
                <div className="flex flex-wrap justify-center gap-1">
                  {selectedUser.interests.map(interest => (
                    <span key={interest} className="text-xs bg-stone-100 text-stone-600 border border-stone-200/55 px-2.5 py-1 rounded-lg">
                      {interest}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => startChat(selectedUser.userId, selectedUser.nickname)}
                className="col-span-2 bg-amber-400 hover:bg-amber-500 text-stone-900 font-bold py-3 rounded-2xl text-sm transition-colors flex items-center justify-center gap-1.5 shadow-sm"
              >
                <MessageSquare className="w-4 h-4" /> 1:1 대화 시작하기
              </button>

              {/* Block Friend Relation */}
              {friends.some(f => f.friendUserId === selectedUser.userId) ? (
                <>
                  <button
                    onClick={() => {
                      const fr = friends.find(f => f.friendUserId === selectedUser.userId);
                      if (fr) toggleBlockFriend(fr);
                      setSelectedUser(null);
                    }}
                    className="bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <UserX className="w-3.5 h-3.5" /> 차단하기
                  </button>
                  <button
                    onClick={() => removeFriend(selectedUser.userId)}
                    className="bg-stone-100 hover:bg-red-50 hover:text-red-600 text-stone-500 font-semibold py-2 rounded-xl text-xs transition-colors flex items-center justify-center gap-1"
                  >
                    <UserMinus className="w-3.5 h-3.5" /> 친구끊기
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setReportingUser(selectedUser);
                    setSelectedUser(null);
                  }}
                  className="col-span-2 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold py-2.5 rounded-xl text-xs transition-colors flex items-center justify-center gap-1 border border-rose-100"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> 이 사용자 신고하기
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* COMPLAINT/REPORT DIALOG */}
      {reportingUser && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-6 z-50">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-xl relative"
          >
            <h3 className="text-base font-extrabold text-stone-900 mb-2 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" /> 청주 안심 이어톡 신고
            </h3>
            <p className="text-xs text-stone-400 mb-4 leading-relaxed">
              <strong>{reportingUser.nickname}</strong> 사용자의 권리침해, 도용, 욕설 홍보 등에 관해 상세히 설명해 주세요. 관리국에서 즉각 제재 여부를 검토합니다.
            </p>

            <form onSubmit={handleSubmitReport} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-stone-500 mb-1 block">신고 귀책사유</label>
                <select 
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400"
                >
                  <option value="사칭/보이스피싱">사칭/보이스피싱 및 기망</option>
                  <option value="부적절한 프로필">부적절한 닉네임/프로필 사진</option>
                  <option value="비하/언어폭력">욕설, 혐오 표현, 언어폭력</option>
                  <option value="스팸/홍보">의도되지 않은 불법 홍보/도배</option>
                  <option value="기타 사유">기타 사유 (직접 기재)</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-stone-500 mb-1 block">구체적 내용</label>
                <textarea
                  rows={4}
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="증빙 정보나 구체적 피해 상황을 작성해 주세요."
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 placeholder:text-stone-300 resize-none"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setReportingUser(null)}
                  className="flex-1 bg-stone-100 hover:bg-stone-200 text-stone-600 font-bold py-2.5 rounded-xl text-xs transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={reportSubmitting}
                  className="flex-1 bg-rose-500 hover:bg-rose-600 disabled:bg-rose-300 text-white font-bold py-2.5 rounded-xl text-xs transition-colors shadow-sm"
                >
                  {reportSubmitting ? '접수 중...' : '신고하기'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
