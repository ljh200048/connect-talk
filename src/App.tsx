import React, { useState, useEffect } from 'react';
import { auth, db, app, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserProfile, TabType, UserRole } from './types';

// Page Views
import Login from './components/Login';
import FriendsView from './components/FriendsView';
import ChatsView from './components/ChatsView';
import MeetingsView from './components/MeetingsView';
import NoticesView from './components/NoticesView';
import MyPageView from './components/MyPageView';
import AdminView from './components/AdminView';

// Icons
import { Users, MessageSquare, Compass, Bell, User, MessageCircle, Settings, ShieldAlert, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('friends');
  
  // Custom room shortcut (from friends profile DM triggers)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  
  // Admin Overlay
  const [showAdmin, setShowAdmin] = useState(false);

  // Monitor Auth Changes
  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);

      // Console diagnostic logs for matching Firebase project confirmation
      console.log("=== Auth State Changed Verification ===");
      console.log("app.options.projectId:", app.options.projectId);
      console.log("db.app.options.projectId:", db.app?.options?.projectId);
      console.log("auth.currentUser?.uid:", auth.currentUser?.uid || (user ? user.uid : "None"));
      console.log("=======================================");

      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (user) {
        try {
          // Feed real-time updates for general user data (banned check, name changes)
          const userRef = doc(db, 'users', user.uid);
          let userSnap = null;
          
          try {
            userSnap = await getDoc(userRef);
          } catch (fetchError) {
            console.error("Failed to read user document, attempting to check status or create:", fetchError);
          }
          
          // Generate/Auto-create user document if it does not exist
          if (!userSnap || !userSnap.exists()) {
            const isDefaultAdmin = user.email === 'lch20050@gmail.com' || user.email === 'lch200048@gmail.com';
            const randomId = 'user_' + Math.floor(100000 + Math.random() * 900000);
            
            const defaultProfile = {
              userId: user.uid,
              email: user.email || `${user.uid}@eeortalk.local`,
              nickname: user.displayName || `청주청년_${randomId}`,
              eeortalkId: `@${randomId}`,
              profileImage: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
              statusMessage: '반갑습니다! 청주 청년 이어톡입니다. 👋',
              birthYear: '2000(20대)',
              region: '성안길(시내)',
              school: '충북대학교',
              interests: ['☕ 카페 투어', '🍕 맛집 탐방', '🍿 영화/넷플'],
              role: isDefaultAdmin ? UserRole.ADMIN : UserRole.USER,
              banned: false,
              createdAt: serverTimestamp(),
            };

            try {
              await setDoc(userRef, defaultProfile);
              userSnap = await getDoc(userRef);
            } catch (createError) {
              console.error("Failed to automatically initialize user document in Firestore:", createError);
            }
          }
          
          if (userSnap && userSnap.exists()) {
            setCurrentUser(userSnap.data() as UserProfile);
          } else {
            // Offline/Connection fallback: If Firestore/Network is offline or mismatched config prevents loading,
            // we initialize isOfflineFallback so the user is not stuck on the login loading screen.
            const isDefaultAdmin = user.email === 'lch20050@gmail.com' || user.email === 'lch200048@gmail.com';
            const randomId = 'user_offline_' + Math.floor(100000 + Math.random() * 900000);
            
            const offlineProfile: UserProfile = {
              userId: user.uid,
              email: user.email || `${user.uid}@eeortalk.local`,
              nickname: user.displayName || `오프라인청년_${randomId}`,
              eeortalkId: `@${randomId}`,
              profileImage: user.photoURL || `https://api.dicebear.com/7.x/adventurer/svg?seed=${user.uid}`,
              statusMessage: '⚠️ Firebase 연결 대기 중 (오프라인 모드). .env의 설정을 확인해 주세요!',
              birthYear: '2000(20대)',
              region: '성안길(시내)',
              school: '충북대학교',
              interests: ['☕ 카페 투어', '🍕 맛집 탐방', '🍿 영화/넷플'],
              role: isDefaultAdmin ? UserRole.ADMIN : UserRole.USER,
              banned: false,
              createdAt: new Date().toISOString() as any,
              isOfflineFallback: true,
            };
            setCurrentUser(offlineProfile);
          }

          unsubUser = onSnapshot(userRef, (snapshot) => {
            if (snapshot.exists()) {
              setCurrentUser(snapshot.data() as UserProfile);
            }
          }, (error) => {
            console.error("User document live snapshot failed:", error.message);
          });

        } catch (error) {
          console.error("Failed to fetch user state on state change:", error);
        } finally {
          setAuthReady(true);
        }
      } else {
        setCurrentUser(null);
        setAuthReady(true);
      }
    });

    return () => {
      unsubscribe();
      if (unsubUser) {
        unsubUser();
      }
    };
  }, []);

  // Quick switch function used to jump into 1:1 DMs
  const handleNavigateToChat = (roomId: string) => {
    setActiveRoomId(roomId);
    setActiveTab('chats');
  };

  // If Auth Listener is not resolved
  if (!authReady) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col justify-center items-center p-6">
        <div className="space-y-4 text-center">
          <div className="relative w-16 h-16 bg-amber-400 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-300/40 mx-auto">
            <MessageCircle className="w-8 h-8 text-stone-900" />
            <div className="absolute inset-0 border-3 border-stone-900 border-t-amber-400 rounded-3xl animate-spin"></div>
          </div>
          <h2 className="text-sm font-bold text-stone-700">이어톡 로딩 중...</h2>
          <p className="text-[10px] text-stone-400">청주 청년들의 인연이 안전하게 구성되고 있습니다.</p>
        </div>
      </div>
    );
  }

  // Not signed in
  if (!currentUser) {
    return <Login onLoginSuccess={() => setActiveTab('friends')} />;
  }

  // Suspended Account Block Screen
  if (currentUser.banned) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col justify-center items-center p-6 text-white text-center font-sans">
        <div className="max-w-xs space-y-6">
          <div className="w-20 h-20 bg-rose-500 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-rose-900/40 border border-rose-400/30">
            <ShieldAlert className="w-10 h-10 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-xl font-black text-rose-500">계정이 비활성화되었습니다</h1>
            <p className="text-xs text-stone-400 leading-relaxed">
              <strong>{currentUser.nickname}</strong>님의 계정은 이어톡 청주 건전 소통 관리 가이드 위배 사항(귀책 신고 혐의) 누적으로 인해 영구 정지 처분되었습니다.
            </p>
          </div>

          <div className="p-3.5 bg-stone-900 border border-stone-800 rounded-2xl text-[11px] text-stone-400">
            <p className="font-bold text-stone-300 mb-1">지정 관리 이메일 안내</p>
            <p className="font-mono">support@eeortalk.local</p>
          </div>

          <button
            onClick={() => auth.signOut()}
            className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold py-3 px-4 rounded-xl text-xs transition-colors"
          >
            로그아웃 및 나가기
          </button>
        </div>
      </div>
    );
  }

  // Administrator Board View Overlay
  if (showAdmin && (currentUser.role === UserRole.ADMIN || currentUser.email === 'lch200048@gmail.com')) {
    return (
      <AdminView 
        currentUser={currentUser} 
        onClose={() => setShowAdmin(false)} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream/60 flex justify-center text-brand-dark selection:bg-brand-yellow/50 selection:text-brand-green p-0 md:py-4">
      {/* Simulation Mobile Applet Shell Framer on Desktop, Fluid on Mobile */}
      <div className="w-full max-w-md bg-brand-bg min-h-screen md:min-h-[92vh] md:max-h-[92vh] flex flex-col relative shadow-2xl overflow-hidden md:border-4 md:border-brand-green md:rounded-[36px]">
        {currentUser?.isOfflineFallback && (
          <div className="bg-red-500 text-white text-[10px] px-4 py-2 font-semibold text-center z-50 flex flex-col gap-0.5 border-b border-brand-border animate-pulse">
            <span className="font-extrabold flex items-center justify-center gap-1">
              ⚠️ Firestore 오프라인 모드 연결 대기 중
            </span>
            <span>
              현재 프로젝트: <code className="bg-red-700/50 px-1 rounded">connect-talk-cd4ee</code> (.env 설정을 확인해 주세요)
            </span>
          </div>
        )}
        
        {/* Core Subviews content stream */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'friends' && (
            <FriendsView 
              currentUser={currentUser} 
              onNavigateToChat={handleNavigateToChat} 
            />
          )}

          {activeTab === 'chats' && (
            <ChatsView 
              currentUser={currentUser} 
              activeRoomId={activeRoomId}
              onSelectRoom={setActiveRoomId}
            />
          )}

          {activeTab === 'meetings' && (
            <MeetingsView 
              currentUser={currentUser} 
            />
          )}

          {activeTab === 'notices' && (
            <NoticesView />
          )}

          {activeTab === 'mypage' && (
            <MyPageView 
              currentUser={currentUser}
              onLogout={() => {}}
              onOpenAdmin={() => setShowAdmin(true)}
            />
          )}
        </div>

        {/* Global Bottom Tab Bar Menu (Visible unless in focused sub-room message detail) */}
        {(!activeRoomId || activeTab !== 'chats') && (
          <div className="absolute bottom-0 left-0 right-0 bg-brand-bg/95 backdrop-blur-md border-t-2 border-brand-border px-3 py-2 flex justify-around items-center z-40 pb-5 shadow-[0_-4px_16px_rgba(0,45,-32,0.03)]">
            {/* Friends Tab */}
            <button
              onClick={() => {
                setActiveTab('friends');
                setActiveRoomId(null);
              }}
              className={`flex flex-col items-center gap-1 p-1 flex-1 transition-all ${activeTab === 'friends' ? 'text-brand-green scale-105 font-black' : 'text-stone-400'}`}
            >
              <Users className={`w-5 h-5 ${activeTab === 'friends' ? 'text-brand-orange' : ''}`} />
              <span className="text-[10px]">친구</span>
            </button>

            {/* Chats Tab */}
            <button
              onClick={() => {
                setActiveTab('chats');
              }}
              className={`flex flex-col items-center gap-1 p-1 flex-1 transition-all relative ${activeTab === 'chats' ? 'text-brand-green scale-105 font-black' : 'text-stone-400'}`}
            >
              <MessageSquare className={`w-5 h-5 ${activeTab === 'chats' ? 'text-brand-orange' : ''}`} />
              <span className="text-[10px]">채팅</span>
            </button>

            {/* Meetings Tab */}
            <button
              onClick={() => {
                setActiveTab('meetings');
                setActiveRoomId(null);
              }}
              className={`flex flex-col items-center gap-1 p-1 flex-1 transition-all ${activeTab === 'meetings' ? 'text-brand-green scale-105 font-black' : 'text-stone-400'}`}
            >
              <Compass className={`w-5 h-5 ${activeTab === 'meetings' ? 'text-brand-orange' : ''}`} />
              <span className="text-[10px]">모임방</span>
            </button>

            {/* Notices Tab */}
            <button
              onClick={() => {
                setActiveTab('notices');
                setActiveRoomId(null);
              }}
              className={`flex flex-col items-center gap-1 p-1 flex-1 transition-all ${activeTab === 'notices' ? 'text-brand-green scale-105 font-black' : 'text-stone-400'}`}
            >
              <Bell className={`w-5 h-5 ${activeTab === 'notices' ? 'text-brand-orange' : ''}`} />
              <span className="text-[10px]">알림</span>
            </button>

            {/* MyPage Tab */}
            <button
              onClick={() => {
                setActiveTab('mypage');
                setActiveRoomId(null);
              }}
              className={`flex flex-col items-center gap-1 p-1 flex-1 transition-all ${activeTab === 'mypage' ? 'text-brand-green scale-105 font-black' : 'text-stone-400'}`}
            >
              <User className={`w-5 h-5 ${activeTab === 'mypage' ? 'text-brand-orange' : ''}`} />
              <span className="text-[10px]">마이</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
