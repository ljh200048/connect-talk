import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType, auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { UserProfile, REGIONS, SCHOOLS, INTERESTS, UserRole } from '../types';
import { LogOut, User, Edit3, Settings, ShieldAlert, BadgeInfo, CheckCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface MyPageViewProps {
  currentUser: UserProfile;
  onLogout: () => void;
  onOpenAdmin: () => void;
}

export default function MyPageView({ currentUser, onLogout, onOpenAdmin }: MyPageViewProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState(currentUser.nickname);
  const [statusMessage, setStatusMessage] = useState(currentUser.statusMessage || '');
  const [birthYear, setBirthYear] = useState(currentUser.birthYear || '2000(20대)');
  const [region, setRegion] = useState(currentUser.region || '성안길(시내)');
  const [school, setSchool] = useState(currentUser.school || '충북대학교');
  const [selectedInterests, setSelectedInterests] = useState<string[]>(currentUser.interests || []);
  const [submitting, setSubmitting] = useState(false);

  const handleInterestToggle = (tag: string) => {
    if (selectedInterests.includes(tag)) {
      setSelectedInterests(selectedInterests.filter(i => i !== tag));
    } else {
      if (selectedInterests.length >= 6) {
        alert('관심사는 최대 6개까지만 선택이 가능합니다.');
        return;
      }
      setSelectedInterests([...selectedInterests, tag]);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      alert('닉네임을 반드시 입력해주세요.');
      return;
    }

    setSubmitting(true);
    const path = `users/${currentUser.userId}`;

    try {
      await updateDoc(doc(db, 'users', currentUser.userId), {
        nickname: nickname.trim(),
        statusMessage: statusMessage.trim(),
        birthYear,
        region,
        school,
        interests: selectedInterests
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });

      alert('프로필이 성공적으로 변경되었습니다!');
      setIsEditing(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogoutAction = async () => {
    if (!confirm('정말 로그아웃 하시겠습니까?')) return;
    try {
      await signOut(auth);
      onLogout();
    } catch (err) {
      console.error(err);
    }
  };

  const isUserAdmin = currentUser.role === UserRole.ADMIN || currentUser.email === 'lch200048@gmail.com';

  return (
    <div className="flex flex-col h-full bg-brand-bg pb-24 overflow-y-auto">
      {/* Dynamic Profile Deck Header */}
      <div className="bg-brand-yellow px-6 pt-8 pb-16 text-center relative rounded-b-[40px] border-b-2 border-brand-border shadow-xs">
        {isUserAdmin && (
          <span className="absolute top-4 left-4 bg-brand-green border border-brand-border text-brand-yellow text-[10px] font-extrabold px-3 py-10 rounded-full flex items-center justify-center gap-1.5 shadow-md w-12 h-12 text-center leading-tight">
            어드민
          </span>
        )}

        <button
          onClick={handleLogoutAction}
          className="absolute top-4 right-4 p-2 bg-brand-green/10 hover:bg-brand-green/20 text-brand-green border border-brand-border/20 rounded-full transition-all"
          title="로그아웃"
        >
          <LogOut className="w-4 h-4" />
        </button>

        <div className="w-24 h-24 rounded-full bg-white border-4 border-brand-border mx-auto overflow-hidden shadow-lg mb-4">
          <img 
            src={currentUser.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${currentUser.userId}`} 
            referrerPolicy="no-referrer"
            alt="My Avatar" 
            className="w-full h-full object-cover" 
          />
        </div>

        <h3 className="text-xl font-black text-brand-green">{currentUser.nickname}</h3>
        <p className="text-xs text-brand-green/60 font-mono font-bold mt-0.5">{currentUser.eeortalkId}</p>
        <p className="text-xs text-brand-green/90 font-extrabold mt-1.5">{currentUser.email}</p>
      </div>

      {/* Main Profile Area */}
      <div className="px-5 -mt-10 relative z-10 space-y-4 pb-12">
        {/* Profile Card Summary */}
        <div className="bg-brand-sand border-2 border-brand-border rounded-[28px] p-5 shadow-sm space-y-4">
          {!isEditing ? (
            <>
              {/* Profile Read Fields */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-black text-brand-green tracking-wider">나의 이어카드 세부 정보</h4>
                  <button
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-black text-brand-orange hover:text-brand-orange/80 flex items-center gap-1 transition-colors"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> 프로필 수정
                  </button>
                </div>

                <div className="bg-brand-bg border border-brand-border rounded-2xl p-4 text-center shadow-xs">
                  <p className="text-xs font-extrabold text-brand-green mb-1">인사말</p>
                  <p className="text-xs text-brand-dark italic font-semibold leading-relaxed">
                    "{currentUser.statusMessage || '상태메세지가 없습니다.'}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-bold text-brand-green">
                  <div className="bg-brand-bg border border-brand-border/80 p-3 rounded-2xl">
                    <span className="text-stone-500 block mb-1 text-[10px] font-extrabold">나의 세대</span>
                    <span className="font-black text-brand-green">{currentUser.birthYear || '기입 안 됨'}</span>
                  </div>
                  <div className="bg-brand-bg border border-brand-border/80 p-3 rounded-2xl">
                    <span className="text-stone-500 block mb-1 text-[10px] font-extrabold">나의 전공/소속</span>
                    <span className="font-black text-brand-green">{currentUser.school || '기입 안 됨'}</span>
                  </div>
                  <div className="bg-brand-bg border border-brand-border/80 p-3 rounded-2xl col-span-2">
                    <span className="text-stone-500 block mb-1 text-[10px] font-extrabold">청주 거주지/활동 동네</span>
                    <span className="font-black text-brand-green">{currentUser.region || '기입 안 됨'}</span>
                  </div>
                </div>

                {/* Tag interests */}
                {currentUser.interests && currentUser.interests.length > 0 && (
                  <div className="pt-2">
                    <span className="text-[10px] font-black text-brand-green tracking-wider block mb-2">나의 이웃 관심사 ({currentUser.interests.length}개)</span>
                    <div className="flex flex-wrap gap-1.5">
                      {currentUser.interests.map(item => (
                        <span key={item} className="text-xs bg-brand-yellow/80 text-brand-green border border-brand-border font-extrabold px-2.5 py-1 rounded-xl">
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Editing form */
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-brand-green">프로필 편집하기</h4>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs font-bold text-stone-500 hover:text-brand-orange transition-colors"
                >
                  취소
                </button>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-brand-green mb-1 block">이웃 닉네임</label>
                <input 
                  type="text" 
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  maxLength={15}
                  required
                  className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-brand-green mb-1 block">상태메시지 (상냥한 첫인사)</label>
                <input 
                  type="text" 
                  value={statusMessage}
                  onChange={(e) => setStatusMessage(e.target.value)}
                  maxLength={40}
                  placeholder="예: 맛집 탐방 좋아해요!"
                  className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange placeholder:text-stone-400 text-brand-green font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block">출생 연도/나이대</label>
                  <select
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    className="w-full bg-brand-bg border-2 border-brand-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-brand-orange text-brand-green font-bold"
                  >
                    <option value="1995(30대 초반)">1995대 (30대)</option>
                    <option value="1998(20대 중후반)">1998대 (20대 후반)</option>
                    <option value="2000(20대 중반)">2000대 (20대 중반)</option>
                    <option value="2002(20대 초남)">2002대 (20대 초반)</option>
                    <option value="2005대(20대 극초)">2005대 (20대 극초반)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-extrabold text-brand-green mb-1 block">청주 소속/유사 기관</label>
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
                <label className="text-[10px] font-extrabold text-brand-green mb-1 block">주 거주지/활동 동네</label>
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
                <label className="text-[10px] font-black text-brand-green tracking-wider mb-2 block">나의 관심사 선택 (최대 6개)</label>
                <div className="flex flex-wrap gap-1">
                  {INTERESTS.map(item => {
                    const active = selectedInterests.includes(item);
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => handleInterestToggle(item)}
                        className={`text-xs px-2.5 py-1.5 rounded-xl border-2 transition-all ${active ? 'bg-brand-yellow border-brand-border text-brand-green font-black shadow-xs' : 'bg-brand-bg border-brand-border/60 text-stone-600 font-bold hover:bg-brand-yellow/20'}`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-brand-green hover:bg-brand-green/95 disabled:bg-stone-300 font-black text-white border border-brand-border py-3.5 rounded-full text-xs transition-colors shadow-sm"
              >
                {submitting ? '변경 기록 중...' : '프로필 저장하기'}
              </button>
            </form>
          )}
        </div>

        {/* ADMIN PAGE TRIGGER PANEL */}
        {isUserAdmin && (
          <div className="bg-brand-green border-4 border-brand-border rounded-[28px] p-5 text-white shadow-xl space-y-3">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-brand-yellow text-brand-green border border-brand-border rounded-2xl mt-0.5">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className="font-black text-sm text-brand-yellow flex items-center gap-1.5">이어톡 관리 시스템</h4>
                <p className="text-[10px] text-brand-bg/90 font-semibold leading-relaxed mt-1">
                  회원 차단/해제, 안전 신고 확인, 게시 소식(공지사항) 배포, 로비 단체방 제어 등의 기조를 즉시 수행합니다.
                </p>
              </div>
            </div>

            <button
              onClick={onOpenAdmin}
              className="w-full bg-brand-orange hover:bg-brand-orange/95 text-white border border-brand-border font-black text-xs py-3.5 rounded-full transition-all flex items-center justify-center gap-1.5 shadow-md"
            >
              어드민 통제 대시보드 바로가기
            </button>
          </div>
        )}

        {/* Safety tip guideline block */}
        <div className="bg-brand-sand border-2 border-brand-border rounded-[24px] p-4 flex gap-3 text-stone-600 text-xs shadow-xs">
          <BadgeInfo className="w-5 h-5 text-brand-orange flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h5 className="font-extrabold text-brand-green">이어톡 청주 청년 안심 가이드</h5>
            <p className="text-[10px] leading-relaxed text-stone-600 font-semibold">
              이어톡은 연락처 인증 대신 이메일 실명인증과 관리팀에 의한 신고제도를 실행합니다. 불법 광고, 기망 행위 포착 시 <strong>언제든 상세히 신고해주세요.</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
