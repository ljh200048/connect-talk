import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { 
  collection, query, getDocs, doc, setDoc, updateDoc, 
  deleteDoc, onSnapshot, getDoc, serverTimestamp 
} from 'firebase/firestore';
import { UserProfile, Report, Notice, ChatRoom, REGIONS, UserRole } from '../types';
import { 
  ShieldAlert, ArrowLeft, Users, AlertTriangle, Bell, 
  Plus, Settings, Ban, ShieldCheck, CheckSquare, Trash2, Send 
} from 'lucide-react';
import { motion } from 'motion/react';

interface AdminViewProps {
  currentUser: UserProfile;
  onClose: () => void;
}

export default function AdminView({ currentUser, onClose }: AdminViewProps) {
  const [activeSection, setActiveSection] = useState<'users' | 'reports' | 'notices' | 'keywords'>('users');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);

  // Notice form
  const [newNoticeTitle, setNewNoticeTitle] = useState('');
  const [newNoticeContent, setNewNoticeContent] = useState('');
  const [noticeSubmitting, setNoticeSubmitting] = useState(false);

  // Banned keywords from adminSettings/badWords
  const [bannedWords, setBannedWords] = useState<string[]>([]);
  const [newBannedWord, setNewBannedWord] = useState('');
  const [keywordSubmitting, setKeywordSubmitting] = useState(false);

  // Admin UID Search
  const [adminSearchUID, setAdminSearchUID] = useState('');
  const [searchedUser, setSearchedUser] = useState<UserProfile | null>(null);
  const [adminSearchError, setAdminSearchError] = useState<string | null>(null);

  const handleAdminSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!adminSearchUID.trim()) return;
    setAdminSearchError(null);
    setSearchedUser(null);
    try {
      const snap = await getDoc(doc(db, 'users', adminSearchUID.trim()));
      if (snap.exists()) {
        setSearchedUser(snap.data() as UserProfile);
      } else {
        setAdminSearchError('사용자 ID(UID)를 찾을 수 없습니다.');
      }
    } catch (err: any) {
      setAdminSearchError('사용자 조회 오류: ' + err.message);
    }
  };

  // Load all reports
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'reports';
    const unsub = onSnapshot(collection(db, path), (snap) => {
      const rList: Report[] = [];
      snap.forEach(d => {
        rList.push(d.data() as Report);
      });
      rList.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setReports(rList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsub();
  }, []);

  // Load all notices
  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'notices';
    const unsub = onSnapshot(collection(db, path), (snap) => {
      const nList: Notice[] = [];
      snap.forEach(d => {
        nList.push(d.data() as Notice);
      });
      nList.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setNotices(nList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsub();
  }, []);

  // Load banned words
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsub = onSnapshot(doc(db, 'adminSettings', 'badWords'), (snap) => {
      if (snap.exists()) {
        setBannedWords(snap.data().words || []);
      } else {
        // Init with default slang list
        setBannedWords(['시발', '개새끼', '바보', '미친', '좆']);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'adminSettings/badWords');
    });
    return () => unsub();
  }, []);

  // Toggle user ban state
  const handleToggleBan = async (targetUser: UserProfile) => {
    const newBanState = !targetUser.banned;
    if (!confirm(`${targetUser.nickname} 사용자를 즉시 ${newBanState ? '영구 정지' : '정지 해제'}하시겠습니까?`)) return;

    const path = `users/${targetUser.userId}`;
    try {
      await updateDoc(doc(db, 'users', targetUser.userId), {
        banned: newBanState
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });
      alert('사용자 제재 상태가 성공적으로 변경되었습니다.');
      if (searchedUser && searchedUser.userId === targetUser.userId) {
        setSearchedUser({ ...searchedUser, banned: newBanState });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle report resolution
  const handleResolveReport = async (report: Report) => {
    const newStatus = report.status === 'pending' ? 'resolved' : 'pending';
    const path = `reports/${report.reportId}`;

    try {
      await updateDoc(doc(db, 'reports', report.reportId), {
        status: newStatus
      }).catch((err) => {
        handleFirestoreError(err, OperationType.UPDATE, path);
        throw err;
      });
      alert(`신고가 ${newStatus === 'resolved' ? '처리 완료' : '처리 대기'} 상태로 전환되었습니다.`);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete report
  const handleDeleteReport = async (reportId: string) => {
    if (!confirm('정말 이 신고 내역을 완전히 영구 삭제하시겠습니까?')) return;
    const path = `reports/${reportId}`;

    try {
      await deleteDoc(doc(db, 'reports', reportId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      alert('신고 기록이 영구 폐기되었습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Publish dynamic notices
  const handlePublishNotice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNoticeTitle.trim() || !newNoticeContent.trim()) return;

    setNoticeSubmitting(true);
    const nId = `notice_${Date.now()}`;
    const path = `notices/${nId}`;

    try {
      const noticePayload: Notice = {
        noticeId: nId,
        title: newNoticeTitle.trim(),
        content: newNoticeContent.trim(),
        createdAt: new Date().toISOString(),
        isActive: true
      };

      await setDoc(doc(db, 'notices', nId), noticePayload).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      alert('안내 공지사항이 성공적으로 배포되었습니다!');
      setNewNoticeTitle('');
      setNewNoticeContent('');
    } catch (err) {
      console.error(err);
    } finally {
      setNoticeSubmitting(false);
    }
  };

  // Delete Notice
  const handleDeleteNotice = async (noticeId: string) => {
    if (!confirm('공지를 영구 삭제하시겠습니까?')) return;
    const path = `notices/${noticeId}`;
    try {
      await deleteDoc(doc(db, 'notices', noticeId)).catch((err) => {
        handleFirestoreError(err, OperationType.DELETE, path);
        throw err;
      });
      alert('공지사항이 영구 삭제되었습니다.');
    } catch (err) {
      console.error(err);
    }
  };

  // Add Blocked Slang Word
  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const word = newBannedWord.trim();
    if (!word) return;

    if (bannedWords.includes(word)) {
      alert('이미 추가된 금칙어입니다.');
      return;
    }

    setKeywordSubmitting(true);
    const path = 'adminSettings/badWords';
    const updatedWords = [...bannedWords, word];

    try {
      await setDoc(doc(db, 'adminSettings', 'badWords'), {
        words: updatedWords
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });

      setNewBannedWord('');
      alert(`금칙어 '${word}'가 차단 필터에 즉시 등록되었습니다.`);
    } catch (err) {
      console.error(err);
    } finally {
      setKeywordSubmitting(false);
    }
  };

  // Remove Banned Word
  const handleRemoveKeyword = async (wordToRemove: string) => {
    if (!confirm(`'${wordToRemove}' 금칙어를 차단 필터에서 해제하시겠습니까?`)) return;
    
    setKeywordSubmitting(true);
    const path = 'adminSettings/badWords';
    const updatedWords = bannedWords.filter(word => word !== wordToRemove);

    try {
      await setDoc(doc(db, 'adminSettings', 'badWords'), {
        words: updatedWords
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, path);
        throw err;
      });
      alert('금칙어가 해제되었습니다.');
    } catch (err) {
      console.error(err);
    } finally {
      setKeywordSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col font-sans pb-10">
      {/* Header */}
      <div className="bg-stone-950 border-b border-stone-800 p-4 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-stone-800 rounded-xl transition-all text-amber-400"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-sm font-extrabold tracking-wider text-amber-400">이어톡 어드민 총제실</h2>
            <p className="text-[10px] text-stone-400">마이크로 커뮤니티 감찰 및 운영 정책 통제</p>
          </div>
        </div>

        <span className="text-[10px] bg-amber-400 text-stone-950 font-bold px-3 py-1 rounded-full shadow-sm">
          ADMIN CONFIRMED
        </span>
      </div>

      {/* Admin Nav Subtabs */}
      <div className="flex bg-stone-950/60 border-b border-stone-800/80 sticky top-14 z-10 overflow-x-auto">
        <button
          onClick={() => setActiveSection('users')}
          className={`flex-1 min-w-[80px] py-3 text-center text-xs font-bold transition-all relative ${activeSection === 'users' ? 'text-amber-400' : 'text-stone-400'}`}
        >
          <Users className="w-4 h-4 mx-auto mb-1" />
          유저 관리 (검색)
          {activeSection === 'users' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400"></span>}
        </button>

        <button
          onClick={() => setActiveSection('reports')}
          className={`flex-1 min-w-[80px] py-3 text-center text-xs font-bold transition-all relative ${activeSection === 'reports' ? 'text-amber-400' : 'text-stone-400'}`}
        >
          <AlertTriangle className="w-4 h-4 mx-auto mb-1" />
          신고 내역 ({reports.length})
          {activeSection === 'reports' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400"></span>}
        </button>

        <button
          onClick={() => setActiveSection('notices')}
          className={`flex-1 min-w-[80px] py-3 text-center text-xs font-bold transition-all relative ${activeSection === 'notices' ? 'text-amber-400' : 'text-stone-400'}`}
        >
          <Bell className="w-4 h-4 mx-auto mb-1" />
          공지 배포 ({notices.length})
          {activeSection === 'notices' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400"></span>}
        </button>

        <button
          onClick={() => setActiveSection('keywords')}
          className={`flex-1 min-w-[80px] py-3 text-center text-xs font-bold transition-all relative ${activeSection === 'keywords' ? 'text-amber-400' : 'text-stone-400'}`}
        >
          <Settings className="w-4 h-4 mx-auto mb-1" />
          금칙어 관리 ({bannedWords.length})
          {activeSection === 'keywords' && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400"></span>}
        </button>
      </div>

      <div className="flex-1 p-4 max-w-md mx-auto w-full">
        {/* SECTION 1: USERS LIST */}
        {activeSection === 'users' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 tracking-wider">안전 소통 회원 개별 조회</h3>
            
            <form onSubmit={handleAdminSearch} className="flex gap-2">
              <input
                type="text"
                value={adminSearchUID}
                onChange={(e) => setAdminSearchUID(e.target.value)}
                placeholder="대상 회원의 고유 UID(user.uid) 입력"
                className="flex-1 bg-stone-800 border-2 border-stone-750 rounded-xl px-3 py-2 text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-400"
              />
              <button
                type="submit"
                className="bg-amber-400 hover:bg-amber-500 text-stone-900 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0"
              >
                검색
              </button>
            </form>

            {adminSearchError && (
              <p className="text-[11px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">
                {adminSearchError}
              </p>
            )}

            {searchedUser ? (
              <div className="bg-stone-850 rounded-2xl p-4 border border-stone-800 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  <img 
                    src={searchedUser.profileImage || `https://api.dicebear.com/7.x/adventurer/svg?seed=${searchedUser.userId}`} 
                    alt="Prof" 
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full object-cover border border-stone-700" 
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-stone-200">{searchedUser.nickname}</span>
                      <span className="text-[9px] bg-stone-700 text-stone-300 font-mono px-1 rounded-sm">{searchedUser.eeortalkId}</span>
                    </div>
                    <span className="text-[10px] text-stone-400 block mt-0.5">{searchedUser.email}</span>
                  </div>
                </div>

                <div>
                  {searchedUser.role === UserRole.ADMIN ? (
                    <span className="text-[10px] text-amber-400 bg-amber-400/10 px-2 py-1 rounded font-bold border border-amber-400/20">
                      총 관리군
                    </span>
                  ) : searchedUser.banned ? (
                    <button
                      type="button"
                      onClick={() => handleToggleBan(searchedUser)}
                      className="bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-extrabold px-3 py-1.5 rounded-xl transition-all my-auto shadow animate-pulse"
                    >
                      제재해제
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleToggleBan(searchedUser)}
                      className="bg-amber-400 hover:bg-amber-500 text-stone-900 text-[10px] font-extrabold px-3 py-1.5 rounded-xl transition-all my-auto shadow"
                    >
                      정지처분
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-stone-800 rounded-2xl p-6 text-center text-stone-500 text-xs">
                회원을 정지 또는 해제하려면 대상 회원의 고유 UID를 입력하고 검색을 완료하세요.
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: REPORTS HISTORY */}
        {activeSection === 'reports' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 tracking-wider">이웃 회원 고발 접수함</h3>
            {reports.length === 0 ? (
              <p className="text-center text-xs text-stone-500 py-10">접수된 안전 고발 기록이 깨끗합니다. ✨</p>
            ) : (
              reports.map(rep => (
                <div key={rep.reportId} className="bg-stone-850 p-4 rounded-2xl border border-stone-800 space-y-3">
                  <div className="flex justify-between items-start">
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${rep.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'}`}>
                      {rep.status === 'resolved' ? '처리 완료' : '조사 요구'}
                    </span>

                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleResolveReport(rep)}
                        className="p-1 hover:bg-stone-850 text-stone-400 hover:text-stone-200 transition-colors rounded"
                        title="처리 보류/완료 전환"
                      >
                        <ShieldCheck className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteReport(rep.reportId)}
                        className="p-1 hover:bg-stone-850 text-stone-400 hover:text-rose-500 transition-colors rounded"
                        title="신고 기록 파기"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <p className="text-stone-400">
                      신고자: <strong>{rep.reporterEmail}</strong>
                    </p>
                    <p className="text-stone-400">
                      고발대상: <strong className="text-rose-400">{rep.targetNickname}</strong> (UID: {rep.targetUserId.slice(0, 8)}...)
                    </p>
                    <p className="text-stone-400">
                      귀책사유: <strong className="text-amber-400 font-bold">{rep.reason}</strong>
                    </p>
                  </div>

                  <div className="bg-stone-900 p-3 rounded-xl border border-stone-800 text-[11px] text-stone-300 leading-relaxed font-mono">
                    "{rep.detail}"
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* SECTION 3: PUBLISH NOTICE */}
        {activeSection === 'notices' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 tracking-wider">새 공지 배포(공식 안내)</h3>
            <form onSubmit={handlePublishNotice} className="bg-stone-850 p-4 rounded-2xl border border-stone-800 space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-400 mb-1 block">공지 제목</label>
                <input 
                  type="text" 
                  value={newNoticeTitle}
                  onChange={(e) => setNewNoticeTitle(e.target.value)}
                  placeholder="예: 제2회 청주 청년 이어드림 발대식 신청 안내"
                  required
                  className="w-full bg-stone-900 border border-stone-750/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 text-stone-100"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-400 mb-1 block">공지 상세 본문</label>
                <textarea
                  rows={5}
                  value={newNoticeContent}
                  onChange={(e) => setNewNoticeContent(e.target.value)}
                  placeholder="공지 세부 일정 및 대상, 유의 사항을 기입하세요."
                  required
                  className="w-full bg-stone-900 border border-stone-750/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 text-stone-100 placeholder:text-stone-600 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={noticeSubmitting}
                className="w-full bg-amber-400 hover:bg-amber-500 disabled:bg-amber-300 text-stone-950 font-bold py-3 rounded-2xl text-xs transition-colors flex items-center justify-center gap-1 shadow-md shadow-amber-900/10"
              >
                <Send className="w-3.5 h-3.5" /> 대공식 공지 소식 배포
              </button>
            </form>

            {/* List current notices */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold text-stone-400">게시 중인 공지 목록 ({notices.length})</h4>
              {notices.map(not => (
                <div key={not.noticeId} className="bg-stone-800 p-4 rounded-2xl border border-stone-850 flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-xs text-stone-200 line-clamp-1">{not.title}</h5>
                    <span className="text-[9px] text-stone-500 block font-mono mt-0.5">{not.createdAt}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteNotice(not.noticeId)}
                    className="p-1.5 bg-stone-850 hover:bg-rose-950 text-stone-400 hover:text-rose-400 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 4: BANNED WORDS FILTER */}
        {activeSection === 'keywords' && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-stone-400 tracking-wider">욕설/광고 금칙어 실시간 통제</h3>
            
            <form onSubmit={handleAddKeyword} className="bg-stone-850 p-4 rounded-2xl border border-stone-800 space-y-3">
              <p className="text-[10px] text-stone-400 leading-relaxed">
                채팅망에 비하, 욕설, 유독성 상업성 광고 배포 등을 실시간으로 교정하기 위한 지정어 리스트입니다. 일치되는 핵심 단어는 메세지 송출 시 자동으로 별표(***) 처리됩니다.
              </p>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={newBannedWord}
                  onChange={(e) => setNewBannedWord(e.target.value)}
                  placeholder="예: 비하 단어 입력"
                  className="flex-1 bg-stone-900 border border-stone-750/80 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-amber-400 text-stone-100 placeholder:text-stone-600"
                />
                <button
                  type="submit"
                  disabled={keywordSubmitting}
                  className="bg-amber-400 hover:bg-amber-500 disabled:bg-stone-700 text-stone-900 font-bold px-4 rounded-xl text-xs transition-colors"
                >
                  추가
                </button>
              </div>
            </form>

            <div className="bg-stone-850 p-4 rounded-2xl border border-stone-850/60">
              <span className="text-[10px] font-bold text-stone-500 block mb-3">활성화된 교정 필터 목록 ({bannedWords.length}개)</span>
              <div className="flex flex-wrap gap-1.5">
                {bannedWords.map(word => (
                  <span 
                    key={word}
                    className="text-xs bg-stone-900 border border-stone-750 text-stone-300 font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1 shadow-inner"
                  >
                    {word}
                    <button
                      type="button"
                      onClick={() => handleRemoveKeyword(word)}
                      className="text-stone-500 hover:text-rose-500 font-extrabold focus:outline-none"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
