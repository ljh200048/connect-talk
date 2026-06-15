export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

export interface UserProfile {
  userId: string;
  email: string;
  nickname: string;
  eeortalkId: string;
  profileImage?: string;
  statusMessage?: string;
  birthYear?: string;
  region?: string;
  school?: string;
  interests?: string[];
  role: UserRole;
  banned: boolean;
  createdAt: any; // Firestore Timestamp
}

export interface FriendRelation {
  friendUserId: string;
  nickname: string;
  profileImage?: string;
  statusMessage?: string;
  blocked?: boolean;
  createdAt: any;
}

export interface FriendRequest {
  requestId: string;
  fromUserId: string;
  fromNickname: string;
  fromProfileImage?: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

export type RoomType = 'direct' | 'meeting';

export interface ChatRoom {
  roomId: string;
  type: RoomType;
  title: string;
  members: string[]; // array of userIds
  lastMessage?: string;
  lastMessageAt?: any;
  createdAt: any;
  createdBy: string;
  description?: string;
  region?: string; // Optional tag matching
}

export interface Message {
  messageId: string;
  senderId: string;
  senderName: string;
  senderProfile?: string;
  text?: string;
  imageUrl?: string;
  readBy: string[]; // List of userIds who read
  createdAt: any;
}

export interface Report {
  reportId: string;
  reporterId: string;
  reporterEmail: string;
  targetUserId: string;
  targetNickname: string;
  reason: string;
  detail: string;
  status: 'pending' | 'resolved';
  createdAt: any;
}

export interface Notice {
  noticeId: string;
  title: string;
  content: string;
  createdAt: any;
  isActive: boolean;
}

export type TabType = 'friends' | 'chats' | 'meetings' | 'notices' | 'mypage';

// Cheongju static options to display
export const REGIONS = [
  '성안길(시내)',
  '율량동',
  '오창읍',
  '복대동(지웰)',
  '가경동(터미널)',
  '금천동',
  '동남지구',
  '개신동',
  '사창동'
];

export const SCHOOLS = [
  '충북대학교',
  '청주대학교',
  '서원대학교',
  '국립한국교원대학교',
  '청주교육대학교',
  '충청대학교',
  '기타 (직장인/일반)'
];

export const INTERESTS = [
  '☕ 카페 투어',
  '🍕 맛집 탐방',
  '⚽ 축구/풋살',
  '🏋️ 헬스/운동',
  '📸 사진/영상',
  '📚 스터디/취업',
  '🎸 악기/음악',
  '🐕 반려동물',
  '🍿 영화/넷플',
  '⛰️ 등산/캠핑',
  '🎨 전시/미술',
  '🛍️ 쇼핑/패션'
];
