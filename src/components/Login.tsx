import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserRole } from '../types';
import { MessageCircle, Heart, Users, MapPin } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    
    // Suggest prompt select_account to avoid caching bad auth
    provider.setCustomParameters({
      prompt: 'select_account',
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) throw new Error('Google 로그인에 실패했습니다.');

      // Check if user document already exists
      const userRef = doc(db, 'users', user.uid);
      const d = await getDoc(userRef).catch((err) => {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
        throw err;
      });

      if (!d.exists()) {
        // Create user document inside Firestore
        const isDefaultAdmin = user.email === 'lch20050@gmail.com' || user.email === 'lch200048@gmail.com';
        
        // Generate random Eeortalk ID
        const randomId = 'user_' + Math.floor(100000 + Math.random() * 900000);

        await setDoc(userRef, {
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
        }).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          throw err;
        });
      }

      onLoginSuccess();
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/popup-blocked') {
        setError('팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제하고 다시 시도해 주세요.');
      } else {
        setError(err.message || '로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 font-sans text-brand-dark relative overflow-hidden">
      {/* Wave Background Accents */}
      <div className="absolute inset-0 bg-[radial-gradient(#F0E6D2_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-45"></div>

      <div className="flex-1 flex flex-col items-center justify-center max-w-sm mx-auto w-full relative z-10">
        {/* LOGO */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center mb-8"
        >
          <div className="w-20 h-20 bg-brand-yellow rounded-3xl flex items-center justify-center shadow-lg border-2 border-brand-border relative mb-4">
            <MessageCircle className="w-10 h-10 text-brand-green absolute -translate-x-0.5 -translate-y-0.5" />
            <div className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-brand-orange border-2 border-brand-yellow rounded-full animate-pulse"></div>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-brand-green flex items-center gap-1">
            이어<span className="text-brand-orange">톡</span>
          </h1>
          <p className="text-stone-500 text-xs font-semibold uppercase tracking-wider mt-1">Cheongju Youth Connection</p>
        </motion.div>

        {/* Feature Highlights */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="w-full bg-brand-sand border-4 border-brand-border rounded-[32px] p-6 shadow-sm mb-8 space-y-4"
        >
          <div className="flex items-start gap-4">
            <div className="p-2 bg-brand-yellow/30 text-brand-green rounded-xl mt-0.5 font-bold">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-brand-green text-sm">청주 기반 로컬 매칭</h3>
              <p className="text-xs text-stone-600 mt-0.5 font-medium">충북대, 청주대, 성안길, 오창 등 청주 전역 청년들과의 안전한 연결</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-2 bg-brand-yellow/30 text-brand-green rounded-xl mt-0.5 font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-brand-green text-sm">다양한 취향별 소모임방</h3>
              <p className="text-xs text-stone-600 mt-0.5 font-medium">카페 투어, 맛집 탐방, 풋살 등 우리 동네 맞춤 단체 채팅방 참여</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-2 bg-brand-yellow/30 text-brand-green rounded-xl mt-0.5 font-bold">
              <Heart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-brand-green text-sm">이어드림 공식 연계</h3>
              <p className="text-xs text-stone-600 mt-0.5 font-medium">청주 청년 서포터즈 활동 및 유용한 시정 혜택 정보 공유</p>
            </div>
          </div>
        </motion.div>

        {/* Action Button */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="w-full space-y-3"
        >
          <button
            id="google-sign-in-btn"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full bg-brand-green hover:bg-brand-green/90 disabled:bg-stone-600 text-white font-extrabold py-4 px-6 rounded-full flex items-center justify-center gap-3 transition-all border-2 border-brand-border shadow-md"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            Google 계정으로 로그인하기
          </button>

          {error && (
            <div className="p-3 bg-red-100/50 border border-red-200 text-red-600 rounded-xl text-xs text-center leading-relaxed">
              {error}
            </div>
          )}
        </motion.div>
      </div>

      {/* Footer Text */}
      <div className="text-center text-[10px] text-stone-400 max-w-sm mx-auto z-10 space-y-1 relative">
        <p>© 2026 이어톡. Made for Cheongju Youth. <span className="font-extrabold text-brand-orange">#이어드림</span></p>
        <p>충북 청주 청년공간 사업 연계 및 마이크로 커뮤니티 MVP</p>
      </div>
    </div>
  );
}
