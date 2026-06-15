import React, { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc, setDoc } from 'firebase/firestore';
import { Notice } from '../types';
import { Bell, ChevronDown, ChevronUp, Star, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function NoticesView() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth.currentUser) return;
    const path = 'notices';
    // Active notices sorted by date desc
    const q = query(
      collection(db, path),
      where('isActive', '==', true)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Notice[] = [];
      snapshot.forEach(d => {
        list.push(d.data() as Notice);
      });
      // Sort in memory by datetime desc
      list.sort((a,b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setNotices(list);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, path);
    });

    return () => unsubscribe();
  }, []);

  const toggleNotice = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full bg-brand-bg pb-24">
      {/* Search/Filter Banner */}
      <div className="bg-brand-bg border-b-2 border-brand-border px-4 pt-4 pb-3 sticky top-0 z-20 shadow-[0_2px_8px_rgba(0,45,-32,0.02)]">
        <h2 className="text-xl font-black text-brand-green tracking-tight flex items-center gap-1.5">
          안내 & <span className="text-brand-orange">소식</span>
        </h2>
        <p className="text-[10px] text-stone-500 mt-0.5 font-bold">청주시 및 이어톡 서비스 공식 공지사항입니다.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-3 border-brand-green border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            <p className="text-xs text-stone-500 font-bold">공지사항 연동하는 중...</p>
          </div>
        ) : notices.length === 0 ? (
          <div className="bg-brand-sand border-2 border-brand-border rounded-[28px] p-12 text-center text-stone-500 text-sm">
            <Bell className="w-10 h-10 text-brand-orange mx-auto mb-2" />
            <p className="font-extrabold text-brand-green text-sm">현재 등록된 새 공지소식이 없습니다.</p>
            <p className="text-xs text-stone-600 font-medium mt-1">이웃 청년들과 자유롭게 매칭 및 모임을 가져보세요!</p>
          </div>
        ) : (
          notices.map((notice, idx) => {
            const isExpanded = expandedId === notice.noticeId;
            return (
              <div 
                key={notice.noticeId}
                className={`bg-brand-sand border rounded-2xl shadow-xs transition-all duration-200 overflow-hidden ${isExpanded ? 'border-brand-orange border-2 shadow-sm' : 'border-brand-border hover:border-brand-orange/40'}`}
              >
                {/* Accordion Trigger */}
                <div 
                  onClick={() => toggleNotice(notice.noticeId)}
                  className="p-4 cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl flex-shrink-0 border ${idx === 0 ? 'bg-brand-yellow text-brand-green border-brand-border' : 'bg-brand-bg text-stone-500 border-brand-border/40'}`}>
                      <Bell className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-brand-green text-xs sm:text-sm line-clamp-1">
                        {notice.title}
                      </h4>
                      <p className="text-[10px] text-stone-500 flex items-center gap-1 mt-0.5 font-mono font-bold">
                        <Calendar className="w-3 h-3 text-brand-orange" />
                        {new Date(notice.createdAt).toLocaleDateString([], {year: 'numeric', month: 'long', day: 'numeric'})}
                      </p>
                    </div>
                  </div>

                  <div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-green" /> : <ChevronDown className="w-4 h-4 text-brand-green" />}
                  </div>
                </div>

                {/* Content Accordion */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="border-t border-brand-border/60 bg-brand-bg"
                    >
                      <div className="p-4 text-xs leading-relaxed text-brand-dark font-medium whitespace-pre-wrap select-text">
                        {notice.content}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
