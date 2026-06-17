import React, { useState } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { UserRole, REGIONS, SCHOOLS } from '../types';
import { MessageCircle, Heart, Users, MapPin, Mail, Lock, User, RefreshCw, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginProps {
  onLoginSuccess: () => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [birthYear, setBirthYear] = useState('2000(20대 중반)');
  const [region, setRegion] = useState('성안길(시내)');
  const [school, setSchool] = useState('충북대학교');
  const [statusMessage, setStatusMessage] = useState('반갑습니다! 청주 청년 이어톡입니다. 👋');
  const [avatarSeed, setAvatarSeed] = useState(() => Math.floor(Math.random() * 10000).toString());

  const profileImageUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}`;

  const regenerateAvatar = () => {
    setAvatarSeed(Math.floor(Math.random() * 10000).toString());
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('이메일과 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (mode === 'login') {
        // Sign In
        try {
          await signInWithEmailAndPassword(auth, email.trim(), password);
          onLoginSuccess();
        } catch (err: any) {
          console.error("Sign in error:", err);
          if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
            setError('이메일 또는 비밀번호가 올바르지 않습니다.');
          } else if (err.code === 'auth/invalid-email') {
            setError('올바른 이메일 형식이 아닙니다.');
          } else {
            setError(err.message || '로그인 중 오류가 발생했습니다.');
          }
        }
      } else {
        // Sign Up / Registration
        if (!nickname.trim()) {
          setError('닉네임을 입력해 주세요.');
          setLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('비밀번호는 최소 6자리 이상이어야 합니다.');
          setLoading(false);
          return;
        }

        let userCredential;
        try {
          userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        } catch (err: any) {
          console.error("Create user error:", err);
          if (err.code === 'auth/email-already-in-use') {
            setError('이미 가입된 이메일 주소입니다.');
          } else if (err.code === 'auth/weak-password') {
            setError('비밀번호가 너무 취약합니다. 6자리 이상으로 작성해 주세요.');
          } else if (err.code === 'auth/invalid-email') {
            setError('올바른 이메일 형식이 아닙니다.');
          } else {
            setError(err.message || '회원가입 중 오류가 발생했습니다.');
          }
          setLoading(false);
          return;
        }

        const user = userCredential.user;
        if (!user) throw new Error('회원 권한 생성에 실패했습니다.');

        // Create profile in Firestore
        const userRef = doc(db, 'users', user.uid);
        const isDefaultAdmin = user.email === 'lch20050@gmail.com' || user.email === 'lch200048@gmail.com';
        const randomId = 'user_' + Math.floor(100000 + Math.random() * 900000);

        await setDoc(userRef, {
          userId: user.uid,
          email: user.email,
          nickname: nickname.trim(),
          eeortalkId: `@${randomId}`,
          profileImage: profileImageUrl,
          statusMessage: statusMessage.trim(),
          birthYear,
          region,
          school,
          interests: ['☕ 카페 투어', '🍕 맛집 탐방', '🍿 영화/넷플'],
          role: isDefaultAdmin ? UserRole.ADMIN : UserRole.USER,
          banned: false,
          createdAt: serverTimestamp(),
        }).catch((err) => {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}`);
          throw err;
        });

        onLoginSuccess();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || '작업을 처리하는 동안 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account',
    });

    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      if (!user) throw new Error('Google 로그인에 실패했습니다.');

      const userRef = doc(db, 'users', user.uid);
      let d = null;
      let isOffline = false;
      try {
        d = await getDoc(userRef);
      } catch (err) {
        console.warn("Firestore is offline or inaccessible during login. Falling back to offline-mode authentication:", err);
        isOffline = true;
      }

      if (!isOffline && d && !d.exists()) {
        const isDefaultAdmin = user.email === 'lch20050@gmail.com' || user.email === 'lch200048@gmail.com';
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
        setError(err.message || 'Google 로그인 중 오류가 발생했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-between p-6 font-sans text-brand-dark relative overflow-y-auto max-w-sm mx-auto">
      {/* Wave Background Accents */}
      <div className="absolute inset-0 bg-[radial-gradient(#F0E6D2_1px,transparent_1px)] [background-size:16px_16px] pointer-events-none opacity-45"></div>

      <div className="flex-1 flex flex-col items-center justify-center w-full relative z-10 py-6">
        {/* LOGO */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="flex flex-col items-center mb-6"
        >
          <div className="w-16 h-16 bg-brand-yellow rounded-2xl flex items-center justify-center shadow-lg border-2 border-brand-border relative mb-3">
            <MessageCircle className="w-8 h-8 text-brand-green absolute -translate-x-0.5 -translate-y-0.5" />
            <div className="absolute top-1 right-1 w-3 h-3 bg-brand-orange border-2 border-brand-yellow rounded-full animate-pulse"></div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-brand-green flex items-center gap-1">
            이어<span className="text-brand-orange">톡</span>
          </h1>
          <p className="text-stone-500 text-[10px] font-semibold uppercase tracking-wider mt-0.5">Cheongju Youth Connection</p>
        </motion.div>

        {/* Dynamic Mode Switch Tabs */}
        <div className="w-full bg-brand-sand border-2 border-brand-border rounded-2xl p-1 mb-4 flex">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${mode === 'login' ? 'bg-brand-green text-white shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}
          >
            이메일 로그인
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${mode === 'register' ? 'bg-brand-green text-white shadow-xs' : 'text-stone-500 hover:text-stone-800'}`}
          >
            이메일 회원가입
          </button>
        </div>

        {/* Input Forms */}
        <motion.div
          key={mode}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full bg-brand-sand border-4 border-brand-border rounded-[28px] p-5 shadow-sm space-y-4 mb-4"
        >
          <form onSubmit={handleEmailAuth} className="space-y-3">
            <div>
              <label className="text-[10px] font-extrabold text-brand-green mb-1 block flex items-center gap-1"><Mail className="w-3 h-3" /> 이메일 주소</label>
              <input
                type="email"
                required
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
              />
            </div>

            <div>
              <label className="text-[10px] font-extrabold text-brand-green mb-1 block flex items-center gap-1"><Lock className="w-3 h-3" /> 비밀번호</label>
              <input
                type="password"
                required
                minLength={6}
                placeholder={mode === 'register' ? '6자리 이상 입력' : '비밀번호 입력'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
              />
            </div>

            {mode === 'register' && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="space-y-3 pt-1 border-t border-brand-border/40"
              >
                {/* Character Avatar generator preview */}
                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block flex items-center justify-between">
                    <span>랜덤 추천 아바타</span>
                    <button
                      type="button"
                      onClick={regenerateAvatar}
                      className="text-brand-orange text-[10px] font-black flex items-center gap-0.5 hover:underline"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> 다른 아바타 뽑기
                    </button>
                  </label>
                  <div className="flex items-center gap-3 bg-brand-bg p-2 rounded-xl border border-brand-border">
                    <img
                      src={profileImageUrl}
                      referrerPolicy="no-referrer"
                      alt="Avatar seed preview"
                      className="w-12 h-12 bg-white rounded-full border border-brand-border object-cover"
                    />
                    <div className="text-[10px] text-stone-600 font-semibold leading-relaxed">
                      귀여운 모험가 아바타가 생성되었습니다!<br />
                      마음에 들지 않으면 변경할 수 있습니다.
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block flex items-center gap-1"><User className="w-3 h-3" /> 사용하실 닉네임</label>
                  <input
                    type="text"
                    required
                    maxLength={15}
                    placeholder="예: 청원구청년"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-extrabold text-brand-green mb-1 block">나이대 선택</label>
                    <select
                      value={birthYear}
                      onChange={(e) => setBirthYear(e.target.value)}
                      className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                    >
                      <option value="1995(30대 초반)">1995대 (30대)</option>
                      <option value="1998(20대 중후반)">1998대 (20대 후반)</option>
                      <option value="2000(20대 중반)">2000대 (20대 중반)</option>
                      <option value="2002(20대 초반)">2002대 (20대 초반)</option>
                      <option value="2005대(20대 극초)">2005대 (20대 극초반)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-extrabold text-brand-green mb-1 block">소속 분류</label>
                    <select
                      value={school}
                      onChange={(e) => setSchool(e.target.value)}
                      className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-2.5 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                    >
                      {SCHOOLS.map(sc => (
                        <option key={sc} value={sc}>{sc}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block">청주 주 활동 구역</label>
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                  >
                    {REGIONS.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block">나를 소개하는 한마디</label>
                  <input
                    type="text"
                    maxLength={40}
                    placeholder="인사말을 적어주세요!"
                    value={statusMessage}
                    onChange={(e) => setStatusMessage(e.target.value)}
                    className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                  />
                </div>
              </motion.div>
            )}

            <button
              id="email-auth-btn"
              type="submit"
              disabled={loading}
              className="w-full bg-brand-green hover:bg-brand-green/90 disabled:bg-stone-500 text-white font-extrabold py-3.5 px-6 rounded-xl flex items-center justify-center gap-2 transition-all border-2 border-brand-border shadow-md mt-4 text-xs"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <Sparkles className="w-4 h-4 text-brand-yellow" />
              )}
              {mode === 'login' ? '이어톡 로그인하기' : '청주 청년 계정 생성하기'}
            </button>
          </form>

          {error && (
            <div className="p-3 bg-red-100/50 border border-red-200 text-red-600 rounded-xl text-xs text-center leading-relaxed">
              {error}
            </div>
          )}
        </motion.div>

        {/* Feature info cards */}
        {mode === 'login' && (
          <motion.div
            initial={{ y: 15, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="w-full bg-brand-sand border-2 border-brand-border/60 rounded-2xl p-4 space-y-2 text-stone-600 text-xs shadow-xs mb-4"
          >
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-brand-orange flex-shrink-0" />
              <p className="font-semibold text-[11px] leading-tight">청주 거주 대학생 및 직장인 100% 매치 기능 탑재</p>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-green flex-shrink-0" />
              <p className="font-semibold text-[11px] leading-tight">카페투어, 운동, 맛집 등 다양한 그룹 소모임 가입 대기</p>
            </div>
          </motion.div>
        )}

        {/* Optional Google Login as fallback */}
        <div className="w-full text-center py-2 space-y-2">
          <p className="text-[10px] text-stone-400 font-bold tracking-wider">- 또는 간편 로그인 -</p>
          <button
            id="google-sign-in-btn"
            disabled={loading}
            onClick={handleGoogleLogin}
            className="w-full bg-white hover:bg-stone-50 disabled:bg-stone-100 text-stone-700 font-extrabold py-3 px-5 rounded-xl flex items-center justify-center gap-2.5 transition-all border-2 border-brand-border/60 shadow-xs text-xs"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Google 계정으로 로그인
          </button>
        </div>
      </div>

      {/* Footer Text */}
      <div className="text-center text-[9px] text-stone-400 mt-4 space-y-1 relative z-10 pb-4">
        <p>© 2026 이어톡. Made for Cheongju Youth. <span className="font-extrabold text-brand-orange">#이어드림</span></p>
        <p>충북 청주 청년공간 사업 연계 및 마이크로 커뮤니티 MVP</p>
      </div>
    </div>
  );
}
